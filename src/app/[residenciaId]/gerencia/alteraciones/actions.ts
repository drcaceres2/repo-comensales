'use server';

import { db, doc, setDoc } from '@/lib/firebase';
import { CreateAlteracionDiaria, UpdateAlteracionDiaria, CreateAlteracionDiariaSchema, UpdateAlteracionDiariaSchema } from './lib/esquemas';
import { AlteracionDiaria } from 'shared/schemas/alteraciones';

export async function createAlteracionCommand(
  residenciaId: string,
  data: CreateAlteracionDiaria
): Promise<AlteracionDiaria> {
  const validationResult = CreateAlteracionDiariaSchema.safeParse(data);

  if (!validationResult.success) {
    throw new Error(`Invalid data: ${validationResult.error.message}`);
  }

  const newAlteracionData = {
    ...validationResult.data,
    residenciaId,
  };

  const docRef = doc(db, `residencias/${residenciaId}/alteracionesHorario`, newAlteracionData.fecha);
  await setDoc(docRef, newAlteracionData);

  return newAlteracionData;
}

export async function updateAlteracion(
  residenciaId: string,
  data: UpdateAlteracionDiaria
): Promise<void> {
  const validationResult = UpdateAlteracionDiariaSchema.safeParse(data);

  if (!validationResult.success) {
    throw new Error(`Invalid data: ${validationResult.error.message}`);
  }

  const { fecha, ...updateData } = validationResult.data;

  if (!fecha) {
    throw new Error("Update operation requires a date.");
  }

  const docRef = doc(db, `residencias/${residenciaId}/alteracionesHorario`, fecha);
  await setDoc(docRef, updateData, { merge: true });
}
