"use server";

import { db } from '@/lib/firebaseAdmin';
import { eachDayOfInterval, format, parseISO } from 'date-fns';
import { CargaHorariosUI } from 'shared/schemas/elecciones/ui.schema';
import { FechaIsoSchema } from 'shared/schemas/fechas';
import { ActionResponse } from 'shared/models/types';
import { AlteracionDiaria } from 'shared/schemas/alteraciones';
import { generarPayloadHorariosUI } from '../_lib/orquestadorUI';
import { resolveTargetUsuarioContext } from './_targetUsuario';
import { chunkArray } from 'shared/utils/serverUtils';
import { compararHorasReferencia, slugify } from 'shared/utils/commonUtils';

type AlteracionDiariaDoc = AlteracionDiaria & {
  id: string;
};

type ActividadDoc = {
  id: string;
  nombre?: string;
  titulo?: string;
  fechaInicio: string;
  fechaFin: string;
  tiempoComidaInicioId?: string;
  tiempoComidaFinId?: string;
  estado?: string;
  planComidas?: Array<{
    fechaComida?: string;
    nombreTiempoComida?: string;
    tiempoComidaId?: string;
  }>;
};

type InscripcionActividadDoc = {
  actividadId?: string;
  usuarioId?: string;
  estado?: string;
};

const INSCRIPCIONES_IN_CHUNK_SIZE = 30;
const ESTADO_INSCRIPCION_CONFIRMADA = 'confirmada';
const EHC_DEBUG = process.env.NODE_ENV !== 'production' || process.env.EHC_DEBUG === '1';

function esInscripcionEnRutaResidencia(
  doc: FirebaseFirestore.QueryDocumentSnapshot,
  residenciaId: string
): boolean {
  const actividadRef = doc.ref.parent.parent;
  const actividadesCollection = actividadRef?.parent;
  const residenciaRef = actividadesCollection?.parent;

  return doc.ref.parent.id === 'inscripciones'
    && actividadesCollection?.id === 'actividades'
    && residenciaRef?.id === residenciaId;
}

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

