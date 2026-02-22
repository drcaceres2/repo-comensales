"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
    collection, 
    onSnapshot, 
    query, 
    orderBy 
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { 
    crearCentroDeCosto, 
    actualizarCentroDeCosto, 
    archivarCentroDeCosto 
} from "../actions";
import { CentroDeCosto } from "shared/schemas/contabilidad";
import { useEffect, useState } from "react";

/**
 * Hook para gestionar los Centros de Costo de una residencia.
 * Implementa lectura en tiempo real (Client-side) y escrituras vía Server Actions con Optimistic UI.
 */
export function useCentrosDeCosto(residenciaId: string) {
    const queryClient = useQueryClient();
    const queryKey = ["centrosDeCosto", residenciaId];

    // --- Query: Lectura desde Firestore (Client-side) ---
    // Usamos useQuery para envolver la lógica de suscripción de Firestore
    const { data: centrosDeCosto = [], isLoading, error } = useQuery<CentroDeCosto[]>({
        queryKey,
        queryFn: () => {
            // Esta función solo se usa como "placeholder" o para fetching inicial si no usáramos onSnapshot.
            // Pero para tiempo real, devolvemos una promesa que se resuelve con el primer snapshot o usamos el stream.
            return new Promise((resolve, reject) => {
                const q = query(
                    collection(db, "residencias", residenciaId, "centrosDeCosto"),
                    orderBy("codigoVisible", "asc")
                );
                
                // NOTA: Para simplificar con TanStack Query, podríamos usar el patrón de "Streaming" 
                // pero aquí implementamos la resolución de la promesa para el estado inicial.
                // Sin embargo, la regla 1 pide "aprovechar la caché local".
                // Implementaremos una suscripción manual vinculada al queryClient para máxima reactividad.
                const unsubscribe = onSnapshot(q, (snapshot) => {
                    const data = snapshot.docs.map(doc => doc.data() as CentroDeCosto);
                    queryClient.setQueryData(queryKey, data);
                    resolve(data);
                }, reject);

                // No podemos retornar el unsubscribe aquí directamente en queryFn
            });
        },
        staleTime: Infinity, // Con Firestore onSnapshot no necesitamos refetching automático
    });

    // Efecto para mantener la suscripción activa mientras el hook esté montado
    useEffect(() => {
        const q = query(
            collection(db, "residencias", residenciaId, "centrosDeCosto"),
            orderBy("codigoVisible", "asc")
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(doc => doc.data() as CentroDeCosto);
            queryClient.setQueryData(queryKey, data);
        }, (err) => {
            console.error("Error en suscripción de Centros de Costo:", err);
        });

        return () => unsubscribe();
    }, [residenciaId, queryClient, queryKey]);

    // --- Mutation: Crear Centro de Costo ---
    const createMutation = useMutation({
        mutationFn: (payload: Omit<CentroDeCosto, "id">) => crearCentroDeCosto(residenciaId, payload),
        onMutate: async (newCC) => {
            await queryClient.cancelQueries({ queryKey });
            const previousCCs = queryClient.getQueryData<CentroDeCosto[]>(queryKey);

            if (previousCCs) {
                // Generamos un ID temporal (slug simplificado) para la UI optimista
                // La acción del servidor generará el final.
                const tempId = `temp-${Date.now()}`;
                queryClient.setQueryData<CentroDeCosto[]>(queryKey, [
                    ...previousCCs,
                    { ...newCC, id: tempId } as CentroDeCosto
                ]);
            }

            return { previousCCs };
        },
        onError: (err, newCC, context) => {
            if (context?.previousCCs) {
                queryClient.setQueryData(queryKey, context.previousCCs);
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey });
        },
    });

    // --- Mutation: Actualizar Centro de Costo ---
    const updateMutation = useMutation({
        mutationFn: ({ id, payload }: { id: string; payload: Partial<CentroDeCosto> }) => 
            actualizarCentroDeCosto(residenciaId, id, payload),
        onMutate: async ({ id, payload }) => {
            await queryClient.cancelQueries({ queryKey });
            const previousCCs = queryClient.getQueryData<CentroDeCosto[]>(queryKey);

            if (previousCCs) {
                queryClient.setQueryData<CentroDeCosto[]>(
                    queryKey,
                    previousCCs.map(cc => cc.id === id ? { ...cc, ...payload } : cc)
                );
            }

            return { previousCCs };
        },
        onError: (err, variables, context) => {
            if (context?.previousCCs) {
                queryClient.setQueryData(queryKey, context.previousCCs);
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey });
        },
    });

    // --- Mutation: Archivar Centro de Costo ---
    const archiveMutation = useMutation({
        mutationFn: (id: string) => archivarCentroDeCosto(residenciaId, id),
        onMutate: async (id) => {
            await queryClient.cancelQueries({ queryKey });
            const previousCCs = queryClient.getQueryData<CentroDeCosto[]>(queryKey);

            if (previousCCs) {
                queryClient.setQueryData<CentroDeCosto[]>(
                    queryKey,
                    previousCCs.map(cc => cc.id === id ? { ...cc, estaActivo: false } : cc)
                );
            }

            return { previousCCs };
        },
        onError: (err, id, context) => {
            if (context?.previousCCs) {
                queryClient.setQueryData(queryKey, context.previousCCs);
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey });
        },
    });

    return {
        centrosDeCosto,
        isLoading,
        error,
        createCentroDeCosto: createMutation.mutateAsync,
        updateCentroDeCosto: updateMutation.mutateAsync,
        archiveCentroDeCosto: archiveMutation.mutateAsync,
        isCreating: createMutation.isPending,
        isUpdating: updateMutation.isPending,
        isArchiving: archiveMutation.isPending,
    };
}
