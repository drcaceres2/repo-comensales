import { z } from 'zod';
import { FirestoreIdSchema, CadenaOpcionalLimitada } from './common';
import { FechaIsoSchema, TimestampStringSchema } from './fechas';

// ============================================
// ExcepcionUsuario
// ============================================

/**
 * ExcepcionUsuario: Representa la voluntad del usuario de desviarse de su Semanario.
 * Corresponde al Nivel 3 de la Cascada de la Verdad.
 * 
 * Ruta: usuarios/{uid}/excepciones/{fecha-slugtiempocomida}
 */

const AutorizacionExcepcionSchema = z.object({
    motivo: z.string().min(1).max(500),
    estadoAprobacion: z.enum([
        'no_requiere_aprobacion', 'pendiente_aprobacion',
        'aprobado', 'rechazado',
    ]),
    autorizadoPor: FirestoreIdSchema.optional(),
    timestampAutorizacion: TimestampStringSchema,
    alternativaRespaldoId: FirestoreIdSchema.nullable().optional(),
}).strict();

export const ExcepcionUsuarioSchema = z.object({
    id: FirestoreIdSchema.optional(),
    residenciaId: FirestoreIdSchema,
    fecha: FechaIsoSchema,
    tiempoComidaId: FirestoreIdSchema,
    alternativaId: FirestoreIdSchema,   // ConfigAlternativaId
    origen: z.enum(['residente', 'director', 'asistente', 'wizard_invitados']),
    timestampCreacion: TimestampStringSchema,

    // Solo para excepciones que requieren aprobación
    autorizacion: AutorizacionExcepcionSchema.optional(),
}).strict();

// Schema para CREATE ExcepcionUsuario
export const createExcepcionUsuarioSchema = ExcepcionUsuarioSchema.omit({
    id: true,
    timestampCreacion: true,
}).extend({
    timestampCreacion: TimestampStringSchema.optional(),
});

// Legacy alias
export const ExcepcionSchema = ExcepcionUsuarioSchema;

// Type exports
export type ExcepcionUsuario = z.infer<typeof ExcepcionUsuarioSchema>;
export type CreateExcepcionUsuario = z.infer<typeof createExcepcionUsuarioSchema>;
