import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import * as admin from "firebase-admin";
import { Storage } from "@google-cloud/storage";
import * as crypto from 'crypto'; 

// Shared types import
import { UserProfile, LogEntry, LogActionType, ResidenciaId } from "../../shared/models/types";

// Initialize Firebase Admin
admin.initializeApp();

// Top-level variable definition
const db = admin.firestore();
const storage = new Storage();
const licenseBucketName = "lmgmt";
const licenseFilesPath = "licenses/";

// --- Interfaces for User Management Payloads ---
interface CreateUserDataPayload {
    email: string;
    password?: string; // Optional for cases like inviting an existing auth user to a profile
    profileData: Omit<UserProfile, "id" | "fechaCreacion" | "ultimaActualizacion" | "lastLogin" | "email"> & { email?: string };
    // performedByUid is not needed here, will use context.auth.uid
}

interface UpdateUserDataPayload {
    userIdToUpdate: string;
    profileData: Partial<Omit<UserProfile, "id" | "email" | "fechaCreacion" | "ultimaActualizacion" | "lastLogin">>;
    // performedByUid is not needed here
}

interface DeleteUserDataPayload {
    userIdToDelete: string;
    // performedByUid is not needed here
}

// --- Interface for data being written to the logs collection ---
interface LogEntryWrite extends Omit<LogEntry, "id" | "timestamp"> {
    timestamp: admin.firestore.FieldValue; // Keep this as admin.firestore.FieldValue
    // 'userId' from LogEntry will store the UID of the admin/user performing the action
}

// --- Interfaces for Security return object ---
interface CallerSecurityInfo {
    uid: string;
    profile?: UserProfile;
    claims?: Record<string, any>; // Changed from admin.auth.DecodedIdToken
    isMaster: boolean;
    isAdmin: boolean;
}

// --- Interfaces for License Management ---
interface LicenseData {
    ResidenciaId: ResidenciaId;
    licenciaValidaHasta: string; // ISO 8601 date string (e.g., "2024-12-31T23:59:59Z")
    licenciaActiva: boolean;
    cantidadUsuarios: number;
    tokenLicencia: string;
}

interface LicenseDetailsResult extends LicenseData {
    status: "valid" | "not_found" | "not_active" | "expired" | "error_reading_file";
    message: string;
}

// Modified version
interface GenerateLicenseParams {
    ResidenciaId: string; // Or your ResidenciaId type
    licenciaValidaHasta: string; // ISO 8601 date string in "YYYY-MM-DDTHH:MM±HH:MM" or "YYYY-MM-DDTHH:MM:SSZ"
    licenciaActiva: boolean;
    cantidadUsuarios: number;
}

// --- Log Action Function ---
const logAction = async (
    actionType: LogActionType, // Use the string literals from your enum-like type
    performedByUid: string,
    targetUid: string | null = null,
    details: Record<string, any> = {},
): Promise<void> => {
    try {
        const logEntryData: LogEntryWrite = {
            actionType,
            userId: performedByUid, // 'userId' in LogEntry refers to the actor
            timestamp: (db.constructor as any).FieldValue.serverTimestamp() as any, // Switched to db.constructor path
            targetUid,
            details,
            // residenciaId: details.residenciaId || null, // If you want to log this
        };
        await db.collection("logs").add(logEntryData);
        logger.info(`Action logged: ${actionType} by ${performedByUid}` + (targetUid ? ` on ${targetUid}` : ""), details);
    } catch (error) {
        logger.error("Error logging action:", error);
    }
};

