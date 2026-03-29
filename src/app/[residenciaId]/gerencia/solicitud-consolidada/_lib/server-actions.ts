'use server';

import { z } from 'zod';
import { addDays, eachDayOfInterval, format, parseISO } from 'date-fns';
import { db, FieldValue } from '@/lib/firebaseAdmin';
import { obtenerInfoUsuarioServer } from '@/lib/obtenerInfoUsuarioServer';
import { verificarPermisoGestionWrapper } from '@/lib/acceso-privilegiado';
import { compararHorasReferencia, slugify } from 'shared/utils/commonUtils';
import {
  SolicitudConsolidadaSchema,
  ComensalConsolidadoSchema,
} from 'shared/schemas/solicitudConsolidada.schema';
import { calcularHorarioReferenciaSolicitud } from '../../../elegir-horarios-comida/_lib/calcularHorarioReferenciaSolicitud';
import { densificarCapa0, type AlteracionDiariaInput } from '../../../elegir-horarios-comida/_lib/densificadorCapa0';
import { detectarInterseccionAusencia } from '../../../elegir-horarios-comida/_lib/interseccionAusencias';
import { resolverCascadaTiempoComida } from '../../../elegir-horarios-comida/_lib/motorCascada';

const MAX_USUARIOS_CONSOLIDACION = 250;
const HISTORIAL_DEFAULT_PAGE_SIZE = 30;
const HISTORIAL_MAX_PAGE_SIZE = 100;
const DIAS_HISTORIAL_INICIAL = 15;

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; message: string };

type PlainDoc<T = Record<string, unknown>> = T & { id: string };
type AntelacionSolicitud =
  | 'con_antelacion'
  | 'consolidacion_obligatoria'
  | 'con_retraso'
  | 'finalizada'
  | 'sin_aplicacion';

const EstadoActividadPendienteSchema = z.enum(['pendiente']);
const EstadoActividadFase3Schema = z.enum(['aprobada', 'inscripcion_abierta', 'inscripcion_cerrada']);

const ObtenerHistorialInputSchema = z.object({
  residenciaId: z.string().min(1),
  cursorFechaOperativa: z.string().optional(),
  pageSize: z.number().int().positive().max(HISTORIAL_MAX_PAGE_SIZE).optional(),
});

const ObtenerPendientesInputSchema = z.object({
  residenciaId: z.string().min(1),
});

const ObtenerDatosFase3InputSchema = z.object({
  residenciaId: z.string().min(1),
});

const MutacionTriageItemSchema = z.discriminatedUnion('tipo', [
  z.object({
    tipo: z.literal('actividad'),
    id: z.string().min(1),
    estado: z.enum(['aprobada', 'cancelada']),
  }),
  z.object({
    tipo: z.literal('atencion'),
    id: z.string().min(1),
    estado: z.enum(['aprobada', 'rechazada']),
  }),
  z.object({
    tipo: z.literal('dieta'),
    dietaId: z.string().min(1),
    estado: z.enum(['aprobada_director', 'no_aprobada_director']),
  }),
  z.object({
    tipo: z.literal('excepcion'),
    usuarioId: z.string().min(1),
    id: z.string().min(1),
    estadoAprobacion: z.enum(['aprobada', 'rechazada']),
  }),
  z.object({
    tipo: z.literal('novedad'),
    id: z.string().min(1),
    estado: z.enum(['aprobado', 'rechazado']),
  }),
  z.object({
    tipo: z.literal('solicitudInvitado'),
    id: z.string().min(1),
    estado: z.enum(['aprobada', 'rechazada']),
  }),
  z.object({
    tipo: z.literal('alteracion'),
    id: z.string().min(1),
    tiempoComidaId: z.string().min(1),
    estado: z.enum(['comunicado', 'revocado', 'cancelado']),
  }),
]);

const MutarTriageInputSchema = z.object({
  residenciaId: z.string().min(1),
  cambios: z.array(MutacionTriageItemSchema).min(1),
});

const CrearBorradorInputSchema = z.object({
  residenciaId: z.string().min(1),
  solicitudId: z.string().min(1),
  documento: SolicitudConsolidadaSchema,
  comensalesSolicitados: z.array(ComensalConsolidadoSchema).max(MAX_USUARIOS_CONSOLIDACION),
  overwrite: z.boolean().optional().default(false),
  avanzarMuroMovil: z.boolean().optional().default(true),
});

const CancelarSolicitudInputSchema = z.object({
  residenciaId: z.string().min(1),
  solicitudId: z.string().min(1),
});

function ok<T>(data: T): ActionResult<T> {
  return { success: true, data };
}

function fail<T>(message: string): ActionResult<T> {
  return { success: false, message };
}

function toPlain(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => toPlain(item));
  }

  if (typeof value === 'object') {
    const maybeDate = value as { toDate?: () => Date };
    if (typeof maybeDate.toDate === 'function') {
      return maybeDate.toDate().toISOString();
    }

    const output: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      output[key] = toPlain(nested);
    }
    return output;
  }

  return value;
}

function mapDocs<T = Record<string, unknown>>(
  snapshot: FirebaseFirestore.QuerySnapshot<FirebaseFirestore.DocumentData>
): PlainDoc<T>[] {
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...(toPlain(doc.data()) as T),
  }));
}

function getHoyEnZonaHoraria(zonaHoraria: string | null | undefined): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: zonaHoraria || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });

    const parts = formatter.formatToParts(new Date());
    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;
    const day = parts.find((part) => part.type === 'day')?.value;

    if (year && month && day) {
      return `${year}-${month}-${day}`;
    }
  } catch {
    // no-op fallback below
  }

  return new Date().toISOString().slice(0, 10);
}

function normalizarHoraSimple(hora: string | undefined): string {
  const raw = String(hora ?? '').replace(/^T/, '');
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(raw)) {
    return '00:00:00';
  }
  return raw.length === 5 ? `${raw}:00` : raw;
}

function fechaHoraLocal(fechaIso: string, hora: string | undefined): string {
  return `${fechaIso}T${normalizarHoraSimple(hora)}`;
}

function restarDiasIso(fechaIso: string, dias: number): string {
  const d = parseISO(fechaIso);
  d.setUTCDate(d.getUTCDate() - dias);
  return format(d, 'yyyy-MM-dd');
}

function compararFechaHoraLocal(a: string, b: string): number {
  return a.localeCompare(b);
}

function resolverAntelacionPorVentana(
  referencia: string,
  inicio: string,
  fin: string
): AntelacionSolicitud {
  if (compararFechaHoraLocal(referencia, inicio) < 0) {
    return 'con_antelacion';
  }
  if (compararFechaHoraLocal(referencia, inicio) === 0) {
    return 'consolidacion_obligatoria';
  }
  if (compararFechaHoraLocal(referencia, fin) <= 0) {
    return 'con_retraso';
  }
  return 'finalizada';
}

function obtenerDiaSemana(fechaIso: string): string {
  const dias = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
  return dias[new Date(`${fechaIso}T00:00:00Z`).getUTCDay()] ?? 'lunes';
}

