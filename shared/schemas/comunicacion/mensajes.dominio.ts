import { z } from 'zod';
import { 
  OptionalFirestoreIdSchema, 
  AuthIdSchema, 
  SlugIdSchema, 
  TimestampSchema
} from '../common';
import { FechaIsoSchema } from '../fechas';

// ==========================================
// 1. MÁQUINA DE ESTADOS Y TIPIFICACIÓN
// ==========================================

// Máquina de estados mínima. 
// 'resuelto' indica que la acción requerida (ej. aprobar) ya se hizo.
export const EstadoMensajeSchema = z.enum([
  'no_leido', 
  'leido', 
  'resuelto', 
  'archivado'
]);

// Cerrar las opciones de asunto facilita métricas y automatización de UI.
export const AsuntoMensajeSchema = z.enum([
  'solicitud_aprobacion',       // Residente pide que le aprueben una comida
  'justificacion_ausencia',     // Residente explica por qué no estará
  'modificacion_directiva',     // Director avisa que le cambió el horario
  'rechazo_solicitud',          // Director avisa por qué no aprobó
  'duda_operativa',             // Preguntas generales del horario
  'otro'
]);

// Tipo de entidad a la que hace referencia el mensaje (para Deep Linking)
export const TipoEntidadReferenciaSchema = z.enum([
  'excepcion', 
  'ausencia', 
  'actividad', 
  'semanario'
]);

// ==========================================
// 2. ESQUEMA PRINCIPAL
// ==========================================
export const MensajeSchema = z.object({
  id: OptionalFirestoreIdSchema,
  residenciaId: SlugIdSchema,
  
  // Actores
  remitenteId: AuthIdSchema,
  remitenteRol: z.enum(['residente', 'director', 'asistente', 'sistema']), 
  destinatarioId: AuthIdSchema.nullable(), // Si es null, va a la "Bandeja General" de la administración
  
  // Contenido
  asunto: AsuntoMensajeSchema,
  cuerpo: z.string().min(1).max(500, "El mensaje debe ser conciso (máx. 500 caracteres)"),
  
  // Estado
  estado: EstadoMensajeSchema.default('no_leido'),
  
  // Contexto Accionable (Deep Link)
  // Ej: Si el residente justifica una excepción, aquí va el ID y fecha de esa excepción.
  referenciaContexto: z.object({
    tipoEntidad: TipoEntidadReferenciaSchema,
    entidadId: z.string(), // Puede ser el ID de la excepción o el slug del tiempo de comida
    fechaAfectada: FechaIsoSchema.optional(), // Ayuda a renderizar sin hacer un JOIN extra
  }).optional(),
  
  // Auditoría
  timestampCreacion: TimestampSchema.optional(),
  timestampLectura: TimestampSchema.optional(),
  timestampResolucion: TimestampSchema.optional(),
}).strict();

export type Mensaje = z.infer<typeof MensajeSchema>;