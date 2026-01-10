import 'server-only'; // Asegura que esto nunca llegue al cliente
import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    // El Admin SDK detecta automáticamente FIRESTORE_EMULATOR_HOST del .env
  });
}

export const db = admin.firestore();
export const auth = admin.auth();
export const storage = admin.storage();
export { admin };
