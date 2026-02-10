import { z } from 'zod';
import { FirebaseIdSchema, TimeStringSchema } from './common';

const DayOfWeekKeySchema = z.enum(['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo']);

export const HorarioSolicitudComidaSchema = z.object({
  id: FirebaseIdSchema,
  residenciaId: FirebaseIdSchema,
  nombre: z.string(),
  dia: DayOfWeekKeySchema,
  horaSolicitud: TimeStringSchema,
  isPrimary: z.boolean(),
  isActive: z.boolean(),
});
