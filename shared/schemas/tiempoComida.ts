import { z } from 'zod';
import { FirebaseIdSchema } from './common';
import { DiaDeLaSemanaSchema, HoraIsoSchema } from './fechas';

// ============================================
// TiempoComida (Embebido en ConfiguracionResidencia.esquemaSemanal)
// ============================================

/**
 * TiempoComida: Categoría operativa que representa la intersección 
 * entre un día de la semana y una comida (ej. "desayuno lunes").
 * Embebido como Record<TiempoComidaId, TiempoComida> en ConfiguracionResidencia.esquemaSemanal.
 */
export const TiempoComidaSchema = z.object({
    nombre: z.string().min(1).max(100),
    residenciaId: FirebaseIdSchema,

    grupoComida: z.number().int().nonnegative(), // Índice de ConfiguracionResidencia.gruposComidas[]
    dia: DiaDeLaSemanaSchema,
    horaReferencia: HoraIsoSchema,

    alternativas: z.object({
        principal: FirebaseIdSchema, // ConfigAlternativaId
        secundarias: z.array(FirebaseIdSchema), // ConfigAlternativaId[]
    }).strict(),

    estaActivo: z.boolean(),
}).strict();

// Type export
export type TiempoComida = z.infer<typeof TiempoComidaSchema>;