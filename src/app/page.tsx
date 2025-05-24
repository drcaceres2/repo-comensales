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
import { signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc, updateDoc } from "firebase/firestore"; // Import Firestore functions
import { useAuthState } from 'react-firebase-hooks/auth'; // Import the new hook
import { auth, db } from '@/lib/firebase'; // Import initialized auth and db instances

// --- Model Imports ---
import { UserProfile, UserRole } from '@/../../shared/models/types'; // Keep UserProfile and UserRole

// --- LOGO URL ---
const LOGO_URL = "https://firebasestorage.googleapis.com/v0/b/comensales-residencia.firebasestorage.app/o/public%2Flogo_web_app_1024x1024.jpg?alt=media&token=3d7a3f7c-71a1-403a-b858-bd0ec567dd10";

// Helper function to redirect based on profile (remains the same)
const redirectToDashboard = (profile: UserProfile, router: ReturnType<typeof useRouter>) => {
    const roles = profile.roles || [];
    const residenciaId = profile.residenciaId;

    if (roles.includes('admin' as UserRole) || roles.includes('master' as UserRole)) {
      router.push('/admin/crear-residencia');
    } else if (roles.includes('director' as UserRole) && residenciaId) {
      router.push(`/${residenciaId}/solicitar-comensales`);
    } else if (roles.includes('residente' as UserRole) && residenciaId) {
      router.push(`/${residenciaId}/elegir-comidas`);
    } else if (roles.includes('invitado' as UserRole) && residenciaId) {
      router.push(`/${residenciaId}/bienvenida-invitados`);
    } else if (roles.includes('asistente' as UserRole) && residenciaId) {
       router.push(`/${residenciaId}/editar-invitados`); // Assuming this is the correct route for asistente
    } else if (roles.includes('auditor' as UserRole) && residenciaId) {
       router.push(`/${residenciaId}/reporte-comidas`); // Assuming this is the correct route for auditor
    } else {
      console.warn("User logged in but has undefined role/residenciaId or unknown role combination:", profile);
      router.push('/dashboard'); // Fallback redirect
    }
};

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();

  // Use the new hook: returns [user, loading, error]
  const [user, loading, error] = useAuthState(auth);

  // State for Firestore profile data and its loading status
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState<boolean>(false);
  const [initialAuthCheckDone, setInitialAuthCheckDone] = useState(false); // Track initial auth check

  // State for email/password inputs and login button loading
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoginLoading, setIsLoginLoading] = useState(false); // Separate loading for login action

  // --- Effect for Handling Auth State Changes, Profile Fetching, and Redirection ---
  useEffect(() => {
    if (loading) {
      // Auth state is still being determined, reset flags.
      setInitialAuthCheckDone(false);
      setProfile(null); // Clear profile while auth is resolving
      setProfileLoading(false);
      return;
    }
    // Auth state determined
    setInitialAuthCheckDone(true);

    if (error) {
      console.error("Firebase Auth State Error:", error);
      toast({ title: "Error de autenticación", description: `Error: ${error.message}`, variant: "destructive" });
      setProfile(null);
      setProfileLoading(false);
      return;
    }

    if (user) {
      // User is logged in.
      // Fetch profile only if we don't have it and aren't already fetching it.
      if (!profile && !profileLoading) {
        console.log("User authenticated, fetching profile...");
        setProfileLoading(true);
        const userDocRef = doc(db, "users", user.uid);
        getDoc(userDocRef)
          .then(async (userDocSnap) => { // Made this async to await updateDoc
            if (userDocSnap.exists()) {
              console.log("Profile fetched successfully.");
              const userProfileData = userDocSnap.data() as UserProfile;
              try {
                // Update lastLogin timestamp
                await updateDoc(userDocRef, {
                  lastLogin: Date.now(),
                });
                console.log("lastLogin updated successfully.");
                // Update profile state *after* successful lastLogin update
                setProfile(userProfileData);
              } catch (updateError) {
                console.error("Error updating lastLogin:", updateError);
                toast({
                  title: "Error al Actualizar Sesión",
                  description: "No se pudo actualizar la hora de último inicio de sesión.",
                  variant: "destructive",
                });
                // Set profile even if lastLogin update fails, so user can proceed
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
              // Optional: sign the user out if profile is critical
              // auth.signOut();
            }
          })
          .catch((fetchError) => {
            console.error("Error fetching user profile:", fetchError);
            setProfile(null);
            toast({
                title: "Error al Cargar Perfil",
                description: `No se pudo cargar tu perfil: ${fetchError.message}`,
                variant: "destructive",
            });
          })
          .finally(() => {
            setProfileLoading(false);
          });
      } else if (profile) {
        // Profile is already loaded, proceed with redirection.
        console.log("User authenticated and profile loaded, redirecting...");
        redirectToDashboard(profile, router);
      }
      // If profileLoading is true, we wait for the fetch to complete.
    } else {
      // User is signed out, clear profile state.
      setProfile(null);
      setProfileLoading(false);
      console.log("User is signed out, staying on login page.");
    }

  // Dependencies: Watch auth state, profile state, and related loading states.
  }, [user, loading, error, profile, profileLoading, router, toast]); // Removed db as it's stable from firebase import

  // --- Firebase Login Handler (remains largely the same) ---
  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email || !password) {
      toast({ title: "Faltan Datos", description: "Introduce email y contraseña.", variant: "destructive" });
      return;
    }
    setIsLoginLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // Success toast
      toast({
        title: "Inicio de sesión exitoso",
        description: `Bienvenido de nuevo. Redirigiendo...`,
      });
      // NOTE: Redirection is now handled by the useEffect hook above when user/profile become available.
    } catch (loginError: any) {
      console.error("Login failed:", loginError.code, loginError.message);
      let errorMessage = "Ha ocurrido un error al iniciar sesión.";
      // ... (error handling switch statement remains the same)
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
          errorMessage = `Error inesperado (${loginError.code || 'desconocido'}). Por favor, inténtalo de nuevo.`;
      }
      toast({ title: "Error de inicio de sesión", description: errorMessage, variant: "destructive" });
    } finally {
      setIsLoginLoading(false);
    }
  };

  // --- Render Logic ---

  // Show loading screen while initial auth check OR profile fetch (if user logged in) is happening
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

  // If authenticated and profile loaded, useEffect should redirect. Show intermediate state.
  if (initialAuthCheckDone && user && profile) {
      return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2">Redirigiendo...</span>
      </div>
    ); // Or return null;
  }

  // Render login form only if initial check is complete and NO user is logged in
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
                priority
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
                  disabled={isLoginLoading} // Use login button loading state
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
                  disabled={isLoginLoading} // Use login button loading state
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

  // Fallback case (e.g., user logged in but profile fetch failed and toast shown)
  // You might want a specific UI here or just null.
  // If profile fetch fails, the useEffect shows a toast, but the user isn't redirected.
  // We need to decide what to show. Maybe allow logout? Or just show nothing.
  if (initialAuthCheckDone && user && !profile && !profileLoading) {
     return (
       <div className="flex flex-col items-center justify-center min-h-screen">
         <p className="text-red-600">Error al cargar el perfil. Por favor, contacta al soporte.</p>
         {/* Optional: Add a logout button here */}
         <Button variant="outline" onClick={() => auth.signOut()} className="mt-4">Cerrar sesión</Button>
       </div>
     );
  }

  // Default fallback if none of the above conditions match (should ideally not happen)
  return null;
}
