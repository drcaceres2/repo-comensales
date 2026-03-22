"use server";

import { db, FieldValue } from '@/lib/firebaseAdmin';
import { estaMuroMovilCerrado } from '../_lib/muroMovil';
import { calcularHorarioReferenciaSolicitud } from '../_lib/calcularHorarioReferenciaSolicitud';
import { FormExcepcionLibre } from 'shared/schemas/elecciones/ui.schema';
import { FormExcepcionLibreSchema } from 'shared/schemas/elecciones/ui.schema';
import { ActionResponse } from 'shared/models/types';
import { resolveTargetUsuarioContext } from './_targetUsuario';

function errorResponse(
  code: NonNullable<ActionResponse<void>['error']>['code'],
  message: string,
  detalles?: unknown
): ActionResponse<void> {
  return { success: false, error: { code, message, detalles } };
}

function buildExcepcionDocId(fecha: string, tiempoComidaId: string): string {
  return `${fecha}__${tiempoComidaId}`;
}

export async function upsertExcepcion(
  residenciaId: string,
  payload: FormExcepcionLibre,
  targetUid?: string
): Promise<ActionResponse<void>> {
  try {
    const parsed = FormExcepcionLibreSchema.safeParse(payload);
    if (!parsed.success) {
      return errorResponse('VALIDATION_ERROR', 'Payload de excepción inválido.', parsed.error.issues);
    }

    const targetContext = await resolveTargetUsuarioContext(residenciaId, targetUid);
    if (!targetContext.success) {
      return { success: false, error: targetContext.error };
    }

    const { targetUid: resolvedTargetUid, origenAutoridad } = targetContext.data;

    const data = parsed.data;

    const bloqueoGlobalAutoridad = await db
      .collectionGroup('excepciones')
      .where('residenciaId', '==', residenciaId)
      .where('fecha', '==', data.fecha)
      .where('tiempoComidaId', '==', data.tiempoComidaId)
      .where('origenAutoridad', '==', 'director-restringido')
      .limit(1)
      .get();

    if (!bloqueoGlobalAutoridad.empty) {
      return errorResponse(
        'AUTORIDAD_RESTRINGIDA',
        'Esta elección fue fijada por dirección y no puede ser modificada por el residente.'
      );
    }

    const singletonRef = db.doc(`residencias/${residenciaId}/configuracion/general`);
    const singletonSnap = await singletonRef.get();

    if (!singletonSnap.exists) {
      return errorResponse('INTERNAL', 'No existe configuración general de residencia.');
    }

    const singleton = singletonSnap.data() as any;

    const docId = buildExcepcionDocId(data.fecha, data.tiempoComidaId);
    const excepcionRef = db.doc(`usuarios/${resolvedTargetUid}/excepciones/${docId}`);
    const existenteSnap = await excepcionRef.get();

    let bloqueadaPorAutoridad = false;
    if (existenteSnap.exists) {
      const existente = existenteSnap.data() as any;
      bloqueadaPorAutoridad = existente?.origenAutoridad === 'director-restringido';
    } else {
      const q = await db
        .collection(`usuarios/${resolvedTargetUid}/excepciones`)
        .where('fecha', '==', data.fecha)
        .where('tiempoComidaId', '==', data.tiempoComidaId)
        .limit(1)
        .get();

      if (!q.empty) {
        const existente = q.docs[0]?.data() as any;
        bloqueadaPorAutoridad = existente?.origenAutoridad === 'director-restringido';
      }

      if (!bloqueadaPorAutoridad) {
        const cg = await db
          .collectionGroup('excepciones')
          .where('residenciaId', '==', residenciaId)
          .where('fecha', '==', data.fecha)
          .where('tiempoComidaId', '==', data.tiempoComidaId)
          .where('origenAutoridad', '==', 'director-restringido')
          .limit(5)
          .get();

        if (!cg.empty) {
          bloqueadaPorAutoridad = cg.docs.some((doc) => {
            const v = doc.data() as any;
            return !v?.usuarioId || v.usuarioId === resolvedTargetUid;
          }) || cg.docs.length > 0;
        }
      }
    }

    if (bloqueadaPorAutoridad) {
      return errorResponse(
        'AUTORIDAD_RESTRINGIDA',
        'Esta elección fue fijada por dirección y no puede ser modificada por el residente.'
      );
    }

    // Determinar el instante de corte del muro móvil para esta alternativa y fecha.
    // En esta ruta, la vista efectiva de Capa 0 se materializa en memoria al leer horarios.
    // Para validar la mutación basta recalcular desde el singleton usando la configuración
    // alternativa seleccionada, con fallback final a la referencia global del proceso.
    let horaCorte: string | undefined;
    const configAlt = singleton?.configuracionesAlternativas?.[data.configuracionAlternativaId];
    const horarioSolicitudId = configAlt?.horarioSolicitudComidaId;
    if (horarioSolicitudId && singleton?.horariosSolicitud) {
      horaCorte = calcularHorarioReferenciaSolicitud(
        data.fecha,
        horarioSolicitudId,
        singleton.horariosSolicitud
      );
    } else {
      horaCorte = singleton?.fechaHoraReferenciaUltimaSolicitud;
    }

    const referenciaProceso = singleton?.fechaHoraReferenciaUltimaSolicitud;
    if (horaCorte && referenciaProceso && estaMuroMovilCerrado(horaCorte, referenciaProceso)) {
      return errorResponse('MURO_MOVIL_CERRADO', 'El plazo para modificar este tiempo de comida ya cerró.');
    }

    const configAlternativa = singleton?.configuracionesAlternativas?.[data.configuracionAlternativaId];
    if (!configAlternativa) {
      return errorResponse('VALIDATION_ERROR', 'La configuración alternativa no existe en la residencia.');
    }

    const requiereAprobacion = Boolean(configAlternativa?.requiereAprobacion);
    if (requiereAprobacion && !data.contingenciaConfigAlternativaId) {
      return errorResponse(
        'VALIDATION_ERROR',
        'Esta alternativa requiere contingencia de aprobación.',
        [{ path: ['contingenciaConfigAlternativaId'], message: 'Campo obligatorio cuando requiere aprobación.' }]
      );
    }

    await excepcionRef.set(
      {
        usuarioId: resolvedTargetUid,
        residenciaId,
        fecha: data.fecha,
        tiempoComidaId: data.tiempoComidaId,
        configuracionAlternativaId: data.configuracionAlternativaId,
        esAlternativaAlterada: data.esAlternativaAlterada,
        origenAutoridad,
        estadoAprobacion: requiereAprobacion ? 'pendiente' : 'no_requerida',
        ...(data.contingenciaConfigAlternativaId
          ? { contingenciaConfigAlternativaId: data.contingenciaConfigAlternativaId }
          : {}),
        timestampActualizacion: FieldValue.serverTimestamp(),
        timestampCreacion: existenteSnap.exists
          ? (existenteSnap.data() as any)?.timestampCreacion ?? FieldValue.serverTimestamp()
          : FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return { success: true };
  } catch (error) {
    return errorResponse('INTERNAL', 'No se pudo guardar la excepción.', error);
  }
}