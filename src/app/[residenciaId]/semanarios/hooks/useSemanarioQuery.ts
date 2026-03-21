'use client';

import { useQuery } from '@tanstack/react-query';
import { SEMANARIOS_QUERY_KEY } from 'shared/models/types';
import {
  obtenerSemanarioReadDTO,
  obtenerSemanarioSingleton,
  obtenerUsuariosObjetivoSemanarios,
} from '../actions';

export const semanariosQueryKeys = {
  base: (residenciaId: string, viewerUid?: string, targetUid?: string) =>
    [SEMANARIOS_QUERY_KEY, residenciaId, viewerUid ?? 'anon', targetUid ?? 'self'] as const,
  singleton: (residenciaId: string, viewerUid?: string) =>
    [SEMANARIOS_QUERY_KEY, residenciaId, viewerUid ?? 'anon', 'singleton'] as const,
  usuariosObjetivo: (residenciaId: string, viewerUid?: string) =>
    [SEMANARIOS_QUERY_KEY, residenciaId, viewerUid ?? 'anon', 'usuarios-objetivo'] as const,
};

export function useSemanarioQuery(residenciaId: string, viewerUid?: string, targetUid?: string) {
  const viewerUidResolved = viewerUid?.trim();
  const targetUidResolved = targetUid?.trim();

  const singletonQuery = useQuery({
    queryKey: semanariosQueryKeys.singleton(residenciaId, viewerUidResolved),
    queryFn: async () => {
      const result = await obtenerSemanarioSingleton(residenciaId);
      if (!result.success || !result.data) {
        throw new Error(result.error?.message ?? 'No se pudo cargar la configuración de semanarios.');
      }
      return result.data;
    },
    enabled: Boolean(residenciaId && viewerUidResolved),
    staleTime: 1000 * 60 * 15,
  });

  const readQuery = useQuery({
    queryKey: semanariosQueryKeys.base(residenciaId, viewerUidResolved, targetUidResolved),
    queryFn: async () => {
      const result = await obtenerSemanarioReadDTO(residenciaId, targetUidResolved);
      if (!result.success || !result.data) {
        throw new Error(result.error?.message ?? 'No se pudo cargar el semanario.');
      }
      return result.data;
    },
    enabled: Boolean(residenciaId && viewerUidResolved && targetUidResolved),
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
      if (readQuery.isEnabled) {
        await Promise.all([singletonQuery.refetch(), readQuery.refetch()]);
        return;
      }
      await singletonQuery.refetch();
    },
  };
}

export function useUsuariosObjetivoSemanarios(residenciaId: string, viewerUid?: string) {
  const viewerUidResolved = viewerUid?.trim();

  return useQuery({
    queryKey: semanariosQueryKeys.usuariosObjetivo(residenciaId, viewerUidResolved),
    queryFn: async () => {
      const result = await obtenerUsuariosObjetivoSemanarios(residenciaId);
      if (!result.success || !result.data) {
        throw new Error(result.error?.message ?? 'No se pudo cargar usuarios objetivo.');
      }
      return result.data;
    },
    enabled: Boolean(residenciaId && viewerUidResolved),
    staleTime: 1000 * 60 * 15,
  });
}
