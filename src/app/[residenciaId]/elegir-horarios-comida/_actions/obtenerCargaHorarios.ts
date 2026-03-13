"use server";

import { db } from '@/lib/firebaseAdmin';
import { obtenerInfoUsuarioServer } from '@/lib/obtenerInfoUsuarioServer';
import { eachDayOfInterval, format, parseISO } from 'date-fns';
import { CargaHorariosUI } from 'shared/schemas/elecciones/ui.schema';
import { FechaIsoSchema } from 'shared/schemas/fechas';
import { ActionResponse } from 'shared/models/types';
import { generarPayloadHorariosUI } from '../_lib/orquestadorUI';
import { resolveTargetUsuarioContext } from './_targetUsuario';

type ActividadDoc = {
  id: string;
  nombre: string;
  fechaInicio: string;
  fechaFin: string;
  estado?: string;
  planComidas?: Array<{ fechaComida: string; nombreTiempoComida: string }>;
};

function errorResponse<T>(
  code: NonNullable<ActionResponse<T>['error']>['code'],
  message: string,
  detalles?: unknown
): ActionResponse<T> {
  return { success: false, error: { code, message, detalles } };
}

function buildDateRange(fechaInicio: string, fechaFin: string): string[] {
  const inicio = parseISO(fechaInicio);
  const fin = parseISO(fechaFin);
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime()) || fechaInicio > fechaFin) {
    throw new Error('Rango de fechas inválido.');
  }

  return eachDayOfInterval({ start: inicio, end: fin }).map((fecha) => format(fecha, 'yyyy-MM-dd'));
}

function dayOfWeek(fechaIso: string): string {
  const dias = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
  const fecha = new Date(`${fechaIso}T00:00:00Z`);
  return dias[fecha.getUTCDay()] ?? 'lunes';
}

function mapActividadesACapa1(
  actividades: ActividadDoc[],
  singleton: any,
  fechaInicio: string,
  fechaFin: string
) {
  const resultado: Array<{
    actividadId: string;
    nombreActividad: string;
    configuracionAlternativaId: string;
    fechaInicio: string;
    fechaFin: string;
    tiemposComidaIds: string[];
  }> = [];

  for (const actividad of actividades) {
    const plan = actividad.planComidas ?? [];

    for (const detalle of plan) {
      if (detalle.fechaComida < fechaInicio || detalle.fechaComida > fechaFin) {
        continue;
      }

      const dia = dayOfWeek(detalle.fechaComida);
      const tiempo = Object.entries(singleton.esquemaSemanal ?? {}).find(([, value]: any) => {
        return value?.estaActivo === true
          && value?.dia === dia
          && value?.nombre === detalle.nombreTiempoComida;
      });

      if (!tiempo) {
        continue;
      }

      const tiempoComidaId = tiempo[0];
      const principal = (tiempo[1] as any).alternativas?.principal;
      if (!principal) {
        continue;
      }

      resultado.push({
        actividadId: actividad.id,
        nombreActividad: actividad.nombre,
        configuracionAlternativaId: principal,
        fechaInicio: detalle.fechaComida,
        fechaFin: detalle.fechaComida,
        tiemposComidaIds: [tiempoComidaId],
      });
    }
  }

  return resultado;
}

