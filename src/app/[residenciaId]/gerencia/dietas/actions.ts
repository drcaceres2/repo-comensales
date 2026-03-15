'use server';

import { revalidatePath } from 'next/cache';
import { db, FieldValue } from '@/lib/firebaseAdmin';
import { obtenerInfoUsuarioServer } from '@/lib/obtenerInfoUsuarioServer';
import { ActionResponse, DietaId, ResidenciaId } from 'shared/models/types';
import { DietaData } from 'shared/schemas/complemento1';
import { ConfiguracionResidencia, Residencia } from 'shared/schemas/residencia';
import { slugify } from 'shared/utils/commonUtils';
import { logServer } from 'shared/utils/serverUtils';
import { verificarPermisoGestionWrapper } from '@/lib/acceso-privilegiado';

type DietaConId = DietaData & { id: DietaId };

type DietasPageData = {
    residenciaNombre: string;
    dietas: DietaConId[];
};

type DietaFormInput = {
    nombre?: string;
    identificadorAdministracion?: string;
    descripcion?: string;
    estaActiva?: boolean;
};

function errorResponse<T>(
    code: NonNullable<ActionResponse<T>['error']>['code'],
    message: string,
    detalles?: unknown
): ActionResponse<T> {
    return { success: false, error: { code, message, detalles } };
}

async function requireAuthorizedUser(
    residenciaId: ResidenciaId
): Promise<ActionResponse<{ usuarioId: string; nivelAcceso: 'Todas' | 'Propias' | 'Ninguna' }>> {
    const sesion = await obtenerInfoUsuarioServer();

    if (!sesion.usuarioId) {
        return errorResponse('UNAUTHORIZED', 'Usuario no autenticado.');
    }

    const esMaster = sesion.roles.includes('master');
    if (!esMaster && sesion.residenciaId !== residenciaId) {
        return errorResponse('UNAUTHORIZED', 'No autorizado para gestionar dietas en esta residencia.');
    }

    const acceso = await verificarPermisoGestionWrapper('gestionDietas');
    if (acceso.error) {
        return errorResponse('INTERNAL', acceso.error);
    }

    if (!acceso.tieneAcceso || acceso.nivelAcceso === 'Ninguna') {
        return errorResponse('UNAUTHORIZED', 'No autorizado para gestionar dietas en esta residencia.');
    }

    // En dietas no existe semantica de ownership; Propias indica configuracion inconsistente.
    if (acceso.nivelAcceso === 'Propias') {
        return errorResponse('UNAUTHORIZED', 'Configuración de permisos inválida para dietas: se requiere acceso total.');
    }

    return { success: true, data: { usuarioId: sesion.usuarioId, nivelAcceso: acceso.nivelAcceso } };
}

function getConfigRef(residenciaId: ResidenciaId) {
    return db.collection('residencias').doc(residenciaId).collection('configuracion').doc('general');
}

function getResidenciaRef(residenciaId: ResidenciaId) {
    return db.collection('residencias').doc(residenciaId);
}

function sortDietas(dietasMap: ConfiguracionResidencia['dietas'] | undefined): DietaConId[] {
    return Object.entries(dietasMap || {})
        .map(([id, data]) => ({
            id,
            ...data,
        }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre));
}

async function getConfigDietas(
    residenciaId: ResidenciaId
): Promise<ActionResponse<{ ref: FirebaseFirestore.DocumentReference; dietasMap: ConfiguracionResidencia['dietas'] }>> {
    const configRef = getConfigRef(residenciaId);
    const configSnap = await configRef.get();

    if (!configSnap.exists) {
        return errorResponse('INTERNAL', 'No se encontró la configuración general de la residencia.');
    }

    const configData = configSnap.data() as ConfiguracionResidencia;
    return {
        success: true,
        data: {
            ref: configRef,
            dietasMap: configData.dietas || {},
        },
    };
}

export async function getDietasResidenciaData(
    residenciaId: ResidenciaId
): Promise<ActionResponse<DietasPageData>> {
    try {
        const authResult = await requireAuthorizedUser(residenciaId);
        if (!authResult.success) {
            return { success: false, error: authResult.error };
        }

        const [residenciaSnap, configSnap] = await Promise.all([
            getResidenciaRef(residenciaId).get(),
            getConfigRef(residenciaId).get(),
        ]);

        if (!residenciaSnap.exists) {
            return errorResponse('INTERNAL', 'La residencia solicitada no existe.');
        }

        const residenciaData = residenciaSnap.data() as Residencia;
        const configData = configSnap.exists ? (configSnap.data() as ConfiguracionResidencia) : null;

        return {
            success: true,
            data: {
                residenciaNombre: residenciaData.nombre,
                dietas: sortDietas(configData?.dietas),
            },
        };
    } catch (error) {
        console.error('Error fetching dietas page data:', error);
        return errorResponse('INTERNAL', 'No se pudieron cargar las dietas de la residencia.');
    }
}

