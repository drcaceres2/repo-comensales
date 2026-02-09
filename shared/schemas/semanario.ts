import { z } from 'zod';
import { FirebaseIdSchema } from './common';

export const SemanarioSchema = z.object({
  id: FirebaseIdSchema.optional(),
  userId: FirebaseIdSchema,
  residenciaId: FirebaseIdSchema,
  elecciones: z.record(FirebaseIdSchema, FirebaseIdSchema.nullable()),
  ultimaActualizacion: z.number(),
});
