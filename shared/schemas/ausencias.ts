import { z } from 'zod';
import { FirebaseIdSchema, TimeStringSchema, DateStringSchema } from './common';

export const AusenciaSchema = z.object({
  id: FirebaseIdSchema.optional(),
  userId: FirebaseIdSchema,
  residenciaId: FirebaseIdSchema,
  fechaInicio: DateStringSchema, // "YYYY-MM-DD"
  ultimoTiempoComidaId: FirebaseIdSchema.optional(),
  fechaFin: DateStringSchema, // "YYYY-MM-DD"
  primerTiempoComidaId: FirebaseIdSchema.optional(),
  retornoPendienteConfirmacion: z.boolean().optional(),
  fechaCreacion: z.number(), // Timestamp in milliseconds
  motivo: z.string().optional(),
});