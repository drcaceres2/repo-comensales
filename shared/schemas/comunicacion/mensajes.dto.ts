import { z } from "zod";
import { MensajeSchema, AsuntoMensajeSchema, TipoEntidadReferenciaSchema } from "./mensajes.dominio";
import { FechaIsoSchema } from "../fechas";

export const FormNuevoMensajeSchema = z.object({
  asunto: AsuntoMensajeSchema,
  cuerpo: z.string().min(5, "Añade un poco más de detalle.").max(500),
  // El frontend adjunta esto automáticamente si el residente 
  // hace clic en "Enviar mensaje al director" desde el Drawer de una Excepción.
  referenciaContexto: z.object({
    tipoEntidad: TipoEntidadReferenciaSchema,
    entidadId: z.string(),
    fechaAfectada: FechaIsoSchema,
  }).optional(),
}).strict();