function normalizarTexto(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function ordenarTiemposDelDia(singleton: Record<string, any>, fechaIso: string): string[] {
  const dia = obtenerDiaSemana(fechaIso);
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
    .map(([id]) => id);
}

function resolverIndiceTiempo(tiemposDelDia: string[], tiempoComidaId?: string): number | undefined {
  if (!tiempoComidaId) {
    return undefined;
  }
  const target = slugify(tiempoComidaId, 120);
  const idx = tiemposDelDia.findIndex((id) => slugify(id, 120) === target);
  return idx >= 0 ? idx : undefined;
}

function enumerarSlotsActividad(
  actividad: Record<string, any>,
  singleton: Record<string, any>
): Array<{ fecha: string; tiempoComidaId: string }> {
  const fechaInicio = String(actividad.fechaInicio ?? '');
  const fechaFin = String(actividad.fechaFin ?? '');
  if (!fechaInicio || !fechaFin || fechaInicio > fechaFin) {
    return [];
  }

  const fechas = eachDayOfInterval({ start: parseISO(fechaInicio), end: parseISO(fechaFin) })
    .map((date) => format(date, 'yyyy-MM-dd'));
  const slots: Array<{ fecha: string; tiempoComidaId: string }> = [];

  for (const fecha of fechas) {
    const tiemposDelDia = ordenarTiemposDelDia(singleton, fecha);
    if (tiemposDelDia.length === 0) {
      continue;
    }

    let idxInicio = 0;
    let idxFin = tiemposDelDia.length - 1;

    if (fecha === fechaInicio) {
      const idx = resolverIndiceTiempo(tiemposDelDia, actividad.tiempoComidaInicioId);
      if (typeof idx === 'number') {
        idxInicio = idx;
      }
    }

    if (fecha === fechaFin) {
      const idx = resolverIndiceTiempo(tiemposDelDia, actividad.tiempoComidaFinId);
      if (typeof idx === 'number') {
        idxFin = idx;
      }
    }

    if (idxInicio > idxFin) {
      continue;
    }

    for (const tiempoComidaId of tiemposDelDia.slice(idxInicio, idxFin + 1)) {
      slots.push({ fecha, tiempoComidaId });
    }
  }

  return slots;
}

function calcularVentanaActividad(
  actividad: Record<string, any>,
  singleton: Record<string, any>
): { inicio: string; fin: string } | null {
  const slots = enumerarSlotsActividad(actividad, singleton);
  if (slots.length === 0) {
    return null;
  }

  let minRef: string | null = null;
  let maxRef: string | null = null;

  for (const slot of slots) {
    const tiempo = singleton.esquemaSemanal?.[slot.tiempoComidaId];
    const alternativasIds = [tiempo?.alternativas?.principal, ...(tiempo?.alternativas?.secundarias ?? [])]
      .filter((id): id is string => typeof id === 'string' && id.length > 0);

    for (const configId of alternativasIds) {
      const config = singleton.configuracionesAlternativas?.[configId];
      if (!config?.horarioSolicitudComidaId) {
        continue;
      }

      const horarioRef = calcularHorarioReferenciaSolicitud(
        slot.fecha,
        config.horarioSolicitudComidaId,
        singleton.horariosSolicitud ?? {}
      );

      if (!minRef || compararFechaHoraLocal(horarioRef, minRef) < 0) {
        minRef = horarioRef;
      }
      if (!maxRef || compararFechaHoraLocal(horarioRef, maxRef) > 0) {
        maxRef = horarioRef;
      }
    }
  }

  if (!minRef || !maxRef) {
    return null;
  }

  return { inicio: minRef, fin: maxRef };
}

function calcularVentanaExcepcion(
  excepcion: Record<string, any>,
  singleton: Record<string, any>
): { inicio: string; fin: string } | null {
  const fecha = String(excepcion.fecha ?? '');
  const configId = String(excepcion.configuracionAlternativaId ?? '');
  if (!fecha || !configId) {
    return null;
  }

  const config = singleton.configuracionesAlternativas?.[configId];
  if (!config?.horarioSolicitudComidaId) {
    return null;
  }

  const fechaHoraSolicitud = calcularHorarioReferenciaSolicitud(
    fecha,
    config.horarioSolicitudComidaId,
    singleton.horariosSolicitud ?? {}
  );

  const tipoVentana = String(config?.ventanaServicio?.tipoVentana ?? 'normal');
  const baseFechaServicio = tipoVentana === 'inicia_dia_anterior' ? restarDiasIso(fecha, 1) : fecha;
  const fechaHoraInicioServicio = fechaHoraLocal(baseFechaServicio, config?.ventanaServicio?.horaInicio);

  return { inicio: fechaHoraSolicitud, fin: fechaHoraInicioServicio };
}

function calcularVentanaSolicitudInvitadoComida(
  solicitud: Record<string, any>,
  singleton: Record<string, any>
): { inicio: string; fin: string } | null {
  const contexto = solicitud.contexto as Record<string, any>;
  if (!contexto || contexto.tipo !== 'comida') {
    return null;
  }

  const fecha = String(contexto.fecha ?? '');
  const configId = String(contexto.alternativaId ?? '');
  if (!fecha || !configId) {
    return null;
  }

  const config = singleton.configuracionesAlternativas?.[configId];
  if (!config?.horarioSolicitudComidaId) {
    return null;
  }

  const fechaHoraSolicitud = calcularHorarioReferenciaSolicitud(
    fecha,
    config.horarioSolicitudComidaId,
    singleton.horariosSolicitud ?? {}
  );
  const tipoVentana = String(config?.ventanaServicio?.tipoVentana ?? 'normal');
  const baseFechaServicio = tipoVentana === 'inicia_dia_anterior' ? restarDiasIso(fecha, 1) : fecha;
  const fechaHoraInicioServicio = fechaHoraLocal(baseFechaServicio, config?.ventanaServicio?.horaInicio);
  return { inicio: fechaHoraSolicitud, fin: fechaHoraInicioServicio };
}

function calcularSiguienteCumpleanios(fechaNacimientoIso: string, hoyIso: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaNacimientoIso) || !/^\d{4}-\d{2}-\d{2}$/.test(hoyIso)) {
    return null;
  }
  const [, mm, dd] = fechaNacimientoIso.split('-');
  const [yyyyHoy] = hoyIso.split('-');
  let candidato = `${yyyyHoy}-${mm}-${dd}`;
  if (candidato < hoyIso) {
    candidato = `${String(Number(yyyyHoy) + 1)}-${mm}-${dd}`;
  }
  return candidato;
}

function tieneTiempoConEstado(data: Record<string, unknown>, estadoObjetivo: string): boolean {
  const tiempos = data.tiemposComidaAfectados;
  if (!tiempos || typeof tiempos !== 'object') {
    return false;
  }

  return Object.values(tiempos as Record<string, { estado?: string }>).some(
    (item) => item?.estado === estadoObjetivo
  );
}

