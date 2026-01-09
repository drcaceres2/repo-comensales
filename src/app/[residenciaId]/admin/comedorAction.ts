'use server';

import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

export async function comedorAction(formData: FormData) {
  const residenciaId = formData.get('residenciaId')?.toString();
  const id = formData.get('id')?.toString();
  const nombre = formData.get('nombre')?.toString()?.trim();
  const descripcion = formData.get('descripcion')?.toString() || '';
  const capacidadStr = formData.get('capacidad')?.toString() || '0';
  const capacidad = parseInt(capacidadStr, 10) || 0;
  const centroCostoPorDefectoId = formData.get('centroCostoPorDefectoId')?.toString() || null;
  const isEditing = formData.get('isEditing') === 'true';

  if (!residenciaId) {
    throw new Error('Falta residenciaId');
  }
  if (!nombre) {
    throw new Error('El nombre del comedor es obligatorio');
  }

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
}
