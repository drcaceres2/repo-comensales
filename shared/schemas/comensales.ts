import { z } from 'zod';
import { FirestoreIdSchema, CadenaOpcionalLimitada } from './common';
import { FechaIsoSchema, TimestampStringSchema } from './fechas';

// ============================================
// ComensalSolicitado
// ============================================

const SnapshotComensalSchema = z.object({
    tiempoComidaId: FirestoreIdSchema,
    nombreTiempoComida: z.string(),
    alternativaId: FirestoreIdSchema,
    nombreAlternativa: z.string(),
    comedor: FirestoreIdSchema, // ComedorId
}).strict();

const ContabilidadComensalSchema = z.object({
    ccDeUsuario: FirestoreIdSchema.optional(),
    nombreCcDeUsuario: z.string().optional(),
    ccDeGrupo: FirestoreIdSchema.optional(),
    nombreCcDeGrupo: z.string().optional(),
    ccDeComedor: FirestoreIdSchema.optional(),
    nombreCcDeComedor: z.string().optional(),
    ccDeActividad: FirestoreIdSchema.optional(),
    nombreCcDeActividad: z.string().optional(),
    ccEscogidos: z.array(FirestoreIdSchema).optional(),
}).strict();

const OrigenComensalSchema = z.enum([
    'SEMANARIO', 'EXCEPCION', 'ACTIVIDAD',
    'AUSENCIA', 'ASISTENTE_INVITADOS', 'INVITADO_EXTERNO',
]);

/**
 * ComensalSolicitado: Átomo del hecho inmutable.
 * Registro generado tras el cierre que representa una ración física y contable.
 * 
 * Ruta: residencias/{slug}/solicitudesConsolidadas/{id}/comensalesSolicitados/{uid-slugtiempocomida}
 */
export const ComensalSolicitadoSchema = z.object({
    id: FirestoreIdSchema,

    // Coordenadas
    residenciaId: FirestoreIdSchema,
    usuarioComensalId: FirestoreIdSchema,
    nombreUsuarioComensal: z.string(),
    dietaId: FirestoreIdSchema,
    usuarioDirectorId: FirestoreIdSchema,
    fecha: FechaIsoSchema,

    // Detalle del consumo (Snapshot desnormalizado)
    snapshot: SnapshotComensalSchema,

    // Contabilidad
    contabilidad: ContabilidadComensalSchema,

    // Trazabilidad
    origen: OrigenComensalSchema,
    referenciaOrigenId: FirestoreIdSchema.optional(),
    timestampCreacion: TimestampStringSchema,
}).strict();

// ============================================
// SolicitudConsolidada
// ============================================

const DetalleMovimientoUsuarioSchema = z.object({
    usuarioId: FirestoreIdSchema,
    accion: z.enum(['entrada', 'salida', 'cambio_informacion']),
    comentario: z.string().max(500).optional(),
}).strict();

const DetalleResumenSchema = z.object({
    tiempoComidaId: FirestoreIdSchema,
    nombreTiempoComida: z.string(),
    alternativaId: FirestoreIdSchema,
    nombreAlternativa: z.string(),
    totalComensales: z.number().int().nonnegative(),
    desglosePorDieta: z.record(FirestoreIdSchema, z.number().int().nonnegative()),
}).strict();

const OtrasSolicitudesSchema = z.object({
    movimientosDeUsuarios: z.array(DetalleMovimientoUsuarioSchema),
    actividades: z.array(FirestoreIdSchema),
    dietas: z.array(FirestoreIdSchema),
    atenciones: z.array(FirestoreIdSchema),
    alteracionesHorario: z.array(FirestoreIdSchema),
    comentarios: z.array(FirestoreIdSchema),
}).strict();

/**
 * SolicitudConsolidada: El hecho inmutable completo ("The Daily Manifest").
 * Se genera cuando el Director ejecuta "Solicitar a la Administración".
 * 
 * Ruta: residencias/{slug}/solicitudesConsolidadas/{fecha-slugHorarioSolicitud}
 */
export const SolicitudConsolidadaSchema = z.object({
    id: FirestoreIdSchema,
    residenciaId: FirestoreIdSchema,
    fecha: FechaIsoSchema,
    timestampCreacion: TimestampStringSchema,
    estadoSincronizacionERP: z.enum(['pendiente', 'sincronizado', 'error']),

    comensales: z.array(FirestoreIdSchema), // ComensalSolicitadoId[]

    otrasSolicitudes: OtrasSolicitudesSchema,

    resumen: z.array(DetalleResumenSchema),
}).strict();

// Type exports
export type ComensalSolicitado = z.infer<typeof ComensalSolicitadoSchema>;
export type SolicitudConsolidada = z.infer<typeof SolicitudConsolidadaSchema>;
export type DetalleResumen = z.infer<typeof DetalleResumenSchema>;
export type DetalleMovimientoUsuario = z.infer<typeof DetalleMovimientoUsuarioSchema>;

// Legacy alias
export const ComensalSchema = ComensalSolicitadoSchema;
