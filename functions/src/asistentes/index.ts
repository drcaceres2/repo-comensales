import { db, FieldValue } from "../lib/firebase";
import {
  onCall,
  HttpsError,
} from "firebase-functions/v2/https";
import * as functions from "firebase-functions/v2";

import {
  UpdateMatrizAccesosPayloadSchema,
  AsignarAsistentePayloadSchema,
  RevocarAsistentePayloadSchema,
} from "../../../shared/schemas/usuariosAsistentes";
import { Usuario } from "../../../shared/schemas/usuarios";
import { getCallerSecurityInfo } from "../common/security";
import { logAction } from "../common/logging";

export const actualizarMatrizAccesos = onCall(
  {
    region: "us-central1",
    cors: ["http://localhost:3001", "http://127.0.0.1:3001"],
  },
  async (request) => {
    const callerInfo = await getCallerSecurityInfo(request.auth);
    if (!callerInfo.uid) {
      throw new HttpsError("unauthenticated", "Authentication required.");
    }

    const validationResult = UpdateMatrizAccesosPayloadSchema.safeParse(request.data);
    if (!validationResult.success) {
      throw new HttpsError("invalid-argument", "Payload validation failed", validationResult.error.flatten());
    }

    const { targetUserId, permisos } = validationResult.data;

    if (callerInfo.uid === targetUserId) {
      throw new HttpsError("failed-precondition", "No puedes modificarte los permisos de asistente a ti mismo.");
    }

    const updatePayload: { [key: string]: any } = {};
    for (const [key, value] of Object.entries(permisos)) {
      updatePayload[`asistente.${key}`] = value;
    }

    try {
      await db.collection("usuarios").doc(targetUserId).update(updatePayload);
      return { success: true, message: "Permisos de asistente actualizados." };
    } catch (error: any) {
      functions.logger.error("Error updating assistant permissions:", error);
      throw new HttpsError("internal", "Error al actualizar los permisos en la base de datos.");
    }
  }
);

export const asignarAsistenteProxy = onCall(
  {
    region: "us-central1",
    cors: ["http://localhost:3001", "http://127.0.0.1:3001"],
  },
  async (request) => {
    const callerInfo = await getCallerSecurityInfo(request.auth);
    if (!callerInfo.uid) {
      throw new HttpsError("unauthenticated", "Authentication required.");
    }

    const validationResult = AsignarAsistentePayloadSchema.safeParse(request.data);
    if (!validationResult.success) {
      throw new HttpsError("invalid-argument", "Payload validation failed", validationResult.error.flatten());
    }

    const { asistidoId, asistenteId, permisos } = validationResult.data;

    const asistidoDoc = await db.collection("usuarios").doc(asistidoId).get();
    if (!asistidoDoc.exists) {
      throw new HttpsError("not-found", `El usuario asistido con ID ${asistidoId} no fue encontrado.`);
    }

    const asistidoData = asistidoDoc.data() as Usuario;
    if (asistidoData.roles.includes("asistente")) {
      throw new HttpsError("failed-precondition", "No se puede asignar un asistente a otro asistente.");
    }
    if (!asistidoData.roles.includes("residente") && !asistidoData.roles.includes("invitado")) {
      throw new HttpsError("failed-precondition", "El usuario asistido debe tener el rol 'residente' o 'invitado'.");
    }

    const updatePayload = {
      [`asistente.usuariosAsistidos.${asistidoId}`]: permisos,
    };

    try {
      await db.collection("usuarios").doc(asistenteId).update(updatePayload);
      return { success: true, message: "Asistente proxy asignado correctamente." };
    } catch (error: any) {
      functions.logger.error("Error assigning proxy assistant:", error);
      throw new HttpsError("internal", "Error al asignar el asistente en la base de datos.");
    }
  }
);

export const revocarAsistenteProxy = onCall(
  {
    region: "us-central1",
    cors: ["http://localhost:3001", "http://127.0.0.1:3001"],
  },
  async (request) => {
    const callerInfo = await getCallerSecurityInfo(request.auth);

    const canRevoke = callerInfo.isMaster || callerInfo.isAdmin || callerInfo.profile?.roles.includes("director");
    if (!canRevoke) {
      throw new HttpsError("permission-denied", "No tienes los permisos necesarios para revocar asistentes.");
    }

    const validationResult = RevocarAsistentePayloadSchema.safeParse(request.data);
    if (!validationResult.success) {
      throw new HttpsError("invalid-argument", "Los datos proporcionados son inválidos.", validationResult.error.flatten());
    }

    const { asistidoId, asistenteId } = validationResult.data;

    try {
      const fieldPath = `asistente.usuariosAsistidos.${asistidoId}`;

      await db.collection("usuarios").doc(asistenteId).update({
        [fieldPath]: FieldValue.delete(),
      });

      await logAction(
        { uid: callerInfo.uid, token: callerInfo.claims },
        {
          action: "PERMISO_ASISTENTE_REVOCADO",
          targetId: asistenteId,
          targetCollection: "usuarios",
          residenciaId: callerInfo.profile?.residenciaId || undefined,
          details: {
            message: `Se revocó el permiso del asistente ${asistenteId} sobre el usuario ${asistidoId}.`,
            asistidoId: asistidoId,
          },
        }
      );

      return { success: true, message: "Permiso de asistente revocado correctamente." };
    } catch (error: any) {
      functions.logger.error("Error al revocar el permiso del asistente:", {
        asistenteId,
        asistidoId,
        error,
      });
      throw new HttpsError("internal", "Ocurrió un error en el servidor al intentar revocar el permiso.");
    }
  }
);
