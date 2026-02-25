import {z } from 'zod';
import { slugIdSchema, CadenaOpcionalLimitada } from "./common";

// Centro de Costo - Entidad principal de la contabilidad

export const CentroDeCostoSchema = z.object({
    id: slugIdSchema,
    codigoVisible: z.string().min(1).max(50),
    nombre: z.string().min(1).max(100),
    descripcion: CadenaOpcionalLimitada(1, 255).optional(),
    estaActivo: z.boolean().default(true),
}).strict();

// ============================================
// ConfigContabilidad (Singleton por residencia)
// ============================================

export const ConfigContabilidadSchema = z.object({
    residenciaId: slugIdSchema,
    modeloClasificacion: z.enum(['por-usuario', 'por-grupo-usuario', 'por-comedor', 'detallada']).optional(),
    valorizacionComensales: z.boolean(),
    modoCosteo: z.enum(['general', 'por-grupo-tiempo-comida', 'por-tiempo-comida', 'detallado']).optional(),
}).strict();
export const CONFIG_CONTABILIDAD_ID = "general";

// Exportación de tipos
export type CentroDeCosto = z.infer<typeof CentroDeCostoSchema>;
export type ConfigContabilidad = z.infer<typeof ConfigContabilidadSchema>;


