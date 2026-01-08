"use client";

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth'; // New custom hook
import { useResidenciaOperativa } from '@/hooks/useResidenciaOperativa'; // New custom hook
import { auth, db } from '@/lib/firebase';
import { Auth } from 'firebase/auth';
import { Firestore } from 'firebase/firestore'; 
// withAuth removed in favor of conditional rendering or next middleware for protected routes, 
// or keep it if it wraps the component export. Assuming keeping logic inside component for now.

import { 
  UserProfile, PermisosComidaPorGrupo, 
  Residencia, ResidenciaId, TiempoComida, AlternativaTiempoComida, HorarioSolicitudComida,
  AlteracionHorario, TiempoComidaMod, AlternativaTiempoComidaMod,
  Semanario, Eleccion, Ausencia, Actividad, InscripcionActividad, TiempoComidaAlternativaUnicaActividad, Comentario,
  SemanarioDesnormalizado,
} from '@/../../shared/models/types';
import SelectorUsuariosEC from './components/SelectorUsuariosEC2';
import InicializarDatos from './components/inicializar-datos';

interface MainContextProps {
  loggedUser: UserProfile | null; // Note: In new hook, 'user' is the auth user, profile fetching might be separate or this expects the profile doc.
                                  // For now, assuming loggedUser means the Auth User or fetched profile.
                                  // If UserProfile is the Firestore doc, you might need to fetch it separately using useDocumentData.
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
  isLoadingSelectedUserData: boolean;
  setIsLoadingSelectedUserData: React.Dispatch<React.SetStateAction<boolean>>;  
  isLoadingUserMealData: boolean;
  setIsLoadingUserMealData: React.Dispatch<React.SetStateAction<boolean>>;  
  isDenormalizingData: boolean;
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

// Next.js 15: props.params is a Promise
interface PageProps {
  params: Promise<{ residenciaId: string }>;
}

const ElegirComidasPage = ({ params }: PageProps) => {
  // 1. Resolve params (Next.js 15)
  const [residenciaIdParam, setResidenciaIdParam] = useState<string | null>(null);

  useEffect(() => {
    params.then((resolvedParams) => {
      setResidenciaIdParam(resolvedParams.residenciaId);
    });
  }, [params]);

  // 2. Auth Hook
  const { user: authUser, loading: authLoading, error: authError } = useAuth();

  // 3. License/Operational Logic
  const { 
    puedeOperar, 
    motivoBloqueo, 
    isLoading: loadingOperativa 
  } = useResidenciaOperativa(residenciaIdParam || '');

  // Global Context States
  const [loggedUser, setLoggedUser] = useState<UserProfile | null>(null);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [selectedUserMealPermissions, setSelectedUserMealPermissions] = useState<PermisosComidaPorGrupo | null>(null);
  const [residencia, setResidencia] = useState<Residencia | null>(null);
  const [residenciaId, setResidenciaId] = useState<ResidenciaId | null>(null); // This might sync with residenciaIdParam
  
  const [isLoadingLoggedUser, setIsLoadingLoggedUser] = useState<boolean>(true);
  const [isLoadingSelectedUserData, setIsLoadingSelectedUserData] = useState<boolean>(false);
  const [isLoadingUserMealData, setIsLoadingUserMealData] = useState<boolean>(false);
  const [isDenormalizingData, setIsDenormalizingData] = useState<boolean>(false);

  // Residencia Context States
  const [residenciaTiemposComida, setResidenciaTiemposComida] = useState<TiempoComida[]>([]);
  const [residenciaAlternativas, setResidenciaAlternativas] = useState<AlternativaTiempoComida[]>([]);
  const [residenciaHorariosSolicitud, setResidenciaHorariosSolicitud] = useState<HorarioSolicitudComida[]>([]);
  const [residenciaAlteracionesHorario, setResidenciaAlteracionesHorario] = useState<AlteracionHorario[]>([]);
  const [residenciaTiemposComidaMod, setResidenciaTiemposComidaMod] = useState<TiempoComidaMod[]>([]);
  const [residenciaAlternativasMod, setResidenciaAlternativasMod] = useState<AlternativaTiempoComidaMod[]>([]);
  const [residenciaActividadesParaResidentes, setResidenciaActividadesParaResidentes] = useState<Actividad[]>([]);
  const [residenciaAlternativasActividades, setResidenciaAlternativasActividades] = useState<TiempoComidaAlternativaUnicaActividad[]>([]);

  // User Context States
  const [userSemanario, setUserSemanario] = useState<Semanario | null>(null);
  const [userElecciones, setUserElecciones] = useState<Eleccion[]>([]);
  const [userAusencias, setUserAusencias] = useState<Ausencia[]>([]);
  const [userInscripciones, setUserInscripciones] = useState<InscripcionActividad[]>([]);
  const [userComentarios, setUserComentarios] = useState<Comentario[]>([]);
  const [semanarioUI, setSemanarioUI] = useState<SemanarioDesnormalizado | null>(null);

  // Sync param ID to context ID if needed
  useEffect(() => {
    if (residenciaIdParam) {
      setResidenciaId(residenciaIdParam as ResidenciaId);
    }
  }, [residenciaIdParam]);


  // --- Render Logic ---

  if (authLoading || (residenciaIdParam && loadingOperativa)) {
    return <div>Cargando...</div>;
  }

  if (authError) {
    return <div>Error de autenticación: {authError.message}</div>;
  }

  if (!authUser) {
    return <div>Usuario no autenticado. Por favor inicie sesión.</div>;
  }

  // Blocking logic based on License/Status
  if (residenciaIdParam && !puedeOperar) {
    return (
      <div style={{ padding: '20px', color: 'red' }}>
        <h1>Acceso Denegado</h1>
        <p>{motivoBloqueo || "No se puede acceder a esta residencia en este momento."}</p>
      </div>
    );
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
        <h1>Selección de comidas {residenciaId ? `(Residencia: ${residenciaId})` : '(Cargando Residencia...)'}</h1>
        <div style={componentContainerStyle}>
          <h2>1. Seleccione un usuario</h2>
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
              <InicializarDatos />
            </div>
            <div style={componentContainerStyle}>
              <h2>2. Weekly Schedule Component (Semanario)</h2>
              <div style={placeholderContentStyle}>Placeholder for Weekly Schedule.</div>
            </div>
            <div style={componentContainerStyle}>
              <h2>3. Exceptions Component (Elecciones/Specific Choices)</h2>
              <div style={placeholderContentStyle}>Placeholder for Exceptions/Specific Choices.</div>
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
          </ResidenciaContext.Provider>
        </UserContext.Provider>
      </div>
    </MainContext.Provider>
  );
};

export default ElegirComidasPage;