function normalizarTexto(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function resolverTiempoComidaIdDesdePlan(
  singleton: any,
  fechaComida: string,
  detalle: { nombreTiempoComida?: string; tiempoComidaId?: string }
): string | undefined {
  const esquema = singleton.esquemaSemanal ?? {};
  const dia = dayOfWeek(fechaComida);

  if (typeof detalle.tiempoComidaId === 'string') {
    const idNormalizado = slugify(detalle.tiempoComidaId, 120);
    const tiempoDirecto = esquema[idNormalizado];
    if (tiempoDirecto?.estaActivo === true && normalizarTexto(String(tiempoDirecto?.dia ?? '')) === dia) {
      return idNormalizado;
    }
  }

  if (typeof detalle.nombreTiempoComida !== 'string') {
    return undefined;
  }

  const nombreObjetivo = normalizarTexto(detalle.nombreTiempoComida);
  const tiempo = Object.entries(esquema).find(([, value]: any) => {
    return value?.estaActivo === true
      && normalizarTexto(String(value?.dia ?? '')) === dia
      && normalizarTexto(String(value?.nombre ?? '')) === nombreObjetivo;
  });

  return tiempo?.[0];
}

function ordenarTiemposDelDia(singleton: any, fechaIso: string): string[] {
  const dia = dayOfWeek(fechaIso);

  return Object.entries(singleton.esquemaSemanal ?? {})
    .filter(([, tiempo]: any) => tiempo?.estaActivo === true && normalizarTexto(String(tiempo?.dia ?? '')) === dia)
    .sort((a: any, b: any) => {
      const grupoA = singleton.gruposComidas?.[a[1]?.grupoComida];
      const grupoB = singleton.gruposComidas?.[b[1]?.grupoComida];
      const ordenGrupoA = grupoA?.orden ?? Number.MAX_SAFE_INTEGER;
      const ordenGrupoB = grupoB?.orden ?? Number.MAX_SAFE_INTEGER;

      if (ordenGrupoA !== ordenGrupoB) {
        return ordenGrupoA - ordenGrupoB;
      }

      return compararHorasReferencia(a[1]?.horaReferencia, b[1]?.horaReferencia);
    })
    .map(([tiempoComidaId]) => tiempoComidaId);
}

function resolverIndiceTiempo(tiemposDelDia: string[], tiempoComidaId?: string): number | undefined {
  if (typeof tiempoComidaId !== 'string' || tiempoComidaId.length === 0) {
    return undefined;
  }

  const objetivo = slugify(tiempoComidaId, 120);
  const idx = tiemposDelDia.findIndex((id) => slugify(id, 120) === objetivo);
  return idx >= 0 ? idx : undefined;
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
    const nombreActividad = actividad.nombre ?? actividad.titulo ?? actividad.id;
    const plan = actividad.planComidas ?? [];
    if (EHC_DEBUG) {
      console.log('[EHC][obtenerCargaHorarios][mapActividadesACapa1] evaluando actividad', {
        actividadId: actividad.id,
        nombre: actividad.nombre,
        fechaInicio: actividad.fechaInicio,
        fechaFin: actividad.fechaFin,
        itemsPlan: plan.length,
      });
    }

    for (const detalle of plan) {
      if (typeof detalle.fechaComida !== 'string') {
        continue;
      }

      if (detalle.fechaComida < fechaInicio || detalle.fechaComida > fechaFin) {
        continue;
      }

      const tiempoComidaId = resolverTiempoComidaIdDesdePlan(singleton, detalle.fechaComida, detalle);
      if (!tiempoComidaId) {
        if (EHC_DEBUG) {
          console.log('[EHC][obtenerCargaHorarios][mapActividadesACapa1] plan descartado sin tiempoComidaId', {
            actividadId: actividad.id,
            fechaComida: detalle.fechaComida,
            nombreTiempoComida: detalle.nombreTiempoComida,
            tiempoComidaId: detalle.tiempoComidaId,
          });
        }
        continue;
      }

      const principal = (singleton.esquemaSemanal?.[tiempoComidaId] as any)?.alternativas?.principal;
      if (!principal) {
        if (EHC_DEBUG) {
          console.log('[EHC][obtenerCargaHorarios][mapActividadesACapa1] tiempo sin principal', {
            actividadId: actividad.id,
            tiempoComidaId,
          });
        }
        continue;
      }

      resultado.push({
        actividadId: actividad.id,
        nombreActividad,
        configuracionAlternativaId: principal,
        fechaInicio: detalle.fechaComida,
        fechaFin: detalle.fechaComida,
        tiemposComidaIds: [tiempoComidaId],
      });

      if (EHC_DEBUG) {
        console.log('[EHC][obtenerCargaHorarios][mapActividadesACapa1] actividad mapeada a capa1', {
          actividadId: actividad.id,
          fechaComida: detalle.fechaComida,
          tiempoComidaId,
          configuracionAlternativaId: principal,
        });
      }
    }

    // Compatibilidad con el esquema vigente de actividades por fronteras (sin planComidas).
    if (plan.length === 0) {
      const inicioActividad = actividad.fechaInicio > fechaInicio ? actividad.fechaInicio : fechaInicio;
      const finActividad = actividad.fechaFin < fechaFin ? actividad.fechaFin : fechaFin;

      if (inicioActividad <= finActividad) {
        const fechasActividad = buildDateRange(inicioActividad, finActividad);
        for (const fecha of fechasActividad) {
          const tiemposDelDia = ordenarTiemposDelDia(singleton, fecha);
          if (tiemposDelDia.length === 0) {
            continue;
          }

          let idxInicio = 0;
          let idxFin = tiemposDelDia.length - 1;

          if (fecha === actividad.fechaInicio) {
            const idx = resolverIndiceTiempo(tiemposDelDia, actividad.tiempoComidaInicioId);
            if (typeof idx === 'number') {
              idxInicio = idx;
            }
          }

          if (fecha === actividad.fechaFin) {
            const idx = resolverIndiceTiempo(tiemposDelDia, actividad.tiempoComidaFinId);
            if (typeof idx === 'number') {
              idxFin = idx;
            }
          }

          if (idxInicio > idxFin) {
            if (EHC_DEBUG) {
              console.log('[EHC][obtenerCargaHorarios][mapActividadesACapa1] frontera inconsistente', {
                actividadId: actividad.id,
                fecha,
                idxInicio,
                idxFin,
                tiempoComidaInicioId: actividad.tiempoComidaInicioId,
                tiempoComidaFinId: actividad.tiempoComidaFinId,
              });
            }
            continue;
          }

          for (const tiempoComidaId of tiemposDelDia.slice(idxInicio, idxFin + 1)) {
            const principal = (singleton.esquemaSemanal?.[tiempoComidaId] as any)?.alternativas?.principal;
            if (!principal) {
              continue;
            }

            resultado.push({
              actividadId: actividad.id,
              nombreActividad,
              configuracionAlternativaId: principal,
              fechaInicio: fecha,
              fechaFin: fecha,
              tiemposComidaIds: [tiempoComidaId],
            });

            if (EHC_DEBUG) {
              console.log('[EHC][obtenerCargaHorarios][mapActividadesACapa1] actividad frontera mapeada a capa1', {
                actividadId: actividad.id,
                fecha,
                tiempoComidaId,
                configuracionAlternativaId: principal,
              });
            }
          }
        }
      }
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

    const { targetUid: resolvedTargetUid } = targetContext.data;

    const fechasRango = buildDateRange(fechaInicio, fechaFin);

    if (EHC_DEBUG) {
      console.log('[EHC][obtenerCargaHorarios] inicio', {
        residenciaId,
        resolvedTargetUid,
        fechaInicio,
        fechaFin,
        dias: fechasRango.length,
      });
    }

    const singletonRef = db.doc(`residencias/${residenciaId}/configuracion/general`);
    const userRef = db.doc(`usuarios/${resolvedTargetUid}`);

    const [singletonSnap, userSnap, excepcionesSnap, ausenciasSnap, actividadesSnap, alteracionesSnap] = await Promise.all([
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
      db
        .collection(`residencias/${residenciaId}/alteracionesHorario`)
        .where('fecha', '>=', fechaInicio)
        .where('fecha', '<=', fechaFin)
        .get(),
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
    const alteracionesCapa0: AlteracionDiariaDoc[] = alteracionesSnap.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as AlteracionDiaria),
    }));

    const excepcionesUsuario = excepcionesSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as object) }));
    const ausenciasUsuario = ausenciasSnap.docs
      .map((doc) => ({ id: doc.id, ...(doc.data() as object) }))
      .filter((a: any) => a.fechaFin >= fechaInicio);

    const actividadesDocs = actividadesSnap.docs
      .map((doc) => ({ id: doc.id, ...(doc.data() as object) } as ActividadDoc))
      .filter((a) => a.fechaFin >= fechaInicio && a.estado !== 'cancelada');

    if (EHC_DEBUG) {
      console.log('[EHC][obtenerCargaHorarios] colecciones base cargadas', {
        excepciones: excepcionesUsuario.length,
        ausencias: ausenciasUsuario.length,
        alteraciones: alteracionesCapa0.length,
        actividadesEnRango: actividadesDocs.length,
      });
    }

    const actividadIds = actividadesDocs.map((a) => a.id);
    const actividadesSet = new Set(actividadIds);
    const actividadesConInscripcionConfirmada = new Set<string>();

    if (actividadIds.length > 0) {
      const lotesActividadIds = chunkArray(actividadIds, INSCRIPCIONES_IN_CHUNK_SIZE);
      if (EHC_DEBUG) {
        console.log('[EHC][obtenerCargaHorarios] consulta inscripciones por lotes', {
          actividadIds: actividadIds.length,
          lotes: lotesActividadIds.length,
          chunkSize: INSCRIPCIONES_IN_CHUNK_SIZE,
        });
      }
      const inscripcionesSnaps = await Promise.all(
        lotesActividadIds.map((lote) =>
          db
            .collectionGroup('inscripciones')
            .where('usuarioId', '==', resolvedTargetUid)
            .where('estado', '==', ESTADO_INSCRIPCION_CONFIRMADA)
            .where('actividadId', 'in', lote)
            .get()
        )
      );

      for (const snap of inscripcionesSnaps) {
        for (const doc of snap.docs) {
          if (!esInscripcionEnRutaResidencia(doc, residenciaId)) {
            continue;
          }

          const data = doc.data() as InscripcionActividadDoc;
          const actividadId = typeof data.actividadId === 'string'
            ? data.actividadId
            : doc.ref.parent.parent?.id;
          if (typeof actividadId === 'string' && actividadesSet.has(actividadId)) {
            actividadesConInscripcionConfirmada.add(actividadId);
            if (EHC_DEBUG) {
              console.log('[EHC][obtenerCargaHorarios] inscripcion confirmada vinculada', {
                inscripcionDocId: doc.id,
                actividadId,
                usuarioId: (doc.data() as InscripcionActividadDoc)?.usuarioId,
              });
            }
          }
        }
      }
    }

    const actividadesInscritas = actividadesDocs.filter((a) => actividadesConInscripcionConfirmada.has(a.id));
    const inscripcionesActividad = mapActividadesACapa1(actividadesInscritas, singleton, fechaInicio, fechaFin);

    if (EHC_DEBUG) {
      console.log('[EHC][obtenerCargaHorarios] resumen capa1', {
        actividadesInscritas: actividadesInscritas.length,
        inscripcionesActividad: inscripcionesActividad.length,
        idsActividadesInscritas: actividadesInscritas.map((a) => a.id),
      });
    }

    const payload = generarPayloadHorariosUI({
      fechasRango,
      fechaHoraReferenciaUltimaSolicitud: singleton.fechaHoraReferenciaUltimaSolicitud,
      singletonResidencia: singleton,
      alteracionesCapa0,
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