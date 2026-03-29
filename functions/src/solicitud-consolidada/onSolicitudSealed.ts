import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https';
import * as functions from 'firebase-functions/v2';

import { db, FieldValue } from '../lib/firebase';
import { getCallerSecurityInfo } from '../common/security';
import { logAction } from '../common/logging';
import {
  SellarSolicitudConsolidadaPayload,
  SellarSolicitudConsolidadaPayloadSchema,
} from '../../../shared/schemas/solicitudConsolidada.schema';
import { enviarCorreoSolicitudConsolidada } from './emailSender';
import { generarPdfSolicitudConsolidada } from './pdfGenerator';

type TipoComunicacion = 'PREVIA' | 'DEFINITIVA' | 'CANCELACION';

interface SolicitudActividadRef {
  id: string;
  tipoComunicacion: TipoComunicacion;
}

function getEffectiveRoles(
  claims: Record<string, any> | undefined,
  profileRoles: string[] | undefined,
): string[] {
  const claimRolesRaw = claims?.roles;
  const claimRoles = Array.isArray(claimRolesRaw)
    ? claimRolesRaw.filter((role): role is string => typeof role === 'string')
    : [];

  const singleRole = typeof claims?.role === 'string' ? claims.role : null;
  if (singleRole && !claimRoles.includes(singleRole)) {
    claimRoles.push(singleRole);
  }

  if (claimRoles.length > 0) {
    return claimRoles;
  }

  return Array.isArray(profileRoles)
    ? profileRoles.filter((role): role is string => role.trim().length > 0)
    : [];
}

function dedupeStringIds(ids: string[]): string[] {
  return Array.from(new Set(ids.filter((id) => id.trim().length > 0)));
}

function buildActividadPatch(tipoComunicacion: TipoComunicacion): Record<string, unknown> {
  if (tipoComunicacion === 'PREVIA') {
    return {
      avisoAdministracion: 'comunicacion_previa',
      timestampModificacion: FieldValue.serverTimestamp(),
    };
  }

  if (tipoComunicacion === 'DEFINITIVA') {
    return {
      avisoAdministracion: 'comunicacion_definitiva',
      estado: 'inscripcion_cerrada',
      timestampModificacion: FieldValue.serverTimestamp(),
    };
  }

  return {
    avisoAdministracion: 'cancelado',
    estado: 'cancelada',
    timestampModificacion: FieldValue.serverTimestamp(),
  };
}

function extractSnapshotActividadRefs(solicitudData: any): SolicitudActividadRef[] {
  const raw = solicitudData?.entidadesComunicadas?.actividades;
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((item: any) => ({
      id: typeof item?.id === 'string' ? item.id : '',
      tipoComunicacion: item?.tipoComunicacion as TipoComunicacion,
    }))
    .filter((item: SolicitudActividadRef) => {
      return item.id.length > 0 && ['PREVIA', 'DEFINITIVA', 'CANCELACION'].includes(item.tipoComunicacion);
    });
}

function extractSnapshotNovedadIds(solicitudData: any): string[] {
  const raw = solicitudData?.entidadesComunicadas?.novedadesOperativas;
  if (!Array.isArray(raw)) {
    return [];
  }

  return dedupeStringIds(
    raw
      .map((item: any) => (typeof item?.novedadOperativaId === 'string' ? item.novedadOperativaId : ''))
      .filter((id: string) => id.length > 0),
  );
}

function hasSolicitarComensalesPermission(profile: any): boolean {
  const permiso = profile?.asistente?.solicitarComensales;
  if (!permiso || typeof permiso !== 'object') {
    return false;
  }

  return permiso.nivelAcceso === 'Todas' || permiso.nivelAcceso === 'Propias';
}

