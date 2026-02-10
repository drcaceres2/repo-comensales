import { z } from 'zod';
import { FirebaseIdSchema, CadenaOpcionalLimitada } from './common';
import { campoFechaConZonaHorariaSchema } from './fechas';

export const AusenciaSchema = z.object({
  id: FirebaseIdSchema.optional(),
  userId: FirebaseIdSchema,
  residenciaId: FirebaseIdSchema,
  fechaInicio: campoFechaConZonaHorariaSchema,
  ultimoTiempoComidaId: FirebaseIdSchema.optional(),
  fechaFin: campoFechaConZonaHorariaSchema,
  primerTiempoComidaId: FirebaseIdSchema.optional(),
  retornoPendienteConfirmacion: z.boolean().optional(),
  fechaCreacion: campoFechaConZonaHorariaSchema,
  motivo: CadenaOpcionalLimitada(3,100),
});