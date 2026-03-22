'use client';

import { MutationKey, QueryKey, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActionResponse } from 'shared/models/types';
import { FormAusenciaLote, FormExcepcionLibre, CargaHorariosUI, TarjetaComidaUI } from 'shared/schemas/elecciones/ui.schema';
import { useToast } from '@/hooks/useToast';
import { upsertAusenciaLote } from '../_actions/upsertAusenciaLote';
import { upsertExcepcion } from '../_actions/upsertExcepcion';
import { eleccionesQueryKeys } from './useHorarioDia';
import { useHorariosStore } from './useHorariosStore';

type TipoOperacion = 'excepcion' | 'ausencia';

type QueueItem = {
  id: string;
  residenciaId: string;
  targetUid?: string;
  tipo: TipoOperacion;
  payload: FormExcepcionLibre | FormAusenciaLote;
  intentos: number;
  timestamp: number;
};

type MutationPayloadMap = {
  excepcion: FormExcepcionLibre;
  ausencia: FormAusenciaLote;
};

type MutationContext = {
  snapshots: Array<{ key: QueryKey; value: CargaHorariosUI | undefined }>;
  tipo: TipoOperacion;
  payload: FormExcepcionLibre | FormAusenciaLote;
};

const STORAGE_KEY = 'elecciones_mutaciones_pendientes_v1';
const MAX_REINTENTOS = 5;

function isNetworkError(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return true;
  }

  const message = error instanceof Error ? error.message : String(error ?? '');
  return /(network|offline|failed to fetch|timeout|econn|fetch)/i.test(message);
}

function readQueue(): QueueItem[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as QueueItem[];
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed;
  } catch {
    return [];
  }
}

function writeQueue(queue: QueueItem[]) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
}

function enqueue(item: QueueItem): QueueItem[] {
  const current = readQueue();
  const next = [...current, item];
  writeQueue(next);
  return next;
}

function updateQueue(items: QueueItem[]): QueueItem[] {
  writeQueue(items);
  return items;
}

function applyExcepcionOptimista(data: CargaHorariosUI, payload: FormExcepcionLibre): CargaHorariosUI {
  return {
    ...data,
    dias: data.dias.map((dia) => {
      if (dia.fecha !== payload.fecha) {
        return dia;
      }

      return {
        ...dia,
        tarjetas: dia.tarjetas.map((tarjeta) => {
          if (tarjeta.tiempoComidaId !== payload.tiempoComidaId) {
            return tarjeta;
          }

          const opcion = tarjeta.detallesDrawer.opciones?.find(
            (item) => item.configuracionAlternativaId === payload.configuracionAlternativaId
          );

          return {
            ...tarjeta,
            origenResolucion: 'CAPA3_EXCEPCION',
            origen: 'excepcion',
            estadoInteraccion: 'MUTABLE',
            estadoAprobacion: opcion?.requiereAprobacion ? 'pendiente' : 'no_requerida',
            resultadoEfectivo: {
              ...tarjeta.resultadoEfectivo,
              configuracionAlternativaId: payload.configuracionAlternativaId,
              nombre: opcion?.nombre ?? payload.configuracionAlternativaId,
              tipo: opcion?.tipo ?? tarjeta.resultadoEfectivo.tipo,
            },
          };
        }),
      };
    }),
  };
}

function isFechaEnRango(fecha: string, fechaInicio: string, fechaFin: string): boolean {
  return fecha >= fechaInicio && fecha <= fechaFin;
}

function shouldPatchTarjetaAusencia(
  tarjeta: TarjetaComidaUI,
  tarjetasDelDia: TarjetaComidaUI[],
  fecha: string,
  payload: FormAusenciaLote
): boolean {
  if (!isFechaEnRango(fecha, payload.fechaInicio, payload.fechaFin)) {
    return false;
  }

  const idx = tarjetasDelDia.findIndex((item) => item.tiempoComidaId === tarjeta.tiempoComidaId);
  if (idx < 0) {
    return false;
  }

  const idxInicio = payload.primerTiempoAusente
    ? tarjetasDelDia.findIndex((item) => item.tiempoComidaId === payload.primerTiempoAusente)
    : -1;

  const idxFin = payload.ultimoTiempoAusente
    ? tarjetasDelDia.findIndex((item) => item.tiempoComidaId === payload.ultimoTiempoAusente)
    : -1;

  const esPrimerDia = fecha === payload.fechaInicio;
  const esUltimoDia = fecha === payload.fechaFin;

  if (esPrimerDia && idxInicio >= 0 && idx < idxInicio) {
    return false;
  }

  if (esUltimoDia && idxFin >= 0 && idx > idxFin) {
    return false;
  }

  return true;
}

