"use server";

// Use Admin SDK on the server to bypass security rules for server actions
import { db as adminDb } from '@/lib/firebaseAdmin';
import { CreateAlteracionDiaria, UpdateAlteracionDiaria, CreateAlteracionDiariaSchema, UpdateAlteracionDiariaSchema } from './lib/esquemas';
import { AlteracionDiaria } from 'shared/schemas/alteraciones';

const ALTERACIONES_HORARIO_COLLECTION = 'alteracionesHorario';

const getAlteracionDiaDocPath = (residenciaId: string, fecha: string) =>
  `residencias/${residenciaId}/${ALTERACIONES_HORARIO_COLLECTION}/${fecha}`;

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

  // Remove any undefined values recursively to satisfy Firestore constraints
  function stripUndefined(obj: any): any {
    if (obj === undefined) return undefined;
    if (obj === null) return null;
    if (Array.isArray(obj)) return obj.map(stripUndefined);
    if (typeof obj === 'object') {
      const out: any = {};
      for (const [k, v] of Object.entries(obj)) {
        if (v === undefined) continue;
        const cleaned = stripUndefined(v);
        if (cleaned !== undefined) out[k] = cleaned;
      }
      return out;
    }
    return obj;
  }

  const cleaned = stripUndefined(newAlteracionData);

  const docRef = adminDb.doc(getAlteracionDiaDocPath(residenciaId, cleaned.fecha));
  await docRef.set(cleaned);

  return cleaned as AlteracionDiaria;
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

  function stripUndefined(obj: any): any {
    if (obj === undefined) return undefined;
    if (obj === null) return null;
    if (Array.isArray(obj)) return obj.map(stripUndefined);
    if (typeof obj === 'object') {
      const out: any = {};
      for (const [k, v] of Object.entries(obj)) {
        if (v === undefined) continue;
        const cleaned = stripUndefined(v);
        if (cleaned !== undefined) out[k] = cleaned;
      }
      return out;
    }
    return obj;
  }

  const cleanedUpdateData = stripUndefined({
    ...updateData,
    fecha,
    residenciaId,
  });

  const docRef = adminDb.doc(getAlteracionDiaDocPath(residenciaId, fecha));
  await docRef.set(cleanedUpdateData, { merge: true });
}

export async function deleteAlteracionDiaCommand(
  residenciaId: string,
  fecha: string
): Promise<void> {
  if (!fecha) {
    throw new Error("Delete operation requires a date.");
  }

  const docRef = adminDb.doc(getAlteracionDiaDocPath(residenciaId, fecha));
  await docRef.delete();
}