export const sellarSolicitudConsolidada = onCall(
  {
    region: 'us-central1',
    cors: ['http://localhost:3001', 'http://127.0.0.1:3001'],
    timeoutSeconds: 300,
  },
  async (request: CallableRequest<SellarSolicitudConsolidadaPayload>) => {
    const callerInfo = await getCallerSecurityInfo(request.auth);

    const parsedPayload = SellarSolicitudConsolidadaPayloadSchema.safeParse(request.data);
    if (!parsedPayload.success) {
      const zodErrors = parsedPayload.error.flatten();
      throw new HttpsError('invalid-argument', 'Payload inválido para sellar solicitud consolidada.', {
        fieldErrors: zodErrors.fieldErrors,
        formErrors: zodErrors.formErrors,
      });
    }

    const payload = parsedPayload.data;
    const roles = getEffectiveRoles(callerInfo.claims, callerInfo.profile?.roles as string[] | undefined);
    const isDirector = roles.includes('director');
    const isAsistente = roles.includes('asistente');

    if (!isDirector && !(isAsistente && hasSolicitarComensalesPermission(callerInfo.profile))) {
      throw new HttpsError('permission-denied', 'Solo directores o asistentes con solicitarComensales pueden sellar solicitudes.');
    }

    if (!callerInfo.profile?.residenciaId || callerInfo.profile.residenciaId !== payload.residenciaId) {
      throw new HttpsError('permission-denied', 'No autorizado para operar la residencia indicada.');
    }

    const solicitudRef = db
      .collection('residencias')
      .doc(payload.residenciaId)
      .collection('solicitudesConsolidadas')
      .doc(payload.solicitudId);

    const totalWrites = await db.runTransaction(async (tx) => {
      const solicitudSnap = await tx.get(solicitudRef);
      if (!solicitudSnap.exists) {
        throw new HttpsError('not-found', 'Solicitud consolidada no encontrada.');
      }

      const solicitudData = solicitudSnap.data() as any;
      const estadoDocumento = solicitudData?.estadoDocumento;

      if (estadoDocumento === 'CONSOLIDADO') {
        throw new HttpsError('failed-precondition', 'La solicitud ya fue consolidada y no puede sellarse nuevamente.');
      }

      if (estadoDocumento !== payload.expectedEstadoDocumento) {
        throw new HttpsError('failed-precondition', `Estado inesperado de solicitud: ${String(estadoDocumento)}`);
      }

      const snapshotActividadRefs = extractSnapshotActividadRefs(solicitudData);
      const activityPatchMap = new Map<string, TipoComunicacion>();

      for (const item of snapshotActividadRefs) {
        activityPatchMap.set(item.id, item.tipoComunicacion);
      }
      for (const item of payload.actividadPatches) {
        activityPatchMap.set(item.actividadId, item.tipoComunicacion);
      }

      const actividadIds = dedupeStringIds(Array.from(activityPatchMap.keys()));
      const atencionIds = dedupeStringIds(payload.atencionIds);
      const alteracionIds = dedupeStringIds(payload.alteracionIds);
      const novedadIds = dedupeStringIds(
        payload.novedadIds.length > 0 ? payload.novedadIds : extractSnapshotNovedadIds(solicitudData),
      );

      const comensalesSnap = await tx.get(solicitudRef.collection('comensales'));
      const comensalesCount = comensalesSnap.docs.length;

      // 1 root + N comensales + laterales. Límite estricto por requisito de atomicidad.
      const writesPlanned =
        1 +
        comensalesCount +
        actividadIds.length +
        atencionIds.length +
        alteracionIds.length +
        novedadIds.length;

      if (writesPlanned > 500) {
        throw new HttpsError(
          'failed-precondition',
          `Se excede el límite de 500 escrituras atómicas. Planificadas: ${writesPlanned}.`,
        );
      }

      tx.update(solicitudRef, {
        estadoDocumento: 'CONSOLIDADO',
        timestampCierreOficial: FieldValue.serverTimestamp(),
        estadoGeneracionPdf: 'PENDIENTE',
      });

      for (const comensalDoc of comensalesSnap.docs) {
        tx.update(comensalDoc.ref, {
          timestampConsolidacion: FieldValue.serverTimestamp(),
        });
      }

      for (const actividadId of actividadIds) {
        const tipoComunicacion = activityPatchMap.get(actividadId);
        if (!tipoComunicacion) continue;

        tx.update(
          db.collection('residencias').doc(payload.residenciaId).collection('actividades').doc(actividadId),
          buildActividadPatch(tipoComunicacion),
        );
      }

      for (const atencionId of atencionIds) {
        tx.update(
          db.collection('residencias').doc(payload.residenciaId).collection('atenciones').doc(atencionId),
          {
            avisoAdministracion: 'comunicado',
          },
        );
      }

      for (const novedadId of novedadIds) {
        tx.update(
          db.collection('residencias').doc(payload.residenciaId).collection('novedadesOperativas').doc(novedadId),
          {
            estado: 'consolidado',
            consolidadorId: callerInfo.uid,
          },
        );
      }

      for (const alteracionId of alteracionIds) {
        const alteracionRef = db
          .collection('residencias')
          .doc(payload.residenciaId)
          .collection('alteracionesHorario')
          .doc(alteracionId);

        const alteracionSnap = await tx.get(alteracionRef);
        if (!alteracionSnap.exists) {
          continue;
        }

        const alteracionData = alteracionSnap.data() as any;
        const tiempos = alteracionData?.tiemposComidaAfectados;
        if (!tiempos || typeof tiempos !== 'object') {
          continue;
        }

        const nestedPatch: Record<string, unknown> = {};
        for (const tiempoComidaId of Object.keys(tiempos)) {
          const estadoActual = tiempos[tiempoComidaId]?.estado;
          if (estadoActual === 'comunicado') {
            nestedPatch[`tiemposComidaAfectados.${tiempoComidaId}.estado`] = 'bloqueado';
          }
        }

        if (Object.keys(nestedPatch).length > 0) {
          tx.update(alteracionRef, nestedPatch);
        }
      }

      return writesPlanned;
    });

    await logAction(
      { uid: callerInfo.uid, token: callerInfo.claims },
      {
        action: 'SOLICITUD_CONSOLIDADA_SELLADA',
        targetId: payload.solicitudId,
        targetCollection: 'solicitudesConsolidadas',
        residenciaId: payload.residenciaId,
        details: {
          totalWrites,
        },
      },
    );

    return {
      success: true,
      solicitudId: payload.solicitudId,
      totalWrites,
      message: 'Solicitud consolidada sellada correctamente.',
    };
  },
);

