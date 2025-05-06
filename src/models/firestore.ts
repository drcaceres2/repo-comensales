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
export type ExcepcionId = string; // Note: This might become less relevant if 'Eleccion' covers all cases

// --- Added Types ---
export type DayOfWeekKey = 'lunes' | 'martes' | 'miercoles' | 'jueves' | 'viernes' | 'sabado' | 'domingo';
export type TipoAccesoAlternativa = 'abierto' | 'autorizado' | 'cerrado';
// <<< UPDATED: EstadoAprobacion >>>
export type EstadoAprobacion = 'pendiente' | 'aprobado' | 'rechazado' | 'no_requerido' | 'contingencia' | 'anulada_por_cambio'; // Added 'contingencia' and 'anulada_por_cambio'
export type ModoEleccionUsuario = 'normal' | 'diario' | 'suspendido'; // User meal choice mode

// <<< NEW: OrigenEleccion >>>
export type OrigenEleccion = 'semanario' | 'excepcion' | 'excepcion_autorizada' | 'contingencia' | 'director' | 'invitado_wizard'; // Added 'invitado_wizard'

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
    'dieta_desasignada' |
    'semanario_updated' |
    'eleccion_created' | // Renamed from 'excepcion_created' for clarity
    'eleccion_updated' | // Added
    'eleccion_deleted' | // Renamed from 'excepcion_deleted'
    'ausencia_created' |
    'ausencia_updated' |
    'ausencia_deleted' |
    'comentario_created' |
    'modo_eleccion_updated';

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

export type TipoAlternativa = 'comedor' | 'paraLlevar' | 'ayuno';

// --- Interfaces ---

export interface Residencia {
    id: ResidenciaId;
    nombre: string;
    direccion?: string;
    logoUrl?: string;
    // Removed embedded collections - prefer top-level collections queried by residenciaId
  }

export interface Comedor {
    id: ComedorId;
    nombre: string;
    residenciaId: ResidenciaId;
    descripcion?: string;
    isVirtual: boolean;
}

// <<< UPDATED: TiempoComida >>>
export interface TiempoComida {
    id: TiempoComidaId;
    nombre: string; // e.g., "Almuerzo", "Cena", "Desayuno", "Brunch Domingo"
    residenciaId: ResidenciaId;
    nombreGrupo: string; // e.g., "Comidas Principales", "Desayunos", "Eventos Especiales"
    ordenGrupo: number; // For sorting groups (e.g., 1: Desayuno, 2: Almuerzo, 3: Cena)
    dia: DayOfWeekKey; // <<< CHANGED: Now single day
    horaEstimada?: string; // Optional: Display time like "13:30hs"
}

export interface AlternativaTiempoComida {
    id: AlternativaTiempoComidaId;
    nombre: string; // e.g., "Menú Normal", "Menú Vegetariano", "Para Llevar", "No como"
    tipo: TipoAlternativa; // 'comedor' or 'paraLlevar'
    tipoAcceso: TipoAccesoAlternativa; // 'abierto', 'autorizado', 'cerrado'
    requiereAprobacion: boolean; // If true, director must approve 'Eleccion'
    ventanaInicio: string; // HH:mm - Start time window for this alternative
    iniciaDiaAnterior?: boolean; // Does the window start the day before the meal date?
    ventanaFin: string; // HH:mm - End time window
    terminaDiaSiguiente?: boolean; // Does the window end the day after the meal date?
    horarioSolicitudComidaId: HorarioSolicitudComidaId; // Link to the request schedule
    tiempoComidaId: TiempoComidaId; // Link to the specific meal time (defines day, group)
    residenciaId: ResidenciaId;
    comedorId?: ComedorId; // If 'tipo' is 'comedor', link to the dining hall
    isActive: boolean; // Can this alternative be chosen?
}

// <<< UPDATED: HorarioSolicitudComida >>>
export interface HorarioSolicitudComida {
    id: HorarioSolicitudComidaId;
    residenciaId: ResidenciaId;
    nombre: string; // e.g., "Solicitud Semanal", "Cambio Almuerzo", "Cambio Cena"
    dia: DayOfWeekKey; // Day of the week this schedule applies to
    horaSolicitud: string; // HH:mm - Deadline time for this request/change window
    isPrimary: boolean; // True if this is the main weekly request schedule
    isActive: boolean; // Is this schedule currently active?
}

