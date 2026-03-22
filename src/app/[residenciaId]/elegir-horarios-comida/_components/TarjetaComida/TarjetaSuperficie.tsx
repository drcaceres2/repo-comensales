'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Lock } from 'lucide-react';
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

function labelOrigen(origen: TarjetaComidaUI['origen']) {
  switch (origen) {
    case 'actividad':
      return 'Actividad';
    case 'ausencia':
      return 'Ausencia';
    case 'excepcion':
      return 'Excepcion';
    case 'semanario':
      return 'Semanario';
    case 'sistema':
      return 'Sistema';
    default:
      return null;
  }
}

export function TarjetaSuperficie({ tarjeta }: Props) {
  const bloqueada = tarjeta.estadoInteraccion !== 'MUTABLE';
  const origenLabel = labelOrigen(tarjeta.origen);
  const nombreSuperficie = tarjeta.origenResolucion === 'CAPA2_AUSENCIA'
    ? 'Ausente'
    : tarjeta.resultadoEfectivo.nombre;

  return (
    <Card className={`transition-colors ${bloqueada ? 'bg-muted/50' : 'hover:bg-muted/40'}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className={`text-base ${bloqueada ? 'text-muted-foreground' : ''}`}>{tarjeta.grupoComida.nombre}</CardTitle>
          <div className="flex items-center gap-2">
            {origenLabel ? (
              <Badge variant="outline">{origenLabel}</Badge>
            ) : null}
            <Badge variant={bloqueada ? 'secondary' : 'default'}>{labelEstado(tarjeta.estadoInteraccion)}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-center justify-between">
          <p className={`text-sm ${bloqueada ? 'text-muted-foreground' : 'text-muted-foreground'}`}>Eleccion efectiva</p>
          {bloqueada ? <Lock className="h-4 w-4 text-muted-foreground" /> : null}
        </div>

        <p className={`text-sm font-medium ${bloqueada ? 'text-muted-foreground' : ''}`}>{nombreSuperficie}</p>

      </CardContent>
    </Card>
  );
}
