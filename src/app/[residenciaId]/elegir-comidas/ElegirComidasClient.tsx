"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useResidenciaOperativa } from '@/hooks/useResidenciaOperativa';
import { useDocumentSubscription } from '@/hooks/useFirebaseData';
import { auth, db } from '@/lib/firebase';
import { doc, DocumentReference } from 'firebase/firestore'; 

import { 
  UserProfile, PermisosComidaPorGrupo, 
  Residencia, ResidenciaId, TiempoComida, AlternativaTiempoComida, HorarioSolicitudComida,
  AlteracionHorario, TiempoComidaMod, AlternativaTiempoComidaMod,
  Semanario, Eleccion, Ausencia, Actividad, InscripcionActividad, TiempoComidaAlternativaUnicaActividad, Comentario,
  SemanarioDesnormalizado,
} from '@/../../shared/models/types';
import SelectorUsuariosEC from './components/SelectorUsuariosEC2';
import InicializarDatos from './components/inicializar-datos';
import { MainContext, ResidenciaContext, UserContext } from './context/ElegirComidasContext';

interface ElegirComidasClientProps {
  residenciaId: string;
}

const ElegirComidasClient = ({ residenciaId: residenciaIdProp }: ElegirComidasClientProps) => {

  // 1. Auth Hook
  const { user, loading: authLoading } = useAuth();

  // 2. License/Operational Logic
  const { 
    puedeOperar, 
    motivoBloqueo, 
    isLoading: licenciaLoading 
  } = useResidenciaOperativa(residenciaIdProp);

  // 3. Fetch Residencia Data using useDocumentData
  const residenciaRef = useMemo(() => {
    return residenciaIdProp ? (doc(db, 'residencias', residenciaIdProp) as DocumentReference<Residencia>) : null;
  }, [residenciaIdProp]);
  
  const { value: residenciaData, loading: residenciaLoading } = useDocumentSubscription<Residencia>(residenciaRef);

  // Global Context States
  const [loggedUser, setLoggedUser] = useState<UserProfile | null>(null);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [selectedUserMealPermissions, setSelectedUserMealPermissions] = useState<PermisosComidaPorGrupo | null>(null);
  const [residencia, setResidencia] = useState<Residencia | null>(null);
  const [residenciaId, setResidenciaId] = useState<ResidenciaId | null>(residenciaIdProp as ResidenciaId); 
  
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

  useEffect(() => {
    if (residenciaIdProp) {
        setResidenciaId(residenciaIdProp as ResidenciaId);
    }
  }, [residenciaIdProp]);

  // Sync residenciaData to state
  useEffect(() => {
    if (residenciaData) {
      setResidencia(residenciaData);
    }
  }, [residenciaData]);

  // Render Logic
  if (authLoading || licenciaLoading || residenciaLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4"></div>
          <p>Cargando información de la residencia...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <h1>Usuario no autenticado</h1>
          <p>Por favor inicie sesión para continuar.</p>
        </div>
      </div>
    );
  }

  // Blocking logic based on License/Status
  if (!puedeOperar) {
    return (
      <div className="flex h-screen items-center justify-center p-4">
        <div className="max-w-md text-center border p-6 rounded-lg shadow-md bg-white">
          <h1 className="text-xl font-bold text-red-600 mb-2">Acceso Restringido</h1>
          <p className="text-gray-700">{motivoBloqueo || "No se puede acceder a esta residencia en este momento."}</p>
        </div>
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
    <MainContext value={{
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
        <h1>Selección de comidas {residenciaId ? `(Residencia: ${residenciaData?.nombre || residenciaId})` : '(Cargando Residencia...)'}</h1>
        <div style={componentContainerStyle}>
          <h2>1. Seleccione un usuario</h2>
          <SelectorUsuariosEC />
        </div>
        <UserContext value={{
          userSemanario, setUserSemanario,
          userElecciones, setUserElecciones,
          userAusencias, setUserAusencias,
          userInscripciones, setUserInscripciones,
          userComentarios, setUserComentarios,
          semanarioUI, setSemanarioUI,
        }}>
          <ResidenciaContext value={{
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
          </ResidenciaContext>
        </UserContext>
      </div>
    </MainContext>
  );
};

export default ElegirComidasClient;