async function validarAccesoSolicitudConsolidada(
  residenciaId: string
): Promise<ActionResult<{ usuarioId: string; zonaHoraria: string }>> {
  const info = await obtenerInfoUsuarioServer();
  const roles = Array.isArray(info.roles) ? info.roles : [];
  const esMaster = roles.includes('master');
  const esDirector = roles.includes('director');

  if (!info.usuarioId) {
    return fail('Usuario no autenticado.');
  }

  if (!esMaster && info.residenciaId !== residenciaId) {
    return fail('Acceso no autorizado para la residencia solicitada.');
  }

  if (esMaster || esDirector) {
    return ok({ usuarioId: info.usuarioId, zonaHoraria: info.zonaHoraria });
  }

  const acceso = await verificarPermisoGestionWrapper('solicitarComensales');
  if (acceso.error) {
    return fail('No se pudo verificar el permiso solicitarComensales.');
  }

  if (!acceso.tieneAcceso || acceso.nivelAcceso === 'Ninguna') {
    return fail('No tienes permisos para usar el modulo de solicitud consolidada.');
  }

  return ok({ usuarioId: info.usuarioId, zonaHoraria: info.zonaHoraria });
}

export async function obtenerHistorialSolicitudesConsolidadas(
  rawInput: z.input<typeof ObtenerHistorialInputSchema>
): Promise<
  ActionResult<{
    items: PlainDoc[];
    nextCursorFechaOperativa: string | null;
    hasMore: boolean;
  }>
> {
  const parsed = ObtenerHistorialInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return fail('Input invalido para obtener historial de solicitudes consolidadas.');
  }

  const { residenciaId, cursorFechaOperativa } = parsed.data;
  const pageSize = parsed.data.pageSize ?? HISTORIAL_DEFAULT_PAGE_SIZE;

  const acceso = await validarAccesoSolicitudConsolidada(residenciaId);
  if (!acceso.success) {
    return acceso;
  }

  const solicitudesRef = db
    .collection('residencias')
    .doc(residenciaId)
    .collection('solicitudesConsolidadas');

  let query: FirebaseFirestore.Query = solicitudesRef
    .where('estadoDocumento', '==', 'CONSOLIDADO')
    .orderBy('fechaOperativa', 'desc')
    .limit(pageSize + 1);

  if (cursorFechaOperativa) {
    query = query.startAfter(cursorFechaOperativa);
  } else {
    const hoy = getHoyEnZonaHoraria(acceso.data.zonaHoraria);
    const hoyDate = new Date(`${hoy}T00:00:00.000Z`);
    hoyDate.setUTCDate(hoyDate.getUTCDate() - DIAS_HISTORIAL_INICIAL);
    const fechaCorte = hoyDate.toISOString().slice(0, 10);
    query = query.where('fechaOperativa', '>=', fechaCorte);
  }

  const snap = await query.get();
  const hasMore = snap.docs.length > pageSize;
  const docs = hasMore ? snap.docs.slice(0, pageSize) : snap.docs;

  const items: PlainDoc[] = docs.map((doc) => ({
    id: doc.id,
    ...(toPlain(doc.data()) as Record<string, unknown>),
  }));

  const nextCursorFechaOperativa =
    hasMore && docs.length > 0
      ? String((docs[docs.length - 1].data() as Record<string, unknown>).fechaOperativa ?? '')
      : null;

  return ok({ items, nextCursorFechaOperativa, hasMore });
}

export async function obtenerPendientesTriageSolicitudConsolidada(
  rawInput: z.input<typeof ObtenerPendientesInputSchema>
): Promise<
  ActionResult<{
    actividades: PlainDoc[];
    atenciones: PlainDoc[];
    alteraciones: PlainDoc[];
    novedades: PlainDoc[];
    solicitudesInvitados: PlainDoc[];
    excepciones: PlainDoc[];
    dietas: Array<{ dietaId: string; [key: string]: unknown }>;
  }>
> {
  const parsed = ObtenerPendientesInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return fail('Input invalido para obtener pendientes de triage.');
  }

  const { residenciaId } = parsed.data;
  const acceso = await validarAccesoSolicitudConsolidada(residenciaId);
  if (!acceso.success) {
    return acceso;
  }

  const residenciaRef = db.collection('residencias').doc(residenciaId);

  const [
    actividadesSnap,
    atencionesSnap,
    alteracionesSnap,
    novedadesSnap,
    solicitudesInvitadosSnap,
    excepcionesPendientesSnap,
    configSnap,
  ] = await Promise.all([
    residenciaRef
      .collection('actividades')
      .where('estado', '==', EstadoActividadPendienteSchema.enum.pendiente)
      .get(),
    residenciaRef.collection('atenciones').where('estado', '==', 'pendiente').get(),
    residenciaRef.collection('alteracionesHorario').get(),
    residenciaRef.collection('novedadesOperativas').where('estado', '==', 'pendiente').get(),
    residenciaRef.collection('solicitudesInvitados').where('estado', '==', 'pendiente').get(),
    db
      .collectionGroup('excepciones')
      .where('residenciaId', '==', residenciaId)
      .where('estadoAprobacion', '==', 'pendiente')
      .get(),
    residenciaRef.collection('configuracion').doc('general').get(),
  ]);

  const alteraciones = mapDocs(alteracionesSnap).filter((item) =>
    tieneTiempoConEstado(item as Record<string, unknown>, 'propuesto')
  );

  const configData = (configSnap.exists ? toPlain(configSnap.data()) : {}) as Record<string, unknown>;
  const dietasRaw = (configData?.dietas ?? {}) as Record<string, Record<string, unknown>>;

  const dietas = Object.entries(dietasRaw)
    .filter(([, value]) => value?.estado === 'solicitada_por_residente')
    .map(([dietaId, value]) => ({ dietaId, ...value }));

  return ok({
    actividades: mapDocs(actividadesSnap),
    atenciones: mapDocs(atencionesSnap),
    alteraciones,
    novedades: mapDocs(novedadesSnap),
    solicitudesInvitados: mapDocs(solicitudesInvitadosSnap),
    excepciones: mapDocs(excepcionesPendientesSnap),
    dietas,
  });
}

export async function mutarEstadoTriageSolicitudConsolidada(
  rawInput: z.input<typeof MutarTriageInputSchema>
): Promise<ActionResult<{ cambiosAplicados: number }>> {
  const parsed = MutarTriageInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return fail('Input invalido para mutar estado del triage.');
  }

  const { residenciaId, cambios } = parsed.data;
  const acceso = await validarAccesoSolicitudConsolidada(residenciaId);
  if (!acceso.success) {
    return acceso;
  }

  const residenciaRef = db.collection('residencias').doc(residenciaId);
  const batch = db.batch();

  for (const cambio of cambios) {
    switch (cambio.tipo) {
      case 'actividad': {
        const ref = residenciaRef.collection('actividades').doc(cambio.id);
        batch.update(ref, { estado: cambio.estado });
        break;
      }
      case 'atencion': {
        const ref = residenciaRef.collection('atenciones').doc(cambio.id);
        batch.update(ref, { estado: cambio.estado });
        break;
      }
      case 'dieta': {
        const ref = residenciaRef.collection('configuracion').doc('general');
        batch.update(ref, { [`dietas.${cambio.dietaId}.estado`]: cambio.estado });
        break;
      }
      case 'excepcion': {
        const ref = db.collection('usuarios').doc(cambio.usuarioId).collection('excepciones').doc(cambio.id);
        batch.update(ref, { estadoAprobacion: cambio.estadoAprobacion });
        break;
      }
      case 'novedad': {
        const ref = residenciaRef.collection('novedadesOperativas').doc(cambio.id);
        batch.update(ref, { estado: cambio.estado });
        break;
      }
      case 'solicitudInvitado': {
        const ref = residenciaRef.collection('solicitudesInvitados').doc(cambio.id);
        batch.update(ref, { estado: cambio.estado });
        break;
      }
      case 'alteracion': {
        const ref = residenciaRef.collection('alteracionesHorario').doc(cambio.id);
        batch.update(ref, {
          [`tiemposComidaAfectados.${cambio.tiempoComidaId}.estado`]: cambio.estado,
        });
        break;
      }
      default:
        break;
    }
  }

  await batch.commit();
  return ok({ cambiosAplicados: cambios.length });
}

