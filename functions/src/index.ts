import { admin, db, FieldValue } from "./lib/firebase";
import {
  onCall,
  HttpsError,
  CallableRequest,
} from "firebase-functions/v2/https";
import * as functions from "firebase-functions/v2";

// Zod schemas import
import {
  createUserProfileSchema,
  updateUserProfileSchema,
} from "../../shared/schemas/usuarios";
import {
  createResidenciaSchema,
  updateResidenciaSchema,
} from "../../shared/schemas/residencia";

// Shared types import
import {
  UserProfile,
  LogEntry,
  LogActionType,
  LogPayload,
  UserId,
  Residencia,
  Dieta,
} from "../../shared/models/types";

// ------ User CRUD ------
interface CreateUserDataPayload {
    email: string;
    password?: string;
    profileData: Omit<UserProfile, "id" | "fechaCreacion" | "ultimaActualizacion" | "lastLogin" | "email">;
    performedByUid?: string;
}
interface UpdateUserDataPayload {
    userIdToUpdate: string;
    profileData: Partial<Omit<UserProfile, "id" | "email" | "fechaCreacion" | "ultimaActualizacion" | "lastLogin">>;
    performedByUid?: string;
}
interface DeleteUserDataPayload {
    userIdToDelete: string;
    performedByUid?: string;
}
interface CallerSecurityInfo {
    uid: string;
    profile?: UserProfile;
    claims?: Record<string, any>;
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
        functions.logger.error("Error fetching caller security info for UID:", uid, error);
        throw new HttpsError("internal", "Could not verify caller permissions.");
    }
}
export const createUser = onCall(
    { 
        region: "us-central1",
        cors: ["http://localhost:3001", "http://127.0.0.1:3001"],
        timeoutSeconds: 300,
    },
    async (request: CallableRequest<CreateUserDataPayload>) => {
        const callerInfo = await getCallerSecurityInfo(request.auth);
        const data = request.data;

        functions.logger.info(`createUser called by: ${callerInfo.uid}`, { data });

        // --- Validar estructura básica ---
        if (!data.email || !data.password || !data.profileData) {
            throw new HttpsError("invalid-argument", "Email, password, and profileData are required.");
        }

        // --- Validar con Zod ---
        const validationResult = createUserProfileSchema.safeParse({
            ...data.profileData,
            email: data.email,
        });

        if (!validationResult.success) {
            const zodErrors = validationResult.error.flatten();
            let errorMessage = "Validation failed: ";
            
            if (zodErrors.fieldErrors) {
                const fieldErrors = Object.entries(zodErrors.fieldErrors)
                    .map(([field, messages]) => `${field}: ${messages?.[0] || 'Invalid'}`)
                    .join("; ");
                errorMessage += fieldErrors;
            }
            if (zodErrors.formErrors && zodErrors.formErrors.length > 0) {
                errorMessage += (zodErrors.fieldErrors ? "; " : "") + zodErrors.formErrors.join("; ");
            }
            
            functions.logger.warn(`Validation failed for createUser:`, errorMessage);
            throw new HttpsError("invalid-argument", errorMessage);
        }

        // Datos validados
        const validatedData = validationResult.data;
        const { email, password } = data;
        const profileData = {
            ...validatedData,
            // Remover email del profileData si está incluido (será manejado por Firebase Auth)
        };
        delete (profileData as any).email;

        const targetUserRoles = profileData.roles || ["usuario"];
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
                disabled: !(profileData.isActive ?? true),
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

        try {
            const claimsToSet: Record<string, any> = {
                roles: targetUserRoles,
                isActive: profileData.isActive ?? true,
            };
            if (targetResidenciaId) {
                claimsToSet.residenciaId = targetResidenciaId;
            }
            await admin.auth().setCustomUserClaims(newUserId, claimsToSet);
            functions.logger.info("Custom claims set for new user:", newUserId, claimsToSet);
        } catch (error: any) {
            functions.logger.error("Error setting custom claims for new user:", newUserId, error);
            await admin.auth().deleteUser(newUserId).catch(delErr => functions.logger.error("Failed to cleanup auth user after claims error", delErr));
            throw new HttpsError("internal", `Setting custom claims failed: ${error.message}`);
        }

        const userProfileDoc: UserProfile = {
            ...profileData,
            id: newUserId as any,
            email: email,
            fechaCreacion: FieldValue.serverTimestamp(),
            ultimaActualizacion: FieldValue.serverTimestamp(),
            isActive: profileData.isActive ?? true,
            roles: targetUserRoles,
            residenciaId: targetResidenciaId,
            puedeTraerInvitados: profileData.puedeTraerInvitados || 'no',
            notificacionPreferencias: null,
        };

        try {
            await db.collection("users").doc(newUserId).set(userProfileDoc);
            functions.logger.info("Successfully created UserProfile in Firestore for UID:", newUserId);

            await logAction(
                { uid: callerInfo.uid, token: callerInfo.claims },
                {
                    action: 'USUARIO_CREADO',
                    targetId: newUserId,
                    targetCollection: 'users',
                    details: { message: "Usuario creado desde Cloud Functions" }
                }
            );
            return { success: true, userId: newUserId, message: "User created successfully." };

        } catch (error: any) {
            functions.logger.error("Error writing UserProfile to Firestore:", newUserId, error);
            await admin.auth().deleteUser(newUserId).catch(delErr => functions.logger.error("Failed to cleanup auth user after Firestore error", delErr));
            throw new HttpsError("internal", `Firestore write failed: ${error.message}`);
        }
    }
);
export const updateUser = onCall(
    { 
        region: "us-central1",
        cors: ["http://localhost:3001", "http://127.0.0.1:3001"]
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
        const targetUserAuth = await admin.auth().getUser(userIdToUpdate);

        // --- Validar con Zod (schema para actualización) ---
        const validationResult = updateUserProfileSchema.safeParse(profileData);

        if (!validationResult.success) {
            const zodErrors = validationResult.error.flatten();
            let errorMessage = "Validation failed: ";
            
            if (zodErrors.fieldErrors) {
                const fieldErrors = Object.entries(zodErrors.fieldErrors)
                    .map(([field, messages]) => `${field}: ${messages?.[0] || 'Invalid'}`)
                    .join("; ");
                errorMessage += fieldErrors;
            }
            if (zodErrors.formErrors && zodErrors.formErrors.length > 0) {
                errorMessage += (zodErrors.fieldErrors ? "; " : "") + zodErrors.formErrors.join("; ");
            }
            
            functions.logger.warn(`Validation failed for updateUser:`, errorMessage);
            throw new HttpsError("invalid-argument", errorMessage);
        }

        // Datos validados
        const validatedData = validationResult.data;

        // --- Security Checks for Update ---
        const canUpdate = callerInfo.isMaster ||
            (callerInfo.isAdmin && callerInfo.profile?.residenciaId === targetUserProfile.residenciaId) ||
            (callerInfo.uid === userIdToUpdate);

        if (!canUpdate) {
            throw new HttpsError("permission-denied", "You do not have permission to update this user.");
        }

        // Prevent non-master from making another user master or changing master's roles
        if (!callerInfo.isMaster && validatedData.roles?.includes("master") && targetUserProfile.roles?.includes("master")) {
             if (userIdToUpdate !== callerInfo.uid || !callerInfo.isMaster) {
                throw new HttpsError("permission-denied", "Only a master user can modify a master user's roles.");
             }
        }
        if (!callerInfo.isMaster && validatedData.roles?.includes("master") && !targetUserProfile.roles?.includes("master")) {
            throw new HttpsError("permission-denied", "You cannot make another user a master.");
        }

        // Prevent admin from changing residenciaId
        if (callerInfo.isAdmin && !callerInfo.isMaster && validatedData.residenciaId && validatedData.residenciaId !== callerInfo.profile?.residenciaId) {
            throw new HttpsError("permission-denied", "Admins can only assign users to their own Residencia.");
        }

        // Prepare Auth updates
        const authUpdates: admin.auth.UpdateRequest = {};
        if (validatedData.nombre || validatedData.apellido) {
            authUpdates.displayName = `${validatedData.nombre || targetUserProfile.nombre || ""} ${validatedData.apellido || targetUserProfile.apellido || ""}`.trim();
        }
        if (validatedData.isActive !== undefined) {
            authUpdates.disabled = !validatedData.isActive;
        }

        // Prepare Custom Claims updates
        const claimsToSet: Record<string, any> = { ...targetUserAuth.customClaims };
        let claimsChanged = false;
        if (validatedData.roles) {
            claimsToSet.roles = validatedData.roles;
            claimsChanged = true;
        }
        if (validatedData.residenciaId !== undefined) {
            claimsToSet.residenciaId = validatedData.residenciaId;
            claimsChanged = true;
        }
        if (validatedData.isActive !== undefined) {
            claimsToSet.isActive = validatedData.isActive;
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
        const firestoreUpdateData = {
            ...validatedData,
            ultimaActualizacion: FieldValue.serverTimestamp(),
        };

        try {
            await db.collection("users").doc(userIdToUpdate).update(firestoreUpdateData);
            functions.logger.info("UserProfile updated in Firestore:", userIdToUpdate);

            await logAction(
                { uid: callerInfo.uid, token: callerInfo.claims },
                {
                    action: 'USUARIO_ACTUALIZADO',
                    targetId: userIdToUpdate,
                    targetCollection: 'users',
                    details: { message: "Usuario actualizado desde Cloud Functions" }
                }
            );
            return { success: true, message: "User updated successfully." };
        } catch (error: any) {
            functions.logger.error("Error updating UserProfile in Firestore:", userIdToUpdate, error);
            throw new HttpsError("internal", `Firestore update failed: ${error.message}`);
        }
    }
);
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

            await logAction(
                { uid: callerInfo.uid, token: callerInfo.claims },
                {
                    action: 'USUARIO_ELIMINADO', // Asegúrate de actualizar tu Enum
                    targetId: userIdToDelete,
                    targetCollection: 'users',
                    details: { message: "Usuario eliminado desde Cloud Functions" }
                }
            );
            return { success: true, message: "User deleted successfully." };
        } catch (error: any) {
            functions.logger.error("Error deleting UserProfile from Firestore:", userIdToDelete, error);
            // If Auth deletion was successful but Firestore failed, this is a partial success/failure state.
            throw new HttpsError("internal", `Firestore deletion failed: ${error.message}`);
        }
    }
);

