import { z } from 'zod';
import { FirestoreIdSchema, slugIdSchema, CadenaOpcionalLimitada } from './common';
import { FechaIsoSchema, FechaHoraIsoSchema, TimestampStringSchema, ColorHTMLSchema } from './fechas';

// ============================================
// Enums compartidos
// ============================================

export const EstadoAvisoAdministracionSchema = z.enum([
    'no_comunicado', 'comunicacion_preliminar',
    'comunicacion_final', 'evento_cancelado',
]);

// ============================================
// Comentario
// ============================================

const ComentarioBaseSchema = z.object({
    residenciaId: slugIdSchema,
    autorId: FirestoreIdSchema,
    texto: CadenaOpcionalLimitada(1, 500),
    categoria: z.enum(['comida', 'ropa', 'limpieza', 'mantenimiento', 'otros']),
    fecha: FechaIsoSchema,
    estado: z.enum(['nuevo', 'diferido', 'atendido', 'no_aprobado', 'archivado']),
    fechaDiferido: FechaIsoSchema.optional(),
    avisoAdministracion: EstadoAvisoAdministracionSchema,
}).strict();

export const ComentarioSchema = ComentarioBaseSchema.extend({
    id: FirestoreIdSchema,
    timestampCreacion: TimestampStringSchema,
});

export const ComentarioCreateSchema = ComentarioBaseSchema;
export const ComentarioUpdateSchema = ComentarioBaseSchema.partial();

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
    usuarioIniciadorId: FirestoreIdSchema,
    fecha: FechaIsoSchema,
    duracion: z.number().int().positive(),
    recurrencia: RecurrenciaRecordatorioSchema.optional(),
    titulo: z.string().min(1).max(100),
    descripcion: CadenaOpcionalLimitada(1, 500).optional(),
    color: ColorHTMLSchema,
}).strict();

export const RecordatorioSchema = RecordatorioBaseSchema.extend({
    id: FirestoreIdSchema,
    timestampCreacion: TimestampStringSchema,
});

export const RecordatorioCreateSchema = RecordatorioBaseSchema;
export const RecordatorioUpdateSchema = RecordatorioBaseSchema.partial();

// ============================================
// Atencion
// ============================================

const AtencionBaseSchema = z.object({
    residenciaId: slugIdSchema,
    usuarioId: FirestoreIdSchema,
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
    timestampCreacion: TimestampStringSchema,
});

export const AtencionCreateSchema = AtencionBaseSchema;
export const AtencionUpdateSchema = AtencionBaseSchema.partial();

// ============================================
// AlteracionHorario
// ============================================

const DetalleAlteracionSchema = z.object({
    tiempoComida: z.any(), // TiempoComida (referencia al objeto completo)
    alternativas: z.array(slugIdSchema), // ConfigAlternativaId[]
}).strict();

const AlteracionHorarioBaseObject = z.object({
    nombre: z.string().min(1).max(100),
    residenciaId: slugIdSchema,
    descripcion: CadenaOpcionalLimitada(1, 500).optional(),
    fechaInicio: FechaIsoSchema,
    fechaFin: FechaIsoSchema,
    alteraciones: z.record(slugIdSchema, DetalleAlteracionSchema),
    estado: z.enum(['propuesta', 'aprobada', 'cancelada']),
    avisoAdministracion: EstadoAvisoAdministracionSchema,
});

const AlteracionHorarioBaseSchema = AlteracionHorarioBaseObject
    .strict().refine(data => data.fechaFin >= data.fechaInicio, {
        message: "La fecha de fin no puede ser anterior a la fecha de inicio",
        path: ["fechaFin"],
    });

export const AlteracionHorarioSchema = AlteracionHorarioBaseObject
    .extend({ id: FirestoreIdSchema })
    .strict().refine(data => data.fechaFin >= data.fechaInicio, {
        message: "La fecha de fin no puede ser anterior a la fecha de inicio",
        path: ["fechaFin"],
    });


export const AlteracionHorarioCreateSchema = AlteracionHorarioBaseSchema;
export const AlteracionHorarioUpdateSchema = AlteracionHorarioBaseObject.partial();

// Type exports
export type Comentario = z.infer<typeof ComentarioSchema>;
export type ComentarioCreate = z.infer<typeof ComentarioCreateSchema>;
export type ComentarioUpdate = z.infer<typeof ComentarioUpdateSchema>;

export type Falta = z.infer<typeof FaltaSchema>;
export type FaltaCreate = z.infer<typeof FaltaCreateSchema>;
export type FaltaUpdate = z.infer<typeof FaltaUpdateSchema>;

export type Recordatorio = z.infer<typeof RecordatorioSchema>;
export type RecordatorioCreate = z.infer<typeof RecordatorioCreateSchema>;
export type RecordatorioUpdate = z.infer<typeof RecordatorioUpdateSchema>;

export type Atencion = z.infer<typeof AtencionSchema>;
export type AtencionCreate = z.infer<typeof AtencionCreateSchema>;
export type AtencionUpdate = z.infer<typeof AtencionUpdateSchema>;

export type AlteracionHorario = z.infer<typeof AlteracionHorarioSchema>;
export type AlteracionHorarioCreate = z.infer<typeof AlteracionHorarioCreateSchema>;
export type AlteracionHorarioUpdate = z.infer<typeof AlteracionHorarioUpdateSchema>;

