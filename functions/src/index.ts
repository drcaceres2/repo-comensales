import { admin, db, storage } from './lib/firebase'
import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import * as crypto from 'crypto'; 
import * as functions from "firebase-functions/v2"
import { ScheduledEvent } from "firebase-functions/v2/scheduler";

// Shared types import
import { UserProfile, LogEntry, LogActionType, ResidenciaId, Feedback, UserId } from "../../shared/models/types";
import { ContratoResidencia, ContratoResidenciaId, PedidoId, Licencia } from "../../shared/models/contratos";

import { validateLicenseCreation } from "./lib/licenseValidation"; // ADJUST THIS PATH

interface ValidateLicenseData {
  contratoId: ContratoResidenciaId;
  pedidoId: PedidoId;
}

const licenseBucketName = "lmgmt";
const licenseFilesPath = "comensales-licencia/";
// Constants
const SYSTEM_USER_ID: UserId = "SYSTEM_LICENSE_AUDIT" as UserId; // Cast if UserId is a branded type
const SYSTEM_USER_EMAIL = "system@license-audit.internal";

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
    status: "valid" | "not_found" | "not_active" | "expired" | "invalid_token" | "error_reading_file";
    message: string;
}

// Modified version
interface GenerateLicenseParams {
    ResidenciaId: ResidenciaId; // Or your ResidenciaId type
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
        functions.logger.info(`Action logged: ${actionType} by ${performedByUid}` + (targetUid ? ` on ${targetUid}` : ""), details);
    } catch (error) {
        functions.logger.error("Error logging action:", error);
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
        functions.logger.error("Error fetching caller security info for UID:", uid, error);
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
export async function generateLicenseFile(
    params: GenerateLicenseParams
): Promise<{ success: boolean; filePath?: string; error?: string }> {
    // Destructure params - tokenLicencia is no longer expected here
    const { ResidenciaId, licenciaValidaHasta, licenciaActiva, cantidadUsuarios } = params;
    // --- Input Validation ---
    if (!ResidenciaId || typeof ResidenciaId !== 'string' || ResidenciaId.trim() === "") {
        return {
            success:false,
            error: "generateLicenseFile: ResidenciaId is required and must be a non-empty string."
        }
    }
    if (!licenciaValidaHasta || typeof licenciaValidaHasta !== 'string' || licenciaValidaHasta.trim() === "") {
        return {
            success:false,
            error: "generateLicenseFile: licenciaValidaHasta is required and must be a non-empty ISO 8601 date string."
        }
    }
    // Basic check for cantidadUsuarios (already type number by interface, but good practice for runtime)
    if (typeof cantidadUsuarios !== 'number' || isNaN(cantidadUsuarios) || cantidadUsuarios < 0) {
        return {
            success:false,
            error: `generateLicenseFile: cantidadUsuarios must be a non-negative number. Received: ${cantidadUsuarios}`
        }
    }
    if (typeof licenciaActiva !== 'boolean') {
        return {
            success:false,
            error: `generateLicenseFile: licenciaActiva must be a boolean. Received: ${licenciaActiva}`
        }
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
        functions.logger.info(`License file ${fullPathToFile} generated and saved to ${licenseBucketName}. Token: ${internallyGeneratedToken}`);
        return {
            success:true,
            filePath: fullPathToFile
        }
    } catch (error) {
        functions.logger.error(`Error saving license file ${fullPathToFile}:`, error);
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
            functions.logger.warn(`License file ${fullPathToFile} not found in ${licenseBucketName}.`);
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
            functions.logger.info(`License for ${ResidenciaId} is not active.`);
            return {
                ...licenseData,
                status: "not_active",
                message: "License not active.",
            };
        }

        const expirationDate = new Date(licenseData.licenciaValidaHasta);
        if (expirationDate < new Date()) {
            functions.logger.info(`License for ${ResidenciaId} has expired on ${licenseData.licenciaValidaHasta}.`);
            return {
                ...licenseData,
                status: "expired",
                message: "License expired.",
            };
        }

        const tokenCalculado: string = generarTokenLicencia(licenseData.ResidenciaId, licenseData.licenciaValidaHasta);
        if(!tokenCalculado || (tokenCalculado !== licenseData.tokenLicencia)) {
            functions.logger.warn(`License for ${ResidenciaId} has an invalid token.`);
            return {
                ...licenseData,
                status: "invalid_token",
                message: "License expired.",
            };
        }

        functions.logger.info(`License details for ${ResidenciaId} retrieved successfully.`);
        return {
            ...licenseData,
            status: "valid",
            message: "License is valid.",
        };
    } catch (error) {
        functions.logger.error(`Error reading license file ${fullPathToFile} for ${ResidenciaId}:`, error);
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

/**
 * Lists all file names within the license files directory in Cloud Storage.
 * This function is intended for server-side use.
 *
 * @returns Promise<string[]> A promise that resolves to an array of file names (full paths within the bucket).
 *                            Returns an empty array if the directory is empty or an error occurs.
 */
export async function listAllLicenseFileNamesInStorage(): Promise<string[]> {
    try {
        // Ensure licenseFilesPath correctly represents a directory prefix (e.g., "licenses/")
        const [files] = await storage.bucket(licenseBucketName).getFiles({ prefix: licenseFilesPath });
        
        if (!files || files.length === 0) {
            functions.logger.info(`No files found in directory '${licenseFilesPath}' in bucket '${licenseBucketName}'.`);
            return []; 
        }

        // The 'name' property of each file object is its full path within the bucket.
        // We filter out entries that represent the directory itself if licenseFilesPath is a non-empty prefix
        // and the directory object itself is listed (e.g. "licenses/" if the prefix is "licenses/").
        const fileNames = files
            .map(file => file.name)
            .filter(name => name !== licenseFilesPath); // Avoid listing the directory path itself if it appears as an object
        
        functions.logger.info(`Successfully listed ${fileNames.length} file(s) from directory: '${licenseFilesPath}'`);
        return fileNames;

    } catch (error) {
        functions.logger.error(`Error listing files in directory '${licenseFilesPath}' in bucket '${licenseBucketName}':`, error);
        // For server-side functions, throwing the error can be appropriate to indicate failure.
        // Alternatively, you could return an empty array or a more structured error.
        throw new Error(`Failed to list files from storage directory '${licenseFilesPath}': ${error instanceof Error ? error.message : String(error)}`);
    }
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
        functions.logger.warn("********************************************************************");
        functions.logger.warn("WARNING: Executing createHardcodedMasterUser.");
        functions.logger.warn("This function is highly insecure and for local development ONLY.");
        functions.logger.warn("IT MUST BE DELETED BEFORE DEPLOYING TO PRODUCTION.");
        functions.logger.warn("********************************************************************");

        const hardcodedEmail = "drcaceres@gmail.com";
        const hardcodedPassword = "123456"; // CHANGE THIS IF YOU CARE EVEN A LITTLE
        const hardcodedProfileData = {
            nombre: "Master",
            apellido: "User (Hardcoded)",
        };

        // Optional: Check if this hardcoded user already exists to prevent multiple creations
        try {
            await admin.auth().getUserByEmail(hardcodedEmail);
            functions.logger.info(`User ${hardcodedEmail} already exists. Skipping creation.`);
            const userDoc = await db.collection("users").where("email", "==", hardcodedEmail).limit(1).get();
            if (!userDoc.empty) {
                functions.logger.info(`Firestore document for ${hardcodedEmail} also exists.`);
                 return { success: true, userId: userDoc.docs[0].id, message: "Hardcoded master user already exists." };
            }
            functions.logger.warn(`Auth user ${hardcodedEmail} exists, but Firestore profile might be missing or different.`);
             throw new HttpsError("already-exists", `User ${hardcodedEmail} already exists in Auth. Clean up manually or change hardcoded details.`);
        } catch (error: any) {
            if (error.code === "auth/user-not-found") {
                functions.logger.info(`User ${hardcodedEmail} not found, proceeding with creation.`);
            } else if (error.code === "already-exists") {
                 throw error;
            } else {
                functions.logger.error("Error checking for existing hardcoded user:", error);
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
            functions.logger.info("Successfully created hardcoded master user in Firebase Auth:", newUserRecord.uid);
        } catch (error: any) {
            functions.logger.error("Error creating hardcoded master user in Firebase Auth:", error);
            throw new HttpsError("internal", `Hardcoded master user Auth creation failed: ${error.message}`);
        }

        const newUserId = newUserRecord.uid;

        try {
            const claimsToSet = { roles: ["master"], isActive: true };
            await admin.auth().setCustomUserClaims(newUserId, claimsToSet);
            functions.logger.info("Custom claims ('master') set for hardcoded user:", newUserId);
        } catch (error: any) {
            functions.logger.error("Error setting custom claims for hardcoded master user:", newUserId, error);
            await admin.auth().deleteUser(newUserId).catch(delErr => functions.logger.error("Failed to cleanup hardcoded auth user after claims error", delErr));
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
            functions.logger.info("Successfully created hardcoded master UserProfile in Firestore:", newUserId);
            return { success: true, userId: newUserId, message: "Hardcoded master user created successfully. REMEMBER TO DELETE THIS FUNCTION!" };
        } catch (error: any) {
            functions.logger.error("Error writing hardcoded master UserProfile to Firestore:", newUserId, error);
            await admin.auth().deleteUser(newUserId).catch(delErr => functions.logger.error("Failed to cleanup hardcoded auth user after Firestore error", delErr));
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

        functions.logger.info(`createUser called by: ${callerInfo.uid}`, { data });

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
            functions.logger.info("Successfully created new user in Firebase Auth:", newUserRecord.uid);
        } catch (error: any) {
            functions.logger.error("Error creating new user in Firebase Auth:", error);
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
            functions.logger.info("Custom claims set for new user:", newUserId, claimsToSet);
        } catch (error: any) {
            functions.logger.error("Error setting custom claims for new user:", newUserId, error);
            // Attempt to clean up Auth user if claims part fails
            await admin.auth().deleteUser(newUserId).catch(delErr => functions.logger.error("Failed to cleanup auth user after claims error", delErr));
            throw new HttpsError("internal", `Setting custom claims failed: ${error.message}`);
        }

        // --- DIAGNOSTIC LOGGING START ---
        functions.logger.info("Preparing UserProfile document. Checking Firestore objects...");
        functions.logger.info(`admin.firestore type: ${typeof admin.firestore}`);
        functions.logger.info(`admin.firestore.FieldValue type: ${typeof admin.firestore.FieldValue}`);
        functions.logger.info(`db.constructor.FieldValue type: ${typeof (db.constructor as any).FieldValue}`);
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
            functions.logger.info("Successfully created UserProfile in Firestore for UID:", newUserId);

            await logAction("userProfile", callerInfo.uid, newUserId, { email, roles: targetUserRoles, residenciaId: targetResidenciaId });
            return { success: true, userId: newUserId, message: "User created successfully." };

        } catch (error: any) {
            functions.logger.error("Error writing UserProfile to Firestore:", newUserId, error);
            // Attempt to clean up Auth user and claims if Firestore part fails
            await admin.auth().deleteUser(newUserId).catch(delErr => functions.logger.error("Failed to cleanup auth user after Firestore error", delErr));
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

        functions.logger.info(`updateUser called by: ${callerInfo.uid} for user: ${userIdToUpdate}`, { profileData });

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
                functions.logger.info("Auth user updated:", userIdToUpdate, authUpdates);
            }
            if (claimsChanged) {
                await admin.auth().setCustomUserClaims(userIdToUpdate, claimsToSet);
                functions.logger.info("Custom claims updated:", userIdToUpdate, claimsToSet);
            }
        } catch (error: any) {
            functions.logger.error("Error updating Auth user or claims:", userIdToUpdate, error);
            throw new HttpsError("internal", `Auth update failed: ${error.message}`);
        }

        // Prepare Firestore updates
        const firestoreUpdateData: Omit<Partial<UserProfile>, 'ultimaActualizacion'> & { ultimaActualizacion: admin.firestore.FieldValue } = {
            ...profileData, // profileData already Omit<...> and Partial<...>
            ultimaActualizacion: (db.constructor as any).FieldValue.serverTimestamp() as any, // Switched to db.constructor path
        };

        try {
            await db.collection("users").doc(userIdToUpdate).update(firestoreUpdateData);
            functions.logger.info("UserProfile updated in Firestore:", userIdToUpdate);

            await logAction("userProfile", callerInfo.uid, userIdToUpdate, { updatedFields: Object.keys(profileData) });
            return { success: true, message: "User updated successfully." };
        } catch (error: any) {
            functions.logger.error("Error updating UserProfile in Firestore:", userIdToUpdate, error);
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

        functions.logger.info(`deleteUser called by: ${callerInfo.uid} for user: ${userIdToDelete}`);

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
            functions.logger.warn(`User ${userIdToDelete} not found in Firestore, attempting Auth deletion only.`);
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
            functions.logger.info("Successfully deleted user from Firebase Auth:", userIdToDelete);
        } catch (error: any) {
            functions.logger.error("Error deleting user from Firebase Auth:", userIdToDelete, error);
            if (error.code !== "auth/user-not-found") { // If user not found in auth, it's not a fatal error for the flow
                throw new HttpsError("internal", `Auth deletion failed: ${error.message}`);
            }
            functions.logger.warn("User not found in Auth during deletion, proceeding to Firestore cleanup if possible.");
        }

        try {
            if (targetUserDoc.exists) { // Only delete if doc existed
                await db.collection("users").doc(userIdToDelete).delete();
                functions.logger.info("Successfully deleted UserProfile from Firestore:", userIdToDelete);
            }

            await logAction("userProfile", callerInfo.uid, userIdToDelete);
            return { success: true, message: "User deleted successfully." };
        } catch (error: any) {
            functions.logger.error("Error deleting UserProfile from Firestore:", userIdToDelete, error);
            // If Auth deletion was successful but Firestore failed, this is a partial success/failure state.
            throw new HttpsError("internal", `Firestore deletion failed: ${error.message}`);
        }
    }
);

