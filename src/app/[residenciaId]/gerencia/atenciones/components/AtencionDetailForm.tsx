'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  ActualizarAtencionPayload,
  ActualizarAtencionPayloadSchema,
  Atencion,
  CrearAtencionPayload,
} from 'shared/schemas/atenciones';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface AtencionDetailFormProps {
  atencion: Atencion | null;
  onCreate: (payload: CrearAtencionPayload) => Promise<void>;
  onUpdate: (payload: ActualizarAtencionPayload) => Promise<void>;
  onDelete: (atencionId: string) => Promise<void>;
  saving: boolean;
  deleting: boolean;
  onCancel?: () => void;
}

type AtencionFormValues = {
  nombre: string;
  comentarios?: string;
  fechaSolicitudComida: string;
  fechaHoraAtencion: string;
  centroCostoId?: string;
  estado: Atencion['estado'];
};

const avisoLabel: Record<Atencion['avisoAdministracion'], string> = {
  no_comunicado: 'No comunicado',
  comunicado: 'Comunicado',
  cancelado: 'Cancelado',
};

function toDateInput(value?: string): string {
  if (!value) {
    return '';
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value.slice(0, 10);
  }

  return parsed.toISOString().slice(0, 10);
}

function toDateTimeInput(value?: string): string {
  if (!value) {
    return '';
  }

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  }

  return value.replace(' ', 'T').slice(0, 16);
}

function defaultValues(atencion: Atencion | null): AtencionFormValues {
  const now = new Date();
  const localNow = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);

  if (!atencion) {
    return {
      nombre: '',
      comentarios: '',
      fechaSolicitudComida: now.toISOString().slice(0, 10),
      fechaHoraAtencion: localNow,
      centroCostoId: '',
      estado: 'pendiente',
    };
  }

  return {
    nombre: atencion.nombre,
    comentarios: atencion.comentarios || '',
    fechaSolicitudComida: toDateInput(atencion.fechaSolicitudComida),
    fechaHoraAtencion: toDateTimeInput(atencion.fechaHoraAtencion),
    centroCostoId: atencion.centroCostoId || '',
    estado: atencion.estado,
  };
}

export function AtencionDetailForm({
  atencion,
  onCreate,
  onUpdate,
  onDelete,
  saving,
  deleting,
  onCancel,
}: AtencionDetailFormProps) {
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const initialValues = useMemo(() => defaultValues(atencion), [atencion]);

  const form = useForm<AtencionFormValues>({
    resolver: zodResolver(
      ActualizarAtencionPayloadSchema.omit({ id: true }).extend({
        estado: ActualizarAtencionPayloadSchema.shape.estado.default('pendiente'),
      }),
    ),
    defaultValues: initialValues,
  });

  useEffect(() => {
    form.reset(initialValues);
  }, [form, initialValues]);

  const onSubmit = async (values: AtencionFormValues) => {
    if (!atencion) {
      await onCreate({
        nombre: values.nombre,
        comentarios: values.comentarios,
        fechaSolicitudComida: values.fechaSolicitudComida,
        fechaHoraAtencion: values.fechaHoraAtencion,
        centroCostoId: values.centroCostoId,
      });
      return;
    }

    await onUpdate({
      id: atencion.id,
      nombre: values.nombre,
      comentarios: values.comentarios,
      fechaSolicitudComida: values.fechaSolicitudComida,
      fechaHoraAtencion: values.fechaHoraAtencion,
      centroCostoId: values.centroCostoId,
      estado: values.estado,
    });
  };

  // Make the modal content scrollable on overflow (especially mobile)
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {/* ...existing code... */}
          <FormField
            control={form.control}
            name="nombre"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nombre</FormLabel>
                <FormControl>
                  <Input placeholder="Coffee break de bienvenida" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="comentarios"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Comentarios</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Detalles operativos de la atencion"
                    className="min-h-[90px]"
                    value={field.value || ''}
                    onChange={field.onChange}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="fechaSolicitudComida"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fecha solicitud comida</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="fechaHoraAtencion"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fecha y hora atencion</FormLabel>
                  <FormControl>
                    <Input type="datetime-local" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="estado"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Estado interno</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar estado" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="pendiente">Pendiente</SelectItem>
                      <SelectItem value="aprobada">Aprobada</SelectItem>
                      <SelectItem value="rechazada">Rechazada</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="centroCostoId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Centro de costo</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="centro-costo"
                      value={field.value || ''}
                      onChange={field.onChange}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="rounded-lg border bg-muted/20 p-3">
            <p className="text-xs text-muted-foreground">Aviso a administracion (solo lectura)</p>
            <Badge variant="outline" className="mt-2">
              {atencion ? avisoLabel[atencion.avisoAdministracion] : 'No comunicado'}
            </Badge>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            {atencion && (
              <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="border-destructive text-destructive hover:bg-destructive/10"
                    disabled={deleting || saving}
                  >
                    Eliminar
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Eliminar atencion</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esta accion no se puede deshacer. La atencion se eliminara de la residencia.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={() => onDelete(atencion.id)}
                    >
                      Eliminar
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}

            <div className="flex gap-2">
              {onCancel && (
                <Button type="button" variant="outline" onClick={onCancel} disabled={saving || deleting}>
                  Cancelar
                </Button>
              )}
              <Button type="submit" disabled={saving || deleting}>
                {saving ? 'Guardando...' : atencion ? 'Guardar cambios' : 'Crear atencion'}
              </Button>
            </div>
          </div>
        </form>
      </Form>
    );
  }
