import { z } from 'zod';
import { FirebaseIdSchema, CadenaOpcionalLimitada, FirestoreTimestampSchema } from './common';
import { IsoDateStringSchema } from './fechas';

/**
 * ComensalSchema: Representa la comida solicitada para un residente en un tiempo de comida.
 * Es la unidad atómica para Cocina y Contabilidad (Ticket de Comida).
 * Se genera automáticamente al cerrar/solicitar el día (Snapshot).
 */
export const ComensalSchema = z.object({
  id: FirebaseIdSchema,
  residenciaId: FirebaseIdSchema,
  usuarioComensalId: FirebaseIdSchema,
  usuarioDirectorId: FirebaseIdSchema,
  fecha: IsoDateStringSchema, // "YYYY-MM-DD"
  tiempoComidaId: FirebaseIdSchema,
  nombreTiempoComida: z.string(),
  alternativaId: FirebaseIdSchema,
  nombreAlternativa: z.string(),
  centroCostoId: FirebaseIdSchema,
  origen: z.enum(['SEMANARIO', 'EXCEPCION', 'ACTIVIDAD', 'ASISTENTE_INVITADOS', 'INVITADO_EXTERNO']),
  referenciaOrigenId: FirebaseIdSchema.optional(), // ID de la Excepcion o Actividad
  solicitadoAdministracion: z.boolean(),
  comentarioCocina: CadenaOpcionalLimitada(1,100).optional(), // Feedback específico de este plato
  fechaHoraCreacion: FirestoreTimestampSchema,
});
