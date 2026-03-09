'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Atencion } from 'shared/schemas/atenciones';
import { AtencionQuickActions } from './AtencionQuickActions';

interface AtencionesMasterListProps {
  atenciones: Atencion[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCambiarEstado: (id: string, estado: Atencion['estado']) => Promise<void>;
  quickActionsBusy: boolean;
}

const estadoBadgeClass: Record<Atencion['estado'], string> = {
  pendiente: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  aprobada: 'bg-green-50 text-green-700 border-green-200',
  rechazada: 'bg-red-50 text-red-700 border-red-200',
};

const avisoBadgeClass: Record<Atencion['avisoAdministracion'], string> = {
  no_comunicado: 'bg-slate-50 text-slate-700 border-slate-200',
  comunicado: 'bg-blue-50 text-blue-700 border-blue-200',
  cancelado: 'bg-red-50 text-red-700 border-red-200',
};

export function AtencionesMasterList({
  atenciones,
  selectedId,
  onSelect,
  onCambiarEstado,
  quickActionsBusy,
}: AtencionesMasterListProps) {
  if (atenciones.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        No hay atenciones para este filtro.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {atenciones.map((atencion) => (
        <div
          key={atencion.id}
          className={cn(
            'rounded-lg border bg-card p-4 transition-colors',
            selectedId === atencion.id ? 'border-primary bg-primary/5' : 'hover:border-primary/40',
          )}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold">{atencion.nombre}</h3>
                <Badge className={cn('capitalize border', estadoBadgeClass[atencion.estado])}>
                  {atencion.estado}
                </Badge>
                <Badge className={cn('border', avisoBadgeClass[atencion.avisoAdministracion])}>
                  {atencion.avisoAdministracion}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Fecha atencion: {atencion.fechaHoraAtencion}
              </p>
              {atencion.comentarios && (
                <p className="line-clamp-2 text-sm text-muted-foreground">{atencion.comentarios}</p>
              )}
            </div>

            <div className="flex flex-col items-start gap-2 sm:items-end">
              <AtencionQuickActions
                atencion={atencion}
                onCambiarEstado={onCambiarEstado}
                isBusy={quickActionsBusy}
              />
              <Button variant="ghost" size="sm" onClick={() => onSelect(atencion.id)}>
                Ver detalle
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
