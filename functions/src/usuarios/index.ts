import { admin, db, FieldValue } from "../lib/firebase";
import {
  onCall,
  HttpsError,
  CallableRequest,
} from "firebase-functions/v2/https";
import * as functions from "firebase-functions/v2";

import {
  Usuario,
  createUsuarioSchema,
  updateUsuarioSchema,
  CreateUsuario,
  UpdateUsuario,
} from "../../../shared/schemas/usuarios";
import { Residencia } from "../../../shared/schemas/residencia";
import { getCallerSecurityInfo } from "../common/security";
import { logAction } from "../common/logging";

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

    if (!data.email || !data.password || !data.profileData) {
      throw new HttpsError("invalid-argument", "Email, password, and profileData are required.");
    }

    const validationResult = createUsuarioSchema.safeParse(data.profileData);

    if (!validationResult.success) {
      const zodErrors = validationResult.error.flatten();
      let errorMessage = "Validation failed: ";

      if (zodErrors.fieldErrors) {
        const fieldErrors = Object.entries(zodErrors.fieldErrors)
          .map(([field, messages]) => `${field}: ${messages?.[0] || "Invalid"}`)
          .join("; ");
        errorMessage += fieldErrors;
      }
      if (zodErrors.formErrors && zodErrors.formErrors.length > 0) {
        errorMessage += (zodErrors.fieldErrors ? "; " : "") + zodErrors.formErrors.join("; ");
      }

      functions.logger.warn("Validation failed for createUser:", errorMessage);
      throw new HttpsError("invalid-argument", errorMessage);
    }

    const validatedData = validationResult.data;
    const { email, password } = data;

    const targetUserRoles = validatedData.roles || ["residente"];
    const targetResidenciaId = validatedData.residenciaId || null;

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

    try {
      const claimsToSet: Record<string, any> = {
        roles: targetUserRoles,
        isActive: validatedData.estaActivo ?? true,
        email: email,
      };
      if (targetResidenciaId) {
        claimsToSet.residenciaId = targetResidenciaId;

        const residenciaDoc = await db.collection("residencias").doc(targetResidenciaId).get();
        if (residenciaDoc.exists) {
          const residenciaData = residenciaDoc.data() as Residencia;
          if (residenciaData.ubicacion.zonaHoraria) {
            claimsToSet.zonaHoraria = residenciaData.ubicacion.zonaHoraria;
          } else {
            functions.logger.warn(`Residencia document ${targetResidenciaId} found but no zonaHoraria found.`);
          }
          if (residenciaData.contextoTraduccion) {
            claimsToSet.contextoTraduccion = residenciaData.contextoTraduccion;
          } else {
            functions.logger.warn(`Residencia document ${targetResidenciaId} found but no contextoTraduccion found.`);
          }
        } else {
          functions.logger.warn(`Residencia document ${targetResidenciaId} not found when setting claims for user ${newUserId}.`);
        }
      }
      await admin.auth().setCustomUserClaims(newUserId, claimsToSet);
      functions.logger.info("Custom claims set for new user:", newUserId, claimsToSet);
    } catch (error: any) {
      functions.logger.error("Error setting custom claims for new user:", newUserId, error);
      await admin.auth().deleteUser(newUserId).catch((delErr) => functions.logger.error("Failed to cleanup auth user after claims error", delErr));
      throw new HttpsError("internal", `Setting custom claims failed: ${error.message}`);
    }

    const usuarioDoc: Usuario = {
      id: newUserId,
      timestampCreacion: FieldValue.serverTimestamp(),
      timestampActualizacion: FieldValue.serverTimestamp(),
      ...validatedData,
      roles: validatedData.roles || ["residente"],
      residenciaId: validatedData.residenciaId || null,
    };

    delete (usuarioDoc as any).password;
    delete (usuarioDoc as any).confirmPassword;

    try {
      await db.collection("usuarios").doc(newUserId).set(usuarioDoc);
      functions.logger.info("Successfully created Usuario in Firestore for UID:", newUserId);

      await logAction(
        { uid: callerInfo.uid, token: callerInfo.claims },
        {
          action: "USUARIO_CREADO",
          targetId: newUserId,
          targetCollection: "usuarios",
          details: { message: "Usuario creado desde Cloud Functions" },
        }
      );
      return { success: true, userId: newUserId, message: "User created successfully." };
    } catch (error: any) {
      functions.logger.error("Error writing Usuario to Firestore:", newUserId, error);
      await admin.auth().deleteUser(newUserId).catch((delErr) => functions.logger.error("Failed to cleanup auth user after Firestore error", delErr));
      throw new HttpsError("internal", `Firestore write failed: ${error.message}`);
    }
  }
);

