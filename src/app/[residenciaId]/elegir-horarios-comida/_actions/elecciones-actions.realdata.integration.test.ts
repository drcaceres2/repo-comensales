import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addDays, format, getISOWeek, getISOWeekYear, parseISO } from 'date-fns';

process.env.FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'pruebas';
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8081';
process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';

const { sessionState } = vi.hoisted(() => ({
  sessionState: {
    current: {
      usuarioId: 'it-ehc-residente',
      email: 'it-ehc-residente@local.test',
      roles: ['residente'],
      residenciaId: 'guaymura',
      zonaHoraria: 'America/Tegucigalpa',
      ctxTraduccion: 'es',
    },
  },
}));

vi.mock('@/lib/obtenerInfoUsuarioServer', () => ({
  obtenerInfoUsuarioServer: vi.fn(async () => sessionState.current),
}));

import { db, FieldValue } from '@/lib/firebaseAdmin';
import { CargaHorariosUISchema } from 'shared/schemas/elecciones/ui.schema';
import { obtenerCargaHorarios } from './obtenerCargaHorarios';
import { upsertAusenciaLote } from './upsertAusenciaLote';
import { upsertExcepcion } from './upsertExcepcion';

const RES_ID = 'guaymura';
const TEST_UID = 'it-ehc-residente';
const ACTIVITY_ID = 'it-ehc-actividad-d1';
const BASE_DATE = '2030-04-01'; // fecha controlada para D0..D3

const MATRIX_USERS = {
  sinCambios: { uid: 'it-ehc-mx-base', email: 'it-ehc-mx-base@local.test' },
  conActividad: { uid: 'it-ehc-mx-actividad', email: 'it-ehc-mx-actividad@local.test' },
  conExcepcion: { uid: 'it-ehc-mx-excepcion', email: 'it-ehc-mx-excepcion@local.test' },
  conAusencia: { uid: 'it-ehc-mx-ausencia', email: 'it-ehc-mx-ausencia@local.test' },
  conTodo: { uid: 'it-ehc-mx-todo', email: 'it-ehc-mx-todo@local.test' },
} as const;

const DIRECTORES = {
  carlos: {
    usuarioId: 'GXlx7pTxKmvkM3LGBfIozfqlj2aw',
    email: 'carlos@pruebas.org',
    roles: ['residente', 'director'],
  },
  juanPablo: {
    usuarioId: 'dvuzYNOTKTh7FRVC98DT2qzKLEEc',
    email: 'juanpablo@pruebas.org',
    roles: ['residente', 'director'],
  },
  javier: {
    usuarioId: 'DlDxTklwz1iIhKSH220SrgNuC8nH',
    email: 'javier@pruebas.org',
    roles: ['residente', 'director'],
  },
} as const;

function semanaIso(fechaIso: string): string {
  const d = parseISO(fechaIso);
  return `${getISOWeekYear(d)}-W${String(getISOWeek(d)).padStart(2, '0')}`;
}

function fechaMasDias(base: string, dias: number): string {
  return format(addDays(parseISO(base), dias), 'yyyy-MM-dd');
}

function diaSemanaEs(fechaIso: string): string {
  const dias = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
  return dias[new Date(`${fechaIso}T00:00:00Z`).getUTCDay()] ?? 'lunes';
}

function tiempoId(fechaIso: string, grupoComida: 'desayuno' | 'almuerzo' | 'cena' = 'desayuno'): string {
  return `${diaSemanaEs(fechaIso)}_${grupoComida}`;
}

function horaRef(fechaIso: string, hhmm = '20:00'): string {
  return `${fechaIso}T${hhmm}:00`;
}

function setSesionResidente() {
  sessionState.current = {
    usuarioId: TEST_UID,
    email: 'it-ehc-residente@local.test',
    roles: ['residente'],
    residenciaId: RES_ID,
    zonaHoraria: 'America/Tegucigalpa',
    ctxTraduccion: 'es',
  };
}

function setSesionDirector(director: (typeof DIRECTORES)[keyof typeof DIRECTORES]) {
  sessionState.current = {
    usuarioId: director.usuarioId,
    email: director.email,
    roles: [...director.roles],
    residenciaId: RES_ID,
    zonaHoraria: 'America/Tegucigalpa',
    ctxTraduccion: 'es',
  };
}

