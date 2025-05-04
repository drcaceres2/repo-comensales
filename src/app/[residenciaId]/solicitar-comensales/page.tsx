'use client'; // Make it a client component

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation'; // Import useRouter and useParams
import { Loader2 } from 'lucide-react'; // For loading state

// Firebase Imports
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase'; // Your initialized instances

// Model Imports
import { UserProfile, UserRole, ResidenciaId } from '@/models/firestore';

export default function SolicitarComensalesPage() {
  const router = useRouter();
  const params = useParams();
  const residenciaIdFromUrl = params.residenciaId as ResidenciaId; // Get residenciaId from URL

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        // User is signed in, check authorization
        try {
          const userDocRef = doc(db, "users", user.uid);
          const userDocSnap = await getDoc(userDocRef);

          if (userDocSnap.exists()) {
            const userProfile = userDocSnap.data() as UserProfile;
            const roles = userProfile.roles || [];

            // Authorization Check: Must be director AND belong to this residence
            if (roles.includes('director' as UserRole) && userProfile.residenciaId === residenciaIdFromUrl) {
              console.log(`User ${user.uid} authorized as director for residence ${residenciaIdFromUrl}.`);
              setIsAuthorized(true);
            } else {
              console.warn(`User ${user.uid} is not an authorized director for residence ${residenciaIdFromUrl}. Profile:`, userProfile);
              setIsAuthorized(false);
            }
          } else {
            // No profile found in Firestore
            console.error(`No Firestore profile found for authenticated user ${user.uid}.`);
            setIsAuthorized(false);
          }
        } catch (error) {
          console.error("Error fetching user profile for authorization:", error);
          setIsAuthorized(false);
        } finally {
          setIsLoading(false);
        }
      } else {
        // No user is signed in
        setCurrentUser(null);
        setIsAuthorized(false);
        setIsLoading(false);
        console.log("No user signed in, redirecting to login.");
        router.push('/'); // Redirect to login page
      }
    });

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, [router, residenciaIdFromUrl]); // Depend on router and residenciaIdFromUrl

  // --- Render Logic ---

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2">Verificando acceso...</span>
      </div>
    );
  }

  if (!isAuthorized) {
    // Although the redirect might happen, show an access denied message as fallback
    return (
      <div className="container mx-auto p-4 text-center">
        <h1 className="text-2xl font-bold text-destructive mb-4">Acceso Denegado</h1>
        <p className="text-muted-foreground">No tienes permiso para acceder a esta página o la residencia no coincide.</p>
        {/* Optionally add a button to go back or to login */}
         <button onClick={() => router.push('/')} className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90">
            Ir al Inicio
         </button>
      </div>
    );
  }

  // Render actual page content if authorized
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Solicitud de Comensales para Residencia: {residenciaIdFromUrl}</h1>
      <p className="text-muted-foreground">Página en construcción.</p>
      {/* TODO: Implement form/logic for directors to request meal counts */}
      {/* You can now safely use 'currentUser' if needed (e.g., currentUser.uid) */}
    </div>
  );
}
