import { z } from 'zod';
import { FirebaseIdSchema, CadenaOpcionalLimitada } from './common';
import { UbicacionSchema } from './fechas';

// ============================================
// Esquemas para ConfigContabilidad
// ============================================

export const ConfigContabilidadSchema = z.object({
    nombreEtiquetaCentroCosto: CadenaOpcionalLimitada(1, 100),
    modeloClasificacion: z.enum(['por-usuario', 'por-grupo-usuario', 'por-comedor', 'detallada']).optional(),
    valorizacionComensales: z.boolean(),
    modoCosteo: z.enum(['general', 'por-grupo-tiempo-comida', 'por-tiempo-comida', 'detallado']).optional(),
    costoDiferenciadoDietas: z.boolean(),
}).strict();

export const ConfiguracionCampoSchema = z.object({
    etiqueta: z.string().min(1).max(50),
    isActive: z.boolean(),
    necesitaValidacion: z.boolean().optional(),
    regexValidacion: z.string().max(200).optional(),
    tamanoTexto: z.enum(['text', 'textArea']).optional(),
    puedeModDirector: z.boolean().optional(),
    puedeModInteresado: z.boolean().optional(),
    esObligatorio: z.boolean().optional(),
}).strict();

// ============================================
// Esquemas para Residencia
// ============================================

/**
 * Esquema base para Residencia (lectura)
 * Incluye el ID de Firestore
 */
export const residenciaSchema = z.object({
    id: FirebaseIdSchema,
    nombre: z.string().min(1).max(80),
    direccion: CadenaOpcionalLimitada(1, 255),
    logoUrl: z.string().url().optional(),
    antelacionActividadesDefault: z.number().min(0).max(90).optional(),
    textProfile: CadenaOpcionalLimitada(),
    tipoResidencia: z.enum(['estudiantes', 'profesionales', 'gente_mayor']),
    esquemaAdministracion: z.enum(['estricto', 'flexible']),
    ubicacion: UbicacionSchema,
    
    // Campos personalizables para UserProfile
    camposPersonalizados: z.record(ConfiguracionCampoSchema).optional(),
    
    configuracionContabilidad: ConfigContabilidadSchema.nullable().optional(),
    estadoContrato: z.enum(['activo', 'prueba', 'inactivo']),
}).strict();

/**
 * Esquema para CREATE Residencia
 * Sin ID (será generado por Firestore)
 */
export const createResidenciaSchema = z.object({
    nombre: z.string().min(1).max(80),
    direccion: z.string().max(255).optional(),
    logoUrl: z.string().url().or(z.literal('')).optional(),
    antelacionActividadesDefault: z.number().min(0).max(90).optional(),
    textProfile: z.string().optional(),
    tipoResidencia: z.enum(['estudiantes', 'profesionales', 'gente_mayor']),
    esquemaAdministracion: z.enum(['estricto', 'flexible']),
    ubicacion: UbicacionSchema,
    
    camposPersonalizados: z.record(ConfiguracionCampoSchema).optional(),
    
    configuracionContabilidad: ConfigContabilidadSchema.nullable().optional(),
    estadoContrato: z.enum(['activo', 'prueba', 'inactivo']),
}).strict();

/**
 * Esquema para UPDATE Residencia
 * Todos los campos opcionales
 */
export const updateResidenciaSchema = z.object({
    nombre: z.string().min(1).max(80).optional(),
    direccion: z.string().max(255).nullable().optional(),
    logoUrl: z.string().url().or(z.literal('')).nullable().optional(),
    antelacionActividadesDefault: z.number().min(0).max(90).nullable().optional(),
    textProfile: z.string().nullable().optional(),
    tipoResidencia: z.enum(['estudiantes', 'profesionales', 'gente_mayor']).optional(),
    esquemaAdministracion: z.enum(['estricto', 'flexible']).optional(),
    ubicacion: UbicacionSchema.optional(),
    
    camposPersonalizados: z.record(ConfiguracionCampoSchema).optional(),
    
    configuracionContabilidad: ConfigContabilidadSchema.nullable().optional(),
    estadoContrato: z.enum(['activo', 'prueba', 'inactivo']).optional(),
}).strict();

// ============================================
// Esquemas para Dieta
// ============================================

/**
 * Esquema base para Dieta (lectura)
 */
export const dietaSchema = z.object({
    id: FirebaseIdSchema,
    residenciaId: FirebaseIdSchema,
    nombre: z.string().min(1).max(255),
    descripcion: CadenaOpcionalLimitada(1, 255),
    isDefault: z.boolean(),
    isActive: z.boolean(),
}).strict();

/**
 * Esquema para CREATE Dieta
 */
export const createDietaSchema = z.object({
    residenciaId: FirebaseIdSchema,
    nombre: z.string().min(1).max(255),
    descripcion: CadenaOpcionalLimitada(),
    isDefault: z.boolean().default(false),
    isActive: z.boolean().default(true),
}).strict();

/**
 * Esquema para UPDATE Dieta
 */
export const updateDietaSchema = z.object({
    nombre: z.string().min(1).max(255).optional(),
    descripcion: CadenaOpcionalLimitada().nullable().optional(),
    isDefault: z.boolean().optional(),
    isActive: z.boolean().optional(),
}).strict();
