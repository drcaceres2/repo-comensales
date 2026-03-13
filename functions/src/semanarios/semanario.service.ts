import { HttpsError } from 'firebase-functions/v2/https';
import { db } from '../lib/firebase';
import { ConfiguracionResidencia } from '../../../shared/schemas/residencia';
import { UpsertSemanarioPayload } from '../../../shared/schemas/semanarios/semanario.dto';
import { Usuario } from '../../../shared/schemas/usuarios';

const DIA_TO_INDEX: Record<string, number> = {
  lunes: 0,
  martes: 1,
  miercoles: 2,
  jueves: 3,
  viernes: 4,
  sabado: 5,
  domingo: 6,
};

type UpsertContext = {
  callerUid: string;
  callerProfile: Usuario;
  payload: UpsertSemanarioPayload;
};

type UpsertResult = {
  semanaIsoAplicada: string;
  updatedAt: string;
};

function parseSemanaIso(semanaIso: string): { year: number; week: number } {
  const [yearPart, weekPart] = semanaIso.split('-W');
  const year = Number(yearPart);
  const week = Number(weekPart);

  if (!Number.isFinite(year) || !Number.isFinite(week) || week < 1 || week > 53) {
    throw new HttpsError('invalid-argument', `Semana ISO invalida: ${semanaIso}`);
  }

  return { year, week };
}

function dateAtUtcMidnight(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function isoWeekStartDate(semanaIso: string): Date {
  const { year, week } = parseSemanaIso(semanaIso);

  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay();
  const jan4IsoDay = jan4Day === 0 ? 7 : jan4Day;

  const mondayWeek1 = new Date(jan4);
  mondayWeek1.setUTCDate(jan4.getUTCDate() - (jan4IsoDay - 1));

  const target = new Date(mondayWeek1);
  target.setUTCDate(mondayWeek1.getUTCDate() + (week - 1) * 7);

  return dateAtUtcMidnight(target);
}

function formatSemanaIso(dateInput: Date): string {
  const date = dateAtUtcMidnight(dateInput);
  const thursday = new Date(date);
  const day = thursday.getUTCDay();
  const isoDay = day === 0 ? 7 : day;
  thursday.setUTCDate(thursday.getUTCDate() + (4 - isoDay));

  const year = thursday.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay();
  const jan4IsoDay = jan4Day === 0 ? 7 : jan4Day;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - (jan4IsoDay - 1));

  const diffDays = Math.floor((dateAtUtcMidnight(date).getTime() - week1Monday.getTime()) / (24 * 60 * 60 * 1000));
  const week = Math.floor(diffDays / 7) + 1;

  return `${year}-W${String(week).padStart(2, '0')}`;
}

function parseToMillis(value: unknown): number {
  if (!value) {
    return 0;
  }

  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === 'object' && value !== null) {
    const maybeTimestamp = value as { toDate?: () => Date; seconds?: number; nanoseconds?: number };
    if (typeof maybeTimestamp.toDate === 'function') {
      return maybeTimestamp.toDate().getTime();
    }
    if (typeof maybeTimestamp.seconds === 'number') {
      return maybeTimestamp.seconds * 1000;
    }
  }

  return 0;
}

function maxSemanaIso(semanas: string[]): string | undefined {
  return [...semanas].sort((a, b) => a.localeCompare(b)).at(-1);
}

function nextSemanaIsoGreater(semanas: string[], semanaBase: string): string | undefined {
  return [...semanas].sort((a, b) => a.localeCompare(b)).find((semana) => semana > semanaBase);
}

function lastDateForWeekdayBefore(nextStart: Date, weekdayIndex: number): Date {
  const lastPossible = new Date(nextStart);
  lastPossible.setUTCDate(nextStart.getUTCDate() - 1);

  const day = lastPossible.getUTCDay();
  const currentIndex = day === 0 ? 6 : day - 1;
  const diff = (currentIndex - weekdayIndex + 7) % 7;

  const result = new Date(lastPossible);
  result.setUTCDate(lastPossible.getUTCDate() - diff);
  return dateAtUtcMidnight(result);
}

function resolveChangedTiempos(
  currentSemanario: Record<string, { configuracionAlternativaId: string }> | undefined,
  incomingSemanario: Record<string, { configuracionAlternativaId: string }>
): string[] {
  const keys = new Set<string>([
    ...Object.keys(currentSemanario ?? {}),
    ...Object.keys(incomingSemanario ?? {}),
  ]);

  return [...keys].filter((tiempoId) => {
    const before = currentSemanario?.[tiempoId]?.configuracionAlternativaId ?? '';
    const after = incomingSemanario?.[tiempoId]?.configuracionAlternativaId ?? '';
    return before !== after;
  });
}

function validateWritePermission(caller: Usuario, target: Usuario, payloadUsuarioId: string): void {
  const callerRoles = caller.roles ?? [];
  const targetRoles = target.roles ?? [];

  if (callerRoles.includes('master') || callerRoles.includes('admin')) {
    throw new HttpsError('permission-denied', 'El rol actual no tiene acceso al modulo de semanarios.');
  }

  if (!targetRoles.some((role) => role === 'residente' || role === 'invitado')) {
    throw new HttpsError('failed-precondition', 'El usuario objetivo no pertenece al universo de semanarios.');
  }

  if (callerRoles.includes('director')) {
    throw new HttpsError('permission-denied', 'Los directores tienen acceso de solo lectura en semanarios.');
  }

  if (caller.id === payloadUsuarioId) {
    if (callerRoles.includes('residente') || callerRoles.includes('invitado')) {
      return;
    }

    throw new HttpsError('permission-denied', 'No tienes permiso para editar tu semanario con este rol.');
  }

  if (callerRoles.includes('asistente')) {
    const delegacion = caller.asistente?.usuariosAsistidos?.[payloadUsuarioId];
    if (delegacion && delegacion.nivelAcceso !== 'Ninguna') {
      return;
    }
  }

  throw new HttpsError('permission-denied', 'No tienes permiso para editar el semanario de este usuario.');
}