export async function obtenerDatosIngestaFase3SolicitudConsolidada(
  rawInput: z.input<typeof ObtenerDatosFase3InputSchema>
): Promise<
  ActionResult<{
    actividades: PlainDoc[];
    inscripciones: PlainDoc[];
    atenciones: PlainDoc[];
    alteraciones: PlainDoc[];
    novedadesOperativas: PlainDoc[];
    configuracionGeneral: PlainDoc | null;
    mensajes: PlainDoc[];
    recordatorios: PlainDoc[];
    usuarios: PlainDoc[];
    solicitudesInvitados: PlainDoc[];
    excepciones: PlainDoc[];
    ausencias: PlainDoc[];
  }>
> {
  const parsed = ObtenerDatosFase3InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return fail('Input invalido para obtener datos de ingesta de fase 3.');
  }

  const { residenciaId } = parsed.data;
  const acceso = await validarAccesoSolicitudConsolidada(residenciaId);
  if (!acceso.success) {
    return acceso;
  }

  const residenciaRef = db.collection('residencias').doc(residenciaId);
  const hoy = getHoyEnZonaHoraria(acceso.data.zonaHoraria);
  const finPeriodo = format(addDays(parseISO(hoy), 14), 'yyyy-MM-dd');

  const [actividadesSnap, atencionesSnap, alteracionesSnap, novedadesSnap, configSnap, recordatoriosSnap, usuariosSnap] =
    await Promise.all([
      residenciaRef
        .collection('actividades')
        .where('estado', 'in', EstadoActividadFase3Schema.options)
        .get(),
      residenciaRef.collection('atenciones').where('estado', '==', 'aprobada').get(),
      residenciaRef.collection('alteracionesHorario').get(),
      residenciaRef
        .collection('novedadesOperativas')
        .where('origen', '==', 'interno')
        .where('estado', '==', 'aprobado')
        .get(),
      residenciaRef.collection('configuracion').doc('general').get(),
      residenciaRef
        .collection('recordatorios')
        .where('fechaInicioValidez', '<=', finPeriodo)
        .where('fechaFinValidez', '>=', hoy)
        .get(),
      db
        .collection('usuarios')
        .where('residenciaId', '==', residenciaId)
        .where('roles', 'array-contains-any', ['residente', 'invitado'])
        .get(),
    ]);

  const usuarios = mapDocs(usuariosSnap);
  if (usuarios.length > MAX_USUARIOS_CONSOLIDACION) {
    return fail(
      `La ingesta supera el maximo de ${MAX_USUARIOS_CONSOLIDACION} usuarios para mantener la atomicidad transaccional.`
    );
  }

  const actividades = mapDocs(actividadesSnap);
  const alteraciones = mapDocs(alteracionesSnap).filter((item) =>
    tieneTiempoConEstado(item as Record<string, unknown>, 'comunicado')
  );

  const actividadRefs = actividadesSnap.docs.map((doc) => doc.ref);
  const usuarioIds = usuariosSnap.docs.map((doc) => doc.id);

  const inscripcionesPromises = actividadRefs.map((actividadRef) =>
    actividadRef.collection('inscripciones').where('estado', '==', 'confirmada').get()
  );

  const excepcionesPromises = usuarioIds.map((usuarioId) =>
    db
      .collection('usuarios')
      .doc(usuarioId)
      .collection('excepciones')
      .where('residenciaId', '==', residenciaId)
      .where('estadoAprobacion', 'in', ['aprobada', 'no_requerida'])
      .get()
  );

  const ausenciasPromises = usuarioIds.map((usuarioId) =>
    db.collection('usuarios').doc(usuarioId).collection('ausencias').where('residenciaId', '==', residenciaId).get()
  );

  const [inscripcionesSnaps, mensajesSnap, solicitudesInvitadosSnap, excepcionesSnaps, ausenciasSnaps] =
    await Promise.all([
      Promise.all(inscripcionesPromises),
      residenciaRef.collection('mensajes').where('estado', '==', 'enviado').get(),
      residenciaRef.collection('solicitudesInvitados').where('estado', '==', 'aprobada').get(),
      Promise.all(excepcionesPromises),
      Promise.all(ausenciasPromises),
    ]);

  const inscripciones = inscripcionesSnaps.flatMap((snap) => mapDocs(snap));
  const excepciones = excepcionesSnaps.flatMap((snap) => mapDocs(snap));
  const ausencias = ausenciasSnaps.flatMap((snap) => mapDocs(snap));

  return ok({
    actividades,
    inscripciones,
    atenciones: mapDocs(atencionesSnap),
    alteraciones,
    novedadesOperativas: mapDocs(novedadesSnap),
    configuracionGeneral: configSnap.exists
      ? ({ id: configSnap.id, ...(toPlain(configSnap.data()) as Record<string, unknown>) } as PlainDoc)
      : null,
    mensajes: mapDocs(mensajesSnap),
    recordatorios: mapDocs(recordatoriosSnap),
    usuarios,
    solicitudesInvitados: mapDocs(solicitudesInvitadosSnap),
    excepciones,
    ausencias,
  });
}

export async function crearBorradorSolicitudConsolidada(
  rawInput: z.input<typeof CrearBorradorInputSchema>
): Promise<ActionResult<{ solicitudId: string; comensales: number }>> {
  const parsed = CrearBorradorInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return fail('Input invalido para crear borrador de solicitud consolidada.');
  }

  const { residenciaId, solicitudId, documento, comensalesSolicitados, overwrite, avanzarMuroMovil } = parsed.data;

  const acceso = await validarAccesoSolicitudConsolidada(residenciaId);
  if (!acceso.success) {
    return acceso;
  }

  if (documento.id !== solicitudId) {
    return fail('El solicitudId no coincide con documento.id.');
  }

  if (documento.residenciaId !== residenciaId) {
    return fail('El documento de solicitud no coincide con la residencia solicitada.');
  }

  const totalOperaciones = 1 + comensalesSolicitados.length + (avanzarMuroMovil ? 1 : 0);
  if (totalOperaciones > 500) {
    return fail('La transaccion excede el limite de 500 escrituras de Firestore.');
  }

  const solicitudRef = db
    .collection('residencias')
    .doc(residenciaId)
    .collection('solicitudesConsolidadas')
    .doc(solicitudId);

  const configRef = db.collection('residencias').doc(residenciaId).collection('configuracion').doc('general');

  await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(solicitudRef);

    if (existing.exists && !overwrite) {
      throw new Error('Ya existe un borrador para este solicitudId. Usa overwrite=true para reemplazarlo.');
    }

    transaction.set(solicitudRef, {
      ...documento,
      estadoDocumento: 'BORRADOR',
      timestampCreacion: documento.timestampCreacion ?? FieldValue.serverTimestamp(),
    });

    for (const comensal of comensalesSolicitados) {
      const comensalRef = solicitudRef.collection('comensales').doc(comensal.id);
      transaction.set(comensalRef, comensal);
    }

    if (avanzarMuroMovil) {
      transaction.set(
        configRef,
        {
          fechaHoraReferenciaUltimaSolicitud: documento.fechaHoraReferenciaCorte,
          timestampUltimaSolicitud: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }
  });

  return ok({ solicitudId, comensales: comensalesSolicitados.length });
}

