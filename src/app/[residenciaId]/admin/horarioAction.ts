'use server';

import { db } from '../../../lib/firebaseAdmin';
import { HorarioSolicitudComidaSchema } from '@/../shared/schemas/horariosSolicitudComida';
import { ZodError } from 'zod';
import { Comedor, HorarioSolicitudComida } from '@/../shared/models/types';
import { requireAuth } from '../../../lib/serverAuth';

export async function getCatalogosParaCargaHorarios(): Promise<{ comedores: Comedor[], horarios: HorarioSolicitudComida[] }> {
  try {
    const { residenciaId } = await requireAuth();

    if (!residenciaId) {
      throw new Error("residenciaId no fue provisto");
    }

    const comedoresPromise = db.collection('comedores')
      .where('residenciaId', '==', residenciaId)
      .orderBy('nombre')
      .get();

    const horariosPromise = db.collection('horariosSolicitudComida')
      .where('residenciaId', '==', residenciaId)
      .orderBy('dia')
      .orderBy('horaSolicitud')
      .get();

    const [comedoresSnapshot, horariosSnapshot] = await Promise.all([
      comedoresPromise,
      horariosPromise
    ]);

    const comedores = comedoresSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Comedor[];
    const horarios = horariosSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as HorarioSolicitudComida[];

    // Serialización simple: Los datos de Firestore ya son serializables si no contienen Timestamps complejos, etc.
    // En este caso, Comedor y HorarioSolicitudComida deberían ser seguros.
    return { comedores, horarios };

  } catch (error) {
    console.error("Error fetching catalogs for carga masiva:", error);
    // En lugar de retornar un objeto con error, lanzamos el error para que sea capturado por el `try-catch` del cliente.
    throw new Error('No se pudieron cargar los catálogos desde el servidor.');
  }
}


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
    const { residenciaId, uid, email } = await requireAuth();
    
    const id = formData.get('id') as string | '';
    const isEditing = formData.get('isEditing') === 'true';

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
            userId: uid,
            userEmail: email,
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
            userId: uid,
            userEmail: email,
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
            userId: uid,
            userEmail: email,
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
            userId: uid,
            userEmail: email,
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
