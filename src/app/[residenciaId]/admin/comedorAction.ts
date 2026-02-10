'use server';

import { db } from '../../../lib/firebaseAdmin';
import { createComedorSchema, updateComedorSchema } from '@/../shared/schemas/comedor';
import { ZodError } from 'zod';

export type ComedorActionState = {
  result: { action: 'created' | 'updated'; id: string } | null;
  error: ZodError | string | null;
};

export const comedorServerAction = async (
  prevState: ComedorActionState, 
  formData: FormData
): Promise<ComedorActionState> => {
  try {
    const residenciaId = formData.get('residenciaId') as string;
    const id = formData.get('id') as string | '';
    const isEditing = formData.get('isEditing') === 'true';
    const actorUserId = formData.get('actorUserId') as string | null;

    const rawData = {
      nombre: formData.get('nombre') as string,
      descripcion: formData.get('descripcion') as string,
      capacidad: formData.get('capacidad') ? parseInt(formData.get('capacidad') as string, 10) : undefined,
      centroCostoPorDefectoId: formData.get('centroCostoPorDefectoId') || null,
      residenciaId,
    };

    // Validate using appropriate schema
    let validatedData;
    if (isEditing && id) {
      // For updates, allow partial data
      const updateData = Object.fromEntries(
        Object.entries(rawData).filter(([_, v]) => v !== undefined)
      );
      validatedData = updateComedorSchema.parse(updateData);
    } else {
      // For creation, require all fields
      validatedData = createComedorSchema.parse(rawData);
    }

    if (isEditing && id) {
      // Update existing comedor
      const ref = db.collection('comedores').doc(id);
      await ref.update(validatedData);

      // Log the update action using Firestore Admin
      await db.collection('logs').add({
        userId: actorUserId || 'SYSTEM',
        userEmail: actorUserId ? 'user@comensales' : 'system@internal',
        action: 'COMEDOR_ACTUALIZADO',
        targetId: id,
        targetCollection: 'comedores',
        residenciaId,
        details: { message: `Comedor '${validatedData.nombre}' actualizado desde admin panel` },
        timestamp: new Date(),
        source: 'web-client'
      });

      return { result: { action: 'updated', id }, error: null };
    } else {
      // Create new comedor
      const ref = await db.collection('comedores').add(validatedData);

      // Log the creation action using Firestore Admin
      await db.collection('logs').add({
        userId: actorUserId || 'SYSTEM',
        userEmail: actorUserId ? 'user@comensales' : 'system@internal',
        action: 'COMEDOR_CREADO',
        targetId: ref.id,
        targetCollection: 'comedores',
        residenciaId,
        details: { message: `Nuevo comedor '${validatedData.nombre}' creado desde admin panel` },
        timestamp: new Date(),
        source: 'web-client'
      });

      return { result: { action: 'created', id: ref.id }, error: null };
    }
  } catch (err) {
    console.error('Error in comedorServerAction:', err);
    if (err instanceof ZodError) {
      return { result: null, error: err };
    }
    return { result: null, error: String(err) };
  }
};