export const checkLicenseValidity = onCall<ValidateLicenseData>(async (request) => {
    functions.logger.info("Received license validation request for Contrato ID:", request.data.contratoId, "Pedido ID:", request.data.pedidoId);
    if (!request.auth) {
       functions.logger.error("User is not authenticated.");
       throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
    }
    functions.logger.info("User authenticated, UID:", request.auth.uid);
  
    const { contratoId, pedidoId } = request.data;
  
    if (!contratoId || !pedidoId) {
      functions.logger.error("Missing contratoId or pedidoId in request data.");
      throw new HttpsError("invalid-argument", "The function must be called with both 'contratoId' and 'pedidoId'.");
    }
  
    try {
      const result = await validateLicenseCreation(contratoId, pedidoId);
      functions.logger.info("Validation result:", result);
      return result; // Directly return the ValidationResult object
    } catch (error: any) {
      functions.logger.error("Error during license validation:", error);
      if (error instanceof HttpsError) {
        throw error; // Re-throw HttpsError as is
      }
      // For other errors, wrap them in a generic HttpsError
      throw new HttpsError("internal", "An internal error occurred during license validation.", error.message);
    }
  });

// --- Internal types for the audit function ---
interface ContractAuditInfo {
    contratoId: string;
    residenciaId: ResidenciaId;
    shouldHaveActiveLicense: boolean;
    proposedExpirationDate?: string; // ISO Date string
    proposedUserCount?: number;
    newestLicenciaId?: string;
}

