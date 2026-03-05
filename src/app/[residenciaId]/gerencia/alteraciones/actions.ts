'use server';

import { db } from '@/lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
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

  const docRef = doc(db, `residencias/${residenciaId}/alteraciones`, newAlteracionData.fecha);
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

  const docRef = doc(db, `residencias/${residenciaId}/alteraciones`, fecha);
  await setDoc(docRef, updateData, { merge: true });
}
