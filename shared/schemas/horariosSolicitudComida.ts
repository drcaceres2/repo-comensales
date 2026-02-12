import { z } from 'zod';
import { FirebaseIdSchema } from './common';
import { IsoTimeStringSchema } from './fechas';

const DayOfWeekKeySchema = z.enum(['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo']);

export const HorarioSolicitudComidaSchema = z.object({
  id: FirebaseIdSchema,
  residenciaId: FirebaseIdSchema,
  nombre: z.string().min(1).max(20),
  dia: DayOfWeekKeySchema,
  horaSolicitud: IsoTimeStringSchema,
  isPrimary: z.boolean(),
  isActive: z.boolean(),
});