interface ValidatedGCSLicense {
    residenciaId: ResidenciaId;
    gcsFilePath: string;
    licenciaValidaHasta: string; // ISO Date string
    cantidadUsuarios: number;
    // tokenLicencia: string; // Not strictly needed for comparison logic after validation
}

export const actualizacionArchivosLicencias = functions.scheduler.onSchedule(
    {
        schedule: "0 0 * * *", // Daily at 00:00
        timeZone: "America/Tegucigalpa", // UTC-6
        // You can add other scheduler options here if needed, e.g.:
        // timeoutSeconds: 540,
        // retryConfig: {
        //   retryCount: 3,
        // },
    },
    async (event: ScheduledEvent) => { // <= Changed 'context' to 'event' and typed it
        // Use 'event' instead of 'context' in your logs if you were logging the context object
        functions.logger.info("Starting daily license audit: actualizacionArchivosLicencias", { scheduleTime: event.scheduleTime, jobName: event.jobName });
        const feedbackItems: Omit<Feedback, "id">[] = [];
        const now = new Date();        

        // --- Part 1: Document Audit (Firestore) ---
        // Determine which Residencias *should* have an active license based on Firestore Licencia documents.
        const auditedContracts = new Map<ResidenciaId, ContractAuditInfo>();
        try {
            const contratosSnap = await db.collection("ContratosResidencia").get();
            functions.logger.info(`Part 1: Found ${contratosSnap.size} ContratoResidencia documents.`);

            for (const contratoDoc of contratosSnap.docs) {
                const contrato = contratoDoc.data() as ContratoResidencia;
                if (!contrato.residencia) {
                    functions.logger.warn(`Contrato ${contratoDoc.id} missing residenciaId, skipping.`);
                    continue;
                }

                // Using 'contratoLicencia' as per your shared/models/contratos.ts for Licencia interface
                const licenciasSnap = await db.collection("Licencias")
                    .where("contratoLicencia", "==", contratoDoc.id as ContratoResidenciaId) // Link to ContratoResidencia
                    .orderBy("fechaFin", "desc")
                    .get();

                let newestActiveLicenciaDoc: (Licencia & { id: string }) | null = null;

                if (!licenciasSnap.empty) {
                    for (const licDoc of licenciasSnap.docs) {
                        const licData = licDoc.data() as Licencia;
                        // IMPORTANT: Assuming 'activa' field exists in your Firestore 'Licencia' documents
                        // If 'activa' is not a field, this logic needs adjustment.
                        if ((licData as any).activa === true) { // Check for explicit true
                             // Make sure fechaFin is comparable
                            const licFechaFin = new Date(licData.fechaFin.toString()); // Assuming fechaFin is string/timestamp
                            if (licFechaFin > now) { // Only consider if not expired
                                newestActiveLicenciaDoc = { ...licData, id: licDoc.id };
                                break; // Found the newest, active, non-expired license
                            }
                        }
                    }
                }
                
                let contractAuditEntry: ContractAuditInfo = {
                    contratoId: contratoDoc.id,
                    residenciaId: contrato.residencia,
                    shouldHaveActiveLicense: false,
                };

                if (newestActiveLicenciaDoc) {
                    // Using Licencia.cantUsuarios directly as per your shared/models/contratos.ts
                    // And Licencia.fechaFin
                    contractAuditEntry = {
                        ...contractAuditEntry,
                        shouldHaveActiveLicense: true,
                        proposedExpirationDate: new Date(newestActiveLicenciaDoc.fechaFin.toString()).toISOString(),
                        proposedUserCount: newestActiveLicenciaDoc.cantUsuarios,
                        newestLicenciaId: newestActiveLicenciaDoc.id,
                    };
                }
                auditedContracts.set(contrato.residencia, contractAuditEntry);
            }
        } catch (error) {
            functions.logger.error("Part 1 Error: During Firestore document audit:", error);
            feedbackItems.push({
                userId: SYSTEM_USER_ID, userEmail: SYSTEM_USER_EMAIL, createdAt: Date.now(),
                text: `Critical error during Firestore document audit (Part 1): ${error instanceof Error ? error.message : String(error)}`,
                page: "LicenseAuditFunction_Part1", status: "nuevo",
            });
        }
        functions.logger.info(`Part 1: Audited ${auditedContracts.size} unique Residencias from Firestore contracts.`);

        // --- Part 2: Installed License List and Initial GCS Audit ---
        // Identify GCS files that don't match Firestore-audited Residencias or are malformed.
        const gcsFilesResidenciaMap = new Map<ResidenciaId, string>(); // Map ResidenciaId to GCS file path for files that *might* be valid
        const gcsFilePathsLoggedForDeletion = new Set<string>(); // Track files already logged for deletion to avoid duplicate feedback

        try {
            const installedLicenseFilePaths = await listAllLicenseFileNamesInStorage();
            functions.logger.info(`Part 2: Found ${installedLicenseFilePaths.length} .json files in GCS at ${licenseFilesPath}.`);

            for (const filePath of installedLicenseFilePaths) {
                const fileNameWithExt = filePath.substring(licenseFilesPath.length);
                const residenciaIdStr = fileNameWithExt.replace(".json", "");

                if (!residenciaIdStr) {
                    const msg = `Non-standard file name found: ${filePath}. Cannot extract ResidenciaId. Candidate for deletion.`;
                    functions.logger.warn(msg);
                    feedbackItems.push({
                        userId: SYSTEM_USER_ID, userEmail: SYSTEM_USER_EMAIL, createdAt: Date.now(), text: msg,
                        page: "LicenseAuditFunction_Part2_MalformedName", status: "nuevo",
                    });
                    gcsFilePathsLoggedForDeletion.add(filePath);
                    continue;
                }
                const residenciaId = residenciaIdStr as ResidenciaId;

                if (!auditedContracts.has(residenciaId) || !auditedContracts.get(residenciaId)?.shouldHaveActiveLicense) {
                     const msg = `GCS license file ${filePath} (Residencia: ${residenciaId}) exists, but no corresponding active Contrato/Licencia found in Firestore, or contract does not require an active license. Candidate for deletion.`;
                    functions.logger.warn(msg);
                    feedbackItems.push({
                        userId: SYSTEM_USER_ID, userEmail: SYSTEM_USER_EMAIL, residenciaId, createdAt: Date.now(), text: msg,
                        page: "LicenseAuditFunction_Part2_NoContract", status: "nuevo",
                    });
                    gcsFilePathsLoggedForDeletion.add(filePath);
                } else {
                    // This file corresponds to a ResidenciaId that *should* have a license according to Firestore.
                    // It will be fully validated in Part 3.
                    gcsFilesResidenciaMap.set(residenciaId, filePath);
                }
            }
        } catch (error) {
            functions.logger.error("Part 2 Error: During GCS file listing/initial audit:", error);
            feedbackItems.push({
                userId: SYSTEM_USER_ID, userEmail: SYSTEM_USER_EMAIL, createdAt: Date.now(),
                text: `Critical error during GCS file listing (Part 2): ${error instanceof Error ? error.message : String(error)}`,
                page: "LicenseAuditFunction_Part2", status: "nuevo",
            });
        }
        functions.logger.info(`Part 2: Mapped ${gcsFilesResidenciaMap.size} GCS files to Residencias that potentially need licenses.`);

        // --- Part 3: License Details Check (for GCS files that passed Part 2) ---
        // Validate the content of GCS files identified in Part 2.
        const validGCSLicenses = new Map<ResidenciaId, ValidatedGCSLicense>();

        for (const [residenciaId, gcsFilePath] of gcsFilesResidenciaMap.entries()) {
            try {
                const details = await getLicenseDetails(residenciaId);

                if (details.status === "valid" && details.licenciaValidaHasta && details.cantidadUsuarios !== undefined && details.ResidenciaId === residenciaId) {
                    validGCSLicenses.set(residenciaId, {
                        residenciaId,
                        gcsFilePath,
                        licenciaValidaHasta: new Date(details.licenciaValidaHasta).toISOString(),
                        cantidadUsuarios: details.cantidadUsuarios,
                    });
                } else {
                    // File exists, contract expects license, but GCS content is invalid/expired/etc.
                    const msg = `GCS license file ${gcsFilePath} for Residencia ${residenciaId} has status: ${details.status}. Will attempt reinstallation if Firestore dictates.`;
                    functions.logger.warn(msg);
                    feedbackItems.push({
                        userId: SYSTEM_USER_ID, userEmail: SYSTEM_USER_EMAIL, residenciaId, createdAt: Date.now(), text: msg,
                        page: "LicenseAuditFunction_Part3_InvalidContent", status: "nuevo",
                    });
                    // This file is now considered 'invalid' for comparison in Part 4.
                    // If Part 4 determines a license is needed, it will be recreated.
                    // If Part 4 determines no license is needed, this invalid file is effectively a candidate for deletion (feedback already logged in part 2 if contract doesn't want it).
                }
            } catch (error) {
                functions.logger.error(`Part 3 Error: Processing GCS license details for ${residenciaId} (${gcsFilePath}):`, error);
                feedbackItems.push({
                    userId: SYSTEM_USER_ID, userEmail: SYSTEM_USER_EMAIL, residenciaId, createdAt: Date.now(),
                    text: `Error during GCS license detail check (Part 3) for ${gcsFilePath}: ${error instanceof Error ? error.message : String(error)}. Will attempt reinstallation if Firestore dictates.`,
                    page: "LicenseAuditFunction_Part3_Error", status: "nuevo",
                });
            }
        }
        functions.logger.info(`Part 3: Validated ${validGCSLicenses.size} GCS licenses after detailed content check.`);


        // --- Part 4: Reconciliation and Action ---
        // Compare Firestore truth (auditedContracts) with GCS state (validGCSLicenses) and act.
        const allResidenciaIdsFromAudit = new Set(auditedContracts.keys());

        for (const residenciaId of allResidenciaIdsFromAudit) {
            const contractInfo = auditedContracts.get(residenciaId)!; // Should always exist as we are iterating its keys
            const gcsLicenseInfo = validGCSLicenses.get(residenciaId); // Might be undefined if GCS file was invalid or missing

            if (contractInfo.shouldHaveActiveLicense) {
                // Firestore says this Residencia *needs* an active license.
                if (!contractInfo.proposedExpirationDate || contractInfo.proposedUserCount === undefined) {
                    const msg = `Logic error: Residencia ${residenciaId} (Contract: ${contractInfo.contratoId}) should have active license, but proposed details (date/users) are missing from Firestore audit. Cannot create/update GCS file.`;
                    functions.logger.error(msg);
                    feedbackItems.push({
                         userId: SYSTEM_USER_ID, userEmail: SYSTEM_USER_EMAIL, residenciaId, createdAt: Date.now(), text: msg,
                         page: "LicenseAuditFunction_Part4_LogicError", status: "nuevo",
                    });
                    continue; // Skip to next residenciaId
                }

                if (gcsLicenseInfo) {
                    // Contract wants license, AND a *valid* GCS license file exists. Compare them.
                    const gcsExpDateISO = new Date(gcsLicenseInfo.licenciaValidaHasta).toISOString();
                    const contractExpDateISO = new Date(contractInfo.proposedExpirationDate).toISOString();

                    if (gcsExpDateISO === contractExpDateISO && gcsLicenseInfo.cantidadUsuarios === contractInfo.proposedUserCount) {
                        functions.logger.info(`Residencia ${residenciaId}: GCS license is up-to-date with Firestore Licencia doc ${contractInfo.newestLicenciaId}.`);
                    } else {
                        // Mismatch: Reinstall from Firestore truth.
                        const msg = `Residencia ${residenciaId}: GCS license data mismatch. Reinstalling. GCS: ${gcsLicenseInfo.licenciaValidaHasta}/${gcsLicenseInfo.cantidadUsuarios}. Firestore (LicenciaDoc ${contractInfo.newestLicenciaId}): ${contractInfo.proposedExpirationDate}/${contractInfo.proposedUserCount}.`;
                        functions.logger.info(msg);
                        feedbackItems.push({
                            userId: SYSTEM_USER_ID, userEmail: SYSTEM_USER_EMAIL, residenciaId, createdAt: Date.now(), text: msg,
                            page: "LicenseAuditFunction_Part4_ReinstallMismatch", status: "nuevo",
                        });
                        // Delete old then generate new to ensure atomicity of replacement from GCS's perspective (overwrite)
                        // No need to call deleteLicenseFile explicitly if generateLicenseFile overwrites.
                        // Assuming generateLicenseFile handles overwrite. If not, uncomment deleteLicenseFile.
                        // await deleteLicenseFile(residenciaId);
                        const genResult = await generateLicenseFile(
                            {
                                ResidenciaId: residenciaId, 
                                licenciaValidaHasta: contractInfo.proposedExpirationDate, 
                                licenciaActiva: true,
                                cantidadUsuarios: contractInfo.proposedUserCount
                            }
                        );
                        if (!genResult.success) {
                            const failMsg = `Failed to reinstall GCS license for ${residenciaId} after mismatch: ${genResult.error}`;
                            functions.logger.error(failMsg);
                            feedbackItems.push({
                                userId: SYSTEM_USER_ID, userEmail: SYSTEM_USER_EMAIL, residenciaId, createdAt: Date.now(), text: failMsg,
                                page: "LicenseAuditFunction_Part4_ReinstallFail", status: "nuevo",
                            });
                        }
                    }
                } else {
                    // Contract wants license, BUT no *valid* GCS license file exists (or it was missing entirely). Create new one.
                    const msg = `Residencia ${residenciaId}: No valid GCS license found, but Firestore (LicenciaDoc ${contractInfo.newestLicenciaId}) indicates one is needed. Creating new GCS license. Expiry: ${contractInfo.proposedExpirationDate}, Users: ${contractInfo.proposedUserCount}.`;
                    functions.logger.info(msg);
                    feedbackItems.push({
                        userId: SYSTEM_USER_ID, userEmail: SYSTEM_USER_EMAIL, residenciaId, createdAt: Date.now(), text: msg,
                        page: "LicenseAuditFunction_Part4_CreateNew", status: "nuevo",
                    });
                    const genResult = await generateLicenseFile(
                        {
                            ResidenciaId: residenciaId, 
                            licenciaValidaHasta:contractInfo.proposedExpirationDate, 
                            cantidadUsuarios:contractInfo.proposedUserCount, 
                            licenciaActiva:true
                        }
                    );
                    if (!genResult.success) {
                         const failMsg = `Failed to create new GCS license for ${residenciaId}: ${genResult.error}`;
                         functions.logger.error(failMsg);
                        feedbackItems.push({
                            userId: SYSTEM_USER_ID, userEmail: SYSTEM_USER_EMAIL, residenciaId, createdAt: Date.now(), text: failMsg,
                            page: "LicenseAuditFunction_Part4_CreateNewFail", status: "nuevo",
                        });
                    }
                }
            } else {
                // Firestore says this Residencia does NOT need an active license.
                if (gcsLicenseInfo) {
                    // Contract says NO license, but a *valid* GCS license exists. This GCS file is a candidate for deletion.
                    // Note: If the GCS file was invalid/expired, it wouldn't be in `gcsLicenseInfo`.
                    // If the contract didn't exist at all for this GCS file's ResidenciaId, it was handled in Part 2.
                    // This specifically handles when contract exists, but says 'shouldHaveActiveLicense: false'.
                    const msg = `Residencia ${residenciaId}: Firestore indicates no active license is needed (Contract: ${contractInfo.contratoId}), but a valid GCS license file exists: ${gcsLicenseInfo.gcsFilePath}. Candidate for deletion.`;
                    functions.logger.warn(msg);
                    if (!gcsFilePathsLoggedForDeletion.has(gcsLicenseInfo.gcsFilePath)) { // Avoid duplicate feedback
                        feedbackItems.push({
                            userId: SYSTEM_USER_ID, userEmail: SYSTEM_USER_EMAIL, residenciaId, createdAt: Date.now(), text: msg,
                            page: "LicenseAuditFunction_Part4_DeleteUnneeded", status: "nuevo",
                        });
                         gcsFilePathsLoggedForDeletion.add(gcsLicenseInfo.gcsFilePath);
                         // DO NOT DELETE: "not deletes directly because is too risky"
                    }
                } else {
                    // Contract says NO license, and NO valid GCS license exists. This is the correct state.
                    functions.logger.info(`Residencia ${residenciaId}: Correctly has no GCS license as per Firestore (Contract: ${contractInfo.contratoId}).`);
                }
            }
        }

        // --- Final Step: Save Feedback ---
        if (feedbackItems.length > 0) {
            functions.logger.info(`Saving ${feedbackItems.length} feedback items from license audit.`);
            const batch = db.batch();
            feedbackItems.forEach(item => {
                const docRef = db.collection('feedbacks').doc(); // Auto-generate ID
                batch.set(docRef, { ...item, createdAt: admin.firestore.FieldValue.serverTimestamp() }); // Use server timestamp
            });
            try {
                await batch.commit();
                functions.logger.info("Successfully saved all feedback items.");
            } catch (error) {
                functions.logger.error("Error saving feedback items to Firestore:", error);
                // Handle individual feedback item save failure if necessary, or log the whole batch.
                // For simplicity, logging the main error here.
            }
        } else {
            functions.logger.info("License audit completed. No feedback items to report.");
        }

        functions.logger.info("Daily license audit: actualizacionArchivosLicencias finished successfully.");
        return; // PubSub functions should return null or a Promise
    }
);