function validateEficaciaCambios(
  singleton: ConfiguracionResidencia,
  semanariosExistentes: Record<string, Record<string, { configuracionAlternativaId: string }>>,
  semanaIsoAplicada: string,
  incomingSemanario: Record<string, { configuracionAlternativaId: string }>
): void {
  const semanas = Object.keys(semanariosExistentes);
  if (semanas.length <= 1) {
    return;
  }

  const latest = maxSemanaIso(semanas);
  if (latest === semanaIsoAplicada) {
    return;
  }

  const nextSemana = nextSemanaIsoGreater(semanas, semanaIsoAplicada);
  if (!nextSemana) {
    return;
  }

  const currentSemanario = semanariosExistentes[semanaIsoAplicada] ?? {};
  const changedTiempos = resolveChangedTiempos(currentSemanario, incomingSemanario);
  if (changedTiempos.length === 0) {
    return;
  }

  const nextStart = isoWeekStartDate(nextSemana);
  const corte = dateAtUtcMidnight(new Date(singleton.fechaHoraReferenciaUltimaSolicitud));

  for (const tiempoComidaId of changedTiempos) {
    const tiempo = singleton.esquemaSemanal?.[tiempoComidaId];
    if (!tiempo?.estaActivo) {
      continue;
    }

    const weekdayIndex = DIA_TO_INDEX[tiempo.dia];
    if (weekdayIndex === undefined) {
      continue;
    }

    const lastImpactDate = lastDateForWeekdayBefore(nextStart, weekdayIndex);
    if (lastImpactDate < corte) {
      throw new HttpsError(
        'failed-precondition',
        `El cambio en ${tiempo.nombre} ya no tiene efecto operativo para comensales.`
      );
    }
  }
}

export async function upsertSemanarioService({ callerUid, callerProfile, payload }: UpsertContext): Promise<UpsertResult> {
  const residenciaId = callerProfile.residenciaId;
  if (!residenciaId) {
    throw new HttpsError('failed-precondition', 'No se pudo resolver la residencia del usuario autenticado.');
  }

  const singletonRef = db.doc(`residencias/${residenciaId}/configuracion/general`);
  const targetRef = db.doc(`usuarios/${payload.usuarioId}`);

  const [singletonSnap, targetSnap] = await Promise.all([singletonRef.get(), targetRef.get()]);

  if (!singletonSnap.exists) {
    throw new HttpsError('not-found', 'No existe la configuracion general de la residencia.');
  }

  if (!targetSnap.exists) {
    throw new HttpsError('not-found', 'No existe el usuario objetivo del semanario.');
  }

  const singleton = singletonSnap.data() as ConfiguracionResidencia;
  const targetUsuario = targetSnap.data() as Usuario;

  if (targetUsuario.residenciaId !== residenciaId || !targetUsuario.estaActivo) {
    throw new HttpsError('permission-denied', 'El usuario objetivo no pertenece a la residencia activa.');
  }

  if (callerUid !== callerProfile.id) {
    throw new HttpsError('permission-denied', 'El perfil autenticado no coincide con el caller.');
  }

  validateWritePermission(callerProfile, targetUsuario, payload.usuarioId);

  const semanaActual = formatSemanaIso(new Date(singleton.fechaHoraReferenciaUltimaSolicitud));
  const semanaIsoAplicada = payload.semanaIsoEfectiva <= semanaActual ? semanaActual : payload.semanaIsoEfectiva;

  const existingSemanarios = (targetUsuario.semanarios ?? {}) as Record<string, Record<string, { configuracionAlternativaId: string }>>;

  validateEficaciaCambios(singleton, existingSemanarios, semanaIsoAplicada, payload.semanario);

  const currentUpdatedAtMillis = parseToMillis((targetUsuario as any).updatedAt);
  const requestedUpdatedAtMillis = parseToMillis(payload.lastUpdatedAt);

  if (currentUpdatedAtMillis > requestedUpdatedAtMillis) {
    throw new HttpsError('failed-precondition', 'El semanario fue modificado por otra sesion. Recarga y vuelve a intentar.');
  }

  const nowIso = new Date().toISOString();

  await db.runTransaction(async (transaction) => {
    const freshTarget = await transaction.get(targetRef);
    if (!freshTarget.exists) {
      throw new HttpsError('not-found', 'No existe el usuario objetivo del semanario.');
    }

    const freshData = freshTarget.data() as Usuario;
    const freshUpdatedAtMillis = parseToMillis((freshData as any).updatedAt);
    if (freshUpdatedAtMillis > requestedUpdatedAtMillis) {
      throw new HttpsError('failed-precondition', 'El semanario fue modificado por otra sesion. Recarga y vuelve a intentar.');
    }

    transaction.update(targetRef, {
      [`semanarios.${semanaIsoAplicada}`]: payload.semanario,
      updatedAt: nowIso,
      timestampActualizacion: nowIso,
    });
  });

  return {
    semanaIsoAplicada,
    updatedAt: nowIso,
  };
}
