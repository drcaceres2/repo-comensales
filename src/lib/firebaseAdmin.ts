import 'server-only'; // Asegura que esto nunca llegue al cliente
import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "comensales-residencia";
  
  admin.initializeApp({
    projectId: projectId,
  });
  
  if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    console.log(`>>> Firebase Admin SDK conectado a EMULADORES (Proyecto: ${projectId}, Host: ${process.env.FIRESTORE_EMULATOR_HOST})`);
  }
}

export const db = admin.firestore();
export const auth = admin.auth();
export const storage = admin.storage();
export { admin };
