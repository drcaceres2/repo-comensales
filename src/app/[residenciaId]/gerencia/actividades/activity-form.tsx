'use client';

import { useTransition } from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import type { ResidenciaId, ComedorId, TiempoComidaId } from 'shared/models/types';
import { type ComedorData } from 'shared/schemas/complemento1';
import { type CentroDeCosto } from 'shared/schemas/contabilidad';
import { type TiempoComida } from 'shared/schemas/horarios';
import { MapaDiaDeLaSemana } from 'shared/schemas/fechas';

import { createActividad, updateActividad, type ActividadGestion } from './actions';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/useToast';
import { Loader2 } from 'lucide-react';
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogClose,
    DialogOverlay,
} from '@/components/ui/dialog';
import { useInfoUsuario } from '@/components/layout/AppProviders';

interface ActivityFormProps {
    onClose: () => void;
    actividad?: ActividadGestion | null;
    tiemposComidaList: (TiempoComida & { id: TiempoComidaId })[];
    centroCostosList: CentroDeCosto[];
    comedoresList: (ComedorData & { id: ComedorId })[];
}

const ActivityFormSchema = z.object({
    titulo: z.string().min(3, 'El titulo debe tener al menos 3 caracteres.'),
    descripcion: z.string().optional(),
    lugar: z.string().optional(),
    fechaInicio: z.string().min(1, 'La fecha de inicio es obligatoria.'),
    tiempoComidaInicioId: z.string().min(1, 'Selecciona un tiempo de inicio.'),
    fechaFin: z.string().min(1, 'La fecha de fin es obligatoria.'),
    tiempoComidaFinId: z.string().min(1, 'Selecciona un tiempo de fin.'),
    centroCostoId: z.string().optional(),
    solicitudAdministracion: z.enum(['ninguna', 'solicitud_unica', 'diario']),
    maxParticipantes: z.number().int().positive('El maximo debe ser mayor que cero.'),
});

type ActivityFormData = z.infer<typeof ActivityFormSchema>;

