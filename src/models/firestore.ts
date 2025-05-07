import { Timestamp } from "firebase/firestore";

// --- Basic Types ---
export type ResidenciaId = string;
export type ComedorId = string;
export type TiempoComidaId = string;
export type AlternativaTiempoComidaId = string;
export type UserId = string;
export type ComentarioId = string;
export type HorarioSolicitudComidaId = string;
export type DietaId = string;
export type LogEntryId = string;
export type AusenciaId = string;
export type ExcepcionId = string;
export type CentroCostoId = string;
export type ActividadId = string; 
export type InscripcionActividadId = string; 
export type ActividadMealDefinitionId = string; 

// --- Enum-like Types ---
export type DayOfWeekKey = 'lunes' | 'martes' | 'miercoles' | 'jueves' | 'viernes' | 'sabado' | 'domingo';
export type TipoAccesoAlternativa = 'abierto' | 'autorizado' | 'cerrado';
export type EstadoAprobacion = 'pendiente' | 'aprobado' | 'rechazado' | 'no_requerido' | 'contingencia' | 'anulada_por_cambio';
export type ModoEleccionUsuario = 'normal' | 'diario' | 'suspendido';
export type OrigenEleccion = 
  | 'semanario' 
  | 'excepcion' 
  | 'excepcion_autorizada' 
  | 'contingencia' 
  | 'director' 
  | 'invitado_wizard'
  | 'actividad'; 
export type TipoAlternativa = 'comedor' | 'paraLlevar' | 'ayuno';
export type ActividadEstado = 'borrador' | 'abierta_inscripcion' | 'cerrada_inscripcion' | 'confirmada_finalizada' | 'cancelada';
export type TipoAccesoActividad = 'abierta' | 'invitacion_requerida' | 'opcion_unica'; 
export type MealCountFuente = 'estandar' | 'actividad'; 
export type EstadoInscripcionActividad =
  | 'invitado_pendiente'   
  | 'invitado_rechazado'   
  | 'inscrito_directo'     
  | 'inscrito_aceptado'    
  | 'cancelado_usuario'    
  | 'cancelado_admin';     

export type LogActionType =
    'user_created' |
    'user_updated' |
    'user_deleted' |
    'residencia_created' |
    'residencia_updated' |
    'tiempo_comida_created' |
    'tiempo_comida_updated' |
    'tiempo_comida_deleted' |
    'alternativa_created' |
    'alternativa_updated' |
    'alternativa_deleted' |
    'horario_solicitud_created' |
    'horario_solicitud_updated' |
    'horario_solicitud_deleted' |
    'dieta_created' |
    'dieta_updated' |
    'dieta_deleted' |
    'solicitud_autorizacion_requerida' |
    'solicitud_aprobada' |
    'solicitud_rechazada' |
    'dieta_asignada' |
    'dieta_desasignada' |
    'semanario_updated' |
    'eleccion_created' |
    'eleccion_updated' |
    'eleccion_deleted' |
    'ausencia_created' |
    'ausencia_updated' |
    'ausencia_deleted' |
    'comentario_created' |
    'modo_eleccion_updated' |
    'actividad_created' |        
    'actividad_updated' |
    'actividad_deleted' |        
    'actividad_estado_changed' |  
    'inscripcion_actividad_registrada' | 
    'inscripcion_actividad_cancelada' |  
    'inscripcion_invitacion_enviada' |   
    'inscripcion_invitacion_aceptada' |  
    'inscripcion_invitacion_rechazada';  

export type UserRole = 'master' | 'admin' | 'director' | 'residente' | 'invitado' | 'asistente' | 'auditor';

export const DayOfWeekMap: Record<DayOfWeekKey, string> = {
    lunes: 'Lunes',
    martes: 'Martes',
    miercoles: 'Miércoles',
    jueves: 'Jueves',
    viernes: 'Viernes',
    sabado: 'Sábado',
    domingo: 'Domingo'
  };

// --- Interfaces ---

export interface Residencia {
    id: ResidenciaId;
    nombre: string;
    direccion?: string;
    logoUrl?: string;
    nombreEtiquetaCentroCosto?: string; 
    antelacionActividadesDefault?: number; 
  }

export interface CentroCosto {
    id: CentroCostoId;
    residenciaId: ResidenciaId;
    nombre: string; 
    descripcion?: string;
    codigoInterno?: string; 
    isActive: boolean; 
}

export interface Comedor {
    id: ComedorId;
    nombre: string;
    residenciaId: ResidenciaId;
    descripcion?: string;
    capacidad?: number; 
}

export interface TiempoComida {
    id: TiempoComidaId;
    nombre: string; 
    residenciaId: ResidenciaId;
    nombreGrupo: string; 
    ordenGrupo: number; 
    dia: DayOfWeekKey; 
    horaEstimada?: string; 
}

export interface AlternativaTiempoComida {
    id: AlternativaTiempoComidaId;
    nombre: string; 
    tipo: TipoAlternativa; 
    tipoAcceso: TipoAccesoAlternativa; 
    requiereAprobacion: boolean; 
    ventanaInicio: string; 
    iniciaDiaAnterior?: boolean; 
    ventanaFin: string; 
    terminaDiaSiguiente?: boolean; 
    horarioSolicitudComidaId: HorarioSolicitudComidaId; 
    tiempoComidaId: TiempoComidaId; 
    residenciaId: ResidenciaId;
    comedorId?: ComedorId; 
    isActive: boolean; 
}

export interface ActividadMealDefinition {
  id: ActividadMealDefinitionId; 
  nombreGrupoMeal: string; 
  nombreEspecificoMeal: string; 
  descripcionMeal?: string; 
  horaEstimadaMeal?: string; 
}

