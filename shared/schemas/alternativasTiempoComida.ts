import { z } from 'zod';
import { FirebaseIdSchema } from './common';
import { TimeStringSchema } from './fechas';

export const AlternativaTiempoComidaSchema = z.object({
  id: FirebaseIdSchema,
  nombre: z.string(),
  tipo: z.enum(['comedor', 'paraLlevar', 'ayuno']),
  tipoAcceso: z.enum(['abierto', 'autorizado', 'cerrado']),
  requiereAprobacion: z.boolean(),
  ventanaInicio: TimeStringSchema,
  iniciaDiaAnterior: z.boolean().optional(),
  ventanaFin: TimeStringSchema,
  terminaDiaSiguiente: z.boolean().optional(),
  horarioSolicitudComidaId: FirebaseIdSchema.nullable().optional(),
  tiempoComidaId: FirebaseIdSchema,
  residenciaId: FirebaseIdSchema,
  comedorId: FirebaseIdSchema.optional(),
  esPrincipal: z.boolean(),
  isActive: z.boolean(),
});
