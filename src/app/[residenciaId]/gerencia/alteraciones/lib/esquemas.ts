import { z } from 'zod';
import { AlteracionDiariaSchema } from '../../../../../../shared/schemas/alteraciones';

export const CreateAlteracionDiariaSchema = AlteracionDiariaSchema.omit({ residenciaId: true });
export const UpdateAlteracionDiariaSchema = AlteracionDiariaSchema;

export type CreateAlteracionDiaria = z.infer<typeof CreateAlteracionDiariaSchema>;
export type UpdateAlteracionDiaria = z.infer<typeof UpdateAlteracionDiariaSchema>;