export async function obtenerCargaHorarios(
  residenciaId: string,
  fechaInicio: string, // YYYY-MM-DD
  fechaFin: string,    // YYYY-MM-DD
  targetUid?: string
): Promise<ActionResponse<CargaHorariosUI>> {
  try {
    const validInicio = FechaIsoSchema.safeParse(fechaInicio);
    const validFin = FechaIsoSchema.safeParse(fechaFin);

    if (!validInicio.success || !validFin.success) {
      return errorResponse('VALIDATION_ERROR', 'Rango de fechas inválido.', {
        fechaInicio: validInicio.success ? undefined : validInicio.error.issues,
        fechaFin: validFin.success ? undefined : validFin.error.issues,
      });
    }

    const targetContext = await resolveTargetUsuarioContext(residenciaId, targetUid);
    if (!targetContext.success) {
      return { success: false, error: targetContext.error };
    }

    const { sesion, targetUid: resolvedTargetUid } = targetContext.data;

    const fechasRango = buildDateRange(fechaInicio, fechaFin);

    const singletonRef = db.doc(`residencias/${residenciaId}/configuracion/general`);
    const userRef = db.doc(`usuarios/${resolvedTargetUid}`);

    const [singletonSnap, userSnap, excepcionesSnap, ausenciasSnap, actividadesSnap, ...horarioSnaps] = await Promise.all([
      singletonRef.get(),
      userRef.get(),
      db
        .collection(`usuarios/${resolvedTargetUid}/excepciones`)
        .where('residenciaId', '==', residenciaId)
        .where('fecha', '>=', fechaInicio)
        .where('fecha', '<=', fechaFin)
        .get(),
      db
        .collection(`usuarios/${resolvedTargetUid}/ausencias`)
        .where('residenciaId', '==', residenciaId)
        .where('fechaInicio', '<=', fechaFin)
        .get(),
      db
        .collection(`residencias/${residenciaId}/actividades`)
        .where('fechaInicio', '<=', fechaFin)
        .get(),
      ...fechasRango.map((fecha) => db.doc(`residencias/${residenciaId}/horariosEfectivos/${fecha}`).get()),
    ]);

    if (!singletonSnap.exists) {
      return errorResponse('INTERNAL', 'No existe configuración general de la residencia.');
    }

    const singletonData = singletonSnap.data() as any;
    if (!singletonData?.residenciaId || !singletonData?.esquemaSemanal || !singletonData?.configuracionesAlternativas) {
      return errorResponse('INTERNAL', 'Configuración de residencia incompleta para construir horarios.');
    }

    const singleton = singletonData;
    const userData = userSnap.exists ? userSnap.data() : {};
    const diccionarioSemanarios = (userData?.semanarios ?? {}) as Record<string, any>;

    const vistaMaterializadaDiaria: Record<string, any> = {};
    for (const snap of horarioSnaps) {
      if (snap.exists) {
        vistaMaterializadaDiaria[snap.id] = { id: snap.id, ...(snap.data() ?? {}) };
      }
    }

    const excepcionesUsuario = excepcionesSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as object) }));
    const ausenciasUsuario = ausenciasSnap.docs
      .map((doc) => ({ id: doc.id, ...(doc.data() as object) }))
      .filter((a: any) => a.fechaFin >= fechaInicio);

    const actividadesDocs = actividadesSnap.docs
      .map((doc) => ({ id: doc.id, ...(doc.data() as object) } as ActividadDoc))
      .filter((a) => a.fechaFin >= fechaInicio && a.estado !== 'cancelada');

    const actividadIds = actividadesDocs.map((a) => a.id);
    let inscripciones: Array<{ actividadId: string }> = [];
    if (actividadIds.length > 0) {
      const inscripcionesSnap = await db
        .collection('inscripcionesActividades')
        .where('residenciaId', '==', residenciaId)
        .where('usuarioInscritoId', '==', resolvedTargetUid)
        .where('estadoInscripcion', 'in', ['inscrito_directo', 'invitado_aceptado'])
        .get();

      const setIds = new Set(actividadIds);
      inscripciones = inscripcionesSnap.docs
        .map((doc) => doc.data() as any)
        .filter((ins) => setIds.has(ins.actividadId));
    }

    const actividadesInscritas = actividadesDocs.filter((a) => inscripciones.some((i) => i.actividadId === a.id));
    const inscripcionesActividad = mapActividadesACapa1(actividadesInscritas, singleton, fechaInicio, fechaFin);

    const payload = generarPayloadHorariosUI({
      fechasRango,
      fechaHoraReferenciaUltimaSolicitud: singleton.fechaHoraReferenciaUltimaSolicitud,
      singletonResidencia: singleton,
      vistaMaterializadaDiaria,
      diccionarioSemanarios,
      excepcionesUsuario: excepcionesUsuario as any,
      ausenciasUsuario: ausenciasUsuario as any,
      inscripcionesActividad,
    });

    return { success: true, data: payload };
  } catch (error) {
    const detalle = error instanceof Error
      ? { message: error.message, name: error.name }
      : { message: String(error) };

    const mensaje = error instanceof Error
      ? `No se pudo obtener la carga de horarios. ${error.message}`
      : 'No se pudo obtener la carga de horarios.';

    return errorResponse('INTERNAL', mensaje, detalle);
  }
}