import { z } from 'zod';
import { FirestoreIdSchema, slugIdSchema, TimestampSchema } from './common';
import { FechaIsoSchema } from './fechas';

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

  texto: z.string().min(5, "La descripción debe tener al menos 5 caracteres.").max(500),
  categoria: z.enum(['comida', 'ropa', 'limpieza', 'mantenimiento', 'salud', 'otros']),

  estado: z.enum([
    'pendiente',   // Recién creado por residente
    'aprobado',    // Validado por el Director, listo para la próxima solicitud
    'rechazado',   // El Director decidió no pasarlo a la administración
    'consolidado', // Ya fue incluido en una Solicitud Consolidada (Inmutable)
    'archivado'    // Histórico (si aplica post-consolidación)
  ]),

  timestampCreacion: TimestampSchema,
  timestampActualizacion: TimestampSchema,
}).strict();

export const NovedadOperativaSchema = NovedadOperativaBaseSchema.extend({
  id: FirestoreIdSchema,
});

// Schema defining the fields used in the form
export const NovedadFormSchema = NovedadOperativaBaseSchema.pick({
  texto: true,
  categoria: true,
});

export const NovedadOperativaUpdateSchema = NovedadFormSchema.partial();

// Tipo inferido para ser usado en otros lugares de la aplicación
export type NovedadEstado = z.infer<typeof EstadoNovedadEnum>;
export type CategoriaNovedad = z.infer<typeof CategoriaNovedadEnum>;
export type NovedadOperativa = z.infer<typeof NovedadOperativaSchema>;
export type NovedadFormValues = z.infer<typeof NovedadFormSchema>;
export type NovedadOperativaUpdate = z.infer<typeof NovedadOperativaUpdateSchema>;


