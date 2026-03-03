'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    crearRecordatorio,
    actualizarRecordatorio,
    desactivarRecordatorio,
    obtenerRecordatorios,
} from './actions';
import {
    CrearRecordatorioPayload,
    Recordatorio,
} from 'shared/schemas/recordatorios';

// --- Clave de Consulta ---
// Definir una clave de consulta base ayuda a mantener la consistencia.
const recordatoriosQueryKey = (residenciaId: string) => ['recordatorios', residenciaId];


// (la lógica de lectura se maneja directamente dentro del hook `useObtenerRecordatorios`)    


/**
 * Hook para obtener la lista de recordatorios de una residencia.
 *
 * @param residenciaId El ID de la residencia.
 */
export function useObtenerRecordatorios(residenciaId: string) {
    return useQuery<Recordatorio[]>({
        queryKey: recordatoriosQueryKey(residenciaId),
        queryFn: async () => {
            if (!residenciaId) return [];
            return obtenerRecordatorios(residenciaId);
        },
        enabled: !!residenciaId,
        staleTime: 0,
    });
}

/**
 * Hook que proporciona todas las mutaciones necesarias para el CRUD de Recordatorios.
 * Centraliza la lógica de invalidación de caché.
 *
 * @param residenciaId El ID de la residencia, necesario para la invalidación de queries.
 */
export function useMutacionesRecordatorio(residenciaId: string) {
    const queryClient = useQueryClient();

    // El callback onSuccess recibe la data devuelta por la mutationFn
    const onMutateSuccess = (result: { success: boolean } | void) => {
        // CRÍTICO: Solo invalidar si la operación lógica fue exitosa.
        if (result && result.success) {
            console.log('CONSULTAS: Operación exitosa. Invalidando caché de recordatorios...');
            queryClient.invalidateQueries({
                queryKey: recordatoriosQueryKey(residenciaId),
                refetchType: 'all', // Refetch all queries, not just active ones
            });
        } else {
            console.log('CONSULTAS: Operación fallida en el servidor. No se invalida la caché.');
        }
    };

    const crearMutation = useMutation({
        mutationFn: (payload: CrearRecordatorioPayload) =>
            crearRecordatorio(residenciaId, payload),
        onSuccess: onMutateSuccess,
        // Opcional: onError para manejar errores de la server action
    });

    const actualizarMutation = useMutation({
        mutationFn: (payload: Recordatorio) =>
            actualizarRecordatorio(residenciaId, payload),
        onSuccess: onMutateSuccess,
    });

    const desactivarMutation = useMutation({
        mutationFn: (recordatorioId: string) =>
            desactivarRecordatorio(residenciaId, recordatorioId),
        onSuccess: onMutateSuccess,
    });

    return {
        crearMutation,
        actualizarMutation,
        desactivarMutation,
    };
}
