'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

type Props = {
  nombreTiempo: string;
  nombreGrupo: string;
  nombreAlternativa: string | null;
  disabled?: boolean;
  onClick?: () => void;
};

export function TiempoComidaCard({
  nombreTiempo,
  nombreGrupo,
  nombreAlternativa,
  disabled = false,
  onClick,
}: Props) {
  return (
    <Card
      className={`border-zinc-200 bg-zinc-50 transition-colors dark:border-zinc-800 dark:bg-zinc-900/60 ${
        disabled ? 'opacity-80' : 'cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800/70'
      }`}
      onClick={disabled ? undefined : onClick}
      role={disabled ? undefined : 'button'}
      aria-disabled={disabled}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold leading-tight">{nombreTiempo}</p>
            <p className="text-xs text-muted-foreground">{nombreGrupo}</p>
          </div>

          {nombreAlternativa ? (
            <Badge variant="secondary">{nombreAlternativa}</Badge>
          ) : (
            <Badge variant="outline">No configurado</Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
