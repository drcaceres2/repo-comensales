// src/middleware.ts
export const runtime = 'nodejs'; // Force Node.js runtime

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth'; // DecodedIdToken removed if only used in main middleware func
import { getFirestore } from 'firebase-admin/firestore';

let adminApp: App;

function getIsEmulated(): boolean {
  // Access process.env only inside this function
  return !!(process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST);
}

if (!getApps().length) {
    const isEmulated = getIsEmulated(); // Call the function here
    if (isEmulated) {
        console.log("Middleware: Initializing Firebase Admin SDK for EMULATORS.");
        adminApp = initializeApp({ projectId: 'comensales-residencia' });
    } else {
        console.log("Middleware: Initializing Firebase Admin SDK for PRODUCTION/LIVE.");
        const serviceAccountKeyJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY; 
        if (!serviceAccountKeyJson) {
            throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY environment variable is not set for production.");
        }
        const serviceAccount = JSON.parse(serviceAccountKeyJson);
        adminApp = initializeApp({
            credential: cert(serviceAccount),
        });
    }
} else {
    adminApp = getApps()[0];
}

const adminAuth = getAuth(adminApp);
const adminDb = getFirestore(adminApp);

// --- Original code below ----
import type { DecodedIdToken } from 'firebase-admin/auth';

// Define your license details result type (mirroring getLicenseDetails function's return)
interface LicenseDetailsResult {
    status: "valid" | "not_found" | "not_active" | "expired" | "invalid_token" | "error_reading_file";
    residenciaId?: string; // ResidenciaId from within the license file
    licenciaValidaHasta?: string;
    licenciaActiva?: boolean;
    cantidadUsuarios?: number;
    tokenLicencia?: string;
}

// Configuration for paths and roles
const PATH_CONFIG: Record<string, { allowedRoles: string[], masterOnly?: boolean, requiresResidenciaInPath?: boolean }> = {
    '/restringido-master': { allowedRoles: ['master'], masterOnly: true, requiresResidenciaInPath: false },
    '/admin': { allowedRoles: ['admin', 'master'], masterOnly: false, requiresResidenciaInPath: false }, 
    '/admin/users': { allowedRoles: ['admin', 'master'], masterOnly: false, requiresResidenciaInPath: false },
    '/feedback': { allowedRoles: ['user', 'admin', 'master', 'residente'], masterOnly: false, requiresResidenciaInPath: false },
    '/mi-perfil': { allowedRoles: ['user', 'admin', 'master', 'residente'], masterOnly: false, requiresResidenciaInPath: false },
};

function getPathConfigForRequest(pathname: string) {
    if (PATH_CONFIG[pathname]) {
        return PATH_CONFIG[pathname];
    }
    const segments = pathname.split('/').filter(Boolean);
    if (segments.length > 0) {
        const prefixBasedPath = `/${segments[0]}`;
        if (PATH_CONFIG[prefixBasedPath] && (PATH_CONFIG[prefixBasedPath].masterOnly || prefixBasedPath === '/admin')) {
            return { ...PATH_CONFIG[prefixBasedPath], requiresResidenciaInPath: PATH_CONFIG[prefixBasedPath].requiresResidenciaInPath || false };
        }
    }
    if (segments.length > 1 && 
        !['api', '_next', 'assets', 'favicon.ico', 'acceso-no-autorizado'].includes(segments[0]) && 
        !PATH_CONFIG[`/${segments[0]}`]
    ) {
        return { allowedRoles: ['user', 'admin', 'master', 'residente'], masterOnly: false, requiresResidenciaInPath: true };
    }
    return null;
}

