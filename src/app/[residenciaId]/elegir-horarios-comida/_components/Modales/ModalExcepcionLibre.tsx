'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CargaHorariosUI, FormExcepcionLibre } from 'shared/schemas/elecciones/ui.schema';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: CargaHorariosUI | undefined;
  fechaPreferida: string;
  onSubmit: (payload: FormExcepcionLibre) => Promise<unknown>;
};

export function ModalExcepcionLibre({ open, onOpenChange, data, fechaPreferida, onSubmit }: Props) {
  const hoy = new Date();
  const hoyIso = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;

  const [fecha, setFecha] = useState(fechaPreferida);
  const [tiempoComidaId, setTiempoComidaId] = useState('');
  const [configuracionAlternativaId, setConfiguracionAlternativaId] = useState('');

  const fechasValidas = useMemo(() => {
    const dias = data?.dias ?? [];
    return dias
      .map((item) => item.fecha)
      .filter((item) => item >= hoyIso)
      .sort((a, b) => a.localeCompare(b));
  }, [data?.dias, hoyIso]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const siguienteFecha = fechaPreferida >= hoyIso
      ? fechaPreferida
      : (fechasValidas[0] ?? hoyIso);

    setFecha(siguienteFecha);
  }, [fechaPreferida, fechasValidas, hoyIso, open]);

  const dia = useMemo(
    () => data?.dias.find((item) => item.fecha === fecha),
    [data?.dias, fecha]
  );

  const tiemposDisponibles = dia?.tarjetas ?? [];

  useEffect(() => {
    if (tiemposDisponibles.length === 0) {
      setTiempoComidaId('');
      return;
    }

    const stillExists = tiemposDisponibles.some((item) => item.tiempoComidaId === tiempoComidaId);
    if (!stillExists) {
      setTiempoComidaId(tiemposDisponibles[0].tiempoComidaId);
    }
  }, [tiempoComidaId, tiemposDisponibles]);

  const tarjeta = useMemo(
    () => dia?.tarjetas.find((item) => item.tiempoComidaId === tiempoComidaId),
    [dia, tiempoComidaId]
  );

  const opcionesAlternativa = useMemo(() => {
    if (!tarjeta) {
      return [];
    }

    if (tarjeta.detallesDrawer.opciones && tarjeta.detallesDrawer.opciones.length > 0) {
      return tarjeta.detallesDrawer.opciones;
    }

    return [
      {
        configuracionAlternativaId: tarjeta.resultadoEfectivo.configuracionAlternativaId,
        nombre: tarjeta.resultadoEfectivo.nombre,
        tipo: tarjeta.resultadoEfectivo.tipo,
        esAlternativaAlterada: false,
        disponibleParaElegir: true,
        requiereAprobacion: false,
      },
    ];
  }, [tarjeta]);

  useEffect(() => {
    if (!tarjeta) {
      setConfiguracionAlternativaId('');
      return;
    }

    const exists = opcionesAlternativa.some((item) => item.configuracionAlternativaId === configuracionAlternativaId);
    if (!exists) {
      setConfiguracionAlternativaId(opcionesAlternativa[0]?.configuracionAlternativaId ?? '');
    }
  }, [configuracionAlternativaId, opcionesAlternativa, tarjeta]);

  const enviar = async () => {
    if (!fecha || !tiempoComidaId || !configuracionAlternativaId) {
      return;
    }

    await onSubmit({
      fecha,
      tiempoComidaId,
      configuracionAlternativaId,
      esAlternativaAlterada: false,
      contingenciaConfigAlternativaId: tarjeta?.resultadoEfectivo.configuracionAlternativaId,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva excepcion</DialogTitle>
          <DialogDescription>Selecciona fecha, tiempo de comida y alternativa.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-medium">Fecha</p>
            <Select value={fecha} onValueChange={setFecha}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona fecha" />
              </SelectTrigger>
              <SelectContent>
                {fechasValidas.map((fechaItem) => (
                  <SelectItem key={fechaItem} value={fechaItem}>
                    {fechaItem}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Tiempo de comida</p>
            <Select value={tiempoComidaId} onValueChange={setTiempoComidaId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona tiempo de comida" />
              </SelectTrigger>
              <SelectContent>
                {tiemposDisponibles.map((tarjetaItem) => (
                  <SelectItem key={tarjetaItem.tiempoComidaId} value={tarjetaItem.tiempoComidaId}>
                    {tarjetaItem.grupoComida.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {tiemposDisponibles.length === 0 ? (
              <p className="text-xs text-muted-foreground">No hay tiempos de comida disponibles para esta fecha.</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Alternativa</p>
            <Select value={configuracionAlternativaId} onValueChange={setConfiguracionAlternativaId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona alternativa" />
              </SelectTrigger>
              <SelectContent>
                {opcionesAlternativa.map((op) => (
                  <SelectItem key={op.configuracionAlternativaId} value={op.configuracionAlternativaId}>
                    {op.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={enviar} disabled={!fecha || !tiempoComidaId || !configuracionAlternativaId}>
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
