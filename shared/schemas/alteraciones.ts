import { z } from 'zod';

import {
  CadenaOpcionalLimitada,
  FirestoreIdSchema,
  slugIdSchema,
} from './common';
import { FechaIsoSchema } from './fechas';

export const EstadoAlteracionSchema = z.enum([
  'propuesto',
  'comunicado',
  'cancelado',
  'revocado',
]);

export const DetalleAlteracionSchema = z
  .object({
    opcionesActivas: z.array(slugIdSchema),
    contingenciaAlternativaId: slugIdSchema,
  })
  .strict();

export const AlteracionEntradaSchema = z
  .object({
    tiempoComidaId: slugIdSchema,
    detalle: DetalleAlteracionSchema,
  })
  .strict();

const AlteracionHorarioBaseSchema = z
  .object({
    id: FirestoreIdSchema,
    nombre: z.string().trim().min(1).max(120),
    descripcion: CadenaOpcionalLimitada(500),
    residenciaId: FirestoreIdSchema,
    autorId: FirestoreIdSchema,
    fechaInicio: FechaIsoSchema,
    fechaFin: FechaIsoSchema,
    alteraciones: z.array(AlteracionEntradaSchema).min(1),
    estado: EstadoAlteracionSchema,
  })
  .strict();

type AlteracionesArrayInput = Array<{
  tiempoComidaId: string;
  detalle: z.infer<typeof DetalleAlteracionSchema>;
}>;

type AlteracionConArray = {
  fechaInicio: string;
  fechaFin: string;
  alteraciones: AlteracionesArrayInput;
};

const superRefineAlteracionHorario = (
  data: AlteracionConArray,
  ctx: z.RefinementCtx
) => {
  if (data.fechaInicio > data.fechaFin) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'La fecha de fin debe ser posterior o igual a la fecha de inicio',
      path: ['fechaFin'],
    });
  }

  const vistos = new Set<string>();
  for (const [index, alteracion] of data.alteraciones.entries()) {
    if (vistos.has(alteracion.tiempoComidaId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'No se permiten tiempos de comida duplicados',
        path: ['alteraciones', index, 'tiempoComidaId'],
      });
    }
    vistos.add(alteracion.tiempoComidaId);
  }
};

const transformAlteracionesToRecord = (
  data: AlteracionConArray & {
    [key: string]: unknown;
  }
): Omit<typeof data, 'alteraciones'> & {
  alteraciones: Record<string, z.infer<typeof DetalleAlteracionSchema>>;
} => {
  const alteraciones = Object.fromEntries(
    data.alteraciones.map(({ tiempoComidaId, detalle }) => [
      tiempoComidaId,
      detalle,
    ])
  );

  return {
    ...data,
    alteraciones,
  };
};

export type AlteracionHorarioBaseInput = z.input<
  typeof AlteracionHorarioBaseSchema
>;

const AlteracionHorarioBaseRefinedSchema = AlteracionHorarioBaseSchema
  .superRefine(superRefineAlteracionHorario)
  .transform(transformAlteracionesToRecord);

export { AlteracionHorarioBaseRefinedSchema as AlteracionHorarioBaseSchema };

export const AlteracionHorarioSchema = AlteracionHorarioBaseRefinedSchema;

const createAlteracionCoreSchema = AlteracionHorarioBaseSchema.omit({
  id: true,
  estado: true,
});

export const createAlteracionSchema = createAlteracionCoreSchema
  .superRefine(superRefineAlteracionHorario)
  .transform(transformAlteracionesToRecord);

export type DetalleAlteracion = z.infer<typeof DetalleAlteracionSchema>;
export type AlteracionHorarioBase = z.infer<typeof AlteracionHorarioBaseRefinedSchema>;
export type AlteracionHorario = z.infer<typeof AlteracionHorarioSchema>;
export type CreateAlteracionInput = z.input<typeof createAlteracionSchema>;
export type CreateAlteracionPayload = z.infer<typeof createAlteracionSchema>;