import { z } from 'zod';
import { AuthIdSchema, FirestoreIdSchema, TimestampSchema } from './common';
import { FechaIsoSchema } from './fechas';

// ============================================
// Enums y Taxonomia
// ============================================

export const EstadoActividadEnum = z.enum([
    'pendiente',
    'aprobada',
    'inscripcion_abierta',
    'inscripcion_cerrada',
    'finalizada',
    'cancelada',
]);

export const VisibilidadActividadEnum = z.enum([
    'publica',
    'oculta',
]);

export const TipoAccesoActividadEnum = z.enum([
    'abierta',
    'solo_invitacion',
]);

export const TipoSolicitudAdministracionEnum = z.enum([
    'ninguna',
    'solicitud_unica',
    'diario',
]);

export const EstadoInscripcionEnum = z.enum([
    'invitacion_pendiente',
    'confirmada',
    'rechazada',
    'cancelada_por_usuario',
    'cancelada_por_organizador',
]);

// Aliases de compatibilidad temporal para imports legacy.
export const EstadoInscripcionActividadEnum = EstadoInscripcionEnum;
export const TipoSolicitudComidasActividadEnum = TipoSolicitudAdministracionEnum;

// ============================================
// Sub-Esquemas Core
// ============================================

export const FronterasActividadSchema = z.object({
    fechaInicio: FechaIsoSchema,
    tiempoComidaInicioId: z.string(),
    fechaFin: FechaIsoSchema,
    tiempoComidaFinId: z.string(),
});

// ============================================
// Esquemas Principales
// ============================================

export const ActividadBaseSchema = z.object({
    id: FirestoreIdSchema,
    residenciaId: FirestoreIdSchema,

    // Metadatos y UI
    titulo: z.string().min(3),
    descripcion: z.string().optional(),
    lugar: z.string().optional(),
    organizadorId: AuthIdSchema,

    // Taxonomia y estado
    estado: EstadoActividadEnum,
    visibilidad: VisibilidadActividadEnum,
    tipoAcceso: TipoAccesoActividadEnum,
    permiteInvitadosExternos: z.boolean(),

    // Contable
    centroCostoId: FirestoreIdSchema,
    solicitudAdministracion: TipoSolicitudAdministracionEnum,

    // Cupos y raciones
    maxParticipantes: z.number().int().positive(),
    conteoInscritos: z.number().int().nonnegative().default(0),
    adicionalesNoNominales: z.number().int().nonnegative().default(0),

    // Trazabilidad
    timestampCreacion: TimestampSchema,
    timestampModificacion: TimestampSchema,
}).merge(FronterasActividadSchema);

export const ActividadCreateSchema = ActividadBaseSchema.omit({
    id: true,
    conteoInscritos: true,
    timestampCreacion: true,
    timestampModificacion: true,
}).extend({
    timestampCreacion: TimestampSchema.optional(),
    timestampModificacion: TimestampSchema.optional(),
});

export const ActividadUpdateSchema = ActividadBaseSchema.omit({
    id: true,
    residenciaId: true,
}).partial();

export const ActividadEstadoUpdateSchema = z.object({
    estado: EstadoActividadEnum,
});

export const ActividadSchema = ActividadBaseSchema;

// ============================================
// Esquema de Inscripciones (Subcoleccion)
// ============================================

export const InscripcionActividadSchema = z.object({
    id: z.string(),
    actividadId: FirestoreIdSchema,
    usuarioId: z.string(),
    invitadoPorId: z.string().optional(),
    estado: EstadoInscripcionEnum,

    timestampCreacion: TimestampSchema,
    timestampModificacion: TimestampSchema,
});

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
    usuarioId: true,
}).partial();

// ============================================
// Types Exports
// ============================================

export type Actividad = z.infer<typeof ActividadBaseSchema>;
export type ActividadCreate = z.infer<typeof ActividadCreateSchema>;
export type ActividadUpdate = z.infer<typeof ActividadUpdateSchema>;

export type InscripcionActividad = z.infer<typeof InscripcionActividadSchema>;
export type InscripcionActividadCreate = z.infer<typeof InscripcionActividadCreateSchema>;
export type InscripcionActividadUpdate = z.infer<typeof InscripcionActividadUpdateSchema>;

export type EstadoActividad = z.infer<typeof EstadoActividadEnum>;
export type EstadoInscripcionActividad = z.infer<typeof EstadoInscripcionEnum>;