export async function cancelarSolicitudConsolidada(
  rawInput: z.input<typeof CancelarSolicitudInputSchema>
): Promise<ActionResult<{ solicitudId: string; estadoDocumento: 'CANCELADO' }>> {
  const parsed = CancelarSolicitudInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return fail('Input invalido para cancelar solicitud consolidada.');
  }

  const { residenciaId, solicitudId } = parsed.data;
  const acceso = await validarAccesoSolicitudConsolidada(residenciaId);
  if (!acceso.success) {
    return acceso;
  }

  const solicitudRef = db
    .collection('residencias')
    .doc(residenciaId)
    .collection('solicitudesConsolidadas')
    .doc(solicitudId);

  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(solicitudRef);
    if (!snap.exists) {
      throw new Error('No existe la solicitud consolidada a cancelar.');
    }

    transaction.update(solicitudRef, {
      estadoDocumento: 'CANCELADO',
      timestampActualizacion: FieldValue.serverTimestamp(),
    });
  });

  return ok({ solicitudId, estadoDocumento: 'CANCELADO' });
}

export const obtenerDatosFase2SolicitudConsolidada = obtenerPendientesTriageSolicitudConsolidada;
export const obtenerDatosFase3SolicitudConsolidada = obtenerDatosIngestaFase3SolicitudConsolidada;

export async function historialSolicitudesConsolidadasUI(input: {
  residenciaId: string;
  cursorFechaOperativa?: string;
  pageSize?: number;
}): Promise<ActionResult<{ tarjetas: PlainDoc[]; nextCursorFechaOperativa: string | null; hasMore: boolean }>>
{
  const result = await obtenerHistorialSolicitudesConsolidadas(input);
  if (!result.success) {
    return result;
  }

  const tarjetas = result.data.items.map((item) => {
    const resumen = Array.isArray((item as Record<string, unknown>).resumen)
      ? ((item as Record<string, unknown>).resumen as Array<Record<string, unknown>>)
      : [];

    const totalComensales = resumen.reduce((acc, fila) => {
      const value = Number(fila.totalComensalesTiempoComida ?? 0);
      return acc + (Number.isFinite(value) ? value : 0);
    }, 0);

    return {
      id: item.id,
      solicitudId: item.id,
      fechaOperativa: (item as Record<string, unknown>).fechaOperativa,
      fechaHoraReferenciaCorte: (item as Record<string, unknown>).fechaHoraReferenciaCorte,
      estadoDocumento: (item as Record<string, unknown>).estadoDocumento,
      timestampCierreOficial: (item as Record<string, unknown>).timestampCierreOficial,
      totalComensales,
      totalTiemposComida: resumen.length,
      urlPdfReporte: (item as Record<string, unknown>).urlPdfReporte,
    } as PlainDoc;
  });

  return ok({
    tarjetas,
    nextCursorFechaOperativa: result.data.nextCursorFechaOperativa,
    hasMore: result.data.hasMore,
  });
}

export async function pendientesTriajeSolicitudConsolidada(input: { residenciaId: string }): Promise<
  ActionResult<{
    referenciaSolicitud: string;
    clasificadosPorAntelacion: Record<AntelacionSolicitud, PlainDoc[]>;
    tarjetas: {
      actividades: PlainDoc[];
      atenciones: PlainDoc[];
      excepciones: PlainDoc[];
      solicitudesInvitados: PlainDoc[];
      dietas: PlainDoc[];
      novedades: PlainDoc[];
      alteraciones: PlainDoc[];
    };
  }>
