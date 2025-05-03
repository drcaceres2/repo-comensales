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

// --- Added Types ---
export type DayOfWeekKey = 'lunes' | 'martes' | 'miercoles' | 'jueves' | 'viernes' | 'sabado' | 'domingo';
export type TipoAccesoAlternativa = 'abierto' | 'autorizado' | 'cerrado';
export type EstadoAprobacion = 'pendiente' | 'aprobado' | 'rechazado' | 'no_requerido';
export type ModoEleccionUsuario = 'normal' | 'diario' | 'suspendido'; // <<< NEW: User meal choice mode

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
    'eleccion_modificada_por_director' |
    'eleccion_creada_por_director';

// *** Define User Roles ***
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

// --- UPDATED UserProfile Interface ---
export interface UserProfile {
  id: UserId;
  nombre: string;
  apellido: string;
  email: string;
  roles: UserRole[];
  isActive: boolean;
  residenciaId?: ResidenciaId;
  dietaId?: DietaId;
  // <<< NEW FIELD for user meal selection mode >>>
  modoEleccion?: ModoEleccionUsuario; 
  // --- END NEW FIELD ---
  numeroDeRopa?: string;
  habitacion?: string;
  universidad?: string;
  carrera?: string;
  dni?: string;
  fechaDeCumpleanos?: Timestamp;
}
// --- END UPDATED UserProfile Interface ---

export interface Dieta {
    id: DietaId;
    residenciaId: ResidenciaId;
    nombre: string;
    descripcion?: string;
    isDefault?: boolean;
    isActive: boolean;
}

export interface HorarioSolicitudComida {
  id: HorarioSolicitudComidaId;
  residenciaId: ResidenciaId;
  nombre: string;
  horaLimite: string;
  diasAntelacion: number;
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

export interface Comedor {
  id: ComedorId;
  nombre: string;
  residenciaId: ResidenciaId;
  descripcion?: string;
}

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

export interface Comentario {
  id: ComentarioId;
  usuarioId: UserId;
  residenciaId: ResidenciaId;
  texto: string;
  fechaEnvio: Timestamp;
  leido: boolean;
  archivado: boolean;
}

export interface LogEntry {
    id: LogEntryId;
    timestamp: Timestamp;
    userId: UserId;
    residenciaId: ResidenciaId;
    actionType: LogActionType;
    relatedDocPath?: string;
    details?: string;
}
