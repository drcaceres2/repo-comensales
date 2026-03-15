'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/firebaseAdmin';
import { ComedorDataSchema } from 'shared/schemas/complemento1';
import * as admin from 'firebase-admin';
import { ZodError } from 'zod';
import { logServer } from 'shared/utils/serverUtils';
import { slugify } from 'shared/utils/commonUtils';
import { obtenerInfoUsuarioServer } from '@/lib/obtenerInfoUsuarioServer';
import { verificarPermisoGestionWrapper } from '@/lib/acceso-privilegiado';

type ActionState = {
    success: boolean;
    error?: string;
    validationErrors?: Record<string, string[]>;
};

function accesoDenegado(error = 'No tienes permisos para gestionar comedores.'): ActionState {
    return { success: false, error };
}

async function validarAccesoComedores(residenciaId: string): Promise<{
    autorizado: boolean;
    error?: string;
    usuarioId?: string;
    nivelAcceso?: 'Todas' | 'Propias' | 'Ninguna';
}> {
    const { usuarioId, residenciaId: residenciaSesion, roles } = await obtenerInfoUsuarioServer();

    if (!usuarioId) {
        return { autorizado: false, error: 'Sesion invalida o expirada.' };
    }

    const esMaster = roles?.includes('master');
    if (!esMaster && (!residenciaId || residenciaId !== residenciaSesion)) {
        return { autorizado: false, error: 'Acceso no autorizado para la residencia solicitada.' };
    }

    const acceso = await verificarPermisoGestionWrapper('gestionComedores');
    if (acceso.error) {
        return { autorizado: false, error: acceso.error };
    }

    if (!acceso.tieneAcceso || acceso.nivelAcceso === 'Ninguna') {
        return { autorizado: false, error: 'No tienes permisos para gestionar comedores.' };
    }

    return {
        autorizado: true,
        usuarioId,
        nivelAcceso: acceso.nivelAcceso,
    };
}

/**
 * Añade o actualiza un comedor en el mapa de comedores.
 */
export async function upsertComedor(
    residenciaId: string,
    editingId: string | null,
    data: unknown
): Promise<ActionState> {
    try {
        const validacionAcceso = await validarAccesoComedores(residenciaId);
        if (!validacionAcceso.autorizado) {
            return accesoDenegado(validacionAcceso.error);
        }

        const validatedData = ComedorDataSchema.parse(data);
        const id = editingId || slugify(validatedData.nombre);
        const usuarioId = validacionAcceso.usuarioId!;
        const nivelAcceso = validacionAcceso.nivelAcceso!;

        const configRef = db.collection('residencias').doc(residenciaId).collection('configuracion').doc('general');
        const configDoc = await configRef.get();
        const comedores = configDoc.data()?.comedores || {};
        const comedorActual = editingId ? comedores[editingId] : null;

        if (editingId && !comedorActual) {
            return { success: false, error: 'El comedor que intentas editar no existe.' };
        }

        if (nivelAcceso === 'Propias') {
            if (editingId && comedorActual?.creadoPor !== usuarioId) {
                return accesoDenegado('No puedes modificar comedores creados por otros usuarios.');
            }
        }

        const datosServidor = {
            ...validatedData,
            // Nunca confiar en `creadoPor` enviado por cliente.
            creadoPor: editingId
                ? (comedorActual?.creadoPor || usuarioId)
                : usuarioId,
        };

        if (!editingId && comedores[id]) {
            return { success: false, error: 'Ya existe un comedor con un nombre similar.' };
        }

        await configRef.set({
            comedores: {
                [id]: datosServidor
            }
        }, { merge: true });

        await logServer({
            action: editingId ? 'COMEDOR_ACTUALIZADO' : 'COMEDOR_CREADO',
            targetId: id,
            targetCollection: 'configuracion/general',
            residenciaId: residenciaId,
            details: {
                nombre: datosServidor.nombre,
                creadoPor: datosServidor.creadoPor,
                nivelAccesoEjecutor: nivelAcceso,
            }
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
        const validacionAcceso = await validarAccesoComedores(residenciaId);
        if (!validacionAcceso.autorizado) {
            return accesoDenegado(validacionAcceso.error);
        }

        const configRef = db.collection('residencias').doc(residenciaId).collection('configuracion').doc('general');
        const doc = await configRef.get();
        const comedores = doc.data()?.comedores || {};
        const comedorActual = comedores[id];

        if (!comedorActual) {
            return { success: false, error: 'El comedor que intentas eliminar no existe.' };
        }

        if (validacionAcceso.nivelAcceso === 'Propias' && comedorActual.creadoPor !== validacionAcceso.usuarioId) {
            return accesoDenegado('No puedes eliminar comedores creados por otros usuarios.');
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
            details: {
                id,
                creadoPor: comedorActual.creadoPor,
                nivelAccesoEjecutor: validacionAcceso.nivelAcceso,
            }
        });

        revalidatePath(`/${residenciaId}/admin/comedores`);
        return { success: true };
    } catch (error: any) {
        console.error('Error deleting comedor:', error);
        return { success: false, error: error.message || 'Ocurrió un error inesperado.' };
    }
}
