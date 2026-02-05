import { doc, DocumentReference } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Residencia, UserProfile } from '../../../../shared/models/types';
import { useAvailableUsers } from './hooks/useAvailableUsers';
import { useComidasData } from './hooks/useComidasData';
import UserSelector from './components/UserSelector';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';

interface ElegirComidasClientProps {
  residenciaId: string;
}

const ElegirComidasClient = ({ residenciaId }: ElegirComidasClientProps) => {
  const router = useRouter();
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);

  // --- Core Hooks ---
  const { user: authUser, loading: authLoading, claims, error} = useAuth();

  // --- Data Fetching Hooks ---
  const residenciaRef = useMemo(() => 
    doc(db, 'residencias', residenciaId) as DocumentReference<Residencia>
  , [residenciaId]);
  
  const { 
    availableUsers, 
    loggedUserProfile,
    loading: usersLoading, 
    error: usersError 
  } = useAvailableUsers(authUser, residenciaId, residencia);

  const { 
    semanarioUI, 
    userMealPermissions,
    loading: comidasLoading, 
    error: comidasError 
  } = useComidasData(residencia, residenciaId, selectedUser);

  // --- Effects ---

  // Effect to auto-select user if only one is available or if the logged-in user is in the list
  useEffect(() => {
    if (usersLoading || selectedUser) return;

    if (availableUsers.length === 1) {
      setSelectedUser(availableUsers[0]);
    } else if (loggedUserProfile && availableUsers.some(u => u.id === loggedUserProfile.id)) {
      // If the logged in user is in the list, pre-select them.
      // setSelectedUser(loggedUserProfile); 
      // Commented out to allow directors/assistants to have a clean start
    }
  }, [availableUsers, usersLoading, selectedUser, loggedUserProfile]);
  
  // Validation Effect
  useEffect(() => {
    if (authLoading || usersLoading) return;
    if (!authUser || usersError) {
      router.push(`/acceso-no-autorizado?mensaje=${encodeURIComponent(usersError?.message || 'Error de autenticación.')}`);
      return;
    }
    const allowedRoles = ['residente', 'director', 'asistente'];
    const hasRequiredRole = loggedUserProfile?.roles?.some(role => allowedRoles.includes(role));
    if (!usersLoading && !hasRequiredRole) {
       router.push(`/acceso-no-autorizado?mensaje=${encodeURIComponent('No tienes permisos para esta página.')}`);
    }
  }, [authUser, authLoading, usersLoading, loggedUserProfile, usersError, router]);


  // --- Render Logic ---

  const handleUserChange = (userId: string) => {
    const user = availableUsers.find(u => u.id === userId);
    setSelectedUser(user || null);
  };
  
  const isLoading = authLoading || licenciaLoading || residenciaLoading;
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p>Cargando datos iniciales...</p>
        </div>
      </div>
    );
  }

  if (!puedeOperar) {
    return (
      <div className="flex h-screen items-center justify-center p-4">
        <div className="max-w-md text-center border p-6 rounded-lg shadow-md bg-white">
          <h1 className="text-xl font-bold text-red-600 mb-2">Acceso Restringido</h1>
          <p className="text-gray-700">{motivoBloqueo || "No se puede acceder a esta residencia."}</p>
        </div>
      </div>
    );
  }

  const componentContainerStyle: React.CSSProperties = {
    border: '1px solid #ccc',
    padding: '10px',
    margin: '10px 0',
    borderRadius: '8px',
  };
  
  const placeholderContentStyle: React.CSSProperties = {
      minWidth: '500px',
      height: '100px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#999'
  };

  return (
    <div style={{ padding: '20px' }}>
      <h1>Selección de comidas {residencia ? `(Residencia: ${residencia.nombre})` : ''}</h1>
      
      <div style={componentContainerStyle}>
        <h2>1. Seleccione un usuario</h2>
        <UserSelector 
            availableUsers={availableUsers}
            selectedUser={selectedUser}
            onUserChange={handleUserChange}
            loading={usersLoading}
        />
      </div>

      {selectedUser && (
        <>
            {comidasLoading ? (
                 <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center z-50 p-4">
                    <div className="bg-card p-6 sm:p-8 rounded-lg shadow-xl text-card-foreground flex flex-col items-center max-w-md w-full">
                    <Loader2 className="h-10 w-10 sm:h-12 sm:w-12 animate-spin text-primary mb-5" />
                    <h3 className="text-lg sm:text-xl font-semibold text-center mb-2">
                        Preparando el horario de {selectedUser.nombreCorto}...
                    </h3>
                    <p className="text-xs sm:text-sm text-muted-foreground text-center">
                        Un momento, estamos organizando las delicias... 🍳🥘🥗
                    </p>
                    </div>
                </div>
            ) : comidasError ? (
                <div className="text-red-500">Error al cargar los datos de comidas: {comidasError.message}</div>
            ) : (
            <>
                {/* A partir de aquí, los datos semanarioUI y userMealPermissions están disponibles */}
                <div style={componentContainerStyle}>
                    <h2>2. Weekly Schedule Component (Semanario)</h2>
                    <div style={placeholderContentStyle}>Placeholder for Weekly Schedule.</div>
                    {/* <pre>{JSON.stringify(semanarioUI, null, 2)}</pre> */}
                </div>
                <div style={componentContainerStyle}>
                    <h2>3. Exceptions Component (Elecciones/Specific Choices)</h2>
                    <div style={placeholderContentSyle}>Placeholder for Exceptions/Specific Choices.</div>
                </div>

                <div style={componentContainerStyle}>
                    <h2>4. Absences Component</h2>
                    <div style={placeholderContentStyle}>Placeholder for Absences.</div>
                </div>
                
                <div style={componentContainerStyle}>
                    <h2>5. Comments Component</h2>
                    <div style={placeholderContentStyle}>Placeholder for Comments.</div>
                </div>
                <div style={componentContainerStyle}>
                    <h2>6. Activities Component</h2>
                    <div style={placeholderContentStyle}>Placeholder for Activities.</div>
                </div>

                <div style={componentContainerStyle}>
                    <h2>7. Meal Request Component</h2>
                    <div style={placeholderContentStyle}>Placeholder for Meal Request.</div>
                </div>
            </>
            )}
        </>
      )}
    </div>
  );
};

export default ElegirComidasClient;