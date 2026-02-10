import { z } from 'zod';
import { FirebaseIdSchema, TimeStringSchema, DateStringSchema } from './common';

export const TiempoComidaSchema = z.object({
  id: FirebaseIdSchema,
  nombre: z.string(),
  ordenGrupo: z.number(),
  activa: z.boolean(),
  horaInicio: TimeStringSchema.optional(),
  horaFin: TimeStringSchema.optional(),
  // Validación extra: reglas de negocio básicas
  residenciaId: FirebaseIdSchema.optional(),
});

export const MealSelectionMutationSchema = z.object({
  userId: FirebaseIdSchema,     // ¿Quién come?
  residenciaId: FirebaseIdSchema,
  fecha: DateStringSchema,      // ¿Cuándo?
  tiempoComidaId: FirebaseIdSchema, // ¿Desayuno, Comida, Cena?
  
  // La intención del usuario
  accion: z.enum(['inscribir', 'desinscribir']), 
  
  // Origen del cambio (Auditoría)
  source: z.enum(['manual_residente', 'manual_asistente']),
  
  // Metadatos opcionales para logs
  timestamp: z.number().default(() => Date.now()),
});

// Inferencia automática del tipo TypeScript desde Zod
export type MealSelectionMutation = z.infer<typeof MealSelectionMutationSchema>;