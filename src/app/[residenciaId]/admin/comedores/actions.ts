'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/firebaseAdmin';
import { ComedorDataSchema } from 'shared/schemas/complemento1';
import * as admin from 'firebase-admin';
import { obtenerInfoUsuarioServer } from "@/lib/obtenerInfoUsuarioServer";
import { verificarPermisoGestionWrapper } from "@/lib/acceso-privilegiado";
import { ZodError } from 'zod';
import { logServer } from 'shared/utils/commonUtils';
import { slugify } from 'shared/utils/commonUtils';

type ActionState = {
    success: boolean;
    error?: string;
    validationErrors?: Record<string, string[]>;
};

/**
 * Añade o actualiza un comedor en el mapa de comedores.
 */
export async function upsertComedor(
    residenciaId: string,
    editingId: string | null,
    data: unknown
): Promise<ActionState> {
    try {
        const auth = await obtenerInfoUsuarioServer();

        const resultadoAcceso = await verificarPermisoGestionWrapper('gestionComedores');

        if(resultadoAcceso.error) {
            return ({ success: false, error: resultadoAcceso.error })
        }

        if (!resultadoAcceso.tieneAcceso) {
            return { success: false, error: 'No tienes permiso para realizar esta acción.' };
        }

        const validatedData = ComedorDataSchema.parse(data);
        const id = editingId || slugify(validatedData.nombre);

        const configRef = db.collection('residencias').doc(residenciaId).collection('configuracion').doc('general');
        const configDoc = await configRef.get();
        const comedores = configDoc.data()?.comedores || {};

        if (!editingId && comedores[id]) {
            return { success: false, error: 'Ya existe un comedor con un nombre similar.' };
        }

        if (editingId && resultadoAcceso.nivelAcceso === 'Propias' && comedores[editingId]?.creadoPor !== auth.usuarioId) {
            return { success: false, error: 'No tienes permiso para editar este comedor.' };
        }

        await configRef.set({
            comedores: {
                [id]: validatedData
            }
        }, { merge: true });

        await logServer({
            action: editingId ? 'COMEDOR_ACTUALIZADO' : 'COMEDOR_CREADO',
            targetId: id,
            targetCollection: 'configuracion/general',
            residenciaId: residenciaId,
            details: { nombre: validatedData.nombre }
        });

        revalidatePath(`/${residenciaId}/admin/comedores`);
        return { success: true };
    } catch (error: any) {
        console.error('Error upserting comedor:', error);
        if (error instanceof ZodError) {
            return {
                success: false,
                error: 'Error de validación. Por favor, revisa los campos.',
                validationErrors: Object.fromEntries(
                    Object.entries(error.flatten().fieldErrors).filter(([, v]) => v)
                ) as Record<string, string[]>,
            };
        }
        return { success: false, error: error.message || 'Ocurrió un error inesperado.' };
    }
}

/**
 * Elimina un comedor del mapa.
 */
export async function deleteComedor(residenciaId: string, id: string): Promise<ActionState> {
    try {
        const auth = await obtenerInfoUsuarioServer();

        const resultadoAcceso = await verificarPermisoGestionWrapper('gestionComedores');

        if(resultadoAcceso.error) {
            return { success: false, error: resultadoAcceso.error };
        }

        const configRef = db.collection('residencias').doc(residenciaId).collection('configuracion').doc('general');
        const doc = await configRef.get();
        const comedores = doc.data()?.comedores || {};

        const puedeEliminar = resultadoAcceso.tieneAcceso &&
            (resultadoAcceso.nivelAcceso === 'Todas' || (resultadoAcceso.nivelAcceso === 'Propias' && comedores[id]?.creadoPor === auth.usuarioId));

        if (!puedeEliminar) {
            return { success: false, error: 'No tienes permiso para eliminar este comedor.' };
        }

        if (Object.keys(comedores).length <= 1) {
            return { success: false, error: 'No es posible eliminar el último comedor.' };
        }

        await configRef.update({
            [`comedores.${id}`]: admin.firestore.FieldValue.delete()
        });

        await logServer({
            action: 'COMEDOR_ELIMINADO',
            targetId: id,
            targetCollection: 'configuracion/general',
            residenciaId: residenciaId,
            details: { id }
        });

        revalidatePath(`/${residenciaId}/admin/comedores`);
        return { success: true };
    } catch (error: any) {
        console.error('Error deleting comedor:', error);
        return { success: false, error: error.message || 'Ocurrió un error inesperado.' };
    }
}
