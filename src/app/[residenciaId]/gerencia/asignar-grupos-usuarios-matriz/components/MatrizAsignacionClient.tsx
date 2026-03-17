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
  AsignacionMasivaUsuariosPayloadSchema,
} from "shared/schemas/asignacionMasivaUsuarios";
import { AsignacionUsuarioMutacionSchema } from "shared/schemas/asignacionMasivaUsuarios";
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

function normalizeIds(values?: string[]) {
  // Asegurar que siempre regresamos un array de strings filtrado, único y ordenado
  const arr = Array.isArray(values) ? values : [];
  return [...new Set(arr.filter((v) => !!v).map((v) => String(v).trim()))].sort();
}

function areRowsEqual(a: UsuarioMatrizRow, b: UsuarioMatrizRow) {
  const aCont = a.grupoContableId ?? null;
  const bCont = b.grupoContableId ?? null;
  const aRest = a.grupoRestrictivoId ?? null;
  const bRest = b.grupoRestrictivoId ?? null;

  return (
    aCont === bCont &&
    aRest === bRest &&
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
      // Normalizar a string o null (zod espera SlugId | null)
      grupoContableId: currentRow.grupoContableId ?? null,
      grupoRestrictivoId: currentRow.grupoRestrictivoId ?? null,
      // Normalizar array: filtrar vacíos, forzar strings únicos y ordenados
      otrosGruposIds: normalizeIds(currentRow.otrosGruposIds),
    });
  }

  return mutaciones;
}

// Validación local adicional para dar mensajes más claros al usuario
function validateMutacionesLocal(mutaciones: AsignacionUsuarioMutacion[]) {
  const errors: string[] = [];
  const authIdRegex = /^[A-Za-z0-9_-]+$/; // permitir '-' y '_'

  mutaciones.forEach((m, idx) => {
    // usuarioId debe cumplir AuthIdSchema: 1-29 chars (extensión para - _)
    if (!m.usuarioId) {
      errors.push(`Mutación[${idx}]: usuarioId ausente`);
    } else if (m.usuarioId.length > 29) {
      errors.push(`Mutación[${idx}]: usuarioId demasiado largo (${m.usuarioId.length} > 29)`);
    } else if (!authIdRegex.test(m.usuarioId)) {
      errors.push(`Mutación[${idx}]: usuarioId contiene caracteres inválidos (solo A-Z, a-z, 0-9, '-' o '_' permitidos)`);
    }

    // otrosGruposIds debe ser array con máximo 20 elementos
    if (!Array.isArray(m.otrosGruposIds)) {
      errors.push(`Mutación[${idx}]: otrosGruposIds no es un array`);
    } else if (m.otrosGruposIds.length > 20) {
      errors.push(`Mutación[${idx}]: tiene más de 20 otrosGruposIds (${m.otrosGruposIds.length})`);
    } else {
      m.otrosGruposIds.forEach((g, j) => {
        if (!g) {
          errors.push(`Mutación[${idx}].otrosGruposIds[${j}]: valor inválido`);
        } else if (g.includes('/')) {
          errors.push(`Mutación[${idx}].otrosGruposIds[${j}]: no puede contener '/'`);
        }
      });
    }
  });

  return errors;
}

function sanitizeMutaciones(mutaciones: AsignacionUsuarioMutacion[]) {
  return mutaciones.map((m) => ({
    usuarioId: String(m.usuarioId),
    grupoContableId: m.grupoContableId ?? null,
    grupoRestrictivoId: m.grupoRestrictivoId ?? null,
    otrosGruposIds: normalizeIds(m.otrosGruposIds),
  }));
}

