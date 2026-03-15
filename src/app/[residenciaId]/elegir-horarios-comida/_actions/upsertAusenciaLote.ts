"use server";

import { db, FieldValue } from '@/lib/firebaseAdmin';
import { eachDayOfInterval, format, parseISO } from 'date-fns';
import { FormAusenciaLote, FormAusenciaLoteSchema } from 'shared/schemas/elecciones/ui.schema';
import { ActionResponse } from 'shared/models/types';
import { convertirHoraAMinutos } from 'shared/utils/commonUtils';
import { resolveTargetUsuarioContext } from './_targetUsuario';

function errorResponse(
  code: NonNullable<ActionResponse<void>['error']>['code'],
  message: string,
  detalles?: unknown
): ActionResponse<void> {
  return { success: false, error: { code, message, detalles } };
}

function dayOfWeek(fechaIso: string): string {
  const dias = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
  const fecha = new Date(`${fechaIso}T00:00:00Z`);
  return dias[fecha.getUTCDay()] ?? 'lunes';
}

function buildExcepcionDocId(fecha: string, tiempoComidaId: string): string {
  return `${fecha}__${tiempoComidaId}`;
}

function compararHorasReferencia(horaA: string | null | undefined, horaB: string | null | undefined): number {
  const minutosA = convertirHoraAMinutos(horaA);
  const minutosB = convertirHoraAMinutos(horaB);

  if (minutosA !== null && minutosB !== null) {
    return minutosA - minutosB;
  }

  if (minutosA !== null) return -1;
  if (minutosB !== null) return 1;

  return String(horaA ?? '').localeCompare(String(horaB ?? ''));
}

function getTiemposDelDia(singleton: any, fechaIso: string): string[] {
  const dia = dayOfWeek(fechaIso);
  return Object.entries(singleton?.esquemaSemanal ?? {})
    .filter(([, tiempo]: any) => tiempo?.estaActivo === true && tiempo?.dia === dia)
    .sort((a: any, b: any) => {
      const grupoA = singleton?.gruposComidas?.[a[1].grupoComida]?.orden ?? Number.MAX_SAFE_INTEGER;
      const grupoB = singleton?.gruposComidas?.[b[1].grupoComida]?.orden ?? Number.MAX_SAFE_INTEGER;
      if (grupoA !== grupoB) return grupoA - grupoB;
      return compararHorasReferencia(a[1].horaReferencia, b[1].horaReferencia);
    })
    .map(([id]) => id);
}

function expandirSlotsAfectados(singleton: any, payload: FormAusenciaLote): Array<{ fecha: string; tiempoComidaId: string }> {
  const inicio = parseISO(payload.fechaInicio);
  const fin = parseISO(payload.fechaFin);
  const fechas = eachDayOfInterval({ start: inicio, end: fin }).map((f) => format(f, 'yyyy-MM-dd'));

  const resultado: Array<{ fecha: string; tiempoComidaId: string }> = [];

  for (const fecha of fechas) {
    const tiempos = getTiemposDelDia(singleton, fecha);
    const inicioEsDia = fecha === payload.fechaInicio;
    const finEsDia = fecha === payload.fechaFin;

    const idxInicio = inicioEsDia && payload.primerTiempoAusente
      ? tiempos.indexOf(payload.primerTiempoAusente)
      : 0;
    const idxFin = finEsDia && payload.ultimoTiempoAusente
      ? tiempos.indexOf(payload.ultimoTiempoAusente)
      : tiempos.length - 1;

    const inicioNorm = idxInicio === -1 ? 0 : idxInicio;
    const finNorm = idxFin === -1 ? tiempos.length - 1 : idxFin;

    for (let i = inicioNorm; i <= finNorm; i += 1) {
      const tiempoComidaId = tiempos[i];
      if (tiempoComidaId) {
        resultado.push({ fecha, tiempoComidaId });
      }
    }
  }

  return resultado;
}

function getAlternativaAusencia(singleton: any, tiempoComidaId: string): string | null {
  const tiempo = singleton?.esquemaSemanal?.[tiempoComidaId];
  if (!tiempo) return null;

  const candidatos = [tiempo.alternativas?.principal, ...(tiempo.alternativas?.secundarias ?? [])].filter(Boolean);
  for (const configId of candidatos) {
    const config = singleton?.configuracionesAlternativas?.[configId];
    const definicion = config ? singleton?.catalogoAlternativas?.[config.definicionAlternativaId] : undefined;
    if (definicion?.tipo === 'noComoEnCasa' || definicion?.tipo === 'ayuno') {
      return configId;
    }
  }

  return tiempo.alternativas?.principal ?? null;
}

