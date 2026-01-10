'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast"; // Keep for notifications
import { Loader2 } from "lucide-react"; // Import loader icon

// --- Firebase Imports ---
// signInWithEmailAndPassword will still be used for the initial client-side auth
import { signInWithEmailAndPassword, signOut as firebaseSignOut } from "firebase/auth";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { useAuth } from '@/hooks/useAuth'; // Use the custom hook
import { auth, db } from '@/lib/firebase'; // Import initialized auth and db instances

// --- Model Imports ---
import { UserProfile, UserRole } from '../../shared/models/types'; // Keep UserProfile and UserRole

// --- LOGO URL ---
const LOGO_URL = "https://firebasestorage.googleapis.com/v0/b/comensales-residencia.firebasestorage.app/o/public%2Flogo_web_app_1024x1024.jpg?alt=media&token=3d7a3f7c-71a1-403a-b858-bd0ec567dd10";

// Helper function to redirect based on profile (remains the same)
const redirectToDashboard = (profile: UserProfile, router: ReturnType<typeof useRouter>) => {
    const roles = profile.roles || [];
    const residenciaId = profile.residenciaId;

    // Your existing redirection logic...
    if (roles.includes('admin' as UserRole) || roles.includes('master' as UserRole)) {
      router.push('/restringido-master/crear-residencia'); // Example, adjust to your actual admin start page
    } else if (residenciaId) { // Simplified check, assuming non-admin roles need residenciaId
        if (roles.includes('director' as UserRole)) router.push(`/${residenciaId}/solicitar-comensales`);
        else if (roles.includes('residente' as UserRole)) router.push(`/${residenciaId}/elegir-comidas`);
        else if (roles.includes('invitado' as UserRole)) router.push(`/${residenciaId}/bienvenida-invitados`);
        else if (roles.includes('asistente' as UserRole)) router.push(`/${residenciaId}/elecciones-invitados`);
        else if (roles.includes('contador' as UserRole)) router.push(`/${residenciaId}/contabilidad/reporte-costos`);
        else router.push(`/${residenciaId}/page`); // Generic fallback for roles with residenciaId
    } else {
      console.warn("User logged in but has undefined role/residenciaId or unknown role combination:", profile);
      // Fallback if residenciaId is missing for roles that need it or no specific redirect found
      router.push('/acceso-no-autorizado?mensaje=Perfil%20incompleto%20o%20rol%20no%20reconocido.'); 
    }
};

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { user, loading, error } = useAuth(); // Custom hook usage
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState<boolean>(false);
  const [initialAuthCheckDone, setInitialAuthCheckDone] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoginLoading, setIsLoginLoading] = useState(false);

  // --- Effect for Handling Auth State Changes, Profile Fetching, and Redirection ---
  useEffect(() => {
    if (loading) {
      setInitialAuthCheckDone(false);
      setProfile(null);
      setProfileLoading(false);
      return;
    }
    setInitialAuthCheckDone(true);

    if (error) {
      console.error("Firebase Auth State Error:", error);
      toast({ title: "Error de autenticación", description: `Error: ${error.message}`, variant: "destructive" });
      setProfile(null);
      setProfileLoading(false);
      return;
    }

    if (user) {
      // User is authenticated with Firebase client SDK.
      // Now, check if profile is loaded. If so, redirect.
      // The session cookie setting happens during the explicit login action.
      // If a session cookie already exists and is valid, subsequent page loads would handle it.
      if (!profile && !profileLoading) {
        console.log("User authenticated (client-side), fetching profile...");
        setProfileLoading(true);
        const userDocRef = doc(db, "users", user.uid);
        getDoc(userDocRef)
          .then(async (userDocSnap) => {
            if (userDocSnap.exists()) {
              console.log("Profile fetched successfully.");
              const userProfileData = userDocSnap.data() as UserProfile;
              try {
                await updateDoc(userDocRef, { lastLogin: Date.now() });
                console.log("lastLogin updated successfully.");
                setProfile(userProfileData);
              } catch (updateError) {
                console.error("Error updating lastLogin:", updateError);
                toast({
                  title: "Error al Actualizar Sesión",
                  description: "No se pudo actualizar la hora de último inicio de sesión.",
                  variant: "destructive",
                });
                setProfile(userProfileData);
              }
            } else {
              console.error("User profile not found in Firestore for UID:", user.uid);
              setProfile(null);
              toast({
                  title: "Error de Perfil",
                  description: "No se encontró tu perfil de usuario. Contacta al administrador.",
                  variant: "destructive",
              });
              // If profile is critical, sign out to prevent inconsistent state.
              // This also triggers the !user block below.
              await firebaseSignOut(auth); 
            }
          })
          .catch(async (fetchError) => {
            console.error("Error fetching user profile:", fetchError);
            setProfile(null);
            toast({
                title: "Error al Cargar Perfil",
                description: `No se pudo cargar tu perfil: ${fetchError.message}`,
                variant: "destructive",
            });
             // Sign out if profile fetch fails to avoid partial login state
            await firebaseSignOut(auth); // This await is now valid
          })
          .finally(() => {
            setProfileLoading(false);
          });

      } else if (profile) {
        // Profile is loaded, proceed with redirection.
        console.log("User authenticated (client-side) and profile loaded, redirecting...");
        redirectToDashboard(profile, router);
      }
    } else {
      // User is signed out (no active Firebase client session).
      setProfile(null);
      setProfileLoading(false);
      console.log("User is signed out (client-side), staying on login page.");
    }
  }, [user, loading, error, profile, profileLoading, router, toast]);


  // --- NEW Login Handler ---
  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email || !password) {
      toast({ title: "Faltan Datos", description: "Introduce email y contraseña.", variant: "destructive" });
      return;
    }
    setIsLoginLoading(true);
    try {
      // 1. Sign in with Firebase client SDK
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const firebaseUser = userCredential.user;

      if (firebaseUser) {
        // 2. Get ID token
        const idToken = await firebaseUser.getIdToken(true); // Pass true to force refresh

        // 3. Call your Firebase Function to set the session cookie
        // IMPORTANT: Replace with your actual Firebase Function URL
        const sessionLoginUrl = process.env.NEXT_PUBLIC_SESSION_LOGIN_URL || "YOUR_FIREBASE_FUNCTION_SESSION_LOGIN_URL_HERE"; 
        
        if (sessionLoginUrl === "YOUR_FIREBASE_FUNCTION_SESSION_LOGIN_URL_HERE") {
            console.error("CRITICAL: Firebase Function URL for sessionLogin is not configured.");
            toast({ title: "Configuración Incompleta", description: "La URL para iniciar sesión en el servidor no está configurada.", variant: "destructive"});
            setIsLoginLoading(false);
            await firebaseSignOut(auth); // Sign out the client session
            return;
        }

        const response = await fetch(sessionLoginUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ idToken }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ message: "Error setting session cookie." }));
          throw new Error(errorData.message || `Server error: ${response.status}`);
        }

        const sessionData = await response.json();
        console.log("Session cookie set successfully by server:", sessionData);

        // Success toast AFTER session cookie is set
        toast({
          title: "Inicio de sesión exitoso",
          description: `Bienvenido de nuevo. Redirigiendo...`,
        });
        // Redirection is now handled by the useEffect hook when `user` (from useAuthState) and `profile` become available.
        // The useAuthState hook will reflect the client-side login immediately.
        // The profile fetch will proceed as before.
      } else {
        throw new Error("Firebase user not found after sign-in.");
      }

    } catch (loginError: any) {
      console.error("Login failed:", loginError);
      let errorMessage = "Ha ocurrido un error al iniciar sesión.";
      if (loginError.code) { // Firebase auth errors have a code
        switch (loginError.code) {
          case 'auth/user-not-found':
          case 'auth/wrong-password':
          case 'auth/invalid-credential':
            errorMessage = "El correo electrónico o la contraseña son incorrectos.";
            break;
          case 'auth/invalid-email':
            errorMessage = "El formato del correo electrónico no es válido.";
            break;
          case 'auth/user-disabled':
            errorMessage = "Esta cuenta ha sido deshabilitada.";
            break;
          case 'auth/too-many-requests':
              errorMessage = "Acceso bloqueado temporalmente debido a demasiados intentos fallidos. Intenta más tarde.";
              break;
          default:
            errorMessage = `Error inesperado (${loginError.code}). Por favor, inténtalo de nuevo.`;
        }
      } else { // Non-Firebase errors (e.g., network, our custom error from fetch)
          errorMessage = loginError.message || "Error de conexión o del servidor.";
      }
      toast({ title: "Error de inicio de sesión", description: errorMessage, variant: "destructive" });
    } finally {
      setIsLoginLoading(false);
    }
  };

  // --- Render Logic (remains largely the same) ---
  const showLoadingScreen = loading || (initialAuthCheckDone && user && profileLoading);
  if (showLoadingScreen) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2">
          {loading ? 'Verificando sesión...' : (profileLoading ? 'Cargando perfil...' : 'Iniciando...')}
        </span>
      </div>
    );
  }

  if (initialAuthCheckDone && user && profile) {
      return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2">Redirigiendo...</span>
      </div>
    );
  }

  if (initialAuthCheckDone && !user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900 px-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            {LOGO_URL && (
              <Image
                src={LOGO_URL}
                alt="Logo Comensales"
                width={80}
                height={80}
                className="mx-auto mb-4 rounded-full"
                priority // Keep priority for LCP
              />
            )}
            <CardTitle className="text-2xl font-bold">Iniciar Sesión</CardTitle>
            <CardDescription>Accede a tu cuenta de Comensales</CardDescription>
          </CardHeader>
          <form onSubmit={handleLogin}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Correo Electrónico</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="tu@email.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoginLoading}
                  autoComplete="email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Contraseña</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Tu contraseña"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoginLoading}
                  autoComplete="current-password"
                />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-4">
              <Button type="submit" className="w-full" disabled={isLoginLoading}>
                {isLoginLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {isLoginLoading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    );
  }
  
  // Fallback for when user is authenticated but profile fetch failed
  if (initialAuthCheckDone && user && !profile && !profileLoading) {
     return (
       <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
         <p className="text-red-600 mb-4">
            Hubo un problema al cargar tu perfil de usuario. Esto puede impedir el acceso completo a la aplicación.
         </p>
         <p className="text-sm text-gray-700 mb-6">Por favor, intenta recargar la página o contacta al soporte si el problema persiste.</p>
         <Button variant="outline" onClick={async () => {
             setIsLoginLoading(true); // Show loading while signing out
             await firebaseSignOut(auth);
             // The session cookie on the server also needs to be cleared.
             // Call the sessionLogout Firebase Function.
             try {
                const sessionLogoutUrl = process.env.NEXT_PUBLIC_SESSION_LOGOUT_URL || "YOUR_FIREBASE_FUNCTION_SESSION_LOGOUT_URL_HERE";
                if (sessionLogoutUrl === "YOUR_FIREBASE_FUNCTION_SESSION_LOGOUT_URL_HERE") {
                    console.warn("Session logout URL not configured. Client-side logout only.");
                } else {
                    await fetch(sessionLogoutUrl, { method: "POST" });
                    console.log("Server session logout requested.");
                }
             } catch(e) {
                console.error("Error calling server logout:", e);
             }
             // No need to manually set isLoginLoading to false, as component will re-render due to auth state change
         }} className="mt-4" disabled={isLoginLoading}>
            {isLoginLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Cerrar sesión e intentar de nuevo
         </Button>
       </div>
     );
  }

  return null; // Default fallback
}
