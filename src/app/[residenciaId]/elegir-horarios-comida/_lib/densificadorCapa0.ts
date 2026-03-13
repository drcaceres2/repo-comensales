import { ConfiguracionResidencia } from 'shared/schemas/residencia';
import { HorarioEfectivoDiario, SlotEfectivo } from 'shared/schemas/elecciones/domain.schema';

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
  singleton: ConfiguracionResidencia
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
    const horaReferenciaSolicitud = singleton.fechaHoraReferenciaUltimaSolicitud;
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
      horarioReferenciaSolicitud: horaReferenciaSolicitud,
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

/**
 * Convierte una vista materializada dispersa en una matriz densa y continua de N días.
 * Si un día o tiempo de comida no está alterado en la vista dispersa, 
 * lo hidrata construyendo el SlotEfectivo a partir de la configuración estática (Singleton).
 * @param fechasRango - Arreglo exacto de las fechas a renderizar (Ej. las 8 fechas: Ayer a +7).
 * @param singleton - La configuración estática de horarios y alternativas.
 * @param vistaDispersa - Diccionario de HorariosEfectivos recuperados de Firestore (solo existirán los días con alteraciones de Capa 0).
 * @returns Record<string, HorarioEfectivoDiario> - Un diccionario garantizado de tener TODAS las fechas del rango, 
 * con TODOS sus tiempos de comida estructurados bajo el mismo contrato de Capa 0.
 */
export function densificarCapa0(
  fechasRango: string[],
  singleton: ConfiguracionResidencia,
  vistaDispersa: Record<string, HorarioEfectivoDiario>
): Record<string, HorarioEfectivoDiario> {
  const resultado: Record<string, HorarioEfectivoDiario> = {};

  for (const fecha of fechasRango) {
    const diaSemana = obtenerDiaSemana(fecha);
    const tiemposDelDia = Object.entries(singleton.esquemaSemanal)
      .filter(([, tiempo]) => tiempo.estaActivo && tiempo.dia === diaSemana)
      .map(([tiempoComidaId]) => tiempoComidaId);

    const diaDisperso = vistaDispersa[fecha];
    const tiemposComidaDensos: HorarioEfectivoDiario['tiemposComida'] = {};

    for (const tiempoComidaId of tiemposDelDia) {
      const slotDisperso = diaDisperso?.tiemposComida?.[tiempoComidaId];
      tiemposComidaDensos[tiempoComidaId] = slotDisperso ?? construirSlotBase(tiempoComidaId, singleton);
    }

    resultado[fecha] = {
      id: fecha,
      residenciaId: singleton.residenciaId,
      tiemposComida: tiemposComidaDensos,
    };
  }

  return resultado;
}