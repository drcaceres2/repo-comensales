// src/middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth, DecodedIdToken } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
// import { getStorage } from 'firebase-admin/storage'; // Uncomment if using direct GCS access in getLicenseDetails

// --- Firebase Admin Initialization ---
// Ensure your service account key JSON file is correctly referenced.
// IMPORTANT: Store your service account key securely and DO NOT commit it to your repository.
// Use environment variables for production.
const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)
    : require('../../../serviceAccountKey.json'); // Adjust path as needed for local dev

if (!getApps().length) {
    initializeApp({
        credential: cert(serviceAccount),
        // storageBucket: 'your-license-bucket-name.appspot.com' // Add if using direct GCS access
    });
}
const adminAuth = getAuth();
const adminDb = getFirestore();
// const adminStorage = getStorage(); // Uncomment if using direct GCS access

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
// Add all paths that need protection. Paths not listed here are considered public or handled differently.
// `requiresResidenciaInPath`: True if the first segment of the path is expected to be a ResidenciaId.
// `masterOnly`: True if only users with the 'master' role (and validated in Firestore) can access.
const PATH_CONFIG: Record<string, { allowedRoles: string[], masterOnly?: boolean, requiresResidenciaInPath?: boolean }> = {
    // Master-specific paths
    '/restringido-master': { allowedRoles: ['master'], masterOnly: true, requiresResidenciaInPath: false },
    // Admin paths (could also be accessed by master if master is in allowedRoles)
    '/admin': { allowedRoles: ['admin', 'master'], masterOnly: false, requiresResidenciaInPath: false }, // Base for /admin/*
    '/admin/users': { allowedRoles: ['admin', 'master'], masterOnly: false, requiresResidenciaInPath: false },
    // User/Admin paths without ResidenciaId in path
    '/feedback': { allowedRoles: ['user', 'admin', 'master', 'residente'], masterOnly: false, requiresResidenciaInPath: false },
    '/mi-perfil': { allowedRoles: ['user', 'admin', 'master', 'residente'], masterOnly: false, requiresResidenciaInPath: false },
    // Add other specific non-ResidenciaId paths here
    // Example: '/configuracion-global': { allowedRoles: ['admin', 'master'], masterOnly: false, requiresResidenciaInPath: false },

    // NOTE: For paths like `/[residenciaId]/somepage`, they will be handled by the generic residencia path check later.
    // If a specific sub-page under `/[residenciaId]/` has different role requirements,
    // you might need a more sophisticated `getPathConfig` or list them explicitly if few.
    // For instance, `/[residenciaId]/admin-feature` might be:
    // This is harder to define statically, consider dynamic checks or a clearer path structure.
};

function getPathConfigForRequest(pathname: string) {
    // 1. Exact match for full paths
    if (PATH_CONFIG[pathname]) {
        return PATH_CONFIG[pathname];
    }

    // 2. Check for prefixes (e.g., /restringido-master/*, /admin/*)
    const segments = pathname.split('/').filter(Boolean);
    if (segments.length > 0) {
        const prefixBasedPath = `/${segments[0]}`; // e.g., /restringido-master or /admin
        if (PATH_CONFIG[prefixBasedPath] && (PATH_CONFIG[prefixBasedPath].masterOnly || prefixBasedPath === '/admin')) {
            // If it's a masterOnly prefix or the /admin prefix, apply its config to subpaths.
            // For /admin, we assume subpaths also requireResidenciaInPath: false unless specified.
            return { ...PATH_CONFIG[prefixBasedPath], requiresResidenciaInPath: PATH_CONFIG[prefixBasedPath].requiresResidenciaInPath || false };
        }
    }
    
    // 3. Generic check for paths that likely contain ResidenciaId as the first segment
    // These paths were not matched by specific configurations above.
    // Example: /someActualResidenciaId/dashboard, /anotherResidenciaId/settings
    if (segments.length > 1 && // Path has at least /residenciaId/page
        !['api', '_next', 'assets', 'favicon.ico', 'acceso-no-autorizado'].includes(segments[0]) && // Exclude common public/meta paths
        !PATH_CONFIG[`/${segments[0]}`] // Ensure the first segment itself isn't a configured static path like /feedback
    ) {
        // Default assumption for unlisted /residenciaId/subpage paths
        return { allowedRoles: ['user', 'admin', 'master', 'residente'], masterOnly: false, requiresResidenciaInPath: true };
    }

    return null; // Path is not configured for protection or is public
}