export function ActivityForm({
    onClose,
    actividad,
    tiemposComidaList,
    centroCostosList,
    comedoresList: _comedoresList,
}: ActivityFormProps) {
    const { residenciaId } = useInfoUsuario();
    const { toast } = useToast();
    const [isPending, startTransition] = useTransition();

    const isEditing = !!actividad;
    const canEditCritical = !actividad || actividad.estado === 'pendiente';

    const form = useForm<ActivityFormData>({
        resolver: zodResolver(ActivityFormSchema),
        defaultValues: isEditing
            ? {
                  titulo: actividad.titulo,
                  descripcion: actividad.descripcion || '',
                  lugar: actividad.lugar || '',
                  fechaInicio: actividad.fechaInicio,
                  tiempoComidaInicioId: actividad.tiempoComidaInicioId,
                  fechaFin: actividad.fechaFin,
                  tiempoComidaFinId: actividad.tiempoComidaFinId,
                  centroCostoId: actividad.centroCostoId || undefined,
                  solicitudAdministracion: actividad.solicitudAdministracion,
                  maxParticipantes: actividad.maxParticipantes,
              }
            : {
                  titulo: '',
                  descripcion: '',
                  lugar: '',
                  fechaInicio: new Date().toISOString().slice(0, 10),
                  tiempoComidaInicioId: '',
                  fechaFin: new Date().toISOString().slice(0, 10),
                  tiempoComidaFinId: '',
                  centroCostoId: undefined,
                  solicitudAdministracion: 'solicitud_unica',
                  maxParticipantes: 10,
              },
    });

    const handleSubmit = (data: ActivityFormData) => {
        startTransition(async () => {
            const payload = {
                ...data,
                descripcion: data.descripcion || undefined,
                lugar: data.lugar || undefined,
                centroCostoId: data.centroCostoId || undefined,
            };

            const result = isEditing
                ? await updateActividad(actividad.id, residenciaId as ResidenciaId, payload)
                : await createActividad(residenciaId as ResidenciaId, payload);

            if (result.success) {
                toast({ title: `Actividad ${isEditing ? 'actualizada' : 'creada'} con exito` });
                onClose();
                return;
            }

            const errorMsg = typeof result.error === 'string' ? result.error : 'Error de validacion';
            toast({ title: 'Error', description: errorMsg, variant: 'destructive' });
        });
    };

    return (
        <Dialog open onOpenChange={(isOpen) => !isOpen && onClose()}>
            <DialogOverlay className='backdrop-blur-sm' style={{ backgroundColor: 'rgba(0, 0, 0, 0.2)' }} />
            <DialogContent className='w-full max-w-[95vw] sm:max-w-3xl max-h-[90vh] flex flex-col p-0'>
                <DialogHeader className='p-6 pb-4'>
                    <DialogClose onClick={onClose} />
                    <DialogTitle>{isEditing ? 'Editar Actividad' : 'Crear Nueva Actividad'}</DialogTitle>
                </DialogHeader>

                <div className='flex-grow overflow-y-auto px-6'>
                    <Form {...form}>
                        <form id='activity-form' onSubmit={form.handleSubmit(handleSubmit)} className='space-y-6'>
                            <div className='space-y-4'>
                                <h3 className='text-lg font-semibold border-b pb-2'>Campos descriptivos</h3>

                                <FormField
                                    control={form.control}
                                    name='titulo'
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Titulo</FormLabel>
                                            <FormControl>
                                                <Input placeholder='Nombre de la actividad' {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name='descripcion'
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Descripcion</FormLabel>
                                            <FormControl>
                                                <Textarea placeholder='Breve descripcion de la actividad' {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name='lugar'
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Lugar</FormLabel>
                                            <FormControl>
                                                <Input placeholder='Lugar de realizacion' {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>

                            <div className='space-y-4'>
                                <h3 className='text-lg font-semibold border-b pb-2'>Fronteras cronologicas</h3>

                                <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                                    <FormField
                                        control={form.control}
                                        name='fechaInicio'
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Fecha inicio</FormLabel>
                                                <FormControl>
                                                    <Input type='date' {...field} disabled={!canEditCritical} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name='fechaFin'
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Fecha fin</FormLabel>
                                                <FormControl>
                                                    <Input type='date' {...field} disabled={!canEditCritical} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>

                                <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                                    <FormField
                                        control={form.control}
                                        name='tiempoComidaInicioId'
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Tiempo comida inicio</FormLabel>
                                                <Select
                                                    onValueChange={field.onChange}
                                                    value={field.value}
                                                    disabled={!canEditCritical}
                                                >
                                                    <FormControl>
                                                        <SelectTrigger>
                                                            <SelectValue placeholder='Seleccionar...' />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent className='z-[250]'>
                                                        {tiemposComidaList.map((tc) => (
                                                            <SelectItem key={tc.id} value={tc.id}>
                                                                {tc.nombre} ({tc.dia ? MapaDiaDeLaSemana[tc.dia] : 'General'})
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name='tiempoComidaFinId'
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Tiempo comida fin</FormLabel>
                                                <Select
                                                    onValueChange={field.onChange}
                                                    value={field.value}
                                                    disabled={!canEditCritical}
                                                >
                                                    <FormControl>
                                                        <SelectTrigger>
                                                            <SelectValue placeholder='Seleccionar...' />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent className='z-[250]'>
                                                        {tiemposComidaList.map((tc) => (
                                                            <SelectItem key={tc.id} value={tc.id}>
                                                                {tc.nombre} ({tc.dia ? MapaDiaDeLaSemana[tc.dia] : 'General'})
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>
                            </div>

                            <div className='space-y-4'>
                                <h3 className='text-lg font-semibold border-b pb-2'>Cupos y costos</h3>

                                <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                                    <FormField
                                        control={form.control}
                                        name='maxParticipantes'
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Maximo participantes</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        type='number'
                                                        value={field.value ?? 1}
                                                        onChange={(event) =>
                                                            field.onChange(Number(event.target.value || 1))
                                                        }
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name='solicitudAdministracion'
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Solicitud a administracion</FormLabel>
                                                <Select onValueChange={field.onChange} value={field.value}>
                                                    <FormControl>
                                                        <SelectTrigger>
                                                            <SelectValue placeholder='Seleccionar...' />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent className='z-[250]'>
                                                        <SelectItem value='ninguna'>Ninguna</SelectItem>
                                                        <SelectItem value='solicitud_unica'>Solicitud unica</SelectItem>
                                                        <SelectItem value='diario'>Diario</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>

                                <FormField
                                    control={form.control}
                                    name='centroCostoId'
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Centro de costo imputable</FormLabel>
                                            <Select onValueChange={field.onChange} value={field.value ?? ''}>
                                                <FormControl>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder='Centro de costo...' />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent className='z-[250]'>
                                                    {centroCostosList.map((cc) => (
                                                        <SelectItem key={cc.id} value={cc.id}>
                                                            {cc.nombre} ({cc.codigoVisible})
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>
                        </form>
                    </Form>
                </div>

                <DialogFooter className='p-6 pt-4 border-t'>
                    <Button type='button' variant='outline' onClick={onClose} disabled={isPending}>
                        Cancelar
                    </Button>
                    <Button type='submit' form='activity-form' disabled={isPending}>
                        {isPending && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
                        {isEditing ? 'Guardar Cambios' : 'Crear Actividad'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}