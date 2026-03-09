"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/useToast";
import {
  AsignacionMasivaUsuariosPayload,
  AsignacionUsuarioMutacion,
} from "shared/schemas/asignacionMasivaUsuarios";
import { guardarAsignacionesMasivas } from "../actions";
import { FilaUsuario, UsuarioMatrizRow } from "./FilaUsuario";
import { FiltrosRapidos, FiltrosRapidosState } from "./FiltrosRapidos";

interface GrupoOption {
  id: string;
  nombre: string;
}

interface MatrizAsignacionClientProps {
  residenciaId: string;
  initialRows: UsuarioMatrizRow[];
  gruposContables: GrupoOption[];
  gruposRestrictivos: GrupoOption[];
  gruposAnaliticos: GrupoOption[];
}

function normalizeIds(values: string[]) {
  return [...new Set(values)].sort();
}

function areRowsEqual(a: UsuarioMatrizRow, b: UsuarioMatrizRow) {
  return (
    a.grupoContableId === b.grupoContableId &&
    a.grupoRestrictivoId === b.grupoRestrictivoId &&
    JSON.stringify(normalizeIds(a.otrosGruposIds)) === JSON.stringify(normalizeIds(b.otrosGruposIds))
  );
}

function buildDirtyMutaciones(rows: UsuarioMatrizRow[], initialRows: UsuarioMatrizRow[]) {
  const initialById = new Map(initialRows.map((row) => [row.usuarioId, row]));
  const mutaciones: AsignacionUsuarioMutacion[] = [];

  for (const currentRow of rows) {
    const original = initialById.get(currentRow.usuarioId);
    if (!original) {
      continue;
    }

    if (areRowsEqual(currentRow, original)) {
      continue;
    }

    mutaciones.push({
      usuarioId: currentRow.usuarioId,
      grupoContableId: currentRow.grupoContableId,
      grupoRestrictivoId: currentRow.grupoRestrictivoId,
      otrosGruposIds: normalizeIds(currentRow.otrosGruposIds),
    });
  }

  return mutaciones;
}

export function MatrizAsignacionClient({
  residenciaId,
  initialRows,
  gruposContables,
  gruposRestrictivos,
  gruposAnaliticos,
}: MatrizAsignacionClientProps) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const [rows, setRows] = useState<UsuarioMatrizRow[]>(initialRows);
  const [initialSnapshot, setInitialSnapshot] = useState<UsuarioMatrizRow[]>(initialRows);
  const [filtros, setFiltros] = useState<FiltrosRapidosState>({
    sinGrupoContable: false,
    conRestricciones: false,
  });

  const dirtyMutaciones = useMemo(
    () => buildDirtyMutaciones(rows, initialSnapshot),
    [rows, initialSnapshot]
  );

  const visibleRows = useMemo(() => {
    return rows.filter((row) => {
      if (filtros.sinGrupoContable && row.grupoContableId) {
        return false;
      }
      if (filtros.conRestricciones && !row.grupoRestrictivoId) {
        return false;
      }
      return true;
    });
  }, [rows, filtros]);

  const updateRow = (usuarioId: string, updater: (row: UsuarioMatrizRow) => UsuarioMatrizRow) => {
    setRows((prev) => prev.map((row) => (row.usuarioId === usuarioId ? updater(row) : row)));
  };

  const handleSave = () => {
    if (dirtyMutaciones.length === 0) {
      toast({ title: "Sin cambios", description: "No hay mutaciones pendientes por guardar." });
      return;
    }

    const payload: AsignacionMasivaUsuariosPayload = {
      operacion: "ASIGNACION_MASIVA",
      mutaciones: dirtyMutaciones,
    };

    startTransition(async () => {
      const result = await guardarAsignacionesMasivas(residenciaId, payload);

      if (!result.success) {
        toast({
          title: "Error al guardar",
          description: typeof result.error === "string" ? result.error : "Validación inválida.",
          variant: "destructive",
        });
        return;
      }

      setInitialSnapshot(
        rows.map((row) => ({ ...row, otrosGruposIds: [...row.otrosGruposIds] }))
      );

      const data = result.data;
      const errores = data?.errores?.length ?? 0;
      const descripcion = `Procesados: ${data?.procesados ?? 0}. Errores: ${errores}.`;

      toast({
        title: "Asignaciones guardadas",
        description: descripcion,
        variant: errores > 0 ? "destructive" : "default",
      });
    });
  };

  const handleReset = () => {
    setRows(initialSnapshot.map((row) => ({ ...row, otrosGruposIds: [...row.otrosGruposIds] })));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={handleSave} disabled={dirtyMutaciones.length === 0 || isPending}>
          {isPending ? "Guardando..." : `Guardar Cambios (${dirtyMutaciones.length})`}
        </Button>
        <Button variant="outline" onClick={handleReset} disabled={isPending || dirtyMutaciones.length === 0}>
          Revertir cambios locales
        </Button>
      </div>

      <FiltrosRapidos
        filtros={filtros}
        onChange={setFiltros}
        total={rows.length}
        visibles={visibleRows.length}
        disabled={isPending}
      />

      <fieldset disabled={isPending} className={isPending ? "opacity-60" : ""}>
        <div className="overflow-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[260px]">Usuario</TableHead>
                <TableHead className="min-w-[220px]">Grupo Contable</TableHead>
                <TableHead className="min-w-[220px]">Grupo Restrictivo</TableHead>
                <TableHead className="min-w-[260px]">Otros Grupos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRows.map((row) => (
                <FilaUsuario
                  key={row.usuarioId}
                  row={row}
                  gruposContables={gruposContables}
                  gruposRestrictivos={gruposRestrictivos}
                  gruposAnaliticos={gruposAnaliticos}
                  disabled={isPending}
                  onChangeContable={(usuarioId, value) => {
                    updateRow(usuarioId, (current) => ({ ...current, grupoContableId: value }));
                  }}
                  onChangeRestrictivo={(usuarioId, value) => {
                    updateRow(usuarioId, (current) => ({ ...current, grupoRestrictivoId: value }));
                  }}
                  onChangeAnaliticos={(usuarioId, values) => {
                    updateRow(usuarioId, (current) => ({
                      ...current,
                      otrosGruposIds: normalizeIds(values),
                    }));
                  }}
                />
              ))}
              {visibleRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                    No hay usuarios que cumplan los filtros actuales.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </fieldset>
    </div>
  );
}
