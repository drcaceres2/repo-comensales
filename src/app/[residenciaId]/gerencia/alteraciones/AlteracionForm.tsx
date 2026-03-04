"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import type {
  CreateAlteracionInput,
  CreateAlteracionPayload,
} from "shared/schemas/alteraciones";
import { createAlteracionSchema } from "shared/schemas/alteraciones";
import { MapaDiaDeLaSemana, type DiaDeLaSemana } from "shared/schemas/fechas";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import { callCreateAlteracion } from "./lib/service";
import { useAlteraciones } from "./lib/useAlteraciones";

interface AlteracionFormProps {
  residenciaId: string;
  autorId: string;
}

const DIAS_ORDENADOS: DiaDeLaSemana[] = [
  "lunes",
  "martes",
  "miercoles",
  "jueves",
  "viernes",
  "sabado",
  "domingo",
];

const parseFechaIsoUtc = (fechaIso: string): Date => {
  const [year, month, day] = fechaIso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};

const formatFechaIsoUtc = (fecha: Date): string => {
  const year = fecha.getUTCFullYear();
  const month = `${fecha.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${fecha.getUTCDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getDiaSemana = (fecha: Date): DiaDeLaSemana => {
  const dia = fecha.getUTCDay();
  if (dia === 0) return "domingo";
  if (dia === 1) return "lunes";
  if (dia === 2) return "martes";
  if (dia === 3) return "miercoles";
  if (dia === 4) return "jueves";
  if (dia === 5) return "viernes";
  return "sabado";
};

export default function AlteracionForm({
  residenciaId,
  autorId,
}: AlteracionFormProps) {
  const queryClient = useQueryClient();
  const [diaFiltro, setDiaFiltro] = useState<DiaDeLaSemana>("lunes");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    tiemposComida,
    gruposComidas,
    isLoadingConfig,
    isErrorConfig,
    configError,
  } = useAlteraciones(residenciaId);

  const {
    control,
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<CreateAlteracionInput>({
    resolver: zodResolver(createAlteracionSchema, undefined, { raw: true }) as any,
    defaultValues: {
      nombre: "",
      descripcion: "",
      residenciaId,
      autorId,
      fechaInicio: "",
      fechaFin: "",
      alteraciones: [
        {
          tiempoComidaId: "",
          detalle: {
            opcionesActivas: [],
            contingenciaAlternativaId: "",
          },
        },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "alteraciones",
  });

  const fechaInicio = (watch("fechaInicio") ?? "") as string;
  const fechaFin = (watch("fechaFin") ?? "") as string;

  const diasDisponibles = useMemo(() => {
    if (!fechaInicio || !fechaFin) return DIAS_ORDENADOS;

    const inicio = parseFechaIsoUtc(fechaInicio);
    const fin = parseFechaIsoUtc(fechaFin);

    if (inicio > fin) return DIAS_ORDENADOS;

    const dias = new Set<DiaDeLaSemana>();
    const cursor = new Date(inicio);

    while (cursor <= fin) {
      dias.add(getDiaSemana(cursor));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    return DIAS_ORDENADOS.filter((dia) => dias.has(dia));
  }, [fechaInicio, fechaFin]);

  useEffect(() => {
    if (!diasDisponibles.includes(diaFiltro)) {
      setDiaFiltro(diasDisponibles[0] ?? "lunes");
    }
  }, [diaFiltro, diasDisponibles]);

  const diasEnRango = useMemo(() => {
    if (!fechaInicio || !fechaFin) return 0;

    const inicio = parseFechaIsoUtc(fechaInicio);
    const fin = parseFechaIsoUtc(fechaFin);
    if (inicio > fin) return 0;

    const diferenciaMs = fin.getTime() - inicio.getTime();
    return Math.floor(diferenciaMs / (24 * 60 * 60 * 1000)) + 1;
  }, [fechaInicio, fechaFin]);

  const tiemposComidaFiltrados = useMemo(() => {
    const entries = Object.entries(tiemposComida ?? {});

    return entries
      .filter(([, tiempo]) => {
        const dia = (tiempo as { dia?: DiaDeLaSemana }).dia;
        return !!dia && diasDisponibles.includes(dia) && dia === diaFiltro;
      })
      .map(([tiempoId, tiempo]) => {
        const tiempoData = tiempo as {
          nombre?: string;
          grupoComida?: string;
        };
        const grupoNombre = tiempoData.grupoComida
          ? (gruposComidas[tiempoData.grupoComida] as { nombre?: string } | undefined)
              ?.nombre
          : undefined;

        return {
          id: tiempoId,
          nombre: tiempoData.nombre ?? tiempoId,
          grupoNombre,
        };
      });
  }, [tiemposComida, gruposComidas, diasDisponibles, diaFiltro]);

  const onSubmit = async (data: CreateAlteracionInput) => {
    setSubmitError(null);
    setIsSubmitting(true);

    try {
      const inicio = parseFechaIsoUtc(data.fechaInicio as string);
      const fin = parseFechaIsoUtc(data.fechaFin as string);

      const tiemposSeleccionados = data.alteraciones
        .filter((item) => !!item.tiempoComidaId)
        .map((item) => ({
          tiempoComidaId: item.tiempoComidaId,
          detalle: item.detalle,
          dia: (tiemposComida[item.tiempoComidaId] as { dia?: DiaDeLaSemana } | undefined)
            ?.dia,
        }))
        .filter((item) => !!item.dia);

      if (tiemposSeleccionados.length === 0) {
        throw new Error("Selecciona al menos un tiempo de comida válido.");
      }

      const payloadsPorDia: CreateAlteracionPayload[] = [];
      const cursor = new Date(inicio);

      while (cursor <= fin) {
        const diaActual = getDiaSemana(cursor);
        const fechaIso = formatFechaIsoUtc(cursor);

        const alteracionesDia = tiemposSeleccionados
          .filter((item) => item.dia === diaActual)
          .map((item) => ({
            tiempoComidaId: item.tiempoComidaId,
            detalle: item.detalle,
          }));

        if (alteracionesDia.length > 0) {
          const inputDia: CreateAlteracionInput = {
            nombre: data.nombre,
            descripcion: data.descripcion,
            residenciaId: data.residenciaId,
            autorId: data.autorId,
            fechaInicio: fechaIso,
            fechaFin: fechaIso,
            alteraciones: alteracionesDia,
          };

          payloadsPorDia.push(createAlteracionSchema.parse(inputDia));
        }

        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }

      if (payloadsPorDia.length === 0) {
        throw new Error(
          "No hay ocurrencias de los tiempos seleccionados en el rango de fechas indicado."
        );
      }

      for (const payloadDia of payloadsPorDia) {
        await callCreateAlteracion(payloadDia);
      }

      await queryClient.invalidateQueries({
        queryKey: ["alteraciones", residenciaId],
      });

      reset({
        nombre: "",
        descripcion: "",
        residenciaId,
        autorId,
        fechaInicio: "",
        fechaFin: "",
        alteraciones: [
          {
            tiempoComidaId: "",
            detalle: {
              opcionesActivas: [],
              contingenciaAlternativaId: "",
            },
          },
        ],
      });
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "No se pudo crear la alteración."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nueva alteración</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="space-y-6"
        >
          <input type="hidden" {...register("residenciaId")} value={residenciaId} />
          <input type="hidden" {...register("autorId")} value={autorId} />

          <div className="space-y-2">
            <Label htmlFor="nombre">Nombre</Label>
            <Input
              id="nombre"
              type="text"
              {...register("nombre")}
              placeholder="Ej. Ajuste por mantenimiento"
            />
            {errors.nombre?.message && (
              <p className="text-sm text-red-600">{errors.nombre.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="descripcion">Descripción</Label>
            <Textarea
              id="descripcion"
              {...register("descripcion")}
              placeholder="Detalle opcional de la alteración"
            />
            {errors.descripcion?.message && (
              <p className="text-sm text-red-600">{errors.descripcion.message}</p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="fechaInicio">Fecha inicio</Label>
              <Input
                id="fechaInicio"
                type="date"
                {...register("fechaInicio")}
              />
              {errors.fechaInicio?.message && (
                <p className="text-sm text-red-600">
                  {errors.fechaInicio.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="fechaFin">Fecha fin</Label>
              <Input
                id="fechaFin"
                type="date"
                {...register("fechaFin")}
              />
              {errors.fechaFin?.message && (
                <p className="text-sm text-red-600">{errors.fechaFin.message}</p>
              )}
            </div>
          </div>

          {diasEnRango > 7 && (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              El período seleccionado supera 7 días. Este formulario no está pensado para
              alteraciones tan agresivas; considera ajustar la estructura base de horarios.
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="diaFiltro">Filtrar tiempos por día</Label>
            <Select value={diaFiltro} onValueChange={(value) => setDiaFiltro(value as DiaDeLaSemana)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {diasDisponibles.map((dia) => (
                  <SelectItem key={dia} value={dia}>
                    {MapaDiaDeLaSemana[dia]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-4 rounded-md border border-slate-200 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-medium text-slate-900">
                Tiempos de comida a alterar
              </h3>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  append({
                    tiempoComidaId: "",
                    detalle: {
                      opcionesActivas: [],
                      contingenciaAlternativaId: "",
                    },
                  })
                }
              >
                Agregar tiempo
              </Button>
            </div>

            {fields.map((field, index) => (
              <div key={field.id} className="space-y-3 rounded-md border border-slate-200 p-3">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label>Tiempo comida ID</Label>
                    <select
                      {...register(`alteraciones.${index}.tiempoComidaId`)}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    >
                      <option value="">Selecciona un tiempo de comida</option>
                      {tiemposComidaFiltrados.map((tiempo) => (
                        <option key={tiempo.id} value={tiempo.id}>
                          {tiempo.nombre}
                          {tiempo.grupoNombre ? ` (${tiempo.grupoNombre})` : ""}
                        </option>
                      ))}
                    </select>
                    {errors.alteraciones?.[index]?.tiempoComidaId?.message && (
                      <p className="text-sm text-red-600">
                        {errors.alteraciones[index]?.tiempoComidaId?.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <Label>Contingencia alternativa ID</Label>
                    <Input
                      type="text"
                      {...register(
                        `alteraciones.${index}.detalle.contingenciaAlternativaId`
                      )}
                      placeholder="contingencia-general"
                    />
                    {errors.alteraciones?.[index]?.detalle?.contingenciaAlternativaId
                      ?.message && (
                      <p className="text-sm text-red-600">
                        {
                          errors.alteraciones[index]?.detalle
                            ?.contingenciaAlternativaId?.message
                        }
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-1">
                  <Label>Opciones activas (separadas por coma)</Label>
                  <Controller
                    control={control}
                    name={`alteraciones.${index}.detalle.opcionesActivas`}
                    render={({ field: controllerField }) => (
                      <Input
                        type="text"
                        value={controllerField.value?.join(", ") ?? ""}
                        onChange={(event) => {
                          const values = event.target.value
                            .split(",")
                            .map((item) => item.trim())
                            .filter(Boolean);
                          controllerField.onChange(values);
                        }}
                        placeholder="opcion-a, opcion-b"
                      />
                    )}
                  />
                  {errors.alteraciones?.[index]?.detalle?.opcionesActivas?.message && (
                    <p className="text-sm text-red-600">
                      {errors.alteraciones[index]?.detalle?.opcionesActivas?.message}
                    </p>
                  )}
                </div>

                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => remove(index)}
                    disabled={fields.length === 1}
                  >
                    Eliminar
                  </Button>
                </div>
              </div>
            ))}

            {typeof errors.alteraciones?.message === "string" && (
              <p className="text-sm text-red-600">{errors.alteraciones.message}</p>
            )}
          </div>

          {isLoadingConfig && (
            <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              Cargando tiempos de comida de la residencia...
            </p>
          )}

          {isErrorConfig && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {configError instanceof Error
                ? configError.message
                : "No se pudo cargar la configuración de horarios."}
            </p>
          )}

          {submitError && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {submitError}
            </p>
          )}

          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={isSubmitting || isLoadingConfig || isErrorConfig}
            >
              {isSubmitting ? "Guardando..." : "Crear alteración"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
