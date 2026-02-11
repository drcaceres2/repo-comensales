import { z } from 'zod';
import { FirebaseIdSchema, CadenaOpcionalLimitada } from './common';

/**
 * Esquema base para Comedor (lectura)
 */
export const ComedorSchema = z.object({
    id: FirebaseIdSchema,
    nombre: z.string().min(1).max(50),
    residenciaId: FirebaseIdSchema,
    descripcion: z.string().optional(),
    capacidad: z.number().int().positive().optional(),
    centroCostoPorDefectoId: FirebaseIdSchema.nullable().optional(),
}).strict();

/**
 * Esquema para CREATE Comedor
 */
export const createComedorSchema = z.object({
    nombre: z.string().min(1).max(50),
    residenciaId: FirebaseIdSchema,
    descripcion: z.string().optional(),
    capacidad: z.number().int().positive().optional(),
    centroCostoPorDefectoId: FirebaseIdSchema.nullable().optional(),
}).strict();

/**
 * Esquema para UPDATE Comedor
 */
export const updateComedorSchema = z.object({
    nombre: z.string().min(1).max(50).optional(),
    descripcion: CadenaOpcionalLimitada(1, 255).nullable().optional(),
    capacidad: z.number().int().positive().nullable().optional(),
    centroCostoPorDefectoId: FirebaseIdSchema.nullable().optional(),
}).strict();