function todosLosUidsPrueba(): string[] {
  return [
    TEST_UID,
    MATRIX_USERS.sinCambios.uid,
    MATRIX_USERS.conActividad.uid,
    MATRIX_USERS.conExcepcion.uid,
    MATRIX_USERS.conAusencia.uid,
    MATRIX_USERS.conTodo.uid,
  ];
}

function matrixActivityId(uid: string): string {
  return `it-ehc-matrix-act-${uid}`;
}

async function deleteCollection(path: string): Promise<void> {
  const snap = await db.collection(path).get();
  await Promise.all(snap.docs.map((d) => d.ref.delete()));
}

async function limpiarDatosModulo(): Promise<void> {
  for (const uid of todosLosUidsPrueba()) {
    await deleteCollection(`usuarios/${uid}/excepciones`);
    await deleteCollection(`usuarios/${uid}/ausencias`);
    await db.doc(`usuarios/${uid}`).set({ semanarios: {} }, { merge: true });
  }

  await db.doc(`residencias/${RES_ID}/actividades/${ACTIVITY_ID}/inscripciones/${TEST_UID}`).delete().catch(() => undefined);
  await db.doc(`residencias/${RES_ID}/actividades/${ACTIVITY_ID}`).delete().catch(() => undefined);

  for (const uid of todosLosUidsPrueba()) {
    await db.doc(`residencias/${RES_ID}/actividades/${matrixActivityId(uid)}/inscripciones/${uid}`).delete().catch(() => undefined);
    await db.doc(`residencias/${RES_ID}/actividades/${matrixActivityId(uid)}`).delete().catch(() => undefined);
  }
}

async function asegurarUsuarioPrueba(uid: string, email: string): Promise<void> {
  await db.doc(`usuarios/${uid}`).set({
    id: uid,
    email,
    nombre: 'Integracion',
    apellido: 'Horarios',
    nombreCorto: 'IH',
    roles: ['residente'],
    residenciaId: RES_ID,
    tieneAutenticacion: true,
    estaActivo: true,
    puedeTraerInvitados: 'no',
    semanarios: {},
    timestampCreacion: FieldValue.serverTimestamp(),
    timestampActualizacion: FieldValue.serverTimestamp(),
  }, { merge: true });
}

async function asegurarUsuariosMatriz(): Promise<void> {
  await asegurarUsuarioPrueba(MATRIX_USERS.sinCambios.uid, MATRIX_USERS.sinCambios.email);
  await asegurarUsuarioPrueba(MATRIX_USERS.conActividad.uid, MATRIX_USERS.conActividad.email);
  await asegurarUsuarioPrueba(MATRIX_USERS.conExcepcion.uid, MATRIX_USERS.conExcepcion.email);
  await asegurarUsuarioPrueba(MATRIX_USERS.conAusencia.uid, MATRIX_USERS.conAusencia.email);
  await asegurarUsuarioPrueba(MATRIX_USERS.conTodo.uid, MATRIX_USERS.conTodo.email);
}

async function setReferenciaSolicitud(fechaHora: string): Promise<void> {
  await db.doc(`residencias/${RES_ID}/configuracion/general`).set(
    { fechaHoraReferenciaUltimaSolicitud: fechaHora },
    { merge: true }
  );
}

async function setSemanarioSemana(fechaIso: string, eleccionDesayuno: string): Promise<void> {
  const semana = semanaIso(fechaIso);
  const tiempo = tiempoId(fechaIso, 'desayuno');
  await db.doc(`usuarios/${TEST_UID}`).set({
    semanarios: {
      [semana]: {
        [tiempo]: { configuracionAlternativaId: eleccionDesayuno },
      },
    },
  }, { merge: true });
}

async function setSemanarioSemanaUsuario(uid: string, fechaIso: string, eleccionDesayuno: string): Promise<void> {
  const semana = semanaIso(fechaIso);
  const tiempo = tiempoId(fechaIso, 'desayuno');
  await db.doc(`usuarios/${uid}`).set({
    semanarios: {
      [semana]: {
        [tiempo]: { configuracionAlternativaId: eleccionDesayuno },
      },
    },
  }, { merge: true });
}

async function obtenerSingleton(): Promise<any> {
  const singleton = await db.doc(`residencias/${RES_ID}/configuracion/general`).get();
  return singleton.data() as any;
}

