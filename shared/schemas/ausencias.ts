import { z } from 'zod';
import { FirestoreIdSchema, CadenaOpcionalLimitada } from './common';
import { FechaIsoSchema, TimestampStringSchema } from './fechas';

// ============================================
// Ausencia
// ============================================

/**
 * Ausencia: Negación de servicio declarada por el usuario.
 * Corresponde al Nivel 2 de la Cascada de la Verdad.
 * 
 * Ruta: usuarios/{uid}/ausencias/{fechaInicio}
 */
export const AusenciaSchema = z.object({
    id: FirestoreIdSchema.optional(),
    usuarioId: FirestoreIdSchema,
    residenciaId: FirestoreIdSchema,
    fechaInicio: FechaIsoSchema,
    primerTiempoAusente: FirestoreIdSchema.nullable().optional(), // TiempoComidaId
    fechaFin: FechaIsoSchema,
    ultimoTiempoAusente: FirestoreIdSchema.nullable().optional(), // TiempoComidaId
    retornoPendienteConfirmacion: z.boolean().optional(),
    timestampCreacion: TimestampStringSchema,
    motivo: CadenaOpcionalLimitada(3, 100).optional(),
}).strict().refine(data => data.fechaFin >= data.fechaInicio, {
    message: "La fecha de fin no puede ser anterior a la fecha de inicio",
    path: ["fechaFin"],
});

// Schema para CREATE Ausencia
export const createAusenciaSchema = z.object({
    usuarioId: FirestoreIdSchema,
    residenciaId: FirestoreIdSchema,
    fechaInicio: FechaIsoSchema,
    primerTiempoAusente: FirestoreIdSchema.nullable().optional(),
    fechaFin: FechaIsoSchema,
    ultimoTiempoAusente: FirestoreIdSchema.nullable().optional(),
    retornoPendienteConfirmacion: z.boolean().optional(),
    motivo: CadenaOpcionalLimitada(3, 100).optional(),
}).strict().refine(data => data.fechaFin >= data.fechaInicio, {
    message: "La fecha de fin no puede ser anterior a la fecha de inicio",
    path: ["fechaFin"],
});

// Type exports
export type Ausencia = z.infer<typeof AusenciaSchema>;
export type CreateAusencia = z.infer<typeof createAusenciaSchema>;