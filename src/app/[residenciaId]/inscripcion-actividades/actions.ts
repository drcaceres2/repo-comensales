'use server';

import { db, admin } from '@/lib/firebaseAdmin';
import {
  Actividad,
  InscripcionActividad,
} from '@/../shared/schemas/actividades';
import { Residencia } from '@/../shared/schemas/residencia';
import { ResidenciaId, RolUsuario, LogPayload } from '@/../shared/models/types';
import { requireAuth } from '@/lib/serverAuth';
import { revalidatePath } from 'next/cache';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';

async function getResidencia(residenciaId: ResidenciaId): Promise<Residencia | null> {
    const residenciaRef = db.collection('residencias').doc(residenciaId);
    const residenciaSnap = await residenciaRef.get();
    if (!residenciaSnap.exists) {
        return null;
    }
    return residenciaSnap.data() as Residencia;
}

// Helper function to get today's date in ISO format (YYYY-MM-DD) in the residence's timezone
async function getTodayInTimezone(residenciaId: ResidenciaId) {
    const residencia = await getResidencia(residenciaId);
    if (!residencia || !residencia.ubicacion) {
        throw new Error('Residencia not found or timezone not configured');
    }
    const { zonaHoraria } = residencia.ubicacion;
    const today = new Date();
    //toLocaleString can be buggy in server environments. Let's use a more robust way.
    return new Date(today.toLocaleString('en-US', { timeZone: zonaHoraria })).toISOString().split('T')[0];
}


interface ActividadDisponible extends Actividad {
  inscritos: number;
  invitaciones: InscripcionActividad[];
}

export async function getActividadesDisponibles(
  residenciaId: ResidenciaId
): Promise<ActividadDisponible[]> {
  const { uid, roles } = await requireAuth();
  
  const today = await getTodayInTimezone(residenciaId);

  // 1. Fetch all 'inscripcion_abierta' activities for the residence
  const actividadesQuery = db.collection(`residencias/${residenciaId}/actividades`)
    .where('estado', '==', 'inscripcion_abierta');

  const actividadesSnap = await actividadesQuery.get();
  if (actividadesSnap.empty) {
    return [];
  }
  const actividades = actividadesSnap.docs.map((doc) => ({ ...doc.data(), id: doc.id })) as Actividad[];

  // 2. Fetch all inscriptions for these activities to calculate counts
  const actividadIds = actividades.map((act) => act.id);
  const inscripcionesSnap = await db.collection('inscripcionesActividades')
      .where('residenciaId', '==', residenciaId)
      .where('actividadId', 'in', actividadIds)
      .get();
      
  const allInscripciones = inscripcionesSnap.docs.map(
    (doc) => ({ ...doc.data(), id: doc.id } as InscripcionActividad)
  );

  // 3. Use user's roles from auth context
    const userRoles: RolUsuario[] = (roles as RolUsuario[]) || [];
    const isResidente = userRoles.includes('residente');
    const isInvitado = userRoles.includes('invitado');

  // 4. Filter activities based on the criteria
  const actividadesDisponibles = actividades.map((actividad) => {
      // 2b: Calculate enrolled count
      const inscritos = allInscripciones.filter(
        (ins) =>
          ins.actividadId === actividad.id &&
          (ins.estadoInscripcion === 'invitado_aceptado' ||
            ins.estadoInscripcion === 'inscrito_directo')
      ).length;

      // 2c: Check for available spots
      const tieneCupos =
        actividad.maxParticipantes === 0 ||
        !actividad.maxParticipantes ||
        actividad.maxParticipantes > inscritos;

      // 2d: Check if registration is still open
      const fechaInicio = new Date(actividad.fechaInicio);
      const diasAntelacion = actividad.diasAntelacionSolicitudAdministracion || 0;
      fechaInicio.setDate(fechaInicio.getDate() - diasAntelacion);
      const fechaLimiteInscripcion = fechaInicio.toISOString().split('T')[0];
      const noSeHaVencido = today <= fechaLimiteInscripcion;
      
      const isVisible = tieneCupos && noSeHaVencido;

      return { ...actividad, inscritos, isVisible };
    })
    .filter((actividad) => actividad.isVisible);


    let finalActividades = actividadesDisponibles.filter(act => {
        // 2e & 2f: Role-based filtering
        if (isResidente && act.modoAccesoResidentes?.accesoUsuario !== 'abierto') {
            return false;
        }
        if (isInvitado && act.modoAccesoInvitados?.accesoUsuario !== 'abierto') {
            return false;
        }
        return true;
    });

  // 2g: Include activities the user is specifically invited to
  const userInvitations = allInscripciones.filter(
    (ins) => ins.usuarioInscritoId === uid && ins.estadoInscripcion === 'invitado_pendiente'
  );

  const invitedActividadIds = userInvitations.map((ins) => ins.actividadId);
  if (invitedActividadIds.length > 0) {
    const invitedActivitiesQuery = db.collection(`residencias/${residenciaId}/actividades`)
        .where(admin.firestore.FieldPath.documentId(), 'in', invitedActividadIds);
        
    const invitedActivitiesSnap = await invitedActivitiesQuery.get();
    const invitedActivities = invitedActivitiesSnap.docs.map(doc => ({...doc.data(), id: doc.id}) as Actividad);
    finalActividades.push(...invitedActivities as any);
  }

  // Remove duplicates and add invitation details
  const uniqueActividades = Array.from(new Map(finalActividades.map(act => [act.id, act])).values());

  return uniqueActividades.map(actividad => ({
      ...actividad,
      invitaciones: userInvitations.filter(inv => inv.actividadId === actividad.id)
  }));
}

