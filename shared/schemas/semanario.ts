import { z } from 'zod';
import { FirebaseIdSchema } from './common';
import { campoFechaConZonaHorariaSchema } from './fechas';

export const SemanarioSchema = z.object({
  id: FirebaseIdSchema.optional(),
  userId: FirebaseIdSchema,
  residenciaId: FirebaseIdSchema,
  elecciones: z.record(FirebaseIdSchema, FirebaseIdSchema.nullable()),
  ultimaActualizacion: campoFechaConZonaHorariaSchema,
});
