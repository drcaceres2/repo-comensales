'use client';

import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { addDays, format } from 'date-fns';
import { useEffect, useMemo, useState } from 'react';
import { CargaHorariosUI, HorarioDiaUI, TarjetaComidaUI } from 'shared/schemas/elecciones/ui.schema';
import { obtenerCargaHorarios } from '../_actions/obtenerCargaHorarios';

type RangoDias = {
  desdeOffsetDias: number;
  hastaOffsetDias: number;
};

type RangoFechas = {
  fechaInicio: string;
  fechaFin: string;
};

type UseHorarioDiaParams = {
  residenciaId: string;
  targetUid?: string;
  fechaEnFoco: string;
  rangoDias?: RangoDias;
  enabled?: boolean;
};

const RANGO_POR_DEFECTO: RangoDias = {
  desdeOffsetDias: -1,
  hastaOffsetDias: 7,
};

export const eleccionesQueryKeys = {
  base: (residenciaId: string, targetUid?: string) => ['elecciones-horarios', residenciaId, targetUid ?? 'self'] as const,
  rango: (residenciaId: string, fechaInicio: string, fechaFin: string, targetUid?: string) =>
    [...eleccionesQueryKeys.base(residenciaId, targetUid), fechaInicio, fechaFin] as const,
};

function isoDate(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

function construirRango(fechaEnFoco: string, rangoDias: RangoDias): RangoFechas {
  const base = new Date(`${fechaEnFoco}T00:00:00`);
  return {
    fechaInicio: isoDate(addDays(base, rangoDias.desdeOffsetDias)),
    fechaFin: isoDate(addDays(base, rangoDias.hastaOffsetDias)),
  };
}

function fechaEnRango(fecha: string, rango: RangoFechas): boolean {
  return fecha >= rango.fechaInicio && fecha <= rango.fechaFin;
}

function mergeUniqueDias(actuales: HorarioDiaUI[], nuevos: HorarioDiaUI[]): HorarioDiaUI[] {
  const map = new Map<string, HorarioDiaUI>();

  for (const dia of actuales) {
    map.set(dia.fecha, dia);
  }

  for (const dia of nuevos) {
    map.set(dia.fecha, dia);
  }

  return [...map.values()].sort((a, b) => a.fecha.localeCompare(b.fecha));
}

export function useHorarioDia({
  residenciaId,
  targetUid,
  fechaEnFoco,
  rangoDias = RANGO_POR_DEFECTO,
  enabled = true,
}: UseHorarioDiaParams) {
  const queryClient = useQueryClient();
  const [rangoActivo, setRangoActivo] = useState<RangoFechas>(() => construirRango(fechaEnFoco, rangoDias));

  useEffect(() => {
    if (fechaEnRango(fechaEnFoco, rangoActivo)) {
      return;
    }

    setRangoActivo(construirRango(fechaEnFoco, rangoDias));
  }, [fechaEnFoco, rangoActivo, rangoDias]);

  const query = useQuery({
    queryKey: eleccionesQueryKeys.rango(residenciaId, rangoActivo.fechaInicio, rangoActivo.fechaFin, targetUid),
    queryFn: async () => {
      const result = await obtenerCargaHorarios(
        residenciaId,
        rangoActivo.fechaInicio,
        rangoActivo.fechaFin,
        targetUid
      );

      if (!result.success || !result.data) {
        throw new Error(result.error?.message ?? 'No se pudo cargar horarios.');
      }

      return result.data;
    },
    enabled: enabled && Boolean(residenciaId),
    staleTime: 1000 * 60 * 5,
    placeholderData: keepPreviousData,
  });

  const data = query.data;

  const cacheAgregada = useMemo(() => {
    return queryClient.getQueryData<CargaHorariosUI>([
      ...eleccionesQueryKeys.base(residenciaId, targetUid),
      'agregado',
    ]);
  }, [queryClient, residenciaId, targetUid, query.dataUpdatedAt, query.isFetching]);

  // Mantiene un cache combinado por usuario objetivo para evitar misses al volver a dias previos.
  useEffect(() => {
    if (!data) {
      return;
    }

    queryClient.setQueryData(
      [...eleccionesQueryKeys.base(residenciaId, targetUid), 'agregado'],
      (prev: CargaHorariosUI | undefined) => {
        if (!prev) {
          return data;
        }

        return {
          ...prev,
          dias: mergeUniqueDias(prev.dias, data.dias),
          actividades: data.actividades,
        };
      }
    );
  }, [data, queryClient, residenciaId, targetUid]);

  const diaEnFocoDesdeAgregado = useMemo(
    () => cacheAgregada?.dias.find((dia) => dia.fecha === fechaEnFoco),
    [cacheAgregada, fechaEnFoco]
  );

  const diaEnFoco = useMemo(
    () => diaEnFocoDesdeAgregado ?? data?.dias.find((dia) => dia.fecha === fechaEnFoco),
    [diaEnFocoDesdeAgregado, data, fechaEnFoco]
  );

  const getTarjeta = (fecha: string, tiempoComidaId: string): TarjetaComidaUI | undefined => {
    const diaDesdeAgregado = cacheAgregada?.dias.find((item) => item.fecha === fecha);
    const tarjetaDesdeAgregado = diaDesdeAgregado?.tarjetas.find(
      (tarjeta) => tarjeta.tiempoComidaId === tiempoComidaId
    );

    if (tarjetaDesdeAgregado) {
      return tarjetaDesdeAgregado;
    }

    const diaDesdeQuery = data?.dias.find((item) => item.fecha === fecha);
    return diaDesdeQuery?.tarjetas.find((tarjeta) => tarjeta.tiempoComidaId === tiempoComidaId);
  };

  return {
    ...query,
    data,
    diaEnFoco,
    rangoActivo,
    getTarjeta,
  };
}

export type { UseHorarioDiaParams, RangoDias, RangoFechas };