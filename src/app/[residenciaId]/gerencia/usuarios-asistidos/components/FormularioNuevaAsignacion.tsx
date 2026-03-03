"use client";

import { useEffect } from "react";
import { useForm, Controller, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AsignarAsistentePayload, AsignarAsistentePayloadSchema } from "shared/schemas/usuariosAsistentes";
import { useAsignarAsistenteMutation, type AsistenteActual } from "../consultas";
import { useToast } from "@/hooks/useToast";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

interface UsuarioSeleccionable {
  id: string;
  nombre: string;
  apellido: string;
}

interface FormularioNuevaAsignacionProps {
  residenciaId: string;
  asistidoId: string;
  asistenteAEditar: AsistenteActual | null;
  onSuccess: () => void;
  candidatos: UsuarioSeleccionable[];
  isLoadingCandidatos: boolean;
}

const defaultFormValues = {
  asistenteId: "",
  permisos: {
    nivelAcceso: "Propias" as const,
    restriccionTiempo: false,
    fechaInicio: null,
    fechaFin: null,
  },
};

export const FormularioNuevaAsignacion = ({ residenciaId, asistidoId, asistenteAEditar, onSuccess, candidatos, isLoadingCandidatos }: FormularioNuevaAsignacionProps) => {
  const isEditMode = !!asistenteAEditar;
  const { toast } = useToast();

  const asistentesElegibles = candidatos; // ya filtrados desde el padre
  const isLoadingAsistentes = isLoadingCandidatos;

  const { mutate: asignarAsistente, isPending } = useAsignarAsistenteMutation({
    onSuccess: () => {
      toast({
        title: "Éxito",
        description: `Asistente ${isEditMode ? 'actualizado' : 'asignado'} correctamente.`,
      });
      onSuccess(); // Llama al callback para limpiar el estado en el padre
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Error al guardar",
        description: error.message,
      });
    }
  });

  const form = useForm<AsignarAsistentePayload>({
    resolver: zodResolver(AsignarAsistentePayloadSchema),
    defaultValues: {
      ...defaultFormValues,
      asistidoId,
    },
    mode: 'onChange', // validar mientras el usuario va rellenando el formulario
  });

  useEffect(() => {
    if (isEditMode) {
      form.reset({
        asistidoId,
        asistenteId: asistenteAEditar.id,
        permisos: {
          nivelAcceso: asistenteAEditar.permiso.nivelAcceso,
          restriccionTiempo: asistenteAEditar.permiso.restriccionTiempo,
          fechaInicio: asistenteAEditar.permiso.fechaInicio,
          fechaFin: asistenteAEditar.permiso.fechaFin,
        },
      });
    } else {
      form.reset({
        ...defaultFormValues,
        asistidoId,
      });
    }
  }, [asistenteAEditar, asistidoId, form, isEditMode]);

  const restriccionTiempoValue = useWatch({
    control: form.control,
    name: "permisos.restriccionTiempo",
  });

  const onSubmit = (data: AsignarAsistentePayload) => {
    const payload = { ...data };
    if (!payload.permisos.restriccionTiempo) {
        payload.permisos.fechaInicio = null;
        payload.permisos.fechaFin = null;
    }
    asignarAsistente(payload);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isEditMode ? "Editar Asignación" : "Nueva Asignación"}</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="asistenteId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Asistente (quien da la ayuda)</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value} disabled={isEditMode || isLoadingAsistentes}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={isLoadingAsistentes ? "Cargando..." : "Seleccione un asistente"} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {asistentesElegibles?.map(u => (
                        <SelectItem key={u.id} value={u.id}>{u.nombre} {u.apellido}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="permisos.nivelAcceso"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nivel de Acceso</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccione un nivel" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="Todas">Todas las acciones</SelectItem>
                      <SelectItem value="Propias">Solo acciones propias</SelectItem>
                      <SelectItem value="Ninguna">Ningún acceso</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="permisos.restriccionTiempo"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                  <div className="space-y-0.5">
                    <FormLabel>Permiso Temporal</FormLabel>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

            {restriccionTiempoValue && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pl-6 border-l-2 ml-2">
                <FormField
                  control={form.control}
                  name="permisos.fechaInicio"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fecha de Inicio</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} value={field.value || ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="permisos.fechaFin"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fecha de Fin</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} value={field.value || ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            <div className="flex justify-end space-x-2">
              {isEditMode && (
                <Button type="button" variant="outline" onClick={() => onSuccess()}>
                  Cancelar
                </Button>
              )}
              <Button type="submit" disabled={isPending || !form.formState.isValid}>
                {isPending ? "Guardando..." : (isEditMode ? "Guardar Cambios" : "Asignar Asistente")}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
};
