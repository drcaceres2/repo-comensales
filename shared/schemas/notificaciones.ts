import { z } from 'zod';
import { FirestoreIdSchema, slugIdSchema } from './common';
import { HoraIsoSchema } from './fechas';

// ============================================
// Notificaciones
// ============================================

export const NotificacionTipoSchema = z.enum(['info', 'accion_requerida', 'recordatorio', 'alerta']);
export const NotificacionPrioridadSchema = z.enum(['baja', 'media', 'alta']);

export const NotificacionRelacionadaSchema = z.object({
    coleccion: z.enum(['excepcion', 'actividad', 'ausencia', 'mealCount']),
    documentoId: FirestoreIdSchema,
}).strict();

const NotificacionBaseSchema = z.object({
    residenciaId: slugIdSchema,
    usuarioId: FirestoreIdSchema,
    tipo: NotificacionTipoSchema,
    prioridad: NotificacionPrioridadSchema,
    titulo: z.string(),
    mensaje: z.string(),
    relacionadoA: NotificacionRelacionadaSchema.optional(),
    venceEn: z.number().optional(),
});

/**
 * Notificacion: Sistema de notificaciones multi-canal.
 */
export const NotificacionSchema = NotificacionBaseSchema.extend({
    id: FirestoreIdSchema,
    leido: z.boolean(),
    creadoEn: z.number(),
    entregadoCorreoEn: z.number().optional(),
    enviadoCorreoA: z.string().optional(),
    estadoCorreo: z.enum(['pendiente', 'enviado', 'fallido']).optional(),
    errorcorreo: z.string().optional(),
    entregadoSMSEn: z.number().optional(),
    entregadoWAEn: z.number().optional(),
    enviadoWAA: z.string().optional(),
    estadoWA: z.enum(['pendiente', 'enviado', 'fallido']).optional(),
    errorWA: z.string().optional(),
    entregadoEnAppEn: z.number().optional(),
}).strict();

export const NotificacionCreateSchema = NotificacionBaseSchema;
export const NotificacionUpdateSchema = NotificacionBaseSchema.partial().extend({
    leido: z.boolean().optional(),
});


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
export type NotificacionCreate = z.infer<typeof NotificacionCreateSchema>;
export type NotificacionUpdate = z.infer<typeof NotificacionUpdateSchema>;
export type NotificacionPreferencias = z.infer<typeof NotificacionPreferenciasSchema>;
