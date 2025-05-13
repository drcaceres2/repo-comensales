import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import * as admin from "firebase-admin";

// Shared types import
import { UserProfile, LogEntry, LogActionType } from "../../shared/models/types";

admin.initializeApp();
const db = admin.firestore();

// --- Interfaces for Function Payloads ---
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
    timestamp: admin.firestore.FieldValue;
    // 'userId' from LogEntry will store the UID of the admin/user performing the action
}

// --- Security Helper ---
interface CallerSecurityInfo {
    uid: string;
    profile?: UserProfile;
    claims?: Record<string, any>; // Changed from admin.auth.DecodedIdToken
    isMaster: boolean;
    isAdmin: boolean;
}

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
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
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


// --- Create User Function ---
export const createUser = onCall(
    { region: "us-central1" }, // Add other options if needed: memory, timeout etc.
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

        // Prepare UserProfile document for Firestore
        const userProfileDoc: UserProfile = {
            ...profileData,
            id: newUserId,
            email: email,
            fechaCreacion: admin.firestore.FieldValue.serverTimestamp() as any, // Cast to any for FieldValue
            ultimaActualizacion: admin.firestore.FieldValue.serverTimestamp() as any,
            isActive: profileData.isActive === undefined ? true : profileData.isActive,
            roles: targetUserRoles, // Ensure roles are stored in Firestore as well
            residenciaId: targetResidenciaId === null ? undefined : targetResidenciaId, // Ensure residenciaId is stored
        };
        // Remove undefined keys from profileData before merging if it's a concern for partial updates
        // For creation, all expected fields should be present or have defaults.

        try {
            await db.collection("users").doc(newUserId).set(userProfileDoc);
            logger.info("Successfully created UserProfile in Firestore for UID:", newUserId);

            await logAction("user_created", callerInfo.uid, newUserId, { email, roles: targetUserRoles, residenciaId: targetResidenciaId });
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
    { region: "us-central1" },
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
            const currentNombre = targetUserProfile.nombre || "";
            const currentApellido = targetUserProfile.apellido || "";
            authUpdates.displayName = `${profileData.nombre || currentNombre} ${profileData.apellido || currentApellido}`.trim();
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
            ultimaActualizacion: admin.firestore.FieldValue.serverTimestamp(),
        };

        try {
            await db.collection("users").doc(userIdToUpdate).update(firestoreUpdateData);
            logger.info("UserProfile updated in Firestore:", userIdToUpdate);

            await logAction("user_updated", callerInfo.uid, userIdToUpdate, { updatedFields: Object.keys(profileData) });
            return { success: true, message: "User updated successfully." };
        } catch (error: any) {
            logger.error("Error updating UserProfile in Firestore:", userIdToUpdate, error);
            throw new HttpsError("internal", `Firestore update failed: ${error.message}`);
        }
    }
);

// --- Delete User Function ---
export const deleteUser = onCall(
    { region: "us-central1" },
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

            await logAction("user_deleted", callerInfo.uid, userIdToDelete);
            return { success: true, message: "User deleted successfully." };
        } catch (error: any) {
            logger.error("Error deleting UserProfile from Firestore:", userIdToDelete, error);
            // If Auth deletion was successful but Firestore failed, this is a partial success/failure state.
            throw new HttpsError("internal", `Firestore deletion failed: ${error.message}`);
        }
    }
);