async function obtenerConfigAlternativaPrincipal(
  fechaIso: string,
  grupoComida: 'desayuno' | 'almuerzo' | 'cena' = 'desayuno'
): Promise<string> {
  const singleton = await obtenerSingleton();
  const tiempoComidaId = tiempoId(fechaIso, grupoComida);
  const principal = singleton?.esquemaSemanal?.[tiempoComidaId]?.alternativas?.principal;

  if (!principal) {
    throw new Error(`No se encontró alternativa principal para ${tiempoComidaId}.`);
  }

  return principal;
}

async function obtenerNombreTiempoDesdeSingleton(tiempoComidaId: string): Promise<string> {
  const singleton = await obtenerSingleton();
  const nombre = singleton?.esquemaSemanal?.[tiempoComidaId]?.nombre;
  if (!nombre) {
    throw new Error(`No se encontró nombre para tiempoComidaId=${tiempoComidaId} en singleton.`);
  }
  return nombre;
}

async function crearActividadParaUsuario(uid: string, fechaIso: string): Promise<void> {
  const tiempoComidaId = tiempoId(fechaIso, 'desayuno');
  const nombreTiempo = await obtenerNombreTiempoDesdeSingleton(tiempoComidaId);
  const activityId = matrixActivityId(uid);

  await db.doc(`residencias/${RES_ID}/actividades/${activityId}`).set({
    id: activityId,
    residenciaId: RES_ID,
    nombre: `Actividad Matrix ${uid}`,
    fechaInicio: fechaIso,
    fechaFin: fechaIso,
    estado: 'publicada',
    planComidas: [{ fechaComida: fechaIso, nombreTiempoComida: nombreTiempo }],
  }, { merge: true });

  await db.doc(`residencias/${RES_ID}/actividades/${activityId}/inscripciones/${uid}`).set({
    id: uid,
    residenciaId: RES_ID,
    actividadId: activityId,
    usuarioId: uid,
    estado: 'confirmada',
  }, { merge: true });
}

async function crearExcepcionAprobada(
  uid: string,
  fechaIso: string,
  tiempoComidaId: string,
  configuracionAlternativaId: string
): Promise<void> {
  await db.doc(`usuarios/${uid}/excepciones/${fechaIso}__${tiempoComidaId}`).set({
    usuarioId: uid,
    residenciaId: RES_ID,
    fecha: fechaIso,
    tiempoComidaId,
    configuracionAlternativaId,
    esAlternativaAlterada: false,
    origenAutoridad: 'residente',
    estadoAprobacion: 'aprobada',
  }, { merge: true });
}

async function obtenerTarjetaDesayunoComoDirector(uid: string, fechaIso: string) {
  setSesionDirector(DIRECTORES.javier);
  const carga = await obtenerCargaHorarios(RES_ID, BASE_DATE, fechaMasDias(BASE_DATE, 3), uid);
  expect(carga.success).toBe(true);

  const parsed = CargaHorariosUISchema.safeParse(carga.data);
  expect(parsed.success).toBe(true);

  const tiempoComidaId = tiempoId(fechaIso, 'desayuno');
  return parsed.success
    ? parsed.data.dias.find((d) => d.fecha === fechaIso)?.tarjetas.find((t) => t.tiempoComidaId === tiempoComidaId)
    : undefined;
}