interface SingleContractAuditResult {
    auditResult: boolean;
    licenseResult: 'no requerida' | 'licencia sin cambios' | 'licencia instalada' | 'licencia reinstalada' | 'error';
    errorMessage?: string;
}

export const actualizacionLicenciaContrato = onCall(
    {
        // Enforce a memory limit if this function is expected to be heavier
        // memory: "512MiB", // Example
        // Enforce a timeout if necessary
        // timeoutSeconds: 60,
    },
    async (request): Promise<SingleContractAuditResult> => {
        functions.logger.info("actualizacionLicenciaContrato called with data:", request.data);

        if (!request.auth) {
            functions.logger.error("Authentication error: User not authenticated.");
            throw new HttpsError("unauthenticated", "La función debe ser llamada por un usuario autenticado.");
        }
        // Optional: Add role-based authorization if needed
        // const uid = request.auth.uid;
        // const callerInfo = await getCallerSecurityInfo(uid, request.auth.token); // Assuming getCallerSecurityInfo is available
        // if (!callerInfo.isAdmin && !callerInfo.isMaster) {
        //     logger.error(`Authorization error: User ${uid} is not authorized.`);
        //     throw new HttpsError("permission-denied", "No tienes permiso para realizar esta acción.");
        // }

        const contratoResidenciaId = request.data.contratoResidenciaId as ContratoResidenciaId | undefined;

        if (!contratoResidenciaId) {
            functions.logger.error("Bad request: contratoResidenciaId is missing.");
            throw new HttpsError("invalid-argument", "El ID del contrato (contratoResidenciaId) es requerido.");
        }

        try {
            // 1. Fetch ContratoResidencia document
            const contratoDocRef = db.collection("ContratosResidencia").doc(contratoResidenciaId);
            const contratoDocSnap = await contratoDocRef.get();

            if (!contratoDocSnap.exists) {
                const msg = `ContratoResidencia con ID ${contratoResidenciaId} no encontrado.`;
                functions.logger.error(msg);
                return { auditResult: false, licenseResult: 'error', errorMessage: msg };
            }
            const contratoData = contratoDocSnap.data() as ContratoResidencia;
            if (!contratoData.residencia) {
                const msg = `ContratoResidencia ${contratoResidenciaId} no tiene un residenciaId asociado.`;
                functions.logger.error(msg);
                return { auditResult: false, licenseResult: 'error', errorMessage: msg };
            }
            const residenciaId = contratoData.residencia;

            // 2. Determine the "target Firestore license configuration"
            const now = new Date();
            const licenciasQuery = db.collection("Licencias")
                .where("contratoLicencia", "==", contratoResidenciaId) // Assuming 'contratoLicencia' links to ContratoResidencia.id
                .where("activa", "==", true) // Assuming 'activa' field exists and is boolean
                .orderBy("fechaFin", "desc");

            const licenciasSnap = await licenciasQuery.get();
            
            const activeNonExpiredLicencias: (Licencia & {id: string})[] = [];
            licenciasSnap.forEach(doc => {
                const licData = doc.data() as Licencia;
                    // Ensure fechaFin can be parsed to a Date
                const fechaFinLic = new Date(licData.fechaFin.toString());
                if (fechaFinLic > now) {
                    activeNonExpiredLicencias.push({ ...licData, id: doc.id });
                }
            });

            if (activeNonExpiredLicencias.length === 0) {
                const msg = `No se encontraron Licencias activas y no expiradas en Firestore para el Contrato ${contratoResidenciaId}.`;
                functions.logger.info(msg);
                return { auditResult: true, licenseResult: 'no requerida', errorMessage: msg };
            }

            if (activeNonExpiredLicencias.length > 1) {
                const licenseIds = activeNonExpiredLicencias.map(l => l.id).join(', ');
                const msg = `Se encontraron múltiples (${activeNonExpiredLicencias.length}) Licencias activas y no expiradas en Firestore para el Contrato ${contratoResidenciaId} (IDs: ${licenseIds}). Inconsistencia de datos.`;
                functions.logger.error(msg);
                return { auditResult: false, licenseResult: 'error', errorMessage: msg };
            }

            const targetLicenciaDoc = activeNonExpiredLicencias[0];
            // Ensure cantUsuarios is a number, default to 0 if undefined (though it should be defined)
            const targetUserCount = typeof targetLicenciaDoc.cantUsuarios === 'number' ? targetLicenciaDoc.cantUsuarios : 0;
            const targetExpirationDateISO = new Date(targetLicenciaDoc.fechaFin.toString()).toISOString();

            functions.logger.info(`Target Firestore license for Contrato ${contratoResidenciaId} (Residencia ${residenciaId}): Expiry ${targetExpirationDateISO}, Users ${targetUserCount}. From Licencia doc ID: ${targetLicenciaDoc.id}`);

            // 3. Get GCS License Details
            const gcsLicenseDetails = await getLicenseDetails(residenciaId);
            functions.logger.info(`GCS getLicenseDetails for Residencia ${residenciaId} status: ${gcsLicenseDetails.status}`, gcsLicenseDetails);

            let actionResult: SingleContractAuditResult;

            switch (gcsLicenseDetails.status) {
                case "error_reading_file":
                    actionResult = { auditResult: false, licenseResult: 'error', errorMessage: `Error al leer el archivo de licencia existente en GCS para Residencia ${residenciaId}.` };
                    break;
                case "not_found":
                    functions.logger.info(`GCS license not found for Residencia ${residenciaId}. Attempting to install new one.`);
                    const installRes = await generateLicenseFile(
                        {
                            ResidenciaId: residenciaId, 
                            licenciaValidaHasta: targetExpirationDateISO, 
                            cantidadUsuarios: targetUserCount, 
                            licenciaActiva: true
                        }
                    );
                    if (installRes.success) {
                        actionResult = { auditResult: true, licenseResult: 'licencia instalada', errorMessage: `Nueva licencia instalada en GCS para Residencia ${residenciaId}. Path: ${installRes.filePath}` };
                    } else {
                        actionResult = { auditResult: false, licenseResult: 'error', errorMessage: `Fallo al instalar nueva licencia en GCS para Residencia ${residenciaId}: ${installRes.error}` };
                    }
                    break;
                case "not_active":
                case "expired":
                case "invalid_token":
                    functions.logger.info(`GCS license for Residencia ${residenciaId} is '${gcsLicenseDetails.status}'. Attempting to reinstall.`);
                    const reinstallResObsolete = await generateLicenseFile(
                        {
                            ResidenciaId: residenciaId, 
                            licenciaValidaHasta: targetExpirationDateISO, 
                            cantidadUsuarios: targetUserCount, 
                            licenciaActiva: true
                        }
                    );
                    if (reinstallResObsolete.success) {
                        actionResult = { auditResult: true, licenseResult: 'licencia reinstalada', errorMessage: `Licencia reinstalada en GCS (era ${gcsLicenseDetails.status}) para Residencia ${residenciaId}.` };
                    } else {
                        actionResult = { auditResult: false, licenseResult: 'error', errorMessage: `Fallo al reinstalar licencia (era ${gcsLicenseDetails.status}) en GCS para Residencia ${residenciaId}: ${reinstallResObsolete.error}` };
                    }
                    break;
                case "valid":
                    const gcsExpiryISO = gcsLicenseDetails.licenciaValidaHasta ? new Date(gcsLicenseDetails.licenciaValidaHasta).toISOString() : "";
                    const gcsUserCount = typeof gcsLicenseDetails.cantidadUsuarios === 'number' ? gcsLicenseDetails.cantidadUsuarios : -1; // Use -1 to ensure mismatch if undefined

                    if (gcsExpiryISO === targetExpirationDateISO && gcsUserCount === targetUserCount) {
                        actionResult = { auditResult: true, licenseResult: 'licencia sin cambios', errorMessage: `La licencia en GCS para Residencia ${residenciaId} ya está actualizada.` };
                    } else {
                        functions.logger.info(`GCS license for Residencia ${residenciaId} has data mismatch. GCS: Expiry ${gcsExpiryISO}, Users ${gcsUserCount}. Firestore Target: Expiry ${targetExpirationDateISO}, Users ${targetUserCount}. Attempting reinstall.`);
                        const reinstallResMismatch = await generateLicenseFile(
                            {
                                ResidenciaId: residenciaId, 
                                licenciaValidaHasta: targetExpirationDateISO, 
                                cantidadUsuarios: targetUserCount, 
                                licenciaActiva: true
                            }
                        );
                        if (reinstallResMismatch.success) {
                            actionResult = { auditResult: true, licenseResult: 'licencia reinstalada', errorMessage: `Licencia reinstalada en GCS (por diferencia de datos) para Residencia ${residenciaId}.` };
                        } else {
                            actionResult = { auditResult: false, licenseResult: 'error', errorMessage: `Fallo al reinstalar licencia (por diferencia de datos) en GCS para Residencia ${residenciaId}: ${reinstallResMismatch.error}` };
                        }
                    }
                    break;
                default:
                    // Should not happen if getLicenseDetails returns one of the defined statuses
                    functions.logger.error("Unhandled GCS license status:", gcsLicenseDetails);
                    actionResult = { auditResult: false, licenseResult: 'error', errorMessage: `Estado de licencia GCS no manejado: ${gcsLicenseDetails.status}` };
            }
            
            functions.logger.info(`actualizacionLicenciaContrato for ${contratoResidenciaId} final result:`, actionResult);
            return actionResult;

        } catch (error) {
            functions.logger.error(`Error general en actualizacionLicenciaContrato para ${contratoResidenciaId}:`, error);
            if (error instanceof HttpsError) {
                throw error; // Re-throw HttpsError directly
            }
            // For other errors, wrap in a generic HttpsError
            throw new HttpsError("internal", `Error interno procesando la licencia para el contrato ${contratoResidenciaId}.`, error instanceof Error ? error.message : String(error));
        }
    }
);