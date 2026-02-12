import { z } from 'zod';
import { FirebaseIdSchema } from './common';
import { IsoTimeStringSchema } from './fechas';

export const AlternativaTiempoComidaSchema = z.object({
  id: FirebaseIdSchema,
  nombre: z.string(),
  tipo: z.enum(['comedor', 'paraLlevar', 'ayuno']),
  tipoAcceso: z.enum(['abierto', 'autorizado', 'cerrado']),
  requiereAprobacion: z.boolean(),
  ventanaInicio: IsoTimeStringSchema,
  iniciaDiaAnterior: z.boolean().optional(),
  ventanaFin: IsoTimeStringSchema,
  terminaDiaSiguiente: z.boolean().optional(),
  horarioSolicitudComidaId: FirebaseIdSchema.nullable().optional(),
  tiempoComidaId: FirebaseIdSchema,
  residenciaId: FirebaseIdSchema,
  comedorId: FirebaseIdSchema.optional(),
  esPrincipal: z.boolean(),
  isActive: z.boolean(),
});
