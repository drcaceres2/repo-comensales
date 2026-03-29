"use client";

import { NovedadOperativa } from 'shared/schemas/novedades';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface NovedadCardProps {
  novedad: NovedadOperativaInterna;
  rolContext?: 'residente';
  onEdit?: (novedad: NovedadOperativaInterna) => void;
  onDelete?: (novedadId: string) => void;
}

type NovedadOperativaInterna = Extract<NovedadOperativa, { origen: 'interno' }>;

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
}: NovedadCardProps) {
  const { id, texto, categoria, estado, timestampCreacion } = novedad;

  const isPendiente = estado === 'pendiente';
  const showEstadoBadge = !isPendiente;

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
      </CardFooter>
    </Card>
  );
}

