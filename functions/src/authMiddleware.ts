import { admin } from "./lib/firebase";
import * as functions from "firebase-functions/v2";
import { fetchLicenseDetails, LicenseDetailsResult } from "./lib/licenseUtils";

const corsHandler = require("cors")({
    origin: (process.env.CORS_ORIGINS || "http://localhost:3001,https://your-app-url.com").split(','),
    credentials: true,
});

export const checkAuthAndLicense = functions.https.onRequest(async (request, response) => {
    corsHandler(request, response, async () => {
      try {
        const sessionCookie = request.cookies.__session || '';
        // const requestedPath = request.query.path as string; // No longer used

        if (request.method !== 'GET') {
            response.status(405).json({ authorized: false, reason: 'METHOD_NOT_ALLOWED', message: 'Método no permitido.' });
            return;
        }

        if (!sessionCookie) {
          response.status(401).json({
            authorized: false,
            reason: 'NO_SESSION_COOKIE',
            redirect: '/acceso-no-autorizado',
            message: 'Sesión no iniciada o expirada. Por favor, inicia sesión.'
          });
          return;
        }

        let decodedClaims: admin.auth.DecodedIdToken & { roles?: string[], residenciaId?: string };
        try {
          decodedClaims = await admin.auth().verifySessionCookie(sessionCookie, true);
        } catch (error: any) {
          // console.warn(`Session cookie verification failed (path: "${requestedPath}"), Error: ${error.message}`); // Path removed
          console.warn(`Session cookie verification failed, Error: ${error.message}`);
          response.clearCookie("__session", {
              httpOnly: true,
              secure: process.env.NODE_ENV === "production",
              sameSite: "strict",
          });
          response.status(401).json({
            authorized: false,
            reason: 'INVALID_SESSION_COOKIE',
            redirect: '/acceso-no-autorizado',
            message: 'Tu sesión es inválida o ha expirado. Por favor, inicia sesión de nuevo.'
          });
          return;
        }

        const userResidenciaIdFromClaims = decodedClaims.residenciaId;
        const uid = decodedClaims.uid;
        const userRoles = decodedClaims.roles || [];

        if (userRoles.includes('master')) {
            // console.log(`Master user ${uid} - bypassing residencia-specific license check for path "${requestedPath}".`); // Path removed
            console.log(`Master user ${uid} - bypassing residencia-specific license check.`);
            response.status(200).json({ authorized: true, uid, claims: decodedClaims, reason: "MASTER_USER_LICENSE_CHECK_BYPASSED" });
            return;
        }

        if (!userResidenciaIdFromClaims) {
            console.warn(`User ${uid} (roles: ${userRoles.join(', ')}) has no ResidenciaId in claims. Cannot check license.`);
            response.status(403).json({ 
              authorized: false, 
              reason: 'MISSING_RESIDENCIA_ID_IN_CLAIMS_FOR_LICENSE_CHECK', 
              redirect: '/acceso-no-autorizado', 
              message: 'No se encontró ID de residencia en tu perfil para la verificación de licencia.' 
            });
            return;
        }

        const licenseDetails: LicenseDetailsResult = await fetchLicenseDetails(userResidenciaIdFromClaims);

        if (licenseDetails.status !== 'valid') {
          let message = `La licencia para tu residencia (${userResidenciaIdFromClaims}) no es válida (${licenseDetails.status}).`;
          if (licenseDetails.status === 'not_found') message = `No se encontró una licencia activa para tu residencia (${userResidenciaIdFromClaims}).`;
          else if (licenseDetails.status === 'expired') message = `La licencia para tu residencia (${userResidenciaIdFromClaims}) ha expirado.`;
          else if (licenseDetails.status === 'not_active') message = `La licencia para tu residencia (${userResidenciaIdFromClaims}) no está activa.`;
          else if (licenseDetails.status === 'invalid_token') message = `El archivo de licencia para tu residencia (${userResidenciaIdFromClaims}) parece ser inválido.`;
          else if (licenseDetails.status === 'mismatch') message = `Hay una inconsistencia en los datos de licencia para tu residencia (${userResidenciaIdFromClaims}).`;
          else if (licenseDetails.status === 'error_reading_file') message = `No pudimos verificar el estado de la licencia para tu residencia (${userResidenciaIdFromClaims}).`;
          
          // console.warn(`License check failed for user ${uid}, residencia ${userResidenciaIdFromClaims} (path "${requestedPath}"): ${licenseDetails.status}`); // Path removed
          console.warn(`License check failed for user ${uid}, residencia ${userResidenciaIdFromClaims}: ${licenseDetails.status}`);
          response.status(403).json({ 
            authorized: false,
            reason: `LICENSE_INVALID_${licenseDetails.status.toUpperCase()}`,
            redirect: '/licencia-vencida',
            message 
          });
          return;
        }
        
        // console.log(`User ${uid} (Residencia: ${userResidenciaIdFromClaims}, Roles: ${userRoles.join(', ')}) authorized with valid license for path "${requestedPath}".`); // Path removed
        console.log(`User ${uid} (Residencia: ${userResidenciaIdFromClaims}, Roles: ${userRoles.join(', ')}) authorized with valid license.`);
        response.status(200).json({ authorized: true, uid, claims: decodedClaims, licenseStatus: licenseDetails.status });

      } catch (error: any) {
        // console.error(`Unhandled error in checkAuthAndLicense for path "${request.query.path as string}":`, error.message, error.stack); // Path removed
        console.error(`Unhandled error in checkAuthAndLicense:`, error.message, error.stack);
        if (!response.headersSent) {
          response.status(500).json({
            authorized: false,
            reason: 'INTERNAL_SERVER_ERROR',
            message: 'Ocurrió un error inesperado en el servidor al verificar la licencia.',
            errorDetails: process.env.NODE_ENV !== 'production' ? error.message : undefined,
            errorStack: process.env.NODE_ENV !== 'production' ? error.stack : undefined,
          });
        }
      }
    });
});
