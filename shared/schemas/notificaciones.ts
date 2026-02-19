import { z } from 'zod';
import { FirebaseIdSchema } from './common';
import { HoraIsoSchema, TimestampStringSchema } from './fechas';

// ============================================
// Notificaciones
// ============================================

export const NotificacionTipoSchema = z.enum(['info', 'accion_requerida', 'recordatorio', 'alerta']);
export const NotificacionPrioridadSchema = z.enum(['baja', 'media', 'alta']);

export const NotificacionRelacionadaSchema = z.object({
    coleccion: z.enum(['excepcion', 'actividad', 'ausencia', 'mealCount']),
    documentoId: FirebaseIdSchema,
}).strict();

/**
 * Notificacion: Sistema de notificaciones multi-canal.
 */
export const NotificacionSchema = z.object({
    id: FirebaseIdSchema,
    residenciaId: FirebaseIdSchema,
    usuarioId: FirebaseIdSchema,
    tipo: NotificacionTipoSchema,
    prioridad: NotificacionPrioridadSchema,
    titulo: z.string(),
    mensaje: z.string(),
    relacionadoA: NotificacionRelacionadaSchema.optional(),
    leido: z.boolean(),
    creadoEn: z.number(),
    venceEn: z.number().optional(),
    entregadoCorreoEn: z.number().optional(),
    enviadoCorreoA: z.string().optional(),
    estadoCorreo: z.enum(['pendiente', 'enviado', 'fallido']).optional(),
    errorcorreo: z.string().optional(),
    entregadoSMSEn: z.number().optional(),
    entregadoWAEn: z.number().optional(),
    enviadoWAA: z.string(),
    estadoWA: z.enum(['pendiente', 'enviado', 'fallido']),
    errorWA: z.string().optional(),
    entregadoEnAppEn: z.number().optional(),
}).strict();

// ============================================
// NotificacionPreferencias (usada en Usuario)
// ============================================

export const NotificacionPreferenciasSchema = z.object({
    canalEmail: z.boolean(),
    canalWhatsApp: z.boolean(),
    canalSMS: z.boolean().optional(),
    tiposPermitidos: z.array(NotificacionTipoSchema),
    notificacionesSilenciadas: z.boolean().optional(),
    horaMaxima: HoraIsoSchema.optional(),
    horaMinima: HoraIsoSchema.optional(),
}).strict();

// Type exports
export type Notificacion = z.infer<typeof NotificacionSchema>;
export type NotificacionPreferencias = z.infer<typeof NotificacionPreferenciasSchema>;
