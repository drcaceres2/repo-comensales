'use client';

import { RefObject, useEffect, useRef } from 'react';
import { MapaAbreviaturaDiaDeLaSemana } from 'shared/schemas/fechas';
import { TiempoComidaCard } from './TiempoComidaCard';

type TiempoRender = {
  tiempoId: string;
  nombreTiempo: string;
  nombreGrupo: string;
  nombreAlternativa: string | null;
};

type DiaRender = {
  key: string;
  label: string;
  tiempos: TiempoRender[];
};

type Props = {
  dias: DiaRender[];
  readOnly: boolean;
  // @ts-ignore
  onSeleccionarTiempo: (tiempoId: string) => void;
  onDiaActivo?: (diaKey: string) => void;
  scrollContainerRef?: RefObject<HTMLDivElement | null>;
};

const SCROLL_OFFSET = 8;

export function AgendaVertical({
  dias,
  readOnly,
  onSeleccionarTiempo,
  onDiaActivo,
  scrollContainerRef,
}: Props) {
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    if (!onDiaActivo || dias.length === 0) return;

    const updateActiveDia = () => {
      const scrollContainer = scrollContainerRef?.current;
      if (!scrollContainer) {
        onDiaActivo(dias[0].key);
        return;
      }

      const containerTop = scrollContainer.getBoundingClientRect().top;
      let active = dias[0].key;

      for (const dia of dias) {
        const el = sectionRefs.current[dia.key];
        if (el && el.getBoundingClientRect().top - containerTop <= SCROLL_OFFSET) {
          active = dia.key;
        }
      }

      onDiaActivo(active);
    };

    const scrollContainer = scrollContainerRef?.current;
    updateActiveDia();

    if (!scrollContainer) {
      return;
    }

    scrollContainer.addEventListener('scroll', updateActiveDia, { passive: true });
    return () => scrollContainer.removeEventListener('scroll', updateActiveDia);
  }, [dias, onDiaActivo, scrollContainerRef]);

  return (
    <div className="space-y-4">
      {dias.map((dia) => (
        <section
          key={dia.key}
          ref={(el) => { sectionRefs.current[dia.key] = el; }}
          className="grid grid-cols-[2rem,1fr] items-start gap-3"
        >
          <div className="sticky top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full border bg-background text-sm font-semibold text-muted-foreground">
            {MapaAbreviaturaDiaDeLaSemana[dia.key as keyof typeof MapaAbreviaturaDiaDeLaSemana]}
          </div>

          <div className="min-w-0 space-y-2">
            {dia.tiempos.length === 0 ? (
              <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">Sin tiempos activos.</p>
            ) : (
              dia.tiempos.map((tiempo) => (
                <TiempoComidaCard
                  key={tiempo.tiempoId}
                  nombreTiempo={tiempo.nombreTiempo}
                  nombreGrupo={tiempo.nombreGrupo}
                  nombreAlternativa={tiempo.nombreAlternativa}
                  disabled={readOnly}
                  onClick={() => onSeleccionarTiempo(tiempo.tiempoId)}
                />
              ))
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
