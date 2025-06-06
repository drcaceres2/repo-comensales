"use client";

import React, { createContext, useContext, useState, useEffect } from 'react';
// Removed useParams from next/navigation
import { useAuthState } from 'react-firebase-hooks/auth';
import { Auth } from 'firebase/auth';
import { Firestore } from 'firebase/firestore'; // Removed doc, getDoc, collection, getDocs
import { auth, db } from '@/lib/firebase';
import withAuth from '@/components/withAuth';
import { 
  UserProfile, PermisosComidaPorGrupo, 
  Residencia, ResidenciaId, TiempoComida, AlternativaTiempoComida, HorarioSolicitudComida,
  AlteracionHorario, TiempoComidaMod, AlternativaTiempoComidaMod,
  Semanario, Eleccion, Ausencia, Actividad, InscripcionActividad, TiempoComidaAlternativaUnicaActividad, Comentario,
  SemanarioDesnormalizado,
} from '@/../../shared/models/types';
import SelectorUsuariosEC from './components/SelectorUsuariosEC2';

interface MainContextProps {
  loggedUser: UserProfile | null;
  setLoggedUser: React.Dispatch<React.SetStateAction<UserProfile | null>>;
  selectedUser: UserProfile | null;
  setSelectedUser: React.Dispatch<React.SetStateAction<UserProfile | null>>;
  selectedUserMealPermissions: PermisosComidaPorGrupo | null;
  setSelectedUserMealPermissions: React.Dispatch<React.SetStateAction<PermisosComidaPorGrupo | null>>;
  residencia: Residencia | null;
  setResidencia: React.Dispatch<React.SetStateAction<Residencia | null>>;
  residenciaId: ResidenciaId | null;
  setResidenciaId: React.Dispatch<React.SetStateAction<ResidenciaId | null>>;
  isLoadingLoggedUser: boolean;
  setIsLoadingLoggedUser: React.Dispatch<React.SetStateAction<boolean>>;
  isLoadingSelectedUserData: boolean; // This will be used by individual components for their data
  setIsLoadingSelectedUserData: React.Dispatch<React.SetStateAction<boolean>>;  
  isLoadingUserMealData: boolean; // This will be used by individual components for their data
  setIsLoadingUserMealData: React.Dispatch<React.SetStateAction<boolean>>;  
  isDenormalizingData: boolean; // This will be used by individual components for their data
  setIsDenormalizingData: React.Dispatch<React.SetStateAction<boolean>>;  
  db: Firestore;
  auth: Auth;
}
interface residenciaConextProps {
  residenciaTiemposComida: TiempoComida[];
  setResidenciaTiemposComida: React.Dispatch<React.SetStateAction<TiempoComida[]>>;
  residenciaAlternativas: AlternativaTiempoComida[];
  setResidenciaAlternativas: React.Dispatch<React.SetStateAction<AlternativaTiempoComida[]>>;
  residenciaHorariosSolicitud: HorarioSolicitudComida[];
  setResidenciaHorariosSolicitud: React.Dispatch<React.SetStateAction<HorarioSolicitudComida[]>>;
  residenciaAlteracionesHorario: AlteracionHorario[];
  setResidenciaAlteracionesHorario: React.Dispatch<React.SetStateAction<AlteracionHorario[]>>;
  residenciaTiemposComidaMod: TiempoComidaMod[];
  setResidenciaTiemposComidaMod: React.Dispatch<React.SetStateAction<TiempoComidaMod[]>>;
  residenciaAlternativasMod: AlternativaTiempoComidaMod[];
  setResidenciaAlternativasMod: React.Dispatch<React.SetStateAction<AlternativaTiempoComidaMod[]>>;
  residenciaActividadesParaResidentes: Actividad[];
  setResidenciaActividadesParaResidentes: React.Dispatch<React.SetStateAction<Actividad[]>>;
  residenciaAlternativasActividades: TiempoComidaAlternativaUnicaActividad[];
  setResidenciaAlternativasActividades: React.Dispatch<React.SetStateAction<TiempoComidaAlternativaUnicaActividad[]>>;
}
interface userContextProps {
  userSemanario: Semanario | null;
  setUserSemanario: React.Dispatch<React.SetStateAction<Semanario | null>>;
  userElecciones: Eleccion[];
  setUserElecciones: React.Dispatch<React.SetStateAction<Eleccion[]>>;
  userAusencias: Ausencia[];
  setUserAusencias: React.Dispatch<React.SetStateAction<Ausencia[]>>;
  userInscripciones: InscripcionActividad[];
  setUserInscripciones: React.Dispatch<React.SetStateAction<InscripcionActividad[]>>;
  userComentarios: Comentario[];
  setUserComentarios: React.Dispatch<React.SetStateAction<Comentario[]>>;
  semanarioUI: SemanarioDesnormalizado | null;
  setSemanarioUI: React.Dispatch<React.SetStateAction<SemanarioDesnormalizado | null>>;
}

