import { z } from "zod";
import { AuthIdSchema, slugIdSchema } from "./common";

const GrupoIdNullableSchema = z.union([slugIdSchema, z.null()]);

export const AsignacionUsuarioMutacionSchema = z.object({
  usuarioId: AuthIdSchema,
  grupoContableId: GrupoIdNullableSchema,
  grupoRestrictivoId: GrupoIdNullableSchema,
  otrosGruposIds: z.array(slugIdSchema).max(20),
}).strict();

export const AsignacionMasivaUsuariosPayloadSchema = z.object({
  operacion: z.literal("ASIGNACION_MASIVA"),
  mutaciones: z.array(AsignacionUsuarioMutacionSchema).max(5000),
}).strict();

export type AsignacionUsuarioMutacion = z.infer<typeof AsignacionUsuarioMutacionSchema>;
export type AsignacionMasivaUsuariosPayload = z.infer<typeof AsignacionMasivaUsuariosPayloadSchema>;