export interface Actividad {
  id: ActividadId;
  residenciaId: ResidenciaId;
  nombre: string; 
  descripcionGeneral?: string;
  fechaInicio: Timestamp; 
  fechaFin: Timestamp;    
  ultimoTiempoComidaIdAntes?: TiempoComidaId; 
  primerTiempoComidaIdDespues?: TiempoComidaId; 
  planComidas?: ActividadMealDefinition[]; 
  requiereInscripcion: boolean;
  tipoAccesoActividad: TipoAccesoActividad; 
  maxParticipantes?: number;
  diasAntelacionCierreInscripcion?: number; 
  defaultCentroCostoId?: CentroCostoId; 
  estado: ActividadEstado;
  organizadorUserId: UserId; 
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface InscripcionActividad {
  id: InscripcionActividadId; 
  actividadId: ActividadId;
  userId: UserId; // Can be a real UserId or a placeholder like "guest_..."
  residenciaId: ResidenciaId;     
  estadoInscripcion: EstadoInscripcionActividad;
  fechaEstado: Timestamp;        
  invitadoPorUserId?: UserId;     
  fechaInvitacionOriginal?: Timestamp; 
  nombreInvitadoNoAutenticado?: string; // <<< NEW: For display name of non-auth guests
}

export interface HorarioSolicitudComida {
    id: HorarioSolicitudComidaId;
    residenciaId: ResidenciaId;
    nombre: string; 
    dia: DayOfWeekKey; 
    horaSolicitud: string; 
    isPrimary: boolean; 
    isActive: boolean; 
}

export interface Dieta {
    id: DietaId;
    residenciaId: ResidenciaId;
    nombre: string;
    descripcion?: string;
    isDefault?: boolean; 
    isActive: boolean;
}

export interface AsistentePermisos {
  elecc_uids?: UserId[];
  activ_crear?: boolean;
  activ_gest_propias?: boolean; 
  activ_gest_todas?: boolean;   
  invit_elecc_act_propias?: boolean; 
  invit_elecc_act_todas?: boolean;   
}

export interface UserProfile {
    id: UserId;
    nombre: string;
    apellido: string;
    email: string;
    roles: UserRole[];
    isActive: boolean;
    residenciaId?: ResidenciaId;
    dietaId?: DietaId; 
    modoEleccion?: ModoEleccionUsuario;
    numeroDeRopa?: string;
    habitacion?: string;
    universidad?: string;
    carrera?: string;
    dni?: string;
    fechaDeCumpleanos?: Timestamp;
    asistentePermisos?: AsistentePermisos; 
}

export interface SemanarioAlternativaSeleccion {
    alternativaId: AlternativaTiempoComidaId;
    requiereAprobacion: boolean;
    alternativaContingenciaId?: AlternativaTiempoComidaId | null;
}

export interface Semanario {
    id?: string; 
    userId: UserId;
    residenciaId: ResidenciaId;
    elecciones: {
        [key in DayOfWeekKey]?: {
            [tiempoComidaId: string]: SemanarioAlternativaSeleccion;
        }
    };
    ultimaActualizacion: Timestamp;
}

export interface Eleccion {
    id?: string; 
    usuarioId: UserId; // Can be a real UserId or a placeholder like "guest_..."
    residenciaId: ResidenciaId;
    fecha: Timestamp; 
    tiempoComidaId?: TiempoComidaId;
    alternativaTiempoComidaId?: AlternativaTiempoComidaId;
    dietaId?: DietaId; 
    solicitado: boolean; 
    asistencia?: boolean; 
    fechaSolicitud: Timestamp; 
    estadoAprobacion: EstadoAprobacion; 
    origen: OrigenEleccion; 
    centroCostoId?: CentroCostoId; 
    comentario?: string; 
    processedForBilling?: boolean; 
    actividadId?: ActividadId; 
    actividadMealId?: ActividadMealDefinitionId; 
    // nombreInvitadoNoAutenticadoEleccion?: string; // Optional: Denormalize guest name here if needed frequently
}

export interface MealCount {
    id: string; 
    residenciaId: ResidenciaId;
    fecha: Timestamp; 
    fuente: MealCountFuente; 
    tiempoComidaId?: TiempoComidaId; 
    alternativaTiempoComidaId?: AlternativaTiempoComidaId;
    actividadId?: ActividadId;
    actividadMealDefinitionId?: ActividadMealDefinitionId; 
    actividadMealNombreGrupo?: string; 
    actividadMealDescripcion?: string;
    dietaId?: DietaId | 'ninguna';
    centroCostoId?: CentroCostoId | 'ninguno'; 
    totalSolicitado: number; 
    totalAprobado?: number; 
    version: Timestamp; 
}

export interface Ausencia {
    id?: AusenciaId;
    userId: UserId;
    residenciaId: ResidenciaId;
    fechaInicio: Timestamp; 
    ultimoTiempoComidaId?: TiempoComidaId | null; 
    fechaFin: Timestamp; 
    primerTiempoComidaId?: TiempoComidaId | null; 
    retornoPendienteConfirmacion?: boolean; 
    fechaCreacion: Timestamp;
    motivo?: string; 
}

export interface Comentario {
    id: ComentarioId;
    usuarioId: UserId; 
    destinatarioId?: UserId; 
    residenciaId: ResidenciaId;
    texto: string;
    fechaEnvio: Timestamp;
    leido: boolean;
    archivado: boolean;
    relacionadoA?: { 
        coleccion: 'eleccion' | 'ausencia' | 'usuario'; 
        documentoId: string;
    };
}

export interface LogEntry {
    id: LogEntryId;
    timestamp: Timestamp;
    userId: UserId; 
    residenciaId?: ResidenciaId; 
    actionType: LogActionType;
    relatedDocPath?: string; 
    details?: string | object; 
}
