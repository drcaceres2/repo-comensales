'use server';

import { db } from '../../../lib/firebaseAdmin';
import { HorarioSolicitudComidaSchema } from '@/../shared/schemas/horariosSolicitudComida';
import { ZodError } from 'zod';

export type HorarioActionState = {
  result: { action: 'created' | 'updated' | 'deleted'; id: string } | null;
  error: ZodError | string | null;
};

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

export const horarioServerAction = async (
  prevState: HorarioActionState,
  formData: FormData
): Promise<HorarioActionState> => {
  try {
    const residenciaId = formData.get('residenciaId') as string;
    const id = formData.get('id') as string | '';
    const isEditing = formData.get('isEditing') === 'true';
    const actorUserId = formData.get('actorUserId') as string | null;

    const rawData: Partial<Payload> = {
      residenciaId,
      id: id || undefined,
      nombre: formData.get('nombre') as string,
      dia: formData.get('dia') as string,
      horaSolicitud: formData.get('horaSolicitud') as string,
      isPrimary: formData.get('isPrimary') === 'on' || formData.get('isPrimary') === 'true',
      isActive: formData.get('isActive') === 'on' || formData.get('isActive') === 'true',
    };

    // Validate basic structure
    if (!rawData.nombre || !rawData.dia || !rawData.horaSolicitud) {
      throw new Error('Campos requeridos faltantes: nombre, dia, horaSolicitud');
    }

    // Validate with schema
    const validatedData = HorarioSolicitudComidaSchema.pick({
      nombre: true,
      dia: true,
      horaSolicitud: true,
      isPrimary: true,
      isActive: true,
      residenciaId: true,
    }).parse(rawData);

    try {
      // If isPrimary, demote existing primary for same day
      if (validatedData.isPrimary) {
        const primQuery = db.collection('horariosSolicitudComida')
          .where('residenciaId', '==', residenciaId)
          .where('dia', '==', validatedData.dia)
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
          batch.update(ref, validatedData);
          await batch.commit();

          // Log the update
          await db.collection('logs').add({
            userId: actorUserId || 'SYSTEM',
            userEmail: actorUserId ? 'user@comensales' : 'system@internal',
            action: 'HORARIO_SOLICITUD_COMIDA_ACTUALIZADO',
            targetId: id,
            targetCollection: 'horariosSolicitudComida',
            residenciaId,
            details: { message: `Horario '${validatedData.nombre}' actualizado. Primario: ${validatedData.isPrimary}` },
            timestamp: new Date(),
            source: 'web-client'
          });

          return { result: { action: 'updated', id }, error: null };
        } else {
          // new doc
          const newRef = db.collection('horariosSolicitudComida').doc();
          batch.set(newRef, validatedData);
          await batch.commit();

          // Log the creation
          await db.collection('logs').add({
            userId: actorUserId || 'SYSTEM',
            userEmail: actorUserId ? 'user@comensales' : 'system@internal',
            action: 'HORARIO_SOLICITUD_COMIDA_CREADO',
            targetId: newRef.id,
            targetCollection: 'horariosSolicitudComida',
            residenciaId,
            details: { message: `Nuevo horario '${validatedData.nombre}' creado. Primario: ${validatedData.isPrimary}` },
            timestamp: new Date(),
            source: 'web-client'
          });

          return { result: { action: 'created', id: newRef.id }, error: null };
        }
      } else {
        // Not primary: simple create/update
        if (isEditing && id) {
          await db.collection('horariosSolicitudComida').doc(id).update(validatedData);

          // Log the update
          await db.collection('logs').add({
            userId: actorUserId || 'SYSTEM',
            userEmail: actorUserId ? 'user@comensales' : 'system@internal',
            action: 'HORARIO_SOLICITUD_COMIDA_ACTUALIZADO',
            targetId: id,
            targetCollection: 'horariosSolicitudComida',
            residenciaId,
            details: { message: `Horario '${validatedData.nombre}' actualizado. Primario: ${validatedData.isPrimary}` },
            timestamp: new Date(),
            source: 'web-client'
          });

          return { result: { action: 'updated', id }, error: null };
        } else {
          const ref = await db.collection('horariosSolicitudComida').add(validatedData);

          // Log the creation
          await db.collection('logs').add({
            userId: actorUserId || 'SYSTEM',
            userEmail: actorUserId ? 'user@comensales' : 'system@internal',
            action: 'HORARIO_SOLICITUD_COMIDA_CREADO',
            targetId: ref.id,
            targetCollection: 'horariosSolicitudComida',
            residenciaId,
            details: { message: `Nuevo horario '${validatedData.nombre}' creado. Primario: ${validatedData.isPrimary}` },
            timestamp: new Date(),
            source: 'web-client'
          });

          return { result: { action: 'created', id: ref.id }, error: null };
        }
      }
    } catch (dbErr) {
      console.error('Database error in horarioServerAction:', dbErr);
      throw dbErr;
    }
  } catch (err) {
    console.error('Error in horarioServerAction:', err);
    if (err instanceof ZodError) {
      return { result: null, error: err };
    }
    return { result: null, error: String(err) };
  }
};