export async function createDietaAction(
    residenciaId: ResidenciaId,
    input: DietaFormInput
): Promise<ActionResponse<DietaConId>> {
    try {
        const authResult = await requireAuthorizedUser(residenciaId);
        if (!authResult.success || !authResult.data) {
            return { success: false, error: authResult.error };
        }

        const nombre = input.nombre?.trim();
        if (!nombre) {
            return errorResponse('VALIDATION_ERROR', 'El nombre de la dieta es obligatorio.');
        }

        const identificadorAdministracion = input.identificadorAdministracion?.trim();
        if (!identificadorAdministracion) {
            return errorResponse('VALIDATION_ERROR', 'El identificador de administracion es obligatorio.');
        }

        const configResult = await getConfigDietas(residenciaId);
        if (!configResult.success || !configResult.data) {
            return { success: false, error: configResult.error };
        }

        const newDietaId = slugify(nombre, 50) as DietaId;
        const dietas = sortDietas(configResult.data.dietasMap);
        if (dietas.some((dieta) => dieta.id.toLowerCase() === newDietaId.toLowerCase())) {
            return errorResponse('VALIDATION_ERROR', 'Ya existe una dieta con un nombre similar.');
        }

        const newDietaData: DietaData = {
            nombre,
            descripcion: {
                tipo: 'texto_corto',
                descripcion: input.descripcion?.trim() || '',
            },
            esPredeterminada: false,
            estaActiva: input.estaActiva === undefined ? true : input.estaActiva,
            identificadorAdministracion,
            estado: 'aprobada_director',
            creadoPor: authResult.data.usuarioId,
            avisoAdministracion: 'no_comunicado',
        };

        await configResult.data.ref.update({
            [`dietas.${newDietaId}`]: newDietaData,
        });

        await logServer({
            action: 'DIETA_CREADA',
            targetId: newDietaId,
            targetCollection: 'configuracion/general',
            residenciaId,
            details: { message: `Created dieta: ${newDietaData.nombre}` },
        });

        revalidatePath(`/${residenciaId}/gerencia/dietas`);
        return { success: true, data: { ...newDietaData, id: newDietaId } };
    } catch (error) {
        console.error('Error creating dieta:', error);
        return errorResponse('INTERNAL', 'No se pudo añadir la dieta.');
    }
}

export async function updateDietaAction(
    residenciaId: ResidenciaId,
    dietaId: DietaId,
    input: DietaFormInput
): Promise<ActionResponse<DietaConId>> {
    try {
        const authResult = await requireAuthorizedUser(residenciaId);
        if (!authResult.success) {
            return { success: false, error: authResult.error };
        }

        const configResult = await getConfigDietas(residenciaId);
        if (!configResult.success || !configResult.data) {
            return { success: false, error: configResult.error };
        }

        const originalDieta = configResult.data.dietasMap[dietaId];
        if (!originalDieta) {
            return errorResponse('VALIDATION_ERROR', 'La dieta original no existe.');
        }

        const identificadorAdministracion = input.identificadorAdministracion?.trim();
        if (!identificadorAdministracion) {
            return errorResponse('VALIDATION_ERROR', 'El identificador de administracion es obligatorio.');
        }

        const updatedDietaData: DietaData = {
            ...originalDieta,
            nombre: originalDieta.nombre,
            identificadorAdministracion,
            descripcion: {
                tipo: 'texto_corto',
                descripcion: input.descripcion?.trim() || '',
            },
            estaActiva: input.estaActiva === undefined ? originalDieta.estaActiva : input.estaActiva,
        };

        await configResult.data.ref.update({
            [`dietas.${dietaId}`]: updatedDietaData,
        });

        await logServer({
            action: 'DIETA_ACTUALIZADA',
            targetId: dietaId,
            targetCollection: 'configuracion/general',
            residenciaId,
            details: { message: `Updated dieta: ${updatedDietaData.nombre}` },
        });

        revalidatePath(`/${residenciaId}/gerencia/dietas`);
        return { success: true, data: { ...updatedDietaData, id: dietaId } };
    } catch (error) {
        console.error('Error updating dieta:', error);
        return errorResponse('INTERNAL', 'No se pudo guardar la dieta.');
    }
}

