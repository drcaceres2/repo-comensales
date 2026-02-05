import { NextResponse } from 'next/server';
import { auth } from '@/lib/firebaseAdmin';
import { cookies } from 'next/headers';

/**
 * Maneja el cierre de sesión del usuario.
 * Invalida la cookie de sesión y revoca los tokens de refresco del usuario.
 */
export async function POST() {
  const cookieStore = await cookies();
  const sessionCookieValue = cookieStore.get('__session')?.value;

  if (!sessionCookieValue) {
    // Si no hay cookie, no hay nada que hacer.
    return NextResponse.json({ success: true, message: 'No hay sesión activa.' }, { status: 200 });
  }

  try {
    // 1. Verificar la cookie para obtener el UID del usuario (sub).
    const decodedToken = await auth.verifySessionCookie(sessionCookieValue, true);

    // 2. Revocar todos los tokens de refresco para ese usuario.
    await auth.revokeRefreshTokens(decodedToken.sub);

    // 3. Crear la respuesta y limpiar la cookie del cliente.
    const response = NextResponse.json({ success: true, message: 'Cierre de sesión exitoso.' });
    response.cookies.set('__session', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 0,
      path: '/',
      sameSite: 'strict',
    });

    return response;

  } catch (error) {
    console.error('Error en API de logout:', error);
    // Aunque haya un error (ej. la cookie ya era inválida), debemos asegurarnos
    // de que la cookie se elimine del cliente.
    const response = NextResponse.json({
        success: true, // Se considera éxito desde la perspectiva del cliente
        message: 'La sesión se cerró, aunque hubo un problema al invalidar el token en el servidor.'
    }, { status: 200 });

    response.cookies.set('__session', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 0,
      path: '/',
      sameSite: 'strict',
    });

    return response;
  }
}
