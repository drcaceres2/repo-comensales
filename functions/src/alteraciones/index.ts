import { db, FieldValue } from "../lib/firebase";
import {
  onCall,
  HttpsError,
  CallableRequest,
} from "firebase-functions/v2/https";
import * as functions from "firebase-functions/v2";
import {
  createAlteracionSchema,
  CreateAlteracionPayload,
} from "../../../shared/schemas/alteraciones";
import { getCallerSecurityInfo } from "../common/security";

export const createAlteracionFn = onCall(
  {
    region: "us-central1",
    cors: ["http://localhost:3001", "http://127.0.0.1:3001"],
  },
  async (request: CallableRequest<CreateAlteracionPayload>) => {
    const callerInfo = await getCallerSecurityInfo(request.auth);

    let data: CreateAlteracionPayload;
    try {
      data = createAlteracionSchema.parse(request.data);
    } catch (error: any) {
      functions.logger.warn("Validation failed for createAlteracionFn", error);
      throw new HttpsError("invalid-argument", "Datos de alteración inválidos.");
    }

    const payload = data as CreateAlteracionPayload & {
      residenciaId: string;
      fechaInicio: string;
      fechaFin: string;
      alteraciones: Record<string, unknown>;
    };

    const colisionSnap = await db
      .collection("alteracionesHorario")
      .where("residenciaId", "==", payload.residenciaId)
      .where("estado", "in", ["propuesto", "comunicado"])
      .get();

    const newStart = payload.fechaInicio;
    const newEnd = payload.fechaFin;
    const nuevosTiempos = new Set(Object.keys(payload.alteraciones));

    for (const doc of colisionSnap.docs) {
      const existente = doc.data() as {
        fechaInicio?: string;
        fechaFin?: string;
        alteraciones?: Record<string, unknown>;
      };

      if (!existente.fechaInicio || !existente.fechaFin || !existente.alteraciones) {
        continue;
      }

      const haySuperposicionFechas =
        newStart <= existente.fechaFin && existente.fechaInicio <= newEnd;

      if (!haySuperposicionFechas) {
        continue;
      }

      const tiemposExistentes = new Set(Object.keys(existente.alteraciones));
      const hayInterseccion = [...nuevosTiempos].some((tiempoId) =>
        tiemposExistentes.has(tiempoId)
      );

      if (hayInterseccion) {
        throw new HttpsError(
          "already-exists",
          "Colisión de tiempos de comida en las fechas seleccionadas"
        );
      }
    }

    const docRef = await db.collection("alteracionesHorario").add({
      ...payload,
      estado: "propuesto",
      creadoPor: callerInfo.uid,
      timestampCreacion: FieldValue.serverTimestamp(),
      timestampActualizacion: FieldValue.serverTimestamp(),
    });

    return { id: docRef.id };
  }
);
