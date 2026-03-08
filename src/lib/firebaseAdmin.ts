import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldPath, FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';

const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

if (!getApps().length) {
  initializeApp(projectId ? { projectId } : undefined);

  if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    console.log(
      `>>> Firebase Admin SDK conectado a EMULADORES (Proyecto: ${projectId}, Host: ${process.env.FIRESTORE_EMULATOR_HOST})`
    );
  }
}

export const db = getFirestore();
export const auth = getAuth();
export { FieldPath, FieldValue, Timestamp };
