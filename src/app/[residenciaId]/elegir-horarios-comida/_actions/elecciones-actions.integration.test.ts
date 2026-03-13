import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

process.env.FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'demo-test-project';
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8081';
process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';

vi.mock('@/lib/obtenerInfoUsuarioServer', () => ({
  obtenerInfoUsuarioServer: vi.fn(async () => ({
    usuarioId: 'user-test-1',
    email: 'user@test.com',
    roles: ['residente'],
    residenciaId: 'res-test-1',
    zonaHoraria: 'America/Tegucigalpa',
    ctxTraduccion: 'es',
  })),
}));

import { db } from '@/lib/firebaseAdmin';
import { CargaHorariosUISchema } from 'shared/schemas/elecciones/ui.schema';
import { obtenerCargaHorarios } from './obtenerCargaHorarios';
import { upsertExcepcion } from './upsertExcepcion';

const RES_ID = 'res-test-1';
const UID = 'user-test-1';

async function deleteCollection(path: string): Promise<void> {
  const snap = await db.collection(path).get();
  await Promise.all(snap.docs.map((d) => d.ref.delete()));
}

async function cleanTestData() {
  await deleteCollection(`usuarios/${UID}/excepciones`);
  await deleteCollection(`usuarios/${UID}/ausencias`);
  await deleteCollection(`usuarios/${UID}/mensajes`);
  await deleteCollection(`residencias/${RES_ID}/horariosEfectivos`);
  await deleteCollection(`residencias/${RES_ID}/actividades`);

  await db.doc(`usuarios/${UID}`).delete().catch(() => undefined);
  await db.doc(`residencias/${RES_ID}/configuracion/general`).delete().catch(() => undefined);
  await db.doc(`residencias/${RES_ID}`).delete().catch(() => undefined);
}

async function seedBaseSingleton(horaReferencia: string) {
  await db.doc(`residencias/${RES_ID}`).set({
    id: RES_ID,
    nombre: 'Residencia Test',
    estado: 'activo',
    estadoContrato: 'prueba',
    tipo: { tipoResidentes: 'estudiantes', modalidadResidencia: 'hombres' },
    ubicacion: { pais: 'HN', ciudad: 'TGU', zonaHoraria: 'America/Tegucigalpa' },
    contextoTraduccion: 'es',
  }, { merge: true });

  await db.doc(`usuarios/${UID}`).set({
    id: UID,
    email: 'user@test.com',
    nombre: 'User',
    apellido: 'Test',
    nombreCorto: 'UT',
    roles: ['residente'],
    residenciaId: RES_ID,
    tieneAutenticacion: true,
    estaActivo: true,
    puedeTraerInvitados: 'no',
    semanarios: {},
    timestampCreacion: '2026-03-10T00:00:00Z',
    timestampActualizacion: '2026-03-10T00:00:00Z',
  }, { merge: true });

  await db.doc(`residencias/${RES_ID}/configuracion/general`).set({
    residenciaId: RES_ID,
    nombreCompleto: 'Residencia Test',
    version: 1,
    fechaHoraReferenciaUltimaSolicitud: horaReferencia,
    timestampUltimaSolicitud: { seconds: 0, nanoseconds: 0 },
    horariosSolicitud: {
      hs1: { nombre: 'Cierre jueves', dia: 'jueves', horaSolicitud: 'T20:00', esPrimario: true, estaActivo: true },
    },
    comedores: {
      comedor1: { nombre: 'Comedor Test', capacidad: 10, ubicacion: 'PB', activo: true },
    },
    gruposUsuarios: {},
    dietas: {},
    gruposComidas: {
      desayuno: { nombre: 'Desayuno', orden: 1, estaActivo: true },
    },
    esquemaSemanal: {
      desayuno_jueves: {
        nombre: 'Desayuno Jueves',
        grupoComida: 'desayuno',
        dia: 'jueves',
        horaReferencia: 'T07:00',
        alternativas: { principal: 'cfg_des_jue_1' },
        estaActivo: true,
      },
    },
    catalogoAlternativas: {
      altComedor: {
        nombre: 'Regular',
        grupoComida: 'desayuno',
        descripcion: 'Regular',
        tipo: 'comedor',
        estaActiva: true,
      },
    },
    configuracionesAlternativas: {
      cfg_des_jue_1: {
        nombre: 'Des Jue 1',
        tiempoComidaId: 'desayuno_jueves',
        definicionAlternativaId: 'altComedor',
        horarioSolicitudComidaId: 'hs1',
        comedorId: 'comedor1',
        requiereAprobacion: false,
        ventanaServicio: { horaInicio: 'T07:00', horaFin: 'T08:00', tipoVentana: 'normal' },
        estaActivo: true,
      },
    },
    restriccionesCatalogo: {},
  });
}

describe('elecciones server actions - integration (emulator)', () => {
  beforeEach(async () => {
    await cleanTestData();
  });

  afterEach(async () => {
    await cleanTestData();
  });

  it('Test Lectura: obtenerCargaHorarios devuelve payload válido para UI schema', async () => {
    await seedBaseSingleton('2099-01-01T00:00:00');

    await db.doc(`usuarios/${UID}/excepciones/2026-03-12__desayuno_jueves`).set({
      usuarioId: UID,
      residenciaId: RES_ID,
      fecha: '2026-03-12',
      tiempoComidaId: 'desayuno_jueves',
      configuracionAlternativaId: 'cfg_des_jue_1',
      esAlternativaAlterada: false,
      origenAutoridad: 'residente',
      estadoAprobacion: 'no_requerida',
    });

    const result = await obtenerCargaHorarios(RES_ID, '2026-03-12', '2026-03-12');
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    const parsed = CargaHorariosUISchema.safeParse(result.data);
    expect(parsed.success).toBe(true);
  });

  it("Test Autoridad: upsertExcepcion rebota cuando existe director-restringido", async () => {
    await seedBaseSingleton('2099-01-01T00:00:00');

    await db.doc(`usuarios/${UID}/excepciones/2026-03-12__desayuno_jueves`).set({
      usuarioId: UID,
      residenciaId: RES_ID,
      fecha: '2026-03-12',
      tiempoComidaId: 'desayuno_jueves',
      configuracionAlternativaId: 'cfg_des_jue_1',
      esAlternativaAlterada: false,
      origenAutoridad: 'director-restringido',
      estadoAprobacion: 'no_requerida',
    });

    const singletonSnap = await db.doc(`residencias/${RES_ID}/configuracion/general`).get();
    const singletonData = singletonSnap.data() as any;
    expect(Boolean(singletonData?.configuracionesAlternativas?.cfg_des_jue_1)).toBe(true);

    const bloqueadaSnap = await db.doc(`usuarios/${UID}/excepciones/2026-03-12__desayuno_jueves`).get();
    expect(bloqueadaSnap.exists).toBe(true);

    const result = await upsertExcepcion(RES_ID, {
      fecha: '2026-03-12',
      tiempoComidaId: 'desayuno_jueves',
      configuracionAlternativaId: 'cfg_des_jue_1',
      esAlternativaAlterada: false,
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('AUTORIDAD_RESTRINGIDA');
  });

  it('Test Muro Móvil (Escritura): upsertExcepcion rebota si ya cerró', async () => {
    await seedBaseSingleton('2000-01-01T00:00:00');

    const result = await upsertExcepcion(RES_ID, {
      fecha: '2026-03-12',
      tiempoComidaId: 'desayuno_jueves',
      configuracionAlternativaId: 'cfg_des_jue_1',
      esAlternativaAlterada: false,
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('MURO_MOVIL_CERRADO');
  });
});
