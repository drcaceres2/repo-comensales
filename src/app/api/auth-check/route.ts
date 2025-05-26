import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers'; // For accessing cookies in Route Handlers

const AUTH_CHECK_FUNCTION_URL = process.env.AUTH_CHECK_FUNCTION_URL;

export async function GET(request: NextRequest) {
  if (!AUTH_CHECK_FUNCTION_URL) {
    console.error('CRITICAL: AUTH_CHECK_FUNCTION_URL environment variable is not set.');
    return NextResponse.json(
      { authorized: false, reason: 'SERVER_CONFIG_ERROR', message: 'Error de configuración del servidor de autenticación.' },
      { status: 500 }
    );
  }

  // The 'path' query parameter is no longer read from the request or sent to the Firebase Function.
  // const originalPath = request.nextUrl.searchParams.get('path'); 
  // if (!originalPath) { ... }

  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('__session');

  // Construct the URL for the Firebase Function *without* the path query parameter.
  const targetUrl = new URL(AUTH_CHECK_FUNCTION_URL);
  // targetUrl.searchParams.set('path', originalPath); // Removed

  const fetchHeaders = new Headers();
  if (sessionCookie) {
    fetchHeaders.append('Cookie', `__session=${sessionCookie.value}`);
  }

  try {
    const functionResponse = await fetch(targetUrl.toString(), {
      method: 'GET',
      headers: fetchHeaders,
    });

    const data = await functionResponse.json();
    const response = NextResponse.json(data, { status: functionResponse.status });

    if (functionResponse.status === 401 && data.reason === 'INVALID_SESSION_COOKIE') {
        response.cookies.delete('__session');
    }

    return response;

  } catch (error: any) {
    console.error('Error calling (license check) Firebase Function:', error.message);
    // Updated error message to reflect it's primarily a license check now
    return NextResponse.json(
      { authorized: false, reason: 'LICENSE_FUNCTION_CALL_ERROR', message: 'No se pudo conectar con el servicio de verificación de licencia.' },
      { status: 503 }
    );
  }
}
