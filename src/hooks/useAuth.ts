import { useEffect, useState, useCallback } from 'react';
import { onIdTokenChanged, User, IdTokenResult, ParsedToken, signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';

interface AuthState {
  user: User | null;
  claims: ParsedToken | null;
  loading: boolean;
  error: Error | undefined;
  logout: () => Promise<void>;
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
          setLoading(true);
          if (currentUser) {
            // Usuario ha iniciado sesión o el token ha cambiado/refrescado
            const idToken = await currentUser.getIdToken();
            const idTokenResult: IdTokenResult = await currentUser.getIdTokenResult();
            
            setUser(currentUser);
            setClaims(idTokenResult.claims);

            // Sincronizar con el backend para crear/validar la cookie de sesión
            await fetch('/api/auth/login', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${idToken}`,
              },
            });

          } else {
            // Usuario ha cerrado sesión
            setUser(null);
            setClaims(null);

            // Sincronizar con el backend para destruir la cookie de sesión
            await fetch('/api/auth/logout', {
              method: 'POST',
            });
          }
          setError(undefined);
        } catch (err: any) {
          console.error("Error processing auth state change:", err);
          setError(err);
          setClaims(null);
          setUser(null);
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

  const logout = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Llama a signOut del SDK de cliente de Firebase.
      await signOut(auth);
      // 2. onIdTokenChanged se disparará automáticamente al detectar el cambio.
      // 3. El listener de onIdTokenChanged ejecutará la lógica de limpieza
      //    y llamará a nuestra API de /api/auth/logout.
    } catch (err: any) {
      console.error("Error signing out:", err);
      setError(err);
      setLoading(false);
    }
  }, []);


  return { user, claims, loading, error, logout };
}
