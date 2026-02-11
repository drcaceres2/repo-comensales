import { z } from 'zod';
import { FirebaseIdSchema, CadenaOpcionalLimitada } from './common';
import { IsoDateStringSchema } from './fechas';

/**
 * ExcepcionSchema: Representa la voluntad del usuario de desviarse de su Semanario.
 * Corresponde al Nivel 3 de la Cascada de la Verdad.
 */
export const ExcepcionSchema = z.object({
  id: FirebaseIdSchema.optional(),
  usuarioId: FirebaseIdSchema,
  residenciaId: FirebaseIdSchema,
  fecha: IsoDateStringSchema, // "YYYY-MM-DD"
  tiempoComidaId: FirebaseIdSchema,
  tipo: z.enum(['cambio_alternativa', 'cancelacion_comida', 'cambio_dieta']),
  alternativaTiempoComidaId: FirebaseIdSchema.optional(), // Solo si tipo='cambio_alternativa'
  motivo: CadenaOpcionalLimitada(),
  origen: z.enum(['residente', 'director', 'asistente', 'wizard_invitados']),
  autorizadoPor: FirebaseIdSchema.optional(),
  estadoAprobacion: z.enum(['no_requiere_aprobacion', 'pendiente', 'aprobado', 'rechazado']).optional(),
});
