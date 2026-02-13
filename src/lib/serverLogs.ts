import { db } from './firebaseAdmin';
import { LogActionType } from '../../shared/models/types';
import * as admin from 'firebase-admin';

interface ServerLogOptions {
  targetId?: string | null;
  targetCollection?: string;
  residenciaId?: string;
  details?: Record<string, any>;
}

export async function logServerAction(
  userId: string,
  userEmail: string | undefined,
  action: LogActionType,
  options: ServerLogOptions = {}
): Promise<void> {
  try {
    const logData = {
      userId,
      userEmail: userEmail || null,
      action,
      targetId: options.targetId || null,
      targetCollection: options.targetCollection || null,
      residenciaId: options.residenciaId || null,
      details: options.details || {},
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      source: 'server-action',
    };

    await db.collection('logs').add(logData);
  } catch (error) {
    console.error('[Server Audit] Error writing log:', error);
  }
}
