"use server";

import { db, FieldValue } from '@/lib/firebaseAdmin';
import { eachDayOfInterval, format, parseISO } from 'date-fns';
import { FormAusenciaLote, FormAusenciaLoteSchema } from 'shared/schemas/elecciones/ui.schema';
import { ActionResponse } from 'shared/models/types';
import { compararHorasReferencia } from 'shared/utils/commonUtils';
import { estaMuroMovilCerrado } from '../_lib/muroMovil';
import { calcularHorarioReferenciaSolicitud } from '../_lib/calcularHorarioReferenciaSolicitud';
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

type SlotAfectado = { fecha: string; tiempoComidaId: string };

function keySlot(slot: SlotAfectado): string {
  return `${slot.fecha}__${slot.tiempoComidaId}`;
}

function mapSlots(slots: SlotAfectado[]): Map<string, SlotAfectado> {
  return new Map(slots.map((slot) => [keySlot(slot), slot]));
}

function calcularDiferenciasSlots(nuevo: SlotAfectado[], original?: SlotAfectado[]) {
  const nuevoMap = mapSlots(nuevo);
  const originalMap = mapSlots(original ?? []);

  const agregados: SlotAfectado[] = [];
  const removidos: SlotAfectado[] = [];
  const cambiadosParaValidacionMuro: SlotAfectado[] = [];

  for (const [key, slot] of nuevoMap) {
    if (!originalMap.has(key)) {
      agregados.push(slot);
      cambiadosParaValidacionMuro.push(slot);
    }
  }

  for (const [key, slot] of originalMap) {
    if (!nuevoMap.has(key)) {
      removidos.push(slot);
      cambiadosParaValidacionMuro.push(slot);
    }
  }

  return { agregados, removidos, cambiadosParaValidacionMuro };
}

function getHoraCorteSlot(singleton: any, slot: SlotAfectado): string | null {
  const alternativaAusencia = getAlternativaAusencia(singleton, slot.tiempoComidaId);
  if (!alternativaAusencia) {
    return null;
  }

  const configAlt = singleton?.configuracionesAlternativas?.[alternativaAusencia];
  const horarioSolicitudId = configAlt?.horarioSolicitudComidaId;

  if (!horarioSolicitudId || !singleton?.horariosSolicitud) {
    return singleton?.fechaHoraReferenciaUltimaSolicitud ?? null;
  }

  return calcularHorarioReferenciaSolicitud(
    slot.fecha,
    horarioSolicitudId,
    singleton.horariosSolicitud
  );
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

    const slotsNuevos = expandirSlotsAfectados(singleton, data);

    const originalPayload = data.edicionOriginal
      ? {
          fechaInicio: data.edicionOriginal.fechaInicio,
          fechaFin: data.edicionOriginal.fechaFin,
          primerTiempoAusente: data.edicionOriginal.primerTiempoAusente,
          ultimoTiempoAusente: data.edicionOriginal.ultimoTiempoAusente,
          retornoPendienteConfirmacion: false,
          motivo: undefined,
        }
      : undefined;

    const slotsOriginales = originalPayload
      ? expandirSlotsAfectados(singleton, originalPayload)
      : [];

    const { removidos, cambiadosParaValidacionMuro } = calcularDiferenciasSlots(
      slotsNuevos,
      slotsOriginales
    );

    const slotsValidacion = originalPayload ? cambiadosParaValidacionMuro : slotsNuevos;
    const referenciaProceso = singleton?.fechaHoraReferenciaUltimaSolicitud;

    // En edición, permitir cambios siempre que no toquen slots detrás del muro móvil.
    for (const slot of slotsValidacion) {
      const horaCorte = getHoraCorteSlot(singleton, slot);
      if (horaCorte && referenciaProceso && estaMuroMovilCerrado(horaCorte, referenciaProceso)) {
        return errorResponse(
          'MURO_MOVIL_CERRADO',
          `No se puede modificar la ausencia porque afecta el tiempo '${slot.tiempoComidaId}' del ${slot.fecha}, ya cerrado por muro móvil.`
        );
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

    // Si cambió la fecha de inicio en modo edición, limpiar el doc anterior para evitar duplicados.
    if (data.edicionOriginal?.fechaInicio && data.edicionOriginal.fechaInicio !== data.fechaInicio) {
      await db.doc(`usuarios/${resolvedTargetUid}/ausencias/${data.edicionOriginal.fechaInicio}`).delete().catch(() => undefined);
    }

    const CHUNK = 300;

    // 1) Eliminar excepciones de slots que salen de la ausencia editada.
    for (let i = 0; i < removidos.length; i += CHUNK) {
      const lote = removidos.slice(i, i + CHUNK);
      const batch = db.batch();

      for (const slot of lote) {
        const docId = buildExcepcionDocId(slot.fecha, slot.tiempoComidaId);
        const excepcionRef = db.doc(`usuarios/${resolvedTargetUid}/excepciones/${docId}`);
        const existente = await excepcionRef.get();
        if (!existente.exists) {
          continue;
        }

        const dataEx = existente.data() as any;
        if (dataEx?.origenAutoridad === 'director-restringido') {
          continue;
        }

        batch.delete(excepcionRef);
      }

      await batch.commit();
    }

    // 2) Upsert de excepciones para nuevos slots activos de la ausencia.
    for (let i = 0; i < slotsNuevos.length; i += CHUNK) {
      const lote = slotsNuevos.slice(i, i + CHUNK);
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