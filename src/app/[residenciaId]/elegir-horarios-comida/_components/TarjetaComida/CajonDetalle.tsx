'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TarjetaComidaUI } from 'shared/schemas/elecciones/ui.schema';
import { FormExcepcionLibre } from 'shared/schemas/elecciones/ui.schema';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fecha: string;
  tarjeta: TarjetaComidaUI;
  onGuardarExcepcion: (payload: FormExcepcionLibre) => Promise<unknown>;
};

export function CajonDetalle({
  open,
  onOpenChange,
  fecha,
  tarjeta,
  onGuardarExcepcion,
}: Props) {
  const primeraOpcion = tarjeta.detallesDrawer.opciones?.[0]?.configuracionAlternativaId
    ?? tarjeta.resultadoEfectivo.configuracionAlternativaId;

  const [alternativaId, setAlternativaId] = useState(primeraOpcion);

  const opcionSeleccionada = useMemo(
    () => tarjeta.detallesDrawer.opciones?.find((op) => op.configuracionAlternativaId === alternativaId),
    [alternativaId, tarjeta.detallesDrawer.opciones]
  );

  const esMutable = tarjeta.estadoInteraccion === 'MUTABLE';

  const guardar = async () => {
    await onGuardarExcepcion({
      fecha,
      tiempoComidaId: tarjeta.tiempoComidaId,
      configuracionAlternativaId: alternativaId,
      esAlternativaAlterada: Boolean(opcionSeleccionada?.esAlternativaAlterada),
      contingenciaConfigAlternativaId: tarjeta.resultadoEfectivo.configuracionAlternativaId,
    });
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85vh] rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>{tarjeta.grupoComida.nombre}</SheetTitle>
          <SheetDescription>
            {tarjeta.detallesDrawer.mensajeFormativo ?? 'Revisa y confirma la eleccion para este tiempo de comida.'}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          <div className="rounded-lg border p-3">
            <p className="text-xs uppercase text-muted-foreground">Resultado efectivo</p>
            <p className="mt-1 text-sm font-medium">{tarjeta.resultadoEfectivo.nombre}</p>
          </div>

          {esMutable ? (
            <>
              <div className="space-y-2">
                <p className="text-sm font-medium">Alternativa</p>
                <Select value={alternativaId} onValueChange={setAlternativaId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona una alternativa" />
                  </SelectTrigger>
                  <SelectContent>
                    {(tarjeta.detallesDrawer.opciones ?? []).map((opcion) => (
                      <SelectItem
                        key={opcion.configuracionAlternativaId}
                        value={opcion.configuracionAlternativaId}
                        disabled={!opcion.disponibleParaElegir}
                      >
                        {opcion.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button className="w-full" onClick={guardar} disabled={!alternativaId}>
                Guardar cambios
              </Button>
            </>
          ) : (
            <div className="rounded-lg border bg-muted/50 p-3 text-sm text-muted-foreground">
              Esta tarjeta no permite cambios en este momento.
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
