'use client';

import { useQuery, useMutation } from '@tanstack/react-query';
import { useEffect, useRef, useCallback } from 'react';
import { useSolicitudConsolidadaStore } from './store';
import {
  fase3SolicitudConsolidadaUI,
  pendientesTriajeSolicitudConsolidada,
  historialSolicitudesConsolidadasUI,
  actualizarBorradorParcial,
  consultarEstadoPdfSolicitud,
} from './server-actions';

/**
 * Hook para cargar datos de la Fase 3 (Motor de Ingesta con cascada)
 * Dispara lecturas en paralelo y carga el árbol de comensales, calendario, etc.
 */
export function useFase3SolicitudConsolidada(residenciaId: string | null) {
  const setEncabezado = useSolicitudConsolidadaStore((s) => s.setEncabezado);
  const setPestana1 = useSolicitudConsolidadaStore((s) => s.setPestana1);
  const setPestana2 = useSolicitudConsolidadaStore((s) => s.setPestana2);
  const setPestana3 = useSolicitudConsolidadaStore((s) => s.setPestana3);
  const setCargandoFase3 = useSolicitudConsolidadaStore((s) => s.setCargandoFase3);
  const setErrorCarga = useSolicitudConsolidadaStore((s) => s.setErrorCarga);

  const { data, isLoading, error } = useQuery<any, Error>({
    queryKey: ['fase3-solicitud-consolidada', residenciaId],
    queryFn: async () => {
      if (!residenciaId) {
        throw new Error('residenciaId is required');
      }
      const result = await fase3SolicitudConsolidadaUI({ residenciaId });
      if (!result.success) {
        throw new Error(result.message);
      }
      return result.data;
    },
    enabled: !!residenciaId,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
  });

  // Inyectar datos en el store cuando se carguen
  useEffect(() => {
    if (data) {
      setEncabezado({
        calendario: data.encabezado.calendario,
        colapsado: false,
      });
      setPestana1(data.pestana1);
      setPestana2(data.pestana2);
      setPestana3(data.pestana3);
    }
  }, [data, setEncabezado, setPestana1, setPestana2, setPestana3]);

  // Actualizar estado de carga
  useEffect(() => {
    setCargandoFase3(isLoading);
  }, [isLoading, setCargandoFase3]);

  // Actualizar error
  useEffect(() => {
    if (error) {
      setErrorCarga(error.message || 'Error desconocido');
    }
  }, [error, setErrorCarga]);

  return {
    data,
    isLoading,
    error,
  };
}

/**
 * Hook para cargar datos del Triage (Fase 1 - Pendientes)
 * Muestra entidades en estado pendiente para aprobación/rechazo
 */
export function usePendientesTriajeSolicitudConsolidada(residenciaId: string | null) {
  const setCargandoFase2 = useSolicitudConsolidadaStore((s) => s.setCargandoFase2);
  const setErrorCarga = useSolicitudConsolidadaStore((s) => s.setErrorCarga);

  const { data, isLoading, error } = useQuery<any, Error>({
    queryKey: ['pendientes-triage-solicitud-consolidada', residenciaId],
    queryFn: async () => {
      if (!residenciaId) {
        throw new Error('residenciaId is required');
      }
      const result = await pendientesTriajeSolicitudConsolidada({ residenciaId });
      if (!result.success) {
        throw new Error(result.message);
      }
      return result.data;
    },
    enabled: !!residenciaId,
    staleTime: 1000 * 60 * 2,
    gcTime: 1000 * 60 * 5,
  });

  // Actualizar estado de carga
  useEffect(() => {
    setCargandoFase2(isLoading);
  }, [isLoading, setCargandoFase2]);

  // Actualizar error
  useEffect(() => {
    if (error) {
      setErrorCarga(error.message || 'Error desconocido');
    }
  }, [error, setErrorCarga]);

  return {
    data,
    isLoading,
    error,
  };
}

/**
 * Hook para cargar historial de solicitudes consolidadas (lectura paginada)
 */
