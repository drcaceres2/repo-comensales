'use client';

import { useEffect, useState } from 'react';
import { useInfoUsuario } from '@/components/layout/AppProviders';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Pizza } from 'lucide-react';
import { FormAusenciaLote, TarjetaComidaUI } from 'shared/schemas/elecciones/ui.schema';
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
  const ausenciaEnEdicion = useHorariosStore((state) => state.ausenciaEnEdicion);
  const iniciarEdicionAusencia = useHorariosStore((state) => state.iniciarEdicionAusencia);
  const limpiarEdicionAusencia = useHorariosStore((state) => state.limpiarEdicionAusencia);

  useEffect(() => {
    if (usuarioId) {
      syncUsuarioSesion(usuarioId);
    }
  }, [syncUsuarioSesion, usuarioId]);

  useEffect(() => {
    setFechaEnFoco(fechaInicial);
  }, [fechaInicial, setFechaEnFoco]);

  const [headerHidden, setHeaderHidden] = useState(false);
  useEffect(() => {
    let lastY = 0;
    let ticking = false;

    const main = document.querySelector('main');
    if (!main) return;

    const onScroll = () => {
      const y = (main as HTMLElement).scrollTop;
      if (!ticking) {
        window.requestAnimationFrame(() => {
          if (y > lastY + 8 && y > 10) {
            setHeaderHidden(true);
          } else if (y < lastY - 5 || y <= 10) {
            setHeaderHidden(false);
          }
          lastY = y;
          ticking = false;
        });
        ticking = true;
      }
    };

    main.addEventListener('scroll', onScroll, { passive: true });
    return () => main.removeEventListener('scroll', onScroll);
  }, []);

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

  const abrirEdicionAusenciaDesdeTarjeta = (fecha: string, tarjeta: TarjetaComidaUI) => {
    const detalle = tarjeta.detallesDrawer.detalleAusencia;
    if (!detalle) {
      return;
    }

    const seed: FormAusenciaLote = {
      fechaInicio: detalle.fechaInicio,
      fechaFin: detalle.fechaFin,
      primerTiempoAusente: detalle.primerTiempoAusente ?? undefined,
      ultimoTiempoAusente: detalle.ultimoTiempoAusente ?? undefined,
      motivo: detalle.motivo,
      retornoPendienteConfirmacion: false,
      edicionOriginal: {
        fechaInicio: detalle.fechaInicio,
        fechaFin: detalle.fechaFin,
        primerTiempoAusente: detalle.primerTiempoAusente ?? undefined,
        ultimoTiempoAusente: detalle.ultimoTiempoAusente ?? undefined,
      },
    };

    iniciarEdicionAusencia(seed);
    abrirModal('ausencia');
  };

  return (
    <div className="space-y-4 pb-24">
      {(mostrarBadgeFetching || hayPendientes) ? (
        <div className="flex items-center justify-end gap-2">
          {mostrarBadgeFetching ? <Badge variant="secondary">Actualizando</Badge> : null}
          {hayPendientes ? <Badge variant="outline">Pendientes offline</Badge> : null}
        </div>
      ) : null}

      <div className={`transition-transform duration-200 ease-in-out ${headerHidden ? '-translate-y-12' : 'translate-y-0'}`}>
        <div className="flex items-center gap-3 mb-2">
          <Pizza className="h-6 w-6 text-muted-foreground" />
          <h2 className="text-xl font-semibold">Elegir Horarios de Comida</h2>
        </div>

        <div className="mb-2">
          <BarraSuplantacion residenciaId={residenciaId} />
        </div>
      </div>

      <CarruselCalendario
        dias={dias}
        actividades={actividades}
        fechaEnFoco={fechaEnFoco}
        onSeleccionarFecha={setFechaEnFoco}
        hideMonth={headerHidden}
      />

      <BannerNovedades hayPendientesSync={hayPendientes} visible={mostrarBannerNovedades} />

      <CarruselDiario
        dias={dias}
        fechaEnFoco={fechaEnFoco}
        onCambiarFecha={setFechaEnFoco}
        onGuardarExcepcion={guardarExcepcion}
        onEditarAusencia={abrirEdicionAusenciaDesdeTarjeta}
      />

      <BotonAccionRadial
        onNuevaExcepcion={() => abrirModal('excepcion')}
        onNuevaAusencia={() => {
          limpiarEdicionAusencia();
          abrirModal('ausencia');
        }}
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
          if (!open) {
            limpiarEdicionAusencia();
            cerrarModal();
          }
        }}
        data={data}
        fechaPreferida={diaEnFoco?.fecha ?? fechaEnFoco}
        edicion={ausenciaEnEdicion}
        onSubmit={async (payload) => {
          await guardarAusenciaLote(payload);
          limpiarEdicionAusencia();
        }}
      />
    </div>
  );
}
