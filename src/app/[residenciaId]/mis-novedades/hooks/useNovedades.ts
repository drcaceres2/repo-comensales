"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useToast } from "@/hooks/useToast";
import { NovedadOperativa, NovedadEstado } from "shared/schemas/novedades";
import { 
  crearNovedadAction, 
  actualizarNovedadAction, 
  eliminarNovedadAction 
} from "../actions";
import { v4 as uuidv4 } from 'uuid';

// Definimos el tipo para el payload de creación, omitiendo los campos que genera el servidor.
type NovedadCreatePayload = Omit<NovedadOperativa, "id" | "timestampCreacion" | "timestampActualizacion" | "autorId" | "residenciaId" | "estado" | "fechaProgramada">;

export function useNovedades(initialData: NovedadOperativa[]) {
  const params = useParams();
  const residenciaId = params.residenciaId as string;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const queryKey = ["novedades", residenciaId];

  const { data: novedades } = useQuery({
    queryKey,
    queryFn: () => initialData,
    initialData,
  });

  const createMutation = useMutation({
    mutationFn: (payload: NovedadCreatePayload) => crearNovedadAction(residenciaId, payload),
    onMutate: async (newNovedadPayload) => {
      await queryClient.cancelQueries({ queryKey });
      const previousNovedades = queryClient.getQueryData<NovedadOperativa[]>(queryKey);

      const optimisticNovedad: NovedadOperativa = {
        ...newNovedadPayload,
        id: uuidv4(),
        estado: 'pendiente' as NovedadEstado, // Aseguramos el tipo correcto
        timestampCreacion: new Date().toISOString(),
        timestampActualizacion: new Date().toISOString(),
        autorId: 'optimistic-user', // Placeholder
        residenciaId: residenciaId,
        fechaProgramada: new Date().toISOString().split('T')[0],
      };

      queryClient.setQueryData(queryKey, (old: NovedadOperativa[] = []) => [...old, optimisticNovedad]);
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
      actualizarNovedadAction(residenciaId, id, payload),
    onMutate: async ({ id, payload }) => {
      await queryClient.cancelQueries({ queryKey });
      const previousNovedades = queryClient.getQueryData<NovedadOperativa[]>(queryKey);

      if (previousNovedades) {
        queryClient.setQueryData<NovedadOperativa[]>(
          queryKey,
          previousNovedades.map(n => n.id === id ? { ...n, ...payload } : n)
        );
      }
      return { previousNovedades };
    },
    onError: (err: any, variables, context) => {
      toast({ title: "Error al actualizar", description: err.message, variant: "destructive" });
      if (context?.previousNovedades) {
        queryClient.setQueryData(queryKey, context.previousNovedades);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (novedadId: string) => eliminarNovedadAction(novedadId, residenciaId),
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
  const handleEdit = (id: string, payload: Partial<NovedadOperativa>) => updateMutation.mutate({ id, payload });
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
