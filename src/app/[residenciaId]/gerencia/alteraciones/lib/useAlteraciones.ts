"use client";

import { useQuery } from "@tanstack/react-query";
import type { AlteracionHorario } from "shared/schemas/alteraciones";
import type { GrupoComida, TiempoComida } from "shared/schemas/horarios";

import { fetchAlteraciones, fetchAlteracionesConfig } from "./service";

export function useAlteraciones(residenciaId: string) {
  const alteracionesQuery = useQuery<AlteracionHorario[]>({
    queryKey: ["alteraciones", residenciaId],
    queryFn: () => fetchAlteraciones(residenciaId),
    enabled: Boolean(residenciaId),
    retry: false,
  });

  const configQuery = useQuery({
    queryKey: ["alteraciones-config", residenciaId],
    queryFn: () => fetchAlteracionesConfig(residenciaId),
    enabled: Boolean(residenciaId),
  });

  return {
    alteraciones: alteracionesQuery.data ?? [],
    gruposComidas:
      (configQuery.data?.gruposComidas as Record<string, GrupoComida>) ?? {},
    tiemposComida:
      (configQuery.data?.tiemposComida as Record<string, TiempoComida>) ?? {},
    isLoadingAlteraciones: alteracionesQuery.isLoading,
    isFetchingAlteraciones: alteracionesQuery.isFetching,
    isLoadingConfig: configQuery.isLoading,
    isErrorAlteraciones: alteracionesQuery.isError,
    isErrorConfig: configQuery.isError,
    alteracionesError: alteracionesQuery.error,
    configError: configQuery.error,
  };
}