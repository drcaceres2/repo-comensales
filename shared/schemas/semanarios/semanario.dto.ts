import { z } from 'zod';
import { AuthIdSchema, TimestampStringSchema } from '../common';
import { SemanaIsoSchema } from '../fechas';
import { SemanarioUsuarioSchema } from '../elecciones/domain.schema';

export const SemanarioReadDTOSchema = z.object({
  usuarioId: AuthIdSchema,
  semanarios: z.record(SemanaIsoSchema, SemanarioUsuarioSchema),
  updatedAt: TimestampStringSchema,
}).strict();

export const UpsertSemanarioPayloadSchema = z.object({
  usuarioId: AuthIdSchema,
  semanaIsoEfectiva: SemanaIsoSchema,
  semanario: SemanarioUsuarioSchema,
  lastUpdatedAt: TimestampStringSchema,
}).strict();

export type SemanarioReadDTO = z.infer<typeof SemanarioReadDTOSchema>;
export type UpsertSemanarioPayload = z.infer<typeof UpsertSemanarioPayloadSchema>;
