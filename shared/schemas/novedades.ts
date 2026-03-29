import { z } from 'zod';
import {
  AuthIdSchema, OptionalAuthIdSchema,
  FirestoreIdSchema, SlugIdSchema, TimestampSchema} from './common';
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

export const NovedadBaseSchema = z.object({
  residenciaId: SlugIdSchema,
  fechaProgramada: FechaIsoSchema,
  texto: z.string().min(5, "La descripción debe tener al menos 5 caracteres.").max(500),
  consolidadorId: OptionalAuthIdSchema,
  timestampCreacion: TimestampSchema,
}).strict();

export const NovedadInternaSchema = NovedadBaseSchema.extend({
  origen: z.literal('interno'),
  autorId: AuthIdSchema,
  categoria: CategoriaNovedadEnum,
  estado: EstadoNovedadEnum,
});

export const NovedadAdministracionSchema = NovedadBaseSchema.extend({
  origen: z.literal('administracion'),
  categoria: z.literal('operativa_cocina'),
  estado: z.enum(['consolidado', 'archivado']),
});

export const NovedadOperativaSchema = z.discriminatedUnion('origen', [
  NovedadInternaSchema,
  NovedadAdministracionSchema,
]);

export const NovedadOperativaConIdSchema = NovedadOperativaSchema.and(z.object({
  id: FirestoreIdSchema,
}));

export const NovedadInternaConIdSchema = NovedadInternaSchema.and(z.object({
  id: FirestoreIdSchema,
}));

// Formulario de mis-novedades: solo origen interno
export const NovedadInternaFormSchema = NovedadInternaSchema.pick({
  texto: true,
  categoria: true,
});

export const NovedadInternaUpdateSchema = NovedadInternaFormSchema.partial();

// Alias de compatibilidad temporal en el módulo actual.
export const NovedadFormSchema = NovedadInternaFormSchema;
export const NovedadOperativaUpdateSchema = NovedadInternaUpdateSchema;

// Tipo inferido para ser usado en otros lugares de la aplicación
export type NovedadEstado = z.infer<typeof EstadoNovedadEnum>;
export type CategoriaNovedad = z.infer<typeof CategoriaNovedadEnum>;
export type NovedadOperativa = z.infer<typeof NovedadOperativaConIdSchema>;
export type NovedadOperativaInterna = z.infer<typeof NovedadInternaConIdSchema>;
export type NovedadFormValues = z.infer<typeof NovedadInternaFormSchema>;
export type NovedadInternaFormValues = z.infer<typeof NovedadInternaFormSchema>;
export type NovedadOperativaUpdate = z.infer<typeof NovedadInternaUpdateSchema>;
export type NovedadInternaUpdate = z.infer<typeof NovedadInternaUpdateSchema>;




