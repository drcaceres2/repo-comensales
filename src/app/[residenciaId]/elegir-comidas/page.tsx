'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { doc, DocumentReference } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import { useDocumentSubscription } from '@/hooks/useDataSubscription';
import { useAvailableUsers } from './hooks/useAvailableUsers';
import UserSelector from './components/UserSelector';
import { MealPlannerContainer } from './components/MealPlannerContainer';
import { Loader2 } from 'lucide-react';
import { UserId, Residencia } from '../../../../shared/models/types';

export default function ElegirComidasPage() {
  const params = useParams();
  const residenciaId = params.residenciaId as string;
  
  const { user: authUser, loading: authLoading } = useAuth();
  const [selectedUserId, setSelectedUserId] = useState<UserId | null>(null);

  // --- Data Fetching ---
  // 1. Get a reference to the Residencia document
  const residenciaRef = useMemo(() => 
    doc(db, 'residencias', residenciaId) as DocumentReference<Residencia>
  , [residenciaId]);
  
  // 2. Subscribe to the Residencia document
  const { data: residencia, loading: residenciaLoading, error: residenciaError } = useDocumentSubscription<Residencia>(residenciaRef);

  // 3. Get the list of users available to the logged-in user
  const { 
    availableUsers, 
    loggedUserProfile,
    loading: usersLoading, 
    error: usersError 
  } = useAvailableUsers(authUser, residenciaId, residencia);

  // Effect to auto-select user if only one is available
  useEffect(() => {
    if (usersLoading || selectedUserId) return;
    if (availableUsers.length === 1) {
      setSelectedUserId(availableUsers[0].id);
    }
  }, [availableUsers, usersLoading, selectedUserId]);

  const handleUserChange = (userId: string) => {
    setSelectedUserId(userId);
  };
  
  const isLoading = authLoading || usersLoading || residenciaLoading;
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p>Cargando datos de usuario...</p>
        </div>
      </div>
    );
  }

  const combinedError = usersError || residenciaError;
  if (combinedError) {
    return <div className="text-red-500 p-4">Error al cargar datos: {combinedError.message}</div>;
  }

  return (
    <div className="p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">
          Selección de Comidas {residencia ? `- ${residencia.nombre}`: ''}
        </h1>
        <div className="p-4 border rounded-lg bg-card shadow-sm mb-6">
          <h2 className="text-lg font-semibold mb-2">Usuario a gestionar</h2>
          <UserSelector 
              availableUsers={availableUsers}
              selectedUserId={selectedUserId}
              onUserChange={handleUserChange}
              loading={usersLoading}
          />
        </div>

        {selectedUserId && (
          <MealPlannerContainer 
            key={selectedUserId} // CRITICAL: This unmounts and remounts the component on user change
            userId={selectedUserId}
            residenciaId={residenciaId}
          />
        )}
      </div>
    </div>
  );
};