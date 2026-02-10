import { z } from 'zod';
import { FirebaseIdSchema } from './common';

// ============================================
// Esquemas para ConfigContabilidad
// ============================================

export const ConfigContabilidadSchema = z.object({
    nombreEtiquetaCentroCosto: z.string().min(1).max(100).optional(),
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
    direccion: z.string().min(1).max(255).optional(),
    logoUrl: z.string().url().optional(),
    antelacionActividadesDefault: z.number().min(0).max(90).optional(),
    textProfile: z.string().optional(),
    tipoResidencia: z.enum(['estudiantes', 'profesionales', 'gente_mayor']),
    esquemaAdministracion: z.enum(['estricto', 'flexible']),
    zonaHoraria: z.string().min(1),
    
    // Nombres tradicionales para comidas (desayuno, almuerzo, cena)
    nombreTradicionalDesayuno: z.string().min(1).max(20).optional(),
    nombreTradicionalAlmuerzo: z.string().min(1).max(20).optional(),
    nombreTradicionalCena: z.string().min(1).max(20).optional(),
    
    // Nombres tradicionales para días de la semana
    nombreTradicionalLunes: z.string().min(1).max(20).optional(),
    nombreTradicionalMartes: z.string().min(1).max(20).optional(),
    nombreTradicionalMiercoles: z.string().min(1).max(20).optional(),
    nombreTradicionalJueves: z.string().min(1).max(20).optional(),
    nombreTradicionalViernes: z.string().min(1).max(20).optional(),
    nombreTradicionalSabado: z.string().min(1).max(20).optional(),
    nombreTradicionalDomingo: z.string().min(1).max(20).optional(),
    
    // Campos personalizables para UserProfile
    campoPersonalizado1_etiqueta: z.string().optional(),
    campoPersonalizado1_isActive: z.boolean().optional(),
    campoPersonalizado1_necesitaValidacion: z.boolean().optional(),
    campoPersonalizado1_regexValidacion: z.string().optional(),
    campoPersonalizado1_tamanoTexto: z.enum(['text', 'textArea']).optional(),
    campoPersonalizado1_puedeModDirector: z.boolean().optional(),
    campoPersonalizado1_puedeModInteresado: z.boolean().optional(),
    
    campoPersonalizado2_etiqueta: z.string().optional(),
    campoPersonalizado2_isActive: z.boolean().optional(),
    campoPersonalizado2_necesitaValidacion: z.boolean().optional(),
    campoPersonalizado2_regexValidacion: z.string().optional(),
    campoPersonalizado2_tamanoTexto: z.enum(['text', 'textArea']).optional(),
    campoPersonalizado2_puedeModDirector: z.boolean().optional(),
    campoPersonalizado2_puedeModInteresado: z.boolean().optional(),
    
    campoPersonalizado3_etiqueta: z.string().optional(),
    campoPersonalizado3_isActive: z.boolean().optional(),
    campoPersonalizado3_necesitaValidacion: z.boolean().optional(),
    campoPersonalizado3_regexValidacion: z.string().optional(),
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
    zonaHoraria: z.string().min(1),
    
    nombreTradicionalDesayuno: z.string().min(1).max(20).optional(),
    nombreTradicionalAlmuerzo: z.string().min(1).max(20).optional(),
    nombreTradicionalCena: z.string().min(1).max(20).optional(),
    
    nombreTradicionalLunes: z.string().min(1).max(20).optional(),
    nombreTradicionalMartes: z.string().min(1).max(20).optional(),
    nombreTradicionalMiercoles: z.string().min(1).max(20).optional(),
    nombreTradicionalJueves: z.string().min(1).max(20).optional(),
    nombreTradicionalViernes: z.string().min(1).max(20).optional(),
    nombreTradicionalSabado: z.string().min(1).max(20).optional(),
    nombreTradicionalDomingo: z.string().min(1).max(20).optional(),
    
    campoPersonalizado1_etiqueta: z.string().optional(),
    campoPersonalizado1_isActive: z.boolean().optional(),
    campoPersonalizado1_necesitaValidacion: z.boolean().optional(),
    campoPersonalizado1_regexValidacion: z.string().optional(),
    campoPersonalizado1_tamanoTexto: z.enum(['text', 'textArea']).optional(),
    campoPersonalizado1_puedeModDirector: z.boolean().optional(),
    campoPersonalizado1_puedeModInteresado: z.boolean().optional(),
    
    campoPersonalizado2_etiqueta: z.string().optional(),
    campoPersonalizado2_isActive: z.boolean().optional(),
    campoPersonalizado2_necesitaValidacion: z.boolean().optional(),
    campoPersonalizado2_regexValidacion: z.string().optional(),
    campoPersonalizado2_tamanoTexto: z.enum(['text', 'textArea']).optional(),
    campoPersonalizado2_puedeModDirector: z.boolean().optional(),
    campoPersonalizado2_puedeModInteresado: z.boolean().optional(),
    
    campoPersonalizado3_etiqueta: z.string().optional(),
    campoPersonalizado3_isActive: z.boolean().optional(),
    campoPersonalizado3_necesitaValidacion: z.boolean().optional(),
    campoPersonalizado3_regexValidacion: z.string().optional(),
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
    zonaHoraria: z.string().min(1).optional(),
    
    nombreTradicionalDesayuno: z.string().min(1).max(20).nullable().optional(),
    nombreTradicionalAlmuerzo: z.string().min(1).max(20).nullable().optional(),
    nombreTradicionalCena: z.string().min(1).max(20).nullable().optional(),
    
    nombreTradicionalLunes: z.string().min(1).max(20).nullable().optional(),
    nombreTradicionalMartes: z.string().min(1).max(20).nullable().optional(),
    nombreTradicionalMiercoles: z.string().min(1).max(20).nullable().optional(),
    nombreTradicionalJueves: z.string().min(1).max(20).nullable().optional(),
    nombreTradicionalViernes: z.string().min(1).max(20).nullable().optional(),
    nombreTradicionalSabado: z.string().min(1).max(20).nullable().optional(),
    nombreTradicionalDomingo: z.string().min(1).max(20).nullable().optional(),
    
    campoPersonalizado1_etiqueta: z.string().nullable().optional(),
    campoPersonalizado1_isActive: z.boolean().optional(),
    campoPersonalizado1_necesitaValidacion: z.boolean().optional(),
    campoPersonalizado1_regexValidacion: z.string().nullable().optional(),
    campoPersonalizado1_tamanoTexto: z.enum(['text', 'textArea']).optional(),
    campoPersonalizado1_puedeModDirector: z.boolean().optional(),
    campoPersonalizado1_puedeModInteresado: z.boolean().optional(),
    
    campoPersonalizado2_etiqueta: z.string().nullable().optional(),
    campoPersonalizado2_isActive: z.boolean().optional(),
    campoPersonalizado2_necesitaValidacion: z.boolean().optional(),
    campoPersonalizado2_regexValidacion: z.string().nullable().optional(),
    campoPersonalizado2_tamanoTexto: z.enum(['text', 'textArea']).optional(),
    campoPersonalizado2_puedeModDirector: z.boolean().optional(),
    campoPersonalizado2_puedeModInteresado: z.boolean().optional(),
    
    campoPersonalizado3_etiqueta: z.string().nullable().optional(),
    campoPersonalizado3_isActive: z.boolean().optional(),
    campoPersonalizado3_necesitaValidacion: z.boolean().optional(),
    campoPersonalizado3_regexValidacion: z.string().nullable().optional(),
    campoPersonalizado3_tamanoTexto: z.enum(['text', 'textArea']).optional(),
    campoPersonalizado3_puedeModDirector: z.boolean().optional(),
    campoPersonalizado3_puedeModInteresado: z.boolean().optional(),
    
    configuracionContabilidad: ConfigContabilidadSchema.nullable().optional(),
    estadoContrato: z.enum(['activo', 'prueba', 'inactivo']).optional(),
}).strict();