async function getCallerSecurityInfo(authContext?: CallableRequest['auth']): Promise<CallerSecurityInfo> {
    if (!authContext || !authContext.uid) {
        throw new HttpsError("unauthenticated", "Authentication required.");
    }
    const uid = authContext.uid;
    try {
        const [userRecord, profileDoc] = await Promise.all([
            admin.auth().getUser(uid),
            db.collection("users").doc(uid).get()
        ]);

        const claims = userRecord.customClaims || {};
        const profile = profileDoc.exists ? profileDoc.data() as UserProfile : undefined;

        return {
            uid,
            profile,
            claims,
            isMaster: claims.roles?.includes("master") || false,
            isAdmin: claims.roles?.includes("admin") || false,
        };
    } catch (error) {
        logger.error("Error fetching caller security info for UID:", uid, error);
        throw new HttpsError("internal", "Could not verify caller permissions.");
    }
}

// --- Helper Functions for License Management ---

/**
 * Generates a JSON license file and stores it in Cloud Storage.
 * Replaces the file if it already exists.
 *
 * @param params - The license data.
 * @returns Promise<void>
 */
export async function generateLicenseFile(params: GenerateLicenseParams): Promise<void> {
    // Destructure params - tokenLicencia is no longer expected here
    const { ResidenciaId, licenciaValidaHasta, licenciaActiva, cantidadUsuarios } = params;

    // --- Input Validation ---
    if (!ResidenciaId || typeof ResidenciaId !== 'string' || ResidenciaId.trim() === "") {
        logger.error("generateLicenseFile: ResidenciaId is required and must be a non-empty string.");
        throw new HttpsError("invalid-argument", "ResidenciaId is required.");
    }
    if (!licenciaValidaHasta || typeof licenciaValidaHasta !== 'string' || licenciaValidaHasta.trim() === "") {
        logger.error("generateLicenseFile: licenciaValidaHasta is required and must be a non-empty string.");
        throw new HttpsError("invalid-argument", "licenciaValidaHasta (ISO 8601 date string) is required.");
    }
    // Basic check for cantidadUsuarios (already type number by interface, but good practice for runtime)
    if (typeof cantidadUsuarios !== 'number' || isNaN(cantidadUsuarios) || cantidadUsuarios < 0) {
        logger.error(`generateLicenseFile: cantidadUsuarios must be a non-negative number. Received: ${cantidadUsuarios}`);
        throw new HttpsError("invalid-argument", "cantidadUsuarios must be a non-negative number.");
    }
    if (typeof licenciaActiva !== 'boolean') {
        logger.error(`generateLicenseFile: licenciaActiva must be a boolean. Received: ${licenciaActiva}`);
        throw new HttpsError("invalid-argument", "licenciaActiva must be a boolean.");
    }

    // --- Generate Token Internally ---
    // Assuming ResidenciaId type is compatible with generarTokenLicencia's first parameter
    const internallyGeneratedToken = generarTokenLicencia(ResidenciaId as ResidenciaId, licenciaValidaHasta);

    const licenseData: LicenseData = {
        ResidenciaId,
        licenciaValidaHasta,
        licenciaActiva,
        cantidadUsuarios,
        tokenLicencia: internallyGeneratedToken, // Use the internally generated token
    };

    const fullPathToFile = `${licenseFilesPath}${ResidenciaId}.json`;
    const file = storage.bucket(licenseBucketName).file(fullPathToFile);

    try {
        await file.save(JSON.stringify(licenseData, null, 2), {
            contentType: "application/json",
        });
        logger.info(`License file ${fullPathToFile} generated and saved to ${licenseBucketName}. Token: ${internallyGeneratedToken}`);
    } catch (error) {
        logger.error(`Error saving license file ${fullPathToFile}:`, error);
        // Keep HttpsError if this function is directly or indirectly called by an HTTPS trigger
        // Otherwise, a standard Error might be more appropriate if it's purely server-side internal.
        throw new HttpsError("internal", `Could not save license file for ResidenciaId ${ResidenciaId}.`, (error as Error).message);
    }
}

/**
 * Retrieves license details from a JSON file in Cloud Storage.
 *
 * @param ResidenciaId - The ID of the Residencia.
 * @returns Promise<LicenseDetailsResult>
 */