export const updateUser = onCall(
  {
    region: "us-central1",
    cors: ["http://localhost:3001", "http://127.0.0.1:3001"],
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
          .map(([field, messages]) => `${field}: ${messages?.[0] || "Invalid"}`)
          .join("; ");
        errorMessage += fieldErrors;
      }
      if (zodErrors.formErrors && zodErrors.formErrors.length > 0) {
        errorMessage += (zodErrors.fieldErrors ? "; " : "") + zodErrors.formErrors.join("; ");
      }

      functions.logger.warn("Validation failed for updateUser:", errorMessage);
      throw new HttpsError("invalid-argument", errorMessage);
    }

    const validatedData = validationResult.data;

    const canUpdate =
      callerInfo.isMaster ||
      (callerInfo.isAdmin && callerInfo.profile?.residenciaId === targetUsuario.residenciaId) ||
      callerInfo.uid === userIdToUpdate;

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
    if (validatedData.estaActivo !== undefined) {
      claimsToSet.isActive = validatedData.estaActivo;
      claimsChanged = true;
    }

    if (validatedData.residenciaId !== undefined) {
      claimsChanged = true;
      const newResidenciaId = validatedData.residenciaId;

      if (newResidenciaId) {
        claimsToSet.residenciaId = newResidenciaId;
        const residenciaDoc = await db.collection("residencias").doc(newResidenciaId).get();
        if (residenciaDoc.exists) {
          const residenciaData = residenciaDoc.data() as Residencia;
          claimsToSet.zonaHoraria = residenciaData.ubicacion.zonaHoraria;
          claimsToSet.contextoTraduccion = residenciaData.contextoTraduccion;
        } else {
          functions.logger.warn(`Residencia document ${newResidenciaId} not found for user ${userIdToUpdate}. Clearing related claims.`);
          delete claimsToSet.zonaHoraria;
          delete claimsToSet.contextoTraduccion;
        }
      } else {
        delete claimsToSet.residenciaId;
        delete claimsToSet.zonaHoraria;
        delete claimsToSet.contextoTraduccion;
      }
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

    const flattenObject = (obj: any, prefix = ""): Record<string, any> => {
      return Object.keys(obj).reduce((acc: Record<string, any>, k: string) => {
        const pre = prefix.length ? prefix + "." : "";
        if (typeof obj[k] === "object" && obj[k] !== null && !Array.isArray(obj[k])) {
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
          action: "USUARIO_ACTUALIZADO",
          targetId: userIdToUpdate,
          targetCollection: "usuarios",
          details: { message: "Usuario actualizado desde Cloud Functions" },
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
    cors: ["http://localhost:3001", "http://127.0.0.1:3001"],
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

    const canDelete =
      callerInfo.isMaster ||
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
          action: "USUARIO_ELIMINADO",
          targetId: userIdToDelete,
          targetCollection: "usuarios",
          details: { message: "Usuario eliminado desde Cloud Functions" },
        }
      );
      return { success: true, message: "User deleted successfully." };
    } catch (error: any) {
      functions.logger.error("Error deleting Usuario from Firestore:", userIdToDelete, error);
      throw new HttpsError("internal", `Firestore deletion failed: ${error.message}`);
    }
  }
);
