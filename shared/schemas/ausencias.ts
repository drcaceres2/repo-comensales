import { z } from 'zod';
import { FirebaseIdSchema, TimeStringSchema, DateStringSchema } from './common';

export const AusenciaSchema = z.object({
  id: FirebaseIdSchema.optional(), // Opcional al crear
  usuarioId: FirebaseIdSchema,
  fechaInicio: DateStringSchema, // "2023-10-01"
  fechaFin: DateStringSchema,    // "2023-10-05"
  tipo: z.enum(['baja', 'viaje', 'enfermedad', 'otro']), // Según tu lógica
  motivo: z.string().optional(),
  comidasAfectadas: z.array(z.string()).optional(), // IDs de tiempos de comida
});