const MainContext = createContext<MainContextProps | undefined>(undefined);
const ResidenciaContext = createContext<residenciaConextProps | undefined>(undefined);
const UserContext = createContext<userContextProps | undefined>(undefined);

export const useLoginC = (): MainContextProps => {
  const context = useContext(MainContext);
  if (!context) {
    throw new Error('useElegirComidas must be used within an ElegirComidasProvider');
  }
  return context;
};
export const useResidenciaC = (): residenciaConextProps => {
  const context = useContext(ResidenciaContext);
  if (!context) {
    throw new Error('useElegirComidas must be used within an ElegirComidasProvider');
  }
  return context;
};
export const useUserC = (): userContextProps => {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useElegirComidas must be used within an ElegirComidasProvider');
  }
  return context;
};


const ElegirComidasPage = () => {
  // residenciaIdParam removed, will be set from UserSelectorComponent via context
  const [authUser, authLoading, authError] = useAuthState(auth);

  // Estados para actualización de contexto general
  const [loggedUser, setLoggedUser] = useState<UserProfile | null>(null);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [selectedUserMealPermissions, setSelectedUserMealPermissions] = useState<PermisosComidaPorGrupo | null>(null);
  const [residencia, setResidencia] = useState<Residencia | null>(null);
  const [residenciaId, setResidenciaId] = useState<ResidenciaId | null>(null);
  const [isLoadingLoggedUser, setIsLoadingLoggedUser] = useState<boolean>(true);
  const [isLoadingSelectedUserData, setIsLoadingSelectedUserData] = useState<boolean>(false);
  const [isLoadingUserMealData, setIsLoadingUserMealData] = useState<boolean>(false);
  const [isDenormalizingData, setIsDenormalizingData] = useState<boolean>(false);

  // Estados para actualización de conexto Residencia
  const [residenciaTiemposComida, setResidenciaTiemposComida] = useState<TiempoComida[]>([]);
  const [residenciaAlternativas, setResidenciaAlternativas] = useState<AlternativaTiempoComida[]>([]);
  const [residenciaHorariosSolicitud, setResidenciaHorariosSolicitud] = useState<HorarioSolicitudComida[]>([]);
  const [residenciaAlteracionesHorario, setResidenciaAlteracionesHorario] = useState<AlteracionHorario[]>([]);
  const [residenciaTiemposComidaMod, setResidenciaTiemposComidaMod] = useState<TiempoComidaMod[]>([]);
  const [residenciaAlternativasMod, setResidenciaAlternativasMod] = useState<AlternativaTiempoComidaMod[]>([]);
  const [residenciaActividadesParaResidentes, setResidenciaActividadesParaResidentes] = useState<Actividad[]>([]);
  const [residenciaAlternativasActividades, setResidenciaAlternativasActividades] = useState<TiempoComidaAlternativaUnicaActividad[]>([]);

  // Estados para actualización de contexto User
  const [userSemanario, setUserSemanario] = useState<Semanario | null>(null);
  const [userElecciones, setUserElecciones] = useState<Eleccion[]>([]);
  const [userAusencias, setUserAusencias] = useState<Ausencia[]>([]);
  const [userInscripciones, setUserInscripciones] = useState<InscripcionActividad[]>([]);
  const [userComentarios, setUserComentarios] = useState<Comentario[]>([]);
  const [semanarioUI, setSemanarioUI] = useState<SemanarioDesnormalizado | null>(null);

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
    <MainContext.Provider value={{
      loggedUser, setLoggedUser,
      selectedUser, setSelectedUser,
      selectedUserMealPermissions, setSelectedUserMealPermissions,
      residenciaId, setResidenciaId,
      residencia, setResidencia,
      isLoadingLoggedUser, setIsLoadingLoggedUser,
      isLoadingSelectedUserData, setIsLoadingSelectedUserData,
      isLoadingUserMealData, setIsLoadingUserMealData,
      isDenormalizingData, setIsDenormalizingData,
      db, auth
    }}>
      <div style={{ padding: '20px' }}>
        {/* Title now uses residenciaId from context state, which will be set by UserSelectorComponent */}
        <h1>Meal Selection {residenciaId ? `(Residencia: ${residenciaId})` : '(Select Residencia)'}</h1>
        
        <div style={componentContainerStyle}>
          <SelectorUsuariosEC />
        </div>
        <UserContext.Provider value={{
          userSemanario, setUserSemanario,
          userElecciones, setUserElecciones,
          userAusencias, setUserAusencias,
          userInscripciones, setUserInscripciones,
          userComentarios, setUserComentarios,
          semanarioUI, setSemanarioUI,
        }}>
          <ResidenciaContext.Provider value={{
            residenciaTiemposComida, setResidenciaTiemposComida,
            residenciaAlternativas, setResidenciaAlternativas,
            residenciaHorariosSolicitud, setResidenciaHorariosSolicitud,
            residenciaAlteracionesHorario, setResidenciaAlteracionesHorario,
            residenciaTiemposComidaMod, setResidenciaTiemposComidaMod,
            residenciaAlternativasMod, setResidenciaAlternativasMod,
            residenciaActividadesParaResidentes, setResidenciaActividadesParaResidentes,
            residenciaAlternativasActividades, setResidenciaAlternativasActividades,
          }}>
            <div style={componentContainerStyle}>
              <h2>2. Data Denormalization Component (Semanario)</h2>
              {/* Placeholder - Actual component will fetch data and populate contexts */}
              <div style={placeholderContentStyle}>Placeholder for Weekly Schedule.</div>
            </div>


            <div style={componentContainerStyle}>
              <h2>2. Weekly Schedule Component (Semanario)</h2>
              {/* Placeholder - Actual component will use context to fetch and display userSemanario */}
              <div style={placeholderContentStyle}>Placeholder for Weekly Schedule.</div>
            </div>
          </ResidenciaContext.Provider>
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
          <ResidenciaContext.Provider value={{
            residenciaTiemposComida, setResidenciaTiemposComida,
            residenciaAlternativas, setResidenciaAlternativas,
            residenciaHorariosSolicitud, setResidenciaHorariosSolicitud,
            residenciaAlteracionesHorario, setResidenciaAlteracionesHorario,
            residenciaTiemposComidaMod, setResidenciaTiemposComidaMod,
            residenciaAlternativasMod, setResidenciaAlternativasMod,
            residenciaActividadesParaResidentes, setResidenciaActividadesParaResidentes,
            residenciaAlternativasActividades, setResidenciaAlternativasActividades,
          }}>
            <div style={componentContainerStyle}>
              <h2>6. Activities Component</h2>
              {/* Placeholder - Actual component will use context to fetch and display userActividades */}
              <div style={placeholderContentStyle}>Placeholder for Activities.</div>
            </div>

            <div style={componentContainerStyle}>
              <h2>7. Meal Request Component</h2>
              <div style={placeholderContentStyle}>Placeholder for Meal Request.</div>
            </div>
          </ResidenciaContext.Provider>
        </UserContext.Provider>
      </div>
    </MainContext.Provider>
  );
};

export default ElegirComidasPage;
