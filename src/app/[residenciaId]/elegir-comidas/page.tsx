"use client";

import React, { createContext, useContext, useState, useEffect } from 'react';
// Removed useParams from next/navigation
import { useAuthState } from 'react-firebase-hooks/auth';
import { Auth } from 'firebase/auth';
import { Firestore } from 'firebase/firestore'; // Removed doc, getDoc, collection, getDocs
import { auth, db } from '@/lib/firebase';
import withAuth from '@/components/withAuth';
import { UserProfile, PermisosComidaPorGrupo, Semanario, Eleccion, Ausencia, Actividad } from '@/../../shared/models/types';
import SelectorUsuariosEC from './components/SelectorUsuariosEC2';

interface ElegirComidasContextProps {
  loggedUser: UserProfile | null;
  setLoggedUser: React.Dispatch<React.SetStateAction<UserProfile | null>>;
  selectedUser: UserProfile | null;
  setSelectedUser: React.Dispatch<React.SetStateAction<UserProfile | null>>;
  selectedUserMealPermissions: PermisosComidaPorGrupo | null;
  setSelectedUserMealPermissions: React.Dispatch<React.SetStateAction<PermisosComidaPorGrupo | null>>;
  isLoadingLoggedUser: boolean;
  setIsLoadingLoggedUser: React.Dispatch<React.SetStateAction<boolean>>;
  isLoadingSelectedUserData: boolean; // This will be used by individual components for their data
  setIsLoadingSelectedUserData: React.Dispatch<React.SetStateAction<boolean>>;  
  residenciaId: string | null;
  setResidenciaId: React.Dispatch<React.SetStateAction<string | null>>;
  
  userSemanario: Semanario | null;
  setUserSemanario: React.Dispatch<React.SetStateAction<Semanario | null>>;
  userElecciones: Eleccion[];
  setUserElecciones: React.Dispatch<React.SetStateAction<Eleccion[]>>;
  userAusencias: Ausencia[];
  setUserAusencias: React.Dispatch<React.SetStateAction<Ausencia[]>>;
  userActividades: Actividad[];
  setUserActividades: React.Dispatch<React.SetStateAction<Actividad[]>>;
  
  db: Firestore;
  auth: Auth;
}

const ElegirComidasContext = createContext<ElegirComidasContextProps | undefined>(undefined);

export const useElegirComidas = (): ElegirComidasContextProps => {
  const context = useContext(ElegirComidasContext);
  if (!context) {
    throw new Error('useElegirComidas must be used within an ElegirComidasProvider');
  }
  return context;
};

const ElegirComidasPage = () => {
  // residenciaIdParam removed, will be set from UserSelectorComponent via context
  const [authUser, authLoading, authError] = useAuthState(auth);

  const [loggedUser, setLoggedUser] = useState<UserProfile | null>(null);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [selectedUserMealPermissions, setSelectedUserMealPermissions] = useState<PermisosComidaPorGrupo | null>(null);
  const [isLoadingLoggedUser, setIsLoadingLoggedUser] = useState<boolean>(true);
  const [isLoadingSelectedUserData, setIsLoadingSelectedUserData] = useState<boolean>(false);
  
  const [residenciaId, setResidenciaId] = useState<string | null>(null); // Initialized to null
  const [userSemanario, setUserSemanario] = useState<Semanario | null>(null);
  const [userElecciones, setUserElecciones] = useState<Eleccion[]>([]);
  const [userAusencias, setUserAusencias] = useState<Ausencia[]>([]);
  const [userActividades, setUserActividades] = useState<Actividad[]>([]);

  // useEffect for fetching selectedUserData (Semanario, Elecciones, Ausencias, Actividades) has been removed.
  // This logic will be delegated to respective child components.

  if (authLoading) {
    return <div>Loading user authentication...</div>;
  }
  if (authError) {
    return <div>Error loading authentication: {authError.message}</div>;
  }
  if (!authUser) {
    return <div>User not authenticated. Please log in.</div>;
  }
  
  const componentContainerStyle: React.CSSProperties = {
    border: '1px solid #ccc',
    padding: '10px',
    margin: '10px 0',
    overflowX: 'auto',
    whiteSpace: 'nowrap',
  };

  const placeholderContentStyle: React.CSSProperties = {
      minWidth: '500px',
      height: '100px',
      display: 'inline-block' 
  };

  return (
    <ElegirComidasContext.Provider value={{
      loggedUser,
      setLoggedUser,
      selectedUser,
      setSelectedUser,
      selectedUserMealPermissions,
      setSelectedUserMealPermissions,
      isLoadingLoggedUser,
      setIsLoadingLoggedUser,
      isLoadingSelectedUserData,
      setIsLoadingSelectedUserData,
      residenciaId,
      setResidenciaId: setResidenciaId,
      userSemanario,
      setUserSemanario,
      userElecciones,
      setUserElecciones,
      userAusencias,
      setUserAusencias,
      userActividades,
      setUserActividades,
      db,
      auth
    }}>
      <div style={{ padding: '20px' }}>
        {/* Title now uses residenciaId from context state, which will be set by UserSelectorComponent */}
        <h1>Meal Selection {residenciaId ? `(Residencia: ${residenciaId})` : '(Select Residencia)'}</h1>
        
        <div style={componentContainerStyle}>
          <SelectorUsuariosEC />
        </div>

        {/* isLoadingSelectedUserData is still available for components to use generally, 
            but specific loading indicators per component are recommended */}

        <div style={componentContainerStyle}>
          <h2>2. Weekly Schedule Component (Semanario)</h2>
          {/* Placeholder - Actual component will use context to fetch and display userSemanario */}
          <div style={placeholderContentStyle}>Placeholder for Weekly Schedule.</div>
        </div>

        <div style={componentContainerStyle}>
          <h2>3. Exceptions Component (Elecciones/Specific Choices)</h2>
          {/* Placeholder - Actual component will use context to fetch and display userElecciones */}
          <div style={placeholderContentStyle}>Placeholder for Exceptions/Specific Choices.</div>
        </div>

        <div style={componentContainerStyle}>
          <h2>4. Absences Component</h2>
          {/* Placeholder - Actual component will use context to fetch and display userAusencias */}
          <div style={placeholderContentStyle}>Placeholder for Absences.</div>
        </div>
        
        <div style={componentContainerStyle}>
          <h2>5. Comments Component</h2>
          <div style={placeholderContentStyle}>Placeholder for Comments.</div>
        </div>

        <div style={componentContainerStyle}>
          <h2>6. Activities Component</h2>
          {/* Placeholder - Actual component will use context to fetch and display userActividades */}
          <div style={placeholderContentStyle}>Placeholder for Activities.</div>
        </div>

        <div style={componentContainerStyle}>
          <h2>7. Meal Request Component</h2>
          <div style={placeholderContentStyle}>Placeholder for Meal Request.</div>
        </div>

      </div>
    </ElegirComidasContext.Provider>
  );
};

export default withAuth(ElegirComidasPage);