function sanitizePayload(payload: AsignacionMasivaUsuariosPayload) {
  return {
    operacion: String(payload.operacion),
    mutaciones: sanitizeMutaciones(payload.mutaciones),
  } as AsignacionMasivaUsuariosPayload;
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
      // Validación rápida y específica antes de la validación Zod
      try {
        const localErrors = validateMutacionesLocal(dirtyMutaciones);
        if (localErrors.length > 0) {
          console.error('[MatrizAsignacionClient] Errores locales en mutaciones:', localErrors);
          toast({ title: 'Validación inválida', description: localErrors.join('\n'), variant: 'destructive' });
          return;
        }
      } catch (e) {
        console.error('[MatrizAsignacionClient] Error ejecutando validación local', e);
      }

      // Construir payload sanitizado y validar con Zod
      const sanitized = sanitizePayload(payload);

      // Validación previa en cliente usando el esquema Zod para dar feedback inmediato
      try {
        const parsedLocal = AsignacionMasivaUsuariosPayloadSchema.safeParse(sanitized);
        if (!parsedLocal.success) {
          // Mostrar flatten (más consistente) y loguear detalle por mutación usando el schema de mutación
          try {
            const flat = parsedLocal.error.flatten();
            console.error('[MatrizAsignacionClient] Validación local fallida (flatten):', flat);
            // Log adicional del payload y mutaciones para diagnóstico
            console.debug('[MatrizAsignacionClient] Payload que falló validación local (sanitized):', JSON.stringify(sanitized));

            if (Array.isArray(sanitized.mutaciones)) {
              sanitized.mutaciones.forEach((m, i) => {
                try {
                  const r = AsignacionUsuarioMutacionSchema.safeParse(m);
                  if (!r.success) {
                    const f = r.error.flatten();
                    console.error(`[MatrizAsignacionClient] Mutación[${i}] inválida (flatten):`, f);
                    console.debug(`[MatrizAsignacionClient] Mutación[${i}] content:`, JSON.stringify(m));
                  } else {
                    console.debug(`[MatrizAsignacionClient] Mutación[${i}] OK`);
                  }
                } catch (e) {
                  console.error(`[MatrizAsignacionClient] Error validando mutación[${i}] localmente`, e);
                  console.debug(`[MatrizAsignacionClient] Mutación[${i}] content:`, JSON.stringify(m));
                }
              });
            }

            const serialized = JSON.stringify(flat, null, 2);
            toast({ title: 'Validación inválida', description: serialized, variant: 'destructive' });
          } catch (err) {
            // Fallback: mostrar format si flatten no es serializable
            try {
              const fmt = parsedLocal.error.format();
              console.error('[MatrizAsignacionClient] Validación local fallida (format):', fmt);
              const serialized2 = JSON.stringify(fmt, null, 2);
              toast({ title: 'Validación inválida', description: serialized2, variant: 'destructive' });
            } catch (err2) {
              console.error('[MatrizAsignacionClient] Validación local fallida y no serializable', parsedLocal.error);
              toast({ title: 'Validación inválida', description: 'Error en la validación local (no serializable)', variant: 'destructive' });
            }
          }
          return;
        }
      } catch (e) {
        console.error('[MatrizAsignacionClient] Error validando payload localmente', e);
      }

      // Log cliente por diagnóstico
      try {
        console.debug('[MatrizAsignacionClient] Enviando payload (sanitized):', JSON.stringify(sanitized));
        // Dump detallado por mutación
        sanitized.mutaciones.forEach((m, idx) => {
          try {
            console.debug(`[MatrizAsignacionClient] Mutación[${idx}]`, {
              usuarioId: m.usuarioId,
              usuarioIdType: typeof m.usuarioId,
              grupoContableId: m.grupoContableId,
              grupoContableIdType: typeof m.grupoContableId,
              grupoRestrictivoId: m.grupoRestrictivoId,
              grupoRestrictivoIdType: typeof m.grupoRestrictivoId,
              otrosGruposIds: Array.isArray(m.otrosGruposIds) ? m.otrosGruposIds : String(m.otrosGruposIds),
              otrosGruposIdsType: Object.prototype.toString.call(m.otrosGruposIds),
            });
          } catch (e) {
            console.debug(`[MatrizAsignacionClient] Mutación[${idx}] no serializable`);
          }
        });
      } catch (e) {
        console.debug('[MatrizAsignacionClient] Enviando payload (no serializable)');
      }

      const result = await guardarAsignacionesMasivas(residenciaId, sanitized);

      if (!result.success) {
        // Serializar el error para mostrar más contexto en el toast
        const descripcionError = typeof result.error === "string" ? result.error : JSON.stringify(result.error);
        console.error('[MatrizAsignacionClient] Error guardando asignaciones:', result.error);
        toast({
          title: "Error al guardar",
          description: descripcionError || "Validación inválida.",
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
