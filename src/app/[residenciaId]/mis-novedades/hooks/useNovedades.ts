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
import { db, collection, query, where, orderBy, limit, getDocs, Timestamp, DocumentSnapshot } from '@/lib/firebase'; // Client-side firebase
import {useInfoUsuario} from "@/components/layout/AppProviders";

// Definimos el tipo para el payload de creación, omitiendo los campos que genera el servidor.
type NovedadCreatePayload = Omit<NovedadOperativa, "id" | "timestampCreacion" | "timestampActualizacion" | "autorId" | "residenciaId" | "estado" | "fechaProgramada">;

// Helper to serialize data with Timestamps or legacy ISO strings, mirroring server logic
function serializeNovedad(doc: DocumentSnapshot): NovedadOperativa {
    const data = doc.data()!;
    const serializedData: { [key: string]: any } = { id: doc.id };

    for (const key in data) {
        const value = data[key];
        if (value instanceof Timestamp) {
            serializedData[key] = value.toDate().toISOString();
        } else if (typeof value === 'string' && !isNaN(Date.parse(value))) {
            serializedData[key] = new Date(value).toISOString();
        } else {
            serializedData[key] = value;
        }
    }
    return serializedData as NovedadOperativa;
}

// fetchNovedades is implemented inside the hook so it can read
// `usuarioId` and `residenciaId` from the `useInfoUsuario` hook safely.


