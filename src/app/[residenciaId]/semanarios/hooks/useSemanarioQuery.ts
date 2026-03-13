'use client';

import { useQuery } from '@tanstack/react-query';
import { SEMANARIOS_QUERY_KEY } from 'shared/models/types';
import {
  obtenerSemanarioReadDTO,
  obtenerSemanarioSingleton,
  obtenerUsuariosObjetivoSemanarios,
} from '../actions';

export const semanariosQueryKeys = {
  base: (residenciaId: string, targetUid?: string) =>
    [SEMANARIOS_QUERY_KEY, residenciaId, targetUid ?? 'self'] as const,
  singleton: (residenciaId: string) => [SEMANARIOS_QUERY_KEY, residenciaId, 'singleton'] as const,
  usuariosObjetivo: (residenciaId: string) => [SEMANARIOS_QUERY_KEY, residenciaId, 'usuarios-objetivo'] as const,
};

export function useSemanarioQuery(residenciaId: string, targetUid?: string) {
  const singletonQuery = useQuery({
    queryKey: semanariosQueryKeys.singleton(residenciaId),
    queryFn: async () => {
      const result = await obtenerSemanarioSingleton(residenciaId);
      if (!result.success || !result.data) {
        throw new Error(result.error?.message ?? 'No se pudo cargar la configuración de semanarios.');
      }
      return result.data;
    },
    enabled: Boolean(residenciaId),
    staleTime: 1000 * 60 * 15,
  });

  const readQuery = useQuery({
    queryKey: semanariosQueryKeys.base(residenciaId, targetUid),
    queryFn: async () => {
      const result = await obtenerSemanarioReadDTO(residenciaId, targetUid);
      if (!result.success || !result.data) {
        throw new Error(result.error?.message ?? 'No se pudo cargar el semanario.');
      }
      return result.data;
    },
    enabled: Boolean(residenciaId && targetUid),
    staleTime: 1000 * 60 * 3,
  });

  return {
    singleton: singletonQuery.data,
    read: readQuery.data,
    isLoading: singletonQuery.isLoading || readQuery.isLoading,
    isFetching: singletonQuery.isFetching || readQuery.isFetching,
    isError: singletonQuery.isError || readQuery.isError,
    error: (singletonQuery.error ?? readQuery.error) as Error | null,
    refetch: async () => {
      await Promise.all([singletonQuery.refetch(), readQuery.refetch()]);
    },
  };
}

export function useUsuariosObjetivoSemanarios(residenciaId: string) {
  return useQuery({
    queryKey: semanariosQueryKeys.usuariosObjetivo(residenciaId),
    queryFn: async () => {
      const result = await obtenerUsuariosObjetivoSemanarios(residenciaId);
      if (!result.success || !result.data) {
        throw new Error(result.error?.message ?? 'No se pudo cargar usuarios objetivo.');
      }
      return result.data;
    },
    enabled: Boolean(residenciaId),
    staleTime: 1000 * 60 * 15,
  });
}
