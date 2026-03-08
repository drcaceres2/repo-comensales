"use client";

import React, { useMemo, useState } from "react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { ArregloDiaDeLaSemana, DiaDeLaSemana, MapaDiaDeLaSemana } from "shared/schemas/fechas";
import { slugify } from "shared/utils/commonUtils";
import {
  useDeleteRestriccionCatalogo,
  useGruposUsuariosRestriccionesQuery,
  useHorariosConfiguracionQuery,
  useUpsertRestriccionCatalogo,
} from "../lib/consultas";
import { RestriccionCatalogo } from "shared/schemas/usuariosGrupos";

export const Drawer = Sheet;

export function DrawerContent({ className = "", ...props }: React.ComponentProps<typeof SheetContent>) {
  return (
    <SheetContent
      side="right"
      className={`w-full overflow-y-auto p-0 sm:max-w-3xl ${className}`}
      {...props}
    />
  );
}

type ReglaAlternativa = "BLOQUEADA" | "REQUIERE_APROBACION";

interface DrawerRestriccionesProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  usuarioId: string;
  email: string;
  residenciaId: string;
}

type AsignacionReglas = Record<string, ReglaAlternativa>;

export function DrawerRestricciones({
  open,
  onOpenChange,
  usuarioId,
  email,
  residenciaId,
}: DrawerRestriccionesProps) {
  const query = useGruposUsuariosRestriccionesQuery(residenciaId);
  const horariosQuery = useHorariosConfiguracionQuery(residenciaId);
  const upsertMutation = useUpsertRestriccionCatalogo(residenciaId);
  const deleteMutation = useDeleteRestriccionCatalogo(residenciaId);

  const [selectedRestriccionId, setSelectedRestriccionId] = useState<string | null>(null);
  const [nombre, setNombre] = useState("");
  const [reglasAlternativas, setReglasAlternativas] = useState<AsignacionReglas>({});
  const [diaFiltro, setDiaFiltro] = useState<DiaDeLaSemana | "">("");
  const [grupoComidaFiltro, setGrupoComidaFiltro] = useState<string>("");
  const [configAlternativaId, setConfigAlternativaId] = useState<string>("");
  const [reglaNueva, setReglaNueva] = useState<ReglaAlternativa>("BLOQUEADA");
  const [formError, setFormError] = useState<string>("");

  const restricciones = useMemo(() => {
    if (!query.data) return [];
    return Object.values(query.data.restriccionesCatalogo ?? {});
  }, [query.data]);

  const gruposComidas = useMemo(() => {
    if (!horariosQuery.data) return [];
    return Object.entries(horariosQuery.data.datos.gruposComidas ?? {}).sort((a, b) => {
      return (a[1]?.orden ?? 0) - (b[1]?.orden ?? 0);
    });
  }, [horariosQuery.data]);

  const configuracionesFiltradas = useMemo(() => {
    if (!horariosQuery.data) return [];

    const { configuracionesAlternativas, esquemaSemanal, gruposComidas, catalogoAlternativas } = horariosQuery.data.datos;

    const entries = Object.entries(configuracionesAlternativas ?? {});
    return entries
      .map(([id, config]) => {
        const tiempo = esquemaSemanal?.[config.tiempoComidaId];
        const grupo = tiempo ? gruposComidas?.[tiempo.grupoComida] : undefined;
        const definicion = catalogoAlternativas?.[config.definicionAlternativaId];

        return {
          id,
          config,
          tiempo,
          grupo,
          definicion,
        };
      })
      .filter((item) => {
        if (!item.tiempo || !item.grupo) return false;
        if (diaFiltro && item.tiempo.dia !== diaFiltro) return false;
        if (grupoComidaFiltro && item.tiempo.grupoComida !== grupoComidaFiltro) return false;
        return true;
      })
      .sort((a, b) => {
        const diaA = a.tiempo?.dia ?? "";
        const diaB = b.tiempo?.dia ?? "";
        if (diaA !== diaB) return diaA.localeCompare(diaB);

        const ordenA = a.grupo?.orden ?? 999;
        const ordenB = b.grupo?.orden ?? 999;
        if (ordenA !== ordenB) return ordenA - ordenB;

        return (a.config?.nombre ?? "").localeCompare(b.config?.nombre ?? "");
      });
  }, [horariosQuery.data, diaFiltro, grupoComidaFiltro]);

  const resetForm = () => {
    setSelectedRestriccionId(null);
    setNombre("");
    setReglasAlternativas({});
    setDiaFiltro("");
    setGrupoComidaFiltro("");
    setConfigAlternativaId("");
    setReglaNueva("BLOQUEADA");
    setFormError("");
  };

  const handleEdit = (restriccion: RestriccionCatalogo) => {
    setSelectedRestriccionId(restriccion.id);
    setNombre(restriccion.nombre);
    setReglasAlternativas(restriccion.reglasAlternativas || {});
    setFormError("");
  };

  const handleAddRegla = () => {
    if (!configAlternativaId) return;
    setReglasAlternativas((prev) => ({
      ...prev,
      [configAlternativaId]: reglaNueva,
    }));
    setConfigAlternativaId("");
  };

  const handleSave = async () => {
    const trimmedNombre = nombre.trim();

    if (trimmedNombre.length < 3) {
      setFormError("El nombre debe tener al menos 3 caracteres.");
      return;
    }

    if (Object.keys(reglasAlternativas).length === 0) {
      setFormError("Debes asignar al menos una configuración alternativa.");
      return;
    }

    const id = (selectedRestriccionId || slugify(trimmedNombre, 60));

    if (!id) {
      setFormError("No se pudo generar un ID válido para la restricción.");
      return;
    }

    const payload: RestriccionCatalogo = {
      id,
      nombre: trimmedNombre,
      reglasAlternativas,
    };

    console.log("[DrawerRestricciones] Guardando restricción payload:", payload);

    const result = await upsertMutation.mutateAsync(payload);
    if (!result?.success) {
      const details = result && "data" in result ? JSON.stringify(result.data) : "";
      console.error("[DrawerRestricciones] Error al guardar restricción:", result);
      setFormError(
        `${result?.error ?? "No se pudo guardar la restricción."}${details ? ` Detalle: ${details}` : ""}`
      );
      return;
    }

    setSelectedRestriccionId(id);
    setFormError("");
  };

  const handleDelete = async (restriccionId: string) => {
    const result = await deleteMutation.mutateAsync(restriccionId);
    if (!result?.success) {
      setFormError(result?.error ?? "No se pudo eliminar la restricción.");
      return;
    }

    if (selectedRestriccionId === restriccionId) {
      resetForm();
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <SheetTitle className="sr-only">Catálogo de Restricciones</SheetTitle>
        <div className="grid h-full grid-cols-1 md:grid-cols-[280px_1fr]">
          <aside className="border-b bg-gray-50 p-4 md:border-b-0 md:border-r">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-bold">Catálogo de Restricciones</h3>
              <button className="btn btn-sm" type="button" onClick={resetForm}>
                + Nueva
              </button>
            </div>

            <p className="mb-3 text-xs text-gray-500">Sesión: {email} | Residencia: {residenciaId}</p>

            {query.isLoading && <p className="text-sm text-gray-500">Cargando restricciones...</p>}
            {query.error && <p className="text-sm text-red-500">{query.error.message}</p>}

            <ul className="space-y-2">
              {restricciones.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    className={`w-full rounded border p-2 text-left text-sm ${
                      selectedRestriccionId === r.id ? "border-blue-500 bg-blue-50" : "border-gray-200 bg-white"
                    }`}
                    onClick={() => handleEdit(r)}
                  >
                    <div className="font-medium">{r.nombre}</div>
                    <div className="text-xs text-gray-500">{Object.keys(r.reglasAlternativas || {}).length} regla(s)</div>
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          <section className="space-y-4 p-4 md:p-6">
            <div>
              <label className="block text-sm font-medium">Nombre de la restricción</label>
              <input
                className="input input-bordered w-full border border-gray-300 focus:border-blue-500 focus:ring focus:ring-blue-200"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej. Sin cena fuera de horario"
              />
            </div>

            <div className="rounded border bg-white p-4">
              <h4 className="mb-3 font-semibold">Asignar Configuración de Alternativa</h4>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div>
                  <label className="block text-sm">Día de la semana</label>
                  <select
                    className="select input-bordered w-full border border-gray-300 focus:border-blue-500 focus:ring focus:ring-blue-200"
                    aria-label="Filtro por día de la semana"
                    value={diaFiltro}
                    onChange={(e) => {
                      setDiaFiltro(e.target.value as DiaDeLaSemana | "");
                      setConfigAlternativaId("");
                    }}
                  >
                    <option value="">Selecciona un día</option>
                    {ArregloDiaDeLaSemana.map((dia) => (
                      <option key={dia} value={dia}>
                        {MapaDiaDeLaSemana[dia]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm">Grupo de comida</label>
                  <select
                    className="select input-bordered w-full border border-gray-300 focus:border-blue-500 focus:ring focus:ring-blue-200"
                    aria-label="Filtro por grupo de comida"
                    value={grupoComidaFiltro}
                    onChange={(e) => {
                      setGrupoComidaFiltro(e.target.value);
                      setConfigAlternativaId("");
                    }}
                    disabled={!diaFiltro}
                  >
                    <option value="">Selecciona grupo</option>
                    {gruposComidas.map(([id, grupo]) => (
                      <option key={id} value={id}>
                        {grupo.nombre}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm">Regla</label>
                  <select
                    className="select input-bordered w-full border border-gray-300 focus:border-blue-500 focus:ring focus:ring-blue-200"
                    aria-label="Regla para la configuración alternativa"
                    value={reglaNueva}
                    onChange={(e) => setReglaNueva(e.target.value as ReglaAlternativa)}
                  >
                    <option value="BLOQUEADA">Bloqueada</option>
                    <option value="REQUIERE_APROBACION">Requiere aprobación</option>
                  </select>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto]">
                <select
                  className="select input-bordered w-full border border-gray-300 focus:border-blue-500 focus:ring focus:ring-blue-200"
                  aria-label="Configuración alternativa filtrada"
                  value={configAlternativaId}
                  onChange={(e) => setConfigAlternativaId(e.target.value)}
                  disabled={!diaFiltro || !grupoComidaFiltro}
                >
                  <option value="">Selecciona configuración alternativa</option>
                  {configuracionesFiltradas.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.config.nombre} - {item.grupo?.nombre} - {item.definicion?.nombre || "Sin alternativa"}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  className="btn btn-primary border border-blue-600 bg-blue-600 text-white hover:bg-blue-700"
                  disabled={!configAlternativaId}
                  onClick={handleAddRegla}
                >
                  Agregar
                </button>
              </div>

              <p className="mt-2 text-xs text-gray-500">
                Filtros: primero día, luego grupo de comida. La lista final debe ser corta para seleccionar rápido.
              </p>
            </div>

            <div>
              <h4 className="mb-2 font-semibold">Reglas asignadas</h4>
              <ul className="space-y-2">
                {Object.entries(reglasAlternativas).map(([configId, regla]) => {
                  const config = horariosQuery.data?.datos.configuracionesAlternativas?.[configId];
                  const tiempo = config ? horariosQuery.data?.datos.esquemaSemanal?.[config.tiempoComidaId] : undefined;
                  const grupo = tiempo ? horariosQuery.data?.datos.gruposComidas?.[tiempo.grupoComida] : undefined;
                  return (
                    <li key={configId} className="flex items-center justify-between rounded border p-2 text-sm">
                      <div>
                        <div className="font-medium">{config?.nombre || configId}</div>
                        <div className="text-xs text-gray-500">
                          {tiempo ? MapaDiaDeLaSemana[tiempo.dia] : "Sin día"} | {grupo?.nombre || "Sin grupo"} | {regla}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm text-red-600"
                        onClick={() => {
                          setReglasAlternativas((prev) => {
                            const next = { ...prev };
                            delete next[configId];
                            return next;
                          });
                        }}
                      >
                        Quitar
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            {formError && <p className="text-sm text-red-500">{formError}</p>}

            <div className="flex gap-2">
              <button
                type="button"
                className="btn btn-primary border border-blue-600 bg-blue-600 text-white hover:bg-blue-700"
                onClick={handleSave}
                disabled={upsertMutation.isPending}
              >
                {upsertMutation.isPending ? "Guardando..." : "Guardar Restricción"}
              </button>

              <button
                type="button"
                className="btn btn-outline border border-gray-400 text-gray-700 bg-white hover:bg-gray-100"
                onClick={resetForm}
                disabled={upsertMutation.isPending || deleteMutation.isPending}
              >
                Cancelar
              </button>

              {selectedRestriccionId && (
                <button
                  type="button"
                  className="btn btn-outline btn-error border border-red-600 text-red-700 bg-white hover:bg-red-50"
                  onClick={() => handleDelete(selectedRestriccionId)}
                  disabled={deleteMutation.isPending}
                >
                  {deleteMutation.isPending ? "Eliminando..." : "Eliminar"}
                </button>
              )}
            </div>
          </section>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
