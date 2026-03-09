"use client";

import { TableCell, TableRow } from "@/components/ui/table";

export interface UsuarioMatrizRow {
  usuarioId: string;
  nombreCompleto: string;
  roles: string[];
  grupoContableId: string | null;
  grupoRestrictivoId: string | null;
  otrosGruposIds: string[];
}

interface GrupoOption {
  id: string;
  nombre: string;
}

interface FilaUsuarioProps {
  row: UsuarioMatrizRow;
  gruposContables: GrupoOption[];
  gruposRestrictivos: GrupoOption[];
  gruposAnaliticos: GrupoOption[];
  disabled?: boolean;
  onChangeContable: (usuarioId: string, value: string | null) => void;
  onChangeRestrictivo: (usuarioId: string, value: string | null) => void;
  onChangeAnaliticos: (usuarioId: string, values: string[]) => void;
}

export function FilaUsuario({
  row,
  gruposContables,
  gruposRestrictivos,
  gruposAnaliticos,
  disabled = false,
  onChangeContable,
  onChangeRestrictivo,
  onChangeAnaliticos,
}: FilaUsuarioProps) {
  return (
    <TableRow className="h-10">
      <TableCell className="py-1">
        <div className="font-medium leading-tight">{row.nombreCompleto}</div>
        <div className="text-xs text-muted-foreground">{row.roles.join(", ")}</div>
      </TableCell>

      <TableCell className="py-1">
        <select
          aria-label={`Grupo contable de ${row.nombreCompleto}`}
          className="h-8 w-full rounded border px-2 text-sm"
          value={row.grupoContableId ?? ""}
          onChange={(event) => onChangeContable(row.usuarioId, event.target.value || null)}
          disabled={disabled}
        >
          <option value="">Sin grupo</option>
          {gruposContables.map((grupo) => (
            <option key={grupo.id} value={grupo.id}>
              {grupo.nombre}
            </option>
          ))}
        </select>
      </TableCell>

      <TableCell className="py-1">
        <select
          aria-label={`Grupo restrictivo de ${row.nombreCompleto}`}
          className="h-8 w-full rounded border px-2 text-sm"
          value={row.grupoRestrictivoId ?? ""}
          onChange={(event) => onChangeRestrictivo(row.usuarioId, event.target.value || null)}
          disabled={disabled}
        >
          <option value="">Sin restricciones</option>
          {gruposRestrictivos.map((grupo) => (
            <option key={grupo.id} value={grupo.id}>
              {grupo.nombre}
            </option>
          ))}
        </select>
      </TableCell>

      <TableCell className="py-1">
        <select
          aria-label={`Otros grupos de ${row.nombreCompleto}`}
          className="h-20 w-full rounded border px-2 text-sm"
          multiple
          value={row.otrosGruposIds}
          onChange={(event) => {
            const selectedIds = Array.from(event.target.selectedOptions).map((opt) => opt.value);
            onChangeAnaliticos(row.usuarioId, selectedIds);
          }}
          disabled={disabled}
        >
          {gruposAnaliticos.map((grupo) => (
            <option key={grupo.id} value={grupo.id}>
              {grupo.nombre}
            </option>
          ))}
        </select>
      </TableCell>
    </TableRow>
  );
}
