import { z } from 'zod';

// Formato estricto YYYY-MM-DD
export const DateStringSchema = z.string().regex(
  /^\d{4}-\d{2}-\d{2}$/, 
  { message: "La fecha debe tener formato YYYY-MM-DD" }
);

// IDs de Firestore (no vacíos)
export const FirebaseIdSchema = z.string().min(1, "ID inválido");

// Tipos base para reutilizar
export const TimeStringSchema = z.string().regex(/^\d{2}:\d{2}$/, "Formato HH:mm requerido");