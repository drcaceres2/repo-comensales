import { z } from 'zod';
import { FirebaseIdSchema, DateStringSchema } from './common';

export const EleccionSchema = z.object({
  id: FirebaseIdSchema.optional(),
  usuarioId: FirebaseIdSchema,
  residenciaId: FirebaseIdSchema,
  fecha: DateStringSchema, // "YYYY-MM-DD"
  tiempoComidaId: FirebaseIdSchema,
  selected: z.boolean(),
  alternativaTiempoComidaId: FirebaseIdSchema.optional(),
  dietaId: FirebaseIdSchema.optional(),
  solicitadoAdministracion: z.boolean(),
  congelado: z.boolean(),
  asistencia: z.boolean().nullable().optional(),
  fechaSolicitudAdministracion: DateStringSchema,
  estadoAprobacion: z.enum(['pendiente', 'aprobado', 'rechazado', 'no_requerido', 'contingencia', 'contingencia_no_considerada', 'anulada_por_cambio']),
  origen: z.enum(['semanario', 'excepcion', 'excepcion_autorizada', 'contingencia', 'director', 'invitado_wizard', 'actividad']),
  centroCostoId: FirebaseIdSchema.optional(),
  comentario: z.string().optional(),
  processedForBilling: z.boolean().optional(),
  actividadId: FirebaseIdSchema.optional(),
  TiempoComidaAlternativaUnicaActividadId: FirebaseIdSchema.optional(),
  tipoEleccion: z.enum(['regular', 'actividad']),
  origenCentroCosto: z.enum(['usuario-por-defecto', 'comedor-por-defecto', 'manual', 'modificado']).optional(),
});
