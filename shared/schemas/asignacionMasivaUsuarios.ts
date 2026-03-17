
import { z } from "zod";
import { AuthIdSchema, SlugIdSchema } from "./common";

const GrupoIdNullableSchema = z.union([SlugIdSchema, z.null()]);

// Preprocess para aceptar '' o undefined y normalizar arrays y nulls venidos del cliente
export const AsignacionUsuarioMutacionSchema = z.preprocess((val) => {
  if (typeof val !== 'object' || val === null) return val;
  const v: any = val as any;
  return {
    usuarioId: v.usuarioId,
    grupoContableId: v.grupoContableId === '' ? null : (v.grupoContableId ?? null),
    grupoRestrictivoId: v.grupoRestrictivoId === '' ? null : (v.grupoRestrictivoId ?? null),
    otrosGruposIds: Array.isArray(v.otrosGruposIds) ? v.otrosGruposIds.filter((x: any) => x != null && x !== '').map(String) : [],
  };
}, z.object({
  usuarioId: AuthIdSchema,
  grupoContableId: GrupoIdNullableSchema,
  grupoRestrictivoId: GrupoIdNullableSchema,
  otrosGruposIds: z.array(SlugIdSchema).max(20),
}).strict());

export const AsignacionMasivaUsuariosPayloadSchema = z.object({
  operacion: z.literal("ASIGNACION_MASIVA"),
  mutaciones: z.array(AsignacionUsuarioMutacionSchema).max(5000),
}).strict();

export type AsignacionUsuarioMutacion = z.infer<typeof AsignacionUsuarioMutacionSchema>;
export type AsignacionMasivaUsuariosPayload = z.infer<typeof AsignacionMasivaUsuariosPayloadSchema>;
