import { describe, expect, it } from 'vitest';
import { getISOWeek, getISOWeekYear, parseISO } from 'date-fns';

import { estaMuroMovilCerrado } from './muroMovil';
import { calcularHorarioReferenciaSolicitud } from './calcularHorarioReferenciaSolicitud';
import { detectarInterseccionAusencia } from './interseccionAusencias';
import { densificarCapa0 } from './densificadorCapa0';
import { resolverCascadaTiempoComida } from './motorCascada';
import { generarPayloadHorariosUI } from './orquestadorUI';

function getWeekKey(fechaIso: string): string {
  const fecha = parseISO(fechaIso);
  return `${getISOWeekYear(fecha)}-W${String(getISOWeek(fecha)).padStart(2, '0')}`;
}

function buildSingleton() {
  return {
    residenciaId: 'res-1',
    nombreCompleto: 'Residencia 1',
    version: 1,
    fechaHoraReferenciaUltimaSolicitud: '2026-03-10T10:00:00',
    timestampUltimaSolicitud: { seconds: 0, nanoseconds: 0 },
    horariosSolicitud: {
      hs1: { nombre: 'HS1', dia: 'jueves', horaSolicitud: 'T12:00', esPrimario: true, estaActivo: true },
      hs2: { nombre: 'HS2', dia: 'viernes', horaSolicitud: 'T12:00', esPrimario: true, estaActivo: true },
    },
    comedores: {
      comedor1: { nombre: 'Comedor Central', capacidad: 100, ubicacion: 'Planta baja', activo: true },
    },
    gruposUsuarios: {},
    dietas: {},
    gruposComidas: {
      desayuno: { nombre: 'Desayuno', orden: 1, estaActivo: true },
      almuerzo: { nombre: 'Almuerzo', orden: 2, estaActivo: true },
    },
    esquemaSemanal: {
      'desayuno-jueves': {
        nombre: 'Desayuno Jueves',
        grupoComida: 'desayuno',
        dia: 'jueves',
        horaReferencia: 'T07:00',
        alternativas: { principal: 'cfg-des-jue-1', secundarias: ['cfg-des-jue-2'] },
        estaActivo: true,
      },
      'almuerzo-jueves': {
        nombre: 'Almuerzo Jueves',
        grupoComida: 'almuerzo',
        dia: 'jueves',
        horaReferencia: 'T12:00',
        alternativas: { principal: 'cfg-alm-jue-1' },
        estaActivo: true,
      },
      'desayuno-viernes': {
        nombre: 'Desayuno Viernes',
        grupoComida: 'desayuno',
        dia: 'viernes',
        horaReferencia: 'T07:00',
        alternativas: { principal: 'cfg-des-vie-1' },
        estaActivo: true,
      },
      'almuerzo-viernes': {
        nombre: 'Almuerzo Viernes',
        grupoComida: 'almuerzo',
        dia: 'viernes',
        horaReferencia: 'T12:00',
        alternativas: { principal: 'cfg-alm-vie-1' },
        estaActivo: true,
      },
    },
    catalogoAlternativas: {
      alt1: { nombre: 'Comedor Regular', grupoComida: 'desayuno', descripcion: 'Normal', tipo: 'comedor', estaActiva: true },
      alt2: { nombre: 'Para Llevar', grupoComida: 'desayuno', descripcion: 'Empaque', tipo: 'paraLlevar', estaActiva: true },
      alt3: { nombre: 'No Como en Casa', grupoComida: 'almuerzo', descripcion: 'Ausente', tipo: 'noComoEnCasa', estaActiva: true },
    },
    configuracionesAlternativas: {
      'cfg-des-jue-1': {
        nombre: 'Des Jue 1',
        tiempoComidaId: 'desayuno-jueves',
        definicionAlternativaId: 'alt1',
        horarioSolicitudComidaId: 'hs1',
        comedorId: 'comedor1',
        requiereAprobacion: false,
        ventanaServicio: { horaInicio: 'T07:00', horaFin: 'T08:00', tipoVentana: 'normal' },
        estaActivo: true,
      },
      'cfg-des-jue-2': {
        nombre: 'Des Jue 2',
        tiempoComidaId: 'desayuno-jueves',
        definicionAlternativaId: 'alt2',
        horarioSolicitudComidaId: 'hs1',
        comedorId: 'comedor1',
        requiereAprobacion: true,
        ventanaServicio: { horaInicio: 'T07:00', horaFin: 'T08:00', tipoVentana: 'normal' },
        estaActivo: true,
      },
      'cfg-alm-jue-1': {
        nombre: 'Alm Jue 1',
        tiempoComidaId: 'almuerzo-jueves',
        definicionAlternativaId: 'alt1',
        horarioSolicitudComidaId: 'hs1',
        comedorId: 'comedor1',
        requiereAprobacion: false,
        ventanaServicio: { horaInicio: 'T12:00', horaFin: 'T13:00', tipoVentana: 'normal' },
        estaActivo: true,
      },
      'cfg-des-vie-1': {
        nombre: 'Des Vie 1',
        tiempoComidaId: 'desayuno-viernes',
        definicionAlternativaId: 'alt1',
        horarioSolicitudComidaId: 'hs2',
        comedorId: 'comedor1',
        requiereAprobacion: false,
        ventanaServicio: { horaInicio: 'T07:00', horaFin: 'T08:00', tipoVentana: 'normal' },
        estaActivo: true,
      },
      'cfg-alm-vie-1': {
        nombre: 'Alm Vie 1',
        tiempoComidaId: 'almuerzo-viernes',
        definicionAlternativaId: 'alt1',
        horarioSolicitudComidaId: 'hs2',
        comedorId: 'comedor1',
        requiereAprobacion: false,
        ventanaServicio: { horaInicio: 'T12:00', horaFin: 'T13:00', tipoVentana: 'normal' },
        estaActivo: true,
      },
    },
    restriccionesCatalogo: {},
  } as any;
}

