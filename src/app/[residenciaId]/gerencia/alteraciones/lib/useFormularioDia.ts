'use client';

import { useMemo } from 'react';
import { validateConsolidationLocks, useHydratedDayFormState, FormularioDiaState } from './mappers';
import { useConfiguracionResidenciaQuery } from './consultas';
import { ResidenciaId } from "shared/models/types";

/**
 * The final, consolidated data structure for a single meal time,
 * including its lock status.
 */
export type TiempoComidaConsolidado = FormularioDiaState['tiemposComida'][string] & {
    esInmutable: boolean;
};

/**
 * The complete, memoized data object that the UI will consume.
 */
export type DataFormularioDia = Omit<FormularioDiaState, 'tiemposComida'> & {
    tiemposComida: Record<string, TiempoComidaConsolidado>;
};

/**
 * Consolidates all data and business logic for the daily alteration form.
 * It fetches data from the cache, applies business rules for locking,
 * and provides a single, stable object for the UI to render.
 *
 * @param fecha The target date for the form (e.g., "2024-03-17").
 * @param residenciaId The ID of the residence.
 * @returns An object containing the consolidated form data, loading state, and error state.
 */
export function useFormularioDia(fecha: string, residenciaId: ResidenciaId) {
    // 1. Extracción: Get hydrated state and the raw config for lock validation.
    const { formState, isLoading: isLoadingHydration, error: errorHydration } = useHydratedDayFormState(fecha, residenciaId);
    const { data: config, isLoading: isLoadingConfig, error: errorConfig } = useConfiguracionResidenciaQuery(residenciaId);

    const dataFormulario = useMemo((): DataFormularioDia | null => {
        // Ensure all data sources are ready before proceeding.
        if (!formState || !config || !config.residenciaId) {
            return null;
        }

        // 2. Evaluación de Muro Móvil: Calculate lock status for the day's meal times.
        const bloqueos = validateConsolidationLocks(fecha, config);

        // 3. & 4. Fusión Definitiva: Merge the hydrated state with the lock status.
        const consolidatedState: DataFormularioDia = {
            ...formState,
            tiemposComida: {}, // Initialize as an empty record
        };

        for (const tiempoComidaId in formState.tiemposComida) {
            const originalTiempoComida = formState.tiemposComida[tiempoComidaId];
            const isLocked = bloqueos[tiempoComidaId]?.esInmutable || false;

            consolidatedState.tiemposComida[tiempoComidaId] = {
                ...originalTiempoComida,
                // Inject the final immutability flag. If locked, it's always immutable.
                esInmutable: isLocked,
            };
        }

        return consolidatedState;

    }, [formState, config, fecha]); // Strict dependencies for memoization

    return {
        dataFormulario,
        isLoading: isLoadingHydration || isLoadingConfig,
        error: errorHydration || errorConfig,
    };
}
