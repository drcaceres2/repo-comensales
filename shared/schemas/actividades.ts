import { z } from 'zod';
import { FirestoreIdSchema, CadenaOpcionalLimitada } from './common';
import { FechaIsoSchema, HoraIsoSchema, TimestampStringSchema } from './fechas';

// ============================================
// Enums
// ============================================

const EstadoActividadEnum = z.enum([
    'borrador', 'inscripcion_abierta', 'inscripcion_cerrada',
    'solicitada_administracion', 'cancelada',
]);

const EstadoAvisoAdministracionEnum = z.enum([
    'no_comunicado', 'comunicacion_preliminar',
    'comunicacion_final', 'evento_cancelado',
]);

const TipoSolicitudComidasActividadEnum = z.enum([
    'ninguna', 'solicitud_unica', 'solicitud_diaria',
    'solicitud_inicial_mas_confirmacion_diaria',
]);

const EstadoInscripcionActividadEnum = z.enum([
    'invitado_pendiente', 'invitado_rechazado', 'invitado_aceptado',
    'inscrito_directo',
    'cancelado_usuario', 'cancelado_admin',
]);

// ============================================
// Sub-schemas
// ============================================

/**
 * ModoAcceso: Define la política de acceso a una actividad.
 */
export const ModoAccesoSchema = z.object({
    accesoUsuario: z.enum(['abierto', 'por_invitacion']),
    puedeInvitar: z.boolean(),
}).strict();

/**
 * DetalleActividad: Una comida planificada dentro de una actividad.
 */
export const DetalleActividadSchema = z.object({
    id: FirestoreIdSchema,
    fechaComida: FechaIsoSchema,
    grupoComida: z.number().int().nonnegative(),
    nombreTiempoComida: z.string().min(1).max(100),
    horaEstimada: HoraIsoSchema.optional(),
}).strict();

// ============================================
// Actividad
// ============================================

/**
 * Actividad: Evento que sobrescribe la rutina de comida.
 * Nivel 1 (Máxima Prioridad) de la Cascada de la Verdad.
 * 
 * Ruta: residencias/{slug}/actividades/{auto-id}
 */
const ActividadBaseSchema = z.object({
    // Campos generales
    id: FirestoreIdSchema,
    residenciaId: FirestoreIdSchema,
    organizadorId: FirestoreIdSchema,
    nombre: z.string().trim().min(1, 'El nombre es obligatorio').max(25, 'El nombre no puede exceder los 25 caracteres'),
    descripcion: z.string().trim().max(255, 'La descripción no puede exceder los 255 caracteres').optional(),
    estado: EstadoActividadEnum,
    avisoAdministracion: EstadoAvisoAdministracionEnum,
    tipoSolicitudComidas: TipoSolicitudComidasActividadEnum,

    // Campos de cálculo de comidas
    fechaInicio: FechaIsoSchema,
    fechaFin: FechaIsoSchema,
    tiempoComidaInicial: FirestoreIdSchema,
    tiempoComidaFinal: FirestoreIdSchema,
    planComidas: z.array(DetalleActividadSchema),
    comedorActividad: FirestoreIdSchema.nullable().optional(),
    modoAtencionActividad: z.enum(['residencia', 'externa']),
    diasAntelacionSolicitudAdministracion: z.number().int().nonnegative(),

    // Campos de lógica de inscripción
    maxParticipantes: z.number().int().min(2, 'El máximo de participantes debe ser al menos 2').optional(),
    comensalesNoUsuarios: z.number().int().nonnegative(),
    requiereInscripcion: z.boolean(),
    fechaLimiteInscripcion: FechaIsoSchema.optional(),
    modoAccesoResidentes: ModoAccesoSchema.optional(),
    modoAccesoInvitados: ModoAccesoSchema.optional(),

    // Campos de costo
    centroCostoId: FirestoreIdSchema.nullable().optional(),
}).strict();

// --- Create Schema ---

