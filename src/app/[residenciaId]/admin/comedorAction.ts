'use server';

import { db } from '../../../lib/firebaseAdmin'; // Tu nueva instancia centralizada
import { z } from 'zod';
import { formAction } from './formAction';

const ComedorSchema = z.object({
  residenciaId: z.string().min(1, 'Falta residenciaId'),
  id: z.string().optional(),
  nombre: z.string().min(1, 'El nombre del comedor es obligatorio').trim(),
  descripcion: z.string().optional(),
  capacidad: z.coerce.number().int().nonnegative().optional(),
  centroCostoPorDefectoId: z.string().optional(),
  isEditing: z.string().transform(v => v === 'true'),
});

export const comedorServerAction = formAction(ComedorSchema, async (data) => {
  const { residenciaId, id, nombre, descripcion, capacidad, centroCostoPorDefectoId, isEditing } = data;
  
  try {
    if (isEditing && id) {
      const ref = db.collection('comedores').doc(id);
      await ref.update({ nombre, descripcion, capacidad, centroCostoPorDefectoId, residenciaId });
      return { action: 'updated', id };
    } else {
      const ref = await db.collection('comedores').add({ nombre, descripcion, capacidad, centroCostoPorDefectoId, residenciaId });
      return { action: 'created', id: ref.id };
    }
  } catch (err) {
    console.error('Error in comedorAction:', err);
    throw err;
  }
});
