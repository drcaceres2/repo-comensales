"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";

import { UpdateMiPerfilPayloadSchema, UpdateMiPerfilPayload } from "shared/schemas/usuarios";
import { functions, httpsCallable, storage } from "@/lib/firebase";
import { useToast } from "@/hooks/useToast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useInfoUsuario } from "@/components/layout/AppProviders";
import { useObjetivosQuery, usePerfilDetalleQuery, useInvalidarPerfil } from "./consultas";

const updateMiPerfilCallable = httpsCallable<
    { targetUserId: string; profileData: UpdateMiPerfilPayload },
    { success: boolean; message: string }
>(functions, "updateMiPerfil");

// Clave de localStorage con el viewerUid embebido para evitar
// que un usuario vea datos almacenados de otra sesión.
function localStorageKey(viewerUid: string) {
  return `mi-perfil.targetUid.${viewerUid}`;
}

const miPerfilFormSchema = UpdateMiPerfilPayloadSchema.omit({
  lastUpdatedAt: true,
});

type MiPerfilFormValues = z.infer<typeof miPerfilFormSchema>;

function normalizeOptional(value?: string | null): string | undefined {
  if (value === undefined || value === null) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function MiPerfilClient() {
  const { toast } = useToast();
  const { usuarioId, residenciaId, roles } = useInfoUsuario();
  const viewerUid = usuarioId;

  const [targetUid, setTargetUid] = useState<string>("");

  // ── Estado para la foto pendiente de subir ──────────────────────────────
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const localPreviewUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (localPreviewUrlRef.current) {
        URL.revokeObjectURL(localPreviewUrlRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (localPreviewUrlRef.current) {
      URL.revokeObjectURL(localPreviewUrlRef.current);
      localPreviewUrlRef.current = null;
    }
    setLocalPreviewUrl(null);
    setPendingAvatarFile(null);
  }, [targetUid]);
  // ────────────────────────────────────────────────────────────────────────

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isDirty },
  } = useForm<MiPerfilFormValues>({
    resolver: zodResolver(miPerfilFormSchema),
    defaultValues: {
      nombre: "",
      apellido: "",
      nombreCorto: "",
      identificacion: "",
      telefonoMovil: "",
      fechaDeNacimiento: undefined,
      universidad: "",
      carrera: "",
      fotoPerfil: "",
      camposPersonalizados: {},
    },
  });

  // ── Queries (caché aislado por viewerUid) ─────────────────────────────────
  const objetivosQuery = useObjetivosQuery(viewerUid);
  const perfilQuery = usePerfilDetalleQuery(viewerUid, targetUid);
  const { invalidarDetalle, invalidarObjetivos } = useInvalidarPerfil(viewerUid);

  // ── Resolución inicial de targetUid ───────────────────────────────────────
  useEffect(() => {
    if (!objetivosQuery.data || objetivosQuery.data.length === 0) return;

    const storedTarget = window.localStorage.getItem(localStorageKey(viewerUid));
    const ownOption = objetivosQuery.data.find((o) => o.esPropio)?.id;
    const fromStorage = objetivosQuery.data.find((o) => o.id === storedTarget)?.id;
    const fallback = objetivosQuery.data[0].id;

    // Preferimos siempre el perfil propio al entrar. Si no existe, usamos el
    // almacenado o el primero disponible. No sobreescribimos si ya hay selección.
    setTargetUid((current) => current || ownOption || fromStorage || fallback);
  }, [objetivosQuery.data, viewerUid]);

  // Persiste el targetUid en localStorage con clave aislada por viewer
  useEffect(() => {
    if (targetUid && viewerUid) {
      window.localStorage.setItem(localStorageKey(viewerUid), targetUid);
    }
  }, [targetUid, viewerUid]);

  // ── Sincronizar formulario al cargar/cambiar de perfil objetivo ───────────
  useEffect(() => {
    if (!perfilQuery.data) return;

    const dto = perfilQuery.data.dto;
    const campos = perfilQuery.data.camposConfigurados || [];
    const customValues = Object.fromEntries(
        campos.map((field) => [field.etiqueta, dto.camposPersonalizados?.[field.etiqueta] || ""])
    );

    reset({
      nombre: dto.nombre,
      apellido: dto.apellido,
      nombreCorto: dto.nombreCorto || "",
      identificacion: dto.identificacion || "",
      telefonoMovil: dto.telefonoMovil || "",
      fechaDeNacimiento: dto.fechaDeNacimiento,
      universidad: dto.universidad || "",
      carrera: dto.carrera || "",
      fotoPerfil: dto.fotoPerfil || "",
      camposPersonalizados: customValues,
    });
  }, [perfilQuery.data, reset]);

  // ── Mutación de guardado ──────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async ({ values, file }: { values: MiPerfilFormValues; file: File | null }) => {
      if (!targetUid || !perfilQuery.data) {
        throw new Error("No se pudo resolver el usuario objetivo.");
      }

      let photoUrl: string | null | undefined = normalizeOptional(values.fotoPerfil) ?? null;

      if (file) {
        if (file.size > 5 * 1024 * 1024) throw new Error("La imagen supera el límite de 5MB.");
        if (!file.type.startsWith("image/")) throw new Error("El archivo debe ser una imagen válida.");
        if (!residenciaId) throw new Error("No se pudo resolver la ruta de almacenamiento para el avatar.");

        const storageRef = ref(
            storage,
            `tenants/${residenciaId}/usuarios/${targetUid}/perfil/avatar_current.jpg`
        );
        await uploadBytes(storageRef, file, { contentType: file.type });
        const publicUrl = await getDownloadURL(storageRef);
        photoUrl = `${publicUrl}${publicUrl.includes("?") ? "&" : "?"}t=${Date.now()}`;
      }

      const editableCampos = Object.fromEntries(
          (perfilQuery.data.camposConfigurados || [])
              .filter((field) => field.modificablePorInteresado)
              .map((field) => [field.etiqueta, values.camposPersonalizados?.[field.etiqueta] || ""])
      );

      const payload: UpdateMiPerfilPayload = {
        nombre: values.nombre,
        apellido: values.apellido,
        nombreCorto: normalizeOptional(values.nombreCorto),
        identificacion: normalizeOptional(values.identificacion),
        telefonoMovil: normalizeOptional(values.telefonoMovil),
        fechaDeNacimiento: values.fechaDeNacimiento || undefined,
        universidad: normalizeOptional(values.universidad),
        carrera: normalizeOptional(values.carrera),
        fotoPerfil: photoUrl,
        camposPersonalizados: Object.keys(editableCampos).length > 0 ? editableCampos : undefined,
        lastUpdatedAt: perfilQuery.data.dto.timestampActualizacion,
      };

      const response = await updateMiPerfilCallable({ targetUserId: targetUid, profileData: payload });
      if (!response.data?.success) {
        throw new Error(response.data?.message || "Error al guardar el perfil.");
      }
    },
    onSuccess: async () => {
      toast({ title: "Perfil actualizado", description: "Los cambios fueron guardados correctamente." });

      setPendingAvatarFile(null);
      if (localPreviewUrlRef.current) {
        URL.revokeObjectURL(localPreviewUrlRef.current);
        localPreviewUrlRef.current = null;
      }
      setLocalPreviewUrl(null);

      await invalidarDetalle(targetUid);
      await invalidarObjetivos();
    },
    onError: (error: Error) => {
      toast({ title: "No se pudo guardar", description: error.message, variant: "destructive" });
    },
  });

  const camposConfigurados = useMemo(() => perfilQuery.data?.camposConfigurados || [], [perfilQuery.data]);
  const camposPersonalizadosForm = watch("camposPersonalizados") || {};

  const onSubmit = handleSubmit(async (values) => {
    await saveMutation.mutateAsync({ values, file: pendingAvatarFile });
  });

  // ── Estados de carga y error ──────────────────────────────────────────────
  if (objetivosQuery.isLoading || (perfilQuery.isLoading && targetUid)) {
    return <div className="p-6">Cargando perfil...</div>;
  }
  if (objetivosQuery.isError) {
    return <div className="p-6 text-red-600">{(objetivosQuery.error as Error).message}</div>;
  }
  if (perfilQuery.isError) {
    return <div className="p-6 text-red-600">{(perfilQuery.error as Error).message}</div>;
  }
  if (!perfilQuery.data) {
    return <div className="p-6">No hay datos de perfil para mostrar.</div>;
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
      <div className="mx-auto w-full max-w-3xl p-4 md:p-6">
        <div className="mb-6 flex items-center gap-4">
          <img
              src={localPreviewUrl ?? perfilQuery.data.dto.fotoPerfil ?? "/favicon.ico"}
              alt="Foto de perfil"
              className="h-16 w-16 rounded-full border object-cover"
          />
          <div className="flex flex-col">
            <h1 className="text-2xl font-bold">Mi perfil</h1>
            <p className="text-sm text-gray-600 mt-1">{`Residencia: ${residenciaId}`}</p>
          </div>
        </div>

        {roles.includes('asistente') ? (
            <div className="mb-6 space-y-2 rounded-md border p-4">
              <Label htmlFor="targetUid">Perfil que deseas editar</Label>
              <select
                  id="targetUid"
                  value={targetUid}
                  title="Selecciona un usuario"
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  onChange={(event) => setTargetUid(event.target.value)}
              >
                {(objetivosQuery.data || []).map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.nombreCompleto} {option.esPropio ? "(yo)" : ""}
                    </option>
                ))}
              </select>
            </div>
        ) : null}

        <form onSubmit={onSubmit} className="space-y-6">
          <section className="space-y-4 rounded-md border p-4">
            <h2 className="font-semibold">Cambiar fotografía</h2>
            <div className="w-full space-y-2">
              <Input
                  id="foto"
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    if (localPreviewUrlRef.current) URL.revokeObjectURL(localPreviewUrlRef.current);
                    const newUrl = URL.createObjectURL(file);
                    localPreviewUrlRef.current = newUrl;
                    setLocalPreviewUrl(newUrl);
                    setPendingAvatarFile(file);
                  }}
              />
              {pendingAvatarFile ? (
                  <p className="text-xs text-muted-foreground">
                    Nueva foto seleccionada: <span className="font-medium">{pendingAvatarFile.name}</span>. Guarda para aplicar el cambio.
                  </p>
              ) : null}
              <Input type="hidden" {...register("fotoPerfil")} />
            </div>
          </section>

          <section className="space-y-4 rounded-md border p-4">
            <h2 className="font-semibold">Información personal</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="nombre">Nombre</Label>
                <Input id="nombre" {...register("nombre")} />
                {errors.nombre ? <p className="text-xs text-red-600">{errors.nombre.message}</p> : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="apellido">Apellido</Label>
                <Input id="apellido" {...register("apellido")} />
                {errors.apellido ? <p className="text-xs text-red-600">{errors.apellido.message}</p> : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="nombreCorto">Nombre corto</Label>
                <Input id="nombreCorto" {...register("nombreCorto")} />
                {errors.nombreCorto ? <p className="text-xs text-red-600">{errors.nombreCorto.message}</p> : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="identificacion">Identificación</Label>
                <Input id="identificacion" {...register("identificacion")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="telefonoMovil">Teléfono móvil</Label>
                <Input id="telefonoMovil" {...register("telefonoMovil")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fechaDeNacimiento">Fecha de nacimiento</Label>
                <Input id="fechaDeNacimiento" type="date" {...register("fechaDeNacimiento")} />
              </div>
            </div>
          </section>

          <section className="space-y-4 rounded-md border p-4">
            <h2 className="font-semibold">Perfil académico</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="universidad">Universidad</Label>
                <Input id="universidad" {...register("universidad")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="carrera">Carrera</Label>
                <Input id="carrera" {...register("carrera")} />
              </div>
            </div>
          </section>

          <section className="space-y-4 rounded-md border p-4">
            <h2 className="font-semibold">Logística (solo lectura)</h2>
            <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-3">
              <div className="rounded bg-muted p-3">
                <p className="text-muted-foreground">Habitación</p>
                <p className="font-medium">{perfilQuery.data.dto.logistica.habitacion || "-"}</p>
              </div>
              <div className="rounded bg-muted p-3">
                <p className="text-muted-foreground">Nro. de ropa</p>
                <p className="font-medium">{perfilQuery.data.dto.logistica.numeroDeRopa || "-"}</p>
              </div>
              <div className="rounded bg-muted p-3">
                <p className="text-muted-foreground">Dieta</p>
                <p className="font-medium">{perfilQuery.data.dto.logistica.dieta.nombre || "-"}</p>
              </div>
            </div>
            {perfilQuery.data.dto.logistica.dieta.descripcion ? (
                <p className="text-sm text-muted-foreground">{perfilQuery.data.dto.logistica.dieta.descripcion}</p>
            ) : null}
          </section>

          {camposConfigurados.length > 0 ? (
              <section className="space-y-4 rounded-md border p-4">
                <h2 className="font-semibold">Información adicional</h2>
                <div className="grid grid-cols-1 gap-4">
                  {camposConfigurados.map((field) => (
                      <div key={field.etiqueta} className="space-y-2">
                        <Label htmlFor={`campo-${field.etiqueta}`}>
                          {field.etiqueta}
                          {field.esObligatorio ? " *" : ""}
                          {!field.modificablePorInteresado ? " (solo lectura)" : ""}
                        </Label>
                        {field.tipoControl === "textArea" ? (
                            <Textarea
                                id={`campo-${field.etiqueta}`}
                                placeholder={field.placeholder}
                                disabled={!field.modificablePorInteresado}
                                value={camposPersonalizadosForm[field.etiqueta] || ""}
                                onChange={(event) =>
                                    setValue(
                                        "camposPersonalizados",
                                        { ...camposPersonalizadosForm, [field.etiqueta]: event.target.value },
                                        { shouldDirty: true, shouldTouch: true }
                                    )
                                }
                            />
                        ) : (
                            <Input
                                id={`campo-${field.etiqueta}`}
                                placeholder={field.placeholder}
                                disabled={!field.modificablePorInteresado}
                                value={camposPersonalizadosForm[field.etiqueta] || ""}
                                onChange={(event) =>
                                    setValue(
                                        "camposPersonalizados",
                                        { ...camposPersonalizadosForm, [field.etiqueta]: event.target.value },
                                        { shouldDirty: true, shouldTouch: true }
                                    )
                                }
                            />
                        )}
                      </div>
                  ))}
                </div>
              </section>
          ) : null}

          <div className="flex items-center justify-end gap-3">
            <Button
                type="submit"
                disabled={saveMutation.isPending || (!isDirty && !pendingAvatarFile)}
            >
              {saveMutation.isPending ? "Guardando..." : "Guardar cambios"}
            </Button>
          </div>
        </form>
      </div>
  );
}