export async function inscribirEnActividad(residenciaId: ResidenciaId, actividadId: string) {
    const { uid, email } = await requireAuth();

    const actividadRef = db.collection(`residencias/${residenciaId}/actividades`).doc(actividadId);
    const actividadSnap = await actividadRef.get();
    if (!actividadSnap.exists) throw new Error("Activity not found");
    const actividad = actividadSnap.data() as Actividad;

    const inscripcionesRef = db.collection('inscripcionesActividades');
    const q = inscripcionesRef.where("actividadId", "==", actividadId).where("estadoInscripcion", "in", ["inscrito_directo", "invitado_aceptado"]);
    const inscritosSnap = await q.get();

    if (actividad.maxParticipantes && actividad.maxParticipantes > 0 && inscritosSnap.size >= actividad.maxParticipantes) {
        throw new Error("No hay cupos disponibles");
    }

    const newInscripcion = {
        actividadId,
        usuarioInscritoId: uid,
        residenciaId,
        estadoInscripcion: 'inscrito_directo',
        fechaInvitacion: null,
        timestampCreacion: new Date().toISOString(),
        timestampModificacion: new Date().toISOString(),
    };

    await inscripcionesRef.add(newInscripcion);

    // Async logging via Cloud Function
    const logAction = httpsCallable<LogPayload, { success: boolean }>(functions, 'logActionCallable');
    logAction({
        action: 'INSCRIPCION_USUARIO_ACTIVIDAD',
        targetId: actividadId,
        targetCollection: 'actividades',
        residenciaId,
        details: { nombreActividad: actividad.nombre }
    }).catch(err => console.error("Error logging INSCRIPCION_USUARIO_ACTIVIDAD:", err));

    revalidatePath(`/${residenciaId}/inscripcion-actividades`);
}

export async function responderInvitacion(residenciaId: ResidenciaId, inscripcionId: string, aceptar: boolean) {
    const { uid, email } = await requireAuth();
    
    const inscripcionRef = db.collection('inscripcionesActividades').doc(inscripcionId);
    const inscripcionSnap = await inscripcionRef.get();
    if (!inscripcionSnap.exists) throw new Error("Invitation not found");
    const inscripcion = inscripcionSnap.data() as InscripcionActividad;

    if (inscripcion.usuarioInscritoId !== uid) throw new Error("Unauthorized");

    const nuevoEstado = aceptar ? 'invitado_aceptado' : 'invitado_rechazado';

    await inscripcionRef.update({
        estadoInscripcion: nuevoEstado,
        timestampModificacion: new Date().toISOString(),
    });

    // Async logging via Cloud Function
    const logAction = httpsCallable<LogPayload, { success: boolean }>(functions, 'logActionCallable');
    logAction({
        action: 'INVITACION_USUARIO_ACTIVIDAD',
        targetId: inscripcion.actividadId,
        targetCollection: 'actividades',
        residenciaId,
        details: { respuesta: aceptar ? 'aceptada' : 'rechazada' }
    }).catch(err => console.error("Error logging INVITACION_USUARIO_ACTIVIDAD:", err));

    revalidatePath(`/${residenciaId}/inscripcion-actividades`);
}

export async function cancelarInscripcion(residenciaId: ResidenciaId, inscripcionId: string) {
    const { uid, email } = await requireAuth();
    
    const inscripcionRef = db.collection('inscripcionesActividades').doc(inscripcionId);
    const inscripcionSnap = await inscripcionRef.get();
    if (!inscripcionSnap.exists) throw new Error("Inscription not found");
    const inscripcion = inscripcionSnap.data() as InscripcionActividad;

    if (inscripcion.usuarioInscritoId !== uid) throw new Error("Unauthorized");

    await inscripcionRef.update({
        estadoInscripcion: 'cancelado_usuario',
        timestampModificacion: new Date().toISOString(),
    });

    // Async logging via Cloud Function
    const logAction = httpsCallable<LogPayload, { success: boolean }>(functions, 'logActionCallable');
    logAction({
        action: 'SALIDA_USUARIO_ACTIVIDAD',
        targetId: inscripcion.actividadId,
        targetCollection: 'actividades',
        residenciaId,
        details: { inscripcionId }
    }).catch(err => console.error("Error logging SALIDA_USUARIO_ACTIVIDAD:", err));

    revalidatePath(`/${residenciaId}/inscripcion-actividades`);
}
