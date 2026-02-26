'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/firebaseAdmin';
import { requireAuth } from '@/lib/serverAuth';
import { type ComedorData, ComedorDataSchema } from 'shared/schemas/complemento1';
import * as admin from 'firebase-admin';

/**
 * Los roles permitidos para gestionar comedores.
 */
const ALLOWED_ROLES = ['admin', 'director', 'asistente'];

async function validateAccess(userRoles: string[]) {
    if (!userRoles.some(role => ALLOWED_ROLES.includes(role))) {
        throw new Error('FORBIDDEN: No tienes permisos para gestionar comedores');
    }
}

/**
 * Obtiene el registro de comedores desde el singleton de configuración.
 */
export async function getComedores(residenciaId: string) {
    const auth = await requireAuth();
    if (auth.residenciaId !== residenciaId) {
        throw new Error('FORBIDDEN: No puedes acceder a datos de otra residencia');
    }
    await validateAccess(auth.roles);

    const configRef = db.collection('residencias').doc(residenciaId).collection('configuracion').doc('general');
    const doc = await configRef.get();

    if (!doc.exists) return {};

    const data = doc.data();
    return data?.comedores || {};
}

/**
 * Añade o actualiza un comedor en el mapa de comedores.
 */
export async function upsertComedor(residenciaId: string, id: string, data: unknown) {
    try {
        const auth = await requireAuth();
        if (auth.residenciaId !== residenciaId) {
            throw new Error('FORBIDDEN: No puedes modificar datos de otra residencia');
        }
        await validateAccess(auth.roles);

        const validatedData = ComedorDataSchema.parse(data);

        const configRef = db.collection('residencias').doc(residenciaId).collection('configuracion').doc('general');
        
        await configRef.update({
            [`comedores.${id}`]: validatedData
        });

        revalidatePath(`/${residenciaId}/admin/comedores`);
        return { success: true };
    } catch (error: any) {
        console.error('Error upserting comedor:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Elimina un comedor del mapa.
 */
export async function deleteComedor(residenciaId: string, id: string) {
    try {
        const auth = await requireAuth();
        if (auth.residenciaId !== residenciaId) {
            throw new Error('FORBIDDEN: No puedes modificar datos de otra residencia');
        }
        await validateAccess(auth.roles);

        const configRef = db.collection('residencias').doc(residenciaId).collection('configuracion').doc('general');
        const doc = await configRef.get();
        const configData = doc.data();
        const comedores = configData?.comedores || {};

        if (Object.keys(comedores).length <= 1) {
            return { success: false, error: 'No es posible eliminar el último comedor.' };
        }

        await configRef.update({
            [`comedores.${id}`]: admin.firestore.FieldValue.delete()
        });

        revalidatePath(`/${residenciaId}/admin/comedores`);
        return { success: true };
    } catch (error: any) {
        console.error('Error deleting comedor:', error);
        return { success: false, error: error.message };
    }
}
