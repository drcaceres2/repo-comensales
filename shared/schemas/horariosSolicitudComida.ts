import { z } from 'zod';
import { FirebaseIdSchema } from './common';
import { DiaDeLaSemanaSchema, HoraIsoSchema } from './fechas';

/**
 * @deprecated Este archivo se mantiene por compatibilidad.
 * Los horarios de solicitud de comida ahora están embebidos en ConfiguracionResidencia
 * como Record<HorarioSolicitudComidaId, HorarioSolicitudData>.
 * 
 * Usar HorarioSolicitudDataSchema de './comedor' (datos embebidos de configuración).
 */
export { HorarioSolicitudDataSchema } from './comedor';

// Re-export con alias para compatibilidad
import { HorarioSolicitudDataSchema } from './comedor';
export const HorarioSolicitudComidaSchema = HorarioSolicitudDataSchema;
