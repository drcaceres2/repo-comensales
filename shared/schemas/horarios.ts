import { z } from 'zod';
import { CadenaOpcionalLimitada, slugIdSchema } from './common';
import { HoraIsoSchema, DiaDeLaSemanaSchema } from './fechas';

// ============================================
// HorarioSolicitudData (Embebido en ConfiguracionResidencia)
// ============================================

/**
 * HorarioSolicitudData: Datos de un horario de solicitud de comida.
 * Embebido como Record<HorarioSolicitudComidaId, HorarioSolicitudData>.
 */
export const HorarioSolicitudDataSchema = z.object({
    nombre: z.string().min(1).max(50),  // Este nombre se usa para construir el slug que sirve de ID semántico en singleton que contiene estos objetos embebidos. Es inmutable, si cambia el nombre, el ID permanece
    dia: DiaDeLaSemanaSchema,
    horaSolicitud: HoraIsoSchema,
    esPrimario: z.boolean().default(false),
    estaActivo: z.boolean().default(true),
}).strict();

// ============================================
// TiempoComida (Embebido en ConfiguracionResidencia.esquemaSemanal)
// ============================================

export const GrupoComidaSchema = z.object({
    nombre: z.string().min(1).max(20), // Este nombre se usa para construir el slug que sirve de ID semántico en singleton que contiene estos objetos embebidos. Es inmutable, si cambia el nombre, el ID permanece
    orden: z.number().int().nonnegative(),
    estaActivo: z.boolean().default(true),
});

/**
 * TiempoComida: Categoría operativa que representa la intersección 
 * entre un día de la semana y una comida (ej. "desayuno lunes").
 * Embebido como Record<TiempoComidaId, TiempoComida> en ConfiguracionResidencia.esquemaSemanal.
 */
export const TiempoComidaSchema = z.object({
    nombre: z.string().min(1).max(100), // Este nombre se usa para construir el slug que sirve de ID semántico en singleton que contiene estos objetos embebidos. Es inmutable, si cambia el nombre, el ID permanece

    grupoComida: slugIdSchema,
    dia: DiaDeLaSemanaSchema,
    horaReferencia: HoraIsoSchema,

    alternativas: z.object({
        principal: slugIdSchema, // Apunta a una ConfiguracionAlternativa
        secundarias: z.array(slugIdSchema).optional(), // Apunta a ConfiguracionesAlternativas
    }).strict(),

    estaActivo: z.boolean().default(true),
}).strict();



// ============================================
// DefinicionAlternativa (Catálogo global)
// ============================================

/**
 * DefinicionAlternativa: Define una alternativa de forma genérica.
 * Embebida como Record<AlternativaId, DefinicionAlternativa> en ConfiguracionResidencia.catalogoAlternativas.
 */
export const DefinicionAlternativaSchema = z.object({
    nombre: z.string().min(1).max(100), // Este nombre se usa para construir el slug que sirve de ID semántico en singleton que contiene estos objetos embebidos. Es inmutable, si cambia el nombre, el ID permanece
    grupoComida: slugIdSchema,
    descripcion: CadenaOpcionalLimitada(1, 255).optional(),
    tipo: z.enum(['comedor', 'para_llevar', 'comida_fuera', 'ayuno']),
    estaActiva: z.boolean().default(true),
}).strict();

// ============================================
// ConfiguracionAlternativa (Instanciación por día)
// ============================================

const VentanaServicioComidaSchema = z.object({
    horaInicio: HoraIsoSchema,
    horaFin: HoraIsoSchema,
    tipoVentana: z.enum(['normal', 'inicia_dia_anterior', 'termina_dia_siguiente']).default('normal')
}).strict();

/**
 * ConfiguracionAlternativa: Configuración específica de una alternativa para un día concreto.
 * Embebida como Record<ConfigAlternativaId, ConfiguracionAlternativa> en ConfiguracionResidencia.configuracionAlternativas.
 */
export const ConfiguracionAlternativaSchema = z.object({
    nombre: z.string().min(1).max(100), // Este nombre se usa para construir el slug que sirve de ID semántico en singleton que contiene estos objetos embebidos. Es inmutable, si cambia el nombre, el ID permanece
    
    // Coordenadas
    tiempoComidaId: slugIdSchema, // TiempoComidaId
    definicionAlternativaId: slugIdSchema, // DefinicionAlternativaId

    // Parámetros de Solicitud
    horarioSolicitudComidaId: slugIdSchema,
    comedorId: slugIdSchema.nullable().optional(),
    requiereAprobacion: z.boolean().default(false),

    // Parámetros de Horario
    ventanaServicio: VentanaServicioComidaSchema,
    estaActivo: z.boolean().default(true)
}).strict();


// Type exports

export type HorarioSolicitudData = z.infer<typeof HorarioSolicitudDataSchema>;

/**
 * TiemposComida
 * Los tiempos de comida son como "desayuno lunes, almuerzo lunes,
 * cena lunes, desayuno martes, almuerzo martes, etc."
 * (Combinación de dia de la semana con "desayuno", "almuerzo", "cena", etc.)
 */
export type TiempoComida = z.infer<typeof TiempoComidaSchema>;
export type GrupoComida = z.infer<typeof GrupoComidaSchema>;

/**
 * Alternativa
 * Distintas opciones de horario que el usuario escoge para cada tiempo de comida.
 * 
 * Dos interfaces la conforman: DefinicionAlternativa y ConfiguracionAlternativa.
 */
export type DefinicionAlternativa = z.infer<typeof DefinicionAlternativaSchema>;
export type ConfiguracionAlternativa = z.infer<typeof ConfiguracionAlternativaSchema>;
