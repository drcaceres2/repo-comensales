import { z } from 'zod';
import { FirestoreIdSchema, slugIdSchema, TimestampSchema } from './common';
import { FechaIsoSchema, HoraIsoSchema} from './fechas';

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

/**
 * TipoSolicitudComidasActividad
 * Aquí se define el modo en como se debe solicitar la actividad 
 * a la administración.
 * 
 * 1. Ninguna: 
 *      No se solicita a la administración. Por ejemplo si la comida 
 *      no la prepara la administración. Igualmente sirve en la aplicación
 *      porque los inscritos dejarán de verse reflejados en los comensales
 *      normales.
 * 2. Solicitud unica: Es la forma ordinaria de solicitar una actividad.
 *      Se solicita a la administración con la antelación debida.
 * 3. Diario: Por la longitud de la actividad, se pide a la administración
 *      cada día en el horario normal. Por ejemplo una convivencia larga con gente
 *      de afuera, un retiro de gente externa que vienen y van, etc.
 * 4. Solicitud inicial mas confirmacion diaria: 
 *      Se solicita una vez con antelación y se confirma diariamente.
 */
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
    residenciaId: slugIdSchema,
    organizadorId: FirestoreIdSchema,
    nombre: z.string().trim().min(1, 'El nombre es obligatorio').max(25, 'El nombre no puede exceder los 25 caracteres'),
    descripcion: z.string().trim().max(255, 'La descripción no puede exceder los 255 caracteres').optional(),
    estado: EstadoActividadEnum,
    avisoAdministracion: EstadoAvisoAdministracionEnum.default('no_comunicado'),
    tipoSolicitudComidas: TipoSolicitudComidasActividadEnum.default('solicitud_unica'),

    // Campos de cálculo de comidas
    fechaInicio: FechaIsoSchema,
    fechaFin: FechaIsoSchema,
    tiempoComidaInicial: slugIdSchema,
    tiempoComidaFinal: slugIdSchema,
    planComidas: z.array(DetalleActividadSchema),
    comedorActividad: slugIdSchema.nullable().optional(),
    modoAtencionActividad: z.enum(['residencia', 'externa']),
    diasAntelacionSolicitudAdministracion: z.number().int().nonnegative(),

    // Campos de lógica de inscripción
    maxParticipantes: z.number().int().min(2, 'El máximo de participantes debe ser al menos 2').optional(),
    comensalesNoUsuarios: z.number().int().nonnegative(),
    requiereInscripcion: z.boolean().default(true),
    fechaLimiteInscripcion: FechaIsoSchema.optional(),
    modoAccesoResidentes: ModoAccesoSchema.optional(),
    modoAccesoInvitados: ModoAccesoSchema.optional(),

    // Campos de costo
    centroCostoId: slugIdSchema.nullable().optional(),
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
    residenciaId: slugIdSchema,
    actividadId: FirestoreIdSchema,
    usuarioInscritoId: FirestoreIdSchema,
    invitadoPorUsuarioId: FirestoreIdSchema.optional(),

    fechaInvitacion: FechaIsoSchema.nullable(),
    estadoInscripcion: EstadoInscripcionActividadEnum,

    timestampCreacion: TimestampSchema,
    timestampModificacion: TimestampSchema,
}).strict();

export const InscripcionActividadCreateSchema = InscripcionActividadSchema.omit({
    id: true,
    timestampCreacion: true,
    timestampModificacion: true,
}).extend({
    timestampCreacion: TimestampSchema.optional(),
    timestampModificacion: TimestampSchema.optional(),
});

export const InscripcionActividadUpdateSchema = InscripcionActividadSchema.omit({
    id: true,
    actividadId: true,
    usuarioInscritoId: true,
    residenciaId: true,
}).partial();

// Type exports

/**
 * Actividad: Evento que sobrescribe la rutina de comida.
 * Corresponde al Nivel 1 (Máxima Prioridad) de la Cascada de la Verdad.
 */
export type Actividad = z.infer<typeof ActividadBaseSchema>;
export type ActividadCreate = z.infer<typeof ActividadCreateSchema>;
export type ActividadUpdate = z.infer<typeof ActividadUpdateSchema>;
export type InscripcionActividad = z.infer<typeof InscripcionActividadSchema>;

/** 
 * ModoAcceso
 * Abierta quiere decir que se inscribe voluntariamente quien lo desee. 
 * Por invitación, como lo dice el texto. 
 * Opción única quiere decir que no habrá otra opción para los residentes (los tiempos de comida omitidos no estarán disponibles en la residencia).
 */
export type ModoAcceso = z.infer<typeof ModoAccesoSchema>;
export type DetalleActividad = z.infer<typeof DetalleActividadSchema>;

export type EstadoActividad = z.infer<typeof EstadoActividadEnum>;