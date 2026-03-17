### BLUEPRINT 3: Esquemas de Integridad (Zod Base Refactorizado)

```TypeScript
// 1. EL CATÁLOGO DE RESTRICCIONES (Diccionario B)
export const RestriccionCatalogoSchema = z.object({
  id: z.string().uuid(),
  nombre: z.string().min(3),
  reglasAlternativas: z.record(
    z.string().uuid("ID de la Alternativa"), 
    z.enum(["BLOQUEADA", "REQUIERE_APROBACION"])
  ),
});

// 2. LA TAXONOMÍA DE GRUPOS (Diccionario A)
const GrupoBaseSchema = z.object({
  id: z.string().uuid(),
  nombre: z.string().min(3),
  activo: z.boolean().default(true),
});

export const GrupoContableSchema = GrupoBaseSchema.extend({
  tipo: z.literal("CONTABLE"),
  centroCostoCodigo: z.string().min(1),
  centroCostoNombre: z.string().min(1),
});

export const GrupoRestrictivoSchema = GrupoBaseSchema.extend({
  tipo: z.literal("RESTRICTIVO"),
  
  // A. Políticas de Flujo (Comportamiento)
  politicas: z.object({
    requiereConfirmacionAsistencia: z.boolean().default(false),
    requiereConfirmacionDiaria: z.boolean().default(false),
    horarioLimiteConfirmacion: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional(),
    requiereLocalizacionV2: z.boolean().default(false),
  }).superRefine((data, ctx) => {
    if (data.requiereConfirmacionDiaria && !data.horarioLimiteConfirmacion) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Exige horario límite." });
    }
  }),

  // B. Enlace al Catálogo (Disponibilidad)
  restriccionesIds: z.array(z.string().uuid("ID de restricción del catálogo")),
});

export const GrupoAnaliticoSchema = GrupoBaseSchema.extend({
  tipo: z.literal("ANALITICO"),
});

export const GrupoUsuarioSchema = z.discriminatedUnion("tipo", [
  GrupoContableSchema, GrupoRestrictivoSchema, GrupoAnaliticoSchema
]);
```