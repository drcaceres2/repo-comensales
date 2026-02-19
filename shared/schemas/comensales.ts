import { z } from 'zod';
import { FirebaseIdSchema, CadenaOpcionalLimitada } from './common';
import { FechaIsoSchema, TimestampStringSchema } from './fechas';

// ============================================
// ComensalSolicitado
// ============================================

const SnapshotComensalSchema = z.object({
    tiempoComidaId: FirebaseIdSchema,
    nombreTiempoComida: z.string(),
    alternativaId: FirebaseIdSchema,
    nombreAlternativa: z.string(),
    comedor: FirebaseIdSchema, // ComedorId
}).strict();

const ContabilidadComensalSchema = z.object({
    ccDeUsuario: FirebaseIdSchema.optional(),
    nombreCcDeUsuario: z.string().optional(),
    ccDeGrupo: FirebaseIdSchema.optional(),
    nombreCcDeGrupo: z.string().optional(),
    ccDeComedor: FirebaseIdSchema.optional(),
    nombreCcDeComedor: z.string().optional(),
    ccDeActividad: FirebaseIdSchema.optional(),
    nombreCcDeActividad: z.string().optional(),
    ccEscogidos: z.array(FirebaseIdSchema).optional(),
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
    id: FirebaseIdSchema,

    // Coordenadas
    residenciaId: FirebaseIdSchema,
    usuarioComensalId: FirebaseIdSchema,
    nombreUsuarioComensal: z.string(),
    dietaId: FirebaseIdSchema,
    usuarioDirectorId: FirebaseIdSchema,
    fecha: FechaIsoSchema,

    // Detalle del consumo (Snapshot desnormalizado)
    snapshot: SnapshotComensalSchema,

    // Contabilidad
    contabilidad: ContabilidadComensalSchema,

    // Trazabilidad
    origen: OrigenComensalSchema,
    referenciaOrigenId: FirebaseIdSchema.optional(),
    timestampCreacion: TimestampStringSchema,
}).strict();

// ============================================
// SolicitudConsolidada
// ============================================

const DetalleMovimientoUsuarioSchema = z.object({
    usuarioId: FirebaseIdSchema,
    accion: z.enum(['entrada', 'salida', 'cambio_informacion']),
    comentario: z.string().max(500).optional(),
}).strict();

const DetalleResumenSchema = z.object({
    tiempoComidaId: FirebaseIdSchema,
    nombreTiempoComida: z.string(),
    alternativaId: FirebaseIdSchema,
    nombreAlternativa: z.string(),
    totalComensales: z.number().int().nonnegative(),
    desglosePorDieta: z.record(FirebaseIdSchema, z.number().int().nonnegative()),
}).strict();

const OtrasSolicitudesSchema = z.object({
    movimientosDeUsuarios: z.array(DetalleMovimientoUsuarioSchema),
    actividades: z.array(FirebaseIdSchema),
    dietas: z.array(FirebaseIdSchema),
    atenciones: z.array(FirebaseIdSchema),
    alteracionesHorario: z.array(FirebaseIdSchema),
    comentarios: z.array(FirebaseIdSchema),
}).strict();

/**
 * SolicitudConsolidada: El hecho inmutable completo ("The Daily Manifest").
 * Se genera cuando el Director ejecuta "Solicitar a la Administración".
 * 
 * Ruta: residencias/{slug}/solicitudesConsolidadas/{fecha-slugHorarioSolicitud}
 */
export const SolicitudConsolidadaSchema = z.object({
    id: FirebaseIdSchema,
    residenciaId: FirebaseIdSchema,
    fecha: FechaIsoSchema,
    timestampCreacion: TimestampStringSchema,
    estadoSincronizacionERP: z.enum(['pendiente', 'sincronizado', 'error']),

    comensales: z.array(FirebaseIdSchema), // ComensalSolicitadoId[]

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
