// src/app/admin/residencia/page.tsx
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { UserProfile } from '@/models/firestore';
import { doc, getDoc } from 'firebase/firestore'; // Added getDoc

import { Button } from "@/components/ui/button";
import { Loader2, AlertCircle } from 'lucide-react';

export default function ResidenciaAdminPage() {
  console.log('ResidenciaAdminPage STAGE 2: Attempting to initialize profile states and effects.');

  const router = useRouter();
  const { toast } = useToast();
  const [authUser, authFirebaseLoading, authFirebaseError] = useAuthState(auth);

  // --- State for User Profile ---
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState<boolean>(true); // Initialize to true
  const [profileError, setProfileError] = useState<string | null>(null);
  const [isAuthorized, setIsAuthorized] = useState<boolean>(false); // Will be set by the next effect

  // --- useEffect: Handle Auth State & Fetch Profile ---
  useEffect(() => {
    console.log("PROFILE_EFFECT: Start. authFirebaseLoading:", authFirebaseLoading, "authUser:", !!authUser, "profileLoading (initial):", profileLoading);

    if (authFirebaseLoading) {
      console.log("PROFILE_EFFECT: auth is loading, ensuring profileLoading is true.");
      // setProfileLoading(true); // Already true by default or from previous run, but good to be explicit if needed
      return; // Wait for auth to settle
    }

    if (authFirebaseError) {
      console.error("PROFILE_EFFECT: Firebase Auth Error:", authFirebaseError);
      toast({ title: "Error de Autenticación", description: authFirebaseError.message, variant: "destructive" });
      setProfileLoading(false);
      setUserProfile(null);
      setProfileError(authFirebaseError.message);
      // router.replace('/'); // Consider moving redirects to render logic or a separate effect
      return;
    }

    if (!authUser) {
      console.log("PROFILE_EFFECT: No authUser. Setting profileLoading false.");
      setProfileLoading(false);
      setUserProfile(null);
      setProfileError(null); // Clear any previous error
      // router.replace('/');
      return;
    }

    // Auth user is present, proceed to fetch profile if not already fetched
    console.log("PROFILE_EFFECT: Auth user present (UID:", authUser.uid,"), fetching profile...");
    // setProfileLoading(true); // Set true before async operation

    const userDocRef = doc(db, "users", authUser.uid);
    getDoc(userDocRef)
      .then((docSnap) => {
        if (docSnap.exists()) {
          setUserProfile(docSnap.data() as UserProfile);
          console.log("PROFILE_EFFECT: Profile fetched successfully:", docSnap.data());
          setProfileError(null); // Clear any previous error
        } else {
          console.error("PROFILE_EFFECT: Profile document not found for UID:", authUser.uid);
          setUserProfile(null);
          setProfileError("Perfil de usuario no encontrado en Firestore.");
          toast({ title: "Error de Perfil", description: "No se encontró tu perfil de usuario.", variant: "destructive" });
        }
      })
      .catch((error) => {
        console.error("PROFILE_EFFECT: Error fetching profile:", error);
        setUserProfile(null);
        setProfileError(`Error al cargar el perfil: ${error.message}`);
        toast({ title: "Error al Cargar Perfil", description: `No se pudo cargar tu perfil: ${error.message}`, variant: "destructive" });
      })
      .finally(() => {
        setProfileLoading(false);
        console.log("PROFILE_EFFECT: Profile fetch attempt finished. profileLoading set to false.");
      });
  }, [authUser, authFirebaseLoading, authFirebaseError, router, toast]); // Removed db, getDoc from deps for now

  // --- Basic Render Logic based on Profile Loading and Auth ---
  if (profileLoading && authFirebaseLoading) { // Still waiting for auth OR profile
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2">Cargando (Auth)...</span>
      </div>
    );
  }
  
  if (profileLoading) { // Auth is done, but profile is still loading
      return (
          <div className="flex items-center justify-center min-h-screen">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="ml-2">Cargando perfil...</span>
          </div>
      );
  }

  if (authFirebaseError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h1 className="text-2xl font-bold text-destructive mb-2">Error de Autenticación</h1>
        <p className="mb-4 text-destructive max-w-md">{authFirebaseError.message}</p>
        <Button onClick={() => router.push('/')}>Volver al Inicio</Button>
      </div>
    );
  }

  if (profileError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h1 className="text-2xl font-bold text-destructive mb-2">Error de Perfil</h1>
        <p className="mb-4 text-destructive max-w-md">{profileError}</p>
        <Button onClick={() => router.push('/')}>Volver al Inicio</Button>
      </div>
    );
  }

  if (!authUser) {
    // This case might be handled by redirection in useEffect or a dedicated auth guard in a real app
    // For now, useEffect handles the redirection logic for !authUser.
    // This render is a fallback or if redirection is delayed.
     useEffect(() => {
        if (!authFirebaseLoading && !authUser) {
            console.log("RENDER_REDIRECT: No authUser, redirecting to /");
            router.replace('/');
        }
    }, [authFirebaseLoading, authUser, router]);

    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2">Redirigiendo...</span>
      </div>
    );
  }

  // If we reach here, authUser exists and profile should be loaded (or an error handled)
  return (
    <div>
      <h1>Residencia Admin - Stage 2 Clear</h1>
      <p>User: {authUser.email}</p>
      {userProfile ? (
        <p>Profile: {userProfile.nombre} {userProfile.apellido} (Roles: {userProfile.roles?.join(', ')})</p>
      ) : (
        <p>No profile data loaded, but auth succeeded.</p>
      )}
      <Button onClick={() => auth.signOut()}>Sign Out (Test)</Button>
    </div>
  );
}
