import { z } from 'zod';
import { CadenaOpcionalLimitada, UrlOpcionalSchema, slugIdSchema } from './common';
import { UbicacionSchema, FechaHoraIsoSchema, TimestampStringSchema } from './fechas';
import { ComedorDataSchema, GrupoUsuariosDataSchema, DietaDataSchema } from './complemento1';
import { HorarioSolicitudDataSchema, TiempoComidaSchema, 
    DefinicionAlternativaSchema, ConfiguracionAlternativaSchema,
    GrupoComidaSchema
} from './horarios';

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
    id: slugIdSchema,
    nombre: z.string().min(1).max(80),
    direccion: CadenaOpcionalLimitada(1, 255).optional(),
    logoUrl: UrlOpcionalSchema,
    contextoTraduccion: z.string()
        .max(20)
        .trim()
        .transform(v => v === "" ? "es-HN" : v)
        .default("es-HN"),
    tipo: z.object({
        tipoResidentes: z.enum(['estudiantes', 'profesionales', 'gente_mayor', 'otro']),
        modalidadResidencia: z.enum(['hombres', 'mujeres']),
    }).strict(),
    ubicacion: UbicacionSchema,

    camposPersonalizadosResidencia: z.record(z.string()).optional(),
    camposPersonalizadosPorUsuario: z.array(CampoPersonalizadoSchema).optional(),

    estadoContrato: z.enum(['activo', 'prueba', 'inactivo']),
    estado: z.enum(['aprovisionado', 'activo', 'archivado', 're-aprovisionado']),
}).strict();

/**
 * Esquema para CREATE Residencia
 */
export const createResidenciaSchema = residenciaSchema.omit({ 
    id: true 
}).strict();

/**
 * Esquema para UPDATE Residencia
 */
export const updateResidenciaSchema = residenciaSchema.omit({ 
    id: true 
}).partial().extend({
    direccion: z.string().max(255).nullable().optional(),
    logoUrl: UrlOpcionalSchema.nullable(),
    locale: z.string().max(10).trim().nullable()
        .transform(v => (v === "" || v === null) ? "es-HN" : v)
        .optional(),
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
    residenciaId: slugIdSchema,
    nombreCompleto: z.string().min(1).max(200),

    // Muro móvil
    fechaHoraReferenciaUltimaSolicitud: FechaHoraIsoSchema,
    timestampUltimaSolicitud: TimestampStringSchema,

    // Datos Embebidos (Embed Pattern)
    horariosSolicitud: z.record(slugIdSchema, HorarioSolicitudDataSchema),
    comedores: z.record(slugIdSchema, ComedorDataSchema),
    gruposUsuarios: z.record(slugIdSchema, GrupoUsuariosDataSchema),
    dietas: z.record(slugIdSchema, DietaDataSchema),
    gruposComidas: z.record(slugIdSchema, GrupoComidaSchema),
    esquemaSemanal: z.record(slugIdSchema, TiempoComidaSchema),
    catalogoAlternativas: z.record(slugIdSchema, DefinicionAlternativaSchema),
    configuracionAlternativas: z.record(slugIdSchema, ConfiguracionAlternativaSchema),
}).strict();
export const CONFIG_RESIDENCIA_ID = "general";

// ============================================
// Type Exports
// ============================================

export type Residencia = z.infer<typeof residenciaSchema>;
export type CreateResidencia = z.infer<typeof createResidenciaSchema>;
export type UpdateResidencia = z.infer<typeof updateResidenciaSchema>;

/**
 * Colección: configuracionResidencia (Singleton por residencia)
 * ID: general (es un singleton)
 * Controla el "Muro Móvil" y las "Islas de Bloqueo".
 */
export type ConfiguracionResidencia = z.infer<typeof ConfiguracionResidenciaSchema>;
export type CampoPersonalizado = z.infer<typeof CampoPersonalizadoSchema>;
