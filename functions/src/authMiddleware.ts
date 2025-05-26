import { admin, db } from "./lib/firebase"
import * as functions from "firebase-functions/v2"

import { PATH_RULES, PathRule } from "./authConfig"; // Assuming authConfig.ts
import { fetchLicenseDetails, LicenseDetailsResult } from "./lib/licenseUtils"; // Assuming licenseUtils.ts

// Re-use your existing CORS setup if it's global, or define one here
const corsHandler = require("cors")({
    origin: (process.env.CORS_ORIGINS || "http://localhost:3001,https://your-app-url.com").split(','),
    credentials: true,
  });
  
export const checkAuthAndLicense = functions.https.onRequest(async (request, response) => {
    corsHandler(request, response, async () => {
      const sessionCookie = request.cookies.__session || ''; // Make sure "__session" is your cookie name
      const requestedPath = request.query.path as string; // Expecting path as query param, e.g., /api/auth-check?path=/admin/users
  
      if (request.method !== 'GET') { // Or 'POST' if you prefer, but GET is simpler for a check
          response.status(405).json({ authorized: false, reason: 'METHOD_NOT_ALLOWED', message: 'Método no permitido.' });
          return;
      }
  
      if (!requestedPath) {
          response.status(400).json({ authorized: false, reason: 'MISSING_PATH_PARAM', message: 'El parámetro de ruta es requerido.' });
          return;
      }
  
      // 0. If user cannot be authenticated, or token lost, return 401.
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
        decodedClaims = await admin.auth().verifySessionCookie(sessionCookie, true); // true checks for revocation
      } catch (error: any) {
        console.warn(`Session cookie verification failed for path "${requestedPath}", Error: ${error.message}`);
        // Clear the invalid cookie from the client's browser
        response.clearCookie("__session", { 
            httpOnly: true, 
            secure: process.env.NODE_ENV === "production", // from functions env
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
  
      const userRoles = decodedClaims.roles || [];
      const userResidenciaIdFromClaims = decodedClaims.residenciaId;
      const uid = decodedClaims.uid;
  
      // 1. Find the rule for the requested path
      const pathRule: PathRule | undefined = PATH_RULES.find(rule => rule.pathPattern.test(requestedPath));
  
      if (!pathRule) {
        // This handles paths not explicitly defined in PATH_RULES.
        // You might want a default behavior (e.g., allow if public, deny if not).
        // For now, let's assume any path not in PATH_RULES is unauthorized unless it's a known public root like '/'.
        // Your frontend should ideally not call this for truly public, non-data-dependent pages.
        if (requestedPath === '/' || requestedPath === '/privacidad' || requestedPath === '/acceso-no-autorizado' || requestedPath === '/licencia-vencida') {
           response.status(200).json({ authorized: true, uid, claims: decodedClaims, message: "Public or auth-flow path allowed." });
           return;
        }
        console.warn(`No PATH_RULE found for "${requestedPath}". Denying access.`);
        response.status(403).json({ 
          authorized: false, 
          reason: 'PATH_RULE_NOT_FOUND', 
          redirect: '/acceso-no-autorizado', 
          message: 'Acceso denegado. La ruta solicitada no está configurada para acceso.' 
        });
        return;
      }
  
      // 2. Master User Validation
      if (userRoles.includes('master')) {
        try {
          const userProfileDoc = await db.collection('UserProfiles').doc(uid).get();
          if (!userProfileDoc.exists || !(userProfileDoc.data()?.roles as string[] || []).includes('master')) {
            response.status(403).json({ 
              authorized: false, 
              reason: 'MASTER_VERIFICATION_FAILED_DB', 
              redirect: '/acceso-no-autorizado', 
              message: 'Verificación de Master fallida (perfil de usuario no coincide).' 
            });
            return;
          }
  
          // Master can access masterOnly paths OR paths where 'master' is explicitly allowed.
          if (pathRule.isMasterOnly || pathRule.allowedRoles.includes('master')) {
              console.log(`Master user ${uid} authorized for path "${requestedPath}".`);
              response.status(200).json({ authorized: true, uid, claims: decodedClaims });
              return;
          } else {
              console.warn(`Master user ${uid} attempting to access non-master-allowed path "${requestedPath}".`);
              response.status(403).json({ 
                  authorized: false, 
                  reason: 'MASTER_ACCESS_DENIED_TO_PATH', 
                  redirect: '/acceso-no-autorizado', 
                  message: pathRule.customMessage || 'Acceso denegado. Esta página no está permitida para tu rol (Master).' 
              });
              return;
          }
        } catch (dbError: any) {
          console.error(`Firestore error during master validation for UID ${uid}:`, dbError.message);
          response.status(500).json({ 
              authorized: false, 
              reason: 'MASTER_VALIDATION_DB_ERROR', 
              redirect: '/acceso-no-autorizado', 
              message: 'Error interno validando el perfil de Master.' 
          });
          return;
        }
      }
  
      // --- Non-Master User Validation ---
  
      // 3.1 First check the authorized pages per role.
      const hasRequiredRole = userRoles.some(role => pathRule.allowedRoles.includes(role));
      if (!hasRequiredRole) {
        response.status(403).json({ 
          authorized: false, 
          reason: 'ROLE_NOT_AUTHORIZED_FOR_PATH', 
          redirect: '/acceso-no-autorizado', 
          message: pathRule.customMessage || `Tu rol (${userRoles.join(', ') || 'desconocido'}) no permite acceder a esta sección.` 
        });
        return;
      }
  
      // 3.1 (continued) Extracts the ResidenciaId from Auth claims.
      // Most non-master roles will require a ResidenciaId.
      // If a non-master role can exist without a ResidenciaId for certain paths,
      // this logic needs to be more nuanced, perhaps checking pathRule.requiresResidenciaIdForNonMaster = true
      if (!userResidenciaIdFromClaims) {
        console.warn(`User ${uid} (roles: ${userRoles.join(', ')}) has no ResidenciaId in claims for path "${requestedPath}".`);
        response.status(403).json({ 
          authorized: false, 
          reason: 'MISSING_RESIDENCIA_ID_IN_CLAIMS', 
          redirect: '/acceso-no-autorizado', // Or /licencia-vencida if it's more appropriate
          message: 'No se encontró ID de residencia en tu perfil. Contacta al soporte.' 
        });
        return;
      }
  
      // 3.2 Loads the license file.
      const licenseDetails: LicenseDetailsResult = await fetchLicenseDetails(userResidenciaIdFromClaims);
  
      // 3.3 Validates the license status.
      if (licenseDetails.status !== 'valid') {
        let message = `La licencia para tu residencia (${userResidenciaIdFromClaims}) no es válida (${licenseDetails.status}).`;
        // Customize messages based on status for clarity
        if (licenseDetails.status === 'not_found') message = `No se encontró una licencia activa para tu residencia (${userResidenciaIdFromClaims}).`;
        else if (licenseDetails.status === 'expired') message = `La licencia para tu residencia (${userResidenciaIdFromClaims}) ha expirado.`;
        else if (licenseDetails.status === 'not_active') message = `La licencia para tu residencia (${userResidenciaIdFromClaims}) no está activa.`;
        else if (licenseDetails.status === 'invalid_token') message = `El archivo de licencia para tu residencia (${userResidenciaIdFromClaims}) parece ser inválido.`;
        else if (licenseDetails.status === 'mismatch') message = `Hay una inconsistencia en los datos de licencia para tu residencia (${userResidenciaIdFromClaims}).`;
        else if (licenseDetails.status === 'error_reading_file') message = `No pudimos verificar el estado de la licencia para tu residencia (${userResidenciaIdFromClaims}).`;
        
        response.status(403).json({ 
          authorized: false, 
          reason: `LICENSE_INVALID_${licenseDetails.status.toUpperCase()}`, 
          redirect: '/licencia-vencida', 
          message 
        });
        return;
      }
  
      // 3.4 Match ResidenciaId from claims, license file content, and path (if applicable).
      // ResidenciaId from claims (userResidenciaIdFromClaims) was used for fetchLicenseDetails.
      // ResidenciaId from license file content (licenseDetails.residenciaId).
      if (licenseDetails.residenciaId !== userResidenciaIdFromClaims) {
        console.error(`CRITICAL MISMATCH: Claims ResID (${userResidenciaIdFromClaims}) vs License File Content ResID (${licenseDetails.residenciaId || 'N/A'}) for user ${uid}.`);
        response.status(403).json({ 
          authorized: false, 
          reason: 'LICENSE_RESIDENCIA_ID_CONTENT_MISMATCH', 
          redirect: '/licencia-vencida', 
          message: 'Inconsistencia crítica en los datos de tu licencia. Por favor, contacta al soporte inmediatamente.' 
        });
        return;
      }
  
      if (pathRule.requiresResidenciaInPath) {
        const pathMatch = requestedPath.match(pathRule.pathPattern); // pathPattern should capture the residenciaId
        const residenciaIdFromPath = pathMatch ? pathMatch[1] : null; // Assuming first capture group in RegExp is residenciaId
  
        if (!residenciaIdFromPath) {
          console.warn(`Path "${requestedPath}" requires ResidenciaId in URL as per rule, but not found or pattern mismatch.`);
          response.status(400).json({ 
              authorized: false, 
              reason: 'MISSING_RESIDENCIA_ID_IN_PATH_AS_PER_RULE', 
              redirect: '/acceso-no-autorizado', 
              message: 'Esta URL específica requiere un identificador de residencia, pero no se proporcionó correctamente.' 
          });
          return;
        }
  
        if (residenciaIdFromPath !== userResidenciaIdFromClaims) {
          console.warn(`ResidenciaId mismatch: Path (${residenciaIdFromPath}) vs Claims (${userResidenciaIdFromClaims}) for user ${uid} on path "${requestedPath}".`);
          response.status(403).json({ 
            authorized: false, 
            reason: 'RESIDENCIA_ID_MISMATCH_PATH_VS_CLAIMS', 
            redirect: '/acceso-no-autorizado', 
            message: `Acceso denegado. Estás intentando acceder a recursos de ${residenciaIdFromPath}, pero tu sesión es para ${userResidenciaIdFromClaims}.` 
          });
          return;
        }
      }
  
      // 3.5 If all checks pass for non-master user.
      console.log(`User ${uid} (Residencia: ${userResidenciaIdFromClaims}, Roles: ${userRoles.join(', ')}) authorized for path "${requestedPath}". License valid.`);
      response.status(200).json({ authorized: true, uid, claims: decodedClaims });
  
    });
});