'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FormExcepcionLibre, HorarioDiaUI, TarjetaComidaUI } from 'shared/schemas/elecciones/ui.schema';
import { ContenedorTarjeta } from './TarjetaComida/ContenedorTarjeta';

type Props = {
  dia: HorarioDiaUI;
  onGuardarExcepcion: (payload: FormExcepcionLibre) => Promise<unknown>;
  onEditarAusencia: (fecha: string, tarjeta: TarjetaComidaUI) => void;
};

export function DiaHorario({ dia, onGuardarExcepcion, onEditarAusencia }: Props) {
  if (dia.tarjetas.length === 0) {
    const placeholders = ['Desayuno', 'Almuerzo', 'Cena'];

    return (
      <div className="space-y-3">
        {placeholders.map((titulo) => (
          <Card key={titulo}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{titulo}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">No hay tiempos de comida seleccionados</p>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {dia.tarjetas.map((tarjeta) => (
        <ContenedorTarjeta
          key={`${dia.fecha}-${tarjeta.tiempoComidaId}`}
          fecha={dia.fecha}
          tarjeta={tarjeta}
          onGuardarExcepcion={onGuardarExcepcion}
          onEditarAusencia={onEditarAusencia}
        />
      ))}
    </div>
  );
}
