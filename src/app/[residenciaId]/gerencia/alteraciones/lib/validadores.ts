'use client';

import { ConfiguracionResidencia } from "shared/schemas/residencia";
import { DiaDeLaSemana, FechaIso, FechaIsoSchema, HoraIso, HoraIsoSchema } from "shared/schemas/fechas";

const DIAS_SEMANA_MAP: Record<DiaDeLaSemana, number> = {
    'domingo': 0,
    'lunes': 1,
    'martes': 2,
    'miercoles': 3,
    'jueves': 4,
    'viernes': 5,
    'sabado': 6,
};

/**
 * Calculates the absolute closing timestamp for a given request schedule relative to a target date.
 * @param fechaRequerida The target date (e.g., "2024-03-17").
 * @param diaCierre The day of the week the request closes (e.g., "jueves").
 * @param horaCierre The time the request closes (e.g., "10:00").
 * @returns The absolute closing timestamp in epoch milliseconds.
 */
function getTimestampCierreAbsoluto(fechaRequerida: FechaIso, diaCierre: DiaDeLaSemana, horaCierre: HoraIso): number {
    const fechaRequeridaDate = new Date(`${fechaRequerida}T00:00:00Z`); // Use UTC to avoid timezone issues
    const diaRequeridoNum = fechaRequeridaDate.getUTCDay();
    const diaCierreNum = DIAS_SEMANA_MAP[diaCierre];

    // Calculate how many days to go back to find the last closing day
    const diasARestar = (diaRequeridoNum - diaCierreNum + 7) % 7;
    
    const fechaCierre = new Date(fechaRequeridaDate);
    fechaCierre.setUTCDate(fechaCierre.getUTCDate() - diasARestar);

    const [horas, minutos] = horaCierre.split(':').map(Number);
    fechaCierre.setUTCHours(horas, minutos, 0, 0);

    return fechaCierre.getTime();
}

/**
 * Determines which meal times for a given day are locked by the "moving wall" of consolidated requests.
 * @param fechaRequerida The target date (e.g., "2024-03-17").
 * @param config The residence configuration singleton.
 * @returns A dictionary mapping each TiempoComidaId to its lock status.
 */
export function validateConsolidationLocks(
    fechaRequerida: FechaIso,
    config: ConfiguracionResidencia
): Record<string, { esInmutable: boolean }> {
    const estadoBloqueos: Record<string, { esInmutable: boolean }> = {};
    const validarFecha = FechaIsoSchema.safeParse(fechaRequerida);
    if (
        !config.fechaHoraReferenciaUltimaSolicitud
        || !config.esquemaSemanal
        || !validarFecha.success
    ) {
        return {};
    }

    const muroMovilEpoch = new Date(config.fechaHoraReferenciaUltimaSolicitud).getTime();
    const diaRequeridoNum = new Date(`${fechaRequerida}T00:00:00Z`).getUTCDay();
    const diaRequeridoStr = Object.keys(DIAS_SEMANA_MAP).find(key => DIAS_SEMANA_MAP[key as DiaDeLaSemana] === diaRequeridoNum) as DiaDeLaSemana;

    const tiemposComidaDelDia = Object.entries(config.esquemaSemanal)
        .filter(([, tiempo]) => tiempo.dia === diaRequeridoStr);

    for (const [tiempoComidaId, tiempoComida] of tiemposComidaDelDia) {
        const configAlternativaIds = [
            tiempoComida.alternativas.principal,
            ...(tiempoComida.alternativas.secundarias || [])
        ];

        const estaBloqueado = configAlternativaIds.some(configId => {
            const configAlternativa = config.configuracionAlternativas?.[configId];
            const horarioSolicitud = config.horariosSolicitud?.[configAlternativa?.horarioSolicitudComidaId];

            if (!horarioSolicitud) {
                return false;
            }

            const timestampCierre = getTimestampCierreAbsoluto(fechaRequerida, horarioSolicitud.dia, horarioSolicitud.horaSolicitud);
            
            return timestampCierre <= muroMovilEpoch;
        });

        estadoBloqueos[tiempoComidaId] = { esInmutable: estaBloqueado };
    }

    return estadoBloqueos;
}
