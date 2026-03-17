import { admin, db } from "../lib/firebase";
import { CallableRequest, HttpsError } from "firebase-functions/v2/https";
import * as functions from "firebase-functions/v2";
import { Usuario } from "../../../shared/schemas/usuarios";

export interface CallerSecurityInfo {
  uid: string;
  profile?: Usuario;
  claims?: Record<string, any>;
  isMaster: boolean;
  isAdmin: boolean;
  isAsistente: boolean;
}

export async function getCallerSecurityInfo(
  authContext?: CallableRequest["auth"]
): Promise<CallerSecurityInfo> {
  if (!authContext || !authContext.uid) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const uid = authContext.uid;
  try {
    const [userRecord, profileDoc] = await Promise.all([
      admin.auth().getUser(uid),
      db.collection("usuarios").doc(uid).get(),
    ]);

    const claims = userRecord.customClaims || {};
    const profile = profileDoc.exists ? (profileDoc.data() as Usuario) : undefined;

    const claimRolesRaw = claims.roles;
    const claimRoles = Array.isArray(claimRolesRaw)
      ? claimRolesRaw.filter((role): role is string => typeof role === "string")
      : [];

    // Compatibilidad con formatos legacy de claims.
    const singleRole = typeof claims.role === "string" ? claims.role : null;
    if (singleRole && !claimRoles.includes(singleRole)) {
      claimRoles.push(singleRole);
    }

    const profileRoles = Array.isArray(profile?.roles)
      ? profile.roles
      : [];

    const shouldFallbackToProfileRoles =
      process.env.FUNCTIONS_EMULATOR === "true" || process.env.NODE_ENV !== "production";
    const effectiveRoles =
      claimRoles.length > 0 ? claimRoles : (shouldFallbackToProfileRoles ? profileRoles : []);

    if (shouldFallbackToProfileRoles && claimRoles.length === 0 && profileRoles.length > 0) {
      functions.logger.warn("Caller has no roles in custom claims; using Firestore profile roles as fallback.", {
        uid,
        profileRoles,
      });
    }

    const isMaster =
      claims.isMaster === true ||
      effectiveRoles.includes("master");
    const isAdmin =
      claims.isAdmin === true ||
      effectiveRoles.includes("admin");
    const isAsistente =
      claims.isAsistente === true ||
      effectiveRoles.includes("asistente");

    return {
      uid,
      profile,
      claims,
      isMaster,
      isAdmin,
      isAsistente,
    };
  } catch (error) {
    functions.logger.error("Error fetching caller security info for UID:", uid, error);
    throw new HttpsError("internal", "Could not verify caller permissions.");
  }
}
