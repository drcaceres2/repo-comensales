import { useEffect, useState } from 'react';
import { onIdTokenChanged, User, IdTokenResult, ParsedToken } from 'firebase/auth';
import { auth } from '@/lib/firebase';

interface AuthState {
  user: User | null;
  claims: ParsedToken | null;
  loading: boolean;
  error: Error | undefined;
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null);
  const [claims, setClaims] = useState<ParsedToken | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = onIdTokenChanged(
      auth,
      async (currentUser) => {
        try {
          setUser(currentUser);
          if (currentUser) {
            const idTokenResult: IdTokenResult = await currentUser.getIdTokenResult();
            setClaims(idTokenResult.claims);
          } else {
            setClaims(null);
          }
          setError(undefined);
        } catch (err: any) {
          console.error("Error processing auth state change:", err);
          setError(err);
          setClaims(null);
        } finally {
          setLoading(false);
        }
      },
      (authError) => {
        console.error("Firebase Auth Error:", authError);
        setError(authError);
        setUser(null);
        setClaims(null);
        setLoading(false);
      }
    );

    // Cleanup subscription on unmount
    return () => {
      unsubscribe();
    };
  }, []);

  return { user, claims, loading, error };
}
