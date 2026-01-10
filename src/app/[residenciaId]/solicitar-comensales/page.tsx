'use client'; // Make it a client component

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation'; // Import useRouter and useParams
import { Loader2 } from 'lucide-react'; // For loading state

// Firebase Imports
import { doc } from 'firebase/firestore';
import { db } from '@/lib/firebase'; // Your initialized instances

// Hook Imports
import { useAuth } from '@/hooks/useAuth';
import { useDocumentSubscription } from '@/hooks/useFirebaseData';

// Model Imports
import { UserProfile, UserRole, ResidenciaId } from '../../../../shared/models/types';

export default function SolicitarComensalesPage() {
  const router = useRouter();
  const params = useParams();
  const residenciaIdFromUrl = params.residenciaId as ResidenciaId; // Get residenciaId from URL

  const { user, loading: authLoading, error: authError } = useAuth();
  const userProfileRef = user ? doc(db, "users", user.uid) : null;
  const { loading: profileLoading, error: profileError, value: userProfile } = useDocumentSubscription<UserProfile>(userProfileRef);

  const isLoading = authLoading || profileLoading;
  const hasError = authError || profileError;

  // Authorization Check
  const isAuthorized = userProfile ? (
    (userProfile.roles || []).includes('director' as UserRole) && userProfile.residenciaId === residenciaIdFromUrl
  ) : false;

  // Redirect if no user
  useEffect(() => {
    if (!authLoading && !user) {
      console.log("No user signed in, redirecting to login.");
      router.push('/');
    }
  }, [user, authLoading, router]);

  // --- Render Logic ---

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2">Verificando acceso...</span>
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="container mx-auto p-4 text-center">
        <h1 className="text-2xl font-bold text-destructive mb-4">Error</h1>
        <p className="text-muted-foreground">Ocurrió un error al verificar el acceso. Por favor, intenta de nuevo.</p>
        <button onClick={() => router.push('/')} className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90">
          Ir al Inicio
        </button>
      </div>
    );
  }

  if (!user) {
    // This should not happen due to redirect, but fallback
    return (
      <div className="container mx-auto p-4 text-center">
        <h1 className="text-2xl font-bold text-destructive mb-4">Acceso Denegado</h1>
        <p className="text-muted-foreground">Usuario no autenticado.</p>
        <button onClick={() => router.push('/')} className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90">
          Ir al Inicio
        </button>
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className="container mx-auto p-4 text-center">
        <h1 className="text-2xl font-bold text-destructive mb-4">Acceso Denegado</h1>
        <p className="text-muted-foreground">No tienes permiso para acceder a esta página o la residencia no coincide.</p>
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
      {/* You can now safely use 'user' if needed (e.g., user.uid) */}
    </div>
  );
}