describe('estaMuroMovilCerrado', () => {
  it('retorna true cuando referencia supera el corte', () => {
    expect(estaMuroMovilCerrado('2026-03-10T10:00:00', '2026-03-10T10:30:00')).toBe(true);
  });

  it('soporta fecha simple normalizada', () => {
    expect(estaMuroMovilCerrado('2026-03-10', '2026-03-09T23:59:59')).toBe(false);
  });

  it('lanza error en formato inválido', () => {
    expect(() => estaMuroMovilCerrado('10/03/2026' as any, '2026-03-10T10:00:00')).toThrow();
  });

  it('acepta formato ISO con Z y milisegundos (formato Firestore)', () => {
    // new Date().toISOString() produces "2026-03-13T11:40:56.165Z" — must not throw
    expect(estaMuroMovilCerrado('2026-03-10T10:00:00.000Z', '2026-03-10T10:30:00.123Z')).toBe(true);
    expect(estaMuroMovilCerrado('2026-03-10T10:00:00Z', '2026-03-09T23:59:59Z')).toBe(false);
  });

  it('acepta offset positivo y lo descarta tratando la parte local', () => {
    // '2026-03-10T10:00:00+05:00' → local part '2026-03-10T10:00:00'
    // referencia '2026-03-10T10:00:00+05:00' → misma parte local → referencia === corte → cerrado
    expect(estaMuroMovilCerrado('2026-03-10T10:00:00+05:00', '2026-03-10T10:30:00+05:00')).toBe(true);
    expect(estaMuroMovilCerrado('2026-03-10T10:00:00+05:00', '2026-03-10T09:59:59+05:00')).toBe(false);
  });
});

