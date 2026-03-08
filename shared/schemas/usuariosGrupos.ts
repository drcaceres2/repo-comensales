import { z } from "zod";
import { slugIdSchema } from "./common";
import { HoraIsoSchema } from "./fechas";

// 1. Catálogo de Restricciones
export const RestriccionCatalogoSchema = z.object({
  id: slugIdSchema, // ID único de la restricción, dentro del singleton de ConfiguracionResidencia
  nombre: z.string().min(3),
  reglasAlternativas: z.record(
    slugIdSchema, // ID de la alternativa
    z.enum(["BLOQUEADA", "REQUIERE_APROBACION"])
  ),
});
export type RestriccionCatalogo = z.infer<typeof RestriccionCatalogoSchema>;

// 2. Taxonomía de Grupos
const GrupoBaseSchema = z.object({
  id: slugIdSchema,
  nombre: z.string().min(3,"El nombre debe tener al menos tres caracteres"),
  estaActivo: z.boolean().default(true),
});
export type GrupoBase = z.infer<typeof GrupoBaseSchema>;

export const GrupoContableSchema = GrupoBaseSchema.extend({
  tipo: z.literal("CONTABLE"),
  centroCostoId: slugIdSchema,
});
export type GrupoContable = z.infer<typeof GrupoContableSchema>;

export const GrupoRestrictivoSchema = GrupoBaseSchema.extend({
  tipo: z.literal("RESTRICTIVO"),
  politicas: z.object({
    requiereConfirmacionAsistencia: z.boolean().default(false),
    requiereConfirmacionDiaria: z.boolean().default(false),
    horarioLimiteConfirmacion: HoraIsoSchema.optional(),
    requiereLocalizacionV2: z.boolean().default(false),
  }).superRefine((data, ctx) => {
    if (data.requiereConfirmacionDiaria && !data.horarioLimiteConfirmacion) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Exige horario límite.",
      });
    }
  }),
  restriccionesIds: z.array(slugIdSchema),
});
export type GrupoRestrictivo = z.infer<typeof GrupoRestrictivoSchema>;

export const GrupoAnaliticoSchema = GrupoBaseSchema.extend({
  tipo: z.literal("ANALITICO"),
});
export type GrupoAnalitico = z.infer<typeof GrupoAnaliticoSchema>;

export const GrupoUsuarioSchema = z.discriminatedUnion("tipo", [
  GrupoContableSchema,
  GrupoRestrictivoSchema,
  GrupoAnaliticoSchema,
]);
export type GrupoUsuario = z.infer<typeof GrupoUsuarioSchema>;

// Type Guards
export function isGrupoContable(grupo: GrupoUsuario): grupo is GrupoContable {
  return grupo.tipo === "CONTABLE";
}
export function isGrupoRestrictivo(grupo: GrupoUsuario): grupo is GrupoRestrictivo {
  return grupo.tipo === "RESTRICTIVO";
}
export function isGrupoAnalitico(grupo: GrupoUsuario): grupo is GrupoAnalitico {
  return grupo.tipo === "ANALITICO";
}
