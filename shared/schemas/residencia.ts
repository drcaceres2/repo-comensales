import { z } from 'zod';
import { FirestoreIdSchema, CadenaOpcionalLimitada } from './common';
import { UbicacionSchema, FechaHoraIsoSchema, TimestampStringSchema } from './fechas';
import { ComedorDataSchema, GrupoUsuariosDataSchema, DietaDataSchema } from './complemento1';
import { HorarioSolicitudDataSchema, TiempoComidaSchema, DefinicionAlternativaSchema, ConfiguracionAlternativaSchema } from './horarios';

// ============================================
// CampoPersonalizado (nueva estructura)
// ============================================

export const CampoPersonalizadoSchema = z.object({
    activo: z.boolean(),
    configuracionVisual: z.object({
        etiqueta: z.string().min(1).max(50),
        tipoControl: z.enum(['text', 'textArea']),
        placeholder: z.string().min(1).optional(),
    }).strict(),
    validacion: z.object({
        esObligatorio: z.boolean(),
        necesitaValidacion: z.boolean(),
        regex: z.string().max(200).optional(),
        mensajeError: z.string().max(200).optional(),
    }).strict(),
    permisos: z.object({
        modificablePorDirector: z.boolean(),
        modificablePorInteresado: z.boolean(),
    }).strict(),
}).strict();

// ============================================
// Residencia
// ============================================

/**
 * Esquema base para Residencia (lectura)
 */
export const residenciaSchema = z.object({
    id: FirestoreIdSchema,
    nombre: z.string().min(1).max(80),
    direccion: CadenaOpcionalLimitada(1, 255).optional(),
    logoUrl: z.string().url().optional(),
    locale: z.string().max(10).optional(),
    tipo: z.object({
        tipoResidentes: z.enum(['estudiantes', 'profesionales', 'gente_mayor', 'otro']),
        modalidadResidencia: z.enum(['hombres', 'mujeres']),
    }).strict(),
    ubicacion: UbicacionSchema,

    camposPersonalizadosResidencia: z.record(z.string()).optional(),
    camposPersonalizadosPorUsuario: z.array(CampoPersonalizadoSchema).optional(),

    estadoContrato: z.enum(['activo', 'prueba', 'inactivo']),
}).strict();

/**
 * Esquema para CREATE Residencia
 */
export const createResidenciaSchema = z.object({
    nombre: z.string().min(1).max(80),
    direccion: z.string().max(255).optional(),
    logoUrl: z.string().url().or(z.literal('')).optional(),
    locale: z.string().max(10).optional(),
    tipo: z.object({
        tipoResidentes: z.enum(['estudiantes', 'profesionales', 'gente_mayor', 'otro']),
        modalidadResidencia: z.enum(['hombres', 'mujeres']),
    }).strict(),
    ubicacion: UbicacionSchema,

    camposPersonalizadosResidencia: z.record(z.string()).optional(),
    camposPersonalizadosPorUsuario: z.array(CampoPersonalizadoSchema).optional(),

    estadoContrato: z.enum(['activo', 'prueba', 'inactivo']),
}).strict();

/**
 * Esquema para UPDATE Residencia
 */
export const updateResidenciaSchema = z.object({
    nombre: z.string().min(1).max(80).optional(),
    direccion: z.string().max(255).nullable().optional(),
    logoUrl: z.string().url().or(z.literal('')).nullable().optional(),
    locale: z.string().max(10).nullable().optional(),
    tipo: z.object({
        tipoResidentes: z.enum(['estudiantes', 'profesionales', 'gente_mayor', 'otro']),
        modalidadResidencia: z.enum(['hombres', 'mujeres']),
    }).strict().optional(),
    ubicacion: UbicacionSchema.optional(),

    camposPersonalizadosResidencia: z.record(z.string()).optional(),
    camposPersonalizadosPorUsuario: z.array(CampoPersonalizadoSchema).optional(),

    estadoContrato: z.enum(['activo', 'prueba', 'inactivo']).optional(),
}).strict();

// ============================================
// ConfiguracionResidencia (Singleton por residencia)
// ============================================

/**
 * ConfiguracionResidencia: Singleton que contiene todos los datos embebidos
 * de configuración operativa de la residencia.
 * Ruta: residencias/{slug}/configuracion/general
 */
export const ConfiguracionResidenciaSchema = z.object({
    // Metadata
    residenciaId: FirestoreIdSchema,
    nombreCompleto: z.string().min(1).max(200),

    // Muro móvil
    fechaHoraReferenciaUltimaSolicitud: FechaHoraIsoSchema,
    timestampUltimaSolicitud: TimestampStringSchema,

    // Datos Embebidos (Embed Pattern)
    horariosSolicitud: z.record(FirestoreIdSchema, HorarioSolicitudDataSchema),
    comedores: z.record(FirestoreIdSchema, ComedorDataSchema),
    gruposUsuarios: z.record(FirestoreIdSchema, GrupoUsuariosDataSchema),
    dietas: z.record(FirestoreIdSchema, DietaDataSchema),
    gruposComidas: z.array(z.string()),
    esquemaSemanal: z.record(FirestoreIdSchema, TiempoComidaSchema),
    catalogoAlternativas: z.record(FirestoreIdSchema, DefinicionAlternativaSchema),
    configuracionAlternativas: z.record(FirestoreIdSchema, ConfiguracionAlternativaSchema),
}).strict();

// ============================================
// ConfigContabilidad (Singleton por residencia)
// ============================================

export const CentroDeCostoDataSchema = z.object({
    codigo: FirestoreIdSchema,
    nombre: z.string().min(1).max(100),
    descripcion: CadenaOpcionalLimitada(1, 255).optional(),
    estaActivo: z.boolean(),
}).strict();

export const ConfigContabilidadSchema = z.object({
    residenciaId: FirestoreIdSchema,
    nombreEtiquetaCentroCosto: CadenaOpcionalLimitada(1, 100).optional(),
    modeloClasificacion: z.enum(['por-usuario', 'por-grupo-usuario', 'por-comedor', 'detallada']).optional(),
    valorizacionComensales: z.boolean(),
    modoCosteo: z.enum(['general', 'por-grupo-tiempo-comida', 'por-tiempo-comida', 'detallado']).optional(),
    costoDiferenciadoDietas: z.boolean(),
    centrosDeCosto: z.record(FirestoreIdSchema, CentroDeCostoDataSchema),
}).strict();

// ============================================
// Type Exports
// ============================================

export type Residencia = z.infer<typeof residenciaSchema>;
export type CreateResidencia = z.infer<typeof createResidenciaSchema>;
export type UpdateResidencia = z.infer<typeof updateResidenciaSchema>;
export type ConfiguracionResidencia = z.infer<typeof ConfiguracionResidenciaSchema>;
export type CampoPersonalizado = z.infer<typeof CampoPersonalizadoSchema>;
export type CentroDeCostoData = z.infer<typeof CentroDeCostoDataSchema>;
export type ConfigContabilidad = z.infer<typeof ConfigContabilidadSchema>;
