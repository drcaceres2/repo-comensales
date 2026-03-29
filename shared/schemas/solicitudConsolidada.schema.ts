import { z } from 'zod';
import { DietaDataSchema } from "./complemento1";
import { 
    AuthIdSchema, OptionalAuthIdSchema, 
    OptionalSlugIdSchema, 
    SlugIdSchema, TimestampSchema 
} from "./common";
import { ActividadBaseSchema } from "./actividades";
import { AlteracionDiariaSchema } from './alteraciones';
import { FechaHoraIsoSchema, FechaIsoSchema } from './fechas';

// ============================================================================
// 1. ESQUEMAS DE DESNORMALIZACIÓN (INMUTABILIDAD HISTÓRICA)
// ============================================================================

const ReferenciaDietaSchema = DietaDataSchema.pick({
    nombre: true
}).extend({
    dietaId: SlugIdSchema,
});

const ReferenciaActividadSchema = ActividadBaseSchema.pick({
    id: true,
    titulo: true,
    conteoInscritos: true,
    adicionalesNoNominales: true
}).extend({
    tipoComunicacion: z.enum(['PREVIA', 'DEFINITIVA', 'CANCELACION'])
});

// Implementación de la Unión Discriminada discutida para el Snapshot
const ReferenciaNovedadSchema = z.discriminatedUnion("origen", [
    z.object({
        origen: z.literal('interno'),
        novedadOperativaId: z.string(),
        texto: z.string().max(500),
        autorId: z.string()
    }),
    z.object({
        origen: z.literal('administracion'), // Novedad a la inversa (Cocina)
        novedadOperativaId: z.string(),
        texto: z.string().max(500),
        consolidadorId: z.string()
    })
]);

const ReferenciaAlteracionSchema = AlteracionDiariaSchema.pick({
  fecha: true
}).extend({
    tiemposComidaAfectados: z.record(
        SlugIdSchema, // tiempoComidaId
        z.object({ motivo: z.string().min(5) }) 
    )
});

// ============================================================================
// 2. DOCUMENTO RAÍZ (EL SNAPSHOT / FAT DOCUMENT CONTROLADO)
// Path: residencias/{residenciaId}/solicitudesConsolidadas/{fecha__horarioId}
// ============================================================================

export const SolicitudConsolidadaSchema = z.object({
    // ID Compuesto y Determinista para garantizar Idempotencia
    // Formato estricto: YYYY-MM-DD__horarioSolicitudComidaId
    id: z.string().regex(/^\d{4}-\d{2}-\d{2}__[a-zA-Z0-9-]+$/),
    residenciaId: z.string(),

    // Máquina de estados del documento y concurrencia
    estadoDocumento: z.enum(['BORRADOR', 'CONSOLIDADO', 'CANCELADO']),

    // Trazabilidad temporal (Auditoría)
    fechaOperativa: FechaIsoSchema, // Fecha a la que aplica la comida
    fechaHoraReferenciaCorte: FechaHoraIsoSchema, // El instante exacto del muro móvil
    timestampCreacion: TimestampSchema,
    timestampCierreOficial: TimestampSchema.optional(),
    consolidadorId: AuthIdSchema,
    
    // Orquestación asíncrona (Background Workers)
    estadoGeneracionPdf: z.enum(['PENDIENTE', 'GENERANDO', 'COMPLETADO', 'ERROR']).default('PENDIENTE'),
    urlPdfReporte: z.string().url().optional(),

    erpSincronizacion: z.object({
        estado: z.enum(['PENDIENTE', 'SINCRONIZADO', 'ERROR', 'NO_APLICA']),
        intentos: z.number().default(0),
        ultimoError: z.string().optional()
    }),

    // Anexos de Comunicación (El "Inbox Zero" materializado)
    entidadesComunicadas: z.object({
        dietas: z.array(ReferenciaDietaSchema),
        actividades: z.array(ReferenciaActividadSchema),
        novedadesOperativas: z.array(ReferenciaNovedadSchema),
        alteracionesHorario: z.array(ReferenciaAlteracionSchema),
        movimientosDeUsuarios: z.array(z.object({
            usuarioId: z.string(),
            accion: z.enum(['entrada', 'salida', 'cambio_informacion']),
            comentario: z.string().optional()
        }))
    }),

    // El Motor Matemático (Pre-agrupado para UI de Acordeón)
    resumen: z.array(z.object({
        tiempoComidaId: SlugIdSchema,
        nombreTiempoComida: z.string().min(1).max(100),
        totalComensalesTiempoComida: z.number(),
        alternativas: z.array(z.object({
            alternativaId: SlugIdSchema,
            nombreAlternativa: z.string().min(1).max(100),
            totalComensalesAlternativa: z.number(),
            desglosePorDieta: z.record(SlugIdSchema, z.number()) // { dietaId: cantidad }
        }))
    }))
});

