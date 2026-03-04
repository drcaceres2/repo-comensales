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

    return {
      uid,
      profile,
      claims,
      isMaster: claims.roles?.includes("master") || false,
      isAdmin: claims.roles?.includes("admin") || false,
    };
  } catch (error) {
    functions.logger.error("Error fetching caller security info for UID:", uid, error);
    throw new HttpsError("internal", "Could not verify caller permissions.");
  }
}
