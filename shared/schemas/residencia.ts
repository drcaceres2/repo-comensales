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
    
    // Nombres tradicionales para comidas (desayuno, almuerzo, cena)
    nombreTradicionalDesayuno: CadenaOpcionalLimitada(1, 20),
    nombreTradicionalAlmuerzo: CadenaOpcionalLimitada(1, 20),
    nombreTradicionalCena: CadenaOpcionalLimitada(1, 20),
    
    // Nombres tradicionales para días de la semana
    nombreTradicionalLunes: CadenaOpcionalLimitada(1, 20),
    nombreTradicionalMartes: CadenaOpcionalLimitada(1, 20),
    nombreTradicionalMiercoles: CadenaOpcionalLimitada(1, 20),
    nombreTradicionalJueves: CadenaOpcionalLimitada(1, 20),
    nombreTradicionalViernes: CadenaOpcionalLimitada(1, 20),
    nombreTradicionalSabado: CadenaOpcionalLimitada(1, 20),
    nombreTradicionalDomingo: CadenaOpcionalLimitada(1, 20),
    
    // Campos personalizables para UserProfile
    campoPersonalizado1_etiqueta: CadenaOpcionalLimitada(),
    campoPersonalizado1_isActive: z.boolean().optional(),
    campoPersonalizado1_necesitaValidacion: z.boolean().optional(),
    campoPersonalizado1_regexValidacion: CadenaOpcionalLimitada(),
    campoPersonalizado1_tamanoTexto: z.enum(['text', 'textArea']).optional(),
    campoPersonalizado1_puedeModDirector: z.boolean().optional(),
    campoPersonalizado1_puedeModInteresado: z.boolean().optional(),
    
    campoPersonalizado2_etiqueta: CadenaOpcionalLimitada(),
    campoPersonalizado2_isActive: z.boolean().optional(),
    campoPersonalizado2_necesitaValidacion: z.boolean().optional(),
    campoPersonalizado2_regexValidacion: CadenaOpcionalLimitada(),
    campoPersonalizado2_tamanoTexto: z.enum(['text', 'textArea']).optional(),
    campoPersonalizado2_puedeModDirector: z.boolean().optional(),
    campoPersonalizado2_puedeModInteresado: z.boolean().optional(),
    
    campoPersonalizado3_etiqueta: CadenaOpcionalLimitada(),
    campoPersonalizado3_isActive: z.boolean().optional(),
    campoPersonalizado3_necesitaValidacion: z.boolean().optional(),
    campoPersonalizado3_regexValidacion: CadenaOpcionalLimitada(),
    campoPersonalizado3_tamanoTexto: z.enum(['text', 'textArea']).optional(),
    campoPersonalizado3_puedeModDirector: z.boolean().optional(),
    campoPersonalizado3_puedeModInteresado: z.boolean().optional(),
    
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
    
    nombreTradicionalDesayuno: CadenaOpcionalLimitada(1, 20),
    nombreTradicionalAlmuerzo: CadenaOpcionalLimitada(1, 20),
    nombreTradicionalCena: CadenaOpcionalLimitada(1, 20),
    
    nombreTradicionalLunes: CadenaOpcionalLimitada(1, 20),
    nombreTradicionalMartes: CadenaOpcionalLimitada(1, 20),
    nombreTradicionalMiercoles: CadenaOpcionalLimitada(1, 20),
    nombreTradicionalJueves: CadenaOpcionalLimitada(1, 20),
    nombreTradicionalViernes: CadenaOpcionalLimitada(1, 20),
    nombreTradicionalSabado: CadenaOpcionalLimitada(1, 20),
    nombreTradicionalDomingo: CadenaOpcionalLimitada(1, 20),
    
    campoPersonalizado1_etiqueta: CadenaOpcionalLimitada(),
    campoPersonalizado1_isActive: z.boolean().optional(),
    campoPersonalizado1_necesitaValidacion: z.boolean().optional(),
    campoPersonalizado1_regexValidacion: CadenaOpcionalLimitada(),
    campoPersonalizado1_tamanoTexto: z.enum(['text', 'textArea']).optional(),
    campoPersonalizado1_puedeModDirector: z.boolean().optional(),
    campoPersonalizado1_puedeModInteresado: z.boolean().optional(),
    
    campoPersonalizado2_etiqueta: CadenaOpcionalLimitada(),
    campoPersonalizado2_isActive: z.boolean().optional(),
    campoPersonalizado2_necesitaValidacion: z.boolean().optional(),
    campoPersonalizado2_regexValidacion: CadenaOpcionalLimitada(),
    campoPersonalizado2_tamanoTexto: z.enum(['text', 'textArea']).optional(),
    campoPersonalizado2_puedeModDirector: z.boolean().optional(),
    campoPersonalizado2_puedeModInteresado: z.boolean().optional(),
    
    campoPersonalizado3_etiqueta: CadenaOpcionalLimitada(),
    campoPersonalizado3_isActive: z.boolean().optional(),
    campoPersonalizado3_necesitaValidacion: z.boolean().optional(),
    campoPersonalizado3_regexValidacion: CadenaOpcionalLimitada(),
    campoPersonalizado3_tamanoTexto: z.enum(['text', 'textArea']).optional(),
    campoPersonalizado3_puedeModDirector: z.boolean().optional(),
    campoPersonalizado3_puedeModInteresado: z.boolean().optional(),
    
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
    
    nombreTradicionalDesayuno: CadenaOpcionalLimitada(1, 20).nullable().optional(),
    nombreTradicionalAlmuerzo: CadenaOpcionalLimitada(1, 20).nullable().optional(),
    nombreTradicionalCena: CadenaOpcionalLimitada(1, 20).nullable().optional(),
    
    nombreTradicionalLunes: CadenaOpcionalLimitada(1, 20).nullable().optional(),
    nombreTradicionalMartes: CadenaOpcionalLimitada(1, 20).nullable().optional(),
    nombreTradicionalMiercoles: CadenaOpcionalLimitada(1, 20).nullable().optional(),
    nombreTradicionalJueves: CadenaOpcionalLimitada(1, 20).nullable().optional(),
    nombreTradicionalViernes: CadenaOpcionalLimitada(1, 20).nullable().optional(),
    nombreTradicionalSabado: CadenaOpcionalLimitada(1, 20).nullable().optional(),
    nombreTradicionalDomingo: CadenaOpcionalLimitada(1, 20).nullable().optional(),
    
    campoPersonalizado1_etiqueta: CadenaOpcionalLimitada().nullable().optional(),
    campoPersonalizado1_isActive: z.boolean().optional(),
    campoPersonalizado1_necesitaValidacion: z.boolean().optional(),
    campoPersonalizado1_regexValidacion: CadenaOpcionalLimitada().nullable().optional(),
    campoPersonalizado1_tamanoTexto: z.enum(['text', 'textArea']).optional(),
    campoPersonalizado1_puedeModDirector: z.boolean().optional(),
    campoPersonalizado1_puedeModInteresado: z.boolean().optional(),
    
    campoPersonalizado2_etiqueta: CadenaOpcionalLimitada().nullable().optional(),
    campoPersonalizado2_isActive: z.boolean().optional(),
    campoPersonalizado2_necesitaValidacion: z.boolean().optional(),
    campoPersonalizado2_regexValidacion: CadenaOpcionalLimitada().nullable().optional(),
    campoPersonalizado2_tamanoTexto: z.enum(['text', 'textArea']).optional(),
    campoPersonalizado2_puedeModDirector: z.boolean().optional(),
    campoPersonalizado2_puedeModInteresado: z.boolean().optional(),
    
    campoPersonalizado3_etiqueta: CadenaOpcionalLimitada().nullable().optional(),
    campoPersonalizado3_isActive: z.boolean().optional(),
    campoPersonalizado3_necesitaValidacion: z.boolean().optional(),
    campoPersonalizado3_regexValidacion: CadenaOpcionalLimitada().nullable().optional(),
    campoPersonalizado3_tamanoTexto: z.enum(['text', 'textArea']).optional(),
    campoPersonalizado3_puedeModDirector: z.boolean().optional(),
    campoPersonalizado3_puedeModInteresado: z.boolean().optional(),
    
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