export function useHistorialSolicitudesConsolidadas(
  residenciaId: string | null,
  pageSize: number = 30,
) {
  const { data, isLoading, error } = useQuery<any, Error>({
    queryKey: ['historial-solicitudes-consolidadas', residenciaId, pageSize],
    queryFn: async () => {
      if (!residenciaId) {
        throw new Error('residenciaId is required');
      }
      const result = await historialSolicitudesConsolidadasUI({
        residenciaId,
        pageSize,
      });
      if (!result.success) {
        throw new Error(result.message);
      }
      return result.data;
    },
    enabled: !!residenciaId,
    staleTime: 1000 * 60 * 10,
    gcTime: 1000 * 60 * 30,
  });

  return {
    solicitudes: (data?.tarjetas ?? []) as any[],
    isLoading,
    error,
  };
}

/**
 * Hook que sincroniza los overrides del store con Firestore tras 3s de inactividad.
 * Dispara useMutation → actualizarBorradorParcial y llama markClean() al éxito.
 */
export function useDebouncedBorradorSync() {
  const dirty = useSolicitudConsolidadaStore((s) => s.dirty);
  const overrides = useSolicitudConsolidadaStore((s) => s.overrides);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const { residenciaId, solicitudId, overrides } = useSolicitudConsolidadaStore.getState();
      if (!residenciaId || !solicitudId || overrides.length === 0) {
        return { success: true as const, data: { actualizados: 0 } };
      }
      return actualizarBorradorParcial({ residenciaId, solicitudId, overrides });
    },
    onSuccess: (result) => {
      if (result.success) {
        useSolicitudConsolidadaStore.getState().markClean();
      }
    },
  });

  const flush = useCallback(() => {
    const state = useSolicitudConsolidadaStore.getState();
    if (state.dirty && state.overrides.length > 0) {
      mutation.mutate();
    }
  }, [mutation]);

  // Observar cambios en overrides y dirty
  useEffect(() => {
    if (!dirty) return;

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      flush();
    }, 3000);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [dirty, overrides, flush]);

  // Flush al desmontar si hay cambios pendientes
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      const state = useSolicitudConsolidadaStore.getState();
      if (state.dirty && state.overrides.length > 0) {
        // Fire and forget: persist on unmount
        actualizarBorradorParcial({
          residenciaId: state.residenciaId!,
          solicitudId: state.solicitudId!,
          overrides: state.overrides,
        }).catch(() => { /* silencioso */ });
      }
    };
  }, []);

  return {
    isSyncing: mutation.isPending,
    syncError: mutation.error,
  };
}

/**
 * Hook que hace polling cada 4s del estado de generación del PDF.
 * Habilitado cuando estadoSellado ∈ {sellado, pdf_generando}.
 * Se auto-desactiva al alcanzar estado terminal (pdf_completado, pdf_error).
 */
export function usePollingEstadoPdf() {
  const estadoSellado = useSolicitudConsolidadaStore((s) => s.estadoSellado);
  const residenciaId = useSolicitudConsolidadaStore((s) => s.residenciaId);
  const solicitudId = useSolicitudConsolidadaStore((s) => s.solicitudId);
  const setEstadoSellado = useSolicitudConsolidadaStore((s) => s.setEstadoSellado);
  const setUrlPdfDescarga = useSolicitudConsolidadaStore((s) => s.setUrlPdfDescarga);

  const shouldPoll = estadoSellado === 'sellado' || estadoSellado === 'pdf_generando';

  const { data } = useQuery({
    queryKey: ['polling-estado-pdf', residenciaId, solicitudId],
    queryFn: async () => {
      if (!residenciaId || !solicitudId) {
        throw new Error('Faltan residenciaId o solicitudId');
      }
      const result = await consultarEstadoPdfSolicitud({
        residenciaId,
        solicitudId,
      });
      if (!result.success) {
        throw new Error(result.message);
      }
      return result.data;
    },
    enabled: shouldPoll && !!residenciaId && !!solicitudId,
    refetchInterval: shouldPoll ? 4000 : false,
    staleTime: 0,
    gcTime: 0,
  });

  useEffect(() => {
    if (!data) return;

    if (data.estadoGeneracionPdf === 'GENERANDO') {
      setEstadoSellado('pdf_generando');
    } else if (data.estadoGeneracionPdf === 'COMPLETADO') {
      setEstadoSellado('pdf_completado');
      setUrlPdfDescarga(data.urlPdfReporte);
    } else if (data.estadoGeneracionPdf === 'ERROR') {
      setEstadoSellado('pdf_error');
    }
  }, [data, setEstadoSellado, setUrlPdfDescarga]);

  return { pollingData: data };
}
