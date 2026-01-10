'use server';

import * as admin from 'firebase-admin';
import { z } from 'zod';
import { formAction } from './formAction';

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

const HorarioSchema = z.object({
  residenciaId: z.string().min(1, 'Falta residenciaId'),
  id: z.string().optional(),
  nombre: z.string().min(1, 'El nombre es obligatorio').trim(),
  dia: z.string().min(1, 'El día es obligatorio'),
  horaSolicitud: z.string().min(1, 'La hora de solicitud es obligatoria'),
  isPrimary: z.string().transform(v => v === 'on' || v === 'true'),
  isActive: z.string().transform(v => v === 'on' || v === 'true'),
  isEditing: z.string().transform(v => v === 'true'),
  actorUserId: z.string().optional(),
});

export const horarioServerAction = formAction(HorarioSchema, async (data) => {
  const { residenciaId, id, nombre, dia, horaSolicitud, isPrimary, isActive, isEditing, actorUserId } = data;

  const db = admin.firestore();

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
});
