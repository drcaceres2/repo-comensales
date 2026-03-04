import { z } from 'zod';
import { FirestoreIdSchema, slugIdSchema, CadenaOpcionalLimitada, TimestampSchema, ColorHTMLSchema } from './common';
import { FechaIsoSchema, FechaHoraIsoSchema } from './fechas';

// ============================================
// Enums compartidos
// ============================================

export const EstadoAvisoAdministracionSchema = z.enum([
    'no_comunicado', 'comunicacion_preliminar',
    'comunicacion_final', 'evento_cancelado',
]);

// ============================================
// Falta
// ============================================

const FaltaBaseSchema = z.object({
    fecha: FechaIsoSchema,
    residencia: slugIdSchema,
    usuario: FirestoreIdSchema,
    titulo: CadenaOpcionalLimitada(1, 100),
    descripcion: CadenaOpcionalLimitada(1, 500).optional(),
    notificada: z.boolean(),
    confirmada: z.boolean(),
    origen: z.string(),
}).strict();

export const FaltaSchema = FaltaBaseSchema.extend({
    id: FirestoreIdSchema,
});

export const FaltaCreateSchema = FaltaBaseSchema;
export const FaltaUpdateSchema = FaltaBaseSchema.partial();

// ============================================
// Recordatorio
// ============================================

const RecurrenciaRecordatorioSchema = z.object({
    fechaFin: FechaIsoSchema,
    periodicidad: z.enum(['semanal', 'quincenal', 'mensual-diasemana', 'mensual-diames', 'anual']),
}).strict();

const RecordatorioBaseSchema = z.object({
    residenciaId: slugIdSchema,
    autorId: FirestoreIdSchema,
    fecha: FechaIsoSchema,
    duracion: z.number().int().positive(),
    recurrencia: RecurrenciaRecordatorioSchema.optional(),
    titulo: z.string().min(1).max(100),
    descripcion: CadenaOpcionalLimitada(1, 500).optional(),
    color: ColorHTMLSchema,
}).strict();

export const RecordatorioSchema = RecordatorioBaseSchema.extend({
    id: FirestoreIdSchema,
    timestampCreacion: TimestampSchema,
});

export const RecordatorioCreateSchema = RecordatorioBaseSchema;
export const RecordatorioUpdateSchema = RecordatorioBaseSchema.partial();

// ============================================
// Atencion
// ============================================

const AtencionBaseSchema = z.object({
    residenciaId: slugIdSchema,
    autorId: FirestoreIdSchema,
    nombre: z.string().min(1).max(100),
    comentarios: CadenaOpcionalLimitada(1, 500).optional(),
    horarioSolicitudComidaId: slugIdSchema,
    fechaSolicitudComida: FechaIsoSchema,
    fechaHoraAtencion: FechaHoraIsoSchema,
    estado: z.enum(['pendiente', 'aprobada', 'cancelada']),
    avisoAdministracion: z.enum([
        'no_comunicado', 'comunicacion_preliminar',
        'comunicacion_final', 'atencion_cancelada',
    ]),
    centroCostoId: slugIdSchema.optional(),
}).strict();

export const AtencionSchema = AtencionBaseSchema.extend({
    id: FirestoreIdSchema,
    timestampCreacion: TimestampSchema,
});

export const AtencionCreateSchema = AtencionBaseSchema;
export const AtencionUpdateSchema = AtencionBaseSchema.partial();

// Type exports
export type Falta = z.infer<typeof FaltaSchema>;
export type FaltaCreate = z.infer<typeof FaltaCreateSchema>;
export type FaltaUpdate = z.infer<typeof FaltaUpdateSchema>;

export type Recordatorio = z.infer<typeof RecordatorioSchema>;
export type RecordatorioCreate = z.infer<typeof RecordatorioCreateSchema>;
export type RecordatorioUpdate = z.infer<typeof RecordatorioUpdateSchema>;

export type Atencion = z.infer<typeof AtencionSchema>;
export type AtencionCreate = z.infer<typeof AtencionCreateSchema>;
export type AtencionUpdate = z.infer<typeof AtencionUpdateSchema>;

