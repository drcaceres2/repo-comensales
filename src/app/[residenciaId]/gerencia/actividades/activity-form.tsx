"use client";

import { useTransition, useEffect } from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import type { ComedorId, TiempoComidaId } from 'shared/models/types';
import { type ComedorData } from 'shared/schemas/complemento1';
import { type CentroDeCosto } from 'shared/schemas/contabilidad';
import { type TiempoComida, type GrupoComida } from 'shared/schemas/horarios';
import { MapaDiaDeLaSemana } from 'shared/schemas/fechas';

import { type ActividadGestion } from './actions';
import type { ActividadInput } from './consultas';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
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

interface ActivityFormProps {
    onClose: () => void;
    actividad?: ActividadGestion | null;
    tiemposComidaList: (TiempoComida & { id: TiempoComidaId })[];
    gruposComidas?: (GrupoComida & { id: string })[];
    centroCostosList: CentroDeCosto[];
    comedoresList: (ComedorData & { id: ComedorId })[];
    onCreate: (payload: ActividadInput) => Promise<{ success: boolean; error?: unknown }>;
    onUpdate: (actividadId: string, payload: ActividadInput) => Promise<{ success: boolean; error?: unknown }>;
}

const ActivityFormSchema = z.object({
    titulo: z.string().min(3, 'El titulo debe tener al menos 3 caracteres.'),
    descripcion: z.string().optional(),
    lugar: z.string().optional(),
    visibilidad: z.enum(['publica', 'oculta']),
    tipoAcceso: z.enum(['abierta', 'solo_invitacion']),
    permiteInvitadosExternos: z.boolean(),
    fechaInicio: z.string().min(1, 'La fecha de inicio es obligatoria.'),
    tiempoComidaInicioId: z.string().min(1, 'Selecciona un tiempo de inicio.'),
    fechaFin: z.string().min(1, 'La fecha de fin es obligatoria.'),
    tiempoComidaFinId: z.string().min(1, 'Selecciona un tiempo de fin.'),
    centroCostoId: z.string().optional(),
    maxParticipantes: z.number().int().positive('El maximo debe ser mayor que cero.'),
    adicionalesNoNominales: z.number().int().nonnegative('Debe ser cero o mayor.'),
});

type ActivityFormData = z.infer<typeof ActivityFormSchema>;

