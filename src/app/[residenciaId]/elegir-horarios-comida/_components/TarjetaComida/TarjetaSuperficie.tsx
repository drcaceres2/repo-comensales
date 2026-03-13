'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Lock, TriangleAlert } from 'lucide-react';
import { TarjetaComidaUI } from 'shared/schemas/elecciones/ui.schema';

type Props = {
  tarjeta: TarjetaComidaUI;
};

function labelEstado(estado: TarjetaComidaUI['estadoInteraccion']) {
  switch (estado) {
    case 'BLOQUEADO_AUTORIDAD':
      return 'Bloqueado por autoridad';
    case 'BLOQUEADO_RESTRICCION':
      return 'Con restriccion';
    case 'BLOQUEADO_SISTEMA':
      return 'Bloqueado por sistema';
    default:
      return 'Editable';
  }
}

export function TarjetaSuperficie({ tarjeta }: Props) {
  const bloqueada = tarjeta.estadoInteraccion !== 'MUTABLE';

  return (
    <Card className="transition-colors hover:bg-muted/40">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base">{tarjeta.grupoComida.nombre}</CardTitle>
          <Badge variant={bloqueada ? 'secondary' : 'default'}>{labelEstado(tarjeta.estadoInteraccion)}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Eleccion efectiva</p>
          {bloqueada ? <Lock className="h-4 w-4 text-muted-foreground" /> : null}
        </div>

        <p className="text-sm font-medium">{tarjeta.resultadoEfectivo.nombre}</p>

        {tarjeta.detallesDrawer.mensajeFormativo ? (
          <div className="flex items-start gap-2 rounded-md border border-amber-300/70 bg-amber-50 p-2 text-xs text-amber-800">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5" />
            <span>{tarjeta.detallesDrawer.mensajeFormativo}</span>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
