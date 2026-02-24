"use client";

import React, { useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
    collection, 
    onSnapshot, 
    query, 
    orderBy,
    getDocs 
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { v4 as uuidv4 } from 'uuid';
import { 
    crearCentroDeCosto, 
    actualizarCentroDeCosto, 
    archivarCentroDeCosto 
} from "../actions";
import { useAuth } from "@/hooks/useAuth";
import { CentroDeCosto } from "shared/schemas/contabilidad";

/**
 * Hook para gestionar los Centros de Costo de una residencia.
 * Implementa lectura en tiempo real (Client-side) y escrituras vía Server Actions con Optimistic UI.
 */
export function useCentrosDeCosto(residenciaId: string) {
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const queryKey = useMemo(() => ["centrosDeCosto", residenciaId], [residenciaId]);

    // --- Query: Lectura desde Firestore (Client-side) ---
    // Usamos useQuery para envolver la lógica de suscripción de Firestore
    const { data: centrosDeCosto = [], isLoading, error } = useQuery<CentroDeCosto[]>({
        queryKey,
        queryFn: async () => {
            if (!user || !residenciaId) return [];
            
            // Fetch inicial único para satisfacer el estado de carga de TanStack Query
            const q = query(
                collection(db, "residencias", residenciaId, "centrosDeCosto"),
                orderBy("codigoVisible", "asc")
            );
            const snapshot = await getDocs(q);
            return snapshot.docs.map(doc => doc.data() as CentroDeCosto);
        },
        staleTime: Infinity, // Dependemos de onSnapshot para mantenerlo actualizado
    });

    // Efecto para mantener la suscripción activa mientras el hook esté montado
    useEffect(() => {
        if (!residenciaId || !user) return;

        const q = query(
            collection(db, "residencias", residenciaId, "centrosDeCosto"),
            orderBy("codigoVisible", "asc")
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(doc => doc.data() as CentroDeCosto);
            
            // CRÍTICO: No sobreescribir si hay una mutación en curso para evitar el "flicker"
            const isAnyMutationPending = 
                queryClient.isMutating({ mutationKey: ["centrosDeCosto", residenciaId] }) > 0;
            
            if (!isAnyMutationPending) {
                queryClient.setQueryData(queryKey, data);
            }
        }, (err) => {
            // No logueamos errores de permisos durante el logout
            if (err.code !== 'permission-denied') {
                console.error("Error en suscripción de Centros de Costo:", err);
            }
        });

        return () => unsubscribe();
    }, [residenciaId, user, queryClient, queryKey]);

    // --- Mutation: Crear Centro de Costo ---
    const createMutation = useMutation({
        mutationKey: ["centrosDeCosto", residenciaId],
        mutationFn: async (payload: Omit<CentroDeCosto, "id">) => {
            console.log(">>> [MutationFn] Llamando a crearCentroDeCosto con:", payload);
            const result = await crearCentroDeCosto(residenciaId, payload);
            console.log(">>> [MutationFn] Resultado del servidor:", result);
            if (!result.success) throw new Error(result.error || "Error al crear el centro de costo");
            return result.data;
        },
        onMutate: async (newCC) => {
            await queryClient.cancelQueries({ queryKey });
            const previousCCs = queryClient.getQueryData<CentroDeCosto[]>(queryKey);

            if (previousCCs) {
                // Usamos UUID para un ID temporal robusto en la UI optimista.
                queryClient.setQueryData<CentroDeCosto[]>(queryKey, [
                    ...previousCCs,
                    { ...newCC, id: uuidv4() } as CentroDeCosto
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
            // Con onSnapshot activo, no necesitamos invalidar manualmente, 
            // la suscripción se encargará de sincronizar cuando el servidor escriba.
        },
    });

    // --- Mutation: Actualizar Centro de Costo ---
    const updateMutation = useMutation({
        mutationFn: async ({ id, payload }: { id: string; payload: Partial<CentroDeCosto> }) => {
            const result = await actualizarCentroDeCosto(residenciaId, id, payload);
            if (!result.success) throw new Error(result.error || "Error al actualizar el centro de costo");
            return result.data;
        },
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
            // Sincronización automática vía onSnapshot
        },
    });

    // --- Mutation: Archivar Centro de Costo ---
    const archiveMutation = useMutation({
        mutationFn: async (id: string) => {
            const result = await archivarCentroDeCosto(residenciaId, id);
            if (!result.success) throw new Error(result.error || "Error al archivar el centro de costo");
            return result.data;
        },
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
            // Sincronización automática vía onSnapshot
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
