// src/models/firestore.ts

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

// --- Interfaces ---

export interface Residencia {
    id?: ResidenciaId; // Automatically assigned by Firestore
    nombre: string;
    comedores?: Comedor[];
    tiemposComida?: TiempoComida[];
    horariosSolicitudComida?: HorarioSolicitudComida[];
    dietas?: Dieta[];
}

export interface Comedor {
    id: ComedorId; // Use uuid or similar for unique ID within the array
    nombre: string;
}

export interface TiempoComida {
    id: TiempoComidaId; // Use uuid or similar
    nombre: string; // e.g., "Desayuno", "Almuerzo Principal", "Cena Temprano"
    grupo: string; // e.g., "Desayuno", "Almuerzo", "Cena" - For grouping in UI
    alternativas?: AlternativaTiempoComida[];
}

export interface AlternativaTiempoComida {
    id: AlternativaTiempoComidaId; // Use uuid or similar
    nombre: string; // e.g., "Menú Basal", "Opción Vegetariana", "Dieta Blanda"
    descripcion?: string;
    alergenos?: string[];
    tipoAcceso: TipoAccesoAlternativa; // abierto, autorizado, cerrado
    requiereAprobacion: boolean; // Derived from tipoAcceso === 'autorizado' ? true : false
    dietaId?: DietaId | null; // Link to a specific Dieta if applicable
}

export interface HorarioSolicitudComida {
    id: HorarioSolicitudComidaId; // Use uuid or similar
    diaSemana: DayOfWeekKey;
    tiempoComidaId: TiempoComidaId;
    horaLimite: string; // e.g., "09:00" (24-hour format)
}

export interface Dieta {
    id: DietaId; // Use uuid or similar
    nombre: string;
    descripcion?: string;
}

export interface Usuario {
    id?: UserId; // Firestore Auth UID
    nombre: string;
    email: string;
    residenciaId: ResidenciaId;
    roles: ('residente' | 'director' | 'admin')[];
    dietasAsignadas?: DietaId[]; // IDs of assigned diets
    modoEleccion: ModoEleccionUsuario;
    // Add other user-specific settings if needed
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
    id?: ExcepcionId; // Firestore Document ID
    userId: UserId;
    residenciaId: ResidenciaId;
    fecha: Timestamp; // Specific date of the meal
    tiempoComidaId: TiempoComidaId; // Specific meal time ID
    alternativaId: AlternativaTiempoComidaId; // The chosen Alternativa for this specific instance
    estadoAprobacion: EstadoAprobacion; // pendiente, aprobado, rechazado, no_requerido
    alternativaContingenciaId?: AlternativaTiempoComidaId | null; // Store contingency if approval was required
    fechaSolicitud: Timestamp; // When the Eleccion was created/last updated
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
    id?: ComentarioId; // Firestore Document ID
    userId: UserId; // Author
    residenciaId: ResidenciaId;
    texto: string;
    fechaAplicacion?: Timestamp | null; // Specific date it applies to, or null for 'next opportunity'
    fechaCreacion: Timestamp;
    leido?: boolean; // Optional: Track if read by director
}

// *** NEW: LogEntry interface ***
export interface LogEntry {
    id?: LogEntryId; // Firestore Document ID
    timestamp: Timestamp;
    userId: UserId; // User performing the action
    residenciaId?: ResidenciaId; // Context where available
    action: LogActionType;
    details: any; // Flexible object for action-specific details
}
