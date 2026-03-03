'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
    CrearRecordatorioPayload,
    Recordatorio,
    RecordatorioSchema,
} from 'shared/schemas/recordatorios';
import { FirestoreIdSchema } from 'shared/schemas/common';
import { db, admin } from '@/lib/firebaseAdmin';
import { obtenerInfoUsuarioServer } from '@/lib/obtenerInfoUsuarioServer';

// --- Tipos de Retorno de la Acción ---
type ActionResponse<T> = {
    success: true;
    data: T;
} | {
    success: false;
    errors: z.ZodError<T>['formErrors'];
    message: string;
};

// ruta de la colección de recordatorios
const recordatoriosCollection = (residenciaId: string) =>
    db.collection(`residencias/${residenciaId}/recordatorios`);

/**
 * Crea un nuevo recordatorio en la base de datos.
 * Valida el payload entrante contra el esquema Zod antes de la inserción.
 * Si la validación falla, devuelve un objeto de error estructurado.
 */
export async function crearRecordatorio(
    residenciaId: string,
    payload: CrearRecordatorioPayload,
): Promise<ActionResponse<Recordatorio>> {
    // 1. verificación de usuario y residencia
    const { usuarioId: usuarioIniciadorId, residenciaId: userResidenciaId } =
        await obtenerInfoUsuarioServer();
    if (userResidenciaId !== residenciaId) {
        console.warn('crearRecordatorio: residenciaId no coincide con la sesión');
        return {
            success: false,
            errors: { formErrors: ['Acceso no autorizado.'], fieldErrors: {} },
            message: 'Acceso no autorizado.',
        };
    }

    // 2. generamos ID de documento antes de la validación
    const docRef = recordatoriosCollection(residenciaId).doc();

    const fullRecordatorio: Recordatorio = {
        ...payload,
        id: docRef.id,
        tipo: 'manual' as const,
        residenciaId,
        usuarioIniciadorId,
        estaActivo: true,
        // timestampCreacion será un Timestamp de servidor; z.any() acepta esto
        timestampCreacion: admin.firestore.FieldValue.serverTimestamp() as any,
    } as any; // lo casteamos porque FieldValue no es exactamente string, pero TimestampSchema es z.any()

    // 3. validación con Zod (TimestampSchema permite cualquier valor)
    const validation = RecordatorioSchema.safeParse(fullRecordatorio);
    if (!validation.success) {
        const flatErrors = validation.error.flatten();
        console.error('crearRecordatorio: validación fallida', flatErrors);
        return {
            success: false,
            errors: flatErrors,
            message: 'Error de validación del servidor. Por favor, revisa los campos.',
        };
    }

    // 4. escritura real en Firestore usando timestamp de servidor
    try {
        await docRef.set(fullRecordatorio as any);
    } catch (error) {
        console.error('crearRecordatorio: error al escribir en Firestore', error);
        return {
            success: false,
            errors: { formErrors: ['No se pudo guardar el recordatorio.'], fieldErrors: {} },
            message: 'Error de base de datos.',
        };
    }

    // 5. leemos el documento y convertimos Timestamp a ISO para serializar al cliente
    try {
        const writtenDoc = await docRef.get();
        const data = writtenDoc.data() as any;
        // Convertir Timestamp a ISO string para que sea serializable
        if (data && data.timestampCreacion && typeof data.timestampCreacion === 'object' && data.timestampCreacion.toDate) {
            data.timestampCreacion = data.timestampCreacion.toDate().toISOString();
        }
        return { success: true, data: data as Recordatorio };
    } catch (err) {
        console.warn('crearRecordatorio: no se pudo leer documento', err);
        // Fallback: convertir de ser necesario
        if (fullRecordatorio.timestampCreacion && typeof fullRecordatorio.timestampCreacion === 'object' && (fullRecordatorio.timestampCreacion as any).toDate) {
            fullRecordatorio.timestampCreacion = (fullRecordatorio.timestampCreacion as any).toDate().toISOString() as any;
        }
        return { success: true, data: fullRecordatorio as Recordatorio };
    } finally {
        revalidatePath(`/${residenciaId}/gerencia/recordatorios`);
    }
}