export function useNovedades(initialData: NovedadOperativa[]) {
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { usuarioId, residenciaId } = useInfoUsuario();

    // Local query function uses the hook-provided usuarioId/residenciaId
    async function fetchNovedadesLocal(): Promise<NovedadOperativa[]> {
        if (!usuarioId || !residenciaId) {
            console.warn('[fetchNovedadesLocal] usuarioId or residenciaId missing', { usuarioId, residenciaId });
            return [];
        }

        const collectionPath = `residencias/${residenciaId}/novedadesOperativas`;
        console.debug('[fetchNovedadesLocal] fetching', { usuarioId, residenciaId, collectionPath });

        const novedadesQuery = query(
            collection(db, collectionPath),
            where('autorId', '==', usuarioId),
            orderBy('timestampCreacion', 'desc'),
            limit(50)
        );

        // Small helper to wait before a retry
        const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

        try {
            const snapshot = await getDocs(novedadesQuery);
            return snapshot.docs.map(serializeNovedad);
        } catch (error: any) {
            console.error("[fetchNovedadesLocal] Error fetching documents:", error, { usuarioId, residenciaId });

            // Mitigate transient emulator/auth timing issues: retry once if rules returned 'false for '\'list\''
            const msg = (error && error.message) ? error.message : String(error);
            if (msg.includes("false for 'list'") || msg.includes("false for \"list\"")) {
                console.warn('[fetchNovedadesLocal] detected transient "false for list" error, retrying shortly');
                await sleep(250);
                try {
                    const snapshot2 = await getDocs(novedadesQuery);
                    return snapshot2.docs.map(serializeNovedad);
                } catch (err2) {
                    console.error("[fetchNovedadesLocal] Retry failed:", err2, { usuarioId, residenciaId });
                    return [];
                }
            }

            return [];
        }
    }

    // The queryKey is now the single source of truth for the query's parameters.
    // This helps prevent stale closures and race conditions.
    const queryKey = ["novedades", { residenciaId, usuarioId }];

    const { data: novedades } = useQuery({
        queryKey,
        queryFn: fetchNovedadesLocal,
        initialData,
        // Only run query if user is available AND residenciaId is available from claims
        enabled: !!usuarioId && !!residenciaId,
        // If the client fetch fails (e.g. transient auth/claims issue), don't retry aggressively
        retry: false,
    });

    const createMutation = useMutation({
        mutationFn: (payload: NovedadCreatePayload) => crearNovedadAction(residenciaId!, payload), // Assert residenciaId is present
        onMutate: async (newNovedadPayload) => {
            console.log('[createMutation] onMutate start', { newNovedadPayload, usuarioId, residenciaId, queryKey });
            await queryClient.cancelQueries({ queryKey });
            const previousNovedades = queryClient.getQueryData<NovedadOperativa[]>(queryKey);

            const optimisticNovedad: NovedadOperativa = {
                ...newNovedadPayload,
                id: uuidv4(),
                estado: 'pendiente' as NovedadEstado,
                timestampCreacion: new Date().toISOString(),
                timestampActualizacion: new Date().toISOString(),
                autorId: usuarioId!, // Assert usuarioId is present
                residenciaId: residenciaId!, // Assert residenciaId is present
                fechaProgramada: new Date().toISOString().split('T')[0],
            };

            queryClient.setQueryData(queryKey, (old: NovedadOperativa[] = []) => [optimisticNovedad, ...old]);
            console.log('[createMutation] onMutate optimistic update applied', { optimisticNovedad });
            return { previousNovedades };
        },
        onError: (err: any, variables, context) => {
            toast({ title: "Error al crear", description: err.message, variant: "destructive" });
            if (context?.previousNovedades) {
                queryClient.setQueryData(queryKey, context.previousNovedades);
            }
        },
        onSettled: () => {
            console.log('[createMutation] onSettled', { residenciaId, queryKey });
            if (residenciaId) queryClient.invalidateQueries({ queryKey });
        },
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, payload }: { id: string; payload: Partial<NovedadOperativa> }) =>
            actualizarNovedadAction(residenciaId!, id, payload), // Assert residenciaId is present
        onMutate: async ({ id, payload }) => {
            console.log('[updateMutation] onMutate', { id, payload, usuarioId, residenciaId, queryKey });
            await queryClient.cancelQueries({ queryKey });
            const previousNovedades = queryClient.getQueryData<NovedadOperativa[]>(queryKey);

            // Optimistically update the cache
            if (previousNovedades) {
                queryClient.setQueryData<NovedadOperativa[]>(
                    queryKey,
                    previousNovedades.map(n => n.id === id ? { ...n, ...payload, timestampActualizacion: new Date().toISOString() } : n)
                );
                console.log('[updateMutation] optimistic update applied', { id, payload });
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
            console.log('[updateMutation] onSettled', { residenciaId, queryKey });
            if (residenciaId) queryClient.invalidateQueries({ queryKey }); // Invalidate to refetch fresh data after mutation
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (novedadId: string) => eliminarNovedadAction(novedadId, residenciaId!), // Assert residenciaId is present
        onMutate: async (novedadId) => {
            console.log('[deleteMutation] onMutate', { novedadId, usuarioId, residenciaId, queryKey });
            await queryClient.cancelQueries({ queryKey });
            const previousNovedades = queryClient.getQueryData<NovedadOperativa[]>(queryKey);
            queryClient.setQueryData(queryKey, (old: NovedadOperativa[] = []) => old.filter((n) => n.id !== novedadId));
            console.log('[deleteMutation] optimistic delete applied', { novedadId });
            return { previousNovedades };
        },
        onError: (err: Error, novedadId, context) => {
            toast({ title: "Error al eliminar", description: err.message, variant: "destructive" });
            if (context?.previousNovedades) {
                queryClient.setQueryData(queryKey, context.previousNovedades);
            }
        },
        onSettled: () => {
            console.log('[deleteMutation] onSettled', { residenciaId, queryKey });
            if (residenciaId) queryClient.invalidateQueries({ queryKey });
        },
    });

    const handleCreate = (payload: NovedadCreatePayload) => {
        console.log('[handleCreate] called', { payload, usuarioId, residenciaId });
        return createMutation.mutate(payload);
    };
    const handleEdit = (id: string, payload: Partial<NovedadOperativa>) => updateMutation.mutateAsync({ id, payload });
    const handleArchive = (id: string) => updateMutation.mutate({ id, payload: { estado: 'archivado' } });
    const handleDelete = (novedadId: string) => {
        console.log('[handleDelete] called', { novedadId, usuarioId, residenciaId });
        return deleteMutation.mutate(novedadId);
    };

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