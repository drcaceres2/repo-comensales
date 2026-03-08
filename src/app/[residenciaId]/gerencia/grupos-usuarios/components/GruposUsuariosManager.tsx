"use client";
import React, { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  GrupoUsuarioSchema,
  GrupoUsuario,
  GrupoContable,
  GrupoRestrictivo,
  GrupoAnalitico,
  RestriccionCatalogo,
} from "shared/schemas/usuariosGrupos";
import { useGruposUsuariosRestriccionesQuery, useUpsertGrupoUsuario, useDeleteGrupoUsuario, useCentrosDeCostoQuery } from "../lib/consultas";
import type { CentroDeCosto } from "shared/schemas/contabilidad";
import { MultiSelect } from "./Multiselect";
import { DrawerRestricciones } from "./DrawerRestricciones";

// --- Types ---
interface GruposUsuariosProps {
  usuarioId: string;
  email: string;
  residenciaId: string;
  initialGrupos?: GrupoUsuario[];
  initialRestricciones?: RestriccionCatalogo[];
}

export function GruposUsuariosManager({
  usuarioId,
  email,
  residenciaId,
  initialGrupos = [],
  initialRestricciones = [],
}: GruposUsuariosProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedGrupo, setSelectedGrupo] = useState<GrupoUsuario | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);

  const configuracionQuery = useGruposUsuariosRestriccionesQuery(residenciaId ?? "");
  const centrosDeCostoQuery = useCentrosDeCostoQuery(residenciaId ?? "");
  const upsertGrupoMutation = useUpsertGrupoUsuario(residenciaId ?? "");
  const deleteGrupoMutation = useDeleteGrupoUsuario(residenciaId ?? "");

  const grupos: GrupoUsuario[] = configuracionQuery.data
    ? (Object.values(configuracionQuery.data.gruposUsuarios ?? {}) as GrupoUsuario[])
    : initialGrupos;

  const restricciones: RestriccionCatalogo[] = configuracionQuery.data
    ? (Object.values(configuracionQuery.data.restriccionesCatalogo ?? {}) as RestriccionCatalogo[])
    : initialRestricciones;

  const centrosDeCosto: CentroDeCosto[] = centrosDeCostoQuery.data ?? [];

  if (!residenciaId) {
    return <div className="text-red-500">No se pudo resolver residenciaId desde la ruta.</div>;
  }

  if (configuracionQuery.isLoading) {
    return <div>Cargando configuracion...</div>;
  }

  if (configuracionQuery.error) {
    return <div className="text-red-500">{configuracionQuery.error.message}</div>;
  }

  // --- Formulario Maestro-Detalle ---
  return (
    <div className="flex flex-col md:flex-row gap-6">
      {/* Maestro: Lista de Grupos */}
      <div className="w-full md:w-1/3">
        <h2 className="font-bold mb-2">Grupos</h2>
        <ul className="divide-y border rounded bg-white">
          {grupos.map((grupo) => (
            <li
              key={grupo.id}
              className={`p-3 cursor-pointer hover:bg-gray-50 ${
                selectedGrupo?.id === grupo.id ? "bg-blue-50" : ""
              }`}
              onClick={() => {
                setSelectedGrupo(grupo);
                setIsCreatingNew(false);
              }}
            >
              <div className="font-semibold">{grupo.nombre}</div>
              <div className="text-xs text-gray-500">{grupo.tipo}</div>
            </li>
          ))}
        </ul>
        <button
          className="mt-4 w-full btn btn-primary border border-blue-600 bg-blue-600 text-white hover:bg-blue-700 rounded shadow"
          onClick={() => {
            setSelectedGrupo(null);
            setIsCreatingNew(true);
          }}
          disabled={selectedGrupo !== null || isCreatingNew}
        >
          + Nuevo Grupo
        </button>
      </div>

      {/* Detalle: Formulario de Grupo */}
      <div className="w-full md:w-2/3">
        {grupos.length === 0 && selectedGrupo === null && !isCreatingNew ? (
          <div className="bg-gray-100 p-6 rounded text-center text-gray-500">
            No hay grupos registrados. Pulsa "Nuevo Grupo" para crear uno.
          </div>
        ) : selectedGrupo === null && !isCreatingNew ? (
          <div className="bg-gray-100 p-6 rounded text-center text-gray-500">
            Selecciona un grupo o pulsa "Nuevo Grupo" para crear uno.
          </div>
        ) : (
          <GrupoUsuarioForm
            key={selectedGrupo?.id || "new"}
            grupo={selectedGrupo}
            restricciones={restricciones}
            centrosDeCosto={centrosDeCosto}
            onSave={async (grupo) => {
              const result = await upsertGrupoMutation.mutateAsync(grupo)
              if (result.success) {
                setSelectedGrupo(null);
                setIsCreatingNew(false);
              } else {
                setSelectedGrupo(grupo);
              }
            }}
            onDelete={async (grupoId) => {
              await deleteGrupoMutation.mutateAsync(grupoId);
              setSelectedGrupo(null);
              setIsCreatingNew(false);
            }}
            onCancel={() => {
              setSelectedGrupo(null);
              setIsCreatingNew(false);
            }}
            onOpenDrawer={() => setDrawerOpen(true)}
          />
        )}
      </div>

      <DrawerRestricciones
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        usuarioId={usuarioId}
        email={email}
        residenciaId={residenciaId}
      />
    </div>
  );
}

