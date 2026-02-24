import { NextResponse } from 'next/server';
import { auth } from '@/lib/firebaseAdmin';
import { cookies } from 'next/headers';

/**
 * Maneja la creación de la cookie de sesión para el login y refresco.
 * El cliente debe enviar un token de ID de Firebase en el encabezado de autorización.
 * Ejemplo: Authorization: Bearer <ID_TOKEN>
 */
export async function POST(request: Request) {
  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) {
      return NextResponse.json({ message: 'Token de autorización no proporcionado o mal formado.' }, { status: 401 });
    }

    const idToken = authorization.split('Bearer ')[1];
    if (!idToken) {
      return NextResponse.json({ message: 'El token de ID está vacío.' }, { status: 401 });
    }

    // El token de ID de Firebase tiene una vida corta (1 hora).
    // Lo verificamos y lo usamos para crear una cookie de sesión más duradera.
    const expiresIn = 60 * 60 * 24 * 5 * 1000; // 5 días en milisegundos
    
    // En desarrollo (emuladores), evitamos checkRevoked para evitar errores de red y lag.
    const checkRevoked = process.env.NODE_ENV === 'production';
    const decodedToken = await auth.verifyIdToken(idToken, checkRevoked);
    
    // Solo permitir que usuarios activos creen una sesión, usando nuestra reclamación personalizada.
    if (decodedToken.isActive === false) {
      return NextResponse.json({ message: 'La cuenta de usuario ha sido deshabilitada.' }, { status: 403 });
    }

    const sessionCookie = await auth.createSessionCookie(idToken, { expiresIn });

    // Configurar la cookie de sesión en el navegador del cliente.
    // httpOnly: La cookie no es accesible por JavaScript del lado del cliente.
    // secure: Solo se envía en solicitudes HTTPS.
    // sameSite: 'Strict' o 'Lax' para protección CSRF.
    const response = NextResponse.json({ success: true, message: 'Inicio de sesión exitoso.' });

    response.cookies.set('__session', sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: expiresIn / 1000, // maxAge está en segundos
      path: '/',
      sameSite: 'strict',
    });

    return response;

  } catch (error: any) {
    console.error('Error en API de login:', error);
    const errorMessage = error?.code === 'auth/id-token-expired'
      ? 'El token de ID ha expirado. Por favor, inicie sesión de nuevo.'
      : 'Error interno del servidor al procesar la solicitud.';
    
    return NextResponse.json({ success: false, message: errorMessage }, { status: 401 });
  }
}
