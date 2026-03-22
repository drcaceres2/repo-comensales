'use client';

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

type OpcionAlternativa = {
  configuracionAlternativaId: string;
  nombre: string;
  tipo: string;
  requiereAprobacion?: boolean;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tiempoNombre: string;
  opciones: OpcionAlternativa[];
  seleccionActual?: string;
  readOnly: boolean;
  onSeleccionar: (configuracionAlternativaId: string) => void;
  hiddenCount?: number;
};

export function AlternativasBottomSheet({
  open,
  onOpenChange,
  tiempoNombre,
  opciones,
  seleccionActual,
  readOnly,
  onSeleccionar,
  hiddenCount,
}: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="space-y-4">
        <SheetHeader>
          <SheetTitle>{tiempoNombre}</SheetTitle>
          <SheetDescription>
            {readOnly
              ? 'Vista en solo lectura para este usuario objetivo.'
              : 'Selecciona una alternativa. El panel se cerrará automáticamente.'}
          </SheetDescription>
        </SheetHeader>

        {hiddenCount && hiddenCount > 0 ? (
          <div className="px-4">
            <p className="text-sm text-destructive">{hiddenCount} alternativa(s) ocultas requieren aprobación</p>
          </div>
        ) : null}

        <div className="space-y-2">
          {opciones.filter(o => !o.requiereAprobacion).length === 0 ? (
            <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
              No hay alternativas configuradas para este tiempo.
            </p>
          ) : (
            opciones
              .filter((o) => !o.requiereAprobacion)
              .map((opcion) => {
                const activa = opcion.configuracionAlternativaId === seleccionActual;
                return (
                  <Button
                    key={opcion.configuracionAlternativaId}
                    variant={activa ? 'default' : 'outline'}
                    className="h-auto w-full justify-start py-3 text-left"
                    disabled={readOnly}
                    onClick={() => {
                      onSeleccionar(opcion.configuracionAlternativaId);
                      onOpenChange(false);
                    }}
                  >
                    <span className="flex flex-col items-start">
                      <span className="font-medium">{opcion.nombre}</span>
                      <span className="text-xs opacity-80">{opcion.tipo}</span>
                    </span>
                  </Button>
                );
              })
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
