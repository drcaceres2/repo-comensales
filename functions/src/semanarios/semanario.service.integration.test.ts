import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getISOWeek, getISOWeekYear, parseISO } from 'date-fns';
import { db } from '../lib/firebase';
import { upsertSemanarioService } from './semanario.service';

process.env.FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'demo-test-project';
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8081';
process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';

function weekKey(fechaIso: string): string {
  const fecha = parseISO(fechaIso);
  return `${getISOWeekYear(fecha)}-W${String(getISOWeek(fecha)).padStart(2, '0')}`;
}

async function seedSingleton(residenciaId: string, fechaCorte: string) {
  await db.doc(`residencias/${residenciaId}/configuracion/general`).set({
    residenciaId,
    nombreCompleto: 'Residencia Test Semanarios',
    version: 1,
    fechaHoraReferenciaUltimaSolicitud: fechaCorte,
    timestampUltimaSolicitud: { seconds: 0, nanoseconds: 0 },
    horariosSolicitud: {
      hs1: { nombre: 'HS1', dia: 'lunes', horaSolicitud: 'T20:00', esPrimario: true, estaActivo: true },
    },
    comedores: {
      comedor1: { nombre: 'Comedor 1', capacidad: 20, ubicacion: 'PB', activo: true },
    },
    gruposUsuarios: {},
    dietas: {},
    gruposComidas: {
      desayuno: { nombre: 'Desayuno', orden: 1, estaActivo: true },
    },
    esquemaSemanal: {
      desayuno_lunes: {
        nombre: 'Desayuno lunes',
        grupoComida: 'desayuno',
        dia: 'lunes',
        horaReferencia: 'T07:00',
        alternativas: { principal: 'cfg_des_1', secundarias: ['cfg_des_2'] },
        estaActivo: true,
      },
    },
    catalogoAlternativas: {
      alt1: { nombre: 'Regular', grupoComida: 'desayuno', descripcion: 'Regular', tipo: 'comedor', estaActiva: true },
      alt2: { nombre: 'Llevar', grupoComida: 'desayuno', descripcion: 'Para llevar', tipo: 'paraLlevar', estaActiva: true },
    },
    configuracionesAlternativas: {
      cfg_des_1: {
        nombre: 'Regular',
        tiempoComidaId: 'desayuno_lunes',
        definicionAlternativaId: 'alt1',
        horarioSolicitudComidaId: 'hs1',
        comedorId: 'comedor1',
        requiereAprobacion: false,
        ventanaServicio: { horaInicio: 'T07:00', horaFin: 'T08:00', tipoVentana: 'normal' },
        estaActivo: true,
      },
      cfg_des_2: {
        nombre: 'Llevar',
        tiempoComidaId: 'desayuno_lunes',
        definicionAlternativaId: 'alt2',
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

async function seedUser(user: any) {
  await db.doc(`usuarios/${user.id}`).set(user, { merge: true });
}

async function cleanup(residenciaId: string, ...uids: string[]) {
  await db.doc(`residencias/${residenciaId}/configuracion/general`).delete().catch(() => undefined);
  await Promise.all(uids.map((uid) => db.doc(`usuarios/${uid}`).delete().catch(() => undefined)));
}

describe('upsertSemanarioService integration', () => {
  const residenciaId = 'res-semanarios-test';
  const residenteUid = 'usr-residente-1';
  const asistenteUid = 'usr-asistente-1';
  const directorUid = 'usr-director-1';

  beforeEach(async () => {
    await cleanup(residenciaId, residenteUid, asistenteUid, directorUid);
  });

  afterEach(async () => {
    await cleanup(residenciaId, residenteUid, asistenteUid, directorUid);
  });

  it('hace upcasting de semana historica y mantiene otras semanas intactas', async () => {
    const fechaCorte = '2026-03-10T00:00:00Z';
    const semanaActual = weekKey(fechaCorte);

    await seedSingleton(residenciaId, fechaCorte);
    await seedUser({
      id: residenteUid,
      email: 'residente@test.com',
      nombre: 'Residente',
      apellido: 'Uno',
      nombreCorto: 'R1',
      roles: ['residente'],
      residenciaId,
      tieneAutenticacion: true,
      estaActivo: true,
      puedeTraerInvitados: 'no',
      semanarios: {
        '2030-W01': { desayuno_lunes: { configuracionAlternativaId: 'cfg_des_1' } },
      },
      updatedAt: '2026-03-10T00:00:00.000Z',
      timestampCreacion: '2026-03-10T00:00:00.000Z',
      timestampActualizacion: '2026-03-10T00:00:00.000Z',
    });

    const payload = {
      usuarioId: residenteUid,
      semanaIsoEfectiva: '2000-W01',
      semanario: {
        desayuno_lunes: { configuracionAlternativaId: 'cfg_des_2' },
      },
      lastUpdatedAt: '2026-03-10T00:00:00.000Z',
    };

    const result = await upsertSemanarioService({
      callerUid: residenteUid,
      callerProfile: {
        id: residenteUid,
        roles: ['residente'],
        residenciaId,
      } as any,
      payload,
    });

    expect(result.semanaIsoAplicada).toBe(semanaActual);

    const usuarioSnap = await db.doc(`usuarios/${residenteUid}`).get();
    const usuario = usuarioSnap.data() as any;

    expect(usuario.semanarios['2030-W01'].desayuno_lunes.configuracionAlternativaId).toBe('cfg_des_1');
    expect(usuario.semanarios[semanaActual].desayuno_lunes.configuracionAlternativaId).toBe('cfg_des_2');
  });

  it('rechaza escritura de director con permission-denied', async () => {
    await seedSingleton(residenciaId, '2026-03-10T00:00:00Z');
    await seedUser({
      id: residenteUid,
      email: 'residente@test.com',
      nombre: 'Residente',
      apellido: 'Uno',
      nombreCorto: 'R1',
      roles: ['residente'],
      residenciaId,
      tieneAutenticacion: true,
      estaActivo: true,
      puedeTraerInvitados: 'no',
      semanarios: {},
      updatedAt: '2026-03-10T00:00:00.000Z',
      timestampCreacion: '2026-03-10T00:00:00.000Z',
      timestampActualizacion: '2026-03-10T00:00:00.000Z',
    });

    await expect(
      upsertSemanarioService({
        callerUid: directorUid,
        callerProfile: {
          id: directorUid,
          roles: ['director'],
          residenciaId,
        } as any,
        payload: {
          usuarioId: residenteUid,
          semanaIsoEfectiva: '2026-W11',
          semanario: { desayuno_lunes: { configuracionAlternativaId: 'cfg_des_1' } },
          lastUpdatedAt: '2026-03-10T00:00:00.000Z',
        },
      })
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('permite escritura de asistente delegado', async () => {
    await seedSingleton(residenciaId, '2026-03-10T00:00:00Z');
    await seedUser({
      id: residenteUid,
      email: 'residente@test.com',
      nombre: 'Residente',
      apellido: 'Uno',
      nombreCorto: 'R1',
      roles: ['residente'],
      residenciaId,
      tieneAutenticacion: true,
      estaActivo: true,
      puedeTraerInvitados: 'no',
      semanarios: {},
      updatedAt: '2026-03-10T00:00:00.000Z',
      timestampCreacion: '2026-03-10T00:00:00.000Z',
      timestampActualizacion: '2026-03-10T00:00:00.000Z',
    });

    const result = await upsertSemanarioService({
      callerUid: asistenteUid,
      callerProfile: {
        id: asistenteUid,
        roles: ['asistente'],
        residenciaId,
        asistente: {
          usuariosAsistidos: {
            [residenteUid]: { nivelAcceso: 'Todas' },
          },
        },
      } as any,
      payload: {
        usuarioId: residenteUid,
        semanaIsoEfectiva: '2026-W11',
        semanario: { desayuno_lunes: { configuracionAlternativaId: 'cfg_des_2' } },
        lastUpdatedAt: '2026-03-10T00:00:00.000Z',
      },
    });

    expect(result.semanaIsoAplicada).toBe('2026-W11');
  });

  it('rechaza OCC cuando updatedAt del documento es mas reciente', async () => {
    await seedSingleton(residenciaId, '2026-03-10T00:00:00Z');
    await seedUser({
      id: residenteUid,
      email: 'residente@test.com',
      nombre: 'Residente',
      apellido: 'Uno',
      nombreCorto: 'R1',
      roles: ['residente'],
      residenciaId,
      tieneAutenticacion: true,
      estaActivo: true,
      puedeTraerInvitados: 'no',
      semanarios: {},
      updatedAt: '2026-03-10T10:00:00.000Z',
      timestampCreacion: '2026-03-10T00:00:00.000Z',
      timestampActualizacion: '2026-03-10T10:00:00.000Z',
    });

    await expect(
      upsertSemanarioService({
        callerUid: residenteUid,
        callerProfile: {
          id: residenteUid,
          roles: ['residente'],
          residenciaId,
        } as any,
        payload: {
          usuarioId: residenteUid,
          semanaIsoEfectiva: '2026-W11',
          semanario: { desayuno_lunes: { configuracionAlternativaId: 'cfg_des_1' } },
          lastUpdatedAt: '2026-03-10T09:59:00.000Z',
        },
      })
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });
});
