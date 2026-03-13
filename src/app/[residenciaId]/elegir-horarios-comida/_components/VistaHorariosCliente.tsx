'use client';

import { useEffect, useState } from 'react';
import { useInfoUsuario } from '@/components/layout/AppProviders';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useHorarioDia } from '../_hooks/useHorarioDia';
import { useHorariosStore } from '../_hooks/useHorariosStore';
import { useMutacionOptimista } from '../_hooks/useMutacionOptimista';
import { BarraSuplantacion } from './BarraSuplantacion';
import { BannerNovedades } from './BannerNovedades';
import { CarruselCalendario } from './CarruselCalendario';
import { CarruselDiario } from './CarruselDiario';
import { BotonAccionRadial } from './BotonAccionRadial';
import { ModalExcepcionLibre } from './Modales/ModalExcepcionLibre';
import { ModalAusenciaLote } from './Modales/ModalAusenciaLote';

type Props = {
  residenciaId: string;
  fechaInicial: string;
};

export function VistaHorariosCliente({ residenciaId, fechaInicial }: Props) {
  const { usuarioId } = useInfoUsuario();
  const [mostrarBannerNovedades] = useState(false);
  const [mostrarBadgeFetching, setMostrarBadgeFetching] = useState(false);

  const targetUid = useHorariosStore((state) => state.targetUid);
  const syncUsuarioSesion = useHorariosStore((state) => state.syncUsuarioSesion);
  const fechaEnFoco = useHorariosStore((state) => state.fechaEnFoco);
  const setFechaEnFoco = useHorariosStore((state) => state.setFechaEnFoco);
  const modalActivo = useHorariosStore((state) => state.modalActivo);
  const abrirModal = useHorariosStore((state) => state.abrirModal);
  const cerrarModal = useHorariosStore((state) => state.cerrarModal);

  useEffect(() => {
    if (usuarioId) {
      syncUsuarioSesion(usuarioId);
    }
  }, [syncUsuarioSesion, usuarioId]);

  useEffect(() => {
    setFechaEnFoco(fechaInicial);
  }, [fechaInicial, setFechaEnFoco]);

  const targetUidEfectivo = targetUid ?? usuarioId ?? '';

  const { data, diaEnFoco, isLoading, isError, error, isFetching } = useHorarioDia({
    residenciaId,
    targetUid: targetUidEfectivo,
    fechaEnFoco,
    enabled: Boolean(residenciaId && targetUidEfectivo),
  });

  const { guardarExcepcion, guardarAusenciaLote, hayPendientes } = useMutacionOptimista(
    residenciaId,
    targetUidEfectivo
  );

  useEffect(() => {
    if (!isFetching) {
      setMostrarBadgeFetching(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setMostrarBadgeFetching(true);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [isFetching]);

  if (!targetUidEfectivo) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isLoading && !data) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        No se pudo cargar el modulo: {(error as Error)?.message ?? 'Error desconocido.'}
      </div>
    );
  }

  const dias = data?.dias ?? [];
  const actividades = data?.actividades ?? [];

  return (
    <div className="space-y-4 pb-24">
      {(mostrarBadgeFetching || hayPendientes) ? (
        <div className="flex items-center justify-end gap-2">
          {mostrarBadgeFetching ? <Badge variant="secondary">Actualizando</Badge> : null}
          {hayPendientes ? <Badge variant="outline">Pendientes offline</Badge> : null}
        </div>
      ) : null}

      <BarraSuplantacion residenciaId={residenciaId} />

      <BannerNovedades hayPendientesSync={hayPendientes} visible={mostrarBannerNovedades} />

      <CarruselCalendario
        dias={dias}
        actividades={actividades}
        fechaEnFoco={fechaEnFoco}
        onSeleccionarFecha={setFechaEnFoco}
      />

      <CarruselDiario
        dias={dias}
        fechaEnFoco={fechaEnFoco}
        onCambiarFecha={setFechaEnFoco}
        onGuardarExcepcion={guardarExcepcion}
      />

      <BotonAccionRadial
        onNuevaExcepcion={() => abrirModal('excepcion')}
        onNuevaAusencia={() => abrirModal('ausencia')}
      />

      <ModalExcepcionLibre
        open={modalActivo === 'excepcion'}
        onOpenChange={(open) => {
          if (!open) cerrarModal();
        }}
        data={data}
        fechaPreferida={diaEnFoco?.fecha ?? fechaEnFoco}
        onSubmit={guardarExcepcion}
      />

      <ModalAusenciaLote
        open={modalActivo === 'ausencia'}
        onOpenChange={(open) => {
          if (!open) cerrarModal();
        }}
        data={data}
        fechaPreferida={diaEnFoco?.fecha ?? fechaEnFoco}
        onSubmit={guardarAusenciaLote}
      />
    </div>
  );
}
