'use client';

import { TarjetaComidaUI } from 'shared/schemas/elecciones/ui.schema';
import { useHorariosStore } from '../../_hooks/useHorariosStore';
import { FormExcepcionLibre } from 'shared/schemas/elecciones/ui.schema';
import { TarjetaSuperficie } from './TarjetaSuperficie';
import { CajonDetalle } from './CajonDetalle';

type Props = {
  fecha: string;
  tarjeta: TarjetaComidaUI;
  onGuardarExcepcion: (payload: FormExcepcionLibre) => Promise<unknown>;
};

export function ContenedorTarjeta({ fecha, tarjeta, onGuardarExcepcion }: Props) {
  const drawerAbierto = useHorariosStore((state) => state.drawerAbierto);
  const tarjetaActiva = useHorariosStore((state) => state.tarjetaActiva);
  const abrirDrawerTarjeta = useHorariosStore((state) => state.abrirDrawerTarjeta);
  const cerrarDrawer = useHorariosStore((state) => state.cerrarDrawer);

  const open =
    drawerAbierto
    && tarjetaActiva?.fecha === fecha
    && tarjetaActiva?.tiempoComidaId === tarjeta.tiempoComidaId;

  return (
    <>
      <button
        type="button"
        title={`Abrir detalle de ${tarjeta.grupoComida.nombre}`}
        className="w-full text-left"
        onClick={() => abrirDrawerTarjeta({ fecha, tiempoComidaId: tarjeta.tiempoComidaId })}
      >
        <TarjetaSuperficie tarjeta={tarjeta} />
      </button>

      {open ? (
        <CajonDetalle
          open={open}
          onOpenChange={(isOpen) => {
            if (!isOpen) {
              cerrarDrawer();
            }
          }}
          fecha={fecha}
          tarjeta={tarjeta}
          onGuardarExcepcion={onGuardarExcepcion}
        />
      ) : null}
    </>
  );
}