export async function getLicenseDetails(ResidenciaId: string): Promise<LicenseDetailsResult> {
    const fullPathToFile = `${licenseFilesPath}${ResidenciaId}.json`; // New way with path
    const file = storage.bucket(licenseBucketName).file(fullPathToFile);

    try {
        const [exists] = await file.exists();
        if (!exists) {
            logger.warn(`License file ${fullPathToFile} not found in ${licenseBucketName}.`);
            return {
                ResidenciaId,
                licenciaValidaHasta: "",
                licenciaActiva: false,
                cantidadUsuarios: 0,
                tokenLicencia: "",
                status: "not_found",
                message: "License file is not found.",
            };
        }

        const [fileContents] = await file.download();
        const licenseData = JSON.parse(fileContents.toString()) as LicenseData;

        if (!licenseData.licenciaActiva) {
            logger.info(`License for ${ResidenciaId} is not active.`);
            return {
                ...licenseData,
                status: "not_active",
                message: "License not active.",
            };
        }

        const expirationDate = new Date(licenseData.licenciaValidaHasta);
        if (expirationDate < new Date()) {
            logger.info(`License for ${ResidenciaId} has expired on ${licenseData.licenciaValidaHasta}.`);
            return {
                ...licenseData,
                status: "expired",
                message: "License expired.",
            };
        }

        logger.info(`License details for ${ResidenciaId} retrieved successfully.`);
        return {
            ...licenseData,
            status: "valid",
            message: "License is valid.",
        };
    } catch (error) {
        logger.error(`Error reading license file ${fullPathToFile} for ${ResidenciaId}:`, error);
        // Return a generic error structure that still conforms to LicenseDetailsResult
        return {
            ResidenciaId,
            licenciaValidaHasta: "",
            licenciaActiva: false,
            cantidadUsuarios: 0,
            tokenLicencia: "",
            status: "error_reading_file",
            message: "Error reading license file.",
        };
    }
}

/**
 * Generates a unique license token (HMAC-SHA256 hash) for a given residencia and license validity date.
 * This function is intended for server-side use only.
 *
 * @param residenciaId The ID of the Residencia.
 * @param licenciaValidaHasta The date (ISO 8601 string) until which the license is valid.
 *                            e.g., "YYYY-MM-DDTHH:MM:SSZ" or "YYYY-MM-DDTHH:MM±HH:MM"
 * @returns A unique license token (HMAC-SHA256 hash as a hex string).
 */
export function generarTokenLicencia(
    residenciaId: ResidenciaId, // Or ResidenciaId if you have that type defined and imported
    licenciaValidaHasta: string
): string {
    if (!residenciaId || !licenciaValidaHasta) {
        throw new Error("Residencia ID and license validity date are required.");
    }

    // Basic validation for licenciaValidaHasta format (can be enhanced)
    // This regex is a simplified check and might not cover all ISO 8601 subtleties.
    const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|([+-]\d{2}:\d{2}))$/;
    if (!iso8601Regex.test(licenciaValidaHasta)) {
        // Consider logging this error as well
        throw new Error(`Invalid ISO 8601 date format for licenciaValidaHasta: ${licenciaValidaHasta}`);
        // Depending on strictness, you might throw an error or allow it if your parsing downstream is robust.
        // For now, we'll proceed, but stricter validation is recommended for production.
    }

    const dataToHash = `${residenciaId}-${licenciaValidaHasta}`;

    // In a production environment, fetch the secret key from Secret Manager
    // const secretKey = process.env.LICENSE_HMAC_SECRET || HMAC_SECRET_KEY_DEV;
    // For now, using the hardcoded development key:
    const secretKey = HMAC_SECRET_KEY_DEV;

    const hmac = crypto.createHmac('sha256', secretKey);
    hmac.update(dataToHash);
    const token = hmac.digest('hex');

    return token;
}

// --- End of Helper Functions for License Management ---