// ============================================================================
// 3. SUBCOLECCIÓN DE COMENSALES (PREVENCIÓN DE OVER-FETCHING)
// Path: residencias/{resId}/solicitudesConsolidadas/{solId}/comensales/{comensalId}
// ============================================================================

export const ComensalConsolidadoSchema = z.object({
    // ID Compuesto: usuarioId__tiempoComidaId (Evita duplicidad del mismo usuario en un tiempo de comida)
    id: z.string().regex(/^[a-zA-Z0-9-]+__[a-zA-Z0-9-]+$/),
    usuarioComensalId: z.string(),
    nombreUsuarioComensal: z.string(),
    dietaId: SlugIdSchema,

    snapshotEleccion: z.object({
        tiempoComidaId: SlugIdSchema,
        alternativaId: SlugIdSchema,
        nombreAlternativa: z.string().min(1).max(100)
    }),

    contabilidad: z.object({
        ccDeUsuario: OptionalSlugIdSchema.optional(),
        nombreCcDeUsuario: z.string().min(1).max(100).optional(),
        ccDeGrupo: OptionalSlugIdSchema.optional(),
        nombreCcDeGrupo: z.string().min(1).max(100).optional(),
        ccDeComedor: OptionalSlugIdSchema.optional(),
        nombreCcDeComedor: z.string().min(1).max(100).optional(),
        ccDeActividad: OptionalSlugIdSchema.optional(),
        nombreCcDeActividad: z.string().min(1).max(100).optional(),
        ccFinal: OptionalSlugIdSchema.optional()
    }),

    origen: z.enum(['SEMANARIO', 'EXCEPCION', 'ACTIVIDAD', 'AUSENCIA', 'INVITADO']),
    referenciaOrigenId: z.string().optional() // Trazabilidad hacia el documento que causó la reserva
});

// ============================================================================
// 4. DTOs para operaciones serverless del módulo
// ============================================================================

export const TipoComunicacionActividadConsolidadaSchema = z.enum([
  'PREVIA',
  'DEFINITIVA',
  'CANCELACION',
]);

export const ActividadSelloPatchSchema = z.object({
  actividadId: SlugIdSchema,
  tipoComunicacion: TipoComunicacionActividadConsolidadaSchema,
});

export const SellarSolicitudConsolidadaPayloadSchema = z.object({
  residenciaId: SlugIdSchema,
  solicitudId: z.string().regex(/^\d{4}-\d{2}-\d{2}__[a-zA-Z0-9-]+$/),
  // OCC desde cliente para evitar sellar un documento obsoleto.
  expectedEstadoDocumento: z.literal('BORRADOR').default('BORRADOR'),
  actividadPatches: z.array(ActividadSelloPatchSchema).default([]),
  atencionIds: z.array(SlugIdSchema).max(250).default([]),
  alteracionIds: z.array(SlugIdSchema).max(250).default([]),
  novedadIds: z.array(SlugIdSchema).max(250).default([]),
});

export const SellarSolicitudConsolidadaResultSchema = z.object({
  success: z.literal(true),
  solicitudId: z.string(),
  totalWrites: z.number().int().nonnegative(),
  message: z.string(),
});

export type TipoComunicacionActividadConsolidada = z.infer<typeof TipoComunicacionActividadConsolidadaSchema>;
export type ActividadSelloPatch = z.infer<typeof ActividadSelloPatchSchema>;
export type SellarSolicitudConsolidadaPayload = z.infer<typeof SellarSolicitudConsolidadaPayloadSchema>;
export type SellarSolicitudConsolidadaResult = z.infer<typeof SellarSolicitudConsolidadaResultSchema>;
