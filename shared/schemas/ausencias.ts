import { z } from 'zod';
import {
    SlugIdSchema,
    CadenaOpcionalLimitada,
    TimestampSchema,
    AuthIdSchema
} from './common';
import { FechaIsoSchema } from './fechas';

// ============================================
// Ausencia
// ============================================

const AusenciaBaseObject = z.object({
    usuarioId: AuthIdSchema,
    residenciaId: SlugIdSchema,
    fechaInicio: FechaIsoSchema,
    primerTiempoAusente: SlugIdSchema.nullable().optional(), // TiempoComidaId
    fechaFin: FechaIsoSchema,
    ultimoTiempoAusente: SlugIdSchema.nullable().optional(), // TiempoComidaId
    retornoPendienteConfirmacion: z.boolean().optional(),
    motivo: CadenaOpcionalLimitada(3, 100).optional(),
})

const AusenciaBaseSchema = AusenciaBaseObject
    .strict().refine(data => data.fechaFin >= data.fechaInicio, {
        message: "La fecha de fin no puede ser anterior a la fecha de inicio",
        path: ["fechaFin"],
    });

/**
 * Ausencia: Negación de servicio declarada por el usuario.
 * Corresponde al Nivel 2 de la Cascada de la Verdad.
 *
 * Ruta: usuarios/{uid}/ausencias/{fechaInicio}
 */
export const AusenciaSchema = AusenciaBaseObject
    .extend({
        id: FechaIsoSchema.optional(),
        timestampCreacion: TimestampSchema,
    })
    .strict().refine(data => data.fechaFin >= data.fechaInicio, {
        message: "La fecha de fin no puede ser anterior a la fecha de inicio",
        path: ["fechaFin"],
    });

// Schema para CREATE Ausencia
export const createAusenciaSchema = AusenciaBaseSchema;

// Schema para UPDATE Ausencia
export const updateAusenciaSchema = AusenciaBaseObject.partial();


// Type exports
export type Ausencia = z.infer<typeof AusenciaSchema>;
export type CreateAusencia = z.infer<typeof createAusenciaSchema>;
export type UpdateAusencia = z.infer<typeof updateAusenciaSchema>;