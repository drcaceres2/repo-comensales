import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers'; // For accessing cookies in Route Handlers

// URL of your deployed checkAuthAndLicense Firebase Function
// It's crucial to set this environment variable in your Next.js deployment environment (e.g., Vercel)
// and in your .env.local for local development (pointing to the emulator URL if needed for direct API calls).
const AUTH_CHECK_FUNCTION_URL = process.env.AUTH_CHECK_FUNCTION_URL;

// This handler will be for GET requests, matching the design of checkAuthAndLicense
export async function GET(request: NextRequest) { // Removed params from here
  if (!AUTH_CHECK_FUNCTION_URL) {
    console.error('CRITICAL: AUTH_CHECK_FUNCTION_URL environment variable is not set.');
    return NextResponse.json(
      { authorized: false, reason: 'SERVER_CONFIG_ERROR', message: 'Error de configuración del servidor de autenticación.' },
      { status: 500 }
    );
  }

  // 1. Get the original requested path from the 'path' query parameter.
  // The path passed to the checkAuthAndLicense function should be the original frontend path the user is trying to access.
  // This API route is usually called by client-side logic (e.g., a wrapper around data fetching, or a client-side router hook)
  // The client should pass the path it wants to check as a query parameter.

  const originalPath = request.nextUrl.searchParams.get('path');

  if (!originalPath) {
    return NextResponse.json(
      { authorized: false, reason: 'MISSING_CLIENT_PATH', message: 'No se especificó la ruta del cliente para verificar.' },
      { status: 400 }
    );
  }

  // 2. Get the session cookie
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('__session'); // Ensure '__session' matches your cookie name

  // 3. Construct the URL for the Firebase Function, including the originalPath as a query parameter
  const targetUrl = new URL(AUTH_CHECK_FUNCTION_URL);
  targetUrl.searchParams.set('path', originalPath);

  // 4. Prepare headers for the fetch call to the Firebase Function
  const fetchHeaders = new Headers();
  if (sessionCookie) {
    fetchHeaders.append('Cookie', `__session=${sessionCookie.value}`);
  }
  // Forward other relevant headers if necessary, but Cookie is the most important here.

  try {
    // 5. Make the fetch call to the Firebase Function
    const functionResponse = await fetch(targetUrl.toString(), {
      method: 'GET',
      headers: fetchHeaders,
      // redirect: 'manual', // Important if the function itself sends redirects and you want to inspect them first
    });

    // 6. Get the JSON response from the Firebase Function
    const data = await functionResponse.json();

    // 7. Return the response from the Firebase Function (status and body)
    // We also need to handle setting cookies if the function cleared one (e.g. on invalid session)
    const response = NextResponse.json(data, { status: functionResponse.status });

    // Check if the Firebase function tried to clear the cookie (e.g., due to invalid session)
    // This is a bit indirect. A more robust way is if the functionResponse explicitly signals this.
    // For now, if the status indicates an issue that leads to cookie clearing in the function (e.g. 401 for INVALID_SESSION_COOKIE):
    if (functionResponse.status === 401 && data.reason === 'INVALID_SESSION_COOKIE') {
        // The Firebase function should have already sent `response.clearCookie` which sets headers.
        // However, those headers might not be directly proxied by `fetch`.
        // Instead, our Next.js API route needs to manage the cookie for *its* response to the client.
        // If the Firebase function indicates the session is invalid and should be cleared, this API route clears it.
        response.cookies.delete('__session');
    }

    return response;

  } catch (error: any) {
    console.error('Error calling auth check Firebase Function:', error.message);
    return NextResponse.json(
      { authorized: false, reason: 'AUTH_FUNCTION_CALL_ERROR', message: 'No se pudo conectar con el servicio de autenticación.' },
      { status: 503 } // Service Unavailable
    );
  }
}

// You can add POST, PUT, DELETE handlers if you intend this API route to do more than just check auth via GET.
// For now, only GET is implemented to match the checkAuthAndLicense Firebase function.
