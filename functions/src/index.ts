import { admin, db } from "./lib/firebase";
import {
  onCall,
  HttpsError,
  CallableRequest,
} from "firebase-functions/v2/https";
import * as functions from "firebase-functions/v2";

import { Usuario } from "../../shared/schemas/usuarios";
import { RolUsuario } from "../../shared/models/types";

import { createUser, updateUser, deleteUser } from "./usuarios";
import {
  createResidencia,
  updateResidencia,
  deleteResidencia,
} from "./residencias";
import { guardarHorariosResidencia } from "./horarios";
import {
  actualizarMatrizAccesos,
  asignarAsistenteProxy,
  revocarAsistenteProxy,
} from "./asistentes";

import { getCallerSecurityInfo } from "./common/security";
import { logAction, logActionCallable } from "./common/logging";

export {
  createUser,
  updateUser,
  deleteUser,
  createResidencia,
  updateResidencia,
  deleteResidencia,
  guardarHorariosResidencia,
  actualizarMatrizAccesos,
  asignarAsistenteProxy,
  revocarAsistenteProxy,
  logActionCallable,
};

export const createHardcodedMasterUser = onCall(
  {
    region: "us-central1",
    cors: ["http://localhost:3001", "http://127.0.0.1:3001"],
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
      puedeTraerInvitados: "si" as const,
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
      const claimsToSet = { roles: ["master"], isActive: true, email: hardcodedEmail };
      await admin.auth().setCustomUserClaims(newUserId, claimsToSet);
      functions.logger.info("Custom claims ('master') set for hardcoded user:", newUserId);
    } catch (error: any) {
      functions.logger.error("Error setting custom claims for hardcoded master user:", newUserId, error);
      await admin.auth().deleteUser(newUserId).catch((delErr) => functions.logger.error("Failed to cleanup hardcoded auth user after claims error", delErr));
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
        { uid: usuarioDoc.id, token: { email: usuarioDoc.email } },
        {
          action: "USUARIO_CREADO",
          targetId: usuarioDoc.id,
          targetCollection: "usuarios",
          details: { message: "Usuario creado desde Cloud Functions (hardcoded master)" },
        }
      );
      return { success: true, userId: newUserId, message: "Hardcoded master user created successfully. REMEMBER TO DELETE THIS FUNCTION!" };
    } catch (error: any) {
      functions.logger.error("Error writing hardcoded master Usuario to Firestore:", newUserId, error);
      await admin.auth().deleteUser(newUserId).catch((delErr) => functions.logger.error("Failed to cleanup hardcoded auth user after Firestore error", delErr));
      throw new HttpsError("internal", `Hardcoded master user Firestore write failed: ${error.message}`);
    }
  }
);
