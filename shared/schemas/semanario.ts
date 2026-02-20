import { z } from 'zod';
import { FirestoreIdSchema } from './common';
import { FechaIsoSchema, DiaDeLaSemanaSchema, TimestampStringSchema } from './fechas';

// ============================================
// SemanarioUsuario
// ============================================

/**
 * SemanarioUsuario: Configuración cíclica de 7 días del usuario.
 * Nivel 4 (Fallback) de la Cascada de la Verdad.
 * 
 * Estructura de elecciones:
 *   Record<DiaDeLaSemana, Record<TiempoComidaId, ConfigAlternativaId>>
 * 
 * Ejemplo:
 * {
 *   lunes: { "desayuno-lunes": "desayuno-temprano-lunes", "almuerzo-lunes": "almuerzo-normal-lunes" },
 *   martes: { ... },
 *   ...
 * }
 */
export const SemanarioUsuarioSchema = z.object({
    id: FirestoreIdSchema,
    residenciaId: FirestoreIdSchema,

    timestampCreacion: TimestampStringSchema,

    // Vigencia: A partir de qué día aplica esta plantilla
    fechaDesde: FechaIsoSchema,

    // La plantilla: Día -> TiempoComidaId -> ConfigAlternativaId
    elecciones: z.record(
        DiaDeLaSemanaSchema,
        z.record(FirestoreIdSchema, FirestoreIdSchema)
    ),

    // UX: Recordatorio de cambio
    recordatorioCambio: z.object({
        fechaNotificacion: FechaIsoSchema,
        mensaje: z.string().max(500),
        visto: z.boolean(),
    }).strict().optional(),
}).strict();

// Schema para CREATE SemanarioUsuario
export const createSemanarioUsuarioSchema = SemanarioUsuarioSchema.omit({
    id: true,
    timestampCreacion: true,
}).extend({
    timestampCreacion: TimestampStringSchema.optional(),
});

// Schema para UPDATE SemanarioUsuario
export const updateSemanarioUsuarioSchema = z.object({
    fechaDesde: FechaIsoSchema.optional(),
    elecciones: z.record(
        DiaDeLaSemanaSchema,
        z.record(FirestoreIdSchema, FirestoreIdSchema)
    ).optional(),
    recordatorioCambio: z.object({
        fechaNotificacion: FechaIsoSchema,
        mensaje: z.string().max(500),
        visto: z.boolean(),
    }).strict().nullable().optional(),
}).strict();

// Legacy alias
export const SemanarioSchema = SemanarioUsuarioSchema;

// Type exports
export type SemanarioUsuario = z.infer<typeof SemanarioUsuarioSchema>;
export type CreateSemanarioUsuario = z.infer<typeof createSemanarioUsuarioSchema>;
export type UpdateSemanarioUsuario = z.infer<typeof updateSemanarioUsuarioSchema>;
