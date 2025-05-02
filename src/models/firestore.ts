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
export type DietaId = string; // *** NEW: Dieta ID Type ***

// --- Added Types ---
export type DayOfWeekKey = 'lunes' | 'martes' | 'miercoles' | 'jueves' | 'viernes' | 'sabado' | 'domingo';
export type TipoAccesoAlternativa = 'abierto' | 'autorizado' | 'cerrado'; // Access levels

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

export type TipoAlternativa = 'comedor' | 'paraLlevar'; // Added this export

// --- Interfaces ---

// --- UPDATED UserProfile Interface ---
export interface UserProfile {
  id: UserId; // Corresponds to Firebase Auth UID
  nombre: string;
  apellido: string;
  email: string; // Mandatory (from Firebase Auth)
  roles: UserRole[]; // Mandatory role
  isActive: boolean; // For soft deletes

  // Association
  residenciaId?: ResidenciaId; // Optional for 'master', likely mandatory for others in logic
  dietaId?: DietaId; // *** ADDED: Link to user's current primary diet ***

  // Resident-specific (Optional in interface, mandatory in logic for 'residente' role)
  numeroDeRopa?: string; // Laundry number
  habitacion?: string; // Room number

  // Optional details
  universidad?: string;
  carrera?: string;
  dni?: string; // National ID
  fechaDeCumpleanos?: Timestamp; // Birthday (use Firestore Timestamp)
}
// --- END UPDATED UserProfile Interface ---

// *** NEW: Dieta Interface ***
export interface Dieta {
    id: DietaId;
    residenciaId: ResidenciaId; // Dietas are specific to a residence
    nombre: string; // e.g., "Standard", "Sin Gluten", "Vegetariana"
    descripcion?: string;
    isDefault?: boolean; // Indicates the standard/default diet for the residence
    isActive: boolean; // For soft deletes (important for historical choices)
}
// *** END Dieta Interface ***

// --- NEW HorarioSolicitudComida Interface ---
export interface HorarioSolicitudComida {
  id: HorarioSolicitudComidaId;
  residenciaId: ResidenciaId;
  nombre: string; // Descriptive name (e.g., "Same Day Morning", "Day Before Evening")
  horaLimite: string; // The time of day for the deadline (e.g., "10:00", "20:00")
  diasAntelacion: number; // Days before the meal date the deadline applies (0 = same day, 1 = day before, etc.)
}
// --- END NEW HorarioSolicitudComida Interface ---

export interface TiempoComida {
  id: TiempoComidaId;
  nombre: string; // e.g., "Desayuno", "Almuerzo", "Cena"
  residenciaId: ResidenciaId;
  orden: number; // Order in which to display/process this meal time
  diasDisponibles: DayOfWeekKey[]; // Specifies on which days it's available
}

// --- UPDATED AlternativaTiempoComida Interface ---
export interface AlternativaTiempoComida {
  id: AlternativaTiempoComidaId;
  nombre: string;
  tipo: 'comedor' | 'paraLlevar';
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
// --- END UPDATED AlternativaTiempoComida Interface ---

export interface Comedor {
  id: ComedorId;
  nombre: string;
  residenciaId: ResidenciaId;
  descripcion?: string;
}

// --- UPDATED Residencia Interface ---
export interface Residencia {
  id: ResidenciaId;
  nombre: string;
  direccion?: string;
  // Optional fields to hold related data
  horariosSolicitudComida?: HorarioSolicitudComida[];
  tiemposComida?: TiempoComida[];
  alternativas?: AlternativaTiempoComida[];
  comedores?: Comedor[];
  dietas?: Dieta[]; // *** ADDED: Can hold related Dietas ***
}
// --- END UPDATED Residencia Interface ---

// --- UPDATED Eleccion Interface ---
export interface Eleccion {
  id: string; // Firestore generated ID is usually simplest
  usuarioId: UserId;
  residenciaId: ResidenciaId;
  fecha: Timestamp; // The date for which the meal is chosen (Midnight UTC)
  tiempoComidaId: TiempoComidaId;
  alternativaTiempoComidaId: AlternativaTiempoComidaId;
  dietaId?: DietaId; // *** ADDED: Records the diet context for this choice ***
  solicitado: boolean;
  asistencia?: boolean;
  fechaSolicitud: Timestamp;
}
// --- END UPDATED Eleccion Interface ---

export interface MealCount {
    id: string; // Firestore generated ID
    residenciaId: ResidenciaId;
    tiempoComidaId: TiempoComidaId;
    alternativaTiempoComidaId: AlternativaTiempoComidaId;
    dietaId?: DietaId; // *** ADDED: Count per diet ***
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
