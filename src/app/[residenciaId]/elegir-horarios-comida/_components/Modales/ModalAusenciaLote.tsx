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
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CargaHorariosUI, FormAusenciaLote } from 'shared/schemas/elecciones/ui.schema';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: CargaHorariosUI | undefined;
  fechaPreferida: string;
  edicion?: FormAusenciaLote | null;
  onSubmit: (payload: FormAusenciaLote) => Promise<unknown>;
};

const DIA_COMPLETO = '__dia_completo__';

export function ModalAusenciaLote({
  open,
  onOpenChange,
  data,
  fechaPreferida,
  edicion,
  onSubmit,
}: Props) {
  const hoy = new Date();
  const hoyIso = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
  const modoEdicion = Boolean(edicion?.edicionOriginal);

  const [fechaInicio, setFechaInicio] = useState(fechaPreferida);
  const [fechaFin, setFechaFin] = useState(fechaPreferida);
  const [primerTiempoAusente, setPrimerTiempoAusente] = useState(DIA_COMPLETO);
  const [ultimoTiempoAusente, setUltimoTiempoAusente] = useState(DIA_COMPLETO);
  const [motivo, setMotivo] = useState('');

  const fechasValidas = useMemo(() => {
    const dias = data?.dias ?? [];
    return dias
      .map((item) => item.fecha)
      .filter((item) => item >= hoyIso)
      .sort((a, b) => a.localeCompare(b));
  }, [data?.dias, hoyIso]);

  const tiemposInicio = useMemo(() => {
    const dia = data?.dias.find((item) => item.fecha === fechaInicio);
    return (dia?.tarjetas ?? []).map((item) => ({ id: item.tiempoComidaId, label: item.grupoComida.nombre }));
  }, [data?.dias, fechaInicio]);

  const tiemposFin = useMemo(() => {
    const dia = data?.dias.find((item) => item.fecha === fechaFin);
    return (dia?.tarjetas ?? []).map((item) => ({ id: item.tiempoComidaId, label: item.grupoComida.nombre }));
  }, [data?.dias, fechaFin]);

  const indiceInicio = tiemposInicio.findIndex((item) => item.id === primerTiempoAusente);
  const indiceFin = tiemposFin.findIndex((item) => item.id === ultimoTiempoAusente);

  const tiempoCruceInvalido = Boolean(
    fechaInicio === fechaFin
    && primerTiempoAusente !== DIA_COMPLETO
    && ultimoTiempoAusente !== DIA_COMPLETO
    && indiceInicio !== -1
    && indiceFin !== -1
    && indiceInicio > indiceFin
  );

  const rangoInvalido = Boolean(fechaInicio && fechaFin && fechaFin < fechaInicio);

  useEffect(() => {
    if (!open) {
      return;
    }

    if (edicion) {
      setFechaInicio(edicion.fechaInicio);
      setFechaFin(edicion.fechaFin);
      setPrimerTiempoAusente(edicion.primerTiempoAusente ?? DIA_COMPLETO);
      setUltimoTiempoAusente(edicion.ultimoTiempoAusente ?? DIA_COMPLETO);
      setMotivo(edicion.motivo ?? '');
      return;
    }

    const fechaBase = fechaPreferida >= hoyIso
      ? fechaPreferida
      : (fechasValidas[0] ?? hoyIso);

    setFechaInicio(fechaBase);
    setFechaFin(fechaBase);
    setPrimerTiempoAusente(DIA_COMPLETO);
    setUltimoTiempoAusente(DIA_COMPLETO);
    setMotivo('');
  }, [edicion, fechaPreferida, fechasValidas, hoyIso, open]);

  useEffect(() => {
    if (primerTiempoAusente !== DIA_COMPLETO && !tiemposInicio.some((item) => item.id === primerTiempoAusente)) {
      setPrimerTiempoAusente(DIA_COMPLETO);
    }
  }, [primerTiempoAusente, tiemposInicio]);

  useEffect(() => {
    if (ultimoTiempoAusente !== DIA_COMPLETO && !tiemposFin.some((item) => item.id === ultimoTiempoAusente)) {
      setUltimoTiempoAusente(DIA_COMPLETO);
    }
  }, [tiemposFin, ultimoTiempoAusente]);

  const enviar = async () => {
    if (!fechaInicio || !fechaFin || rangoInvalido || tiempoCruceInvalido) {
      return;
    }

    await onSubmit({
      fechaInicio,
      fechaFin,
      primerTiempoAusente: primerTiempoAusente === DIA_COMPLETO ? undefined : primerTiempoAusente,
      ultimoTiempoAusente: ultimoTiempoAusente === DIA_COMPLETO ? undefined : ultimoTiempoAusente,
      motivo: motivo.trim() || undefined,
      retornoPendienteConfirmacion: false,
      edicionOriginal: edicion?.edicionOriginal,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent description="Formulario de registro de ausencia por rango de fechas">
        <DialogHeader>
          <DialogTitle>{modoEdicion ? 'Editar ausencia' : 'Nueva ausencia'}</DialogTitle>
          <DialogDescription>
            {modoEdicion ? 'Ajusta el rango o motivo de la ausencia activa.' : 'Registra una ausencia por rango de fechas.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-sm font-medium">Fecha inicio</label>
            <Select value={fechaInicio} onValueChange={setFechaInicio}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona fecha" />
              </SelectTrigger>
              <SelectContent>
                {fechasValidas.map((fechaItem) => (
                  <SelectItem key={fechaItem} value={fechaItem}>{fechaItem}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Desde tiempo de comida (opcional)</label>
            <Select value={primerTiempoAusente} onValueChange={setPrimerTiempoAusente}>
              <SelectTrigger>
                <SelectValue placeholder="Día completo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={DIA_COMPLETO}>Día completo</SelectItem>
                {tiemposInicio.map((item) => (
                  <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Fecha fin</label>
            <Select value={fechaFin} onValueChange={setFechaFin}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona fecha" />
              </SelectTrigger>
              <SelectContent>
                {fechasValidas.map((fechaItem) => (
                  <SelectItem key={fechaItem} value={fechaItem}>{fechaItem}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {rangoInvalido ? (
              <p className="text-xs text-destructive">La fecha fin no puede ser menor a la fecha inicio.</p>
            ) : null}
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Hasta tiempo de comida (opcional)</label>
            <Select value={ultimoTiempoAusente} onValueChange={setUltimoTiempoAusente}>
              <SelectTrigger>
                <SelectValue placeholder="Día completo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={DIA_COMPLETO}>Día completo</SelectItem>
                {tiemposFin.map((item) => (
                  <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {tiempoCruceInvalido ? (
              <p className="text-xs text-destructive">El tiempo final no puede ser anterior al inicial en el mismo día.</p>
            ) : null}
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Motivo (opcional)</label>
            <Input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej: Viaje familiar"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={enviar} disabled={!fechaInicio || !fechaFin || rangoInvalido || tiempoCruceInvalido}>
            {modoEdicion ? 'Guardar cambios' : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