// CRITICAL PLACEHOLDER: Implement this function properly.
// Option 1: Make an authenticated HTTP call to your 'getLicenseDetails' Firebase Function. (Adds latency)
// Option 2: Replicate GCS reading logic here using 'adminStorage.bucket(...).file(...).download()'. (More complex setup)
async function getLicenseDetailsFromFunction(residenciaId: string): Promise<LicenseDetailsResult> {
    console.log(`Middleware: Attempting to get license details for Residencia ID: ${residenciaId}`);
    
    // ----- BEGIN ACTUAL IMPLEMENTATION (Choose Option 1 or 2) -----
    // For now, this is a MOCK.
    // Option 2 example (Direct GCS access - requires adminStorage initialized and bucket name):
    /*
    const licenseBucketName = 'YOUR_LICENSE_BUCKET_NAME'; // Replace with your actual bucket name
    const licenseFilesPath = 'comensales-licencia/'; // Replace with your actual path
    const filePath = `${licenseFilesPath}${residenciaId}.json`;
    try {
        const file = adminStorage.bucket(licenseBucketName).file(filePath);
        const [exists] = await file.exists();
        if (!exists) {
            console.warn(`Middleware: License file not found in GCS for ${residenciaId} at ${filePath}`);
            return { status: 'not_found', residenciaId };
        }
        const [content] = await file.download();
        const data = JSON.parse(content.toString());

        // Add your full validation logic from the original getLicenseDetails here
        // to check expiration, active status, token, content.residenciaId match, etc.
        // This is a highly simplified example:
        if (data.residenciaId !== residenciaId) {
             console.error(`Middleware: ResidenciaID mismatch in license file ${filePath}. Expected ${residenciaId}, got ${data.residenciaId}`);
             return { status: 'invalid_token', residenciaId: data.residenciaId }; // Or a more specific error
        }
        if (!data.licenciaActiva) return { status: 'not_active', ...data };
        if (new Date(data.licenciaValidaHasta) < new Date()) return { status: 'expired', ...data };
        // Add token validation if your license files have tokens that need server-side validation.

        console.log(`Middleware: Successfully fetched and validated license from GCS for ${residenciaId}`);
        return { status: 'valid', ...data };
    } catch (error) {
        console.error(`Middleware: Error directly fetching/validating license from GCS for ${residenciaId}:`, error);
        return { status: 'error_reading_file', residenciaId };
    }
    */

    // Fallback MOCK if direct GCS is not implemented yet:
    console.warn(`CRITICAL: getLicenseDetailsFromFunction in middleware is a MOCK for Residencia ID: ${residenciaId}. Implement actual GCS logic or HTTP call.`);
    if (residenciaId === "RESIDENCIA_VALIDA_DEMO") { // For testing purposes
        return {
            status: "valid",
            residenciaId: "RESIDENCIA_VALIDA_DEMO",
            licenciaActiva: true,
            licenciaValidaHasta: new Date(Date.now() + 86400000 * 30).toISOString(),
            cantidadUsuarios: 100
        };
    }
    return { status: 'not_found', residenciaId: residenciaId };
    // ----- END ACTUAL IMPLEMENTATION -----
}


