import { auth } from '@/lib/firebase';
import { signOut, IdTokenResult } from 'firebase/auth';

/**
 * Logs out the current user.
 */
export async function logoutUser(): Promise<void> {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Error signing out:", error);
    throw error;
  }
}

/**
 * Retrieves the current user's ID token result which contains custom claims.
 * @param forceRefresh - Whether to force a refresh of the token.
 * @returns Promise<IdTokenResult | null>
 */
export async function getCurrentUserClaims(forceRefresh: boolean = false): Promise<IdTokenResult | null> {
  const user = auth.currentUser;
  if (!user) {
    return null;
  }
  try {
    return await user.getIdTokenResult(forceRefresh);
  } catch (error) {
    console.error("Error getting ID token result:", error);
    throw error;
  }
}
