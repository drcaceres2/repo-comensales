
'use client';

import { useMemo } from 'react';
import { nanoid } from 'nanoid';
import { useAlteracionesQuery, useConfiguracionResidenciaQuery } from './consultas';
import { AlteracionDiaria, AfectacionTiempoComida, 
    ConfigAlternativaAjustada, ConfigAlternativaAjustadaSchema 
} from 'shared/schemas/alteraciones';
import { ConfiguracionAlternativa } from 'shared/schemas/horarios';
import { DiaDeLaSemana, FechaIso, FechaIsoSchema, HoraIso, HoraIsoSchema } from "shared/schemas/fechas";
import { ConfiguracionResidencia } from "shared/schemas/residencia";
import { HorarioSolicitudComidaId, ResidenciaId } from 'shared/models/types'
import { isDeepStrictEqual } from 'node:util';

// ------------------------------------------------------------------
// Type Definitions
// ------------------------------------------------------------------

export type FormularioDiaState = {
    fecha: string;
    residenciaId: ResidenciaId;
    tiemposComida: Record<string, {
        id: string;
        nombreGrupo: string;
        orden: number;
        esAlterado: boolean;
        estadoActual: 'propuesto' | 'comunicado' | 'revocado' | 'bloqueado' | 'cancelado' | null;
        motivoActual: string | null;
        alternativaPorDefectoIdActual: string | null;
        alternativasEditables: Record<string, ConfigAlternativaAjustada>;
        alternativasOriginales: Record<string, ConfigAlternativaAjustada>;
        definicionesAlternativas: Record<string, {
            id: string;
            nombre: string;
        }>;
    }>;
    horariosSolicitud: Record<string, {
        id: HorarioSolicitudComidaId;
        nombre: string;
        dia: DiaDeLaSemana;
        hora: HoraIso;
    }>;
    comedores: Record<string, {
        id: string;
        nombre: string;
    }>;
};

export type TiempoComidaUI = FormularioDiaState['tiemposComida'][string];

const DIAS_SEMANA: DiaDeLaSemana[] = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];

const DIAS_SEMANA_MAP: Record<DiaDeLaSemana, number> = {
    'domingo': 0,
    'lunes': 1,
    'martes': 2,
    'miercoles': 3,
    'jueves': 4,
    'viernes': 5,
    'sabado': 6,
};

// ------------------------------------------------------------------
// Main Hydration Hook
// ------------------------------------------------------------------

