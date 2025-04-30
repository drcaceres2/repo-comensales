// src/models/firestore.ts

import { Timestamp } from "firebase/firestore";

// --- Basic Types ---
export type ResidenciaId = string;
export type ComedorId = string;
export type TiempoComidaId = string;
export type AlternativaTiempoComidaId = string; // New ID type
export type UserId = string;
export type ComentarioId = string; // New ID type

// --- Interfaces ---

export interface UserProfile {
  id: UserId;
  nombre: string;
  apellido: string;
  email: string;
  residenciaId?: ResidenciaId;
  isAdmin?: boolean;
}

// Define the structure for daily meal request submission cut-off times
export interface MealRequestSubmissionTimes {
  lunes?: Timestamp;   // Use Firestore Timestamp
  martes?: Timestamp;
  miercoles?: Timestamp;
  jueves?: Timestamp;
  viernes?: Timestamp;
  sabado?: Timestamp;
  domingo?: Timestamp;
}

export interface Residencia {
  id: ResidenciaId;
  nombre: string;
  direccion?: string;
  mealRequestSubmissionTimes: MealRequestSubmissionTimes;
}

export interface Comedor {
  id: ComedorId;
  nombre: string;
  residenciaId: ResidenciaId;
  descripcion?: string;
}

// Represents a general meal category (e.g., Breakfast, Lunch, Dinner)
export interface TiempoComida {
  id: TiempoComidaId;
  nombre: string; // e.g., "Desayuno", "Almuerzo", "Cena"
  residenciaId: ResidenciaId;
}

// Represents a specific option within a TiempoComida (e.g., Early Breakfast, Takeaway Lunch)
export interface AlternativaTiempoComida {
  id: AlternativaTiempoComidaId;
  nombre: string; // e.g., "Desayuno Temprano", "Almuerzo para Llevar"
  tipo: 'comedor' | 'paraLlevar';
  ventanaInicio: string; // Time string (e.g., "07:00", "13:00")
  ventanaFin: string; // Time string (e.g., "08:00", "14:00")
  tiempoComidaId: TiempoComidaId; // Link to the parent TiempoComida
  residenciaId: ResidenciaId; // Link back to the Residencia
  // Optional: Add details like location within the Comedor if needed
  // ubicacionEspecifica?: string;
}

export interface Eleccion {
  id: string;
  usuarioId: UserId;
  residenciaId: ResidenciaId;
  fecha: Timestamp; // Date of the meal
  tiempoComidaId: TiempoComidaId; // Link to the general meal category
  alternativaTiempoComidaId: AlternativaTiempoComidaId; // Link to the specific alternative chosen
  solicitado: boolean; // True if requested, false if declined
  asistencia?: boolean; // Optional: Track attendance for 'comedor' type
  fechaSolicitud: Timestamp; // When the choice was made
}


// Aggregated counts for a specific *general* meal time on a specific date
// Counts can be refined later if needed per alternative
export interface MealCount {
    id: string; // Composite ID like YYYY-MM-DD_TiempoComidaId
    residenciaId: ResidenciaId;
    tiempoComidaId: TiempoComidaId; // Counts remain at the general meal level for now
    fecha: Timestamp;
    totalSolicitado: number;
    // Optional: Track counts per alternative if needed later
    // countsPorAlternativa?: { [key: AlternativaTiempoComidaId]: number };
}

// Represents a comment or feedback submitted by a resident
export interface Comentario {
  id: ComentarioId; // Firestore auto-generated ID
  usuarioId: UserId; // Who sent it
  residenciaId: ResidenciaId; // Which residence it pertains to
  texto: string; // The content of the comment
  fechaEnvio: Timestamp; // When it was sent
  leido: boolean; // Has an admin read it?
  archivado: boolean; // Has it been archived?
  // Optional: Add fields for admin responses if needed
  // respuestaAdmin?: string;
  // fechaRespuesta?: Timestamp;
}
