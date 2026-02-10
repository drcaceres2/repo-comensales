import { z } from 'zod';
import { FirebaseIdSchema, DateStringSchema } from './common';

/**
 * ExcepcionSchema: Representa la voluntad del usuario de desviarse de su Semanario.
 * Corresponde al Nivel 3 de la Cascada de la Verdad.
 */
export const ExcepcionSchema = z.object({
  id: FirebaseIdSchema.optional(),
  usuarioId: FirebaseIdSchema,
  residenciaId: FirebaseIdSchema,
  fecha: DateStringSchema, // "YYYY-MM-DD"
  tiempoComidaId: FirebaseIdSchema,
  tipo: z.enum(['cambio_alternativa', 'cancelacion_comida', 'cambio_dieta']),
  alternativaTiempoComidaId: FirebaseIdSchema.optional(), // Solo si tipo='cambio_alternativa'
  motivo: z.string().optional(),
  autorizadoPor: FirebaseIdSchema.optional(),
});
