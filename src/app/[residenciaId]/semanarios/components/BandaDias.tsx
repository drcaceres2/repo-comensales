'use client';

import { ArregloDiaDeLaSemana, MapaDiaDeLaSemana, MapaAbreviaturaDiaDeLaSemana } from 'shared/schemas/fechas';

type Props = {
  diaActivo: string;
};

export function BandaDias({ diaActivo }: Props) {
  return (
    <div className="-mx-4 flex shrink-0 border-b bg-background/95 backdrop-blur md:-mx-6">
      {ArregloDiaDeLaSemana.map((dia) => {
        const activo = dia === diaActivo;
        return (
          <div
            key={dia}
            aria-current={activo ? 'date' : undefined}
            className={`flex flex-1 items-center justify-center py-2 text-xs font-medium transition-all duration-200 ${
              activo
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground'
            }`}
          >
            {activo ? MapaDiaDeLaSemana[dia] : MapaAbreviaturaDiaDeLaSemana[dia]}
          </div>
        );
      })}
    </div>
  );
}
