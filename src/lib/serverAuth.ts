import 'server-only';
import { cookies } from 'next/headers';
import { auth, db } from './firebaseAdmin';

export interface ServerAuthContext {
  uid: string;
  email: string;
  roles: string[];
  residenciaId: string;
}

/**
 * Valida la sesión y recupera el contexto del usuario.
 * Sigue el principio Fail-Close: lanza error s i hay cualquier anomalía.
 */
export async function requireAuth(): Promise<ServerAuthContext> {
  const cookieStore = cookies();
  const sessionCookie = (await cookieStore).get('__session')?.value;

  if (!sessionCookie) {
    throw new Error('UNAUTHORIZED: No session cookie found');
  }

  try {
    // 1. Validar la firma criptográfica de la cookie de Firebase
    const decodedClaims = await auth.verifySessionCookie(sessionCookie, true);
    const uid = decodedClaims.uid;

    // 2. Obtener la metadata del usuario (residenciaId, roles)
    // Opción A: Si usaste Custom Claims al momento de loguear (¡Cero lecturas a BD! Recomendado)
    if (decodedClaims.residenciaId) {
       return {
         uid,
         email: decodedClaims.email || '',
         roles: decodedClaims.roles || [],
         residenciaId: decodedClaims.residenciaId as string,
       };
    }

    // Opción B: Si no tienes Custom Claims, leemos el perfil de Firestore (Cuesta 1 lectura)
    const userDoc = await db.collection('usuarios').doc(uid).get();
    if (!userDoc.exists) {
      throw new Error('FORBIDDEN: User profile not found');
    }

    const userData = userDoc.data();
    if (!userData?.isActive || !userData?.residenciaId) {
      throw new Error('FORBIDDEN: User inactive or no residence assigned');
    }

    return {
      uid,
      email: userData.email,
      roles: userData.roles || [],
      residenciaId: userData.residenciaId,
    };

  } catch (error) {
    console.error('Server Auth Error:', error);
    // No filtramos el error real al cliente por seguridad
    throw new Error('UNAUTHORIZED: Invalid or expired session');
  }
}