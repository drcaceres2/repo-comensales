'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ActualizarAtencionPayload,
  ActualizarAtencionPayloadSchema,
  Atencion,
  CrearAtencionPayload,
  AtencionEstadoSchema,
} from 'shared/schemas/atenciones';
import { FechaHoraIsoSchema, FechaIsoSchema } from 'shared/schemas/fechas';
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

import { useCentrosDeCosto } from '../../../contabilidad/centros-de-costo/hooks/useCentrosDeCosto';

interface AtencionDetailFormProps {
  atencion: Atencion | null;
  onCreate: (payload: CrearAtencionPayload) => Promise<void>;
  onUpdate: (payload: ActualizarAtencionPayload) => Promise<void>;
  onDelete: (atencionId: string) => Promise<void>;
  saving: boolean;
  deleting: boolean;
  onCancel?: () => void;
  residenciaId: string;
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

function roundDateTimeTo15(value?: string): string {
  if (!value) return '';
  // Accept either 'YYYY-MM-DDTHH:mm' or full ISO
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value.slice(0, 16).replace(' ', 'T');

  // Round minutes to nearest 15
  const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000);
  let minutes = local.getMinutes();
  const remainder = Math.round(minutes / 15);
  minutes = remainder * 15;
  if (minutes === 60) {
    local.setHours(local.getHours() + 1);
    minutes = 0;
  }
  local.setMinutes(minutes);
  local.setSeconds(0);
  return local.toISOString().slice(0, 16);
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

function CentrosSelect({ residenciaId, value, onChange }: { residenciaId: string; value?: string; onChange: (v: string) => void }) {
  const { centrosDeCosto = [], isLoading } = useCentrosDeCosto(residenciaId);

  return (
    <Select value={value || ''} onValueChange={(v) => onChange(v)}>
      <FormControl>
        <SelectTrigger>
          <SelectValue placeholder={isLoading ? 'Cargando centros...' : centrosDeCosto.length > 0 ? 'Seleccione...' : 'Sin centros activos'} />
        </SelectTrigger>
      </FormControl>
      <SelectContent>
        {centrosDeCosto.filter(cc => cc.estaActivo !== false).map((cc) => (
          <SelectItem key={cc.id} value={cc.id}>
            {cc.codigoVisible ? `${cc.codigoVisible} — ${cc.nombre}` : cc.nombre}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function AtencionDetailForm({
  atencion,
  onCreate,
  onUpdate,
  onDelete,
  saving,
  deleting,
  onCancel,
  residenciaId,
}: AtencionDetailFormProps) {
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const initialValues = useMemo(() => defaultValues(atencion), [atencion]);

  const resolverSchema = z
    .object({
      nombre: z.string().trim().min(1).max(120),
      comentarios: z
        .preprocess((val) => (val === '' || val === null ? undefined : val), z.string().trim().min(1).max(500).optional()),
      fechaSolicitudComida: FechaIsoSchema,
      fechaHoraAtencion: FechaHoraIsoSchema,
      centroCostoId: z.preprocess((val) => (val === '' ? undefined : val), z.string().min(1).optional()),
      estado: AtencionEstadoSchema.optional().default('pendiente'),
    })
    .strict()
    .superRefine((data, ctx) => {
      try {
        const now = new Date();
        const localToday = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
          .toISOString()
          .slice(0, 10);

        if (data.fechaSolicitudComida < localToday) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['fechaSolicitudComida'],
            message: 'La fecha de solicitud debe ser hoy o una fecha futura.',
          });
        }

        const fechaHoraDatePart = String(data.fechaHoraAtencion).slice(0, 10);
        if (fechaHoraDatePart < data.fechaSolicitudComida) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['fechaHoraAtencion'],
            message: 'La fecha/hora de la atención debe ser el mismo día o posterior a la fecha de solicitud.',
          });
        }
        // Validar que la hora esté en incrementos de 15 minutos
        const parsedDate = new Date(String(data.fechaHoraAtencion));
        if (!Number.isNaN(parsedDate.getTime())) {
          const minutes = parsedDate.getMinutes();
          if (minutes % 15 !== 0) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['fechaHoraAtencion'],
              message: 'La hora debe seleccionarse en intervalos de 15 minutos.',
            });
          }
        }
      } catch (err) {
        // ignore
      }
    });

  const form = useForm<AtencionFormValues>({
    resolver: zodResolver(resolverSchema),
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
                    <Input
                      type="datetime-local"
                      step={900}
                      value={field.value || ''}
                      onChange={(e) => field.onChange(roundDateTimeTo15((e as any).target.value))}
                    />
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
                    <CentrosSelect residenciaId={residenciaId} value={field.value} onChange={field.onChange} />
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

 
 
