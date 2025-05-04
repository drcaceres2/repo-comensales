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
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react"; // Import loader icon

// --- Firebase Imports ---
// Import onAuthStateChanged
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, User } from "firebase/auth";
import { getFirestore, doc, getDoc, collection, getDocs, query, where } from "firebase/firestore";
import { auth, db } from '@/lib/firebase'; // Import initialized instances

// --- Model Imports ---
// Make sure UserRole is imported correctly if it's an enum/type
import { UserProfile, UserRole, ResidenciaId } from '@/models/firestore';

// --- LOGO URL ---
const LOGO_URL = "https://firebasestorage.googleapis.com/v0/b/comensales-residencia.firebasestorage.app/o/imagenes%2Fcomensales-logo.png?alt=media&token=d8d50163-1817-45b1-be6e-b43541118347";

// Helper function to redirect based on profile
const redirectToDashboard = (profile: UserProfile, router: ReturnType<typeof useRouter>) => {
    // Check UserRole definition. Assuming it's a string literal type for includes check.
    // If UserRole is an enum, the check might need adjustment (e.g., profile.roles?.includes(UserRole.Admin))
    const roles = profile.roles || [];
    const residenciaId = profile.residenciaId;

    if (roles.includes('admin' as UserRole) || roles.includes('master' as UserRole)) { // Treat master and admin similarly for initial redirect
      router.push('/admin/users');
    } else if (roles.includes('director' as UserRole) && residenciaId) {
      router.push(`/${residenciaId}/solicitar-comensales`); // Redirect director here
    } else if (roles.includes('residente' as UserRole) && residenciaId) {
      router.push(`/${residenciaId}/elegir-comidas`);
    } else {
      // Fallback if roles/residenciaId are missing or unexpected
      console.warn("User logged in but has undefined role/residenciaId or unknown role combination:", profile);
      // Redirect to a generic logged-in page or profile page might be better than login
       router.push('/dashboard'); // Example: redirect to a generic dashboard
      // Or show a specific error/message
    }
};

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false); // For login button specifically
  const [isCheckingAuth, setIsCheckingAuth] = useState(true); // Initial auth check state

  // --- Auth State Listener ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        console.log("Auth state changed: User detected", user.uid);
        try {
          // User is signed in, fetch profile and redirect
          const userDocRef = doc(db, "users", user.uid);
          const userDocSnap = await getDoc(userDocRef);

          if (userDocSnap.exists()) {
            const userProfile = userDocSnap.data() as UserProfile;
            console.log("User profile found:", userProfile);
            redirectToDashboard(userProfile, router);
            // No need to setIsCheckingAuth(false) here, redirection handles it
          } else {
            // User exists in Auth but not Firestore - critical error
            console.error(`Auth user ${user.uid} exists but no Firestore profile found.`);
            toast({
              title: "Error de Perfil",
              description: "Tu cuenta de autenticación existe, pero falta tu perfil de usuario. Contacta al administrador.",
              variant: "destructive",
              duration: 7000
            });
            await auth.signOut(); // Log out inconsistent user
            setIsCheckingAuth(false); // Allow login form to show after logout
          }
        } catch (error) {
          console.error("Error fetching user profile during auth check:", error);
          toast({
              title: "Error",
              description: "No se pudo verificar tu perfil. Inténtalo de nuevo.",
              variant: "destructive"
          });
          // Log out if profile check fails? Maybe depends on security policy
          await auth.signOut();
          setIsCheckingAuth(false); // Allow login form
        }
      } else {
        // User is signed out
        console.log("Auth state changed: No user detected.");
        setIsCheckingAuth(false); // Auth check complete, allow rendering
      }
    });

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, [router, toast]); // Add dependencies

  // --- Firebase Login Handler ---
  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email || !password) {
      toast({
        title: "Faltan Datos",
        description: "Por favor, introduce tu email y contraseña.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      // 1. Authenticate User
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      console.log("Login successful for user:", user.uid);

      // 2. Fetch User Profile (Already handled by onAuthStateChanged, but we can re-verify here or rely on the listener)
       // The onAuthStateChanged listener should ideally handle the redirect immediately after successful sign-in.
       // If relying solely on the listener, we might just need to show a loading state here until redirection happens.
       // However, fetching again ensures immediate feedback if the listener logic has issues. Let's fetch again for robustness.

      const userDocRef = doc(db, "users", user.uid);
      const userDocSnap = await getDoc(userDocRef);

      if (userDocSnap.exists()) {
        const userProfile = userDocSnap.data() as UserProfile;
        toast({
          title: "Inicio de sesión exitoso",
          description: `Bienvenido, ${userProfile.nombre || 'usuario'}.`, // Simpler message, redirection handles next step
        });
        // Redirection is handled by the onAuthStateChanged listener now
        // redirectToDashboard(userProfile, router); // Remove explicit redirect from here
      } else {
         // This case should ideally not happen if registration ensures profile creation
         console.error(`Login successful for UID ${user.uid}, but no corresponding user document found in Firestore.`);
         toast({
            title: "Error de perfil",
            description: "Tu cuenta existe, pero no se encontró tu perfil de usuario. Por favor, contacta al administrador.",
            variant: "destructive",
         });
         await auth.signOut(); // Log out user if profile is missing
      }

    } catch (error: any) {
      console.error("Login failed:", error.code, error.message);
      let errorMessage = "Ha ocurrido un error al iniciar sesión.";
      switch (error.code) {
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
         // Add Firestore specific errors if necessary, e.g., permission denied during getDoc
         // case 'permission-denied': // Example for Firestore error code
         //    errorMessage = "No tienes permiso para acceder a los datos del perfil.";
         //    break;
        default:
          errorMessage = `Error inesperado (${error.code || 'desconocido'}). Por favor, inténtalo de nuevo.`;
      }
      toast({
        title: "Error de inicio de sesión",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };
  // --- End Firebase Login Handler ---

  // --- Render Logic ---
  // Show loading indicator while checking auth state initially
  if (isCheckingAuth) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2">Verificando sesión...</span>
      </div>
    );
  }

  // Render login form if auth check is complete and no user is logged in
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
                disabled={isLoading}
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
                disabled={isLoading}
                autoComplete="current-password"
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {isLoading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
