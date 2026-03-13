'use client';

import { useEffect, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { FormExcepcionLibre, HorarioDiaUI } from 'shared/schemas/elecciones/ui.schema';
import { DiaHorario } from './DiaHorario';

type Props = {
  dias: HorarioDiaUI[];
  fechaEnFoco: string;
  onCambiarFecha: (fecha: string) => void;
  onGuardarExcepcion: (payload: FormExcepcionLibre) => Promise<unknown>;
};

const STICKY_CENTER_RATIO = 0.18;
const RELEASE_CENTER_RATIO = 0.3;

function buildDistanceMap(
  dias: HorarioDiaUI[],
  itemRefs: Record<string, HTMLDivElement | null>,
  centerX: number,
  containerWidth: number
) {
  const next: Record<string, number> = {};
  const normalizer = Math.max(containerWidth * 0.42, 1);

  for (const dia of dias) {
    const element = itemRefs[dia.fecha];
    if (!element) {
      next[dia.fecha] = 10;
      continue;
    }

    const rect = element.getBoundingClientRect();
    const itemCenter = rect.left + rect.width / 2;
    next[dia.fecha] = Math.abs(itemCenter - centerX) / normalizer;
  }

  return next;
}

function visualClasses(distance: number, isFocused: boolean) {
  if (distance <= 0.12) {
    return cn('translate-y-0 scale-100 opacity-100', isFocused && 'shadow-md');
  }

  if (distance <= 0.28) {
    return 'translate-y-px scale-[0.99] opacity-95 shadow-md';
  }

  if (distance <= 0.44) {
    return 'translate-y-0.5 scale-[0.98] opacity-92';
  }

  if (distance <= 0.62) {
    return 'translate-y-1 scale-[0.97] opacity-88';
  }

  if (distance <= 0.84) {
    return 'translate-y-2 scale-[0.955] opacity-84';
  }

  if (distance <= 1.1) {
    return 'translate-y-3 scale-[0.94] opacity-80';
  }

  if (distance <= 1.35) {
    return 'translate-y-4 scale-[0.92] opacity-70';
  }

  return 'translate-y-4 scale-[0.9] opacity-60';
}

export function CarruselDiario({ dias, fechaEnFoco, onCambiarFecha, onGuardarExcepcion }: Props) {
  const diaActual = dias.find((dia) => dia.fecha === fechaEnFoco);
  const currentIndex = dias.findIndex((dia) => dia.fecha === fechaEnFoco);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const settleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [distanceMap, setDistanceMap] = useState<Record<string, number>>({});

  const updateVisualState = () => {
    const container = scrollRef.current;
    if (!container) {
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const centerX = containerRect.left + containerRect.width / 2;
    setDistanceMap(buildDistanceMap(dias, itemRefs.current, centerX, containerRect.width));
  };

  useEffect(() => {
    const node = scrollRef.current;
    const currentNode = diaActual ? itemRefs.current[diaActual.fecha] : null;
    if (!node || !currentNode) {
      return;
    }

    currentNode.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    updateVisualState();
  }, [diaActual]);

  useEffect(() => {
    return () => {
      if (settleTimeoutRef.current) {
        clearTimeout(settleTimeoutRef.current);
      }

      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  const handleScroll = () => {
    if (!scrollRef.current) {
      return;
    }

    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }

    rafRef.current = requestAnimationFrame(() => {
      updateVisualState();
    });

    if (settleTimeoutRef.current) {
      clearTimeout(settleTimeoutRef.current);
    }

    settleTimeoutRef.current = setTimeout(() => {
      const container = scrollRef.current;
      if (!container) {
        return;
      }

      const containerRect = container.getBoundingClientRect();
      const centerX = containerRect.left + containerRect.width / 2;

      let nearestFecha = fechaEnFoco;
      let nearestDistance = Number.MAX_SAFE_INTEGER;

      for (const dia of dias) {
        const element = itemRefs.current[dia.fecha];
        if (!element) {
          continue;
        }

        const rect = element.getBoundingClientRect();
        const itemCenter = rect.left + rect.width / 2;
        const distance = Math.abs(itemCenter - centerX);

        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestFecha = dia.fecha;
        }
      }

      if (nearestFecha !== fechaEnFoco) {
        onCambiarFecha(nearestFecha);
      }
    }, 120);
  };

  if (!diaActual) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
        Selecciona un dia para visualizar los horarios.
      </div>
    );
  }

  return (
    <section>
      <div
        ref={scrollRef}
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto px-[8%] pb-2 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onScroll={handleScroll}
      >
        {dias.map((dia, index) => {
          const fallbackDistance = Math.abs(index - currentIndex);
          const distance = distanceMap[dia.fecha] ?? fallbackDistance;
          const isFocused = fallbackDistance === 0;

          return (
            <div
              key={dia.fecha}
              ref={(node) => {
                itemRefs.current[dia.fecha] = node;
              }}
              className="basis-[84%] shrink-0 snap-center"
            >
              <Card
                className={cn(
                  'border-slate-200/80 bg-slate-50/85 shadow-sm dark:border-slate-800 dark:bg-slate-900/40',
                  'transition-transform duration-150 ease-out',
                  visualClasses(distance, isFocused)
                )}
              >
                <CardContent className="p-3 md:p-4">
                  <DiaHorario dia={dia} onGuardarExcepcion={onGuardarExcepcion} />
                </CardContent>
              </Card>
            </div>
          );
        })}
      </div>
    </section>
  );
}
