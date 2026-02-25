"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/useToast";
import { NovedadOperativa, NovedadEstado } from "shared/schemas/novedades";
import {
    crearNovedadAction,
    actualizarNovedadAction,
    eliminarNovedadAction
} from "../actions";
import { v4 as uuidv4 } from 'uuid';
import { db } from '@/lib/firebase'; // Client-side firebase
import { collection, query, where, orderBy, limit, getDocs, Timestamp, DocumentSnapshot } from 'firebase/firestore';
import { useAuth } from "@/hooks/useAuth";

// Definimos el tipo para el payload de creación, omitiendo los campos que genera el servidor.
type NovedadCreatePayload = Omit<NovedadOperativa, "id" | "timestampCreacion" | "timestampActualizacion" | "autorId" | "residenciaId" | "estado" | "fechaProgramada">;

// Helper to serialize data with Timestamps, just like on the server
function serializeNovedad(doc: DocumentSnapshot): NovedadOperativa {
    const data = doc.data()!;
    const serializedData: { [key: string]: any } = { id: doc.id };

    for (const key in data) {
        if (data[key] instanceof Timestamp) {
            serializedData[key] = data[key].toDate().toISOString();
        } else {
            serializedData[key] = data[key];
        }
    }
    return serializedData as NovedadOperativa;
}

// The query function now gets its parameters from the queryKey, which is the most robust pattern.
async function fetchNovedades({ queryKey }: { queryKey: readonly unknown[] }): Promise<NovedadOperativa[]> {
    const [_key, { residenciaId, userId }] = queryKey as [string, { residenciaId?: string; userId?: string }];

    if (!userId || !residenciaId) {
        // This case should ideally be prevented by the 'enabled' option in useQuery
        // but it's a good safeguard for type safety and early exit.
        return [];
    }

    const collectionPath = `residencias/${residenciaId}/novedadesOperativas`;

    const novedadesQuery = query(
        collection(db, collectionPath),
        where('autorId', '==', userId),
        orderBy('timestampCreacion', 'desc'),
        limit(50)
    );

    try {
        const snapshot = await getDocs(novedadesQuery);
        const data = snapshot.docs.map(serializeNovedad);
        return data;
    } catch (error) {
        console.error("[fetchNovedades] Error fetching documents:", error);
        return [];
    }
}


export function useNovedades(initialData: NovedadOperativa[]) {
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { user, claims } = useAuth();

    // Extract residenciaId from claims, which is more reliable for client-side operations
    const residenciaId = claims?.residenciaId as string | undefined;
    const userId = user?.uid;

    // The queryKey is now the single source of truth for the query's parameters.
    // This helps prevent stale closures and race conditions.
    const queryKey = ["novedades", { residenciaId, userId }];

    const { data: novedades } = useQuery({
        queryKey,
        queryFn: fetchNovedades, // Pass the function reference
        initialData,
        // Only run query if user is available AND residenciaId is available from claims
        enabled: !!userId && !!residenciaId,
    });

    const createMutation = useMutation({
        mutationFn: (payload: NovedadCreatePayload) => crearNovedadAction(residenciaId!, payload), // Assert residenciaId is present
        onMutate: async (newNovedadPayload) => {
            await queryClient.cancelQueries({ queryKey });
            const previousNovedades = queryClient.getQueryData<NovedadOperativa[]>(queryKey);

            const optimisticNovedad: NovedadOperativa = {
                ...newNovedadPayload,
                id: uuidv4(),
                estado: 'pendiente' as NovedadEstado,
                timestampCreacion: new Date().toISOString(),
                timestampActualizacion: new Date().toISOString(),
                autorId: userId!, // Assert userId is present
                residenciaId: residenciaId!, // Assert residenciaId is present
                fechaProgramada: new Date().toISOString().split('T')[0],
            };

            queryClient.setQueryData(queryKey, (old: NovedadOperativa[] = []) => [optimisticNovedad, ...old]);
            return { previousNovedades };
        },
        onError: (err: any, variables, context) => {
            toast({ title: "Error al crear", description: err.message, variant: "destructive" });
            if (context?.previousNovedades) {
                queryClient.setQueryData(queryKey, context.previousNovedades);
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey });
        },
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, payload }: { id: string; payload: Partial<NovedadOperativa> }) =>
            actualizarNovedadAction(residenciaId!, id, payload), // Assert residenciaId is present
        onMutate: async ({ id, payload }) => {
            await queryClient.cancelQueries({ queryKey });
            const previousNovedades = queryClient.getQueryData<NovedadOperativa[]>(queryKey);

            // Optimistically update the cache
            if (previousNovedades) {
                queryClient.setQueryData<NovedadOperativa[]>(
                    queryKey,
                    previousNovedades.map(n => n.id === id ? { ...n, ...payload, timestampActualizacion: new Date().toISOString() } : n)
                );
            }
            return { previousNovedades };
        },
        onError: (err: any, variables, context) => {
            // Revert optimistic update on error
            if (context?.previousNovedades) {
                queryClient.setQueryData(queryKey, context.previousNovedades);
            }
            toast({ title: "Error al actualizar", description: err.message, variant: "destructive" }); // Add toast for error
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey }); // Invalidate to refetch fresh data after mutation
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (novedadId: string) => eliminarNovedadAction(novedadId, residenciaId!), // Assert residenciaId is present
        onMutate: async (novedadId) => {
            await queryClient.cancelQueries({ queryKey });
            const previousNovedades = queryClient.getQueryData<NovedadOperativa[]>(queryKey);
            queryClient.setQueryData(queryKey, (old: NovedadOperativa[] = []) => old.filter((n) => n.id !== novedadId));
            return { previousNovedades };
        },
        onError: (err: Error, novedadId, context) => {
            toast({ title: "Error al eliminar", description: err.message, variant: "destructive" });
            if (context?.previousNovedades) {
                queryClient.setQueryData(queryKey, context.previousNovedades);
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey });
        },
    });

    const handleCreate = (payload: NovedadCreatePayload) => createMutation.mutate(payload);
    const handleEdit = (id: string, payload: Partial<NovedadOperativa>) => updateMutation.mutateAsync({ id, payload });
    const handleArchive = (id: string) => updateMutation.mutate({ id, payload: { estado: 'archivado' } });
    const handleDelete = (novedadId: string) => deleteMutation.mutate(novedadId);

    return {
        novedades,
        handleCreate,
        handleEdit,
        handleDelete,
        handleArchive,
        isCreating: createMutation.isPending,
        isUpdating: updateMutation.isPending,
        isDeleting: deleteMutation.isPending,
    };
}