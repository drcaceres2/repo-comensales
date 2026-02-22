import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { auth } from './lib/firebaseAdmin';

// 1. Filtro Técnico: Rutas a ignorar por el middleware
const technicalRoutes = [
  '/manifest.json',
  '/favicon.ico',
  '/locales/',
  // Las imágenes y otros assets estáticos suelen estar en /public o servidos a través de _next/static
  // Next.js ya es eficiente en esto, pero una regla explícita no hace daño.
];

// 2. Filtro Público: Rutas de acceso libre, sin necesidad de autenticación
const publicRoutes = [
  '/', // La home page es también la login page
  '/about',
  '/feedback',
  '/privacidad',
  '/acceso-no-autorizado',
  '/licencia-vencida',
  // --------------------------------------------------------------------
  //  ADVERTENCIA: CÓDIGO PELIGROSO EN PRODUCCIÓN - SOLO PARA DESARROLLO
  // --------------------------------------------------------------------
  '/crear-master' // PARA DESARROLLO: Esta ruta es solo para crear el primer usuario master. Debe ser eliminada o protegida en producción.
];

// Rutas que requieren un rol de 'master'
const masterRoutesPrefix = ['/restringido-master', '/admin'];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Aplicar Filtro Técnico
  if (technicalRoutes.some(path => pathname.endsWith(path))) {
    return NextResponse.next();
  }

  // Aplicar Filtro de Rutas Públicas
  if (publicRoutes.includes(pathname)) {
    return NextResponse.next();
  }

  // 3. Validación de Sesión (Global)
  const sessionCookie = request.cookies.get('__session')?.value;

  if (!sessionCookie) {
    // Si no hay cookie, redirigir a la página de login (//)
    return NextResponse.redirect(new URL('/', request.url));
  }

  let decodedToken;
  try {
    // Verificar la cookie de sesión con Firebase Admin
    decodedToken = await auth.verifySessionCookie(sessionCookie, true);
  } catch (error) {
    console.error('Error al verificar la cookie de sesión:', error);
    // Si la cookie es inválida (expirada, malformada, etc.), redirigir a login
    const response = NextResponse.redirect(new URL('/', request.url));
    // Limpiar la cookie inválida del navegador del cliente
    response.cookies.delete('__session');
    return response;
  }

  // Si no hay token decodificado por alguna razón, tratar como no autenticado
  if (!decodedToken) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  // >>> NUEVO: Verificar si el usuario está activo a través de la reclamación en la cookie.
  // Esta es la defensa principal contra usuarios deshabilitados con sesiones activas.
  if (decodedToken.isActive === false) {
    const response = NextResponse.redirect(new URL('/', request.url));
    response.cookies.delete('__session');
    console.log(`Middleware: Usuario inactivo (UID: ${decodedToken.uid}) intentó acceder. Cerrando sesión.`);
    return response;
  }

  // 4. Bifurcación de Lógica
  const isMasterRoute = masterRoutesPrefix.some(prefix => pathname.startsWith(prefix));
  const userRoles: string[] = decodedToken.roles || [];

  // --- Caso 1: Es Ruta Global para 'master' y/o 'admin' ---
  if (isMasterRoute) {
    const isAdminRoute = pathname.startsWith('/admin');
    const isStrictlyMasterRoute = pathname.startsWith('/restringido-master');

    if (isStrictlyMasterRoute) {
      // Solo 'master' puede acceder a /restringido-master
      if (!userRoles.includes('master')) {
        return NextResponse.redirect(new URL('/acceso-no-autorizado', request.url));
      }
    } else if (isAdminRoute) {
      // 'master' o 'admin' pueden acceder a /admin
      const isAuthorized = userRoles.includes('master') || userRoles.includes('admin');
      if (!isAuthorized) {
        return NextResponse.redirect(new URL('/acceso-no-autorizado', request.url));
      }
    }
    
    // Si pasa las validaciones específicas, permitir acceso.
    return NextResponse.next();
  }

  // --- Caso 2: Es Ruta de Residencia ---
  // Extraer el residenciaId del primer segmento de la URL.
  // Ej: /res-abc/dashboard -> ["res-abc", "dashboard"] -> "res-abc"
  const pathSegments = pathname.split('/').filter(Boolean);
  if (pathSegments.length > 0) {
    const urlResidenciaId = pathSegments[0];
    const tokenResidenciaId = decodedToken.residenciaId;

    // Verificar si el usuario tiene acceso a esta residencia
    if (!tokenResidenciaId || urlResidenciaId !== tokenResidenciaId) {
      // Si el usuario intenta acceder a una residencia incorrecta,
      // o no tiene un residenciaId en su token, redirigir a la correcta si la tiene.
      // Si no tiene `tokenResidenciaId`, se le redirige a una página de error genérica.
      const destination = tokenResidenciaId ? `/${tokenResidenciaId}/elegir-comidas` : '/acceso-no-autorizado';
      return NextResponse.redirect(new URL(destination, request.url));
    }
  } else {
    // Esto podría pasar si se accede a una ruta no pública y no master sin segmentos,
    // ej: /alguna-ruta-rara. Redirigir a un lugar seguro.
    const destination = decodedToken.residenciaId ? `/${decodedToken.residenciaId}/elegir-comidas` : '/';
     return NextResponse.redirect(new URL(destination, request.url));
  }


  // Si todas las validaciones pasan, continuar con la solicitud.
  return NextResponse.next();
}

// El matcher define en qué rutas se ejecutará este middleware.
// Se excluyen las rutas de API, las de generación estática de Next.js y los archivos públicos.
export const config = {
  matcher: [
    '/((?!api|locales|_next/static|_next/image|.*\\.png$|.*\\.ico$|.*\\.svg$).*)',
  ],
};
