// src/app/admin/residencia/page.tsx
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { UserProfile, Residencia, UserRole } from '@/models/firestore'; // Added Residencia, UserRole
import { doc, getDoc, collection, query, where, orderBy, getDocs } from 'firebase/firestore'; // Added more firestore imports

import { Button } from "@/components/ui/button";
import { Loader2, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"; // For listing residences

export default function ResidenciaAdminPage() {
  console.log('ResidenciaAdminPage STAGE 3: Reintegrating Authorization and Residencia Fetching.');

  const router = useRouter();
  const { toast } = useToast();
  const [authUser, authFirebaseLoading, authFirebaseError] = useAuthState(auth);

  // --- Profile State (from Stage 2 - working) ---
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState<boolean>(true);
  const [profileError, setProfileError] = useState<string | null>(null);

  // --- Authorization State ---
  const [isAuthorized, setIsAuthorized] = useState<boolean>(false);

  // --- Residences State ---
  const [residences, setResidences] = useState<Residencia[]>([]);
  const [isLoadingResidences, setIsLoadingResidences] = useState<boolean>(false); // Initially false, true during fetch
  const [errorResidences, setErrorResidences] = useState<string | null>(null);
  const [hasAttemptedFetchResidences, setHasAttemptedFetchResidences] = useState<boolean>(false);

  // --- useEffect: Handle Auth State & Fetch Profile (from Stage 2 - working) ---
  useEffect(() => {
    // console.log("PROFILE_EFFECT: Start. authFirebaseLoading:", authFirebaseLoading, "authUser:", !!authUser);
    if (authFirebaseLoading) {
      // console.log("PROFILE_EFFECT: auth is loading.");
      setProfileLoading(true); // Ensure profileLoading is true while auth is loading
      return;
    }
    if (authFirebaseError) {
      // console.error("PROFILE_EFFECT: Firebase Auth Error:", authFirebaseError);
      toast({ title: "Error de Autenticación", description: authFirebaseError.message, variant: "destructive" });
      setProfileLoading(false); setUserProfile(null); setProfileError(authFirebaseError.message);
      return;
    }
    if (!authUser) {
      // console.log("PROFILE_EFFECT: No authUser. Setting profileLoading false.");
      setProfileLoading(false); setUserProfile(null); setProfileError(null);
      // Redirection will be handled by render logic or a dedicated effect
      return;
    }
    // console.log("PROFILE_EFFECT: Auth user present (UID:", authUser.uid,"), fetching profile...");
    // setProfileLoading(true); // Already true or set above
    const userDocRef = doc(db, "users", authUser.uid);
    getDoc(userDocRef)
      .then((docSnap) => {
        if (docSnap.exists()) {
          setUserProfile(docSnap.data() as UserProfile);
          // console.log("PROFILE_EFFECT: Profile fetched successfully:", docSnap.data());
          setProfileError(null);
        } else {
          // console.error("PROFILE_EFFECT: Profile document not found for UID:", authUser.uid);
          setUserProfile(null); setProfileError("Perfil de usuario no encontrado.");
          toast({ title: "Error de Perfil", description: "No se encontró tu perfil de usuario.", variant: "destructive" });
        }
      })
      .catch((error) => {
        // console.error("PROFILE_EFFECT: Error fetching profile:", error);
        setUserProfile(null); setProfileError(`Error al cargar el perfil: ${error.message}`);
        toast({ title: "Error al Cargar Perfil", description: `No se pudo cargar tu perfil: ${error.message}`, variant: "destructive" });
      })
      .finally(() => {
        setProfileLoading(false);
        // console.log("PROFILE_EFFECT: Profile fetch attempt finished. profileLoading set to false.");
      });
  }, [authUser, authFirebaseLoading, authFirebaseError, toast]); // Removed router, it's stable

  // --- Fetch Residences Function ---
  const fetchResidences = useCallback(async () => {
    console.log("AUTH_RESIDENCIA_EFFECT: fetchResidences called.");
    if (!userProfile || !isAuthorized) { // Don't fetch if not authorized or profile not loaded
        console.log("AUTH_RESIDENCIA_EFFECT: Skipping fetchResidences - not authorized or no profile.");
        return;
    }
    setIsLoadingResidences(true);
    setErrorResidences(null);
    setHasAttemptedFetchResidences(true);
    try {
      let residencesQuery;
      // Master sees all, admin sees only their assigned one (if ID exists)
      if (userProfile.roles?.includes('master')) {
        residencesQuery = query(collection(db, 'residencias'), orderBy("nombre"));
        console.log("AUTH_RESIDENCIA_EFFECT: Fetching all residences for master user.");
      } else if (userProfile.roles?.includes('admin') && userProfile.residenciaId) {
        residencesQuery = query(collection(db, 'residencias'), where("id", "==", userProfile.residenciaId));
        console.log(`AUTH_RESIDENCIA_EFFECT: Fetching residence ${userProfile.residenciaId} for admin user.`);
      } else if (userProfile.roles?.includes('admin') && !userProfile.residenciaId) {
        console.warn("AUTH_RESIDENCIA_EFFECT: Admin user has no residenciaId. No residences to fetch.");
        setResidences([]); // Admin with no residenciaId sees no residencias
        setIsLoadingResidences(false);
        return;
      } else {
        console.warn("AUTH_RESIDENCIA_EFFECT: User is not master or admin with residenciaId. No residences to fetch for this role combination.");
        setResidences([]);
        setIsLoadingResidences(false);
        return;
      }

      const residenceSnapshot = await getDocs(residencesQuery);
      const fetchedResidences: Residencia[] = residenceSnapshot.docs.map(doc => ({
        id: doc.id,
        ...(doc.data() as Omit<Residencia, 'id'>)
      }));
      setResidences(fetchedResidences);
      console.log("AUTH_RESIDENCIA_EFFECT: Residences fetched:", fetchedResidences);
    } catch (error) {
      const errorMessage = `Error al cargar residencias. ${error instanceof Error ? error.message : 'Error desconocido'}`;
      console.error("AUTH_RESIDENCIA_EFFECT: Error fetching residences: ", error);
      setErrorResidences(errorMessage);
      toast({ title: "Error", description: "No se pudieron cargar las residencias.", variant: "destructive" });
    } finally {
      setIsLoadingResidences(false);
      console.log("AUTH_RESIDENCIA_EFFECT: fetchResidences finished.");
    }
  }, [toast, userProfile, isAuthorized]); // db is stable, getDocs etc are stable. Added userProfile and isAuthorized

  // --- useEffect: Handle Authorization & Trigger Data Fetch ---
  useEffect(() => {
    console.log("AUTH_RESIDENCIA_EFFECT: Start. profileLoading:", profileLoading, "userProfile:", !!userProfile);
    if (profileLoading) {
      console.log("AUTH_RESIDENCIA_EFFECT: Waiting for profile to load...");
      setIsAuthorized(false); // Cannot determine authorization until profile is loaded
      return;
    }

    if (!userProfile) {
      console.log("AUTH_RESIDENCIA_EFFECT: No user profile. Cannot authorize or fetch data.");
      setIsAuthorized(false); // No profile, so not authorized for this page's content
      // Note: Redirection for !authUser happens in profile effect or render logic
      return;
    }

    const roles = userProfile.roles || [];
    // Page access logic: 'master' can always access. 'admin' can access.
    const canAccessPage = roles.includes('master') || roles.includes('admin');

    if (canAccessPage) {
      console.log("AUTH_RESIDENCIA_EFFECT: User is authorized for page access (master or admin).");
      setIsAuthorized(true);
      // Fetch data only if authorized and not already attempted.
      // The fetchResidences function itself will check userProfile.residenciaId for admins.
      if (!hasAttemptedFetchResidences && !isLoadingResidences) {
         console.log("AUTH_RESIDENCIA_EFFECT: Triggering fetchResidences.");
        fetchResidences();
      } else {
        console.log("AUTH_RESIDENCIA_EFFECT: Residences already fetched/fetching or attempt made. hasAttempted:", hasAttemptedFetchResidences, "isLoading:", isLoadingResidences);
      }
    } else {
      console.warn("AUTH_RESIDENCIA_EFFECT: User not authorized for this page (not master or admin).");
      setIsAuthorized(false);
      toast({ title: "Acceso Denegado", description: "No tienes los permisos (master o admin) para esta página.", variant: "destructive" });
      // Render logic will handle showing "Acceso Denegado" or redirecting.
    }
  }, [userProfile, profileLoading, fetchResidences, hasAttemptedFetchResidences, isLoadingResidences, toast]); // Added necessary deps

  // --- Render Logic ---
  if (authFirebaseLoading || (profileLoading && !profileError && authUser)) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2">{authFirebaseLoading ? 'Cargando autenticación...' : 'Cargando perfil...'}</span>
      </div>
    );
  }

  if (authFirebaseError) { /* ... error handling ... */ }
  if (profileError && !profileLoading) { /* ... error handling ... */ }
  
  // Handle redirection if user is not authenticated (profile effect sets profileLoading to false)
    useEffect(() => {
        if (!authFirebaseLoading && !profileLoading && !authUser) {
            console.log("RENDER_REDIRECT: No authUser after loads, redirecting to /");
            router.replace('/');
        }
    }, [authFirebaseLoading, profileLoading, authUser, router]);

   if (!authFirebaseLoading && !profileLoading && !authUser) {
        return ( // Fallback UI during redirection
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span className="ml-2">Redirigiendo...</span>
            </div>
        );
    }


  if (!isAuthorized && authUser && userProfile) { // User is authenticated, profile loaded, but not authorized for THIS page
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h1 className="text-2xl font-bold text-destructive mb-2">Acceso Denegado</h1>
        <p className="mb-4 text-muted-foreground max-w-md">
          Tu perfil (<span className="font-medium">{userProfile.email}</span>) no tiene los roles necesarios ('master' o 'admin') para acceder a esta sección.
        </p>
        <Button onClick={() => router.push('/')}>Volver al Inicio</Button>
        <Button onClick={() => auth.signOut()} variant="outline" className="mt-2">Cerrar Sesión</Button>
      </div>
    );
  }
  
  // If we reach here, user should be authenticated, profile loaded, and authorized
  // Now, handle residences loading state
  if (isLoadingResidences && isAuthorized) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2">Cargando residencias...</span>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex justify-between items-center">
        <div>
            <h1 className="text-3xl font-bold">Gestión de Residencias</h1>
            <p className="text-muted-foreground">Usuario: {userProfile?.email} (Roles: {userProfile?.roles?.join(', ') || 'N/A'})</p>
        </div>
        <Button onClick={() => auth.signOut()} variant="outline">Cerrar Sesión</Button>
      </div>

      {userProfile?.roles?.includes('master') && (
        <Card>
          <CardHeader><CardTitle>Crear Nueva Residencia (Master)</CardTitle></CardHeader>
          <CardContent>
            {/* TODO: Add form for creating new residence here */}
            <p>Formulario para crear residencia (solo para Master) irá aquí.</p>
            <Button>+ Nueva Residencia</Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Lista de Residencias</CardTitle></CardHeader>
        <CardContent>
          {errorResidences && <p className="text-destructive">Error al cargar residencias: {errorResidences}</p>}
          {!isLoadingResidences && residences.length === 0 && !errorResidences && (
            <p>No hay residencias para mostrar.</p>
          )}
          {!isLoadingResidences && residences.length > 0 && (
            <ul>
              {residences.map(res => (
                <li key={res.id} className="border p-2 my-1 rounded">
                  {res.nombre} (ID: {res.id})
                  {/* Admin can only edit their own - Master can edit any */}
                  {(userProfile?.roles?.includes('master') || (userProfile?.roles?.includes('admin') && userProfile.residenciaId === res.id)) && (
                     <Button variant="outline" size="sm" className="ml-2">Editar</Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      {/* Fallback if something unexpected happens, and no other condition renders */}
      {!isAuthorized && !authUser && <p>Por favor, inicia sesión.</p>}
    </div>
  );
}
