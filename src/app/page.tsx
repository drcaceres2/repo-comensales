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

// --- Firebase Imports ---
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, doc, getDoc, collection, getDocs, query, where } from "firebase/firestore";
import { auth, db } from '@/lib/firebase'; // Import initialized instances

// --- Model Imports ---
import { UserProfile, UserRole, SystemSettings } from '@/models/firestore';

// --- LOGO URL ---
const LOGO_URL = "https://firebasestorage.googleapis.com/v0/b/comensales-residencia.firebasestorage.app/o/imagenes%2Fcomensales-logo.png?alt=media&token=d8d50163-1817-45b1-be6e-b43541118347";

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [masterEmails, setMasterEmails] = useState<string[]>([]);
  const [mailtoLink, setMailtoLink] = useState<string>('#');

  // --- Fetch Master Admin Emails --- (Keep this part)
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const settingsRef = collection(db, 'systemSettings');
        const q = query(settingsRef, where('active', '==', true)); // Assuming an 'active' field
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
          // Use the first active settings document found
          const settingsDoc = querySnapshot.docs[0];
          const settingsData = settingsDoc.data() as SystemSettings;
          if (settingsData.masterAdminEmails && settingsData.masterAdminEmails.length > 0) {
            setMasterEmails(settingsData.masterAdminEmails);
            setMailtoLink(`mailto:${settingsData.masterAdminEmails.join(',')}?subject=Consulta%20Sistema%20Comensales`);
          } else {
             console.warn("System settings found, but no master admin emails configured.");
             setMailtoLink('#'); // Disable link if no emails
          }
        } else {
           console.warn("No active system settings document found.");
           setMailtoLink('#'); // Disable link if no settings
        }
      } catch (error) {
        console.error("Error fetching system settings:", error);
        toast({ title: "Error", description: "No se pudieron cargar los datos de contacto del administrador.", variant: "warning"});
        setMailtoLink('#'); // Disable link on error
      }
    };
    fetchSettings();
  }, [toast]); // Add toast to dependency array if used inside useEffect


  // --- Firebase Login Handler (Updated) ---
  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault(); // Prevent default form submission
    if (!email || !password) {
      toast({
        title: "Error",
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
      const uid = user.uid;

      // 2. Fetch User Profile from Firestore
      const userDocRef = doc(db, "users", uid); // Create reference to user document
      const userDocSnap = await getDoc(userDocRef); // Fetch the document

      if (userDocSnap.exists()) {
        const userProfile = userDocSnap.data() as UserProfile; // Type cast the data

        // 3. Determine Redirection based on Roles & residenciaId
        toast({
          title: "Inicio de sesión exitoso",
          description: `Bienvenido de nuevo, ${userProfile.nombre || 'usuario'}. Redirigiendo...`,
        });

        // Redirection Logic
        if (userProfile.roles?.includes(UserRole.ADMIN)) {
          router.push('/admin/users'); // Redirect Admin to user management
        } else if (userProfile.roles?.includes(UserRole.DIRECTOR) && userProfile.residenciaId) {
          router.push(`/admin/residencia/${userProfile.residenciaId}/horarios`); // Redirect Director to their residence admin page
        } else if (userProfile.roles?.includes(UserRole.RESIDENTE) && userProfile.residenciaId) {
          router.push(`/${userProfile.residenciaId}/elegir-comidas`); // Redirect Resident to meal selection
        } else {
          // Fallback or error if roles/residenciaId are missing or unexpected
          console.warn("User logged in but has undefined role/residenciaId or unknown role combination:", userProfile);
          toast({
            title: "Error de perfil",
            description: "No se pudo determinar a dónde redirigirte. Contacta al administrador.",
            variant: "warning", // Changed to warning
          });
          // Optionally log out or redirect to a generic page
          // await auth.signOut();
          // router.push('/perfil-incompleto');
        }

      } else {
        // Handle case where user exists in Auth but not in Firestore users collection
        console.error(`Login successful for UID ${uid}, but no corresponding user document found in Firestore.`);
        toast({
          title: "Error de perfil",
          description: "Tu cuenta existe, pero no se encontró tu perfil de usuario. Por favor, contacta al administrador.",
          variant: "destructive",
        });
        // Consider logging the user out here if a Firestore profile is absolutely required
         await auth.signOut(); // Log out user if profile is missing
      }

    } catch (error: any) {
      console.error("Login failed:", error);
      let errorMessage = "Ha ocurrido un error al iniciar sesión.";
      // Map Firebase auth errors to user-friendly messages
      switch (error.code) {
        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/invalid-credential': // General invalid credential error
          errorMessage = "El correo electrónico o la contraseña son incorrectos.";
          break;
        case 'auth/invalid-email':
          errorMessage = "El formato del correo electrónico no es válido.";
          break;
        case 'auth/user-disabled':
          errorMessage = "Esta cuenta ha sido deshabilitada.";
          break;
        case 'firestore/permission-denied': // Example Firestore error
             errorMessage = "No tienes permiso para acceder a los datos del perfil.";
             break;
        default:
          // Keep the default message for other errors, including network issues
          errorMessage = `Error inesperado (${error.code || 'Network Error'}). Por favor, inténtalo de nuevo.`;
      }
      toast({
        title: "Error de inicio de sesión",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false); // Ensure loading state is reset
    }
  };
  // --- End Firebase Login Handler ---

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          {LOGO_URL && (
            <Image
              src={LOGO_URL}
              alt="Logo Comensales"
              width={80} // Adjust width as needed
              height={80} // Adjust height as needed
              className="mx-auto mb-4 rounded-full"
              priority // Prioritize loading logo
            />
          )}
          <CardTitle className="text-2xl font-bold">Iniciar Sesión</CardTitle>
          <CardDescription>Accede a tu cuenta de Comensales</CardDescription>
        </CardHeader>
        {/* --- Update Form to use handleLogin --- */}
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
                autoComplete="email" // Standard autocomplete
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                placeholder="Tu contraseña"
                required // Keep required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                autoComplete="current-password" // Standard autocomplete
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
            </Button>
          </CardFooter>
        </form>
         {/* --- End Update Form --- */}
      </Card>

      {/* --- Admin Link --- (Keep this section) */}
      <div className="mt-4 text-center text-sm">
          <a
              href={mailtoLink}
              className={`text-muted-foreground hover:text-primary ${!masterEmails || masterEmails.length === 0 || mailtoLink === '#' ? 'opacity-50 cursor-not-allowed' : ''}`}
              onClick={(e) => (!masterEmails || masterEmails.length === 0 || mailtoLink === '#') && e.preventDefault()} // Prevent click if no emails or link is disabled
              aria-disabled={!masterEmails || masterEmails.length === 0 || mailtoLink === '#'}
              target="_blank" // Open mail client in new tab/window
              rel="noopener noreferrer" // Security measure for target="_blank"
          >
              Escribir al administrador del sistema
          </a>
      </div>
    </div>
  );
}
