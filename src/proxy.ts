import { NextRequest, NextResponse } from 'next/server';
import { authMiddleware } from 'next-firebase-auth-edge';

function urlAccesoNoAutorizado(mensaje?: string): string {
  return mensaje ? `/acceso-no-autorizado?mensaje=${encodeURIComponent(mensaje)}` : '/acceso-no-autorizado';
}

// Matcher: Define las rutas donde se ejecutará el middleware.
export const config = {
  matcher: [
    // Ejecuta el middleware en todas las rutas de páginas, excluyendo assets, metadatos y la mayoría de rutas de API.
    '/((?!api|locales|_next/static|_next/image|manifest.json|\\.well-known|.*\\.png$|.*\\.ico$|.*\\.svg$).*)',
    // Incluimos explícitamente las rutas de autenticación para que `authMiddleware` pueda
    // interceptar el login/logout y gestionar la cookie de sesión.
    '/api/auth/login',
    '/api/auth/logout',
  ],
};

// Filtros de rutas
const rutasPublicas = ['/about', '/privacidad', '/acceso-no-autorizado', '/licencia-vencida', '/crear-master', '/invitacion/finalizar'];
const rutasHibridas = ['/', '/feedback'];
const rutasAutenticadasNoResidencia = ['/mi-perfil'];
const rutasMaster = ['/restringido-master'];
const rutasAdminRaiz = ['/admin', '/admin/users'];
const rutasAdminResidencia = ['/admin/invitacionesUsuarios'];
const rutasGestionConMatriz = ['/admin/comedores', '/gerencia/recordatorios', '/admin/horarios'];