export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;
    const pathConfig = getPathConfigForRequest(pathname);

    // Allow public paths, Next.js specific paths. API routes should implement their own auth.
    if (!pathConfig || pathname.startsWith('/_next') || pathname.startsWith('/api/auth/')) { // Let session API routes pass
        return NextResponse.next();
    }
    // Publicly accessible "access denied" page
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
        decodedClaims = await adminAuth.verifySessionCookie(sessionCookie, true); // true checks for revocation
    } catch (error: any) {
        console.warn(`Middleware: Invalid or expired session cookie for path ${pathname}. Error: ${error.code || error.message}`);
        let message = 'Tu sesión ha expirado o es inválida. Por favor, inicia sesión de nuevo.';
        if (error.code === 'auth/session-cookie-revoked') {
            message = 'Tu sesión ha sido cerrada. Por favor, inicia sesión de nuevo.';
        }
        const redirectUrl = new URL(`/acceso-no-autorizado?mensaje=${encodeURIComponent(message)}`, request.url);
        const response = NextResponse.redirect(redirectUrl);
        response.cookies.set('__session', '', { maxAge: 0, path: '/' }); // Clear the invalid cookie
        return response;
    }

    const userRoles = (decodedClaims.roles as string[]) || [];
    const userResidenciaIdFromClaims = decodedClaims.residenciaId as string | undefined;

    // 0. Role check
    const hasRequiredRole = userRoles.some(role => pathConfig.allowedRoles.includes(role));
    if (!hasRequiredRole) {
        const message = encodeURIComponent(`No tienes el rol adecuado (${userRoles.join(', ')}) para acceder a esta página (${pathname}). Roles permitidos: ${pathConfig.allowedRoles.join(', ')}.`);
        return NextResponse.redirect(new URL(`/acceso-no-autorizado?mensaje=${message}`, request.url));
    }

    // 1. Master Role Validation
    if (userRoles.includes('master')) {
        // Even if 'master' is in allowedRoles for a non-masterOnly path, master users always go through this check.
        // If pathConfig.masterOnly is true, it's correctly a master-only path.
        // If pathConfig.masterOnly is false, but master is an allowed role, they still get master validation.
        try {
            const userProfileDoc = await adminDb.collection('UserProfiles').doc(decodedClaims.uid).get();
            if (!userProfileDoc.exists || !(userProfileDoc.data()?.roles as string[] || []).includes('master')) {
                const message = encodeURIComponent('Verificación de Master fallida. Contacta al administrador.');
                return NextResponse.redirect(new URL(`/acceso-no-autorizado?mensaje=${message}`, request.url));
            }
            // If it's a master-only path OR master is simply an allowed role, and Firestore check passed:
            console.log(`Middleware: Master user ${decodedClaims.uid} validated for path ${pathname}.`);
            return NextResponse.next();
        } catch (dbError) {
            console.error("Middleware: Firestore error during master validation:", dbError);
            const message = encodeURIComponent('Error validando perfil de Master.');
            return NextResponse.redirect(new URL(`/acceso-no-autorizado?mensaje=${message}`, request.url));
        }
    }

    // If we reach here, user is NOT 'master' (or 'master' check already passed and returned next())
    // So, if the path was configured as masterOnly, it's an error for non-masters.
    if (pathConfig.masterOnly) {
        const message = encodeURIComponent('Esta sección es exclusiva para administradores Master.');
        return NextResponse.redirect(new URL(`/acceso-no-autorizado?mensaje=${message}`, request.url));
    }

    // 2. Non-Master Role Validation (includes 'admin', 'user', 'residente')
    // 2.1 ResidenciaId from claims
    if (!userResidenciaIdFromClaims) {
        // This case should ideally be rare if claims are set correctly for all non-master users needing Residencia context
        const message = encodeURIComponent('No se pudo determinar tu Residencia asignada. Contacta al soporte.');
        return NextResponse.redirect(new URL(`/acceso-no-autorizado?mensaje=${message}`, request.url));
    }

    // 2.2 Load license file
    const licenseDetails = await getLicenseDetailsFromFunction(userResidenciaIdFromClaims);

    // 2.3 Validate license
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

    // 2.4 ResidenciaId matching
    let residenciaIdFromUrl: string | undefined;
    if (pathConfig.requiresResidenciaInPath) {
        const pathSegments = pathname.split('/').filter(Boolean);
        if (pathSegments.length > 0) {
            residenciaIdFromUrl = pathSegments[0]; // Assumes first segment is ResidenciaId
        }
        if (!residenciaIdFromUrl) {
             const message = encodeURIComponent('Esta página requiere una Residencia en la URL, pero no se encontró.');
             return NextResponse.redirect(new URL(`/acceso-no-autorizado?mensaje=${message}`, request.url));
        }
    }

    // Match 1: URL ResidenciaId (if applicable) vs Claims ResidenciaId
    if (residenciaIdFromUrl && residenciaIdFromUrl !== userResidenciaIdFromClaims) {
        const message = encodeURIComponent(`Conflicto de acceso: Intentas acceder a ${residenciaIdFromUrl} pero tu sesión es para ${userResidenciaIdFromClaims}.`);
        return NextResponse.redirect(new URL(`/acceso-no-autorizado?mensaje=${message}`, request.url));
    }
    // Match 2: Claims ResidenciaId vs License File Content ResidenciaId
    // (The license filename already implicitly matches userResidenciaIdFromClaims because that's how it was fetched)
    if (licenseDetails.residenciaId !== userResidenciaIdFromClaims) {
        const message = encodeURIComponent(`Conflicto interno de licencia: La licencia para ${userResidenciaIdFromClaims} reporta un ID interno de ${licenseDetails.residenciaId}.`);
        return NextResponse.redirect(new URL(`/acceso-no-autorizado?mensaje=${message}`, request.url));
    }

    // All checks passed for non-master user
    console.log(`Middleware: User ${decodedClaims.uid} (Residencia: ${userResidenciaIdFromClaims}) validated for path ${pathname}.`);
    return NextResponse.next();
}

// Define which paths the middleware should run on
export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - api/public (for any public API routes you might have)
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - assets/ (if you have a public assets folder)
         * - Manifest and icon files for PWA
         */
        '/((?!api/public|_next/static|_next/image|assets|favicon.ico|manifest.json|.*\\.png$|.*\\.svg$|.*\\.webmanifest$).*)',
    ],
};