function applyAusenciaOptimista(data: CargaHorariosUI, payload: FormAusenciaLote): CargaHorariosUI {
  return {
    ...data,
    dias: data.dias.map((dia) => {
      if (!isFechaEnRango(dia.fecha, payload.fechaInicio, payload.fechaFin)) {
        return dia;
      }

      return {
        ...dia,
        tarjetas: dia.tarjetas.map((tarjeta) => {
          if (!shouldPatchTarjetaAusencia(tarjeta, dia.tarjetas, dia.fecha, payload)) {
            return tarjeta;
          }

          const opcionAusencia = tarjeta.detallesDrawer.opciones?.find(
            (item) => item.tipo === 'noComoEnCasa' || item.tipo === 'ayuno'
          );

          return {
            ...tarjeta,
            origenResolucion: 'CAPA2_AUSENCIA',
            origen: 'ausencia',
            estadoInteraccion: 'BLOQUEADO_RESTRICCION',
            detallesDrawer: {
              ...tarjeta.detallesDrawer,
              mensajeFormativo: 'Ausencia activa para este tiempo de comida.',
              detalleAusencia: {
                fechaInicio: payload.fechaInicio,
                fechaFin: payload.fechaFin,
                primerTiempoAusente: payload.primerTiempoAusente ?? null,
                ultimoTiempoAusente: payload.ultimoTiempoAusente ?? null,
                motivo: payload.motivo,
              },
            },
            resultadoEfectivo: {
              ...tarjeta.resultadoEfectivo,
              configuracionAlternativaId:
                opcionAusencia?.configuracionAlternativaId ?? tarjeta.resultadoEfectivo.configuracionAlternativaId,
              nombre: 'Ausente',
              tipo: opcionAusencia?.tipo ?? 'noComoEnCasa',
            },
          };
        }),
      };
    }),
  };
}

function domainErrorFromAction(result: ActionResponse<void>) {
  if (result.success) {
    return null;
  }

  const err = new Error(result.error?.message ?? 'Error de dominio');
  (err as Error & { code?: string }).code = result.error?.code;
  return err;
}

