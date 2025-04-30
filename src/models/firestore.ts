// src/models/firestore.ts

import { Timestamp } from "firebase/firestore";

// --- Basic Types ---
export type ResidenciaId = string;
export type ComedorId = string;
export type TiempoComidaId = string;
export type AlternativaTiempoComidaId = string;
export type UserId = string;
export type ComentarioId = string;

// --- Added Types ---
export type DayOfWeekKey = 'lunes' | 'martes' | 'miercoles' | 'jueves' | 'viernes' | 'sabado' | 'domingo';
export type TipoAccesoAlternativa = 'abierto' | 'autorizado' | 'cerrado'; // Access levels

// --- Interfaces ---

export interface UserProfile {
  id: UserId;
  nombre: string;
  apellido: string;
  email: string;
  residenciaId?: ResidenciaId;
  isAdmin?: boolean;
}

export interface MealRequestSubmissionTimes {
  lunes?: string;
  martes?: string;
  miercoles?: string;
  jueves?: string;
  viernes?: string;
  sabado?: string;
  domingo?: string;
}

// --- UPDATED TiempoComida Interface ---
export interface TiempoComida {
  id: TiempoComidaId;
  nombre: string; // e.g., "Desayuno", "Almuerzo", "Cena"
  residenciaId: ResidenciaId;
  orden: number; // Order in which to display/process this meal time
  diasDisponibles: DayOfWeekKey[]; // Specifies on which days it's available
}
// --- END UPDATED TiempoComida Interface ---


// --- UPDATED AlternativaTiempoComida Interface ---
export interface AlternativaTiempoComida {
  id: AlternativaTiempoComidaId;
  nombre: string;
  tipo: 'comedor' | 'paraLlevar'; // Specifies where the meal is consumed
  tipoAcceso: TipoAccesoAlternativa; // Specifies who can choose it
  // diasDisponibles moved to TiempoComida
  ventanaInicio: string;
  iniciaDiaAnterior?: boolean;
  ventanaFin: string;
  terminaDiaSiguiente?: boolean;
  tiempoComidaId: TiempoComidaId; // Link to the parent TiempoComida
  residenciaId: ResidenciaId; // Link back to the Residencia
  comedorId?: ComedorId; // Optional: Link to a specific Comedor (especially if tipo is 'comedor')
}
// --- END UPDATED AlternativaTiempoComida Interface ---

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
  mealRequestSubmissionTimes: MealRequestSubmissionTimes;
  // Optional fields to hold related data (when fetched/mocked)
  tiemposComida?: TiempoComida[];
  alternativas?: AlternativaTiempoComida[];
  comedores?: Comedor[];
}


export interface Eleccion {
  id: string;
  usuarioId: UserId;
  residenciaId: ResidenciaId;
  fecha: Timestamp;
  tiempoComidaId: TiempoComidaId;
  alternativaTiempoComidaId: AlternativaTiempoComidaId;
  solicitado: boolean;
  // estadoAutorizacion?: 'pendiente' | 'aprobado' | 'rechazado';
  asistencia?: boolean;
  fechaSolicitud: Timestamp;
}

export interface MealCount {
    id: string;
    residenciaId: ResidenciaId;
    tiempoComidaId: TiempoComidaId;
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