describe('calcularHorarioReferenciaSolicitud', () => {
  const horariosSolicitud = {
    // Cierre el jueves a las 10:00
    'hs-jueves': { nombre: 'Cierre Jueves', dia: 'jueves', horaSolicitud: 'T10:00', esPrimario: true, estaActivo: true },
    // Cierre el viernes a las 12:00
    'hs-viernes': { nombre: 'Cierre Viernes', dia: 'viernes', horaSolicitud: 'T12:00', esPrimario: true, estaActivo: true },
    // Cierre el lunes a las 08:00
    'hs-lunes': { nombre: 'Cierre Lunes', dia: 'lunes', horaSolicitud: 'T08:00', esPrimario: false, estaActivo: true },
  };

  it('retrocede 1 día cuando el cierre es el día anterior a la comida (viernes→jueves)', () => {
    // 2026-03-20 es viernes (getUTCDay=5), cierre jueves (índice 4) → diasARestar=1 → 2026-03-19
    expect(
      calcularHorarioReferenciaSolicitud('2026-03-20', 'hs-jueves', horariosSolicitud)
    ).toBe('2026-03-19T10:00:00');
  });

  it('usa el mismo día cuando el cierre coincide con el día de la comida (viernes→viernes)', () => {
    // 2026-03-20 es viernes, cierre viernes → diasARestar=0 → 2026-03-20
    expect(
      calcularHorarioReferenciaSolicitud('2026-03-20', 'hs-viernes', horariosSolicitud)
    ).toBe('2026-03-20T12:00:00');
  });

  it('cruza semana correctamente cuando el cierre es posterior en la semana (jueves→lunes anterior)', () => {
    // 2026-03-19 es jueves (getUTCDay=4), cierre lunes (índice 1) → diasARestar=(4-1+7)%7=3 → 2026-03-16
    expect(
      calcularHorarioReferenciaSolicitud('2026-03-19', 'hs-lunes', horariosSolicitud)
    ).toBe('2026-03-16T08:00:00');
  });

  it('retorna fallback de medianoche cuando el horarioSolicitudId no existe', () => {
    expect(
      calcularHorarioReferenciaSolicitud('2026-03-20', 'hs-inexistente', horariosSolicitud)
    ).toBe('2026-03-20T00:00:00');
  });

  it('normaliza horaSolicitud sin prefijo T (formato HH:mm)', () => {
    const horariosConHoraPlana = {
      'hs-plano': { dia: 'jueves', horaSolicitud: '10:00' },
    };
    expect(
      calcularHorarioReferenciaSolicitud('2026-03-20', 'hs-plano', horariosConHoraPlana)
    ).toBe('2026-03-19T10:00:00');
  });
});

describe('detectarInterseccionAusencia', () => {
  const orden = ['desayuno', 'almuerzo', 'cena'];
  const ausencia = {
    usuarioId: 'U123456789',
    residenciaId: 'res-1',
    fechaInicio: '2026-03-12',
    primerTiempoAusente: 'almuerzo',
    fechaFin: '2026-03-14',
    ultimoTiempoAusente: 'almuerzo',
  } as any;

  it('respeta límites de inicio/fin por tiempo de comida', () => {
    expect(detectarInterseccionAusencia('2026-03-12', 'desayuno', [ausencia], orden)).toBeUndefined();
    expect(detectarInterseccionAusencia('2026-03-12', 'almuerzo', [ausencia], orden)).toBeDefined();
    expect(detectarInterseccionAusencia('2026-03-14', 'cena', [ausencia], orden)).toBeUndefined();
  });

  it('con null en bordes cubre día completo', () => {
    const fullBorder = {
      ...ausencia,
      primerTiempoAusente: null,
      ultimoTiempoAusente: null,
    };

    expect(detectarInterseccionAusencia('2026-03-12', 'desayuno', [fullBorder], orden)).toBeDefined();
    expect(detectarInterseccionAusencia('2026-03-14', 'cena', [fullBorder], orden)).toBeDefined();
  });
});

