import { z } from 'zod';
import { FirestoreIdSchema, slugCompuestoIdSchema, slugIdSchema, TimestampSchema } from './common';
import {FechaHoraIsoSchema, FechaIsoSchema } from './fechas';

// ============================================
// ExcepcionUsuario
// ============================================

const AutorizacionExcepcionSchema = z.object({
    motivo: z.string().min(1).max(500),
    estadoAprobacion: z.enum([
        'no_requiere_aprobacion', 'pendiente_aprobacion',
        'aprobado', 'rechazado',
    ]),
    autorizadoPor: FirestoreIdSchema.optional(),
    fechaHoraAutorizacion: FechaHoraIsoSchema,
    alternativaRespaldoId: slugIdSchema.nullable().optional(),
}).strict();

const ExcepcionUsuarioBaseSchema = z.object({
    residenciaId: slugIdSchema,
    fecha: FechaIsoSchema,
    tiempoComidaId: slugIdSchema,
    alternativaId: slugIdSchema,   // ConfigAlternativaId
    origen: z.enum(['residente', 'director', 'asistente', 'wizard_invitados']),
    autorizacion: AutorizacionExcepcionSchema.optional(),
}).strict();

/**
 * ExcepcionUsuario: Representa la voluntad del usuario de desviarse de su Semanario.
 * Corresponde al Nivel 3 de la Cascada de la Verdad.
 * 
 * Ruta: usuarios/{uid}/excepciones/{fecha-slugtiempocomida}
 */
export const ExcepcionUsuarioSchema = ExcepcionUsuarioBaseSchema.extend({
    id: slugCompuestoIdSchema.optional(),
    timestampCreacion: TimestampSchema,
});

// Schema para CREATE ExcepcionUsuario
export const createExcepcionUsuarioSchema = ExcepcionUsuarioBaseSchema.extend({
    timestampCreacion: TimestampSchema.optional(),
});

// Schema para UPDATE ExcepcionUsuario
export const updateExcepcionUsuarioSchema = ExcepcionUsuarioBaseSchema.partial();

// Legacy alias
export const ExcepcionSchema = ExcepcionUsuarioSchema;

// Type exports
export type ExcepcionUsuario = z.infer<typeof ExcepcionUsuarioSchema>;
export type CreateExcepcionUsuario = z.infer<typeof createExcepcionUsuarioSchema>;
export type UpdateExcepcionUsuario = z.infer<typeof updateExcepcionUsuarioSchema>;
