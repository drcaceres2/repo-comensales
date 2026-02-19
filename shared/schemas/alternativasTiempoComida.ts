import { z } from 'zod';
import { FirebaseIdSchema, CadenaOpcionalLimitada } from './common';
import { HoraIsoSchema, DiaDeLaSemanaSchema } from './fechas';

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
    id: FirebaseIdSchema, // ID semántico: dia + slug alternativa

    // Coordenadas
    dia: DiaDeLaSemanaSchema,
    alternativa: FirebaseIdSchema, // AlternativaId

    // Parámetros de Solicitud
    horarioSolicitudComidaId: FirebaseIdSchema,
    comedorId: FirebaseIdSchema.nullable().optional(),
    requiereAprobacion: z.boolean(),

    // Parámetros de Horario
    horario: HorarioAlternativaSchema,
}).strict();

// Type exports
export type DefinicionAlternativa = z.infer<typeof DefinicionAlternativaSchema>;
export type ConfiguracionAlternativa = z.infer<typeof ConfiguracionAlternativaSchema>;
