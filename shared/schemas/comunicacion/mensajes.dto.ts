import { z } from "zod";
import { AsuntoMensajeSchema, EstadoMensajeSchema, TipoEntidadReferenciaSchema } from "./mensajes.dominio";
import { AuthIdSchema, FirestoreIdSchema, SlugIdSchema } from "../common";
import { FechaIsoSchema } from "../fechas";

export const GRUPO_TECNICO_DIRECCION_GENERAL = 'direccion-general' as const;

const FormNuevoMensajeBaseSchema = z.object({
  asunto: AsuntoMensajeSchema,
  cuerpo: z.string().min(5, "Añade un poco más de detalle.").max(500),
  referenciaContexto: z.object({
    tipoEntidad: TipoEntidadReferenciaSchema,
    entidadId: z.string(),
    fechaAfectada: FechaIsoSchema,
  }).optional(),
});

export const FormNuevoMensajeSchema = z.discriminatedUnion('destinoTipo', [
  FormNuevoMensajeBaseSchema.extend({
    destinoTipo: z.literal('usuario'),
    destinatarioUsuarioId: AuthIdSchema,
  }).strict(),
  FormNuevoMensajeBaseSchema.extend({
    destinoTipo: z.literal('grupo'),
    destinatarioGrupoAnaliticoId: SlugIdSchema,
  }).strict(),
]);

export const CambiarEstadoMensajeSchema = z.object({
  mensajeId: FirestoreIdSchema,
  estado: EstadoMensajeSchema.extract(['leido', 'archivado']),
}).strict();

export const ResolverGrupoDestinoSchema = z.object({
  grupoId: SlugIdSchema,
}).strict();

export type FormNuevoMensaje = z.infer<typeof FormNuevoMensajeSchema>;
export type CambiarEstadoMensaje = z.infer<typeof CambiarEstadoMensajeSchema>;

