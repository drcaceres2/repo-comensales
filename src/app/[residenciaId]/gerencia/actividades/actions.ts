'use server';

import { revalidatePath } from 'next/cache';
import { db, auth as adminAuth } from '@/lib/firebaseAdmin';
import { requireAuth } from '@/lib/serverAuth';
// import { logServerAction } from '@/lib/serverLogs'; // REMOVED
import { 
    Actividad,
    EstadoActividad,
    ActividadCreateSchema, 
    ActividadUpdateSchema, 
    ActividadEstadoUpdateSchema,
    ActividadUpdate
} from '@/../shared/schemas/actividades';
import { TiempoComida } from 'shared/schemas/horarios';
import { 
    ActividadId, ResidenciaId, 
    LogPayload
} from '@/../shared/models/types';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase'; // Assuming functions is exported from here
import * as admin from 'firebase-admin';

// Helper to get the day of the week from a date string (YYYY-MM-DD)
const getDayOfWeek = (dateString: string): string => {
    const date = new Date(dateString);
    const days = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
    return days[date.getUTCDay()];
}

async function validateTiempoComida(
    tiempoComidaId: string, 
    fecha: string, 
    residenciaId: string
): Promise<{valid: boolean; message: string}> {
    const configRef = db.collection('residencias').doc(residenciaId).collection('configuracion').doc('general');
    const configSnap = await configRef.get();
    
    if (!configSnap.exists) {
        return { valid: false, message: `Configuración de la residencia no encontrada.` };
    }

    const configData = configSnap.data() || {};
    const esquemaSemanal = configData.esquemaSemanal || {};
    const tiempoComida = esquemaSemanal[tiempoComidaId] as TiempoComida | undefined;

    if (!tiempoComida) {
        return { valid: false, message: `Tiempo de comida con id ${tiempoComidaId} no encontrado.` };
    }

    if (tiempoComida.dia && tiempoComida.dia !== getDayOfWeek(fecha)) {
        return { valid: false, message: `El día de la semana del tiempo de comida no coincide con la fecha.` };
    }
    return { valid: true, message: '' };
}


