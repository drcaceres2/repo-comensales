'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ActividadCalendarioUI, HorarioDiaUI } from 'shared/schemas/elecciones/ui.schema';

type Props = {
  dias: HorarioDiaUI[];
  actividades: ActividadCalendarioUI[];
  fechaEnFoco: string;
  onSeleccionarFecha: (fecha: string) => void;
  hideMonth?: boolean;
};

function tieneActividad(fecha: string, actividades: ActividadCalendarioUI[]) {
  return actividades.some((actividad) => fecha >= actividad.fechaInicio && fecha <= actividad.fechaFin);
}

const LETRAS_DIA: Record<number, string> = {
  0: 'D',
  1: 'L',
  2: 'M',
  3: 'M',
  4: 'J',
  5: 'V',
  6: 'S',
};

export function CarruselCalendario({ dias, actividades, fechaEnFoco, onSeleccionarFecha, hideMonth }: Props) {
  const fechaReferencia = dias.find((dia) => dia.fecha === fechaEnFoco)?.fecha ?? dias[0]?.fecha;
  const mesLabel = fechaReferencia
    ? format(new Date(`${fechaReferencia}T00:00:00`), 'MMMM yyyy', { locale: es })
    : '';

  return (
    <section>
      <div className="sticky top-10 z-30 bg-white/95 backdrop-blur-sm px-4 py-2">
        {mesLabel ? (
          <p
            className={`text-sm font-semibold capitalize text-muted-foreground transition-all duration-200 ease-in-out ${
              hideMonth ? 'opacity-0 -translate-y-2 pointer-events-none' : 'opacity-100 translate-y-0'
            }`}
          >
            {mesLabel}
          </p>
        ) : null}

        <div className="flex gap-1 overflow-x-auto pb-2">
          {dias.map((dia) => {
            const activo = dia.fecha === fechaEnFoco;
            const actividad = tieneActividad(dia.fecha, actividades);
            const fecha = new Date(`${dia.fecha}T00:00:00`);
            const letraDia = LETRAS_DIA[fecha.getDay()] ?? 'D';
            const numeroDia = format(fecha, 'd');

            return (
              <Button
                key={dia.fecha}
                type="button"
                variant="ghost"
                className={cn('h-auto min-w-12 flex-col gap-1 px-1 py-2 text-foreground shadow-none hover:bg-transparent')}
                onClick={() => onSeleccionarFecha(dia.fecha)}
              >
                <span className="text-[11px] font-medium uppercase text-muted-foreground">{letraDia}</span>
                <span
                  className={cn(
                    'flex aspect-square w-8 items-center justify-center rounded-full text-sm font-semibold leading-none',
                    activo ? 'border-2 border-blue-600 text-blue-600' : 'border-2 border-transparent'
                  )}
                >
                  {numeroDia}
                </span>
                {actividad ? <span className="h-1 w-4 rounded-full bg-blue-500" /> : <span className="h-1 w-4" />}
              </Button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
