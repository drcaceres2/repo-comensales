import { z } from 'zod';
import { FirestoreIdSchema, slugIdSchema } from './common';
import { FechaIsoSchema, TimestampStringSchema } from './fechas';

// Definición centralizada para el estado de la novedad
export const EstadoNovedadEnum = z.enum([
  'pendiente',
  'aprobado',
  'rechazado',
  'consolidado',
  'archivado',
]);
export const CategoriaNovedadEnum = z.enum([
    'comida', 'ropa', 'limpieza',
  'mantenimiento', 'salud', 'otros'
])

// ============================================
// NovedadOperativa
// ============================================

const NovedadOperativaBaseSchema = z.object({
  residenciaId: slugIdSchema,
  autorId: FirestoreIdSchema,
  aprobadorId: FirestoreIdSchema.optional(), // Quien la revisó (Director/Asistente)
  consolidadorId: FirestoreIdSchema.optional(), // Reemplaza 'usuarioSolicitanteAdminId' (más claro)
  solicitudConsolidadaId: FirestoreIdSchema.optional(), // Vínculo estricto e inmutable al Snapshot
  fechaProgramada: FechaIsoSchema,

  texto: z.string().min(5).max(500), // OBLIGATORIO. Mínimo 5 caracteres para evitar "ok".
  categoria: z.enum(['comida', 'ropa', 'limpieza', 'mantenimiento', 'salud', 'otros']), // Sugiero agregar 'salud'

  estado: z.enum([
    'pendiente',   // Recién creado por residente
    'aprobado',    // Validado por el Director, listo para la próxima solicitud
    'rechazado',   // El Director decidió no pasarlo a la administración
    'consolidado', // Ya fue incluido en una Solicitud Consolidada (Inmutable)
    'archivado'    // Histórico (si aplica post-consolidación)
  ]),

  timestampCreacion: TimestampStringSchema,
  timestampActualizacion: TimestampStringSchema, // Crítico para auditoría de cambios de estado
}).strict();

export const NovedadOperativaSchema = NovedadOperativaBaseSchema.extend({
  id: FirestoreIdSchema,
  timestampCreacion: TimestampStringSchema,
});

export const NovedadOperativaCreateSchema = NovedadOperativaBaseSchema.pick({
  texto: true,
  categoria: true,
});
export const NovedadOperativaUpdateSchema = NovedadOperativaSchema.partial();

// Tipo inferido para ser usado en otros lugares de la aplicación
export type NovedadEstado = z.infer<typeof EstadoNovedadEnum>;
export type CategoriaNovedad = z.infer<typeof CategoriaNovedadEnum>;
export type NovedadOperativa = z.infer<typeof NovedadOperativaSchema>;
export type NovedadOperativaCreate = z.infer<typeof NovedadOperativaCreateSchema>;
export type NovedadOperativaUpdate = z.infer<typeof NovedadOperativaUpdateSchema>;


