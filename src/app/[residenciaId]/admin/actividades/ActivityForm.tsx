'use client';

import { useState, useTransition, useEffect } from 'react';
import { z } from 'zod';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Actividad, ResidenciaId, TiempoComida, CentroCosto, DayOfWeekMap } from '@/../shared/models/types';
import { ActividadCreateSchema, ActividadUpdateSchema } from '@/../shared/schemas/actividades';
import { createActividad, updateActividad } from './actions';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/useToast";
import { Loader2, XIcon, PlusCircle, Trash2 } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogClose,
    DialogOverlay
} from "@/components/ui/dialog";

interface ActivityFormProps {
    residenciaId: ResidenciaId;
    onClose: () => void;
    actividad?: Actividad | null;
    tiemposComidaList: TiempoComida[];
    centroCostosList: CentroCosto[];
    comedoresList: any[];
}

const ActividadFormSchema = z.union([ActividadCreateSchema, ActividadUpdateSchema]);
type ActividadFormData = z.infer<typeof ActividadFormSchema>;

export function ActivityForm({
    residenciaId,
    onClose,
    actividad,
    tiemposComidaList,
    centroCostosList,
    comedoresList
}: ActivityFormProps) {
    const { toast } = useToast();
    const [isPending, startTransition] = useTransition();
    const [showEmptyPlanWarning, setShowEmptyPlanWarning] = useState(false);

    const isEditing = !!actividad;
    const schema = isEditing ? ActividadUpdateSchema : ActividadCreateSchema;

    const form = useForm<ActividadFormData>({
        resolver: zodResolver(schema),
        defaultValues: isEditing ? {
            ...actividad,
             fechaInicio: actividad.fechaInicio,
             fechaFin: actividad.fechaFin,
        } : {
            nombre: '',
            descripcion: '',
            fechaInicio: new Date().toISOString().slice(0, 10),
            fechaFin: new Date().toISOString().slice(0, 10),
            requiereInscripcion: true,
            planComidas: [],
            modoAtencionActividad: 'externa',
            tipoSolicitudComidas: 'solicitud_unica',
            diasAntelacionSolicitudAdministracion: 7,
            tiempoComidaInicial: '',
            tiempoComidaFinal: '',
        },
    });
    
    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "planComidas",
    });

    const requiereInscripcion = form.watch('requiereInscripcion');
    const modoAtencionActividad = form.watch('modoAtencionActividad');
    
    useEffect(() => {
        if (modoAtencionActividad === 'externa') {
            form.setValue('comedorActividad', undefined);
        }
    }, [modoAtencionActividad, form.setValue]);

    const processSubmit = (data: ActividadFormData) => {
        if (!data.planComidas || data.planComidas.length === 0) {
            setShowEmptyPlanWarning(true);
            return;
        }
        handleActualSubmit(data);
    };
    
    const handleActualSubmit = (data: ActividadFormData) => {
        startTransition(async () => {
            const result = isEditing
                ? await updateActividad(actividad.id, residenciaId, data)
                : await createActividad(residenciaId, data);

            if (result.success) {
                toast({ title: `Actividad ${isEditing ? 'actualizada' : 'creada'} con éxito` });
                onClose();
            } else {
                const errorMsg = typeof result.error === 'string' ? result.error : 'Error de validación';
                toast({ title: 'Error', description: errorMsg, variant: 'destructive' });
            }
        });
    };

    return (
        <>
            <Dialog open onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
                <DialogOverlay className="backdrop-blur-sm" style={{ backgroundColor: 'rgba(0, 0, 0, 0.2)' }} />
                <DialogContent className="w-full max-w-[95vw] sm:max-w-4xl max-h-[90vh] flex flex-col p-0">
                    <DialogHeader className="p-6 pb-4">
                        <DialogClose onClick={onClose} />
                        <DialogTitle>{isEditing ? 'Editar Actividad' : 'Crear Nueva Actividad'}</DialogTitle>
                    </DialogHeader>
                    <div className="flex-grow overflow-y-auto px-6">
                        <Form {...form}>
                            <form 
                                id="activity-form"
                                onSubmit={form.handleSubmit(processSubmit, (errors) => {
                                    console.error("Form validation errors:", errors);
                                    toast({ 
                                        title: 'Error de validación', 
                                        description: 'Por favor, revisa los campos marcados en rojo.', 
                                        variant: 'destructive' 
                                    });
                                })} 
                                className="space-y-6" // Use space-y for consistent spacing between sections
                            >
                                <div className="space-y-4">
                                    <h3 className="text-lg font-semibold border-b pb-2">Campos generales</h3>
                                    <FormField
                                        control={form.control}
                                        name="nombre"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Nombre</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="Nombre de la actividad" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="descripcion"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Descripción (opcional)</FormLabel>
                                                <FormControl>
                                                    <Textarea placeholder="Breve descripción de la actividad" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    {isEditing && actividad.estado === 'inscripcion_abierta' && (
                                        <FormField
                                            control={form.control}
                                            name="comensalesNoUsuarios"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Comensales No Usuarios</FormLabel>
                                                    <FormControl>
                                                        <Input type="number" {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    )}
                                    {modoAtencionActividad === 'residencia' && (
                                        <FormField
                                            control={form.control}
                                            name="comedorActividad"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Comedor</FormLabel>
                                                    <Select onValueChange={field.onChange} value={field.value ?? undefined}>
                                                        <FormControl>
                                                            <SelectTrigger><SelectValue placeholder="Seleccionar comedor..." /></SelectTrigger>
                                                        </FormControl>
                                                        <SelectContent className="z-[250]">
                                                            <SelectItem value="comensal">Su propio comedor (Residente)</SelectItem>
                                                            {comedoresList.map(c => (
                                                                <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    )}
                                </div>

                                <div className="space-y-4">
                                    <h3 className="text-lg font-semibold border-b pb-2">Campos de cálculo de comidas</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <FormField
                                            control={form.control}
                                            name="fechaInicio"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Fecha de Inicio</FormLabel>
                                                    <FormControl>
                                                        <Input type="date" {...field} disabled={isEditing && !['borrador', 'inscripcion_abierta'].includes(actividad.estado)} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name="fechaFin"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Fecha de Fin</FormLabel>
                                                    <FormControl>
                                                        <Input type="date" {...field} disabled={isEditing && !['borrador', 'inscripcion_abierta'].includes(actividad.estado)} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <FormField
                                            control={form.control}
                                            name="tiempoComidaInicial"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Primer tiempo excluido</FormLabel>
                                                    <Select onValueChange={field.onChange} value={field.value ?? undefined} disabled={isEditing && !['borrador', 'inscripcion_abierta'].includes(actividad.estado)}>
                                                        <FormControl>
                                                            <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                                                        </FormControl>
                                                        <SelectContent className="z-[250]">
                                                            {tiemposComidaList.map(tc => (
                                                                <SelectItem key={tc.id} value={tc.id}>{tc.nombre} ({tc.dia ? DayOfWeekMap[tc.dia] : 'General'})</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name="tiempoComidaFinal"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Último tiempo excluido</FormLabel>
                                                    <Select onValueChange={field.onChange} value={field.value ?? undefined} disabled={isEditing && !['borrador', 'inscripcion_abierta'].includes(actividad.estado)}>
                                                        <FormControl>
                                                            <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                                                        </FormControl>
                                                        <SelectContent className="z-[250]">
                                                            {tiemposComidaList.map(tc => (
                                                                <SelectItem key={tc.id} value={tc.id}>{tc.nombre} ({tc.dia ? DayOfWeekMap[tc.dia] : 'General'})</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </div>
                                    <FormField
                                        control={form.control}
                                        name="modoAtencionActividad"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Modo de Atención</FormLabel>
                                                <Select onValueChange={field.onChange} value={field.value ?? undefined} disabled={isEditing && !['borrador', 'inscripcion_abierta'].includes(actividad.estado)}>
                                                    <FormControl>
                                                        <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent className="z-[250]">
                                                        <SelectItem value="residencia">Residencia (Se suma a los comensales normales)</SelectItem>
                                                        <SelectItem value="externa">Externa (Se muestra por separado)</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    
                                    <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
                                        <div className="flex justify-between items-center">
                                            <h3 className="text-base font-semibold">Plan de Comidas de la Actividad</h3>
                                            <Button type="button" variant="outline" size="sm" onClick={() => append({ nombreTiempoComida_AlternativaUnica: '', nombreGrupoTiempoComida: '', ordenGrupoTiempoComida: 0, fecha: form.watch('fechaInicio') || new Date().toISOString().split('T')[0] })} disabled={isEditing && !['borrador', 'inscripcion_abierta'].includes(actividad.estado)}>
                                                <PlusCircle className="mr-2 h-4 w-4" />Añadir Comida
                                            </Button>
                                        </div>
                                        <div className="space-y-3">
                                            {fields.map((item, index) => (
                                                <div key={item.id} className="p-3 bg-card shadow-sm border rounded-lg">
                                                    <div className="flex justify-between items-center mb-3">
                                                        <p className="font-semibold text-sm">Comida #{index + 1}</p>
                                                        <Button type="button" variant="ghost" size="icon" className="text-destructive h-8 w-8 hover:bg-destructive/10" onClick={() => remove(index)} disabled={isEditing && !['borrador', 'inscripcion_abierta'].includes(actividad.estado)}>
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                        <FormField control={form.control} name={`planComidas.${index}.nombreGrupoTiempoComida`} render={({ field }) => (<FormItem><FormLabel className="text-xs">Nombre Grupo (ej: Almuerzo)</FormLabel><FormControl><Input {...field} disabled={isEditing && !['borrador', 'inscripcion_abierta'].includes(actividad.estado)} /></FormControl></FormItem>)} />
                                                        <FormField control={form.control} name={`planComidas.${index}.nombreTiempoComida_AlternativaUnica`} render={({ field }) => (<FormItem><FormLabel className="text-xs">Nombre Alternativa Única (ej: Buffet)</FormLabel><FormControl><Input {...field} disabled={isEditing && !['borrador', 'inscripcion_abierta'].includes(actividad.estado)} /></FormControl></FormItem>)} />
                                                        <FormField control={form.control} name={`planComidas.${index}.fecha`} render={({ field }) => (<FormItem><FormLabel className="text-xs">Fecha</FormLabel><FormControl><Input type="date" {...field} disabled={isEditing && !['borrador', 'inscripcion_abierta'].includes(actividad.estado)} /></FormControl></FormItem>)} />
                                                        <FormField control={form.control} name={`planComidas.${index}.ordenGrupoTiempoComida`} render={({ field }) => (<FormItem><FormLabel className="text-xs">Orden (número)</FormLabel><FormControl><Input type="number" {...field} onChange={event => field.onChange(+event.target.value)} disabled={isEditing && !['borrador', 'inscripcion_abierta'].includes(actividad.estado)} /></FormControl></FormItem>)} />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                
                                <div className="space-y-4">
                                    <h3 className="text-lg font-semibold border-b pb-2">Campos de lógica de inscripción</h3>
                                    <FormField
                                        control={form.control}
                                        name="requiereInscripcion"
                                        render={({ field }) => (
                                            <FormItem className="flex items-center space-x-2 p-2 border rounded-md bg-muted/20">
                                                <FormControl>
                                                    <Checkbox checked={field.value} onCheckedChange={field.onChange} disabled={isEditing && !['borrador', 'inscripcion_abierta'].includes(actividad.estado)} />
                                                </FormControl>
                                                <FormLabel className="cursor-pointer font-medium !mt-0">¿Requiere Inscripción Voluntaria?</FormLabel>
                                            </FormItem>
                                        )}
                                    />
                                    {requiereInscripcion && (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
                                            <FormField
                                                control={form.control}
                                                name="tipoAccesoResidentes"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>Acceso para Residentes</FormLabel>
                                                        <Select onValueChange={field.onChange} value={field.value ?? undefined} disabled={isEditing && !['borrador', 'inscripcion_abierta'].includes(actividad.estado)}>
                                                            <FormControl><SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger></FormControl>
                                                            <SelectContent className="z-[250]"><SelectItem value="abierta">Abierta (Inscripción libre)</SelectItem><SelectItem value="invitacion_requerida">Por Invitación (Admin invita)</SelectItem><SelectItem value="opcion_unica">Opción Única (No hay otra comida)</SelectItem></SelectContent>
                                                        </Select>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                            <FormField
                                                control={form.control}
                                                name="tipoAccesoInvitados"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>Acceso para Invitados Exteriores</FormLabel>
                                                        <Select onValueChange={field.onChange} value={field.value ?? undefined} disabled={isEditing && !['borrador', 'inscripcion_abierta'].includes(actividad.estado)}>
                                                            <FormControl><SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger></FormControl>
                                                            <SelectContent className="z-[250]"><SelectItem value="abierta">Abierta</SelectItem><SelectItem value="invitacion_requerida">Por Invitación</SelectItem><SelectItem value="opcion_unica">Opción Única</SelectItem></SelectContent>
                                                        </Select>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                        </div>
                                    )}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <FormField
                                            control={form.control}
                                            name="maxParticipantes"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Máximo de Participantes (opcional)</FormLabel>
                                                    <FormControl><Input type="number" placeholder="Sin límite si está vacío" {...field} onChange={event => field.onChange(event.target.value === '' ? undefined : +event.target.value)} /></FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name="diasAntelacionSolicitudAdministracion"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Días antelación solicitud admin</FormLabel>
                                                    <FormControl><Input type="number" {...field} onChange={event => field.onChange(event.target.value === '' ? undefined : +event.target.value)} /></FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </div>
                                </div>
                                
                                <div className="space-y-4">
                                    <h3 className="text-lg font-semibold border-b pb-2">Campos de costo</h3>
                                    <FormField
                                        control={form.control}
                                        name="defaultCentroCostoId"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Centro de Costo Imputable</FormLabel>
                                                <Select onValueChange={field.onChange} value={field.value ?? undefined}>
                                                    <FormControl><SelectTrigger><SelectValue placeholder="Centro de costo por defecto..." /></SelectTrigger></FormControl>
                                                    <SelectContent className="z-[250]">{centroCostosList.map(cc => (<SelectItem key={cc.id} value={cc.id}>{cc.nombre} ({cc.codigoInterno})</SelectItem>))}</SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>
                            </form>
                        </Form>
                    </div>
                    <DialogFooter className="p-6 pt-4 border-t">
                        <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>Cancelar</Button>
                        <Button type="submit" form="activity-form" disabled={isPending}>
                            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {isEditing ? 'Guardar Cambios' : 'Crear Actividad'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <AlertDialog open={showEmptyPlanWarning} onOpenChange={setShowEmptyPlanWarning}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Plan de Comidas Vacío</AlertDialogTitle>
                        <AlertDialogDescription>
                            Estás a punto de crear una actividad sin comidas en el plan. ¿Estás seguro de que quieres continuar?
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => form.handleSubmit(handleActualSubmit)()}>Sí, continuar</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