// Configuración de next-firebase-auth-edge
const authConfig = {
  loginPath: '/api/auth/login',
  logoutPath: '/api/auth/logout',
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  serviceAccount: {
    projectId: process.env.FIREBASE_PROJECT_ID!,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
    privateKey: process.env.FIREBASE_PRIVATE_KEY!,
  },
  cookieName: 'comensales-auth',
  cookieSignatureKeys: [process.env.AUTH_COOKIE_SIGNATURE_KEY!],
  cookieSerializeOptions: {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 12 * 60 * 60 * 24, // 12 días
  },
};

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Evita header spoofing: solo `handleValidToken` puede inyectar estas cabeceras internas.
  for (const headerName of Array.from(request.headers.keys())) {
    const lowerHeaderName = headerName.toLowerCase();
    if (lowerHeaderName.startsWith('x-usuario-') || lowerHeaderName.startsWith('x-residencia-')) {
      request.headers.delete(headerName);
    }
  }

  const redirectTo = (path: string, clearCookie = false) => {
    const targetUrl = new URL(path, request.url);
    const currentPathWithSearch = `${request.nextUrl.pathname}${request.nextUrl.search}`;
    const targetPathWithSearch = `${targetUrl.pathname}${targetUrl.search}`;

    if (currentPathWithSearch === targetPathWithSearch) {
      console.log("Middleware: Redirigiendo al mismo luga...");
      return NextResponse.next();
    }

    const response = NextResponse.redirect(targetUrl);
    if (clearCookie) {
      console.log("Middleware: Borrando cookie de autenticación...")
      response.cookies.delete(authConfig.cookieName);
    }
    console.log(`Middleware: redirigiendo a ${response.url}`);
    return response;
  };

  console.log(`Middleware TEMPORAL.\nRuta: "${pathname}";\n URL: "${request.url}"`);

  return authMiddleware(request, {
    ...authConfig,
    handleValidToken: async ({ decodedToken }) => {
      // This is called when the token is valid and not expired.
      // We can still have custom logic to invalidate a session.
      if (decodedToken.isActive === false) {
        console.log(`Middleware: Inactive user (UID: ${decodedToken.uid}) tried to access.`);
        return redirectTo('/', true);
      }

      const requestHeaders = new Headers(request.headers);
      const userRoles = (decodedToken.roles as string[]) || [];

      requestHeaders.set('x-usuario-id', decodedToken.uid as string || '');
      requestHeaders.set('x-usuario-email', decodedToken.email as string || '');
      requestHeaders.set('x-usuario-roles', JSON.stringify(userRoles));
      requestHeaders.set('x-residencia-id', (decodedToken.residenciaId as string) || '');
      requestHeaders.set('x-residencia-zh', (decodedToken.zonaHoraria as string) || '');
      requestHeaders.set('x-residencia-ct', (decodedToken.ctxTraduccion as string) || 'es');

      const responseWithHeaders = NextResponse.next({
        request: { headers: requestHeaders },
      });

      // Master routes: only 'master' role
      if (rutasMaster.some(p => pathname.startsWith(p))) {
        if (!userRoles.includes('master')) {
          console.log("Middleware: Ruta restringida para 'master', redirigiendo a 'acceso-no-autorizado'")
          return redirectTo(urlAccesoNoAutorizado("Tu perfil de usuario no tiene acceso a esta sección exclusiva para 'master'."));
        }
        console.log("Middleware: Ruta master permitida");
        return responseWithHeaders;
      }

      // Admin root routes: 'master' or 'admin' role
      if (rutasAdminRaiz.includes(pathname)) {
        if (!userRoles.includes('master') && !userRoles.includes('admin')) {
          console.log("Middleware: Ruta restringida para 'admin' (raíz), redirigiendo a 'acceso-no-autorizado'")
          return redirectTo(urlAccesoNoAutorizado(
              "Tu perfil de usuario no tiene acceso a esta sección restringida para usuarios administradores."));
        }
        console.log("Middleware: Ruta admin permitida");
        return responseWithHeaders;
      }
      
      // Check for other non-residence routes that don't need special role checks
      const otherNonResidenciaRoutes = [
        ...rutasPublicas,
        ...rutasHibridas,
        ...rutasAutenticadasNoResidencia,
      ];
      if (otherNonResidenciaRoutes.includes(pathname)) {
        console.log(`Middleware: Ruta raíz permitida ${pathname}`);
        return responseWithHeaders;
      }

      // If we are here, it's a residence route.
      // All remaining routes are considered residence routes.

      // Matrix-managed routes: allow roles that are further filtered by server-side permission helpers.
      if (rutasGestionConMatriz.some(r => pathname.endsWith(r))) {
        const rolesPermitidos = userRoles.includes('admin') || userRoles.includes('director') || userRoles.includes('asistente');
        if (!rolesPermitidos) {
          console.log("Middleware: Ruta restringida para roles de gestion, redirigiendo a 'acceso-no-autorizado'")
          return redirectTo(urlAccesoNoAutorizado("Ruta restringida a usuarios directores o asistentes."));
        }
      }

      // Admin residence routes: strict 'admin' role
      if (rutasAdminResidencia.some(r => pathname.endsWith(r))) {
        if (!userRoles.includes('admin')) {
          console.log("Middleware: Ruta restringida para 'admin' (residencia), redirigiendo a 'acceso-no-autorizado'")
          return redirectTo(urlAccesoNoAutorizado(
              "Tu perfil de usuario no tiene acceso a esta sección restringida para usuarios administradores."));
        }
      }

      // For all residence routes, check if the residenceId in the path matches the token
      const residenciaIdFromPath = pathname.split('/')[1];
      if (residenciaIdFromPath !== decodedToken.residenciaId) {
        console.log("Middleware: prop no coincide con claim de token");
        return redirectTo('/', true);
      }

      return responseWithHeaders;
    },

    handleInvalidToken: async () => {
      // Token is invalid (expired, malformed, etc.)
      // Allow access to public and hybrid routes
      if (rutasPublicas.includes(pathname) || rutasHibridas.includes(pathname)) {
        return NextResponse.next();
      }
      // For all other routes, redirect to home. The cookie is already invalid.
      return redirectTo('/');
    },

    handleError: async (error: any) => {
      console.error('Middleware Error:', error);
      // On error, redirect to home and clear cookie just in case
      return redirectTo('/', true);
    },
  });
}