export function useHydratedDayFormState(
    fecha: string,
    residenciaId: string
) {
    const { data: config, isLoading: isLoadingConfig, error: errorConfig } = useConfiguracionResidenciaQuery(residenciaId);
    const { data: alteraciones, isLoading: isLoadingAlteraciones, error: errorAlteraciones } = useAlteracionesQuery(residenciaId);


    const formState = useMemo((): FormularioDiaState | null => {
        if (!config || !alteraciones) {
            return null;
        }

        const alteracion = alteraciones.find(a => a.fecha === fecha);
        const diaSemana = DIAS_SEMANA[new Date(fecha).getUTCDay()];

        const tiemposComidaDelDia = Object.entries(config.esquemaSemanal || {})
            .filter(([, tiempo]) => tiempo.dia === diaSemana && tiempo.estaActivo === true);

        // Diccionario de comedores aplanado
        const comedores: FormularioDiaState['comedores'] = {};
        if (config.comedores) {
            for (const [id, comedor] of Object.entries(config.comedores)) {
                // Solo incluir si tiene estaActivo === true
                if ((comedor as any).estaActivo === true) {
                    comedores[id] = {
                        id,
                        nombre: comedor.nombre,
                    };
                }
            }
        }

        // Diccionario de horarios de solicitud aplanado
        const horariosSolicitud: FormularioDiaState['horariosSolicitud'] = {};
        if (config.horariosSolicitud) {
            for (const [id, horario] of Object.entries(config.horariosSolicitud)) {
                if ((horario as any).estaActivo === true) {
                    horariosSolicitud[id] = {
                        id,
                        nombre: horario.nombre,
                        dia: horario.dia,
                        hora: horario.horaSolicitud,
                    };
                }
            }
        }

        const state: FormularioDiaState = {
            fecha,
            residenciaId,
            tiemposComida: {},
            comedores,
            horariosSolicitud,
        };


        for (const [id, tiempoComida] of tiemposComidaDelDia) {
            const afectacion = alteracion?.tiemposComidaAfectados?.[id];
            const esAlterado = !!afectacion;

            let alternativasEditables: Record<string, ConfigAlternativaAjustada> = {};
            let alternativasOriginales: Record<string, ConfigAlternativaAjustada> = {};

            // Alternativas originales: siempre usar helper para poblar
            if (config.configuracionesAlternativas) {
                const alternativasFiltradas = Object.fromEntries(
                    Object.entries(getAlternativasAjustadasFromIds(
                        tiempoComida.alternativas,
                        config.configuracionesAlternativas
                    )).filter(([altId, alt]) => {
                        const def = config.configuracionesAlternativas?.[altId];
                        return def && def.estaActivo === true;
                    })
                );
                alternativasOriginales = alternativasFiltradas;
            }

            let alternativaPorDefectoIdActual: string | null = null;
            if (esAlterado) {
                // Filtrar alternativas editables por estaActivo
                alternativasEditables = Object.fromEntries(
                    Object.entries(afectacion.alternativasDisponibles).filter(([altId, alt]) => {
                        const def = config.configuracionesAlternativas?.[altId];
                        return def && def.estaActivo === true;
                    })
                );
                alternativaPorDefectoIdActual = afectacion.alternativaPorDefectoId || null;
            } else {
                if (config.configuracionesAlternativas) {
                    const configAlternativaIds = [
                        tiempoComida.alternativas.principal,
                        ...(tiempoComida.alternativas.secundarias || [])
                    ];
                    for (const configId of configAlternativaIds) {
                        const configAlternativa = config.configuracionesAlternativas[configId];
                        if (configAlternativa && configAlternativa.estaActivo === true) {
                            const parsed = ConfigAlternativaAjustadaSchema.safeParse(configAlternativa);
                            if (parsed.success) {
                                alternativasEditables[configId] = parsed.data;
                            }
                        }
                    }
                    // Siempre asignar el id principal como alternativaPorDefectoIdActual
                    alternativaPorDefectoIdActual = tiempoComida.alternativas.principal;
                }
            }

            const definicionesAlternativas: FormularioDiaState['tiemposComida'][string]['definicionesAlternativas'] = {};
            if (config.catalogoAlternativas) {
                for (const [defId, definicion] of Object.entries(config.catalogoAlternativas)) {
                    // Comparar como string, asegurando que ambos existan y sean iguales
                    if (
                        definicion.estaActiva === true && tiempoComida.grupoComida && definicion.grupoComida &&
                        String(tiempoComida.grupoComida) === String(definicion.grupoComida)
                    ) {
                        definicionesAlternativas[defId] = {
                            id: defId,
                            nombre: definicion.nombre,
                        };
                    }
                }
            }

            state.tiemposComida[id] = {
                id,
                nombreGrupo: config.gruposComidas?.[tiempoComida.grupoComida]?.nombre || 'Sin nombre',
                orden: config.gruposComidas?.[tiempoComida.grupoComida]?.orden ?? 99,
                esAlterado,
                estadoActual: afectacion?.estado || null,
                motivoActual: afectacion?.motivo || null,
                alternativaPorDefectoIdActual,
                alternativasEditables,
                alternativasOriginales,
                definicionesAlternativas,
            };
        }

        return state;

    }, [config, alteraciones, fecha, residenciaId]);

    return {
        formState,
        isLoading: isLoadingConfig || isLoadingAlteraciones,
        error: errorConfig || errorAlteraciones,
    };
}

