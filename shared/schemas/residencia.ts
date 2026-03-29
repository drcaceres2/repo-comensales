import { z } from 'zod';
import {
    CadenaOpcionalLimitada,
    UbicacionSchema,
    UrlOpcionalSchema,
    SlugIdSchema,
    TimestampSchema
} from './common';
import { FechaHoraIsoSchema } from './fechas';
import { ComedorDataSchema, DietaDataSchema } from './complemento1';
import { HorarioSolicitudDataSchema, TiempoComidaSchema, 
    DefinicionAlternativaSchema, ConfiguracionAlternativaSchema,
    GrupoComidaSchema
} from './horarios';
import { GrupoUsuario, GrupoUsuarioSchema, RestriccionCatalogoSchema } from './usuariosGrupos';
import { normalizarEtiquetaCampoPersonalizado } from '../utils/commonUtils';

// ============================================
// CampoPersonalizado (nueva estructura)
// ============================================

export const CampoPersonalizadoSchema = z.object({
    activo: z.boolean(),
    configuracionVisual: z.object({
        etiqueta: z.string()
            .max(120)
            .transform(normalizarEtiquetaCampoPersonalizado)
            .pipe(
                z.string()
                    .min(1, "La etiqueta es obligatoria")
                    .max(50, "La etiqueta no puede superar 50 caracteres")
                    .regex(/^[\p{L}\p{N}_ -]+$/u, "Solo se permiten letras, números, espacios, guiones y guiones bajos")
            ),
        tipoControl: z.enum(['text', 'textArea']),
        placeholder: CadenaOpcionalLimitada(1, 100).optional(),
    }).strict(),
    validacion: z.object({
        esObligatorio: z.boolean(),
        necesitaValidacion: z.boolean(),
        regex: CadenaOpcionalLimitada(1, 200).optional(),
        mensajeError: CadenaOpcionalLimitada(1, 200).optional(),
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
export const ResidenciaSchema = z.object({
    id: SlugIdSchema,
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
export const CreateResidenciaSchema = ResidenciaSchema.omit({ 
    id: true 
}).strict();

/**
 * Esquema para UPDATE Residencia
 */
export const UpdateResidenciaSchema = ResidenciaSchema.omit({
    id: true 
}).partial().extend({
    direccion: z.string().max(255).nullable().optional(),
    logoUrl: UrlOpcionalSchema.nullable(),
    locale: z.string().max(10).trim().nullable()
        .transform(v => (v === "" || v === null) ? "es-HN" : v)
        .optional(),
}).strict();
// TODO: Corregir campo "locale" en esquema UpdateResidencia que pertenece a esquema viejo

export const ResidenciaConVersion = ResidenciaSchema.extend(
    { version: z.number().int().nonnegative().default(1) }
).strict();

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
    residenciaId: SlugIdSchema,
    nombreCompleto: z.string().min(1).max(80),
    version: z.number().int().nonnegative().default(1),
    //bloqueoIntencionResidentes: z.boolean().default(false),

    // Muro móvil
    fechaHoraReferenciaUltimaSolicitud: FechaHoraIsoSchema,
    timestampUltimaSolicitud: TimestampSchema,

    // Datos Embebidos (Embed Pattern)
    horariosSolicitud: z.record(SlugIdSchema, HorarioSolicitudDataSchema),
    comedores: z.record(SlugIdSchema, ComedorDataSchema),
    gruposUsuarios: z.record(SlugIdSchema, GrupoUsuarioSchema),
    dietas: z.record(SlugIdSchema, DietaDataSchema),
    gruposComidas: z.record(SlugIdSchema, GrupoComidaSchema),
    esquemaSemanal: z.record(SlugIdSchema, TiempoComidaSchema),
    catalogoAlternativas: z.record(SlugIdSchema, DefinicionAlternativaSchema),
    configuracionesAlternativas: z.record(SlugIdSchema, ConfiguracionAlternativaSchema),
    restriccionesCatalogo: z.record(SlugIdSchema, RestriccionCatalogoSchema),
}).strict();

/**
 * Subconjunto exacto de campos que escribe el guardado masivo de horarios.
 * Se usa para validar únicamente el payload persistido por la callable.
 */
export const ConfiguracionResidenciaHorariosWriteSchema = ConfiguracionResidenciaSchema.pick({
    version: true,
    horariosSolicitud: true,
    comedores: true,
    gruposComidas: true,
    esquemaSemanal: true,
    catalogoAlternativas: true,
    configuracionesAlternativas: true,
}).strict();


// ============================================
// Type Exports
// ============================================

export type Residencia = z.infer<typeof ResidenciaSchema>;
export type ResidenciaConVersion = z.infer<typeof ResidenciaConVersion>;
export type CreateResidencia = z.infer<typeof CreateResidenciaSchema>;
export type UpdateResidencia = z.infer<typeof UpdateResidenciaSchema>;

/**
 * Colección: configuracionResidencia (Singleton por residencia)
 * ID: general (es un singleton)
 * Controla el "Muro Móvil" y las "Islas de Bloqueo".
 */
export type ConfiguracionResidencia = z.infer<typeof ConfiguracionResidenciaSchema>;
export type ConfiguracionResidenciaHorariosWrite = z.infer<typeof ConfiguracionResidenciaHorariosWriteSchema>;
export type CampoPersonalizado = z.infer<typeof CampoPersonalizadoSchema>;
