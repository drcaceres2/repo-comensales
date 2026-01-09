'use server';

import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

type Payload = {
  residenciaId: string;
  id?: string;
  nombre: string;
  dia: string;
  horaSolicitud: string;
  isPrimary: boolean;
  isActive: boolean;
  actorUserId?: string | null;
};

export async function horarioAction(formData: FormData) {
  const residenciaId = formData.get('residenciaId')?.toString();
  const id = formData.get('id')?.toString();
  const nombre = formData.get('nombre')?.toString()?.trim();
  const dia = formData.get('dia')?.toString();
  const horaSolicitud = formData.get('horaSolicitud')?.toString();
  const isPrimary = formData.get('isPrimary') === 'on' || formData.get('isPrimary') === 'true';
  const isActive = formData.get('isActive') === 'on' || formData.get('isActive') === 'true';
  const isEditing = formData.get('isEditing') === 'true';
  const actorUserId = formData.get('actorUserId')?.toString() || null;

  if (!residenciaId) throw new Error('Falta residenciaId');
  if (!nombre) throw new Error('El nombre es obligatorio');
  if (!dia) throw new Error('El día es obligatorio');
  if (!horaSolicitud) throw new Error('La hora de solicitud es obligatoria');

  try {
    // If isPrimary, demote existing primary for same day
    if (isPrimary) {
      const primQuery = db.collection('horariosSolicitudComida')
        .where('residenciaId', '==', residenciaId)
        .where('dia', '==', dia)
        .where('isPrimary', '==', true)
        .where('isActive', '==', true);
      const primSnap = await primQuery.get();
      const batch = db.batch();
      primSnap.forEach(docSnap => {
        if (!id || docSnap.id !== id) {
          batch.update(docSnap.ref, { isPrimary: false });
        }
      });

      if (isEditing && id) {
        const ref = db.collection('horariosSolicitudComida').doc(id);
        batch.update(ref, { nombre, dia, horaSolicitud, isPrimary, isActive, residenciaId });
        await batch.commit();
        // write log
        await db.collection('logs').add({
          userId: actorUserId || null,
          actionType: 'horario_solicitud',
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          residenciaId,
          details: `Horario '${nombre}' (ID: ${id}) actualizado. Primario: ${isPrimary}.`,
        });
        return { action: 'updated', id };
      } else {
        // new doc
        const newRef = db.collection('horariosSolicitudComida').doc();
        batch.set(newRef, { nombre, dia, horaSolicitud, isPrimary, isActive, residenciaId });
        await batch.commit();
        await db.collection('logs').add({
          userId: actorUserId || null,
          actionType: 'horario_solicitud',
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          residenciaId,
          details: `Horario '${nombre}' (ID: ${newRef.id}) creado. Primario: ${isPrimary}.`,
        });
        return { action: 'created', id: newRef.id };
      }
    } else {
      // Not primary: simple create/update
      if (isEditing && id) {
        await db.collection('horariosSolicitudComida').doc(id).update({ nombre, dia, horaSolicitud, isPrimary, isActive, residenciaId });
        await db.collection('logs').add({
          userId: actorUserId || null,
          actionType: 'horario_solicitud',
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          residenciaId,
          details: `Horario '${nombre}' (ID: ${id}) actualizado. Primario: ${isPrimary}.`,
        });
        return { action: 'updated', id };
      } else {
        const ref = await db.collection('horariosSolicitudComida').add({ nombre, dia, horaSolicitud, isPrimary, isActive, residenciaId });
        await db.collection('logs').add({
          userId: actorUserId || null,
          actionType: 'horario_solicitud',
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          residenciaId,
          details: `Horario '${nombre}' (ID: ${ref.id}) creado. Primario: ${isPrimary}.`,
        });
        return { action: 'created', id: ref.id };
      }
    }
  } catch (err) {
    console.error('Error in horarioAction:', err);
    throw err;
  }
}
