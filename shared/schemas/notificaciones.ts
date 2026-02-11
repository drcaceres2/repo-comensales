import { z } from 'zod';
import { FirebaseIdSchema, FirestoreTimestampSchema } from './common';

export const NotificacionRelacionadaSchema = z.object({
  coleccion: z.enum(['excepcion', 'actividad', 'ausencia', 'mealCount']),
  documentoId: FirebaseIdSchema,
}).strict();

export const NotificacionSchema = z.object({
  id: FirebaseIdSchema,
  residenciaId: FirebaseIdSchema,
  usuarioId: FirebaseIdSchema,
  tipo: z.enum(['info', 'accion_requerida', 'recordatorio', 'alerta']),
  prioridad: z.enum(['baja', 'media', 'alta']),
  titulo: z.string(),
  mensaje: z.string(),
  relacionadoA: NotificacionRelacionadaSchema.optional(),
  leido: z.boolean(),
  creadoEn: FirestoreTimestampSchema,
  venceEn: FirestoreTimestampSchema.optional(),
  entregadoCorreoEn: FirestoreTimestampSchema.optional(),
  enviadoCorreoA: z.string().optional(),
  estadoCorreo: z.enum(['pendiente', 'enviado', 'fallido']).optional(),
  errorcorreo: z.string().optional(),
  entregadoSMSEn: FirestoreTimestampSchema.optional(),
  entregadoWAEn: FirestoreTimestampSchema.optional(),
  enviadoWAA: z.string(),
  estadoWA: z.enum(['pendiente', 'enviado', 'fallido']),
  errorWA: z.string().optional(),
  entregadoEnAppEn: FirestoreTimestampSchema.optional(),
}).strict();

export type Notificacion = z.infer<typeof NotificacionSchema>;
