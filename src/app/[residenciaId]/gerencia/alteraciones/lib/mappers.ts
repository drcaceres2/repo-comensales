'use client';

import { useMemo } from 'react';
import { nanoid } from 'nanoid';
import { useAlteracionesQuery, useConfiguracionResidenciaQuery } from './consultas';
import { AlteracionDiaria, AfectacionTiempoComida, ConfigAlternativaAjustada, ConfigAlternativaAjustadaSchema } from 'shared/schemas/alteraciones';
import { DiaDeLaSemana } from 'shared/schemas/fechas';

const { isDeepStrictEqual } = require('node:util');

// ------------------------------------------------------------------
// Type Definitions
// ------------------------------------------------------------------

export type FormularioDiaState = {
    fecha: string;
    residenciaId: string;
    tiemposComida: Record<string, {
        id: string;
        nombreGrupo: string;
        esAlterado: boolean;
        estadoActual: 'propuesto' | 'comunicado' | 'revocado' | 'bloqueado' | 'cancelado' | null;
        motivoActual: string | null;
        alternativaPorDefectoIdActual: string | null;
        alternativasEditables: Record<string, ConfigAlternativaAjustada>;
    }>
};

export type TiempoComidaUI = FormularioDiaState['tiemposComida'][string];

const DIAS_SEMANA: DiaDeLaSemana[] = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];

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
            .filter(([, tiempo]) => tiempo.dia === diaSemana);

        const state: FormularioDiaState = {
            fecha,
            residenciaId,
            tiemposComida: {},
        };

        for (const [id, tiempoComida] of tiemposComidaDelDia) {
            const afectacion = alteracion?.tiemposComidaAfectados?.[id];
            const esAlterado = !!afectacion;

            let alternativasEditables: Record<string, ConfigAlternativaAjustada> = {};

            if (esAlterado) {
                alternativasEditables = afectacion.alternativasDisponibles;
            } else if (config.configuracionAlternativas) {
                const configAlternativaIds = [
                    tiempoComida.alternativas.principal,
                    ...(tiempoComida.alternativas.secundarias || [])
                ];

                for (const configId of configAlternativaIds) {
                    const configAlternativa = config.configuracionAlternativas[configId];
                    if (configAlternativa) {
                        const parsed = ConfigAlternativaAjustadaSchema.safeParse(configAlternativa);
                        if (parsed.success) {
                            alternativasEditables[configId] = parsed.data;
                        }
                    }
                }
            }

            state.tiemposComida[id] = {
                id,
                nombreGrupo: config.gruposComidas?.[tiempoComida.grupoComida]?.nombre || 'Sin nombre',
                esAlterado,
                estadoActual: afectacion?.estado || null,
                motivoActual: afectacion?.motivo || null,
                alternativaPorDefectoIdActual: afectacion?.alternativaPorDefectoId || null,
                alternativasEditables,
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