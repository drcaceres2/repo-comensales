'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from "next/navigation";
import Image from 'next/image';
import { Loader2 } from "lucide-react"; // Import loader icon
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
import { useToast } from "@/hooks/useToast";

// --- Firebase Imports ---
import { signInWithEmailAndPassword, signOut as firebaseSignOut } from "firebase/auth";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { useAuth } from '@/hooks/useAuth'; // Usamos nuestro hook modificado
import { auth, db } from '@/lib/firebase';

// --- Model Imports ---
import { Usuario, RolUsuario } from '../../shared/models/types';

// --- LOGO URL ---
const LOGO_URL = "https://firebasestorage.googleapis.com/v0/b/comensales-residencia.firebasestorage.app/o/public%2Flogo_web_app_1024x1024.jpg?alt=media&token=3d7a3f7c-71a1-403a-b858-bd0ec567dd10";

// Helper function to redirect based on profile (remains the same)
const redirectToDashboard = (profile: Usuario, router: ReturnType<typeof useRouter>) => {
    const roles = profile.roles || [];
    const residenciaId = profile.residenciaId;

    if (roles.includes('master' as RolUsuario)) {
      router.push('/restringido-master/crear-residencia');
    } else if (residenciaId) {
        if (roles.includes('admin' as RolUsuario)) router.push(`/${residenciaId}/admin`);
        else if (roles.includes('director' as RolUsuario)) router.push(`/${residenciaId}/solicitar-comensales`);
        else if (roles.includes('residente' as RolUsuario)) router.push(`/${residenciaId}/elegir-comidas`);
        else if (roles.includes('invitado' as RolUsuario)) router.push(`/${residenciaId}/bienvenida-invitados`);
        else if (roles.includes('asistente' as RolUsuario)) router.push(`/${residenciaId}/elecciones-invitados`);
        else if (roles.includes('contador' as RolUsuario)) router.push(`/${residenciaId}/contabilidad/reporte-costos`);
        else router.push(`/`);
    } else {
      console.warn("User logged in but has undefined role/residenciaId or unknown role combination:", profile);
      router.push('/acceso-no-autorizado?mensaje=Perfil%20incompleto%20o%20rol%20no%20reconocido.');
    }
};

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { user, loading, error, logout } = useAuth(); // Obtenemos la función logout del hook
  const [profile, setProfile] = useState<Usuario | null>(null);
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
      if (!profile && !profileLoading) {
        console.log("User authenticated (client-side), fetching profile...");
        setProfileLoading(true);
        const userDocRef = doc(db, "users", user.uid);
        getDoc(userDocRef)
          .then(async (userDocSnap) => {
            if (userDocSnap.exists()) {
              console.log("Profile fetched successfully.");
              const userProfileData = userDocSnap.data() as Usuario;
              try {
                await updateDoc(userDocRef, { timestampUltimoIngreso: new Date().toISOString() });
                setProfile(userProfileData);
              } catch (updateError) {
                console.error("Error updating timestampUltimoIngreso:", updateError);
                setProfile(userProfileData); // Set profile even if update fails
              }
            } else {
              console.error("User profile not found in Firestore for UID:", user.uid);
              setProfile(null);
              toast({
                  title: "Error de Perfil",
                  description: "No se encontró tu perfil de usuario. Contacta al administrador.",
                  variant: "destructive",
              });
              await logout(); // Usamos la función logout del hook
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
            await logout(); // Usamos la función logout del hook
          })
          .finally(() => {
            setProfileLoading(false);
          });

      } else if (profile) {
        console.log("User authenticated (client-side) and profile loaded, redirecting...");
        redirectToDashboard(profile, router);
      }
    } else {
      setProfile(null);
      setProfileLoading(false);
      console.log("User is signed out (client-side), staying on login page.");
    }
  }, [user, loading, error, profile, profileLoading, router, toast, logout]);


  // --- SIMPLIFIED Login Handler ---
  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email || !password) {
      toast({ title: "Faltan Datos", description: "Introduce email y contraseña.", variant: "destructive" });
      return;
    }
    setIsLoginLoading(true);
    try {
      // 1. Inicia sesión en el cliente.
      await signInWithEmailAndPassword(auth, email, password);

      // 2. ¡Listo! El hook `useAuth` se activará, llamará a `/api/auth/login`
      //    y el `useEffect` de esta página gestionará la carga del perfil y la redirección.
      toast({
        title: "Inicio de sesión exitoso",
        description: `Bienvenido de nuevo. Redirigiendo...`,
      });

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
      } else {
          errorMessage = loginError.message || "Error de conexión o del servidor.";
      }
      toast({ title: "Error de inicio de sesión", description: errorMessage, variant: "destructive" });
    } finally {
      setIsLoginLoading(false);
    }
  };

  // --- Render Logic ---
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

  if (initialAuthCheckDone && user && !profile && !profileLoading) {
     return (
       <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
         <p className="text-red-600 mb-4">
            Hubo un problema al cargar tu perfil de usuario. Esto puede impedir el acceso completo a la aplicación.
         </p>
         <p className="text-sm text-gray-700 mb-6">Por favor, intenta recargar la página o contacta al soporte si el problema persiste.</p>
         <Button variant="outline" onClick={async () => {
             setIsLoginLoading(true);
             await logout(); // Simplemente llamamos a la función logout del hook
         }} className="mt-4" disabled={isLoginLoading}>
            {isLoginLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Cerrar sesión e intentar de nuevo
         </Button>
       </div>
     );
  }

  return null; // Default fallback
}