// --- VERY INSECURE - FOR LOCAL DEVELOPMENT ONLY ---
const HMAC_SECRET_KEY_DEV = "F#gQb-qXIW{;nWo_$H7rBbl5JnU,=tdefc(wqk@0g56s[gDhAI";
// --- DELETE THIS FUNCTION BEFORE PRODUCTION ---
export const createHardcodedMasterUser = onCall(
    {
        region: "us-central1",
        cors: ["http://localhost:3001", "http://127.0.0.1:3001"] // Explicitly allow client origin
    },
    async (request: CallableRequest<any>) => { // No input data needed
        logger.warn("********************************************************************");
        logger.warn("WARNING: Executing createHardcodedMasterUser.");
        logger.warn("This function is highly insecure and for local development ONLY.");
        logger.warn("IT MUST BE DELETED BEFORE DEPLOYING TO PRODUCTION.");
        logger.warn("********************************************************************");

        const hardcodedEmail = "drcaceres@gmail.com";
        const hardcodedPassword = "123456"; // CHANGE THIS IF YOU CARE EVEN A LITTLE
        const hardcodedProfileData = {
            nombre: "Master",
            apellido: "User (Hardcoded)",
        };

        // Optional: Check if this hardcoded user already exists to prevent multiple creations
        try {
            await admin.auth().getUserByEmail(hardcodedEmail);
            logger.info(`User ${hardcodedEmail} already exists. Skipping creation.`);
            const userDoc = await db.collection("users").where("email", "==", hardcodedEmail).limit(1).get();
            if (!userDoc.empty) {
                logger.info(`Firestore document for ${hardcodedEmail} also exists.`);
                 return { success: true, userId: userDoc.docs[0].id, message: "Hardcoded master user already exists." };
            }
            logger.warn(`Auth user ${hardcodedEmail} exists, but Firestore profile might be missing or different.`);
             throw new HttpsError("already-exists", `User ${hardcodedEmail} already exists in Auth. Clean up manually or change hardcoded details.`);
        } catch (error: any) {
            if (error.code === "auth/user-not-found") {
                logger.info(`User ${hardcodedEmail} not found, proceeding with creation.`);
            } else if (error.code === "already-exists") {
                 throw error;
            } else {
                logger.error("Error checking for existing hardcoded user:", error);
                throw new HttpsError("internal", "Error checking for existing user: " + error.message);
            }
        }

        let newUserRecord: admin.auth.UserRecord;
        try {
            newUserRecord = await admin.auth().createUser({
                email: hardcodedEmail,
                emailVerified: true,
                password: hardcodedPassword,
                displayName: `${hardcodedProfileData.nombre} ${hardcodedProfileData.apellido}`.trim(),
                disabled: false,
            });
            logger.info("Successfully created hardcoded master user in Firebase Auth:", newUserRecord.uid);
        } catch (error: any) {
            logger.error("Error creating hardcoded master user in Firebase Auth:", error);
            throw new HttpsError("internal", `Hardcoded master user Auth creation failed: ${error.message}`);
        }

        const newUserId = newUserRecord.uid;

        try {
            const claimsToSet = { roles: ["master"], isActive: true };
            await admin.auth().setCustomUserClaims(newUserId, claimsToSet);
            logger.info("Custom claims ('master') set for hardcoded user:", newUserId);
        } catch (error: any) {
            logger.error("Error setting custom claims for hardcoded master user:", newUserId, error);
            await admin.auth().deleteUser(newUserId).catch(delErr => logger.error("Failed to cleanup hardcoded auth user after claims error", delErr));
            throw new HttpsError("internal", `Setting hardcoded master custom claims failed: ${error.message}`);
        }

        // Construct the full UserProfile document, ensuring all required fields are present
        const userProfileDoc: UserProfile = {
            id: newUserId, // UID from Auth
            ...hardcodedProfileData,
            nombreCorto: "DCV",
            email: hardcodedEmail,
            fotoPerfil: "",
            fechaCreacion: (db.constructor as any).FieldValue.serverTimestamp() as any,
            ultimaActualizacion: (db.constructor as any).FieldValue.serverTimestamp() as any,
            isActive: true,
            roles: ["master"],
            puedeTraerInvitados: "si", // Added to satisfy UserProfile type
            fechaDeNacimiento: "", // Provide a default if not in hardcodedProfileData
            residenciaId: null, 
            centroCostoPorDefectoId: "",
            telefonoMovil: "",
            dietaId: "",
            numeroDeRopa: "",
            habitacion: "",
            universidad: "",
            carrera: "",
            dni: "",
            asistentePermisos: null, 
            notificacionPreferencias: null, 
            tieneAutenticacion: true,
            valorCampoPersonalizado1: "",
            valorCampoPersonalizado2: "",
            valorCampoPersonalizado3: "",
            // lastLogin is optional and typically updated upon login, so can be omitted here
        };

        try {
            await db.collection("users").doc(newUserId).set(userProfileDoc);
            logger.info("Successfully created hardcoded master UserProfile in Firestore:", newUserId);
            return { success: true, userId: newUserId, message: "Hardcoded master user created successfully. REMEMBER TO DELETE THIS FUNCTION!" };
        } catch (error: any) {
            logger.error("Error writing hardcoded master UserProfile to Firestore:", newUserId, error);
            await admin.auth().deleteUser(newUserId).catch(delErr => logger.error("Failed to cleanup hardcoded auth user after Firestore error", delErr));
            throw new HttpsError("internal", `Hardcoded master user Firestore write failed: ${error.message}`);
        }
    }
);
// --- END OF INSECURE HARDCODED FUNCTION ---