export interface Dieta {
    id: DietaId;
    residenciaId: ResidenciaId;
    nombre: string;
    descripcion?: string;
    isDefault?: boolean; // True if this is the default diet (e.g., "Normal")
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
    dietaId?: DietaId; // User's default assigned diet
    modoEleccion?: ModoEleccionUsuario;
    numeroDeRopa?: string;
    habitacion?: string;
    universidad?: string;
    carrera?: string;
    dni?: string;
    fechaDeCumpleanos?: Timestamp;
}

// SemanarioAlternativaSeleccion remains conceptually similar but context might change
export interface SemanarioAlternativaSeleccion {
    alternativaId: AlternativaTiempoComidaId; // The primary choice
    requiereAprobacion: boolean; // Store this explicitly based on the selected Alternativa
    alternativaContingenciaId?: AlternativaTiempoComidaId | null; // Fallback if requiereAprobacion is true and rejected
}

export interface Semanario {
    id?: string; // Document ID (likely userId)
    userId: UserId;
    residenciaId: ResidenciaId;
    elecciones: {
        [key in DayOfWeekKey]?: {
            [tiempoComidaId: string]: SemanarioAlternativaSeleccion;
        }
    };
    ultimaActualizacion: Timestamp;
}

// <<< UPDATED: Eleccion >>>
// Represents a specific meal choice for a specific date, often overriding the semanario.
export interface Eleccion {
    id?: string; // Firestore Document ID, may be omitted on creation
    usuarioId: UserId;
    residenciaId: ResidenciaId;
    fecha: Timestamp; // The specific date of the meal
    tiempoComidaId: TiempoComidaId;
    alternativaTiempoComidaId: AlternativaTiempoComidaId;
    dietaId?: DietaId; // Diet applicable at the time of choice (could be default or assigned)
    solicitado: boolean; // Generally true, indicates user made a choice (or system default)
    asistencia?: boolean; // Optional: Track if the user actually attended
    fechaSolicitud: Timestamp; // When this choice was made/recorded
    estadoAprobacion: EstadoAprobacion; // Use the updated type
    origen: OrigenEleccion; // <<< NEW: Source of the choice
    comentario?: string; // Optional user comment for this specific choice
    processedForBilling?: boolean; // Optional flag for billing integration
}

// MealCount structure remains the same, utility depends on implementation.
export interface MealCount {
    id: string; // Composite ID like: {residenciaId}_{fecha}_{tiempoComidaId}_{alternativaId}_{dietaId?}
    residenciaId: ResidenciaId;
    tiempoComidaId: TiempoComidaId;
    alternativaTiempoComidaId: AlternativaTiempoComidaId;
    dietaId?: DietaId | 'ninguna'; // Use 'ninguna' or similar if diet isn't relevant for this count
    fecha: Timestamp; // Date (YYYY-MM-DD, start of day timestamp)
    totalSolicitado: number; // Count of users choosing this combo
    totalAprobado?: number; // Count after approval logic (if applicable)
}

export interface Ausencia {
    id?: AusenciaId;
    userId: UserId;
    residenciaId: ResidenciaId;
    fechaInicio: Timestamp; // Date the absence starts
    ultimoTiempoComidaId?: TiempoComidaId | null; // Last meal *before* leaving (optional)
    fechaFin: Timestamp; // Date the absence ends
    primerTiempoComidaId?: TiempoComidaId | null; // First meal *after* returning (optional)
    retornoPendienteConfirmacion?: boolean; // User needs to confirm return date
    fechaCreacion: Timestamp;
    motivo?: string; // Optional reason
}

export interface Comentario {
    id: ComentarioId;
    usuarioId: UserId; // Who sent it
    destinatarioId?: UserId; // Optional: specific recipient (e.g., director)
    residenciaId: ResidenciaId;
    texto: string;
    fechaEnvio: Timestamp;
    leido: boolean;
    archivado: boolean;
    relacionadoA?: { // Optional link to related item
        coleccion: 'eleccion' | 'ausencia' | 'usuario'; // etc.
        documentoId: string;
    };
}

export interface LogEntry {
    id: LogEntryId;
    timestamp: Timestamp;
    userId: UserId; // User performing the action (or 'system')
    residenciaId?: ResidenciaId; // Contextual, if applicable
    actionType: LogActionType;
    relatedDocPath?: string; // e.g., "residencias/R001/elecciones/E123"
    details?: string | object; // More context about the change
}
