import { z } from 'zod';
import { FirestoreIdSchema, CadenaOpcionalLimitada } from './common';
import { HoraIsoSchema, DiaDeLaSemanaSchema } from './fechas';

// ============================================
// HorarioSolicitudData (Embebido en ConfiguracionResidencia)
// ============================================

/**
 * HorarioSolicitudData: Datos de un horario de solicitud de comida.
 * Embebido como Record<HorarioSolicitudComidaId, HorarioSolicitudData>.
 */
export const HorarioSolicitudDataSchema = z.object({
    nombre: z.string().min(1).max(50),
    dia: DiaDeLaSemanaSchema,
    horaSolicitud: HoraIsoSchema,
    esPrimario: z.boolean(),
    estaActivo: z.boolean(),
}).strict();

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
    residenciaId: FirestoreIdSchema,

    grupoComida: z.number().int().nonnegative(), // Índice de ConfiguracionResidencia.gruposComidas[]
    dia: DiaDeLaSemanaSchema,
    horaReferencia: HoraIsoSchema,

    alternativas: z.object({
        principal: FirestoreIdSchema, // ConfigAlternativaId
        secundarias: z.array(FirestoreIdSchema), // ConfigAlternativaId[]
    }).strict(),

    estaActivo: z.boolean(),
}).strict();



// ============================================
// DefinicionAlternativa (Catálogo global)
// ============================================

/**
 * DefinicionAlternativa: Define una alternativa de forma genérica.
 * Embebida como Record<AlternativaId, DefinicionAlternativa> en ConfiguracionResidencia.catalogoAlternativas.
 */
export const DefinicionAlternativaSchema = z.object({
    nombre: z.string().min(1).max(100),
    descripcion: CadenaOpcionalLimitada(1, 255).optional(),
    tipo: z.enum(['comedor', 'para_llevar', 'comida_fuera', 'ayuno']),
    estaActiva: z.boolean(),
}).strict();

// ============================================
// ConfiguracionAlternativa (Instanciación por día)
// ============================================

const HorarioAlternativaSchema = z.object({
    horaInicio: HoraIsoSchema,
    iniciaDiaAnterior: z.boolean().optional(),
    horaFin: HoraIsoSchema,
    terminaDiaSiguiente: z.boolean().optional(),
}).strict();

/**
 * ConfiguracionAlternativa: Configuración específica de una alternativa para un día concreto.
 * Embebida como Record<ConfigAlternativaId, ConfiguracionAlternativa> en ConfiguracionResidencia.configuracionAlternativas.
 */
export const ConfiguracionAlternativaSchema = z.object({
    id: FirestoreIdSchema, // ID semántico: dia + slug alternativa

    // Coordenadas
    dia: DiaDeLaSemanaSchema,
    alternativa: FirestoreIdSchema, // AlternativaId

    // Parámetros de Solicitud
    horarioSolicitudComidaId: FirestoreIdSchema,
    comedorId: FirestoreIdSchema.nullable().optional(),
    requiereAprobacion: z.boolean(),

    // Parámetros de Horario
    horario: HorarioAlternativaSchema,
}).strict();



// Type exports
export type HorarioSolicitudData = z.infer<typeof HorarioSolicitudDataSchema>;
export type TiempoComida = z.infer<typeof TiempoComidaSchema>;
export type DefinicionAlternativa = z.infer<typeof DefinicionAlternativaSchema>;
export type ConfiguracionAlternativa = z.infer<typeof ConfiguracionAlternativaSchema>;