// --- Create User Function ---
export const createUser = onCall(
    { 
        region: "us-central1",
        cors: ["http://localhost:3001", "http://127.0.0.1:3001"] // Explicitly allow client origin
    },
    async (request: CallableRequest<CreateUserDataPayload>) => {
        const callerInfo = await getCallerSecurityInfo(request.auth);
        const data = request.data;

        logger.info(`createUser called by: ${callerInfo.uid}`, { data });

        if (!data.email || !data.password || !data.profileData) {
            throw new HttpsError("invalid-argument", "Email, password, and profileData are required.");
        }
        if (data.password.length < 6) {
            throw new HttpsError("invalid-argument", "Password must be at least 6 characters long.");
        }

        const { email, password, profileData } = data;
        const targetUserRoles = profileData.roles || ["user"]; // Default role if not provided
        const targetResidenciaId = profileData.residenciaId || null;

        // --- Security Checks for Creation ---
        if (targetUserRoles.includes("master") && !callerInfo.isMaster) {
            throw new HttpsError("permission-denied", "Only a 'master' user can create another 'master' user.");
        }
        if (!callerInfo.isMaster && !callerInfo.isAdmin) {
            throw new HttpsError("permission-denied", "Only 'master' or 'admin' users can create new users.");
        }
        if (callerInfo.isAdmin && !callerInfo.isMaster) {
            if (!callerInfo.profile?.residenciaId) {
                 throw new HttpsError("failed-precondition", "Admin user does not have an assigned Residencia.");
            }
            if (targetResidenciaId !== callerInfo.profile.residenciaId) {
                throw new HttpsError("permission-denied", "Admin users can only create users in their own Residencia.");
            }
        }
        // Ensure admin is not creating a master user
        if (callerInfo.isAdmin && !callerInfo.isMaster && targetUserRoles.includes("master")) {
            throw new HttpsError("permission-denied", "Admin users cannot create 'master' users.");
        }


        let newUserRecord: admin.auth.UserRecord;
        try {
            newUserRecord = await admin.auth().createUser({
                email: email,
                emailVerified: false,
                password: password,
                displayName: `${profileData.nombre || ""} ${profileData.apellido || ""}`.trim(),
                disabled: !(profileData.isActive === undefined ? true : profileData.isActive), // Auth 'disabled' is inverse of 'isActive'
            });
            logger.info("Successfully created new user in Firebase Auth:", newUserRecord.uid);
        } catch (error: any) {
            logger.error("Error creating new user in Firebase Auth:", error);
            if (error.code === "auth/email-already-exists") {
                throw new HttpsError("already-exists", "This email is already in use.");
            }
            throw new HttpsError("internal", `Auth creation failed: ${error.message}`);
        }

        const newUserId = newUserRecord.uid;

        // Set Custom Claims for the new user
        try {
            const claimsToSet: Record<string, any> = {
                roles: targetUserRoles,
                isActive: profileData.isActive === undefined ? true : profileData.isActive,
            };
            if (targetResidenciaId) {
                claimsToSet.residenciaId = targetResidenciaId;
            }
            await admin.auth().setCustomUserClaims(newUserId, claimsToSet);
            logger.info("Custom claims set for new user:", newUserId, claimsToSet);
        } catch (error: any) {
            logger.error("Error setting custom claims for new user:", newUserId, error);
            // Attempt to clean up Auth user if claims part fails
            await admin.auth().deleteUser(newUserId).catch(delErr => logger.error("Failed to cleanup auth user after claims error", delErr));
            throw new HttpsError("internal", `Setting custom claims failed: ${error.message}`);
        }

        // --- DIAGNOSTIC LOGGING START ---
        logger.info("Preparing UserProfile document. Checking Firestore objects...");
        logger.info(`admin.firestore type: ${typeof admin.firestore}`);
        logger.info(`admin.firestore.FieldValue type: ${typeof admin.firestore.FieldValue}`);
        logger.info(`db.constructor.FieldValue type: ${typeof (db.constructor as any).FieldValue}`);
        // --- DIAGNOSTIC LOGGING END ---

        // Prepare UserProfile document for Firestore
        const userProfileDoc: UserProfile = {
            ...profileData,
            id: newUserId as any, // Cast to 'any'
            email: email,
            fechaCreacion: (db.constructor as any).FieldValue.serverTimestamp() as any, 
            ultimaActualizacion: (db.constructor as any).FieldValue.serverTimestamp() as any, 
            isActive: profileData.isActive === undefined ? true : profileData.isActive,
            roles: targetUserRoles, // Ensure roles are stored in Firestore as well
            residenciaId: targetResidenciaId, 
        };

        try {
            await db.collection("users").doc(newUserId).set(userProfileDoc);
            logger.info("Successfully created UserProfile in Firestore for UID:", newUserId);

            await logAction("userProfile", callerInfo.uid, newUserId, { email, roles: targetUserRoles, residenciaId: targetResidenciaId });
            return { success: true, userId: newUserId, message: "User created successfully." };

        } catch (error: any) {
            logger.error("Error writing UserProfile to Firestore:", newUserId, error);
            // Attempt to clean up Auth user and claims if Firestore part fails
            await admin.auth().deleteUser(newUserId).catch(delErr => logger.error("Failed to cleanup auth user after Firestore error", delErr));
            throw new HttpsError("internal", `Firestore write failed: ${error.message}`);
        }
    }
);