export async function upsertAusenciaLote(
  residenciaId: string,
  payload: FormAusenciaLote,
  targetUid?: string
): Promise<ActionResponse<void>> {
  try {
    const parsed = FormAusenciaLoteSchema.safeParse(payload);
    if (!parsed.success) {
      return errorResponse('VALIDATION_ERROR', 'Payload de ausencia inválido.', parsed.error.issues);
    }

    const targetContext = await resolveTargetUsuarioContext(residenciaId, targetUid);
    if (!targetContext.success) {
      return { success: false, error: targetContext.error };
    }

    const { targetUid: resolvedTargetUid, origenAutoridad } = targetContext.data;

    const data = parsed.data;
    const singletonSnap = await db.doc(`residencias/${residenciaId}/configuracion/general`).get();
    if (!singletonSnap.exists) {
      return errorResponse('INTERNAL', 'No existe configuración general de residencia.');
    }

    const singleton = singletonSnap.data() as any;
    const tiemposInicio = getTiemposDelDia(singleton, data.fechaInicio);
    const primerTiempo = data.primerTiempoAusente ?? tiemposInicio[0];
    if (!primerTiempo) {
      return errorResponse('VALIDATION_ERROR', 'No hay tiempos de comida disponibles para el día de inicio.');
    }

    if (data.fechaFin < data.fechaInicio) {
      return errorResponse('VALIDATION_ERROR', 'La fecha fin no puede ser menor a la fecha inicio.');
    }

    if (data.fechaInicio === data.fechaFin && data.primerTiempoAusente && data.ultimoTiempoAusente) {
      const tiemposMismoDia = getTiemposDelDia(singleton, data.fechaInicio);
      const idxInicio = tiemposMismoDia.indexOf(data.primerTiempoAusente);
      const idxFin = tiemposMismoDia.indexOf(data.ultimoTiempoAusente);

      if (idxInicio === -1 || idxFin === -1) {
        return errorResponse('VALIDATION_ERROR', 'Los tiempos seleccionados no existen para la fecha indicada.');
      }

      if (idxInicio > idxFin) {
        return errorResponse('VALIDATION_ERROR', 'El tiempo final no puede ser anterior al tiempo inicial.');
      }
    }

    const ausenciaRef = db.doc(`usuarios/${resolvedTargetUid}/ausencias/${data.fechaInicio}`);
    await ausenciaRef.set({
      usuarioId: resolvedTargetUid,
      residenciaId,
      fechaInicio: data.fechaInicio,
      primerTiempoAusente: data.primerTiempoAusente ?? null,
      fechaFin: data.fechaFin,
      ultimoTiempoAusente: data.ultimoTiempoAusente ?? null,
      retornoPendienteConfirmacion: data.retornoPendienteConfirmacion ?? false,
      motivo: data.motivo ?? null,
      timestampCreacion: FieldValue.serverTimestamp(),
    }, { merge: true });

    const slots = expandirSlotsAfectados(singleton, data);

    const CHUNK = 300;
    for (let i = 0; i < slots.length; i += CHUNK) {
      const lote = slots.slice(i, i + CHUNK);
      const batch = db.batch();

      for (const slot of lote) {
        const docId = buildExcepcionDocId(slot.fecha, slot.tiempoComidaId);
        const excepcionRef = db.doc(`usuarios/${resolvedTargetUid}/excepciones/${docId}`);
        const existente = await excepcionRef.get();

        if (existente.exists && (existente.data() as any)?.origenAutoridad === 'director-restringido') {
          continue;
        }

        const alternativaAusencia = getAlternativaAusencia(singleton, slot.tiempoComidaId);
        if (!alternativaAusencia) {
          continue;
        }

        batch.set(excepcionRef, {
          usuarioId: resolvedTargetUid,
          residenciaId,
          fecha: slot.fecha,
          tiempoComidaId: slot.tiempoComidaId,
          configuracionAlternativaId: alternativaAusencia,
          esAlternativaAlterada: false,
          origenAutoridad,
          estadoAprobacion: 'no_requerida',
          contingenciaConfigAlternativaId: undefined,
          timestampActualizacion: FieldValue.serverTimestamp(),
          timestampCreacion: existente.exists
            ? (existente.data() as any)?.timestampCreacion ?? FieldValue.serverTimestamp()
            : FieldValue.serverTimestamp(),
        }, { merge: true });
      }

      await batch.commit();
    }

    return { success: true };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error ?? 'Error desconocido');
    return errorResponse('INTERNAL', `No se pudo registrar la ausencia: ${detail}`, error);
  }
}