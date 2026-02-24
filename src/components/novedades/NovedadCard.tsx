"use client";

import { NovedadOperativa } from 'shared/schemas/novedades';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface NovedadCardProps {
  novedad: NovedadOperativa;
  rolContext: 'residente' | 'gerencia';
  onEdit?: (novedad: NovedadOperativa) => void;
  onDelete?: (novedadId: string) => void;
  onArchive?: (novedadId: string) => void;
}

const estadoColors: { [key: string]: string } = {
  pendiente: 'bg-yellow-500 hover:bg-yellow-600',
  aprobado: 'bg-green-500 hover:bg-green-600',
  rechazado: 'bg-red-500 hover:bg-red-600',
  consolidado: 'bg-blue-500 hover:bg-blue-600',
  archivado: 'bg-gray-500 hover:bg-gray-600',
};

export function NovedadCard({
  novedad,
  rolContext,
  onEdit,
  onDelete,
  onArchive,
}: NovedadCardProps) {
  const { id, texto, categoria, estado, timestampCreacion } = novedad;

  const isResidente = rolContext === 'residente';
  const isGerencia = rolContext === 'gerencia';
  const isPendiente = estado === 'pendiente';
  const isAprobado = estado === 'aprobado';

  const canEditOrDelete = isPendiente || (isGerencia && isAprobado);
  const showEstadoBadge = (isResidente && !isPendiente) || isGerencia;

  const relativeDate = formatDistanceToNow(new Date(timestampCreacion), {
    addSuffix: true,
    locale: es,
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-start">
          <CardTitle className="text-lg font-semibold capitalize">{categoria}</CardTitle>
          {showEstadoBadge && (
            <Badge className={cn("text-white", estadoColors[estado])}>
              {estado.charAt(0).toUpperCase() + estado.slice(1)}
            </Badge>
          )}
        </div>
        <p className="text-sm text-gray-500">{relativeDate}</p>
      </CardHeader>
      <CardContent>
        <p className="text-gray-700">{texto}</p>
      </CardContent>
      <CardFooter className="flex justify-end gap-2">
        {isResidente && (
          <>
            <Button
              variant="outline"
              size="sm"
              disabled={!isPendiente}
              onClick={() => onEdit?.(novedad)}
            >
              Editar
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={!isPendiente}
              onClick={() => onDelete?.(id)}
            >
              Eliminar
            </Button>
          </>
        )}
        {isGerencia && (
          <>
            {(isPendiente || isAprobado) && (
              <>
                 <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onEdit?.(novedad)}
                >
                    Editar
                </Button>
                <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => onDelete?.(id)}
                >
                    Eliminar
                </Button>
              </>
            )}
             <Button
                variant="secondary"
                size="sm"
                onClick={() => onArchive?.(id)}
             >
                Archivar
            </Button>
          </>
        )}
      </CardFooter>
    </Card>
  );
}