export async function toggleDietaActivaAction(
    residenciaId: ResidenciaId,
    dietaId: DietaId
): Promise<ActionResponse<{ dietaId: DietaId; estaActiva: boolean }>> {
    try {
        const authResult = await requireAuthorizedUser(residenciaId);
        if (!authResult.success) {
            return { success: false, error: authResult.error };
        }

        const configResult = await getConfigDietas(residenciaId);
        if (!configResult.success || !configResult.data) {
            return { success: false, error: configResult.error };
        }

        const dietaToToggle = configResult.data.dietasMap[dietaId];
        if (!dietaToToggle) {
            return errorResponse('VALIDATION_ERROR', 'La dieta no existe.');
        }

        if (dietaToToggle.esPredeterminada && dietaToToggle.estaActiva) {
            return errorResponse('VALIDATION_ERROR', 'No se puede desactivar la dieta predeterminada activa.');
        }

        const newStatus = !dietaToToggle.estaActiva;
        await configResult.data.ref.update({
            [`dietas.${dietaId}.estaActiva`]: newStatus,
        });

        await logServer({
            action: 'DIETA_ACTUALIZADA',
            targetId: dietaId,
            targetCollection: 'configuracion/general',
            residenciaId,
            details: { message: `${newStatus ? 'Activated' : 'Deactivated'} dieta: ${dietaToToggle.nombre}` },
        });

        revalidatePath(`/${residenciaId}/gerencia/dietas`);
        return { success: true, data: { dietaId, estaActiva: newStatus } };
    } catch (error) {
        console.error('Error toggling dieta active status:', error);
        return errorResponse('INTERNAL', 'No se pudo cambiar el estado de la dieta.');
    }
}

export async function setDefaultDietaAction(
    residenciaId: ResidenciaId,
    dietaId: DietaId
): Promise<ActionResponse<{ dietaId: DietaId }>> {
    try {
        const authResult = await requireAuthorizedUser(residenciaId);
        if (!authResult.success) {
            return { success: false, error: authResult.error };
        }

        const configResult = await getConfigDietas(residenciaId);
        if (!configResult.success || !configResult.data) {
            return { success: false, error: configResult.error };
        }

        const dietaToSetDefault = configResult.data.dietasMap[dietaId];
        if (!dietaToSetDefault) {
            return errorResponse('VALIDATION_ERROR', 'La dieta no existe.');
        }

        if (dietaToSetDefault.esPredeterminada) {
            return errorResponse('VALIDATION_ERROR', 'La dieta seleccionada ya es la predeterminada.');
        }

        if (!dietaToSetDefault.estaActiva) {
            return errorResponse('VALIDATION_ERROR', 'No se puede marcar como predeterminada una dieta inactiva.');
        }

        const updates: Record<string, boolean> = {};
        for (const [currentDietaId, dieta] of Object.entries(configResult.data.dietasMap)) {
            if (currentDietaId === dietaId) {
                updates[`dietas.${currentDietaId}.esPredeterminada`] = true;
            } else if (dieta.esPredeterminada) {
                updates[`dietas.${currentDietaId}.esPredeterminada`] = false;
            }
        }

        const batch = db.batch();
        batch.update(configResult.data.ref, updates);
        await batch.commit();

        await logServer({
            action: 'DIETA_ACTUALIZADA',
            targetId: dietaId,
            targetCollection: 'configuracion/general',
            residenciaId,
            details: { message: `Set default dieta: ${dietaToSetDefault.nombre}` },
        });

        revalidatePath(`/${residenciaId}/gerencia/dietas`);
        return { success: true, data: { dietaId } };
    } catch (error) {
        console.error('Error setting default dieta:', error);
        return errorResponse('INTERNAL', 'No se pudo marcar la dieta como predeterminada.');
    }
}

export async function deleteDietaAction(
    residenciaId: ResidenciaId,
    dietaId: DietaId
): Promise<ActionResponse<{ dietaId: DietaId }>> {
    try {
        const authResult = await requireAuthorizedUser(residenciaId);
        if (!authResult.success) {
            return { success: false, error: authResult.error };
        }

        const configResult = await getConfigDietas(residenciaId);
        if (!configResult.success || !configResult.data) {
            return { success: false, error: configResult.error };
        }

        const dietaToDelete = configResult.data.dietasMap[dietaId];
        if (!dietaToDelete) {
            return errorResponse('VALIDATION_ERROR', 'La dieta no existe.');
        }

        if (dietaToDelete.esPredeterminada) {
            return errorResponse('VALIDATION_ERROR', 'No se puede eliminar la dieta predeterminada.');
        }

        if (Object.keys(configResult.data.dietasMap).length <= 1) {
            return errorResponse('VALIDATION_ERROR', 'No se puede eliminar la última dieta. Una residencia debe tener al menos una dieta.');
        }

        await configResult.data.ref.update({
            [`dietas.${dietaId}`]: FieldValue.delete(),
        });

        await logServer({
            action: 'DIETA_ELIMINADA',
            targetId: dietaId,
            targetCollection: 'configuracion/general',
            residenciaId,
            details: { message: `Deleted dieta: ${dietaToDelete.nombre} (ID: ${dietaId})` },
        });

        revalidatePath(`/${residenciaId}/gerencia/dietas`);
        return { success: true, data: { dietaId } };
    } catch (error) {
        console.error('Error deleting dieta:', error);
        return errorResponse('INTERNAL', 'No se pudo eliminar la dieta.');
    }
}