export function useMutacionOptimista(residenciaId: string, targetUid?: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const setSavingAccion = useHorariosStore((state) => state.setSavingAccion);
  const [pendientes, setPendientes] = useState<QueueItem[]>([]);
  const replayEnCursoRef = useRef(false);

  const snapshotQueries = useCallback(() => {
    const all = queryClient.getQueriesData<CargaHorariosUI>({
      queryKey: eleccionesQueryKeys.base(residenciaId, targetUid),
    });

    return all
      .map(([key, value]) => ({ key, value }))
      .filter((item) => item.value && Array.isArray(item.value.dias));
  }, [queryClient, residenciaId, targetUid]);

  const patchAllQueries = useCallback(
    (
      patcher: (data: CargaHorariosUI) => CargaHorariosUI
    ) => {
      const items = snapshotQueries();
      for (const item of items) {
        queryClient.setQueryData(item.key, (prev: CargaHorariosUI | undefined) => {
          if (!prev) {
            return prev;
          }
          return patcher(prev);
        });
      }
    },
    [queryClient, snapshotQueries]
  );

  const rollback = useCallback(
    (context?: MutationContext) => {
      if (!context) {
        return;
      }

      for (const snap of context.snapshots) {
        queryClient.setQueryData(snap.key, snap.value);
      }
    },
    [queryClient]
  );

  const invalidateAll = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: eleccionesQueryKeys.base(residenciaId, targetUid) });
  }, [queryClient, residenciaId, targetUid]);

  const replayPendientes = useCallback(async () => {
    if (replayEnCursoRef.current) {
      return;
    }

    replayEnCursoRef.current = true;

    try {
      let queue = readQueue().filter((item) => item.residenciaId === residenciaId && item.targetUid === targetUid);
      if (queue.length === 0) {
        setPendientes([]);
        return;
      }

      const persisted = readQueue();

      while (queue.length > 0) {
        const head = queue[0];
        let result: ActionResponse<void>;

        try {
          result = head.tipo === 'excepcion'
            ? await upsertExcepcion(residenciaId, head.payload as FormExcepcionLibre, head.targetUid)
            : await upsertAusenciaLote(residenciaId, head.payload as FormAusenciaLote, head.targetUid);
        } catch (error) {
          if (isNetworkError(error)) {
            break;
          }

          // Error no recuperable por red: se descarta de la cola.
          queue = queue.slice(1);
          continue;
        }

        if (result.success) {
          queue = queue.slice(1);
          continue;
        }

        if (result.error?.code === 'MURO_MOVIL_CERRADO' || result.error?.code === 'AUTORIDAD_RESTRINGIDA' || result.error?.code === 'VALIDATION_ERROR') {
          queue = queue.slice(1);
          continue;
        }

        const nextHead = { ...head, intentos: head.intentos + 1 };
        if (nextHead.intentos >= MAX_REINTENTOS) {
          queue = queue.slice(1);
          toast({
            title: 'No se pudo sincronizar',
            description: 'Se agotaron los reintentos de una mutación pendiente.',
            variant: 'destructive',
          });
          continue;
        }

        queue[0] = nextHead;
        break;
      }

      const unaffected = persisted.filter((item) => item.residenciaId !== residenciaId || item.targetUid !== targetUid);
      const combined = [...unaffected, ...queue];
      updateQueue(combined);
      setPendientes(queue);

      if (queue.length === 0) {
        await invalidateAll();
      }
    } finally {
      replayEnCursoRef.current = false;
    }
  }, [invalidateAll, residenciaId, targetUid, toast]);

  useEffect(() => {
    setPendientes(readQueue().filter((item) => item.residenciaId === residenciaId && item.targetUid === targetUid));
  }, [residenciaId, targetUid]);

  useEffect(() => {
    const onOnline = () => {
      void replayPendientes();
    };

    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [replayPendientes]);

  const onMutateFactory = useCallback(
    async <T extends TipoOperacion>(
      tipo: T,
      payload: MutationPayloadMap[T]
    ): Promise<MutationContext> => {
      setSavingAccion(tipo, true);
      await queryClient.cancelQueries({ queryKey: eleccionesQueryKeys.base(residenciaId, targetUid) });

      const snapshots = snapshotQueries();

      if (tipo === 'excepcion') {
        patchAllQueries((data) => applyExcepcionOptimista(data, payload as FormExcepcionLibre));
      } else {
        patchAllQueries((data) => applyAusenciaOptimista(data, payload as FormAusenciaLote));
      }

      return {
        snapshots,
        tipo,
        payload,
      };
    },
    [patchAllQueries, queryClient, residenciaId, setSavingAccion, snapshotQueries, targetUid]
  );

  const onErrorFactory = useCallback(
    async (error: unknown, context: MutationContext | undefined) => {
      const tipo = context?.tipo;
      if (tipo) {
        setSavingAccion(tipo, false);
      }

      if (isNetworkError(error) && context) {
        const queue = enqueue({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          residenciaId,
          targetUid,
          tipo: context.tipo,
          payload: context.payload,
          intentos: 0,
          timestamp: Date.now(),
        });

        setPendientes(queue.filter((item) => item.residenciaId === residenciaId && item.targetUid === targetUid));
        toast({
          title: 'Sin conexión',
          description: 'Guardamos tu cambio localmente y lo reintentaremos al recuperar internet.',
        });
        return;
      }

      rollback(context);
      const code = (error as Error & { code?: string })?.code;
      toast({
        title: 'No se pudo guardar',
        description: code ? `${code}: ${(error as Error).message}` : (error as Error)?.message ?? 'Error inesperado.',
        variant: 'destructive',
      });
    },
    [residenciaId, rollback, setSavingAccion, targetUid, toast]
  );

  const onSuccessFactory = useCallback(
    async (tipo: TipoOperacion) => {
      setSavingAccion(tipo, false);
      await invalidateAll();
    },
    [invalidateAll, setSavingAccion]
  );

  const onSettledFactory = useCallback(
    async (context?: MutationContext) => {
      if (context?.tipo) {
        setSavingAccion(context.tipo, false);
      }
    },
    [setSavingAccion]
  );

  const excepcionMutation = useMutation({
    mutationKey: ['elecciones-mutation', residenciaId, targetUid ?? 'self', 'excepcion'] as MutationKey,
    mutationFn: async (payload: FormExcepcionLibre) => {
      const result = await upsertExcepcion(residenciaId, payload, targetUid);
      const err = domainErrorFromAction(result);
      if (err) {
        throw err;
      }
      return result;
    },
    onMutate: (payload) => onMutateFactory('excepcion', payload),
    onError: (error, _payload, context) => {
      void onErrorFactory(error, context);
    },
    onSuccess: () => {
      void onSuccessFactory('excepcion');
    },
    onSettled: (_data, _error, _payload, context) => {
      void onSettledFactory(context);
    },
  });

  const ausenciaMutation = useMutation({
    mutationKey: ['elecciones-mutation', residenciaId, targetUid ?? 'self', 'ausencia'] as MutationKey,
    mutationFn: async (payload: FormAusenciaLote) => {
      const result = await upsertAusenciaLote(residenciaId, payload, targetUid);
      const err = domainErrorFromAction(result);
      if (err) {
        throw err;
      }
      return result;
    },
    onMutate: (payload) => onMutateFactory('ausencia', payload),
    onError: (error, _payload, context) => {
      void onErrorFactory(error, context);
    },
    onSuccess: () => {
      void onSuccessFactory('ausencia');
    },
    onSettled: (_data, _error, _payload, context) => {
      void onSettledFactory(context);
    },
  });

  return {
    guardarExcepcion: excepcionMutation.mutateAsync,
    guardarAusenciaLote: ausenciaMutation.mutateAsync,
    replayPendientes,
    pendientes,
    hayPendientes: pendientes.length > 0,
    isGuardandoExcepcion: excepcionMutation.isPending,
    isGuardandoAusencia: ausenciaMutation.isPending,
  };
}
