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
export type AusenciaId = string; // Added for clarity
export type ExcepcionId = string; // Added for clarity

// --- Added Types ---
export type DayOfWeekKey = 'lunes' | 'martes' | 'miercoles' | 'jueves' | 'viernes' | 'sabado' | 'domingo';
export type TipoAccesoAlternativa = 'abierto' | 'autorizado' | 'cerrado';
export type EstadoAprobacion = 'pendiente' | 'aprobado' | 'rechazado' | 'no_requerido';
export type ModoEleccionUsuario = 'normal' | 'diario' | 'suspendido'; // User meal choice mode

// <<< UPDATED: Specific Log Action Types >>>
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
    'dieta_desasignada' | // Added
    'semanario_updated' | // Added
    'excepcion_created' | // Added
    'excepcion_deleted' | // Added
    'ausencia_created' | // Added
    'ausencia_updated' | // Added
    'ausencia_deleted' | // Added
    'comentario_created' | // Added
    'modo_eleccion_updated'; // Added

export type UserRole = 'master' | 'admin' | 'director' | 'residente';

export const DayOfWeekMap: Record<DayOfWeekKey, string> = {
    lunes: 'Lunes',
    martes: 'Martes',
    miercoles: 'Miércoles',
    jueves: 'Jueves',
    viernes: 'Viernes',
    sabado: 'Sábado',
    domingo: 'Domingo'
  };

export type TipoAlternativa = 'comedor' | 'paraLlevar';

// --- Interfaces ---

export interface Residencia {
    id: ResidenciaId;
    nombre: string;
    direccion?: string;
    logoUrl?: string;
    horariosSolicitudComida?: HorarioSolicitudComida[];
    tiemposComida?: TiempoComida[];
    alternativas?: AlternativaTiempoComida[];
    comedores?: Comedor[];
    dietas?: Dieta[];
  }

export interface Comedor {
    id: ComedorId;
    nombre: string;
    residenciaId: ResidenciaId;
    descripcion?: string;
}

export interface TiempoComida {
    id: TiempoComidaId;
    nombre: string;
    residenciaId: ResidenciaId;
    nombreGrupo: string;
    ordenGrupo: number;
    diasDisponibles: DayOfWeekKey[];
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

export interface HorarioSolicitudComida {
    id: HorarioSolicitudComidaId;
    residenciaId: ResidenciaId;
    nombre: string;
    horaLimite: string;
    diasAntelacion: number;
  }

export interface Dieta {
    id: DietaId;
    residenciaId: ResidenciaId;
    nombre: string;
    descripcion?: string;
    isDefault?: boolean;
    isActive: boolean;
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
}

// *** NEW: Interface for a single choice within the Semanario ***
export interface SemanarioAlternativaSeleccion {
    alternativaId: AlternativaTiempoComidaId; // The primary choice
    requiereAprobacion: boolean; // Store this explicitly based on the selected Alternativa
    alternativaContingenciaId?: AlternativaTiempoComidaId | null; // Fallback if requiereAprobacion is true
}

// *** UPDATED: Semanario interface ***
export interface Semanario {
    id?: string; // Document ID (likely userId)
    userId: UserId;
    residenciaId: ResidenciaId;
    // Using TiempoComidaId as the key for precision.
    elecciones: {
        [key in DayOfWeekKey]?: {
            [tiempoComidaId: string]: SemanarioAlternativaSeleccion; // Key is TiempoComidaId
        }
    };
    ultimaActualizacion: Timestamp;
}

// *** NEW: Eleccion interface (Specific meal choice for a date) ***
// This represents an 'exception' or a specific choice overriding the semanario.
export interface Eleccion {
    id: string;
    usuarioId: UserId;
    residenciaId: ResidenciaId;
    fecha: Timestamp;
    tiempoComidaId: TiempoComidaId;
    alternativaTiempoComidaId: AlternativaTiempoComidaId;
    dietaId?: DietaId;
    solicitado: boolean;
    asistencia?: boolean;
    fechaSolicitud: Timestamp;
    estadoAprobacion?: EstadoAprobacion;
  }

export interface MealCount {
    id: string;
    residenciaId: ResidenciaId;
    tiempoComidaId: TiempoComidaId;
    alternativaTiempoComidaId: AlternativaTiempoComidaId;
    dietaId?: DietaId;
    fecha: Timestamp;
    totalSolicitado: number;
}

// *** NEW: Ausencia interface ***
export interface Ausencia {
    id?: AusenciaId; // Firestore Document ID
    userId: UserId;
    residenciaId: ResidenciaId;
    fechaInicio: Timestamp;
    ultimoTiempoComidaId?: TiempoComidaId | null; // Last meal before leaving
    fechaFin: Timestamp;
    primerTiempoComidaId?: TiempoComidaId | null; // First meal upon return
    retornoPendienteConfirmacion?: boolean; // Flag for "Not Sure" reminder
    fechaCreacion: Timestamp;
}

// *** NEW: Comentario interface ***
export interface Comentario {
    id: ComentarioId;
    usuarioId: UserId;
    residenciaId: ResidenciaId;
    texto: string;
    fechaEnvio: Timestamp;
    leido: boolean;
    archivado: boolean;
}

// *** NEW: LogEntry interface ***
export interface LogEntry {
    id: LogEntryId;
    timestamp: Timestamp;
    userId: UserId;
    residenciaId: ResidenciaId;
    actionType: LogActionType;
    relatedDocPath?: string;
    details?: string;
}