> {
  const fase2 = await obtenerDatosFase2SolicitudConsolidada({ residenciaId: input.residenciaId });
  if (!fase2.success) {
    return fase2;
  }

  const configSnap = await db
    .collection('residencias')
    .doc(input.residenciaId)
    .collection('configuracion')
    .doc('general')
    .get();

  const singleton = (configSnap.exists ? toPlain(configSnap.data()) : {}) as Record<string, any>;
  const referenciaSolicitud = String(singleton?.fechaHoraReferenciaUltimaSolicitud ?? `${getHoyEnZonaHoraria('UTC')}T00:00:00`);

  const actividadesById = new Map<string, PlainDoc>(
    fase2.data.actividades.map((actividad) => [actividad.id, actividad])
  );

  const actividades = fase2.data.actividades.map((actividad) => {
    const ventana = calcularVentanaActividad(actividad as Record<string, any>, singleton);
    const antelacion = ventana
      ? resolverAntelacionPorVentana(referenciaSolicitud, ventana.inicio, ventana.fin)
      : 'sin_aplicacion';
    return {
      ...actividad,
      tipoTarjeta: 'actividad',
      ventanaHorariosAfectados: ventana,
      antelacion,
    } as PlainDoc;
  });

  const atenciones = fase2.data.atenciones.map((atencion) => {
    const data = atencion as Record<string, any>;
    const inicio = String(data.fechaHoraSolicitudComida ?? fechaHoraLocal(String(data.fechaSolicitudComida ?? ''), '00:00'));
    const fin = String(data.fechaHoraAtencion ?? inicio);
    const antelacion = resolverAntelacionPorVentana(referenciaSolicitud, inicio, fin);
    return {
      ...atencion,
      tipoTarjeta: 'atencion',
      ventanaHorariosAfectados: { inicio, fin },
      antelacion,
    } as PlainDoc;
  });

  const excepciones = fase2.data.excepciones.map((excepcion) => {
    const ventana = calcularVentanaExcepcion(excepcion as Record<string, any>, singleton);
    const antelacion = ventana
      ? resolverAntelacionPorVentana(referenciaSolicitud, ventana.inicio, ventana.fin)
      : 'sin_aplicacion';
    return {
      ...excepcion,
      tipoTarjeta: 'excepcion',
      ventanaHorariosAfectados: ventana,
      antelacion,
    } as PlainDoc;
  });

  const solicitudesInvitados: PlainDoc[] = [];
  for (const solicitud of fase2.data.solicitudesInvitados) {
    const contexto = (solicitud as Record<string, any>).contexto as Record<string, any>;
    let ventana: { inicio: string; fin: string } | null = null;

    if (contexto?.tipo === 'comida') {
      ventana = calcularVentanaSolicitudInvitadoComida(solicitud as Record<string, any>, singleton);
    } else if (contexto?.tipo === 'actividad') {
      const actividadId = String(contexto.actividadId ?? '');
      let actividad = actividadId ? actividadesById.get(actividadId) : undefined;
      if (!actividad && actividadId) {
        const extraActividad = await db
          .collection('residencias')
          .doc(input.residenciaId)
          .collection('actividades')
          .doc(actividadId)
          .get();
        if (extraActividad.exists) {
          actividad = { id: extraActividad.id, ...(toPlain(extraActividad.data()) as Record<string, unknown>) } as PlainDoc;
        }
      }

      if (actividad) {
        ventana = calcularVentanaActividad(actividad as Record<string, any>, singleton);
      }
    }

    const antelacion = ventana
      ? resolverAntelacionPorVentana(referenciaSolicitud, ventana.inicio, ventana.fin)
      : 'sin_aplicacion';

    solicitudesInvitados.push({
      ...solicitud,
      tipoTarjeta: 'solicitudInvitado',
      ventanaHorariosAfectados: ventana,
      antelacion,
    });
  }

  const dietas = fase2.data.dietas.map((dieta) => ({
    ...dieta,
    id: String(dieta.dietaId),
    tipoTarjeta: 'dieta',
    ventanaHorariosAfectados: null,
    antelacion: 'sin_aplicacion' as AntelacionSolicitud,
  })) as PlainDoc[];

  const novedades = fase2.data.novedades.map((novedad) => ({
    ...novedad,
    tipoTarjeta: 'novedad',
    ventanaHorariosAfectados: null,
    antelacion: 'sin_aplicacion' as AntelacionSolicitud,
  })) as PlainDoc[];

  const alteraciones = fase2.data.alteraciones.map((alteracion) => ({
    ...alteracion,
    tipoTarjeta: 'alteracion',
    ventanaHorariosAfectados: null,
    antelacion: 'sin_aplicacion' as AntelacionSolicitud,
  })) as PlainDoc[];

  const buckets: Record<AntelacionSolicitud, PlainDoc[]> = {
    con_antelacion: [],
    consolidacion_obligatoria: [],
    con_retraso: [],
    finalizada: [],
    sin_aplicacion: [],
  };

  const allTarjetas = [
    ...actividades,
    ...atenciones,
    ...excepciones,
    ...solicitudesInvitados,
    ...dietas,
    ...novedades,
    ...alteraciones,
  ];

  for (const tarjeta of allTarjetas) {
    const estado = (tarjeta as Record<string, any>).antelacion as AntelacionSolicitud;
    buckets[estado]?.push(tarjeta);
  }

  return ok({
    referenciaSolicitud,
    clasificadosPorAntelacion: buckets,
    tarjetas: {
      actividades,
      atenciones,
      excepciones,
      solicitudesInvitados,
      dietas,
      novedades,
      alteraciones,
    },
  });
}

// ============================================================================
// Server Actions de soporte: Borrador parcial y Polling de PDF
// ============================================================================

const ActualizarBorradorParcialInputSchema = z.object({
  residenciaId: z.string().min(1),
  solicitudId: z.string().min(1),
  overrides: z.array(z.object({
    usuarioId: z.string().min(1),
    tiempoComidaId: z.string().min(1),
    nuevaAlternativaId: z.string().optional(),
    nuevaDietaId: z.string().optional(),
  })).min(1).max(MAX_USUARIOS_CONSOLIDACION),
});

const ConsultarEstadoPdfInputSchema = z.object({
  residenciaId: z.string().min(1),
  solicitudId: z.string().min(1),
});

/**
 * Persiste overrides parciales en los sub-docs de comensales del borrador.
 * NO recalcula el campo `resumen` del documento raíz (eso se hace al sellar).
 */
export async function actualizarBorradorParcial(
  rawInput: z.input<typeof ActualizarBorradorParcialInputSchema>
): Promise<ActionResult<{ actualizados: number }>> {
  const parsed = ActualizarBorradorParcialInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return fail('Input inválido para actualizar borrador parcial.');
  }

  const { residenciaId, solicitudId, overrides } = parsed.data;
  const acceso = await validarAccesoSolicitudConsolidada(residenciaId);
  if (!acceso.success) {
    return acceso;
  }

  const solicitudRef = db
    .collection('residencias')
    .doc(residenciaId)
    .collection('solicitudesConsolidadas')
    .doc(solicitudId);

  // Verificar que el documento existe y está en BORRADOR
  const solicitudSnap = await solicitudRef.get();
  if (!solicitudSnap.exists) {
    return fail('No existe la solicitud consolidada.');
  }
  const estadoDoc = (solicitudSnap.data() as Record<string, unknown>)?.estadoDocumento;
  if (estadoDoc !== 'BORRADOR') {
    return fail('Solo se pueden actualizar solicitudes en estado BORRADOR.');
  }

  const batch = db.batch();
  let count = 0;

  for (const override of overrides) {
    const comensalDocId = `${override.usuarioId}__${override.tiempoComidaId}`;
    const comensalRef = solicitudRef.collection('comensales').doc(comensalDocId);

    const patch: Record<string, unknown> = {};
    if (override.nuevaAlternativaId) {
      patch['snapshotEleccion.alternativaId'] = override.nuevaAlternativaId;
    }
    if (override.nuevaDietaId) {
      patch['dietaId'] = override.nuevaDietaId;
    }

    if (Object.keys(patch).length > 0) {
      batch.update(comensalRef, patch);
      count++;
    }
  }

  if (count > 0) {
    await batch.commit();
  }

  return ok({ actualizados: count });
}

/**
 * Consulta el estado de generación del PDF de una solicitud consolidada.
 * Usado por el polling del cliente tras sellar.
 */
export async function consultarEstadoPdfSolicitud(
  rawInput: z.input<typeof ConsultarEstadoPdfInputSchema>
): Promise<ActionResult<{ estadoGeneracionPdf: string; urlPdfReporte: string | null }>> {
  const parsed = ConsultarEstadoPdfInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return fail('Input inválido para consultar estado de PDF.');
  }

  const { residenciaId, solicitudId } = parsed.data;
  const acceso = await validarAccesoSolicitudConsolidada(residenciaId);
  if (!acceso.success) {
    return acceso;
  }

  const solicitudRef = db
    .collection('residencias')
    .doc(residenciaId)
    .collection('solicitudesConsolidadas')
    .doc(solicitudId);

  const snap = await solicitudRef.get();
  if (!snap.exists) {
    return fail('No existe la solicitud consolidada.');
  }

  const data = snap.data() as Record<string, unknown>;
  return ok({
    estadoGeneracionPdf: String(data?.estadoGeneracionPdf ?? 'PENDIENTE'),
    urlPdfReporte: typeof data?.urlPdfReporte === 'string' ? data.urlPdfReporte : null,
  });
}

