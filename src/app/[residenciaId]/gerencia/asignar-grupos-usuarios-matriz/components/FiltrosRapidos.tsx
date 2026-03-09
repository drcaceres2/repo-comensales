"use client";

import { Button } from "@/components/ui/button";

export type FiltrosRapidosState = {
  sinGrupoContable: boolean;
  conRestricciones: boolean;
};

interface FiltrosRapidosProps {
  filtros: FiltrosRapidosState;
  onChange: (next: FiltrosRapidosState) => void;
  total: number;
  visibles: number;
  disabled?: boolean;
}

export function FiltrosRapidos({
  filtros,
  onChange,
  total,
  visibles,
  disabled = false,
}: FiltrosRapidosProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant={filtros.sinGrupoContable ? "default" : "outline"}
        onClick={() => onChange({ ...filtros, sinGrupoContable: !filtros.sinGrupoContable })}
        disabled={disabled}
        className="h-8"
      >
        Sin grupo contable
      </Button>

      <Button
        type="button"
        variant={filtros.conRestricciones ? "default" : "outline"}
        onClick={() => onChange({ ...filtros, conRestricciones: !filtros.conRestricciones })}
        disabled={disabled}
        className="h-8"
      >
        Con restricciones
      </Button>

      <Button
        type="button"
        variant="ghost"
        onClick={() => onChange({ sinGrupoContable: false, conRestricciones: false })}
        disabled={disabled}
        className="h-8"
      >
        Limpiar filtros
      </Button>

      <span className="ml-auto text-xs text-muted-foreground">
        Mostrando {visibles} de {total}
      </span>
    </div>
  );
}
