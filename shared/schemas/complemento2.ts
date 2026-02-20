import { z } from 'zod';
import { FirestoreIdSchema, CadenaOpcionalLimitada } from './common';
import { FechaIsoSchema, FechaHoraIsoSchema, TimestampStringSchema, DiaDeLaSemanaSchema, ColorHTMLSchema } from './fechas';

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

/**
 * Comentario: Notas de los usuarios para que el director las observe
 * al hacer la solicitud formal de comidas.
 * 
 * Ruta: residencias/{slug}/comentarios/{auto-id}
 */
export const ComentarioSchema = z.object({
    id: FirestoreIdSchema,
    residenciaId: FirestoreIdSchema,
    autorId: FirestoreIdSchema,
    timestampCreacion: TimestampStringSchema,

    texto: CadenaOpcionalLimitada(1, 500),
    categoria: z.enum(['comida', 'ropa', 'limpieza', 'mantenimiento', 'otros']),
    fecha: FechaIsoSchema,

    // Estado de gestión del Director
    estado: z.enum(['nuevo', 'diferido', 'atendido', 'no_aprobado', 'archivado']),
    fechaDiferido: FechaIsoSchema.optional(),
    avisoAdministracion: EstadoAvisoAdministracionSchema,
}).strict();

// ============================================
// Falta
// ============================================

/**
 * Falta: Bitácora de comportamientos contra el reglamento.
 * 
 * Ruta: usuarios/{uid}/faltas/{auto-id}
 */
export const FaltaSchema = z.object({
    id: FirestoreIdSchema,
    fecha: FechaIsoSchema,
    residencia: FirestoreIdSchema,
    usuario: FirestoreIdSchema,
    titulo: CadenaOpcionalLimitada(1, 100),
    descripcion: CadenaOpcionalLimitada(1, 500).optional(),
    notificada: z.boolean(),
    confirmada: z.boolean(),
    origen: z.string(),
}).strict();

// ============================================
// Recordatorio
// ============================================

const RecurrenciaRecordatorioSchema = z.object({
    fechaFin: FechaIsoSchema,
    periodicidad: z.enum(['semanal', 'quincenal', 'mensual-diasemana', 'mensual-diames', 'anual']),
}).strict();

/**
 * Recordatorio: Overlay visual en el calendario del director.
 * 
 * Ruta: residencias/{slug}/recordatorios/{auto-id}
 */
export const RecordatorioSchema = z.object({
    id: FirestoreIdSchema,
    residenciaId: FirestoreIdSchema,
    usuarioIniciadorId: FirestoreIdSchema,

    fecha: FechaIsoSchema,
    duracion: z.number().int().positive(),
    recurrencia: RecurrenciaRecordatorioSchema.optional(),

    titulo: z.string().min(1).max(100),
    descripcion: CadenaOpcionalLimitada(1, 500).optional(),
    color: ColorHTMLSchema,

    timestampCreacion: TimestampStringSchema,
}).strict();

// ============================================
// Atencion
// ============================================

/**
 * Atencion: Solicitudes extra a la administración (aperitivos, coffee-break, flores, etc.)
 * 
 * Ruta: residencias/{slug}/atenciones/{auto-id}
 */
export const AtencionSchema = z.object({
    id: FirestoreIdSchema,
    residenciaId: FirestoreIdSchema,
    usuarioId: FirestoreIdSchema,
    nombre: z.string().min(1).max(100),
    comentarios: CadenaOpcionalLimitada(1, 500).optional(),
    timestampCreacion: TimestampStringSchema,
    horarioSolicitudComidaId: FirestoreIdSchema,
    fechaSolicitudComida: FechaIsoSchema,
    fechaHoraAtencion: FechaHoraIsoSchema,
    estado: z.enum(['pendiente', 'aprobada', 'cancelada']),
    avisoAdministracion: z.enum([
        'no_comunicado', 'comunicacion_preliminar',
        'comunicacion_final', 'atencion_cancelada',
    ]),
    centroCostoId: FirestoreIdSchema.optional(),
}).strict();

// ============================================
// AlteracionHorario
// ============================================

const DetalleAlteracionSchema = z.object({
    tiempoComida: z.any(), // TiempoComida (referencia al objeto completo)
    alternativas: z.array(FirestoreIdSchema), // ConfigAlternativaId[]
}).strict();

/**
 * AlteracionHorario: Alteración temporal de los horarios disponibles.
 * 
 * Ruta: residencias/{slug}/alteraciones/{auto-id}
 */
export const AlteracionHorarioSchema = z.object({
    id: FirestoreIdSchema,
    nombre: z.string().min(1).max(100),
    residenciaId: FirestoreIdSchema,
    descripcion: CadenaOpcionalLimitada(1, 500).optional(),
    fechaInicio: FechaIsoSchema,
    fechaFin: FechaIsoSchema,
    alteraciones: z.record(FirestoreIdSchema, DetalleAlteracionSchema),
    estado: z.enum(['propuesta', 'aprobada', 'cancelada']),
    avisoAdministracion: EstadoAvisoAdministracionSchema,
}).strict().refine(data => data.fechaFin >= data.fechaInicio, {
    message: "La fecha de fin no puede ser anterior a la fecha de inicio",
    path: ["fechaFin"],
});

// Type exports
export type Comentario = z.infer<typeof ComentarioSchema>;
export type Falta = z.infer<typeof FaltaSchema>;
export type Recordatorio = z.infer<typeof RecordatorioSchema>;
export type Atencion = z.infer<typeof AtencionSchema>;
export type AlteracionHorario = z.infer<typeof AlteracionHorarioSchema>;