// --- Update User Function ---
export const updateUser = onCall(
    { 
        region: "us-central1",
        cors: ["http://localhost:3001", "http://127.0.0.1:3001"] // Explicitly allow client origin
    },
    async (request: CallableRequest<UpdateUserDataPayload>) => {
        const callerInfo = await getCallerSecurityInfo(request.auth);
        const data = request.data;
        const { userIdToUpdate, profileData } = data;

        logger.info(`updateUser called by: ${callerInfo.uid} for user: ${userIdToUpdate}`, { profileData });

        if (!userIdToUpdate || !profileData) {
            throw new HttpsError("invalid-argument", "userIdToUpdate and profileData are required.");
        }
        if (Object.keys(profileData).length === 0) {
            return { success: true, message: "No changes provided." };
        }

        // Fetch target user's current profile for security checks
        const targetUserDoc = await db.collection("users").doc(userIdToUpdate).get();
        if (!targetUserDoc.exists) {
            throw new HttpsError("not-found", `User ${userIdToUpdate} not found in Firestore.`);
        }
        const targetUserProfile = targetUserDoc.data() as UserProfile;
        const targetUserAuth = await admin.auth().getUser(userIdToUpdate); // Also get auth for claims

        // --- Security Checks for Update ---
        const canUpdate = callerInfo.isMaster || // Master can update anyone
            (callerInfo.isAdmin && callerInfo.profile?.residenciaId === targetUserProfile.residenciaId) || // Admin can update users in their own Residencia
            (callerInfo.uid === userIdToUpdate); // User can update themselves

        if (!canUpdate) {
            throw new HttpsError("permission-denied", "You do not have permission to update this user.");
        }
        // Prevent non-master from making another user master or changing master's roles
        if (!callerInfo.isMaster && profileData.roles?.includes("master") && targetUserProfile.roles?.includes("master")) {
             // Allow master to change their own roles if they are the target, otherwise deny.
             if (userIdToUpdate !== callerInfo.uid || !callerInfo.isMaster) {
                throw new HttpsError("permission-denied", "Only a master user can modify a master user's roles.");
             }
        }
        if (!callerInfo.isMaster && profileData.roles?.includes("master") && !targetUserProfile.roles?.includes("master")) {
            throw new HttpsError("permission-denied", "You cannot make another user a master.");
        }
        // Prevent admin from changing residenciaId of users if they are not master
        if (callerInfo.isAdmin && !callerInfo.isMaster && profileData.residenciaId && profileData.residenciaId !== callerInfo.profile?.residenciaId) {
            throw new HttpsError("permission-denied", "Admins can only assign users to their own Residencia.");
        }


        // Prepare Auth updates
        const authUpdates: admin.auth.UpdateRequest = {};
        if (profileData.nombre || profileData.apellido) {
            //const currentNombre = targetUserProfile.nombre || "";
            //const currentApellido = targetUserProfile.apellido || "";
            authUpdates.displayName = `${profileData.nombre || targetUserProfile.nombre || ""} ${profileData.apellido || targetUserProfile.apellido || ""}`.trim();
        }
        if (profileData.isActive !== undefined) {
            authUpdates.disabled = !profileData.isActive;
        }

        // Prepare Custom Claims updates
        const claimsToSet: Record<string, any> = { ...targetUserAuth.customClaims }; // Start with existing claims
        let claimsChanged = false;
        if (profileData.roles) {
            claimsToSet.roles = profileData.roles;
            claimsChanged = true;
        }
        if (profileData.residenciaId !== undefined) { // Allow setting null or empty string
            claimsToSet.residenciaId = profileData.residenciaId;
            claimsChanged = true;
        }
        if (profileData.isActive !== undefined) { // Keep isActive in claims for consistency
            claimsToSet.isActive = profileData.isActive;
            claimsChanged = true;
        }


        try {
            if (Object.keys(authUpdates).length > 0) {
                await admin.auth().updateUser(userIdToUpdate, authUpdates);
                logger.info("Auth user updated:", userIdToUpdate, authUpdates);
            }
            if (claimsChanged) {
                await admin.auth().setCustomUserClaims(userIdToUpdate, claimsToSet);
                logger.info("Custom claims updated:", userIdToUpdate, claimsToSet);
            }
        } catch (error: any) {
            logger.error("Error updating Auth user or claims:", userIdToUpdate, error);
            throw new HttpsError("internal", `Auth update failed: ${error.message}`);
        }

        // Prepare Firestore updates
        const firestoreUpdateData: Omit<Partial<UserProfile>, 'ultimaActualizacion'> & { ultimaActualizacion: admin.firestore.FieldValue } = {
            ...profileData, // profileData already Omit<...> and Partial<...>
            ultimaActualizacion: (db.constructor as any).FieldValue.serverTimestamp() as any, // Switched to db.constructor path
        };

        try {
            await db.collection("users").doc(userIdToUpdate).update(firestoreUpdateData);
            logger.info("UserProfile updated in Firestore:", userIdToUpdate);

            await logAction("userProfile", callerInfo.uid, userIdToUpdate, { updatedFields: Object.keys(profileData) });
            return { success: true, message: "User updated successfully." };
        } catch (error: any) {
            logger.error("Error updating UserProfile in Firestore:", userIdToUpdate, error);
            throw new HttpsError("internal", `Firestore update failed: ${error.message}`);
        }
    }
);

