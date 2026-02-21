import { z } from 'zod';
import { FirestoreIdSchema, slugCompuestoIdSchema, slugIdSchema } from './common';
import { FechaIsoSchema, TimestampStringSchema } from './fechas';

// ============================================
// ComensalSolicitado
// ============================================

const SnapshotComensalSchema = z.object({
    tiempoComidaId: slugIdSchema,
    nombreTiempoComida: z.string(),
    alternativaId: slugIdSchema,
    nombreAlternativa: z.string(),
    comedor: slugIdSchema, // ComedorId
}).strict();

const ContabilidadComensalSchema = z.object({
    ccDeUsuario: slugIdSchema.optional(),
    nombreCcDeUsuario: z.string().optional(),
    ccDeGrupo: slugIdSchema.optional(),
    nombreCcDeGrupo: z.string().optional(),
    ccDeComedor: slugIdSchema.optional(),
    nombreCcDeComedor: z.string().optional(),
    ccDeActividad: slugIdSchema.optional(),
    nombreCcDeActividad: z.string().optional(),
    ccEscogidos: z.array(slugIdSchema).optional(),
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
    id: slugCompuestoIdSchema,

    // Coordenadas
    residenciaId: slugIdSchema,
    usuarioComensalId: FirestoreIdSchema,
    nombreUsuarioComensal: z.string(),
    dietaId: slugIdSchema,
    solicitudConsolidadaId: slugIdSchema,
    fecha: FechaIsoSchema,

    // Detalle del consumo (Snapshot desnormalizado)
    snapshot: SnapshotComensalSchema,

    // Contabilidad
    contabilidad: ContabilidadComensalSchema,

    // Trazabilidad
    origen: OrigenComensalSchema,
    referenciaOrigenId: slugCompuestoIdSchema.optional(),
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
    tiempoComidaId: slugIdSchema,
    nombreTiempoComida: z.string(),
    alternativaId: slugIdSchema,
    nombreAlternativa: z.string(),
    totalComensales: z.number().int().nonnegative(),
    desglosePorDieta: z.record(slugIdSchema, z.number().int().nonnegative()),
}).strict();

const OtrasSolicitudesSchema = z.object({
    movimientosDeUsuarios: z.array(DetalleMovimientoUsuarioSchema),
    actividades: z.array(FirestoreIdSchema),
    dietas: z.array(slugIdSchema),
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
    id: slugIdSchema,
    residenciaId: slugIdSchema,
    fecha: FechaIsoSchema,
    timestampCreacion: TimestampStringSchema,
    estadoSincronizacionERP: z.enum(['pendiente', 'sincronizado', 'error']),

    comensales: z.array(slugCompuestoIdSchema), // ComensalSolicitadoId[]

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
