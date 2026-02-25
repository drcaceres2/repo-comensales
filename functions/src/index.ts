import { admin, db, FieldValue } from "./lib/firebase";
import {
  onCall,
  HttpsError,
  CallableRequest,
} from "firebase-functions/v2/https";
import * as functions from "firebase-functions/v2";

// Zod schemas import
import {
  Usuario,
  createUsuarioSchema,
  updateUsuarioSchema,
  CreateUsuario,
  UpdateUsuario,
} from "../../shared/schemas/usuarios";
import {
  Residencia,
  CreateResidenciaSchema,
  UpdateResidenciaSchema,
  ConfiguracionResidencia,
} from "../../shared/schemas/residencia";
import { ConfigContabilidad } from "../../shared/schemas/contabilidad";
import { DietaData } from "../../shared/schemas/complemento1";

// Shared types import
import {
  RolUsuario,
  LogEntry,
  LogPayload
} from "../../shared/models/types";
import { ComedorData as ComedorDataSchemaType } from "../../shared/schemas/complemento1";

// ------ User CRUD ------
interface CreateUserDataPayload {
    email: string;
    password?: string;
    profileData: CreateUsuario;
    performedByUid?: string;
}
interface UpdateUserDataPayload {
    userIdToUpdate: string;
    profileData: UpdateUsuario;
    performedByUid?: string;
}
interface DeleteUserDataPayload {
    userIdToDelete: string;
    performedByUid?: string;
}
interface CallerSecurityInfo {
    uid: string;
    profile?: Usuario;
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
            db.collection("usuarios").doc(uid).get()
        ]);

        const claims = userRecord.customClaims || {};
        const profile = profileDoc.exists ? profileDoc.data() as Usuario : undefined;

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
        const validationResult = createUsuarioSchema.safeParse(data.profileData);

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

        const targetUserRoles = validatedData.roles || ["residente"];
        const targetResidenciaId = validatedData.residenciaId || null;

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
                displayName: `${validatedData.nombre || ""} ${validatedData.apellido || ""}`.trim(),
                disabled: !(validatedData.estaActivo ?? true),
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
        const now = new Date().toISOString();

        try {
            const claimsToSet: Record<string, any> = {
                roles: targetUserRoles,
                isActive: validatedData.estaActivo ?? true,
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

        const usuarioDoc: Usuario = {
            id: newUserId,
            timestampCreacion: now,
            timestampActualizacion: now,
            // Spread the rest of the validated data, which conforms to the schema
            ...validatedData,
            // Ensure roles and residenciaId from validated data are used, with fallbacks
            roles: validatedData.roles || ["residente"],
            residenciaId: validatedData.residenciaId || null,
        };

        // Remove password fields if they somehow slipped in
        delete (usuarioDoc as any).password;
        delete (usuarioDoc as any).confirmPassword;

        try {
            await db.collection("usuarios").doc(newUserId).set(usuarioDoc);
            functions.logger.info("Successfully created Usuario in Firestore for UID:", newUserId);

            await logAction(
                { uid: callerInfo.uid, token: callerInfo.claims },
                {
                    action: 'USUARIO_CREADO',
                    targetId: newUserId,
                    targetCollection: 'usuarios',
                    details: { message: "Usuario creado desde Cloud Functions" }
                }
            );
            return { success: true, userId: newUserId, message: "User created successfully." };

        } catch (error: any) {
            functions.logger.error("Error writing Usuario to Firestore:", newUserId, error);
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

        const targetUserDoc = await db.collection("usuarios").doc(userIdToUpdate).get();
        if (!targetUserDoc.exists) {
            throw new HttpsError("not-found", `User ${userIdToUpdate} not found in Firestore.`);
        }
        const targetUsuario = targetUserDoc.data() as Usuario;
        const targetUserAuth = await admin.auth().getUser(userIdToUpdate);

        const validationResult = updateUsuarioSchema.safeParse(profileData);

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

        const validatedData = validationResult.data;

        const canUpdate = callerInfo.isMaster ||
            (callerInfo.isAdmin && callerInfo.profile?.residenciaId === targetUsuario.residenciaId) ||
            (callerInfo.uid === userIdToUpdate);

        if (!canUpdate) {
            throw new HttpsError("permission-denied", "You do not have permission to update this user.");
        }

        if (!callerInfo.isMaster && validatedData.roles?.includes("master") && targetUsuario.roles?.includes("master")) {
             if (userIdToUpdate !== callerInfo.uid || !callerInfo.isMaster) {
                throw new HttpsError("permission-denied", "Only a master user can modify a master user's roles.");
             }
        }
        if (!callerInfo.isMaster && validatedData.roles?.includes("master") && !targetUsuario.roles?.includes("master")) {
            throw new HttpsError("permission-denied", "You cannot make another user a master.");
        }

        if (callerInfo.isAdmin && !callerInfo.isMaster && validatedData.residenciaId && validatedData.residenciaId !== callerInfo.profile?.residenciaId) {
            throw new HttpsError("permission-denied", "Admins can only assign users to their own Residencia.");
        }

        const authUpdates: admin.auth.UpdateRequest = {};
        if (validatedData.nombre || validatedData.apellido) {
            authUpdates.displayName = `${validatedData.nombre || targetUsuario.nombre || ""} ${validatedData.apellido || targetUsuario.apellido || ""}`.trim();
        }
        if (validatedData.estaActivo !== undefined) {
            authUpdates.disabled = !validatedData.estaActivo;
        }

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
        if (validatedData.estaActivo !== undefined) {
            claimsToSet.isActive = validatedData.estaActivo;
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

        // Helper function to flatten object for Firestore update
        const flattenObject = (obj: any, prefix = ''): Record<string, any> => {
            return Object.keys(obj).reduce((acc: Record<string, any>, k: string) => {
                const pre = prefix.length ? prefix + '.' : '';
                if (typeof obj[k] === 'object' && obj[k] !== null && !Array.isArray(obj[k])) {
                    Object.assign(acc, flattenObject(obj[k], pre + k));
                } else {
                    acc[pre + k] = obj[k];
                }
                return acc;
            }, {});
        };

        const firestoreUpdateData = {
            ...flattenObject(validatedData),
            timestampActualizacion: new Date().toISOString(),
        };

        try {
            await db.collection("usuarios").doc(userIdToUpdate).update(firestoreUpdateData);
            functions.logger.info("Usuario updated in Firestore:", userIdToUpdate);

            await logAction(
                { uid: callerInfo.uid, token: callerInfo.claims },
                {
                    action: 'USUARIO_ACTUALIZADO',
                    targetId: userIdToUpdate,
                    targetCollection: 'usuarios',
                    details: { message: "Usuario actualizado desde Cloud Functions" }
                }
            );
            return { success: true, message: "User updated successfully." };
        } catch (error: any) {
            functions.logger.error("Error updating Usuario in Firestore:", userIdToUpdate, error);
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

        const targetUserDoc = await db.collection("usuarios").doc(userIdToDelete).get();
        if (!targetUserDoc.exists) {
            functions.logger.warn(`User ${userIdToDelete} not found in Firestore, attempting Auth deletion only.`);
        }
        const targetUsuario = targetUserDoc.data() as Usuario | undefined;

        const canDelete = callerInfo.isMaster ||
            (callerInfo.isAdmin && callerInfo.profile?.residenciaId === targetUsuario?.residenciaId);

        if (!canDelete) {
            throw new HttpsError("permission-denied", "You do not have permission to delete this user.");
        }
        if (callerInfo.isAdmin && !callerInfo.isMaster && targetUsuario?.roles?.includes("master")) {
            throw new HttpsError("permission-denied", "Admins cannot delete 'master' users.");
        }

        try {
            await admin.auth().deleteUser(userIdToDelete);
            functions.logger.info("Successfully deleted user from Firebase Auth:", userIdToDelete);
        } catch (error: any) {
            functions.logger.error("Error deleting user from Firebase Auth:", userIdToDelete, error);
            if (error.code !== "auth/user-not-found") {
                throw new HttpsError("internal", `Auth deletion failed: ${error.message}`);
            }
            functions.logger.warn("User not found in Auth during deletion, proceeding to Firestore cleanup if possible.");
        }

        try {
            if (targetUserDoc.exists) {
                await db.collection("usuarios").doc(userIdToDelete).delete();
                functions.logger.info("Successfully deleted Usuario from Firestore:", userIdToDelete);
            }

            await logAction(
                { uid: callerInfo.uid, token: callerInfo.claims },
                {
                    action: 'USUARIO_ELIMINADO',
                    targetId: userIdToDelete,
                    targetCollection: 'usuarios',
                    details: { message: "Usuario eliminado desde Cloud Functions" }
                }
            );
            return { success: true, message: "User deleted successfully." };
        } catch (error: any) {
            functions.logger.error("Error deleting Usuario from Firestore:", userIdToDelete, error);
            throw new HttpsError("internal", `Firestore deletion failed: ${error.message}`);
        }
    }
);

// ------ Residencia CRUD ------
interface CreateResidenciaDataPayload {
    residenciaId: string;
    profileData: Omit<Residencia, "id">;
    performedByUid?: string;
}
interface UpdateResidenciaDataPayload {
    residenciaIdToUpdate: string;
    profileData: Partial<Omit<Residencia, "id">>;
    version: number;
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

        if (!callerInfo.isMaster) {
            throw new HttpsError("permission-denied", "Only 'master' users can create residencias.");
        }

        if (!data.residenciaId || !data.profileData) {
            throw new HttpsError("invalid-argument", "residenciaId and profileData are required.");
        }

        const validationResult = CreateResidenciaSchema.safeParse(data.profileData);

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

        const existingDoc = await db.collection("residencias").doc(data.residenciaId).get();
        if (existingDoc.exists) {
            throw new HttpsError("already-exists", `A residencia with ID '${data.residenciaId}' already exists.`);
        }

        const batch = db.batch();

        try {
            const validatedData = validationResult.data;
            
            const residenciaDoc: Residencia = {
                id: data.residenciaId,
                ...validatedData,
            };
            const residenciaRef = db.collection("residencias").doc(data.residenciaId);
            batch.set(residenciaRef, residenciaDoc);
            functions.logger.info("Successfully created Residencia in Firestore:", data.residenciaId);

            const now = new Date().toISOString();
            const defaultConfigRef = db.collection("residencias").doc(data.residenciaId).collection("configuracion").doc("general");
            const defaultDieta: DietaData = {
                nombre: "Normal",
                identificadorAdministracion: "NORMAL",
                descripcion: { tipo: 'texto_corto', descripcion: "Ningún régimen especial." },
                esPredeterminada: true,
                estado: 'aprobada_director',
                avisoAdministracion: 'comunicacion_final',
                estaActiva: true,
            };
            const defaultComedor: ComedorDataSchemaType = {
                nombre: "Comedor Principal"
            };
            const initialConfig: ConfiguracionResidencia = {
                residenciaId: data.residenciaId,
                nombreCompleto: validatedData.nombre,
                version: 0,
                fechaHoraReferenciaUltimaSolicitud: now,
                timestampUltimaSolicitud: FieldValue.serverTimestamp(),
                dietas: {
                    'normal': defaultDieta
                },
                comedores: {
                    'comedor-principal': defaultComedor
                },
                horariosSolicitud: {},
                gruposUsuarios: {},
                gruposComidas: {},
                esquemaSemanal: {},
                catalogoAlternativas: {},
                configuracionAlternativas: {},
            };
            batch.set(defaultConfigRef, initialConfig);
            functions.logger.info("Successfully created default Dieta for Residencia:", data.residenciaId);

            const configContabilidadRef = db.collection("residencias").doc(data.residenciaId).collection("configContabilidad").doc("general");
            const initialContabilidadConfig: ConfigContabilidad = {
              residenciaId: data.residenciaId,
              modeloClasificacion: 'detallada',
              valorizacionComensales: false,
            };
            batch.set(configContabilidadRef, initialContabilidadConfig);
            functions.logger.info("Successfully created default ConfigContabilidad for Residencia:", data.residenciaId);

            await batch.commit();

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
        const { residenciaIdToUpdate, profileData, version } = request.data;

        functions.logger.info(`updateResidencia called by: ${callerInfo.uid} for residencia: ${residenciaIdToUpdate}`, { profileData });

        if (!residenciaIdToUpdate || !profileData) {
            throw new HttpsError("invalid-argument", "residenciaIdToUpdate and profileData are required.");
        }

        if (Object.keys(profileData).length === 0) {
            return { success: true, message: "No changes provided." };
        }

        const canUpdate = callerInfo.isMaster || 
            (callerInfo.isAdmin && callerInfo.profile?.residenciaId === residenciaIdToUpdate);

        if (!canUpdate) {
            throw new HttpsError("permission-denied", "You do not have permission to update this residencia.");
        }

        const validationResult = UpdateResidenciaSchema.safeParse(profileData);

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

        const residenciaRef = db.collection("residencias").doc(residenciaIdToUpdate);
        const configRef = residenciaRef.collection("configuracion").doc("general");

        try {
            await db.runTransaction(async (transaction) => {
                const configDoc = await transaction.get(configRef);

                if (!configDoc.exists) {
                    throw new HttpsError("not-found", "Configuration document not found.");
                }

                const configData = configDoc.data() as ConfiguracionResidencia;

                if (configData.version !== version) {
                    throw new HttpsError("failed-precondition", "The data has been modified by someone else. Please reload and try again.");
                }

                const newVersion = configData.version + 1;
                
                const validatedData = validationResult.data;

                const firestoreUpdateData = {
                    ...validatedData,
                    ultimaActualizacion: FieldValue.serverTimestamp(),
                };
                
                transaction.update(residenciaRef, firestoreUpdateData);

                const configUpdateData: any = { version: newVersion };
                if (validatedData.nombre) {
                    configUpdateData.nombreCompleto = validatedData.nombre;
                }
                transaction.update(configRef, configUpdateData);
            });

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
            if (error instanceof HttpsError) {
                throw error;
            }
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

        if (!residenciaIdToDelete) {
            throw new HttpsError("invalid-argument", "residenciaIdToDelete is required.");
        }

        const targetResidenciaDoc = await db.collection("residencias").doc(residenciaIdToDelete).get();
        if (!targetResidenciaDoc.exists) {
            throw new HttpsError("not-found", `Residencia ${residenciaIdToDelete} not found.`);
        }

        if (!callerInfo.isMaster) {
            throw new HttpsError("permission-denied", "Only 'master' users can delete residencias.");
        }

        try {
            await db.collection("residencias").doc(residenciaIdToDelete).delete();
            functions.logger.info("Successfully deleted Residencia from Firestore:", residenciaIdToDelete);
            
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
    timestamp: admin.firestore.FieldValue;
}
export const logActionCallable = onCall(
  {
    region: "us-central1",
    cors: ["http://localhost:3001", "http://127.0.0.1:3001"],
  },
  async (request: CallableRequest<LogPayload>) => {
    await logAction(request.auth, request.data);
    return { success: true };
  }
);

export const logAction = async (
  authContext: { uid: string; token?: { email?: string; [key:string]: any } } | undefined | null,
  payload: LogPayload
): Promise<void> => {
  
  const actorId = authContext?.uid || 'SYSTEM';
  const actorEmail = authContext?.token?.email || 'system@internal';

  const entry = {
    userId: actorId,
    userEmail: actorEmail,
    action: payload.action,
    
    targetId: payload.targetId || null,
    targetCollection: payload.targetCollection || null,
    residenciaId: payload.residenciaId || null,
    
    details: payload.details || {},
    
    timestamp: FieldValue.serverTimestamp(),
    source: 'cloud-function'
  };

  try {
    await db.collection("logs").add(entry);
  } catch (error) {
    console.error(`[AUDIT ERROR] Falló log para ${payload.action}`, error);
  }
};


// --- VERY INSECURE - FOR LOCAL DEVELOPMENT ONLY ---
// --- DELETE THIS BLOCK BEFORE PRODUCTION ---
export const createHardcodedMasterUser = onCall(
    {
        region: "us-central1",
        cors: ["http://localhost:3001", "http://127.0.0.1:3001"]
    },
    async (request: CallableRequest<any>) => {
        functions.logger.warn("********************************************************************");
        functions.logger.warn("WARNING: Executing createHardcodedMasterUser.");
        functions.logger.warn("This function is highly insecure and for local development ONLY.");
        functions.logger.warn("IT MUST BE DELETED BEFORE DEPLOYING TO PRODUCTION.");
        functions.logger.warn("********************************************************************");

        const hardcodedEmail = "drcaceres@gmail.com";
        const hardcodedPassword = "123456";
        const hardcodedProfileData = {
            nombre: "Master",
            apellido: "User (Hardcoded)",
            nombreCorto: "DCV",
            roles: ["master"] as RolUsuario[],
            estaActivo: true,
            email: hardcodedEmail,
            tieneAutenticacion: true,
            grupos: [],
            puedeTraerInvitados: 'si' as const,
        };

        try {
            await admin.auth().getUserByEmail(hardcodedEmail);
            functions.logger.info(`User ${hardcodedEmail} already exists. Skipping creation.`);
            const userDoc = await db.collection("usuarios").where("email", "==", hardcodedEmail).limit(1).get();
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
        const now = new Date().toISOString();

        try {
            const claimsToSet = { roles: ["master"], isActive: true };
            await admin.auth().setCustomUserClaims(newUserId, claimsToSet);
            functions.logger.info("Custom claims ('master') set for hardcoded user:", newUserId);
        } catch (error: any) {
            functions.logger.error("Error setting custom claims for hardcoded master user:", newUserId, error);
            await admin.auth().deleteUser(newUserId).catch(delErr => functions.logger.error("Failed to cleanup hardcoded auth user after claims error", delErr));
            throw new HttpsError("internal", `Setting hardcoded master custom claims failed: ${error.message}`);
        }

        const usuarioDoc: Usuario = {
            id: newUserId,
            ...hardcodedProfileData,
            residenciaId: null,
            timestampCreacion: now,
            timestampActualizacion: now,
        };

        try {
            await db.collection("usuarios").doc(newUserId).set(usuarioDoc);
            functions.logger.info("Successfully created hardcoded master Usuario in Firestore:", newUserId);
            await logAction(
                { uid: usuarioDoc.id, token: {email: usuarioDoc.email} },
                {
                    action: 'USUARIO_CREADO',
                    targetId: usuarioDoc.id,
                    targetCollection: 'usuarios',
                    details: { message: "Usuario creado desde Cloud Functions (hardcoded master)" }
                }
            );
            return { success: true, userId: newUserId, message: "Hardcoded master user created successfully. REMEMBER TO DELETE THIS FUNCTION!" };
        } catch (error: any) {
            functions.logger.error("Error writing hardcoded master Usuario to Firestore:", newUserId, error);
            await admin.auth().deleteUser(newUserId).catch(delErr => functions.logger.error("Failed to cleanup hardcoded auth user after Firestore error", delErr));
            throw new HttpsError("internal", `Hardcoded master user Firestore write failed: ${error.message}`);
        }
    }
);
// --- END OF INSECURE BLOCK ---
