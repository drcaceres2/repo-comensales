'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Atencion,
  ActualizarAtencionPayload,
  CambiarEstadoAtencionPayload,
  CrearAtencionPayload,
} from 'shared/schemas/atenciones';
import {
  actualizarAtencion,
  cambiarEstadoAtencion,
  crearAtencion,
  eliminarAtencion,
  obtenerAtenciones,
} from './actions';

const atencionesQueryKey = (residenciaId: string) => ['atenciones', residenciaId];

export function useObtenerAtenciones(
  residenciaId: string,
  initialData?: Atencion[],
) {
  return useQuery<Atencion[]>({
    queryKey: atencionesQueryKey(residenciaId),
    queryFn: async () => {
      if (!residenciaId) {
        return [];
      }
      return obtenerAtenciones(residenciaId);
    },
    enabled: !!residenciaId,
    initialData,
    staleTime: 0,
  });
}

export function useMutacionesAtenciones(residenciaId: string) {
  const queryClient = useQueryClient();

  const invalidarAtenciones = () => {
    queryClient.invalidateQueries({
      queryKey: atencionesQueryKey(residenciaId),
      refetchType: 'all',
    });
  };

  const crearMutation = useMutation({
    mutationFn: (payload: CrearAtencionPayload) => crearAtencion(residenciaId, payload),
    onSuccess: (result) => {
      if (result.success) {
        invalidarAtenciones();
      }
    },
  });

  const actualizarMutation = useMutation({
    mutationFn: (payload: ActualizarAtencionPayload) =>
      actualizarAtencion(residenciaId, payload),
    onSuccess: (result) => {
      if (result.success) {
        invalidarAtenciones();
      }
    },
  });

  const cambiarEstadoMutation = useMutation({
    mutationFn: (payload: CambiarEstadoAtencionPayload) =>
      cambiarEstadoAtencion(residenciaId, payload),
    onMutate: async ({ id, estado }) => {
      const key = atencionesQueryKey(residenciaId);
      await queryClient.cancelQueries({ queryKey: key });

      const previousAtenciones = queryClient.getQueryData<Atencion[]>(key) || [];

      queryClient.setQueryData<Atencion[]>(key, (actuales = []) =>
        actuales.map((item) => {
          if (item.id !== id) {
            return item;
          }

          return {
            ...item,
            estado,
            avisoAdministracion:
              estado === 'rechazada' ? 'cancelado' : item.avisoAdministracion,
          };
        }),
      );

      return { previousAtenciones };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousAtenciones) {
        queryClient.setQueryData(
          atencionesQueryKey(residenciaId),
          context.previousAtenciones,
        );
      }
    },
    onSettled: () => {
      invalidarAtenciones();
    },
  });

  const eliminarMutation = useMutation({
    mutationFn: (atencionId: string) => eliminarAtencion(residenciaId, atencionId),
    onMutate: async (atencionId) => {
      const key = atencionesQueryKey(residenciaId);
      await queryClient.cancelQueries({ queryKey: key });

      const previousAtenciones = queryClient.getQueryData<Atencion[]>(key) || [];
      queryClient.setQueryData<Atencion[]>(key, (actuales = []) =>
        actuales.filter((item) => item.id !== atencionId),
      );

      return { previousAtenciones };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousAtenciones) {
        queryClient.setQueryData(
          atencionesQueryKey(residenciaId),
          context.previousAtenciones,
        );
      }
    },
    onSettled: () => {
      invalidarAtenciones();
    },
  });

  return {
    crearMutation,
    actualizarMutation,
    cambiarEstadoMutation,
    eliminarMutation,
  };
}