export async function createActividad(
    residenciaId: ResidenciaId,
    data: unknown
) {
    try {
        const user = await requireAuth();
        console.log("createActividad (server) triggered by user:", user.uid);

        const validationResult = ActividadCreateSchema.safeParse(data);
        if (!validationResult.success) {
            console.warn("Validation failed for createActividad:", JSON.stringify(validationResult.error.format(), null, 2));
            return { success: false, error: validationResult.error.flatten() };
        }

        const { tiempoComidaInicial, tiempoComidaFinal, fechaInicio, fechaFin, ...restData } = validationResult.data;

        const initialMealValidation = await validateTiempoComida(tiempoComidaInicial, fechaInicio, residenciaId);
        if (!initialMealValidation.valid) {
            return { success: false, error: { fieldErrors: { tiempoComidaInicial: [initialMealValidation.message] } } };
        }
        const finalMealValidation = await validateTiempoComida(tiempoComidaFinal, fechaFin, residenciaId);
        if (!finalMealValidation.valid) {
            return { success: false, error: { fieldErrors: { tiempoComidaFinal: [finalMealValidation.message] } } };
        }

        const docRef = await db.collection('actividades').add({
            ...restData,
            residenciaId,
            organizadorId: user.uid,
            tiempoComidaInicial,
            tiempoComidaFinal,
            fechaInicio,
            fechaFin,
            fechaHoraCreacion: admin.firestore.FieldValue.serverTimestamp(),
            fechaHoraModificacion: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Async logging via Cloud Function
        const logAction = httpsCallable<LogPayload, { success: boolean }>(functions, 'logActionCallable');
        logAction({
            action: 'ACTIVIDAD_CREADA',
            targetId: docRef.id,
            targetCollection: 'actividades',
            residenciaId,
            details: { nombre: restData.nombre },
        }).catch(err => console.error("Error logging ACTIVIDAD_CREADA:", err));

        revalidatePath(`/`); 
        return { success: true, data: { id: docRef.id, ...validationResult.data } };
    } catch (error) {
        console.error("Error creatingividad:", error);
        if (error instanceof Error && error.message.includes('UNAUTHORIZED')) {
            return { success: false, error: 'Usuario no autenticado. Inicia sesión de nuevo.' };
        }
        return { success: false, error: 'No se pudo crear la actividad.' };
    }
}

export async function updateActividad(
    actividadId: ActividadId,
    residenciaId: ResidenciaId,
    data: unknown
) {
    try {
        const user = await requireAuth();
        
        const activityRef = db.collection('actividades').doc(actividadId);
        const activitySnap = await activityRef.get();
        if (!activitySnap.exists) {
            return { success: false, error: 'Actividad no encontrada.' };
        }
        const activity = activitySnap.data() as Actividad;

        const validationResult = ActividadUpdateSchema.safeParse(data);
        if (!validationResult.success) {
            console.warn("Validation failed for updateActividad:", JSON.stringify(validationResult.error.format(), null, 2));
            return { success: false, error: validationResult.error.flatten() };
        }
        
        const updateData = validationResult.data;

        // --- State-based Editability Validation ---

        // comensalesNoUsuarios solo se puede modificar en "inscripcion_abierta"
        if (updateData.comensalesNoUsuarios !== undefined && activity.estado !== 'inscripcion_abierta') {
            if (updateData.comensalesNoUsuarios !== activity.comensalesNoUsuarios) {
                return { success: false, error: 'comensalesNoUsuarios solo se puede modificar en estado "inscripcion_abierta".' };
            }
        }

        // TipoSolicitudComidasActividad no se puede modificar en "solicitada_administracion" o "cancelada"
        if (updateData.tipoSolicitudComidas !== undefined && ['solicitada_administracion', 'cancelada'].includes(activity.estado)) {
            if (updateData.tipoSolicitudComidas !== activity.tipoSolicitudComidas) {
                return { success: false, error: 'TipoSolicitudComidas no se puede modificar en este estado.' };
            }
        }

        // Operational fields only editable in "borrador"
        const operationalFields: (keyof ActividadUpdate)[] = [
            'fechaInicio', 'fechaFin', 'tiempoComidaInicial', 'tiempoComidaFinal', 
            'planComidas', 'comedorActividad', 'modoAtencionActividad', 
            'modoAccesoResidentes', 'modoAccesoInvitados'
        ];

        if (activity.estado !== 'borrador') {
            const activityAny = activity as any;
            const updateDataAny = updateData as any;
            for (const field of operationalFields) {
                if (updateDataAny[field] !== undefined && updateDataAny[field] !== activityAny[field]) {
                    // Logic for specific fields if needed
                    return { success: false, error: `El campo ${field} solo se puede modificar en estado "borrador".` };
                }
            }
        }

        // --- Additional Validations ---
        if (updateData.fechaInicio || updateData.fechaFin || updateData.tiempoComidaInicial || updateData.tiempoComidaFinal) {
            const fechaIni = updateData.fechaInicio || activity.fechaInicio;
            const fechaF = updateData.fechaFin || activity.fechaFin;
            const tcIni = updateData.tiempoComidaInicial || activity.tiempoComidaInicial;
            const tcF = updateData.tiempoComidaFinal || activity.tiempoComidaFinal;

            if (updateData.tiempoComidaInicial) {
                const v = await validateTiempoComida(tcIni, fechaIni, residenciaId);
                if (!v.valid) return { success: false, error: { fieldErrors: { tiempoComidaInicial: [v.message] } } };
            }
            if (updateData.tiempoComidaFinal) {
                const v = await validateTiempoComida(tcF, fechaF, residenciaId);
                if (!v.valid) return { success: false, error: { fieldErrors: { tiempoComidaFinal: [v.message] } } };
            }
        }

        const finalUpdate = {
            ...updateData,
            fechaHoraModificacion: admin.firestore.FieldValue.serverTimestamp(),
        };
        await activityRef.update(finalUpdate);
        
        // Async logging via Cloud Function
        const logAction = httpsCallable<LogPayload, { success: boolean }>(functions, 'logActionCallable');
        logAction({
            action: 'ACTIVIDAD_ACTUALIZADA',
            targetId: actividadId,
            targetCollection: 'actividades',
            residenciaId,
            details: { changes: updateData },
        }).catch(err => console.error("Error logging ACTIVIDAD_ACTUALIZADA:", err));

        revalidatePath(`/`);
        return { success: true, data: updateData };
    } catch (error) {
        console.error("Error updatingividad:", error);
        if (error instanceof Error && error.message.includes('UNAUTHORIZED')) {
            return { success: false, error: 'Usuario no autenticado. Inicia sesión de nuevo.' };
        }
        return { success: false, error: 'No se pudo actualizar la actividad.' };
    }
}

export async function deleteActividad(actividadId: ActividadId, residenciaId: ResidenciaId) {
    try {
        const user = await requireAuth();
        
        await db.collection('actividades').doc(actividadId).delete();
        // Async logging via Cloud Function
        const logAction = httpsCallable<LogPayload, { success: boolean }>(functions, 'logActionCallable');
        logAction({
            action: 'ACTIVIDAD_ELIMINADA',
            targetId: actividadId,
            targetCollection: 'actividades',
            residenciaId,
        }).catch(err => console.error("Error logging ACTIVIDAD_ELIMINADA:", err));

        revalidatePath(`/`);
        return { success: true };
    } catch (error) {
        console.error("Error deletingividad:", error);
        if (error instanceof Error && error.message.includes('UNAUTHORIZED')) {
            return { success: false, error: 'Usuario no autenticado. Inicia sesión de nuevo.' };
        }
        return { success: false, error: 'No se pudo eliminar la actividad.' };
    }
}


export async function updateActividadEstado(
    actividadId: ActividadId,
    residenciaId: ResidenciaId,
    nuevoEstado: EstadoActividad
) {
    try {
        const user = await requireAuth();

        const validationResult = ActividadEstadoUpdateSchema.safeParse({ estado: nuevoEstado });
        if (!validationResult.success) {
            return { success: false, error: validationResult.error.flatten() };
        }

        const actividadRef = db.collection('actividades').doc(actividadId);
    
        const actividadSnap = await actividadRef.get();
        if (!actividadSnap.exists) {
            return { success: false, error: "La actividad no existe." };
        }
        const actividad = actividadSnap.data() as Actividad;

        // --- State Transition Validations ---

        // Para pasar a "inscripcion_cerrada" o "solicitada_administracion" debe haber al menos un inscrito
        if (['inscripcion_cerrada', 'solicitada_administracion'].includes(nuevoEstado)) {
            const inscripcionesSnap = await db.collection('inscripcionesActividades')
                .where('actividadId', '==', actividadId)
                .where('estadoInscripcion', 'in', ['invitado_aceptado', 'inscrito_directo'])
                .get();
                
            if (inscripcionesSnap.empty) {
                return { success: false, error: 'Debe haber al menos una inscripción confirmada (aceptada o directa) para pasar a este estado.' };
            }
        }

        const batch = db.batch();

        // Si se cancela, todas las inscripciones pasan a "cancelado_admin"
        if (nuevoEstado === 'cancelada') {
            const inscripcionesSnap = await db.collection('inscripcionesActividades')
                .where('actividadId', '==', actividadId)
                .where('estadoInscripcion', 'in', ['invitado_pendiente', 'invitado_aceptado', 'inscrito_directo'])
                .get();

            inscripcionesSnap.forEach(inscDoc => {
                batch.update(inscDoc.ref, { 
                    estadoInscripcion: 'cancelado_admin',
                    fechaHoraModificacion: admin.firestore.FieldValue.serverTimestamp()
                });
            });
        }

        batch.update(actividadRef, { 
            estado: nuevoEstado,
            fechaHoraModificacion: admin.firestore.FieldValue.serverTimestamp()
        });
        await batch.commit();
        
        // Async logging via Cloud Function
        const logAction = httpsCallable<LogPayload, { success: boolean }>(functions, 'logActionCallable');
        logAction({
            action: 'ACTIVIDAD_ACTUALIZADA',
            targetId: actividadId,
            targetCollection: 'actividades',
            residenciaId,
            details: { oldState: actividad.estado, newState: nuevoEstado },
        }).catch(err => console.error("Error logging ACTIVIDAD_ACTUALIZADA (estado):", err));

        revalidatePath(`/`);
        return { success: true };
    } catch (error) {
        console.error("Error updating activity state:", error);
        if (error instanceof Error && error.message.includes('UNAUTHORIZED')) {
            return { success: false, error: 'Usuario no autenticado. Inicia sesión de nuevo.' };
        }
        return { success: false, error: 'No se pudo actualizar el estado de la actividad.' };
    }
}