describe('densificarCapa0', () => {
  it('densifica el rango usando sparse + singleton', () => {
    const singleton = buildSingleton();
    const vistaDispersa = {
      '2026-03-12': {
        id: '2026-03-12',
        residenciaId: 'res-1',
        tiemposComida: {
          'desayuno-jueves': {
            esAlterado: true,
            alteracionId: 'altx1',
            motivo: 'Cocina en mantenimiento',
            opcionesActivas: [
              {
                nombre: 'Des Jue 2',
                configuracionAlternativaId: 'cfg-des-jue-2',
                ventanaServicio: { horaInicio: 'T07:00', horaFin: 'T08:00', tipoVentana: 'normal' },
                comedorId: 'comedor1',
                horarioReferenciaSolicitud: '2026-03-10T10:00:00',
              },
            ],
            contingenciaAlternativaId: 'cfg-des-jue-2',
          },
        },
      },
    } as any;

    const denso = densificarCapa0(['2026-03-12', '2026-03-13'], singleton, vistaDispersa);

    expect(Object.keys(denso)).toEqual(['2026-03-12', '2026-03-13']);
    expect(denso['2026-03-12'].tiemposComida['desayuno-jueves'].esAlterado).toBe(true);
    expect(denso['2026-03-13'].tiemposComida['desayuno-viernes']).toBeDefined();
    expect(denso['2026-03-13'].tiemposComida['almuerzo-viernes']).toBeDefined();
  });
});

describe('resolverCascadaTiempoComida', () => {
  const baseContext = {
    fecha: '2026-03-12',
    tiempoComidaId: 'desayuno-jueves',
    grupoComida: { nombre: 'Desayuno', orden: 1, estaActivo: true },
    fechaHoraReferenciaUltimaSolicitud: '2026-03-01T10:00:00',
    resolverAlternativa: (id: string) => ({
      nombre: id,
      tipo: id === 'cfg-des-jue-2' ? 'paraLlevar' : 'comedor',
      requiereAprobacion: id === 'cfg-des-jue-2',
    }),
  } as any;

  const slot = {
    esAlterado: false,
    alteracionId: undefined,
    motivo: undefined,
    opcionesActivas: [
      {
        nombre: 'Des Jue 1',
        configuracionAlternativaId: 'cfg-des-jue-1',
        ventanaServicio: { horaInicio: 'T07:00', horaFin: 'T08:00', tipoVentana: 'normal' },
        comedorId: 'comedor1',
        horarioReferenciaSolicitud: '2026-03-10T10:00:00',
      },
      {
        nombre: 'Des Jue 2',
        configuracionAlternativaId: 'cfg-des-jue-2',
        ventanaServicio: { horaInicio: 'T07:00', horaFin: 'T08:00', tipoVentana: 'normal' },
        comedorId: 'comedor1',
        horarioReferenciaSolicitud: '2026-03-10T10:00:00',
      },
    ],
    contingenciaAlternativaId: 'cfg-des-jue-1',
  } as any;

  it('aplica prioridad CAPA1_ACTIVIDAD sobre capas inferiores', () => {
    const tarjeta = resolverCascadaTiempoComida(baseContext, slot, {
      inscripcionActividad: {
        actividadId: 'act-1',
        nombreActividad: 'Asado',
        configuracionAlternativaId: 'cfg-des-jue-2',
      },
      ausencia: {
        usuarioId: 'U123456789',
        residenciaId: 'res-1',
        fechaInicio: '2026-03-12',
        fechaFin: '2026-03-12',
      } as any,
      eleccionSemanario: { configuracionAlternativaId: 'cfg-des-jue-1' },
    });

    expect(tarjeta.origenResolucion).toBe('CAPA1_ACTIVIDAD');
    expect(tarjeta.estadoInteraccion).toBe('BLOQUEADO_AUTORIDAD');
    expect(tarjeta.resultadoEfectivo.configuracionAlternativaId).toBe('cfg-des-jue-2');
  });

  it('mantiene base semanario cuando excepción está pendiente', () => {
    const tarjeta = resolverCascadaTiempoComida(baseContext, slot, {
      excepcion: {
        usuarioId: 'U123456789',
        residenciaId: 'res-1',
        fecha: '2026-03-12',
        tiempoComidaId: 'desayuno-jueves',
        configuracionAlternativaId: 'cfg-des-jue-1',
        esAlternativaAlterada: false,
        origenAutoridad: 'residente',
        estadoAprobacion: 'pendiente',
        contingenciaConfigAlternativaId: 'cfg-des-jue-1',
      } as any,
      eleccionSemanario: { configuracionAlternativaId: 'cfg-des-jue-2' },
    });

    expect(tarjeta.estadoAprobacion).toBe('pendiente');
    expect(tarjeta.origenResolucion).toBe('CAPA4_SEMANARIO');
    expect(tarjeta.resultadoEfectivo.configuracionAlternativaId).toBe('cfg-des-jue-2');
  });
});