describe('elecciones server actions - integration real data (guaymura)', () => {
  const D0 = BASE_DATE;
  const D1 = fechaMasDias(BASE_DATE, 1);
  const D2 = fechaMasDias(BASE_DATE, 2);
  const D3 = fechaMasDias(BASE_DATE, 3);

  beforeEach(async () => {
    setSesionResidente();
    await asegurarUsuarioPrueba(TEST_UID, 'it-ehc-residente@local.test');
    await limpiarDatosModulo();
    await setReferenciaSolicitud(horaRef(D0, '10:00'));
  });

  afterEach(async () => {
    setSesionResidente();
    await limpiarDatosModulo();
    await db.doc(`usuarios/${TEST_UID}`).delete().catch(() => undefined);
  });

  it('Lectura: muro móvil diferenciado D0..D3 con fechaHoraReferenciaUltimaSolicitud controlada', async () => {
    await setSemanarioSemana(D0, await obtenerConfigAlternativaPrincipal(D0, 'desayuno'));
    await setSemanarioSemana(D1, await obtenerConfigAlternativaPrincipal(D1, 'desayuno'));
    await setSemanarioSemana(D2, await obtenerConfigAlternativaPrincipal(D2, 'desayuno'));
    await setSemanarioSemana(D3, await obtenerConfigAlternativaPrincipal(D3, 'desayuno'));

    // En guaymura, el desayuno de mañana usa como cierre el horario principal del día anterior.
    // Por eso con una referencia en D0 a las 20:30 quedan cerrados D0 y D1, mientras D2 y D3 siguen abiertos.
    await setReferenciaSolicitud(horaRef(D0, '20:30'));

    const result = await obtenerCargaHorarios(RES_ID, D0, D3);
    expect(result.success).toBe(true);

    const parsed = CargaHorariosUISchema.safeParse(result.data);
    expect(parsed.success).toBe(true);

    const data = parsed.success ? parsed.data : null;
    expect(data).not.toBeNull();

    const desayunoD0 = data?.dias.find((d) => d.fecha === D0)?.tarjetas.find((t) => t.tiempoComidaId === tiempoId(D0, 'desayuno'));
    const desayunoD1 = data?.dias.find((d) => d.fecha === D1)?.tarjetas.find((t) => t.tiempoComidaId === tiempoId(D1, 'desayuno'));
    const desayunoD2 = data?.dias.find((d) => d.fecha === D2)?.tarjetas.find((t) => t.tiempoComidaId === tiempoId(D2, 'desayuno'));
    const desayunoD3 = data?.dias.find((d) => d.fecha === D3)?.tarjetas.find((t) => t.tiempoComidaId === tiempoId(D3, 'desayuno'));

    expect(desayunoD0?.origenResolucion).toBe('CAPA4_SEMANARIO');
    expect(desayunoD0?.estadoInteraccion).toBe('BLOQUEADO_SISTEMA');

    expect(desayunoD1?.origenResolucion).toBe('CAPA4_SEMANARIO');
    expect(desayunoD1?.estadoInteraccion).toBe('BLOQUEADO_SISTEMA');

    expect(desayunoD2?.estadoInteraccion).toBe('MUTABLE');
    expect(desayunoD3?.estadoInteraccion).toBe('MUTABLE');
  });

  it('Lectura: CAPA1 actividad prevalece sobre semanario en un día abierto', async () => {
    await setReferenciaSolicitud(horaRef(D0, '10:00'));
    await setSemanarioSemana(D1, await obtenerConfigAlternativaPrincipal(D1, 'desayuno'));

    const tiempoD1 = tiempoId(D1, 'desayuno');
    const nombreTiempoD1 = await obtenerNombreTiempoDesdeSingleton(tiempoD1);

    await db.doc(`residencias/${RES_ID}/actividades/${ACTIVITY_ID}`).set({
      id: ACTIVITY_ID,
      residenciaId: RES_ID,
      nombre: 'Actividad IT EHC',
      fechaInicio: D1,
      fechaFin: D1,
      estado: 'publicada',
      planComidas: [{ fechaComida: D1, nombreTiempoComida: nombreTiempoD1 }],
    }, { merge: true });

    await db.doc(`residencias/${RES_ID}/actividades/${ACTIVITY_ID}/inscripciones/${TEST_UID}`).set({
      id: TEST_UID,
      residenciaId: RES_ID,
      actividadId: ACTIVITY_ID,
      usuarioId: TEST_UID,
      estado: 'confirmada',
    }, { merge: true });

    const result = await obtenerCargaHorarios(RES_ID, D0, D3);
    expect(result.success).toBe(true);

    const parsed = CargaHorariosUISchema.safeParse(result.data);
    expect(parsed.success).toBe(true);

    const desayunoD1 = parsed.success
      ? parsed.data.dias.find((d) => d.fecha === D1)?.tarjetas.find((t) => t.tiempoComidaId === tiempoD1)
      : undefined;

    expect(desayunoD1?.origenResolucion).toBe('CAPA1_ACTIVIDAD');
    expect(desayunoD1?.estadoInteraccion).toBe('BLOQUEADO_AUTORIDAD');
  });

  it('Escritura: upsertExcepcion respeta muro móvil y permite suplantación de directores', async () => {
    await setReferenciaSolicitud(horaRef(D0, '20:30'));
    const principalD0 = await obtenerConfigAlternativaPrincipal(D0, 'desayuno');
    const principalD1 = await obtenerConfigAlternativaPrincipal(D1, 'desayuno');
    const principalD2 = await obtenerConfigAlternativaPrincipal(D2, 'desayuno');

    const cerrada = await upsertExcepcion(RES_ID, {
      fecha: D0,
      tiempoComidaId: tiempoId(D0, 'desayuno'),
      configuracionAlternativaId: principalD0,
      esAlternativaAlterada: false,
    });

    expect(cerrada.success).toBe(false);
    expect(cerrada.error?.code).toBe('MURO_MOVIL_CERRADO');

    const mananaCerrada = await upsertExcepcion(RES_ID, {
      fecha: D1,
      tiempoComidaId: tiempoId(D1, 'desayuno'),
      configuracionAlternativaId: principalD1,
      esAlternativaAlterada: false,
    });

    expect(mananaCerrada.success).toBe(false);
    expect(mananaCerrada.error?.code).toBe('MURO_MOVIL_CERRADO');

    const abierta = await upsertExcepcion(RES_ID, {
      fecha: D2,
      tiempoComidaId: tiempoId(D2, 'desayuno'),
      configuracionAlternativaId: principalD2,
      esAlternativaAlterada: false,
    });

    expect(abierta.success).toBe(true);

    setSesionDirector(DIRECTORES.carlos);
    const porDirector = await upsertExcepcion(
      RES_ID,
      {
        fecha: D3,
        tiempoComidaId: tiempoId(D3, 'desayuno'),
        configuracionAlternativaId: await obtenerConfigAlternativaPrincipal(D3, 'desayuno'),
        esAlternativaAlterada: false,
      },
      TEST_UID
    );

    expect(porDirector.success).toBe(true);

    const docDirector = await db.doc(`usuarios/${TEST_UID}/excepciones/${D3}__${tiempoId(D3, 'desayuno')}`).get();
    const dataDirector = docDirector.data() as any;
    expect(dataDirector?.origenAutoridad).toBe('director-modificable');
  });

  it('Escritura+Lectura: upsertAusenciaLote bloquea slots cerrados y en abierto resuelve CAPA2', async () => {
    await setReferenciaSolicitud(horaRef(D0, '20:30'));

    const rechazo = await upsertAusenciaLote(RES_ID, {
      fechaInicio: D0,
      fechaFin: D1,
      retornoPendienteConfirmacion: false,
    });

    expect(rechazo.success).toBe(false);
    expect(rechazo.error?.code).toBe('MURO_MOVIL_CERRADO');

    const ok = await upsertAusenciaLote(RES_ID, {
      fechaInicio: D1,
      fechaFin: D2,
      retornoPendienteConfirmacion: false,
      motivo: 'Prueba de integración',
    });

    expect(ok.success).toBe(true);

    const ausenciaDoc = await db.doc(`usuarios/${TEST_UID}/ausencias/${D1}`).get();
    expect(ausenciaDoc.exists).toBe(true);

    const excepcionD1DesayunoRef = db.doc(`usuarios/${TEST_UID}/excepciones/${D1}__${tiempoId(D1, 'desayuno')}`);
    const excepcionD1Desayuno = await excepcionD1DesayunoRef.get();
    expect(excepcionD1Desayuno.exists).toBe(true);

    const exData = excepcionD1Desayuno.data() as any;
    const singleton = await db.doc(`residencias/${RES_ID}/configuracion/general`).get();
    const cfg = (singleton.data() as any)?.configuracionesAlternativas?.[exData?.configuracionAlternativaId];
    const def = cfg ? (singleton.data() as any)?.catalogoAlternativas?.[cfg.definicionAlternativaId] : undefined;
    expect(['noComoEnCasa', 'ayuno']).toContain(def?.tipo);

    const carga = await obtenerCargaHorarios(RES_ID, D0, D3);
    expect(carga.success).toBe(true);

    const parsed = CargaHorariosUISchema.safeParse(carga.data);
    expect(parsed.success).toBe(true);

    const desayunoD1 = parsed.success
      ? parsed.data.dias.find((d) => d.fecha === D1)?.tarjetas.find((t) => t.tiempoComidaId === tiempoId(D1, 'desayuno'))
      : undefined;

    expect(desayunoD1?.origenResolucion).toBe('CAPA2_AUSENCIA');
    expect(desayunoD1?.estadoInteraccion).toBe('BLOQUEADO_RESTRICCION');
    expect(desayunoD1?.resultadoEfectivo.nombre).toBe('Ausente');
  });

  it('Matriz multiusuario: sin cambios, actividad, excepcion, ausencia y combinado', async () => {
    await asegurarUsuariosMatriz();
    await setReferenciaSolicitud(horaRef(D0, '20:30'));

    const principalD2 = await obtenerConfigAlternativaPrincipal(D2, 'desayuno');
    const tiempoD2 = tiempoId(D2, 'desayuno');

    for (const uid of [
      MATRIX_USERS.sinCambios.uid,
      MATRIX_USERS.conActividad.uid,
      MATRIX_USERS.conExcepcion.uid,
      MATRIX_USERS.conAusencia.uid,
      MATRIX_USERS.conTodo.uid,
    ]) {
      await setSemanarioSemanaUsuario(uid, D2, principalD2);
    }

    // Usuario con actividad
    await crearActividadParaUsuario(MATRIX_USERS.conActividad.uid, D2);

    // Usuario con excepción aprobada
    await crearExcepcionAprobada(
      MATRIX_USERS.conExcepcion.uid,
      D2,
      tiempoD2,
      principalD2
    );

    // Usuario con ausencia (vía action)
    setSesionDirector(DIRECTORES.carlos);
    const ausenciaSolo = await upsertAusenciaLote(
      RES_ID,
      {
        fechaInicio: D2,
        fechaFin: D2,
        retornoPendienteConfirmacion: false,
        motivo: 'Matriz ausencia',
      },
      MATRIX_USERS.conAusencia.uid
    );
    expect(ausenciaSolo.success).toBe(true);

    // Usuario combinado: actividad + excepción + ausencia (debe ganar CAPA1)
    await crearActividadParaUsuario(MATRIX_USERS.conTodo.uid, D2);
    await crearExcepcionAprobada(
      MATRIX_USERS.conTodo.uid,
      D2,
      tiempoD2,
      principalD2
    );
    const ausenciaTodo = await upsertAusenciaLote(
      RES_ID,
      {
        fechaInicio: D2,
        fechaFin: D2,
        retornoPendienteConfirmacion: false,
        motivo: 'Matriz todo',
      },
      MATRIX_USERS.conTodo.uid
    );
    expect(ausenciaTodo.success).toBe(true);

    const tarjetaBase = await obtenerTarjetaDesayunoComoDirector(MATRIX_USERS.sinCambios.uid, D2);
    expect(tarjetaBase?.origenResolucion).toBe('CAPA4_SEMANARIO');
    expect(tarjetaBase?.estadoInteraccion).toBe('MUTABLE');

    const tarjetaActividad = await obtenerTarjetaDesayunoComoDirector(MATRIX_USERS.conActividad.uid, D2);
    expect(tarjetaActividad?.origenResolucion).toBe('CAPA1_ACTIVIDAD');
    expect(tarjetaActividad?.estadoInteraccion).toBe('BLOQUEADO_AUTORIDAD');

    const tarjetaExcepcion = await obtenerTarjetaDesayunoComoDirector(MATRIX_USERS.conExcepcion.uid, D2);
    expect(tarjetaExcepcion?.origenResolucion).toBe('CAPA3_EXCEPCION');

    const tarjetaAusencia = await obtenerTarjetaDesayunoComoDirector(MATRIX_USERS.conAusencia.uid, D2);
    expect(tarjetaAusencia?.origenResolucion).toBe('CAPA2_AUSENCIA');
    expect(tarjetaAusencia?.resultadoEfectivo.nombre).toBe('Ausente');

    const tarjetaTodo = await obtenerTarjetaDesayunoComoDirector(MATRIX_USERS.conTodo.uid, D2);
    expect(tarjetaTodo?.origenResolucion).toBe('CAPA1_ACTIVIDAD');
    expect(tarjetaTodo?.estadoInteraccion).toBe('BLOQUEADO_AUTORIDAD');
  });
});

