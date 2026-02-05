import { createContext, use } from 'react';
import { Auth } from 'firebase/auth'; // Pendiente usar hook personalizado
import { Firestore } from 'firebase/firestore';
import { 
  UserProfile, 
  PermisosComidaPorGrupo, 
  Residencia, 
  ResidenciaId, 
  TiempoComida, 
  AlternativaTiempoComida, 
  HorarioSolicitudComida,
  AlteracionHorario, 
  TiempoComidaMod, 
  AlternativaTiempoComidaMod,
  Semanario, 
  Eleccion, 
  Ausencia, 
  Actividad, 
  InscripcionActividad, 
  TiempoComidaAlternativaUnicaActividad, 
  Comentario,
  SemanarioDesnormalizado,
} from '../../../../../shared/models/types';

export interface MainContextProps {
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
  isLoadingSelectedUserData: boolean;
  setIsLoadingSelectedUserData: React.Dispatch<React.SetStateAction<boolean>>;  
  isLoadingUserMealData: boolean;
  setIsLoadingUserMealData: React.Dispatch<React.SetStateAction<boolean>>;  
  isDenormalizingData: boolean;
  setIsDenormalizingData: React.Dispatch<React.SetStateAction<boolean>>;  
  db: Firestore;
  auth: Auth;
}

export interface ResidenciaContextProps {
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

export interface UserContextProps {
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

// Contexts
export const MainContext = createContext<MainContextProps | null>(null);
export const ResidenciaContext = createContext<ResidenciaContextProps | null>(null);
export const UserContext = createContext<UserContextProps | null>(null);

// Hooks
export const useMainContext = (): MainContextProps => {
  const context = use(MainContext);
  if (!context) {
    throw new Error('useMainContext must be used within a MainContext.Provider');
  }
  return context as MainContextProps;
};

export const useResidenciaContext = (): ResidenciaContextProps => {
  const context = use(ResidenciaContext);
  if (!context) {
    throw new Error('useResidenciaContext must be used within a ResidenciaContext.Provider');
  }
  return context as ResidenciaContextProps;
};

export const useUserContext = (): UserContextProps => {
  const context = use(UserContext);
  if (!context) {
    throw new Error('useUserContext must be used within a UserContext.Provider');
  }
  return context as UserContextProps;
};