async function getLicenseDetailsFromFunction(residenciaId: string): Promise<LicenseDetailsResult> {
    console.log(`Middleware: Attempting to get license details for Residencia ID: ${residenciaId}`);
    console.warn(`CRITICAL: getLicenseDetailsFromFunction in middleware is a MOCK for Residencia ID: ${residenciaId}. Implement actual GCS logic or HTTP call.`);
    if (residenciaId === "RESIDENCIA_VALIDA_DEMO") { 
        return {
            status: "valid",
            residenciaId: "RESIDENCIA_VALIDA_DEMO",
            licenciaActiva: true,
            licenciaValidaHasta: new Date(Date.now() + 86400000 * 30).toISOString(),
            cantidadUsuarios: 100
        };
    }
    return { status: 'not_found', residenciaId: residenciaId };
}

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;
    const pathConfig = getPathConfigForRequest(pathname);

    if (!pathConfig || pathname.startsWith('/_next') || pathname.startsWith('/api/auth/')) { 
        return NextResponse.next();
    }
    if (pathname === '/acceso-no-autorizado') {
        return NextResponse.next();
    }

    const sessionCookie = request.cookies.get('__session')?.value;
    if (!sessionCookie) {
        const message = encodeURIComponent('No se encontró sesión. Por favor, inicia sesión.');
        return NextResponse.redirect(new URL(`/acceso-no-autorizado?mensaje=${message}`, request.url));
    }

    let decodedClaims: DecodedIdToken;
    try {
        decodedClaims = await adminAuth.verifySessionCookie(sessionCookie, true); 
    } catch (error: any) {
        console.warn(`Middleware: Invalid or expired session cookie for path ${pathname}. Error: ${error.code || error.message}`);
        let message = 'Tu sesión ha expirado o es inválida. Por favor, inicia sesión de nuevo.';
        if (error.code === 'auth/session-cookie-revoked') {
            message = 'Tu sesión ha sido cerrada. Por favor, inicia sesión de nuevo.';
        }
        const redirectUrl = new URL(`/acceso-no-autorizado?mensaje=${encodeURIComponent(message)}`, request.url);
        const response = NextResponse.redirect(redirectUrl);
        response.cookies.set('__session', '', { maxAge: 0, path: '/' }); 
        return response;
    }

    const userRoles = (decodedClaims.roles as string[]) || [];
    const userResidenciaIdFromClaims = decodedClaims.residenciaId as string | undefined;

    const hasRequiredRole = userRoles.some(role => pathConfig.allowedRoles.includes(role));
    if (!hasRequiredRole) {
        const message = encodeURIComponent(`No tienes el rol adecuado (${userRoles.join(', ')}) para acceder a esta página (${pathname}). Roles permitidos: ${pathConfig.allowedRoles.join(', ')}.`);
        return NextResponse.redirect(new URL(`/acceso-no-autorizado?mensaje=${message}`, request.url));
    }

    if (userRoles.includes('master')) {
        try {
            const userProfileDoc = await adminDb.collection('UserProfiles').doc(decodedClaims.uid).get();
            if (!userProfileDoc.exists || !(userProfileDoc.data()?.roles as string[] || []).includes('master')) {
                const message = encodeURIComponent('Verificación de Master fallida. Contacta al administrador.');
                return NextResponse.redirect(new URL(`/acceso-no-autorizado?mensaje=${message}`, request.url));
            }
            console.log(`Middleware: Master user ${decodedClaims.uid} validated for path ${pathname}.`);
            return NextResponse.next();
        } catch (dbError) {
            console.error("Middleware: Firestore error during master validation:", dbError);
            const message = encodeURIComponent('Error validando perfil de Master.');
            return NextResponse.redirect(new URL(`/acceso-no-autorizado?mensaje=${message}`, request.url));
        }
    }

    if (pathConfig.masterOnly) {
        const message = encodeURIComponent('Esta sección es exclusiva para administradores Master.');
        return NextResponse.redirect(new URL(`/acceso-no-autorizado?mensaje=${message}`, request.url));
    }

    if (!userResidenciaIdFromClaims) {
        const message = encodeURIComponent('No se pudo determinar tu Residencia asignada. Contacta al soporte.');
        return NextResponse.redirect(new URL(`/acceso-no-autorizado?mensaje=${message}`, request.url));
    }

    const licenseDetails = await getLicenseDetailsFromFunction(userResidenciaIdFromClaims);

    if (licenseDetails.status !== 'valid') {
        let specificMessage = 'La licencia de tu residencia tiene un problema.';
        if (licenseDetails.status === 'not_found') specificMessage = `No se encontró licencia para tu residencia (${userResidenciaIdFromClaims}).`;
        else if (licenseDetails.status === 'expired') specificMessage = `La licencia de tu residencia (${userResidenciaIdFromClaims}) ha expirado.`;
        else if (licenseDetails.status === 'not_active') specificMessage = `La licencia de tu residencia (${userResidenciaIdFromClaims}) no está activa.`;
        else if (licenseDetails.status === 'invalid_token') specificMessage = `La licencia de tu residencia (${userResidenciaIdFromClaims}) es inválida (token/contenido).`;
        else if (licenseDetails.status === 'error_reading_file') specificMessage = `Error al verificar la licencia de tu residencia (${userResidenciaIdFromClaims}).`;
        
        const message = encodeURIComponent(specificMessage);
        return NextResponse.redirect(new URL(`/acceso-no-autorizado?mensaje=${message}`, request.url));
    }

    let residenciaIdFromUrl: string | undefined;
    if (pathConfig.requiresResidenciaInPath) {
        const pathSegments = pathname.split('/').filter(Boolean);
        if (pathSegments.length > 0) {
            residenciaIdFromUrl = pathSegments[0]; 
        }
        if (!residenciaIdFromUrl) {
             const message = encodeURIComponent('Esta página requiere una Residencia en la URL, pero no se encontró.');
             return NextResponse.redirect(new URL(`/acceso-no-autorizado?mensaje=${message}`, request.url));
        }
    }

    if (residenciaIdFromUrl && residenciaIdFromUrl !== userResidenciaIdFromClaims) {
        const message = encodeURIComponent(`Conflicto de acceso: Intentas acceder a ${residenciaIdFromUrl} pero tu sesión es para ${userResidenciaIdFromClaims}.`);
        return NextResponse.redirect(new URL(`/acceso-no-autorizado?mensaje=${message}`, request.url));
    }
    if (licenseDetails.residenciaId !== userResidenciaIdFromClaims) {
        const message = encodeURIComponent(`Conflicto interno de licencia: La licencia para ${userResidenciaIdFromClaims} reporta un ID interno de ${licenseDetails.residenciaId}.`);
        return NextResponse.redirect(new URL(`/acceso-no-autorizado?mensaje=${message}`, request.url));
    }

    console.log(`Middleware: User ${decodedClaims.uid} (Residencia: ${userResidenciaIdFromClaims}) validated for path ${pathname}.`);
    return NextResponse.next();
}

export const config = {
    matcher: [
        '/((?!api/public|_next/static|_next/image|assets|favicon.ico|manifest.json|.*\.png$|.*\.svg$|.*\.webmanifest$).*)',
    ],
};