export async function fase3SolicitudConsolidadaUI(input: { residenciaId: string }): Promise<
  ActionResult<{
    selectedHorarioSolicitudId: string | null;
    encabezado: {
      calendario: {
        fechaInicio: string;
        fechaFin: string;
        recordatorios: PlainDoc[];
        cumpleanios: PlainDoc[];
      };
    };
    pestana1: {
      arbolComensales: Record<string, Record<string, Record<string, string[]>>>;
      usuariosDiccionario: Record<string, PlainDoc>;
      tiempoComidaNombres: Record<string, string>;
      alternativaNombres: Record<string, string>;
    };
    pestana2: {
      novedades: PlainDoc[];
      dietas: PlainDoc[];
      alteraciones: PlainDoc[];
    };
    pestana3: {
      actividades: PlainDoc[];
      atenciones: PlainDoc[];
      excepciones: PlainDoc[];
      solicitudesInvitados: PlainDoc[];
    };
  }>
> {
  const fase3 = await obtenerDatosFase3SolicitudConsolidada({ residenciaId: input.residenciaId });
  if (!fase3.success) {
    return fase3;
  }

  const fase2 = await pendientesTriajeSolicitudConsolidada({ residenciaId: input.residenciaId });
  if (!fase2.success) {
    return fase2;
  }

  const config = (fase3.data.configuracionGeneral ?? {}) as Record<string, any>;
  const referenciaSolicitud = String(config.fechaHoraReferenciaUltimaSolicitud ?? `${getHoyEnZonaHoraria('UTC')}T00:00:00`);
  const hoy = referenciaSolicitud.slice(0, 10);
  const fechaFin = format(addDays(parseISO(hoy), 14), 'yyyy-MM-dd');
  const fechasRango = eachDayOfInterval({ start: parseISO(hoy), end: parseISO(fechaFin) }).map((d) => format(d, 'yyyy-MM-dd'));

  const recordatorios = fase3.data.recordatorios
    .filter((r) => {
      const data = r as Record<string, any>;
      return String(data.fechaInicioValidez ?? '9999-12-31') <= fechaFin
        && String(data.fechaFinValidez ?? '0000-01-01') >= hoy;
    })
    .map((r) => ({ ...r, tipoTarjeta: 'recordatorio' } as PlainDoc));

  const cumpleanios = fase3.data.usuarios
    .map((u) => {
      const data = u as Record<string, any>;
      const nacimiento = String(data.fechaDeNacimiento ?? '');
      const siguiente = calcularSiguienteCumpleanios(nacimiento, hoy);
      if (!siguiente || siguiente > fechaFin) {
        return null;
      }
      return {
        id: u.id,
        usuarioId: u.id,
        nombre: data.nombre,
        apellido: data.apellido,
        fechaCumpleanios: siguiente,
      } as PlainDoc;
    })
    .filter((item): item is PlainDoc => item !== null);

  const singletonResidencia = config;
  const horariosSolicitud = (singletonResidencia.horariosSolicitud ?? {}) as Record<string, any>;
  const selectedHorarioSolicitudId = (() => {
    const fromConfig = String(singletonResidencia.horarioSolicitudSeleccionadoId ?? '');
    if (fromConfig && horariosSolicitud[fromConfig]) {
      return fromConfig;
    }

    for (const [horarioId, horario] of Object.entries(horariosSolicitud)) {
      if ((horario as Record<string, unknown>)?.esPrimario === true) {
        return horarioId;
      }
    }

    const ids = Object.keys(horariosSolicitud).sort();
    return ids[0] ?? null;
  })();

  const tiempoComidaNombres: Record<string, string> = {};
  for (const [tiempoComidaId, tiempoData] of Object.entries((singletonResidencia.esquemaSemanal ?? {}) as Record<string, any>)) {
    tiempoComidaNombres[tiempoComidaId] = String((tiempoData as Record<string, unknown>)?.nombre ?? tiempoComidaId);
  }

  const alternativaNombres: Record<string, string> = {};
  for (const [configAlternativaId, configAlt] of Object.entries((singletonResidencia.configuracionesAlternativas ?? {}) as Record<string, any>)) {
    const definicionId = String((configAlt as Record<string, any>)?.definicionAlternativaId ?? '');
    const definicion = (singletonResidencia.catalogoAlternativas ?? {})[definicionId] as Record<string, unknown> | undefined;
    alternativaNombres[configAlternativaId] = String(definicion?.nombre ?? (configAlt as Record<string, unknown>)?.nombre ?? configAlternativaId);
  }

  const alteracionesCapa0 = (fase3.data.alteraciones as unknown as AlteracionDiariaInput[]) ?? [];
  const diasDensos = densificarCapa0(fechasRango, singletonResidencia as any, alteracionesCapa0);

  const actividadesById = new Map<string, PlainDoc>(fase3.data.actividades.map((a) => [a.id, a]));
  const inscripcionesPorUsuario = new Map<string, PlainDoc[]>();
  for (const inscripcion of fase3.data.inscripciones) {
    const usuarioId = String((inscripcion as Record<string, any>).usuarioId ?? '');
    if (!usuarioId) {
      continue;
    }
    const list = inscripcionesPorUsuario.get(usuarioId) ?? [];
    list.push(inscripcion);
    inscripcionesPorUsuario.set(usuarioId, list);
  }

  const excepcionesPorUsuario = new Map<string, PlainDoc[]>();
  for (const excepcion of fase3.data.excepciones) {
    const usuarioId = String((excepcion as Record<string, any>).usuarioId ?? '');
    if (!usuarioId) {
      continue;
    }
    const list = excepcionesPorUsuario.get(usuarioId) ?? [];
    list.push(excepcion);
    excepcionesPorUsuario.set(usuarioId, list);
  }

  const ausenciasPorUsuario = new Map<string, PlainDoc[]>();
  for (const ausencia of fase3.data.ausencias) {
    const usuarioId = String((ausencia as Record<string, any>).usuarioId ?? '');
    if (!usuarioId) {
      continue;
    }
    const list = ausenciasPorUsuario.get(usuarioId) ?? [];
    list.push(ausencia);
    ausenciasPorUsuario.set(usuarioId, list);
  }

  const arbolBuilder: Record<string, Record<string, Record<string, Set<string>>>> = {};
  const usuariosDiccionario: Record<string, PlainDoc> = {};
  const dietasMap = (singletonResidencia.dietas ?? {}) as Record<string, any>;

  for (const usuario of fase3.data.usuarios) {
    const user = usuario as Record<string, any>;
    const usuarioId = usuario.id;
    const dietaId = String(user?.residente?.dietaId ?? 'sin_dieta');
    const dietaNombre = String(dietasMap[dietaId]?.nombre ?? 'Sin dieta');

    usuariosDiccionario[usuarioId] = {
      id: usuarioId,
      nombre: user.nombre,
      apellido: user.apellido,
      nombreCorto: user.nombreCorto,
      roles: user.roles,
      correo: user.email,
      fechaDeNacimiento: user.fechaDeNacimiento,
      dietaId,
      dietaNombre,
      numeroDeRopa: user?.residente?.numeroDeRopa,
      habitacion: user?.residente?.habitacion,
    } as PlainDoc;

    const diccionarioSemanarios = (user.semanarios ?? {}) as Record<string, any>;
    const excepcionesUsuario = (excepcionesPorUsuario.get(usuarioId) ?? []) as unknown as Array<Record<string, any>>;
    const ausenciasUsuario = (ausenciasPorUsuario.get(usuarioId) ?? []) as unknown as Array<Record<string, any>>;

    const inscripcionesUsuario = (inscripcionesPorUsuario.get(usuarioId) ?? [])
      .map((inscripcion) => {
        const actividadId = String((inscripcion as Record<string, any>).actividadId ?? '');
        const actividad = actividadesById.get(actividadId);
        if (!actividad) {
          return null;
        }

        const slots = enumerarSlotsActividad(actividad as Record<string, any>, singletonResidencia);
        const principal = String(
          singletonResidencia.esquemaSemanal?.[slots[0]?.tiempoComidaId ?? '']?.alternativas?.principal ?? ''
        );
        if (slots.length === 0 || !principal) {
          return null;
        }

        return {
          actividadId,
          nombreActividad: String((actividad as Record<string, any>).titulo ?? (actividad as Record<string, any>).nombre ?? actividadId),
          configuracionAlternativaId: principal,
          fechaInicio: slots[0].fecha,
          fechaFin: slots[slots.length - 1].fecha,
          tiemposComidaIds: [...new Set(slots.map((slot) => slot.tiempoComidaId))],
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    const excepcionesIndex = new Map<string, Record<string, any>>(
      excepcionesUsuario.map((e) => [`${e.fecha}__${e.tiempoComidaId}`, e])
    );

    for (const fecha of fechasRango) {
      const ordenTiemposComida = ordenarTiemposDelDia(singletonResidencia, fecha);
      const diaDenso = diasDensos[fecha];
      if (!diaDenso) {
        continue;
      }

      for (const tiempoComidaId of ordenTiemposComida) {
        const tiempo = singletonResidencia.esquemaSemanal?.[tiempoComidaId];
        const grupo = singletonResidencia.gruposComidas?.[tiempo?.grupoComida ?? ''];
        const slot = diaDenso.tiemposComida?.[tiempoComidaId];
        if (!tiempo || !grupo || !slot) {
          continue;
        }

        const ausencia = detectarInterseccionAusencia(
          fecha,
          tiempoComidaId,
          ausenciasUsuario as any,
          ordenTiemposComida
        );

        const excepcion = excepcionesIndex.get(`${fecha}__${tiempoComidaId}`);
        const eleccionSemanario = (diccionarioSemanarios as Record<string, any>)[tiempoComidaId]
          ?? (diccionarioSemanarios as Record<string, any>)[tiempoComidaId.replace(/-/g, '_')];
        const actividad = inscripcionesUsuario.find((ins) => {
          return fecha >= ins.fechaInicio
            && fecha <= ins.fechaFin
            && ins.tiemposComidaIds.some((id) => slugify(id, 120) === slugify(tiempoComidaId, 120));
        });

        const tarjeta = resolverCascadaTiempoComida(
          {
            fecha,
            tiempoComidaId,
            grupoComida: grupo,
            fechaHoraReferenciaUltimaSolicitud: referenciaSolicitud,
            resolverAlternativa: (configId) => {
              const configAlt = singletonResidencia.configuracionesAlternativas?.[configId];
              const definicion = singletonResidencia.catalogoAlternativas?.[configAlt?.definicionAlternativaId ?? ''];
              const comedor = singletonResidencia.comedores?.[configAlt?.comedorId ?? ''];
              return {
                nombre: configAlt?.nombre ?? configId,
                tipo: definicion?.tipo ?? 'comedor',
                comedorNombre: comedor?.nombre,
                ventanaServicio: configAlt?.ventanaServicio,
                requiereAprobacion: Boolean(configAlt?.requiereAprobacion),
              };
            },
          },
          slot,
          {
            inscripcionActividad: actividad
              ? {
                  actividadId: actividad.actividadId,
                  nombreActividad: actividad.nombreActividad,
                  configuracionAlternativaId: actividad.configuracionAlternativaId,
                }
              : undefined,
            ausencia: ausencia as any,
            excepcion: excepcion as any,
            eleccionSemanario: eleccionSemanario as any,
          }
        );

        const dietaKey = dietaId || 'sin_dieta';
        arbolBuilder[fecha] = arbolBuilder[fecha] ?? {};
        arbolBuilder[fecha][tiempoComidaId] = arbolBuilder[fecha][tiempoComidaId] ?? {};
        arbolBuilder[fecha][tiempoComidaId][dietaKey] = arbolBuilder[fecha][tiempoComidaId][dietaKey] ?? new Set<string>();

        if (tarjeta.resultadoEfectivo.configuracionAlternativaId) {
          const configAltId = String(tarjeta.resultadoEfectivo.configuracionAlternativaId);
          const configAlt = singletonResidencia.configuracionesAlternativas?.[configAltId] as Record<string, any> | undefined;
          const horarioConfigId = String(configAlt?.horarioSolicitudComidaId ?? '');

          if (selectedHorarioSolicitudId && horarioConfigId !== selectedHorarioSolicitudId) {
            continue;
          }

          usuariosDiccionario[usuarioId] = {
            ...usuariosDiccionario[usuarioId],
            alternativasPorFecha: {
              ...((usuariosDiccionario[usuarioId]?.alternativasPorFecha as Record<string, Record<string, string>> | undefined) ?? {}),
              [fecha]: {
                ...(((usuariosDiccionario[usuarioId]?.alternativasPorFecha as Record<string, Record<string, string>> | undefined)?.[fecha] ?? {})),
                [tiempoComidaId]: configAltId,
              },
            },
          };

          arbolBuilder[fecha][tiempoComidaId][dietaKey].add(usuarioId);
        }
      }
    }
  }

  const arbolComensales: Record<string, Record<string, Record<string, string[]>>> = {};
  for (const [fecha, tiempos] of Object.entries(arbolBuilder)) {
    arbolComensales[fecha] = {};
    for (const [tiempoComidaId, dietas] of Object.entries(tiempos)) {
      arbolComensales[fecha][tiempoComidaId] = {};
      for (const [dietaId, usuariosSet] of Object.entries(dietas)) {
        arbolComensales[fecha][tiempoComidaId][dietaId] = [...usuariosSet];
      }
    }
  }

  return ok({
    selectedHorarioSolicitudId,
    encabezado: {
      calendario: {
        fechaInicio: hoy,
        fechaFin,
        recordatorios,
        cumpleanios,
      },
    },
    pestana1: {
      arbolComensales,
      usuariosDiccionario,
      tiempoComidaNombres,
      alternativaNombres,
    },
    pestana2: {
      novedades: fase2.data.tarjetas.novedades,
      dietas: fase2.data.tarjetas.dietas,
      alteraciones: fase2.data.tarjetas.alteraciones,
    },
    pestana3: {
      actividades: fase2.data.tarjetas.actividades,
      atenciones: fase2.data.tarjetas.atenciones,
      excepciones: fase2.data.tarjetas.excepciones,
      solicitudesInvitados: fase2.data.tarjetas.solicitudesInvitados,
    },
  });
}



