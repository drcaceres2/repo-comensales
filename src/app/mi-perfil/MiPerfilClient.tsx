"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { obtenerMiPerfilRead, obtenerOpcionesObjetivoMiPerfil } from "./actions";

const updateMiPerfilCallable = httpsCallable<
  { targetUserId: string; profileData: UpdateMiPerfilPayload },
  { success: boolean; message: string }
>(functions, "updateMiPerfil");

const LOCAL_STORAGE_TARGET_KEY = "mi-perfil.targetUid";

const miPerfilFormSchema = UpdateMiPerfilPayloadSchema.omit({
  lastUpdatedAt: true,
});

type MiPerfilFormValues = z.infer<typeof miPerfilFormSchema>;

const miPerfilQueryKeys = {
  objetivos: ["mi-perfil", "objetivos"] as const,
  detalle: (targetUid: string) => ["mi-perfil", "detalle", targetUid] as const,
};

function normalizeOptional(value?: string | null): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function MiPerfilClient() {
  const { toast } = useToast();
  const { residenciaId } = useInfoUsuario();
  const queryClient = useQueryClient();
  const [targetUid, setTargetUid] = useState<string>("");

  // ── Estado para la foto pendiente de subir ──────────────────────────────
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  // Ref para acceder al URL actual desde callbacks con closure estático
  const localPreviewUrlRef = useRef<string | null>(null);

  // Libera la URL del objeto al desmontar el componente
  useEffect(() => {
    return () => {
      if (localPreviewUrlRef.current) {
        URL.revokeObjectURL(localPreviewUrlRef.current);
      }
    };
  }, []);

  // Limpia el avatar pendiente al cambiar de perfil objetivo
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

  const objetivosQuery = useQuery({
    queryKey: miPerfilQueryKeys.objetivos,
    queryFn: async () => {
      const response = await obtenerOpcionesObjetivoMiPerfil();
      if (!response.success || !response.data) {
        throw new Error(response.error?.message || "No se pudo cargar usuarios disponibles.");
      }
      return response.data;
    },
    staleTime: 1000 * 60 * 10,
  });

  useEffect(() => {
    if (!objetivosQuery.data || objetivosQuery.data.length === 0) {
      return;
    }

    const storedTarget = window.localStorage.getItem(LOCAL_STORAGE_TARGET_KEY);
    const selectedFromStorage = objetivosQuery.data.find((option) => option.id === storedTarget)?.id;
    const fallback = objetivosQuery.data[0].id;
    const nextTarget = selectedFromStorage || fallback;

    setTargetUid((current) => (current ? current : nextTarget));
  }, [objetivosQuery.data]);

  useEffect(() => {
    if (targetUid) {
      window.localStorage.setItem(LOCAL_STORAGE_TARGET_KEY, targetUid);
    }
  }, [targetUid]);

  const perfilQuery = useQuery({
    queryKey: miPerfilQueryKeys.detalle(targetUid || "self"),
    queryFn: async () => {
      const response = await obtenerMiPerfilRead(targetUid || undefined);
      if (!response.success || !response.data) {
        throw new Error(response.error?.message || "No se pudo cargar el perfil.");
      }
      return response.data;
    },
    enabled: Boolean(targetUid),
    staleTime: 1000 * 60 * 3,
  });

  useEffect(() => {
    if (!perfilQuery.data) {
      return;
    }

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

  const saveMutation = useMutation({
    mutationFn: async ({ values, file }: { values: MiPerfilFormValues; file: File | null }) => {
      if (!targetUid || !perfilQuery.data) {
        throw new Error("No se pudo resolver el usuario objetivo.");
      }

      // ── 1. Si hay un archivo nuevo, subirlo primero ─────────────────────
      let photoUrl: string | null | undefined = normalizeOptional(values.fotoPerfil) ?? null;

      if (file) {
        if (file.size > 5 * 1024 * 1024) {
          throw new Error("La imagen supera el límite de 5MB.");
        }
        if (!file.type.startsWith("image/")) {
          throw new Error("El archivo debe ser una imagen válida.");
        }
        if (!residenciaId) {
          throw new Error("No se pudo resolver la ruta de almacenamiento para el avatar.");
        }

        const storageRef = ref(
          storage,
          `tenants/${residenciaId}/usuarios/${targetUid}/perfil/avatar_current.jpg`
        );
        await uploadBytes(storageRef, file, { contentType: file.type });
        const publicUrl = await getDownloadURL(storageRef);
        // ── 2. Obtener URL con cache-buster ─────────────────────────────
        photoUrl = `${publicUrl}${publicUrl.includes("?") ? "&" : "?"}t=${Date.now()}`;
      }

      // ── 3. Construir el payload e invocar la Cloud Function ─────────────
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

      const response = await updateMiPerfilCallable({
        targetUserId: targetUid,
        profileData: payload,
      });

      if (!response.data?.success) {
        throw new Error(response.data?.message || "Error al guardar el perfil.");
      }
    },
    onSuccess: async () => {
      toast({ title: "Perfil actualizado", description: "Los cambios fueron guardados correctamente." });

      // Limpiar estado de avatar pendiente y liberar URL del objeto
      setPendingAvatarFile(null);
      if (localPreviewUrlRef.current) {
        URL.revokeObjectURL(localPreviewUrlRef.current);
        localPreviewUrlRef.current = null;
      }
      setLocalPreviewUrl(null);

      await queryClient.invalidateQueries({ queryKey: miPerfilQueryKeys.detalle(targetUid || "self") });
      await queryClient.invalidateQueries({ queryKey: miPerfilQueryKeys.objetivos });
    },
    onError: (error: Error) => {
      toast({
        title: "No se pudo guardar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const camposConfigurados = useMemo(() => perfilQuery.data?.camposConfigurados || [], [perfilQuery.data]);
  const camposPersonalizadosForm = watch("camposPersonalizados") || {};

  const onSubmit = handleSubmit(async (values) => {
    await saveMutation.mutateAsync({ values, file: pendingAvatarFile });
  });

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

  return (
    <div className="mx-auto w-full max-w-3xl p-4 md:p-6">
      <h1 className="mb-6 text-2xl font-bold">Mi perfil</h1>

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

      <form onSubmit={onSubmit} className="space-y-6">
        <section className="space-y-4 rounded-md border p-4">
          <h2 className="font-semibold">Cabecera de identidad</h2>
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <img
              // Muestra la previsualización local si hay archivo pendiente;
              // de lo contrario, muestra la foto guardada en el perfil.
              src={localPreviewUrl ?? perfilQuery.data.dto.fotoPerfil ?? "/favicon.ico"}
              alt="Foto de perfil"
              className="h-24 w-24 rounded-full border object-cover"
            />
            <div className="w-full space-y-2">
              <Label htmlFor="foto">Subir nueva foto</Label>
              <Input
                id="foto"
                type="file"
                accept="image/*"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;

                  // Liberar la URL previa antes de crear una nueva
                  if (localPreviewUrlRef.current) {
                    URL.revokeObjectURL(localPreviewUrlRef.current);
                  }

                  const newUrl = URL.createObjectURL(file);
                  localPreviewUrlRef.current = newUrl;
                  setLocalPreviewUrl(newUrl);
                  setPendingAvatarFile(file);
                  // No se sube nada aún; la subida ocurre en onSubmit
                }}
              />
              {pendingAvatarFile ? (
                <p className="text-xs text-muted-foreground">
                  Nueva foto seleccionada: <span className="font-medium">{pendingAvatarFile.name}</span>. Guarda para aplicar el cambio.
                </p>
              ) : null}
              <Input type="hidden" {...register("fotoPerfil")} />
            </div>
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
                      onChange={(event) => {
                        setValue(
                          "camposPersonalizados",
                          { ...camposPersonalizadosForm, [field.etiqueta]: event.target.value },
                          { shouldDirty: true, shouldTouch: true }
                        );
                      }}
                    />
                  ) : (
                    <Input
                      id={`campo-${field.etiqueta}`}
                      placeholder={field.placeholder}
                      disabled={!field.modificablePorInteresado}
                      value={camposPersonalizadosForm[field.etiqueta] || ""}
                      onChange={(event) => {
                        setValue(
                          "camposPersonalizados",
                          { ...camposPersonalizadosForm, [field.etiqueta]: event.target.value },
                          { shouldDirty: true, shouldTouch: true }
                        );
                      }}
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


