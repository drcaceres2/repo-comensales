import { z } from 'zod';
import {AuthIdSchema, SlugIdSchema} from './common';
import { FechaIsoSchema } from './fechas';
import { ConfiguracionAlternativaSchema } from './horarios';

// ------------------------------------------------------------------
// 1. Configuración Acoplada (Contrato de Riesgo Asumido)
// REGLA ESTRICTA: Cualquier campo nuevo añadido a ConfiguracionAlternativaSchema 
// en el futuro DEBE ser .optional() o tener .default() para no romper históricos.
// ------------------------------------------------------------------
export const ConfigAlternativaAjustadaSchema = ConfiguracionAlternativaSchema.pick({
    definicionAlternativaId: true,
    horarioSolicitudComidaId: true,
    ventanaServicio: true,
    comedorId: true,
    requiereAprobacion: true,
});

export type ConfigAlternativaAjustada = z.infer<typeof ConfigAlternativaAjustadaSchema>;

// ------------------------------------------------------------------
// 2. Afectación por Tiempo de Comida (Máquina de Estados y Puntero)
// ------------------------------------------------------------------
export const AfectacionTiempoComidaSchema = z.object({
    // Máquina de estados con cierre inmutable ('bloqueado')
    estado: z.enum(['propuesto', 'comunicado', 'revocado', 'bloqueado', 'cancelado']),
    
    // El contexto de la alteración, vital para la Vista Materializada
    motivo: z.string().min(5, "El motivo debe ser explícito para la auditoría y la UI"),
    
    // Puntero de Contingencia: Este ID DEBE existir como llave en 'alternativasDisponibles'.
    // Resuelve el problema del "fallback" sin romper el diccionario O(1).
    alternativaPorDefectoId: SlugIdSchema, 
    
    // Diccionario plano que reemplaza absolutamente las opciones del Singleton.
    // La llave es un ID único para esta configuración en esta alteración.
    alternativasDisponibles: z.record(SlugIdSchema, ConfigAlternativaAjustadaSchema),
    
    // Trazabilidad indispensable en modelos de comandos
    audit: z.object({
        creadoPor: AuthIdSchema,
        timestampActualizacion: z.number(),
    }).optional()
});

export type AfectacionTiempoComida = z.infer<typeof AfectacionTiempoComidaSchema>;

// ------------------------------------------------------------------
// 3. Documento Raíz: Alteracion Diaria (Comando / Write Model)
// Path Firestore: residencias/{residenciaId}/alteraciones/{YYYY-MM-DD}
// ------------------------------------------------------------------
export const AlteracionDiariaSchema = z.object({
    fecha: FechaIsoSchema, 
    residenciaId: SlugIdSchema,
    
    // La llave DEBE existir en el 'esquemaSemanal' del Singleton (ej. "almuerzo-domingo")
    tiemposComidaAfectados: z.record(SlugIdSchema, AfectacionTiempoComidaSchema),
});

export type AlteracionDiaria = z.infer<typeof AlteracionDiariaSchema>;