// --- Formulario de Grupo ---
interface GrupoUsuarioFormProps {
  grupo: GrupoUsuario | null;
  restricciones: RestriccionCatalogo[];
  centrosDeCosto: CentroDeCosto[];
  onSave: (grupo: GrupoUsuario) => void;
  onDelete: (grupoId: string) => void;
  onCancel: () => void;
  onOpenDrawer: () => void;
}

function GrupoUsuarioForm({
  grupo,
  restricciones,
  centrosDeCosto,
  onSave,
  onDelete,
  onCancel,
  onOpenDrawer,
}: GrupoUsuarioFormProps) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<GrupoUsuario>({
    resolver: zodResolver(GrupoUsuarioSchema),
    defaultValues: grupo || { tipo: "ANALITICO", estaActivo: true } as GrupoUsuario,
  });
  const tipo = watch("tipo");
  const nombre = watch("nombre");
  const centroCostoId = watch("centroCostoId");
  const requiereConfirmacionDiaria = watch("politicas.requiereConfirmacionDiaria");

  // Helper para generar slug desde nombre
  const generateSlug = (nombre: string): string => {
    return nombre
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  };

  // Elimina campos no permitidos según el tipo
  useEffect(() => {
    reset((values) => {
      if (values.tipo === "CONTABLE") {
        // Solo las props válidas para contable
        const { id, nombre, estaActivo, tipo, centroCostoId } = values as GrupoContable;
        return { id, nombre, estaActivo, tipo, centroCostoId };
      } else if (values.tipo === "RESTRICTIVO") {
        const { id, nombre, estaActivo, tipo, politicas, restriccionesIds } = values as GrupoRestrictivo;
        return { id, nombre, estaActivo, tipo, politicas, restriccionesIds };
      } else {
        // ANALITICO
        const { id, nombre, estaActivo, tipo } = values as GrupoAnalitico;
        return { id, nombre, estaActivo, tipo };
      }
    });
    // eslint-disable-next-line
  }, [tipo]);

  // En modo creación, sincroniza id desde nombre antes de validar submit.
  useEffect(() => {
    if (grupo) {
      return;
    }
    const nextId = generateSlug(nombre ?? "");
    setValue("id", nextId, { shouldDirty: true, shouldValidate: false });
  }, [grupo, nombre, setValue]);

  useEffect(() => {
    if (!requiereConfirmacionDiaria) {
      setValue("politicas.horarioLimiteConfirmacion", undefined, {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
  }, [requiereConfirmacionDiaria, setValue]);

  const handleFormSubmit = handleSubmit(
    async (data) => {
      try {
        setSubmitError(null);
        if (data.tipo === "CONTABLE" && !(data as GrupoContable).centroCostoId) {
          setSubmitError("Debes asignar un centro de costo para grupos contables.");
          return;
        }
        if (!data.id) {
          data.id = generateSlug(data.nombre);
        }
        console.log("[GrupoUsuarioForm] Guardando grupo:", data);
        await onSave(data);
      } catch (error) {
        console.error("[GrupoUsuarioForm] Error al guardar grupo:", error);
        setSubmitError("No se pudo guardar el grupo. Revisa la consola para más detalles.");
      }
    },
    (validationErrors) => {
      console.error("[GrupoUsuarioForm] Errores de validacion:", validationErrors);
      setSubmitError("El formulario tiene errores de validacion.");
    }
  );

  return (
    <form
      className="space-y-4 bg-white p-6 rounded shadow"
      onSubmit={handleFormSubmit}
    >
      <input type="hidden" {...register("id")} />
      <input type="hidden" {...register("estaActivo")} />

      {submitError && (
        <div className="alert alert-error py-2 text-sm">
          <span>{submitError}</span>
        </div>
      )}

      <div>
        <label className="block font-medium">Nombre</label>
        <input
          className="input input-bordered w-full border border-gray-300 focus:border-blue-500 focus:ring focus:ring-blue-200"
          {...register("nombre", { required: true })}
        />
        {errors.nombre && (
          <span className="text-red-500 text-xs">{errors.nombre.message}</span>
        )}
        {errors.id && (
          <span className="text-red-500 text-xs">{errors.id.message}</span>
        )}
      </div>
      <div>
        <label className="block font-medium">Tipo</label>
        <select className="select input-bordered w-full border border-gray-300 focus:border-blue-500 focus:ring focus:ring-blue-200" {...register("tipo", { required: true })}>
          <option value="CONTABLE">Contable</option>
          <option value="RESTRICTIVO">Restrictivo</option>
          <option value="ANALITICO">Analítico</option>
        </select>
      </div>
      {tipo === "CONTABLE" && (
        <>
          <div>
            <label className="block font-medium">Código Centro de Costo</label>
            <select className="select w-full" {...register("centroCostoId", { required: true })}>
              <option value="">Selecciona un centro de costo</option>
              {centrosDeCosto
                .filter((cc) => cc.estaActivo)
                .map((cc) => (
                  <option key={cc.id} value={cc.id}>
                    {cc.codigoVisible} - {cc.nombre}
                  </option>
                ))}
            </select>
            {centrosDeCosto.length === 0 && (
              <p className="text-xs text-gray-500 mt-1">No hay centros de costo disponibles para esta residencia.</p>
            )}
            {"centroCostoId" in errors && errors.centroCostoId && (
              <span className="text-red-500 text-xs">{errors.centroCostoId.message as string}</span>
            )}
            {centroCostoId === "" && (
              <span className="text-red-500 text-xs">Debes seleccionar un centro de costo.</span>
            )}
          </div>
        </>
      )}
      {tipo === "RESTRICTIVO" && (
        <>
          <div>
            <label className="block font-medium">Restricciones</label>
            <Controller
              control={control}
              name="restriccionesIds"
              render={({ field }) => (
                <MultiSelect
                  options={restricciones.map((r) => ({
                    value: r.id,
                    label: r.nombre,
                  }))}
                  value={field.value || []}
                  onChange={field.onChange}
                />
              )}
            />
            <button
              type="button"
              className="mt-1 inline-flex items-center text-sm text-blue-700 underline underline-offset-2 hover:text-blue-900"
              onClick={onOpenDrawer}
            >
              Gestionar Catálogo de Restricciones
            </button>
            {"restriccionesIds" in errors && errors.restriccionesIds && (
              <span className="text-red-500 text-xs">{errors.restriccionesIds.message as string}</span>
            )}
          </div>
          {/* Políticas: ejemplo de campo adicional */}
          <div>
            <label className="block font-medium">Políticas</label>
            <div className="mt-2 flex flex-col items-start gap-3">
              <label className="flex items-center gap-2">
                <input type="checkbox" {...register("politicas.requiereConfirmacionAsistencia")} />
                Confirmación de Asistencia
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" {...register("politicas.requiereConfirmacionDiaria")} />
                Confirmación Diaria
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" {...register("politicas.requiereLocalizacionV2")} />
                Requiere Localización
              </label>
            </div>
            <div>
              <label className="block text-xs">Horario Límite Confirmación</label>
              <input
                className="input input-bordered w-full max-w-48 disabled:bg-gray-100 disabled:text-gray-400"
                type="time"
                disabled={!requiereConfirmacionDiaria}
                {...register("politicas.horarioLimiteConfirmacion")}
              />
            </div>
          </div>
        </>
      )}
      <div className="flex gap-2">
        <button
          className="rounded-lg border border-blue-600 bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          type="submit"
          disabled={isSubmitting}
        >
          {isSubmitting ? "Guardando..." : "Guardar"}
        </button>
        <button
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          type="button"
          disabled={isSubmitting}
          onClick={onCancel}
        >
          Cancelar
        </button>
        {grupo && (
          <button
            className="rounded-lg border border-red-600 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
            type="button"
            disabled={isSubmitting}
            onClick={() => onDelete(grupo.id)}
          >
            Borrar
          </button>
        )}
      </div>
    </form>
  );
}

