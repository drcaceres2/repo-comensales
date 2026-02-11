import { z } from 'zod';
import { FirebaseIdSchema, CadenaOpcionalLimitada } from './common';
import { IsoDateStringSchema } from './fechas';

export const AusenciaSchema = z.object({
  id: FirebaseIdSchema.optional(),
  userId: FirebaseIdSchema,
  residenciaId: FirebaseIdSchema,
  fechaInicio: IsoDateStringSchema,
  ultimoTiempoComidaId: FirebaseIdSchema.optional(),
  fechaFin: IsoDateStringSchema,
  primerTiempoComidaId: FirebaseIdSchema.optional(),
  retornoPendienteConfirmacion: z.boolean().optional(),
  fechaHoraCreacion: z.any(),
  motivo: CadenaOpcionalLimitada(3,100),
});