export function ActivityForm({
    onClose,
    actividad,
    tiemposComidaList,
    gruposComidas,
    centroCostosList,
    comedoresList: _comedoresList,
    onCreate,
    onUpdate,
}: ActivityFormProps) {
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
                  visibilidad: actividad.visibilidad,
                  tipoAcceso: actividad.tipoAcceso,
                  permiteInvitadosExternos: actividad.permiteInvitadosExternos,
                  fechaInicio: actividad.fechaInicio,
                  tiempoComidaInicioId: actividad.tiempoComidaInicioId,
                  fechaFin: actividad.fechaFin,
                  tiempoComidaFinId: actividad.tiempoComidaFinId,
                                    centroCostoId: actividad.centroCostoId || undefined,
                  maxParticipantes: actividad.maxParticipantes,
                  adicionalesNoNominales: actividad.adicionalesNoNominales,
              }
            : {
                  titulo: '',
                  descripcion: '',
                  lugar: '',
                  visibilidad: 'publica',
                  tipoAcceso: 'abierta',
                  permiteInvitadosExternos: true,
                  fechaInicio: new Date().toISOString().slice(0, 10),
                  tiempoComidaInicioId: '',
                  fechaFin: new Date().toISOString().slice(0, 10),
                  tiempoComidaFinId: '',
                  centroCostoId: undefined,
                  maxParticipantes: 10,
                  adicionalesNoNominales: 0,
              },
    });

    const computeDiaName = (fechaIso?: string) => {
        if (!fechaIso) return undefined;
        try {
            const d = new Date(`${fechaIso}T00:00:00`);
            const dias = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
            return dias[d.getUTCDay()];
        } catch (e) {
            return undefined;
        }
    };

    // Reset tiempoComidaInicioId when fechaInicio changes and the selected
    // tiempo no matches the new date's available tiempos.
    const fechaInicioValue = form.watch('fechaInicio');
    useEffect(() => {
        const selected = form.getValues().tiempoComidaInicioId;
        if (!selected) return;
        const dia = computeDiaName(fechaInicioValue);
        const stillValid = tiemposComidaList.some((tc) => tc.id === selected && (tc.dia === dia || !tc.dia));
        if (!stillValid) {
            form.setValue('tiempoComidaInicioId', '');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fechaInicioValue, tiemposComidaList]);

    // Reset tiempoComidaFinId when fechaFin changes and the selected
    // tiempo no matches the new date's available tiempos.
    const fechaFinValue = form.watch('fechaFin');
    useEffect(() => {
        const selected = form.getValues().tiempoComidaFinId;
        if (!selected) return;
        const dia = computeDiaName(fechaFinValue);
        const stillValid = tiemposComidaList.some((tc) => tc.id === selected && (tc.dia === dia || !tc.dia));
        if (!stillValid) {
            form.setValue('tiempoComidaFinId', '');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fechaFinValue, tiemposComidaList]);

    const fillMissingTiempos = () => {
        const values = form.getValues();
        // computeDiaName is defined at component scope so it can be reused
        // by both this helper and the Select renderers below.

        const groupOrder = new Map<string, number>();
        (gruposComidas || []).forEach((g) => groupOrder.set(g.id, g.orden ?? 0));

        const pickFirstOfDay = (fechaIso?: string) => {
            if (!fechaIso) return undefined;
            const diaName = computeDiaName(fechaIso);
            const candidates = tiemposComidaList.filter((tc) => tc.dia === diaName || !tc.dia);
            if (!candidates.length) return undefined;
            let best = candidates[0];
            let bestOrder = groupOrder.get(String((best as any).grupoComida)) ?? 0;
            for (const c of candidates) {
                const ord = groupOrder.get(String((c as any).grupoComida)) ?? 0;
                if (ord < bestOrder) {
                    bestOrder = ord;
                    best = c;
                }
            }
            return best.id;
        };

        const pickLastOfDay = (fechaIso?: string) => {
            if (!fechaIso) return undefined;
            const diaName = computeDiaName(fechaIso);
            const candidates = tiemposComidaList.filter((tc) => tc.dia === diaName || !tc.dia);
            if (!candidates.length) return undefined;
            let best = candidates[0];
            let bestOrder = groupOrder.get(String((best as any).grupoComida)) ?? 0;
            for (const c of candidates) {
                const ord = groupOrder.get(String((c as any).grupoComida)) ?? 0;
                if (ord > bestOrder) {
                    bestOrder = ord;
                    best = c;
                }
            }
            return best.id;
        };

        if (!values.tiempoComidaInicioId) {
            const pick = pickFirstOfDay(values.fechaInicio);
            if (pick) form.setValue('tiempoComidaInicioId', pick);
        }

        if (!values.tiempoComidaFinId) {
            const pick = pickLastOfDay(values.fechaFin);
            if (pick) form.setValue('tiempoComidaFinId', pick);
        }
    };

    const handleSubmit = (data: ActivityFormData) => {
        startTransition(async () => {
            const payload: ActividadInput = {
                ...data,
                descripcion: data.descripcion || undefined,
                lugar: data.lugar || undefined,
                centroCostoId: data.centroCostoId || undefined,
            };

            const result = isEditing
                ? await onUpdate(actividad.id, payload)
                : await onCreate(payload);

            if (result.success) {
                toast({ title: `Actividad ${isEditing ? 'actualizada' : 'creada'} con exito` });
                onClose();
                return;
            }
            console.error('Error creando/actualizando actividad:', result.error);

            let errorMsg = 'Error de validacion';
            if (typeof result.error === 'string') {
                errorMsg = result.error;
            } else if (result.error && typeof result.error === 'object') {
                const errObj = result.error as any;
                if (errObj.fieldErrors) {
                    const firstField = Object.keys(errObj.fieldErrors)[0];
                    const msgs = errObj.fieldErrors[firstField];
                    if (Array.isArray(msgs) && msgs.length > 0) {
                        errorMsg = msgs[0];
                    }
                } else if (errObj.message) {
                    errorMsg = String(errObj.message);
                } else {
                    try {
                        errorMsg = JSON.stringify(errObj);
                    } catch (e) {
                        errorMsg = 'Error de validacion';
                    }
                }
            }

            toast({ title: 'Error', description: errorMsg, variant: 'destructive' });
        });
    };

    return (
        <Dialog open onOpenChange={(isOpen) => !isOpen && onClose()}>
            <DialogOverlay className='backdrop-blur-sm' style={{ backgroundColor: 'rgba(0, 0, 0, 0.2)' }} />
                <DialogContent
                    description={isEditing ? 'Formulario para editar una actividad existente' : 'Formulario para crear una nueva actividad'}
                    className='w-full max-w-[95vw] sm:max-w-3xl max-h-[90vh] flex flex-col p-0'
                >
                <DialogHeader className='p-6 pb-4'>
                    <DialogClose onClick={onClose} />
                    <DialogTitle>{isEditing ? 'Editar Actividad' : 'Crear Nueva Actividad'}</DialogTitle>
                </DialogHeader>

                <div className='flex-grow overflow-y-auto px-6'>
                    <Form {...form}>
                        <form
                            id='activity-form'
                            onSubmit={(e) => {
                                e.preventDefault();
                                fillMissingTiempos();
                                void form.handleSubmit(handleSubmit)();
                            }}
                            className='space-y-6'
                        >
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
                                <h3 className='text-lg font-semibold border-b pb-2'>Taxonomia de acceso</h3>

                                <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                                    <FormField
                                        control={form.control}
                                        name='visibilidad'
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Visibilidad</FormLabel>
                                                <Select onValueChange={field.onChange} value={field.value}>
                                                    <FormControl>
                                                        <SelectTrigger>
                                                            <SelectValue placeholder='Seleccionar...' />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent className='z-[250]'>
                                                        <SelectItem value='publica'>Publica</SelectItem>
                                                        <SelectItem value='oculta'>Oculta</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name='tipoAcceso'
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Tipo de acceso</FormLabel>
                                                <Select onValueChange={field.onChange} value={field.value}>
                                                    <FormControl>
                                                        <SelectTrigger>
                                                            <SelectValue placeholder='Seleccionar...' />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent className='z-[250]'>
                                                        <SelectItem value='abierta'>Abierta</SelectItem>
                                                        <SelectItem value='solo_invitacion'>Solo invitacion</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>

                                <FormField
                                    control={form.control}
                                    name='permiteInvitadosExternos'
                                    render={({ field }) => (
                                        <FormItem className='flex flex-row items-center justify-between rounded-lg border p-4'>
                                            <div className='space-y-1'>
                                                <FormLabel>Permite invitados externos</FormLabel>
                                                <p className='text-xs text-muted-foreground'>
                                                    Habilita inscripciones de terceros por invitacion del organizador.
                                                </p>
                                            </div>
                                            <FormControl>
                                                <Switch checked={field.value} onCheckedChange={field.onChange} />
                                            </FormControl>
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
                                                        {tiemposComidaList
                                                            .filter((tc) => {
                                                                const dia = computeDiaName(form.getValues().fechaInicio);
                                                                return tc.dia === dia || !tc.dia;
                                                            })
                                                            .map((tc) => (
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
                                                        {tiemposComidaList
                                                            .filter((tc) => {
                                                                const dia = computeDiaName(form.getValues().fechaFin);
                                                                return tc.dia === dia || !tc.dia;
                                                            })
                                                            .map((tc) => (
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

                                    {/* `avisoAdministracion` is managed elsewhere; this form does not expose it. */}
                                </div>

                                <FormField
                                    control={form.control}
                                    name='adicionalesNoNominales'
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Adicionales no nominales</FormLabel>
                                            <FormControl>
                                                <Input
                                                    type='number'
                                                    min={0}
                                                    value={field.value ?? 0}
                                                    onChange={(event) => field.onChange(Number(event.target.value || 0))}
                                                    disabled={
                                                        isEditing &&
                                                        ['finalizada', 'cancelada'].includes(actividad?.estado ?? '')
                                                    }
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

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