'use client';

import { ArregloDiaDeLaSemana, MapaDiaDeLaSemana, MapaAbreviaturaDiaDeLaSemana } from 'shared/schemas/fechas';

type BandaDiasProps = {
  diaActivo: string;
  onDiaClick?: (diaKey: string) => void;
};

export function BandaDias({ diaActivo, onDiaClick }: BandaDiasProps) {
  return (
    <div className="mx-4 flex shrink-0 border-b bg-background/95 backdrop-blur md:mx-6 overflow-visible">
      {ArregloDiaDeLaSemana.map((dia) => {
        const activo = dia === diaActivo;
        return (
          <button
            key={dia}
            type="button"
            aria-current={activo ? 'date' : undefined}
            onClick={() => onDiaClick?.(dia)}
            className={`flex flex-1 items-center justify-center py-2 px-2 text-xs font-medium transition-all duration-200 whitespace-nowrap ${
              activo
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground'
            }`}
          >
            {activo ? MapaDiaDeLaSemana[dia] : MapaAbreviaturaDiaDeLaSemana[dia]}
          </button>
        );
      })}
    </div>
  );
}