export const ActividadCreateSchema = ActividadBaseSchema.omit({
    id: true,
    residenciaId: true,
    organizadorId: true,
    estado: true,
    avisoAdministracion: true,
    comensalesNoUsuarios: true,
}).extend({
    estado: EstadoActividadEnum.default('borrador'),
    avisoAdministracion: EstadoAvisoAdministracionEnum.default('no_comunicado'),
    comensalesNoUsuarios: z.number().int().nonnegative().default(0),
}).refine(data => data.fechaFin >= data.fechaInicio, {
    message: "La fecha de finalización no puede ser anterior a la fecha de inicio",
    path: ["fechaFin"],
}).superRefine((data, ctx) => {
    if (data.requiereInscripcion && !data.modoAccesoResidentes) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['modoAccesoResidentes'],
            message: 'El modo de acceso para residentes es obligatorio si se requiere inscripción.',
        });
    }
}).superRefine((data, ctx) => {
    if (data.modoAtencionActividad === 'residencia' && !data.comedorActividad) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['comedorActividad'],
            message: 'El comedor es obligatorio cuando el modo de atención es "residencia".',
        });
    }
});

// --- Update Schema ---

export const ActividadUpdateSchema = ActividadBaseSchema.omit({
    id: true,
    residenciaId: true,
    organizadorId: true,
}).partial().refine(data => {
    if (data.fechaInicio && data.fechaFin) {
        return data.fechaFin >= data.fechaInicio;
    }
    return true;
}, {
    message: "La fecha de finalización no puede ser anterior a la fecha de inicio",
    path: ["fechaFin"],
}).superRefine((data, ctx) => {
    if (data.requiereInscripcion === true && !data.modoAccesoResidentes) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['modoAccesoResidentes'],
            message: 'El modo de acceso para residentes es obligatorio si se requiere inscripción.',
        });
    }
}).superRefine((data, ctx) => {
    if (data.modoAtencionActividad === 'residencia' && !data.comedorActividad) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['comedorActividad'],
            message: 'El comedor es obligatorio cuando el modo de atención es "residencia".',
        });
    }
});

export const ActividadEstadoUpdateSchema = z.object({
    estado: EstadoActividadEnum,
});

export const ActividadSchema = ActividadBaseSchema;

// ============================================
// InscripcionActividad
// ============================================

/**
 * InscripcionActividad: Registro de inscripción de un usuario a una actividad.
 * Ruta: residencias/{slug}/actividades/{auto-id}/inscripciones/{uid}
 */
export const InscripcionActividadSchema = z.object({
    id: FirestoreIdSchema,
    residenciaId: FirestoreIdSchema,
    actividadId: FirestoreIdSchema,
    usuarioInscritoId: FirestoreIdSchema,
    invitadoPorUsuarioId: FirestoreIdSchema.optional(),

    fechaInvitacion: FechaIsoSchema.nullable(),
    estadoInscripcion: EstadoInscripcionActividadEnum,

    timestampCreacion: TimestampStringSchema,
    timestampModificacion: TimestampStringSchema,
}).strict();

export const InscripcionActividadCreateSchema = InscripcionActividadSchema.omit({
    id: true,
    timestampCreacion: true,
    timestampModificacion: true,
}).extend({
    timestampCreacion: TimestampStringSchema.optional(),
    timestampModificacion: TimestampStringSchema.optional(),
});

export const InscripcionActividadUpdateSchema = InscripcionActividadSchema.omit({
    id: true,
    actividadId: true,
    usuarioInscritoId: true,
    residenciaId: true,
}).partial();

// Type exports
export type Actividad = z.infer<typeof ActividadBaseSchema>;
export type ActividadCreate = z.infer<typeof ActividadCreateSchema>;
export type ActividadUpdate = z.infer<typeof ActividadUpdateSchema>;
export type InscripcionActividad = z.infer<typeof InscripcionActividadSchema>;
export type ModoAcceso = z.infer<typeof ModoAccesoSchema>;
export type DetalleActividad = z.infer<typeof DetalleActividadSchema>;