// ------ Residencia CRUD ------
interface CreateResidenciaDataPayload {
    residenciaId: string; // Custom ID for the residencia
    profileData: Omit<Residencia, "id">;
    performedByUid?: string;
}
interface UpdateResidenciaDataPayload {
    residenciaIdToUpdate: string;
    profileData: Partial<Omit<Residencia, "id">>;
    performedByUid?: string;
}
interface DeleteResidenciaDataPayload {
    residenciaIdToDelete: string;
    performedByUid?: string;
}
export const createResidencia = onCall(
    { 
        region: "us-central1",
        cors: ["http://localhost:3001", "http://127.0.0.1:3001"],
        timeoutSeconds: 300,
    },
    async (request: CallableRequest<CreateResidenciaDataPayload>) => {
        const callerInfo = await getCallerSecurityInfo(request.auth);
        const data = request.data;

        functions.logger.info(`createResidencia called by: ${callerInfo.uid}`, { residenciaId: data.residenciaId });

        // --- Validar permisos: solo master puede crear residencias ---
        if (!callerInfo.isMaster) {
            throw new HttpsError("permission-denied", "Only 'master' users can create residencias.");
        }

        // --- Validar estructura básica ---
        if (!data.residenciaId || !data.profileData) {
            throw new HttpsError("invalid-argument", "residenciaId and profileData are required.");
        }

        // --- Validar con Zod ---
        const validationResult = createResidenciaSchema.safeParse(data.profileData);

        if (!validationResult.success) {
            const zodErrors = validationResult.error.flatten();
            let errorMessage = "Validation failed: ";
            
            if (zodErrors.fieldErrors) {
                const fieldErrors = Object.entries(zodErrors.fieldErrors)
                    .map(([field, messages]) => `${field}: ${messages?.[0] || 'Invalid'}`)
                    .join("; ");
                errorMessage += fieldErrors;
            }
            if (zodErrors.formErrors && zodErrors.formErrors.length > 0) {
                errorMessage += (zodErrors.fieldErrors ? "; " : "") + zodErrors.formErrors.join("; ");
            }
            
            functions.logger.warn(`Validation failed for createResidencia:`, errorMessage);
            throw new HttpsError("invalid-argument", errorMessage);
        }

        // --- Check if residencia already exists ---
        const existingDoc = await db.collection("residencias").doc(data.residenciaId).get();
        if (existingDoc.exists) {
            throw new HttpsError("already-exists", `A residencia with ID '${data.residenciaId}' already exists.`);
        }

        try {
            // Validados por Zod
            const validatedData = validationResult.data;
            
            const residenciaDoc: Residencia = {
                id: data.residenciaId,
                ...validatedData,
                configuracionContabilidad: validatedData.configuracionContabilidad || null,
            };

            await db.collection("residencias").doc(data.residenciaId).set(residenciaDoc);
            functions.logger.info("Successfully created Residencia in Firestore:", data.residenciaId);

            // Create default Dieta
            try {
                const defaultDieta: Dieta = {
                    id: "", // Será asignado por Firestore
                    nombre: "Normal",
                    descripcion: "Ningún régimen especial",
                    isDefault: true,
                    isActive: true,
                    residenciaId: data.residenciaId,
                };
                // Remove the id field before adding since it's auto-generated
                const { id: _, ...dietaData } = defaultDieta;
                await db.collection("dietas").add(dietaData as Omit<Dieta, 'id'>);
                functions.logger.info("Successfully created default Dieta for Residencia:", data.residenciaId);
            } catch (dietaError) {
                functions.logger.error("Error creating default Dieta for Residencia:", data.residenciaId, dietaError);
                // Don't throw - residencia was created successfully, dieta failure is secondary
            }

            await logAction(
                { uid: callerInfo.uid, token: callerInfo.claims },
                {
                    action: 'RESIDENCIA_CREADA',
                    targetId: data.residenciaId,
                    targetCollection: 'residencias',
                    residenciaId: data.residenciaId,
                    details: { message: `Residencia '${validatedData.nombre}' creada desde Cloud Functions` }
                }
            );

            return { success: true, residenciaId: data.residenciaId, message: "Residencia created successfully." };
        } catch (error: any) {
            functions.logger.error("Error creating Residencia in Firestore:", data.residenciaId, error);
            throw new HttpsError("internal", `Firestore write failed: ${error.message}`);
        }
    }
);
export const updateResidencia = onCall(
    { 
        region: "us-central1",
        cors: ["http://localhost:3001", "http://127.0.0.1:3001"]
    },
    async (request: CallableRequest<UpdateResidenciaDataPayload>) => {
        const callerInfo = await getCallerSecurityInfo(request.auth);
        const data = request.data;
        const { residenciaIdToUpdate, profileData } = data;

        functions.logger.info(`updateResidencia called by: ${callerInfo.uid} for residencia: ${residenciaIdToUpdate}`, { profileData });

        // --- Validar estructura básica ---
        if (!residenciaIdToUpdate || !profileData) {
            throw new HttpsError("invalid-argument", "residenciaIdToUpdate and profileData are required.");
        }

        if (Object.keys(profileData).length === 0) {
            return { success: true, message: "No changes provided." };
        }

        // --- Fetch target residencia for security checks ---
        const targetResidenciaDoc = await db.collection("residencias").doc(residenciaIdToUpdate).get();
        if (!targetResidenciaDoc.exists) {
            throw new HttpsError("not-found", `Residencia ${residenciaIdToUpdate} not found.`);
        }

        // --- Validar permisos ---
        const canUpdate = callerInfo.isMaster || 
            (callerInfo.isAdmin && callerInfo.profile?.residenciaId === residenciaIdToUpdate);

        if (!canUpdate) {
            throw new HttpsError("permission-denied", "You do not have permission to update this residencia.");
        }

        // --- Validar con Zod ---
        const validationResult = updateResidenciaSchema.safeParse(profileData);

        if (!validationResult.success) {
            const zodErrors = validationResult.error.flatten();
            let errorMessage = "Validation failed: ";
            
            if (zodErrors.fieldErrors) {
                const fieldErrors = Object.entries(zodErrors.fieldErrors)
                    .map(([field, messages]) => `${field}: ${messages?.[0] || 'Invalid'}`)
                    .join("; ");
                errorMessage += fieldErrors;
            }
            if (zodErrors.formErrors && zodErrors.formErrors.length > 0) {
                errorMessage += (zodErrors.fieldErrors ? "; " : "") + zodErrors.formErrors.join("; ");
            }
            
            functions.logger.warn(`Validation failed for updateResidencia:`, errorMessage);
            throw new HttpsError("invalid-argument", errorMessage);
        }

        try {
            // Datos validados
            const validatedData = validationResult.data;

            const firestoreUpdateData = {
                ...validatedData,
                ultimaActualizacion: FieldValue.serverTimestamp(),
            };

            await db.collection("residencias").doc(residenciaIdToUpdate).update(firestoreUpdateData);
            functions.logger.info("Successfully updated Residencia in Firestore:", residenciaIdToUpdate);

            await logAction(
                { uid: callerInfo.uid, token: callerInfo.claims },
                {
                    action: 'RESIDENCIA_ACTUALIZADA',
                    targetId: residenciaIdToUpdate,
                    targetCollection: 'residencias',
                    residenciaId: residenciaIdToUpdate,
                    details: { message: "Residencia actualizada desde Cloud Functions" }
                }
            );

            return { success: true, message: "Residencia updated successfully." };
        } catch (error: any) {
            functions.logger.error("Error updating Residencia in Firestore:", residenciaIdToUpdate, error);
            throw new HttpsError("internal", `Firestore update failed: ${error.message}`);
        }
    }
);
export const deleteResidencia = onCall(
    { 
        region: "us-central1",
        cors: ["http://localhost:3001", "http://127.0.0.1:3001"]
    },
    async (request: CallableRequest<DeleteResidenciaDataPayload>) => {
        const callerInfo = await getCallerSecurityInfo(request.auth);
        const data = request.data;
        const { residenciaIdToDelete } = data;

        functions.logger.info(`deleteResidencia called by: ${callerInfo.uid} for residencia: ${residenciaIdToDelete}`);

        // --- Validar estructura básica ---
        if (!residenciaIdToDelete) {
            throw new HttpsError("invalid-argument", "residenciaIdToDelete is required.");
        }

        // --- Fetch target residencia for security checks ---
        const targetResidenciaDoc = await db.collection("residencias").doc(residenciaIdToDelete).get();
        if (!targetResidenciaDoc.exists) {
            throw new HttpsError("not-found", `Residencia ${residenciaIdToDelete} not found.`);
        }

        // --- Validar permisos: solo master puede borrar residencias ---
        if (!callerInfo.isMaster) {
            throw new HttpsError("permission-denied", "Only 'master' users can delete residencias.");
        }

        try {
            // Delete the residencia document
            await db.collection("residencias").doc(residenciaIdToDelete).delete();
            functions.logger.info("Successfully deleted Residencia from Firestore:", residenciaIdToDelete);

            // TODO: Consider cascading deletes or warnings about orphaned data (dietas, comedores, usuarios, etc.)
            
            await logAction(
                { uid: callerInfo.uid, token: callerInfo.claims },
                {
                    action: 'RESIDENCIA_ELIMINADA',
                    targetId: residenciaIdToDelete,
                    targetCollection: 'residencias',
                    residenciaId: residenciaIdToDelete,
                    details: { message: "Residencia eliminada desde Cloud Functions" }
                }
            );

            return { success: true, message: "Residencia deleted successfully." };
        } catch (error: any) {
            functions.logger.error("Error deleting Residencia from Firestore:", residenciaIdToDelete, error);
            throw new HttpsError("internal", `Firestore deletion failed: ${error.message}`);
        }
    }
);

