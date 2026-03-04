import { onCall, CallableRequest } from "firebase-functions/v2/https";
import { db, FieldValue } from "../lib/firebase";
import { LogPayload } from "../../../shared/models/types";

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
  authContext: { uid: string; token?: { email?: string; [key: string]: any } } | undefined | null,
  payload: LogPayload
): Promise<void> => {
  const actorId = authContext?.uid || "SYSTEM";
  const actorEmail = authContext?.token?.email || "system@internal";

  const entry = {
    userId: actorId,
    userEmail: actorEmail,
    action: payload.action,
    targetId: payload.targetId || null,
    targetCollection: payload.targetCollection || null,
    residenciaId: payload.residenciaId || null,
    details: payload.details || {},
    timestamp: FieldValue.serverTimestamp(),
    source: "cloud-function",
  };

  try {
    await db.collection("logs").add(entry);
  } catch (error) {
    console.error(`[AUDIT ERROR] Falló log para ${payload.action}`, error);
  }
};