/**
 * Obtiene la lista de recordatorios activos de una residencia.
 * Se ejecuta en servidor para evitar bloqueos/configuración del SDK cliente.
 */
export async function obtenerRecordatorios(
    residenciaId: string,
): Promise<Recordatorio[]> {
    const { residenciaId: userResidenciaId } = await obtenerInfoUsuarioServer();
    if (!residenciaId || userResidenciaId !== residenciaId) {
        console.warn('obtenerRecordatorios: acceso no autorizado o residencia inválida');
        return [];
    }

    const snap = await recordatoriosCollection(residenciaId)
        .where('estaActivo', '==', true)
        .get();

    return snap.docs.map((doc) => {
        const data = doc.data() as any;
        if (data?.timestampCreacion?.toDate) {
            data.timestampCreacion = data.timestampCreacion.toDate().toISOString();
        }
        return {
            id: doc.id,
            ...data,
        } as Recordatorio;
    });
}

/**
 * Actualiza un recordatorio existente en la base de datos.
 * Si la validación falla, devuelve un objeto de error estructurado.
 */
export async function actualizarRecordatorio(
    residenciaId: string,
    payload: Recordatorio,
): Promise<ActionResponse<Recordatorio>> {
    // validación del esquema
    const validation = RecordatorioSchema.safeParse(payload);
    if (!validation.success) {
        const flatErrors = validation.error.flatten();
        console.error('actualizarRecordatorio: validación fallida', flatErrors);
        return {
            success: false,
            errors: flatErrors,
            message: 'Error de validación del servidor. Por favor, revisa los campos.',
        };
    }

    const validatedData = validation.data;
    const docRef = recordatoriosCollection(residenciaId).doc(validatedData.id);

    try {
        await docRef.set(validatedData, { merge: true });
    } catch (error) {
        console.error('actualizarRecordatorio: error al escribir en Firestore', error);
        return {
            success: false,
            errors: { formErrors: ['No se pudo actualizar el recordatorio.'], fieldErrors: {} },
            message: 'Error de base de datos.',
        };
    }

    // Convertir Timestamp a ISO string para que sea serializable
    try {
        const updated = await docRef.get();
        const data = updated.data() as any;
        if (data && data.timestampCreacion && typeof data.timestampCreacion === 'object' && data.timestampCreacion.toDate) {
            data.timestampCreacion = data.timestampCreacion.toDate().toISOString();
        }
        revalidatePath(`/${residenciaId}/gerencia/recordatorios`);
        return { success: true, data: data as Recordatorio };
    } catch (err) {
        console.warn('actualizarRecordatorio: no se pudo leer para serializar', err);
        // Fallback
        if (validatedData.timestampCreacion && typeof validatedData.timestampCreacion === 'object' && (validatedData.timestampCreacion as any).toDate) {
            validatedData.timestampCreacion = (validatedData.timestampCreacion as any).toDate().toISOString() as any;
        }
        revalidatePath(`/${residenciaId}/gerencia/recordatorios`);
        return { success: true, data: validatedData };
    }
}

/**
 * Realiza un borrado lógico (soft-delete) de un recordatorio.
 */
export async function desactivarRecordatorio(
    residenciaId: string,
    recordatorioId: string,
): Promise<ActionResponse<void>> {
    try {
        FirestoreIdSchema.parse(recordatorioId);
    } catch (error) {
        return {
            success: false,
            errors: { formErrors: ['ID de recordatorio inválido.'], fieldErrors: {} },
            message: 'ID de recordatorio inválido.',
        };
    }

    const docRef = recordatoriosCollection(residenciaId).doc(recordatorioId);
    try {
        await docRef.update({ estaActivo: false });
    } catch (error) {
        console.error('desactivarRecordatorio: error al actualizar', error);
        return {
            success: false,
            errors: { formErrors: ['No se pudo desactivar el recordatorio.'], fieldErrors: {} },
            message: 'Error de base de datos.',
        };
    }

    revalidatePath(`/${residenciaId}/gerencia/recordatorios`);
    return { success: true, data: undefined };
}