// ============================================
// Esquemas para Comedor
// ============================================

/**
 * Esquema base para Comedor (lectura)
 */
export const comedorSchema = z.object({
    id: FirebaseIdSchema,
    nombre: z.string().min(1).max(255),
    residenciaId: FirebaseIdSchema,
    descripcion: z.string().min(1).max(255).optional(),
    capacidad: z.number().int().positive().optional(),
    centroCostoPorDefectoId: FirebaseIdSchema.nullable().optional(),
}).strict();

/**
 * Esquema para CREATE Comedor
 */
export const createComedorSchema = z.object({
    nombre: z.string().min(1).max(255),
    residenciaId: FirebaseIdSchema,
    descripcion: z.string().min(1).max(255).optional(),
    capacidad: z.number().int().positive().optional(),
    centroCostoPorDefectoId: FirebaseIdSchema.nullable().optional(),
}).strict();

/**
 * Esquema para UPDATE Comedor
 */
export const updateComedorSchema = z.object({
    nombre: z.string().min(1).max(255).optional(),
    descripcion: z.string().min(1).max(255).nullable().optional(),
    capacidad: z.number().int().positive().nullable().optional(),
    centroCostoPorDefectoId: FirebaseIdSchema.nullable().optional(),
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
    descripcion: z.string().min(1).max(255).optional(),
    isDefault: z.boolean(),
    isActive: z.boolean(),
}).strict();

/**
 * Esquema para CREATE Dieta
 */
export const createDietaSchema = z.object({
    residenciaId: FirebaseIdSchema,
    nombre: z.string().min(1).max(255),
    descripcion: z.string().optional(),
    isDefault: z.boolean().default(false),
    isActive: z.boolean().default(true),
}).strict();

/**
 * Esquema para UPDATE Dieta
 */
export const updateDietaSchema = z.object({
    nombre: z.string().min(1).max(255).optional(),
    descripcion: z.string().nullable().optional(),
    isDefault: z.boolean().optional(),
    isActive: z.boolean().optional(),
}).strict();