// --- Delete User Function ---
export const deleteUser = onCall(
    { 
        region: "us-central1",
        cors: ["http://localhost:3001", "http://127.0.0.1:3001"] // Explicitly allow client origin
    },
    async (request: CallableRequest<DeleteUserDataPayload>) => {
        const callerInfo = await getCallerSecurityInfo(request.auth);
        const data = request.data;
        const { userIdToDelete } = data;

        logger.info(`deleteUser called by: ${callerInfo.uid} for user: ${userIdToDelete}`);

        if (!userIdToDelete) {
            throw new HttpsError("invalid-argument", "userIdToDelete is required.");
        }

        if (callerInfo.uid === userIdToDelete) {
            throw new HttpsError("permission-denied", "Users cannot delete themselves through this function.");
        }

        // Fetch target user's profile for security checks
        const targetUserDoc = await db.collection("users").doc(userIdToDelete).get();
        if (!targetUserDoc.exists) {
            // If Firestore doc doesn't exist, maybe Auth user still does. Proceed to try Auth deletion.
            logger.warn(`User ${userIdToDelete} not found in Firestore, attempting Auth deletion only.`);
        }
        const targetUserProfile = targetUserDoc.data() as UserProfile | undefined;

        // --- Security Checks for Deletion ---
        const canDelete = callerInfo.isMaster || // Master can delete anyone (except themselves)
            (callerInfo.isAdmin && callerInfo.profile?.residenciaId === targetUserProfile?.residenciaId); // Admin can delete users in their own Residencia (except themselves)

        if (!canDelete) {
            throw new HttpsError("permission-denied", "You do not have permission to delete this user.");
        }
        // Prevent admin from deleting master
        if (callerInfo.isAdmin && !callerInfo.isMaster && targetUserProfile?.roles?.includes("master")) {
            throw new HttpsError("permission-denied", "Admins cannot delete 'master' users.");
        }


        try {
            await admin.auth().deleteUser(userIdToDelete);
            logger.info("Successfully deleted user from Firebase Auth:", userIdToDelete);
        } catch (error: any) {
            logger.error("Error deleting user from Firebase Auth:", userIdToDelete, error);
            if (error.code !== "auth/user-not-found") { // If user not found in auth, it's not a fatal error for the flow
                throw new HttpsError("internal", `Auth deletion failed: ${error.message}`);
            }
            logger.warn("User not found in Auth during deletion, proceeding to Firestore cleanup if possible.");
        }

        try {
            if (targetUserDoc.exists) { // Only delete if doc existed
                await db.collection("users").doc(userIdToDelete).delete();
                logger.info("Successfully deleted UserProfile from Firestore:", userIdToDelete);
            }

            await logAction("userProfile", callerInfo.uid, userIdToDelete);
            return { success: true, message: "User deleted successfully." };
        } catch (error: any) {
            logger.error("Error deleting UserProfile from Firestore:", userIdToDelete, error);
            // If Auth deletion was successful but Firestore failed, this is a partial success/failure state.
            throw new HttpsError("internal", `Firestore deletion failed: ${error.message}`);
        }
    }
);




