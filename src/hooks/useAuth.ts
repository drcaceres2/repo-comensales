'use client';

import { useState, useEffect } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { UserProfile, UserRole } from '@/../../shared/models/types';
import { User as FirebaseUser } from 'firebase/auth';

interface AuthHookResult {
  authUser: FirebaseUser | null | undefined;
  userProfile: UserProfile | null;
  loading: boolean;
  error: Error | undefined | null;
}

export const useAuth = (): AuthHookResult => {
  const [authUser, authFirebaseLoading, authFirebaseError] = useAuthState(auth);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [userProfileLoading, setUserProfileLoading] = useState<boolean>(false);
  const [authError, setAuthError] = useState<Error | null | undefined>(null);

  useEffect(() => {
    const fetchUserProfile = async () => {
      if (authUser) {
        setUserProfileLoading(true);
        setAuthError(null);
        try {
          const userDocRef = doc(db, "users", authUser.uid);
          const userDocSnap = await getDoc(userDocRef);

          if (userDocSnap.exists()) {
            const userProfileData = userDocSnap.data() as UserProfile;
            
            // Validate roles
            const tokenResult = await authUser.getIdTokenResult();
            const tokenRoles = Array.isArray(tokenResult.claims.roles) ? tokenResult.claims.roles : [];
            
            const firestoreRoles = userProfileData.roles || [];
            
            const rolesMatch = 
              tokenRoles.length === firestoreRoles.length && 
              tokenRoles.every((role) => firestoreRoles.includes(role as UserRole));

            if (rolesMatch) {
              setUserProfile(userProfileData);
            } else {
              console.error("Role mismatch between auth token and Firestore profile.");
              setAuthError(new Error("Role mismatch. Please contact support."));
              // Potentially sign out the user or clear authUser state
              // For now, just setting error and clearing profile
              setUserProfile(null);
              // To effectively clear authUser, you might need to call signOut(auth)
              // and let useAuthState handle it, or manage a local version of authUser.
              // For simplicity here, we will rely on the error state.
            }
          } else {
            setAuthError(new Error("User profile not found in Firestore."));
            setUserProfile(null);
          }
        } catch (e) {
          console.error("Error fetching user profile:", e);
          setAuthError(e as Error);
          setUserProfile(null);
        }
        setUserProfileLoading(false);
      } else {
        setUserProfile(null); // Clear profile if no authUser
        setAuthError(null); // Clear errors if no authUser
      }
    };

    fetchUserProfile();
  }, [authUser]);

  return {
    authUser,
    userProfile,
    loading: authFirebaseLoading || userProfileLoading,
    error: authError || authFirebaseError,
  };
};