import {z } from 'zod';
import { slugIdSchema, CadenaOpcionalLimitada } from "./common";


// Centro de Costo - Entidad principal de la contabilidad

export const CentroDeCostoDataSchema = z.object({
    codigoVisible: z.string().min(1).max(100),
    nombre: z.string().min(1).max(100),
    descripcion: CadenaOpcionalLimitada(1, 255).optional(),
    estaActivo: z.boolean(),
}).strict();

// ============================================
// ConfigContabilidad (Singleton por residencia)
// ============================================

export const ConfigContabilidadSchema = z.object({
    residenciaId: slugIdSchema,
    modeloClasificacion: z.enum(['por-usuario', 'por-grupo-usuario', 'por-comedor', 'detallada']).optional(),
    valorizacionComensales: z.boolean(),
    modoCosteo: z.enum(['general', 'por-grupo-tiempo-comida', 'por-tiempo-comida', 'detallado']).optional(),
    centrosDeCosto: z.record(slugIdSchema, CentroDeCostoDataSchema),
}).strict();
export const CONFIG_CONTABILIDAD_ID = "general";

// Exportación de tipos
export type CentroDeCostoData = z.infer<typeof CentroDeCostoDataSchema>;
export type ConfigContabilidad = z.infer<typeof ConfigContabilidadSchema>;


