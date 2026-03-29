import { db } from '@/lib/firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';
import { obtenerInfoUsuarioServer } from '@/lib/obtenerInfoUsuarioServer';
import { LogPayload } from '../models/types';

export const logServer = async (payload: LogPayload): Promise<void> => {
    try {
        const auth = await obtenerInfoUsuarioServer();
        const actorId = auth?.usuarioId || 'SYSTEM';
        const actorEmail = auth?.email || 'system@internal';

        const entry = {
            userId: actorId,
            userEmail: actorEmail,
            action: payload.action,
            targetId: payload.targetId || null,
            targetCollection: payload.targetCollection || null,
            residenciaId: payload.residenciaId || auth.residenciaId || null,
            details: payload.details || {},
            timestamp: FieldValue.serverTimestamp(),
            source: 'server-action'
        };

        await db.collection("logs").add(entry);
    } catch (error) {
        console.error(`[AUDIT ERROR] Falló log para ${payload.action}`, error);
    }
};

export function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  if (chunkSize <= 0) {
    throw new Error("chunkSize debe ser mayor a 0");
  }

  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }

  return chunks;
}