// ------ Logging ------
interface LogEntryWrite extends Omit<LogEntry, "id" | "timestamp"> {
    timestamp: admin.firestore.FieldValue; // Keep this as admin.firestore.FieldValue
    // 'userId' from LogEntry will store the UID of the admin/user performing the action
}
export const logAction = async (
  authContext: { uid: string; token?: { email?: string; [key:string]: any } } | undefined | null,
  payload: LogPayload
): Promise<void> => {
  
  // 1. Identidad: Si no hay auth, asumimos SYSTEM (ej. un cron job)
  const actorId = authContext?.uid || 'SYSTEM';
  const actorEmail = authContext?.token?.email || 'system@internal';

  // 2. Construcción del objeto (Sin interfaces complicadas de escritura)
  const entry = {
    userId: actorId,
    userEmail: actorEmail,
    action: payload.action,
    
    // Mapeo inteligente de tus campos nuevos
    targetId: payload.targetId || null,
    targetCollection: payload.targetCollection || null,
    residenciaId: payload.residenciaId || null, // Importante para tus filtros de seguridad
    
    details: payload.details || {},
    
    // LA CLAVE: Usar el Timestamp del servidor de Admin SDK
    timestamp: FieldValue.serverTimestamp(),
    source: 'cloud-function'
  };

  try {
    await db.collection("logs").add(entry);
  } catch (error) {
    console.error(`[AUDIT ERROR] Falló log para ${payload.action}`, error);
    // No lanzamos error para no abortar la operación principal
  }
};