describe('generarPayloadHorariosUI', () => {
  it('arma payload válido para rango y aplica actividad en capa 1', () => {
    const singleton = buildSingleton();
    const fechasRango = ['2026-03-12', '2026-03-13'];
    const semana = getWeekKey('2026-03-12');

    const payload = generarPayloadHorariosUI({
      fechasRango,
      fechaHoraReferenciaUltimaSolicitud: '2026-03-01T10:00:00',
      singletonResidencia: singleton,
      vistaMaterializadaDiaria: {},
      diccionarioSemanarios: {
        [semana]: {
          'desayuno-jueves': { configuracionAlternativaId: 'cfg-des-jue-2' },
          'almuerzo-jueves': { configuracionAlternativaId: 'cfg-alm-jue-1' },
          'desayuno-viernes': { configuracionAlternativaId: 'cfg-des-vie-1' },
          'almuerzo-viernes': { configuracionAlternativaId: 'cfg-alm-vie-1' },
        },
      },
      excepcionesUsuario: [],
      ausenciasUsuario: [],
      inscripcionesActividad: [
        {
          actividadId: 'act-1',
          nombreActividad: 'Asado Institucional',
          configuracionAlternativaId: 'cfg-des-vie-1',
          fechaInicio: '2026-03-13',
          fechaFin: '2026-03-13',
          tiemposComidaIds: ['desayuno-viernes'],
        },
      ],
    } as any);

    expect(payload.dias).toHaveLength(2);
    expect(payload.actividades).toHaveLength(1);

    const diaJueves = payload.dias.find((d) => d.fecha === '2026-03-12');
    expect(diaJueves?.tarjetas.some((t) => t.origenResolucion === 'CAPA4_SEMANARIO')).toBe(true);

    const diaViernes = payload.dias.find((d) => d.fecha === '2026-03-13');
    expect(diaViernes?.tarjetas.some((t) => t.origenResolucion === 'CAPA1_ACTIVIDAD')).toBe(true);
  });

  it('ordena cronológicamente tiempos con HoraIso mixto', () => {
    const singleton = buildSingleton();
    singleton.esquemaSemanal['almuerzo-tarde-viernes'] = {
      nombre: 'Almuerzo Tarde Viernes',
      grupoComida: 'almuerzo',
      dia: 'viernes',
      horaReferencia: '19:30',
      alternativas: { principal: 'cfg-alm-tarde-vie-1' },
      estaActivo: true,
    };
    singleton.configuracionesAlternativas['cfg-alm-tarde-vie-1'] = {
      nombre: 'Alm Tarde Vie 1',
      tiempoComidaId: 'almuerzo-tarde-viernes',
      definicionAlternativaId: 'alt1',
      horarioSolicitudComidaId: 'hs2',
      comedorId: 'comedor1',
      requiereAprobacion: false,
      ventanaServicio: { horaInicio: '19:30', horaFin: '20:00', tipoVentana: 'normal' },
      estaActivo: true,
    };

    const semana = getWeekKey('2026-03-13');
    const payload = generarPayloadHorariosUI({
      fechasRango: ['2026-03-13'],
      fechaHoraReferenciaUltimaSolicitud: '2026-03-01T10:00:00',
      singletonResidencia: singleton,
      vistaMaterializadaDiaria: {},
      diccionarioSemanarios: {
        [semana]: {
          'desayuno-viernes': { configuracionAlternativaId: 'cfg-des-vie-1' },
          'almuerzo-viernes': { configuracionAlternativaId: 'cfg-alm-vie-1' },
          'almuerzo-tarde-viernes': { configuracionAlternativaId: 'cfg-alm-tarde-vie-1' },
        },
      },
      excepcionesUsuario: [],
      ausenciasUsuario: [],
      inscripcionesActividad: [],
    } as any);

    expect(payload.dias).toHaveLength(1);
    expect(payload.dias[0].tarjetas.map((tarjeta) => tarjeta.tiempoComidaId)).toEqual([
      'desayuno_viernes',
      'almuerzo_viernes',
      'almuerzo_tarde_viernes',
    ]);
  });

  /**
   * Tests de integración del muro móvil.
   *
   * Singleton del buildSingleton():
   *   hs1: dia='jueves', horaSolicitud='T12:00'
   *   hs2: dia='viernes', horaSolicitud='T12:00'
   *
   * Cálculos de corte para la fecha '2026-03-12' (jueves):
   *   cfg-des-jue-1 / cfg-des-jue-2 / cfg-alm-jue-1 → hs1 → corte = '2026-03-12T12:00:00'
   *
   * Cálculos de corte para la fecha '2026-03-13' (viernes):
   *   cfg-des-vie-1 / cfg-alm-vie-1 → hs2 → corte = '2026-03-13T12:00:00'
   */
  it('muro ABIERTO cuando la referencia es anterior al corte calculado por alternativa', () => {
    const singleton = buildSingleton();
    // Referencia anterior al corte del jueves (12:00) → muro abierto
    singleton.fechaHoraReferenciaUltimaSolicitud = '2026-03-12T10:00:00';

    const semana = getWeekKey('2026-03-12');
    const payload = generarPayloadHorariosUI({
      fechasRango: ['2026-03-12'],
      fechaHoraReferenciaUltimaSolicitud: '2026-03-12T10:00:00',
      singletonResidencia: singleton,
      vistaMaterializadaDiaria: {},
      diccionarioSemanarios: {
        [semana]: {
          'desayuno-jueves': { configuracionAlternativaId: 'cfg-des-jue-1' },
          'almuerzo-jueves': { configuracionAlternativaId: 'cfg-alm-jue-1' },
        },
      },
      excepcionesUsuario: [],
      ausenciasUsuario: [],
    } as any);

    const diaJueves = payload.dias.find((d) => d.fecha === '2026-03-12');
    expect(diaJueves?.tarjetas.length).toBeGreaterThan(0);
    // Ninguna tarjeta debe estar bloqueada por el muro móvil
    expect(diaJueves?.tarjetas.every((t) => t.estadoInteraccion === 'MUTABLE')).toBe(true);
    // Todas las opciones del drawer deben estar disponibles para elegir
    const todasLasOpciones = diaJueves?.tarjetas.flatMap((t) => t.detallesDrawer?.opciones ?? []) ?? [];
    expect(todasLasOpciones.length).toBeGreaterThan(0);
    expect(todasLasOpciones.every((op) => op.disponibleParaElegir)).toBe(true);
  });

  it('muro CERRADO cuando la referencia supera el corte calculado por alternativa', () => {
    const singleton = buildSingleton();
    // Referencia posterior al corte del jueves (12:00) → muro cerrado
    singleton.fechaHoraReferenciaUltimaSolicitud = '2026-03-12T13:00:00';

    const semana = getWeekKey('2026-03-12');
    const payload = generarPayloadHorariosUI({
      fechasRango: ['2026-03-12'],
      fechaHoraReferenciaUltimaSolicitud: '2026-03-12T13:00:00',
      singletonResidencia: singleton,
      vistaMaterializadaDiaria: {},
      diccionarioSemanarios: {
        [semana]: {
          'desayuno-jueves': { configuracionAlternativaId: 'cfg-des-jue-1' },
          'almuerzo-jueves': { configuracionAlternativaId: 'cfg-alm-jue-1' },
        },
      },
      excepcionesUsuario: [],
      ausenciasUsuario: [],
    } as any);

    const diaJueves = payload.dias.find((d) => d.fecha === '2026-03-12');
    expect(diaJueves?.tarjetas.length).toBeGreaterThan(0);
    // Todas las tarjetas deben estar bloqueadas a nivel sistema por el muro móvil
    expect(diaJueves?.tarjetas.every((t) => t.estadoInteraccion === 'BLOQUEADO_SISTEMA')).toBe(true);
    // El mensaje formativo debe indicar el cierre del plazo
    expect(diaJueves?.tarjetas.every((t) => Boolean(t.detallesDrawer.mensajeFormativo))).toBe(true);
    // Cuando estadoInteraccion === 'BLOQUEADO_SISTEMA', el drawer no expone opciones
    expect(diaJueves?.tarjetas.every((t) => t.detallesDrawer.opciones === undefined)).toBe(true);
  });

  it('muro DIFERENCIADO: jueves cerrado y viernes abierto en el mismo payload', () => {
    const singleton = buildSingleton();
    // corte jueves = '2026-03-12T12:00:00'  → referencia 13:00 lo supera → CERRADO
    // corte viernes = '2026-03-13T12:00:00' → referencia 13:00 NO lo supera → ABIERTO
    const referencia = '2026-03-12T13:00:00';
    singleton.fechaHoraReferenciaUltimaSolicitud = referencia;

    const semanaJueves = getWeekKey('2026-03-12');
    const semanaViernes = getWeekKey('2026-03-13');
    const payload = generarPayloadHorariosUI({
      fechasRango: ['2026-03-12', '2026-03-13'],
      fechaHoraReferenciaUltimaSolicitud: referencia,
      singletonResidencia: singleton,
      vistaMaterializadaDiaria: {},
      diccionarioSemanarios: {
        [semanaJueves]: {
          'desayuno-jueves': { configuracionAlternativaId: 'cfg-des-jue-1' },
          'almuerzo-jueves': { configuracionAlternativaId: 'cfg-alm-jue-1' },
        },
        [semanaViernes]: {
          'desayuno-viernes': { configuracionAlternativaId: 'cfg-des-vie-1' },
          'almuerzo-viernes': { configuracionAlternativaId: 'cfg-alm-vie-1' },
        },
      },
      excepcionesUsuario: [],
      ausenciasUsuario: [],
    } as any);

    const opcionesJueves = payload.dias
      .find((d) => d.fecha === '2026-03-12')
      ?.tarjetas ?? [];

    const opcionesViernes = payload.dias
      .find((d) => d.fecha === '2026-03-13')
      ?.tarjetas ?? [];

    // Jueves: muro cerrado → todas las tarjetas bloqueadas por sistema
    expect(opcionesJueves.length).toBeGreaterThan(0);
    expect(opcionesJueves.every((t) => t.estadoInteraccion === 'BLOQUEADO_SISTEMA')).toBe(true);

    // Viernes: muro abierto → todas las tarjetas mutables
    expect(opcionesViernes.length).toBeGreaterThan(0);
    expect(opcionesViernes.every((t) => t.estadoInteraccion === 'MUTABLE')).toBe(true);
  });
});
