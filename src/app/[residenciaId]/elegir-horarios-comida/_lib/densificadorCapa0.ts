import { ConfiguracionResidencia } from 'shared/schemas/residencia';
import { HorarioEfectivoDiario, SlotEfectivo } from 'shared/schemas/elecciones/domain.schema';
import { AlteracionDiaria } from 'shared/schemas/alteraciones';
import { calcularHorarioReferenciaSolicitud } from './calcularHorarioReferenciaSolicitud';

export type AlteracionDiariaInput = AlteracionDiaria & {
  id?: string;
};

const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'] as const;

function obtenerDiaSemana(fechaIso: string): string {
  const fecha = new Date(`${fechaIso}T00:00:00Z`);
  if (Number.isNaN(fecha.getTime())) {
    throw new Error(`[densificarCapa0] Fecha inválida en fechasRango: ${fechaIso}`);
  }
  return DIAS_SEMANA[fecha.getUTCDay()];
}

function construirSlotBase(
  tiempoComidaId: string,
  singleton: ConfiguracionResidencia,
  fecha: string
): SlotEfectivo {
  const tiempo = singleton.esquemaSemanal[tiempoComidaId];
  if (!tiempo) {
    throw new Error(`[densificarCapa0] No existe tiempoComida '${tiempoComidaId}' en esquemaSemanal.`);
  }

  const alternativasIds = [
    tiempo.alternativas.principal,
    ...(tiempo.alternativas.secundarias ?? []),
  ];

  const opcionesActivas = alternativasIds.map((configuracionAlternativaId) => {
    const config = singleton.configuracionesAlternativas[configuracionAlternativaId];

    // Calcular el instante exacto de cierre del muro móvil para esta alternativa y fecha:
    // se navega desde `fecha` hacia atrás hasta el último día+hora en que debió pedirse.
    const horarioReferenciaSolicitud = config?.horarioSolicitudComidaId
      ? calcularHorarioReferenciaSolicitud(
          fecha,
          config.horarioSolicitudComidaId,
          singleton.horariosSolicitud
        )
      : `${fecha}T00:00:00`; // Fallback: sin horario definido, usar medianoche del día.

    const ventanaServicio = config?.ventanaServicio ?? {
      horaInicio: 'T00:00',
      horaFin: 'T00:00',
      tipoVentana: 'normal',
    };

    return {
      nombre: config?.nombre ?? configuracionAlternativaId,
      configuracionAlternativaId,
      ventanaServicio,
      comedorId: config?.comedorId ?? 'sin-comedor',
      horarioReferenciaSolicitud,
    };
  });

  return {
    esAlterado: false,
    alteracionId: undefined,
    motivo: undefined,
    opcionesActivas,
    contingenciaAlternativaId: tiempo.alternativas.principal,
  };
}

function construirSlotAlterado(
  alteracion: AlteracionDiariaInput,
  tiempoComidaId: string,
  singleton: ConfiguracionResidencia
): SlotEfectivo | undefined {
  const afectacion = alteracion.tiemposComidaAfectados[tiempoComidaId];
  if (!afectacion || afectacion.estado === 'revocado' || afectacion.estado === 'cancelado') {
    return undefined;
  }

  const opcionesActivas = Object.entries(afectacion.alternativasDisponibles).map(
    ([configuracionAlternativaId, configuracion]) => ({
      nombre:
        singleton.catalogoAlternativas[configuracion.definicionAlternativaId]?.nombre
        ?? configuracionAlternativaId,
      configuracionAlternativaId,
      ventanaServicio: configuracion.ventanaServicio ?? {
        horaInicio: 'T00:00',
        horaFin: 'T00:00',
        tipoVentana: 'normal' as const,
      },
      comedorId: configuracion.comedorId ?? 'sin-comedor',
      horarioReferenciaSolicitud: calcularHorarioReferenciaSolicitud(
        alteracion.fecha,
        configuracion.horarioSolicitudComidaId,
        singleton.horariosSolicitud
      ),
    })
  );

  return {
    esAlterado: true,
    alteracionId: alteracion.id ?? alteracion.fecha,
    motivo: afectacion.motivo,
    opcionesActivas,
    contingenciaAlternativaId: afectacion.alternativaPorDefectoId,
  };
}

function materializarVistaDispersaDesdeAlteraciones(
  alteraciones: AlteracionDiariaInput[],
  singleton: ConfiguracionResidencia
): Record<string, HorarioEfectivoDiario> {
  const vistaDispersa: Record<string, HorarioEfectivoDiario> = {};

  for (const alteracion of alteraciones) {
    const tiemposComida: HorarioEfectivoDiario['tiemposComida'] = {};

    for (const tiempoComidaId of Object.keys(alteracion.tiemposComidaAfectados)) {
      const slotAlterado = construirSlotAlterado(alteracion, tiempoComidaId, singleton);
      if (slotAlterado) {
        tiemposComida[tiempoComidaId] = slotAlterado;
      }
    }

    if (Object.keys(tiemposComida).length === 0) {
      continue;
    }

    vistaDispersa[alteracion.fecha] = {
      id: alteracion.fecha,
      residenciaId: alteracion.residenciaId,
      tiemposComida,
    };
  }

  return vistaDispersa;
}

/**
 * Convierte una vista sparse de Capa 0 en una matriz densa y continua de N días.
 * También puede materializar directamente un arreglo de AlteracionDiaria antes de densificar.
 * Si un día o tiempo de comida no está alterado en la vista sparse resultante,
 * lo hidrata construyendo el SlotEfectivo a partir de la configuración estática (Singleton).
 * @param fechasRango - Arreglo exacto de las fechas a renderizar (Ej. las 8 fechas: Ayer a +7).
 * @param singleton - La configuración estática de horarios y alternativas.
 * @param vistaDispersaOAlteraciones - Vista sparse ya materializada o comandos AlteracionDiaria crudos.
 * @returns Record<string, HorarioEfectivoDiario> - Un diccionario garantizado de tener TODAS las fechas del rango,
 * con TODOS sus tiempos de comida estructurados bajo el mismo contrato de Capa 0.
 */
export function densificarCapa0(
  fechasRango: string[],
  singleton: ConfiguracionResidencia,
  vistaDispersaOAlteraciones: Record<string, HorarioEfectivoDiario> | AlteracionDiariaInput[]
): Record<string, HorarioEfectivoDiario> {
  const resultado: Record<string, HorarioEfectivoDiario> = {};
  const vistaDispersa = Array.isArray(vistaDispersaOAlteraciones)
    ? materializarVistaDispersaDesdeAlteraciones(vistaDispersaOAlteraciones, singleton)
    : vistaDispersaOAlteraciones;

  for (const fecha of fechasRango) {
    const diaSemana = obtenerDiaSemana(fecha);
    const tiemposDelDia = Object.entries(singleton.esquemaSemanal)
      .filter(([, tiempo]) => tiempo.estaActivo && tiempo.dia === diaSemana)
      .map(([tiempoComidaId]) => tiempoComidaId);

    const diaDisperso = vistaDispersa[fecha];
    const tiemposComidaDensos: HorarioEfectivoDiario['tiemposComida'] = {};

    for (const tiempoComidaId of tiemposDelDia) {
      const slotDisperso = diaDisperso?.tiemposComida?.[tiempoComidaId];
      tiemposComidaDensos[tiempoComidaId] = slotDisperso ?? construirSlotBase(tiempoComidaId, singleton, fecha);
    }

    resultado[fecha] = {
      id: fecha,
      residenciaId: singleton.residenciaId,
      tiemposComida: tiemposComidaDensos,
    };
  }

  return resultado;
}