export const onSolicitudConsolidadaSealed = onDocumentUpdated(
  {
    document: 'residencias/{residenciaId}/solicitudesConsolidadas/{solicitudId}',
    region: 'us-central1',
    timeoutSeconds: 540,
  },
  async (event) => {
    const before = event.data?.before.data() as any;
    const after = event.data?.after.data() as any;

    if (!before || !after) {
      return;
    }

    if (after.estadoDocumento !== 'CONSOLIDADO') {
      return;
    }

    if (before.estadoDocumento === 'CONSOLIDADO' && before.estadoGeneracionPdf === after.estadoGeneracionPdf) {
      return;
    }

    if (after.estadoGeneracionPdf !== 'PENDIENTE') {
      return;
    }

    const residenciaId = String(event.params.residenciaId || '');
    const solicitudId = String(event.params.solicitudId || '');
    if (!residenciaId || !solicitudId) {
      return;
    }

    const solicitudRef = db
      .collection('residencias')
      .doc(residenciaId)
      .collection('solicitudesConsolidadas')
      .doc(solicitudId);

    const acquired = await db.runTransaction(async (tx) => {
      const snap = await tx.get(solicitudRef);
      if (!snap.exists) {
        return false;
      }
      const current = snap.data() as any;
      if (current?.estadoDocumento !== 'CONSOLIDADO' || current?.estadoGeneracionPdf !== 'PENDIENTE') {
        return false;
      }

      tx.update(solicitudRef, {
        estadoGeneracionPdf: 'GENERANDO',
      });
      return true;
    });

    if (!acquired) {
      return;
    }

    try {
      const pdfResult = await generarPdfSolicitudConsolidada({ residenciaId, solicitudId });

      await enviarCorreoSolicitudConsolidada({
        to: pdfResult.consolidadorEmail,
        residenciaId,
        solicitudId,
        pdfBuffer: pdfResult.buffer,
        pdfDownloadUrl: pdfResult.signedUrl,
      });

      await solicitudRef.update({
        estadoGeneracionPdf: 'COMPLETADO',
        urlPdfReporte: pdfResult.signedUrl,
      });

      await logAction(
        { uid: 'SYSTEM', token: { email: 'notificaciones@comensales.app' } },
        {
          action: 'SOLICITUD_CONSOLIDADA_PDF_GENERADO',
          targetId: solicitudId,
          targetCollection: 'solicitudesConsolidadas',
          residenciaId,
          details: {
            storagePath: pdfResult.storagePath,
          },
        },
      );
    } catch (error: any) {
      functions.logger.error('Error en worker onSolicitudConsolidadaSealed', {
        residenciaId,
        solicitudId,
        error: error?.message || String(error),
      });

      await solicitudRef.update({
        estadoGeneracionPdf: 'ERROR',
        ultimoErrorPdf: error?.message || 'Error desconocido en generación/envío de PDF',
      });

      await logAction(
        { uid: 'SYSTEM', token: { email: 'notificaciones@comensales.app' } },
        {
          action: 'SOLICITUD_CONSOLIDADA_PDF_ERROR',
          targetId: solicitudId,
          targetCollection: 'solicitudesConsolidadas',
          residenciaId,
          details: {
            error: error?.message || 'Error desconocido',
          },
        },
      );
    }
  },
);


