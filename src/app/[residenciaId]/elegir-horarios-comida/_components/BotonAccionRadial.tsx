'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { NotebookPen, Plus, UserX, UtensilsCrossed } from 'lucide-react';
import { useToast } from '@/hooks/useToast';

type Props = {
  onNuevaExcepcion: () => void;
  onNuevaAusencia: () => void;
};

type Accion = {
  id: string;
  label: string;
  Icon: React.ElementType;
  openTranslate: string;
};

const ACCIONES: Accion[] = [
  {
    id: 'excepcion',
    label: 'Excepción',
    Icon: UtensilsCrossed,
    // sale hacia la izquierda
    openTranslate: '-translate-x-[5.5rem] translate-y-0',
  },
  {
    id: 'ausencia',
    label: 'Ausencia',
    Icon: UserX,
    // sale en diagonal izquierda-arriba
    openTranslate: '-translate-x-[3.875rem] -translate-y-[3.875rem]',
  },
  {
    id: 'novedad',
    label: 'Novedad',
    Icon: NotebookPen,
    // sale hacia arriba
    openTranslate: 'translate-x-0 -translate-y-[5.5rem]',
  },
];

export function BotonAccionRadial({ onNuevaExcepcion, onNuevaAusencia }: Props) {
  const [open, setOpen] = useState(false);
  const [mostrarEtiquetas, setMostrarEtiquetas] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!open) {
      setMostrarEtiquetas(false);
      return;
    }

    setMostrarEtiquetas(true);
    const timeoutId = window.setTimeout(() => {
      setMostrarEtiquetas(false);
    }, 1200);

    return () => window.clearTimeout(timeoutId);
  }, [open]);

  const handleAccion = (id: string) => {
    if (id === 'excepcion') {
      onNuevaExcepcion();
    } else if (id === 'ausencia') {
      onNuevaAusencia();
    } else {
      toast({
        title: 'Novedades',
        description: 'La accion de novedad operativa queda como placeholder en este corte.',
      });
    }
    setOpen(false);
  };

  return (
    /*
     * El contenedor fixed tiene exactamente el tamaño del FAB (h-14 w-14 = 56px).
     * Los botones de acción usan absolute inset-0 para surgir desde ese mismo origen
     * y se trasladan hacia afuera con CSS transform.
     * Esto garantiza que right-6 sea el borde derecho real del FAB.
     */
    <div className="fixed bottom-[4.5rem] right-6 z-20">
      <div className="relative h-14 w-14">
        {ACCIONES.map(({ id, label, Icon, openTranslate }) => (
          <div
            key={id}
            className={`absolute inset-0 transition-all duration-200 ease-out ${
              open
                ? `${openTranslate} opacity-100`
                : 'translate-x-0 translate-y-0 opacity-0 pointer-events-none'
            }`}
          >
            <div className="relative h-14 w-14">
              <span
                className={`pointer-events-none absolute right-full top-1/2 mr-2 -translate-y-1/2 whitespace-nowrap rounded-md bg-background/95 px-2 py-1 text-xs font-medium shadow transition-opacity duration-150 ${
                  mostrarEtiquetas ? 'opacity-100' : 'opacity-0'
                }`}
              >
                {label}
              </span>
              <Button
                size="icon"
                variant="secondary"
                className="h-14 w-14 rounded-full shadow-lg"
                onClick={() => handleAccion(id)}
                title={label}
              >
                <Icon size={24} strokeWidth={2} />
              </Button>
            </div>
          </div>
        ))}

        <Button
          size="icon"
          className="absolute inset-0 h-14 w-14 rounded-full shadow-lg"
          onClick={() => setOpen((v) => !v)}
          title="Abrir acciones"
        >
          <Plus
            size={24}
            strokeWidth={2}
            className={`transition-transform duration-200 ${open ? 'rotate-45' : ''}`}
          />
        </Button>
      </div>
    </div>
  );
}