// --- VERY INSECURE - FOR LOCAL DEVELOPMENT ONLY ---
// --- DELETE THIS BLOCK BEFORE PRODUCTION ---
const HMAC_SECRET_KEY_DEV = "F#gQb-qXIW{;nWo_$H7rBbl5JnU,=tdefc(wqk@0g56s[gDhAI";
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
            fechaCreacion: FieldValue.serverTimestamp(),
            ultimaActualizacion: FieldValue.serverTimestamp(),
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
            identificacion: "",
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
            await logAction(
                { uid: userProfileDoc.id, token: {email: userProfileDoc.email} },
                {
                    action: 'USUARIO_CREADO', // Asegúrate de actualizar tu Enum
                    targetId: userProfileDoc.id,
                    targetCollection: 'users',
                    details: { message: "Usuario creado desde Cloud Functions (hardcoded master)" }
                }
            );
            return { success: true, userId: newUserId, message: "Hardcoded master user created successfully. REMEMBER TO DELETE THIS FUNCTION!" };
        } catch (error: any) {
            functions.logger.error("Error writing hardcoded master UserProfile to Firestore:", newUserId, error);
            await admin.auth().deleteUser(newUserId).catch(delErr => functions.logger.error("Failed to cleanup hardcoded auth user after Firestore error", delErr));
            throw new HttpsError("internal", `Hardcoded master user Firestore write failed: ${error.message}`);
        }
    }
);
// --- END OF INSECURE BLOCK ---
