import { db } from "../lib/firebase";
import {
  onCall,
  HttpsError,
  CallableRequest,
} from "firebase-functions/v2/https";
import * as functions from "firebase-functions/v2";

import {
  type DatosHorariosEnBruto,
  DatosHorariosEnBrutoSchema,
} from "../../../shared/schemas/horarios";
import { ConfiguracionResidencia } from "../../../shared/schemas/residencia";
import { getCallerSecurityInfo } from "../common/security";
import { logAction } from "../common/logging";

interface GuardarHorariosDataPayload {
  residenciaId: string;
  expectedVersion: number;
  datos: DatosHorariosEnBruto;
}

export const guardarHorariosResidencia = onCall(
  {
    region: "us-central1",
    cors: ["http://localhost:3001", "http://127.0.0.1:3001"],
    timeoutSeconds: 300,
  },
  async (request: CallableRequest<GuardarHorariosDataPayload>) => {
    const callerInfo = await getCallerSecurityInfo(request.auth);
    const { residenciaId, expectedVersion, datos } = request.data;

    functions.logger.info(`guardarHorariosResidencia called by: ${callerInfo.uid} for residencia: ${residenciaId}`);

    if (!callerInfo.isMaster && !callerInfo.isAdmin) {
      throw new HttpsError("permission-denied", "Only 'master' or 'admin' users can perform this action.");
    }
    if (callerInfo.isAdmin && callerInfo.profile?.residenciaId !== residenciaId) {
      throw new HttpsError("permission-denied", "Admin users can only modify their own Residencia.");
    }

    if (!residenciaId || typeof expectedVersion !== "number" || !datos) {
      throw new HttpsError("invalid-argument", "residenciaId, expectedVersion, and datos are required.");
    }

    const validationResult = DatosHorariosEnBrutoSchema.safeParse(datos);
    if (!validationResult.success) {
      const zodErrors = validationResult.error.flatten();
      const errorMessages = Object.entries(zodErrors.fieldErrors).map(([field, messages]) => `${field}: ${messages.join(", ")}`);
      const errorMessage = `Validation failed: ${errorMessages.join("; ")}`;
      functions.logger.warn("Validation failed for guardarHorariosResidencia:", errorMessage);
      throw new HttpsError("invalid-argument", "Error de validación de datos.", {
        validationError: true,
        message: errorMessage,
      });
    }

    const validatedData = validationResult.data;
    const configRef = db.collection("residencias").doc(residenciaId).collection("configuracion").doc("general");

    try {
      const newVersion = await db.runTransaction(async (transaction) => {
        const configDoc = await transaction.get(configRef);

        if (!configDoc.exists) {
          throw new HttpsError("not-found", "Configuration document not found.");
        }

        const currentVersion = configDoc.exists ? (configDoc.data() as ConfiguracionResidencia).version : 0;

        if (currentVersion !== expectedVersion) {
          throw new HttpsError("failed-precondition", "El documento fue modificado por otro usuario. Recarga la página.");
        }

        const nextVersion = currentVersion + 1;

        const updateData = {
          ...validatedData,
          version: nextVersion,
        };

        transaction.update(configRef, updateData);
        return nextVersion;
      });

      await logAction(
        { uid: callerInfo.uid, token: callerInfo.claims },
        {
          action: "CARGA_MASIVA_HORARIOS",
          targetId: "general",
          targetCollection: "configuracion",
          residenciaId: residenciaId,
          details: { message: `Horarios actualizados a versión ${newVersion}` },
        }
      );

      return { success: true, newVersion: newVersion, message: "Horarios guardados correctamente." };
    } catch (error: any) {
      functions.logger.error("Error in guardarHorariosResidencia transaction:", residenciaId, error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError("internal", `Error al guardar los horarios: ${error.message}`);
    }
  }
);
