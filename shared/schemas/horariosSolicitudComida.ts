import { z } from 'zod';
import { FirebaseIdSchema } from './common';
import { TimeStringSchema } from './fechas';

const DayOfWeekKeySchema = z.enum(['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo']);

export const HorarioSolicitudComidaSchema = z.object({
  id: FirebaseIdSchema,
  residenciaId: FirebaseIdSchema,
  nombre: z.string().min(1).max(20),
  dia: DayOfWeekKeySchema,
  horaSolicitud: TimeStringSchema,
  isPrimary: z.boolean(),
  isActive: z.boolean(),
});