export function extractDeltaPayload(
    residenciaId: string,
    fecha: string,
    estadoOriginal: Record<string, TiempoComidaUI>,
    estadoSucio: Record<string, TiempoComidaUI>
): AlteracionDiaria | null {

    const tiemposAfectados: Record<string, AfectacionTiempoComida> = {};
    let huboCambios = false;

    Object.keys(estadoOriginal).forEach((tiempoId) => {
        const original = estadoOriginal[tiempoId];
        const sucio = estadoSucio[tiempoId];

        // 1. Caso: El usuario eliminó una alteración que ya existía en BD
        if (original.esAlterado && !sucio.esAlterado) {
            tiemposAfectados[tiempoId] = {
                // Regla de negocio: Si ya estaba comunicado, se revoca. Si era propuesto, se cancela.
                estado: original.estadoActual === 'comunicado' ? 'revocado' : 'cancelado',
                motivo: 'Cancelación de alteración previa',
                alternativaPorDefectoId: original.alternativaPorDefectoIdActual!,
                alternativasDisponibles: original.alternativasEditables, // Mandamos las que tenía para el log histórico
            };
            huboCambios = true;
            return;
        }

        // 2. Caso: Es una alteración nueva o modificada
        if (sucio.esAlterado) {
            const esMismaConfiguracion = isDeepStrictEqual(original.alternativasEditables, sucio.alternativasEditables) &&
                original.motivoActual === sucio.motivoActual &&
                original.alternativaPorDefectoIdActual === sucio.alternativaPorDefectoIdActual;

            // Si no hay cambios y ya era una alteración, no hacemos nada.
            if (esMismaConfiguracion && original.esAlterado) {
                return;
            }

            // Si hay cambios o es una nueva alteración, procesamos.
            const alternativasDisponibles: Record<string, ConfigAlternativaAjustada> = {};
            const idMap: Record<string, string> = {};
            let alternativaPorDefectoId = sucio.alternativaPorDefectoIdActual;

            // Generar IDs para nuevas alternativas (identificadas por un prefijo 'new-')
            for (const [altId, alternativa] of Object.entries(sucio.alternativasEditables)) {
                if (altId.startsWith('new-')) {
                    const newId = nanoid(10);
                    idMap[altId] = newId;
                    alternativasDisponibles[newId] = alternativa;
                } else {
                    alternativasDisponibles[altId] = alternativa;
                }
            }

            // Si el ID por defecto apuntaba a una nueva alternativa, actualizarlo.
            if (alternativaPorDefectoId && idMap[alternativaPorDefectoId]) {
                alternativaPorDefectoId = idMap[alternativaPorDefectoId];
            }

            // Validar que el ID por defecto exista en las alternativas finales.
            // Si no es válido, por seguridad, se asigna el primero de la lista.
            if ((!alternativaPorDefectoId || !alternativasDisponibles[alternativaPorDefectoId]) && Object.keys(alternativasDisponibles).length > 0) {
                console.warn(`[extractDeltaPayload] El ID por defecto '${alternativaPorDefectoId}' no es válido para '${tiempoId}'. Se asignará la primera alternativa disponible.`);
                alternativaPorDefectoId = Object.keys(alternativasDisponibles)[0];
            }

            // Solo crear la afectación si tenemos una alternativa por defecto válida.
            if (alternativaPorDefectoId) {
                tiemposAfectados[tiempoId] = {
                    estado: sucio.estadoActual || 'propuesto',
                    motivo: sucio.motivoActual || '',
                    alternativaPorDefectoId: alternativaPorDefectoId,
                    alternativasDisponibles,
                };
                huboCambios = true;
            }
        }
    });

    if (!huboCambios) return null;

    return {
        fecha,
        residenciaId,
        tiemposComidaAfectados: tiemposAfectados
    };
}



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
    config: Partial<ConfiguracionResidencia>
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
            const configAlternativa = config.configuracionesAlternativas?.[configId];
            const horarioSolicitudId = configAlternativa?.horarioSolicitudComidaId;

            if (!horarioSolicitudId) {
                return false;
            }
            
            const horarioSolicitud = config.horariosSolicitud?.[horarioSolicitudId];

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

/**
 * Obtiene un diccionario de alternativas ajustadas a partir de los IDs de alternativas de un tiempo de comida.
 * @param alternativasIds Objeto con los IDs de alternativas (principal y secundarias)
 * @param configuracionesAlternativas Diccionario global de configuraciones alternativas
 * @returns Record<string, ConfigAlternativaAjustada>
 */
export function getAlternativasAjustadasFromIds(
    alternativasIds: { principal: string; secundarias?: string[] },
    configuracionesAlternativas: Record<string, ConfiguracionAlternativa>
): Record<string, ConfigAlternativaAjustada> {
    const result: Record<string, ConfigAlternativaAjustada> = {};
    const allIds = [alternativasIds.principal, ...(alternativasIds.secundarias || [])];
    for (const id of allIds) {
        const config = configuracionesAlternativas[id];
        if (config) {
            // Omitir los campos 'nombre', 'tiempoComidaId', 'estaActivo'
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { nombre, tiempoComidaId, estaActivo, ...rest } = config;
            result[id] = rest as ConfigAlternativaAjustada;
        }
    }
    return result;
}