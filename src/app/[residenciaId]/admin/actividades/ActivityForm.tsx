'use client';

import { useState, useTransition, useEffect } from 'react';
import { z } from 'zod';
import { useForm, Controller, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Actividad, ResidenciaId, TiempoComida, CentroCosto, DayOfWeekMap } from '@/../shared/models/types';
import { ActividadCreateSchema, ActividadUpdateSchema } from '@/../shared/schemas/actividades';
import { createActividad, updateActividad } from './actions';

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useToast } from "@/hooks/useToast";
import { Loader2, XIcon, PlusCircle, Trash2 } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';


interface ActivityFormProps {
    residenciaId: ResidenciaId;
    onClose: () => void;
    actividad?: Actividad | null;
    tiemposComidaList: TiempoComida[];
    centroCostosList: CentroCosto[];
    comedoresList: any[]; // Ideally Comedor[] but any for now to avoid import issues if not available
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

    const { register, handleSubmit, control, watch, setValue, formState: { errors } } = useForm<ActividadFormData>({
        resolver: zodResolver(schema),
        defaultValues: isEditing ? {
            ...actividad,
             fechaInicio: actividad.fechaInicio,
             fechaFin: actividad.fechaFin,
        } : {
            nombre: '',
            descripcion: '',
            fechaInicio: new Date().toISOString().slice(0, 10), // Use YYYY-MM-DD
            fechaFin: new Date().toISOString().slice(0, 10), // Use YYYY-MM-DD
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
        control,
        name: "planComidas",
    });

    const requiereInscripcion = watch('requiereInscripcion');
    const modoAtencionActividad = watch('modoAtencionActividad');
    
    useEffect(() => {
        if (modoAtencionActividad === 'externa') {
            setValue('comedorActividad', undefined);
        }
    }, [modoAtencionActividad, setValue]);


    const processSubmit = (data: ActividadFormData) => {
        console.log("Form processSubmit triggered with data:", data);
        if (!data.planComidas || data.planComidas.length === 0) {
            console.warn("processSubmit: planComidas is empty");
            setShowEmptyPlanWarning(true);
            return;
        }
        handleActualSubmit(data);
    };
    
    const handleActualSubmit = (data: ActividadFormData) => {
        console.log("handleActualSubmit: starting transition");
        startTransition(async () => {
            try {
                const result = isEditing
                    ? await updateActividad(actividad.id, residenciaId, data)
                    : await createActividad(residenciaId, data);

                console.log("Submit result:", result);

                if (result.success) {
                    toast({ title: `Actividad ${isEditing ? 'actualizada' : 'creada'} con éxito` });
                    onClose();
                } else {
                    const errorMsg = typeof result.error === 'string' ? result.error : 'Error de validación';
                    toast({ title: 'Error', description: errorMsg, variant: 'destructive' });
                    console.error("Submit error details:", JSON.stringify(result.error, null, 2));
                }
            } catch (err) {
                console.error("Unexpected error in handleActualSubmit:", err);
                toast({ title: 'Error inesperado', description: 'Ocurrió un error al procesar el formulario.', variant: 'destructive' });
            }
        });
    };

    return (
        <>
        <div className="fixed inset-0 bg-black/60 z-[200] backdrop-blur-sm" onClick={onClose}></div>
        <div className="fixed inset-0 z-[210] flex items-center justify-center p-4 pointer-events-none">
            <Card className="w-full max-w-3xl max-h-[90vh] overflow-y-auto flex flex-col pointer-events-auto shadow-2xl border-2">
                <CardHeader className="flex-shrink-0">
                    <CardTitle>{isEditing ? 'Editar Actividad' : 'Crear Nueva Actividad'}</CardTitle>
                    <Button variant="ghost" size="icon" className="absolute top-4 right-4" onClick={onClose}>
                        <XIcon className="h-5 w-5" />
                    </Button>
                </CardHeader>
                <form 
                    onSubmit={handleSubmit(processSubmit, (errors) => {
                        console.error("Form validation errors:", errors);
                        toast({ 
                            title: 'Error de validación', 
                            description: 'Por favor, revisa los campos marcados en rojo.', 
                            variant: 'destructive' 
                        });
                    })} 
                    className="flex-grow contents"
                >
                    <CardContent className="space-y-4 py-4 flex-grow">
                        <Accordion type="multiple" defaultValue={['generales', 'calculo-comidas', 'logica-inscripcion', 'costo']} className="w-full">
                            {/* Campos generales */}
                            <AccordionItem value="generales">
                                <AccordionTrigger className="text-lg font-semibold">Campos generales</AccordionTrigger>
                                <AccordionContent className="space-y-4 pt-2">
                                    <div>
                                        <Label htmlFor="nombre">Nombre</Label>
                                        <Input id="nombre" {...register('nombre')} placeholder="Nombre de la actividad" />
                                        {errors.nombre && <p className="text-destructive text-sm font-medium mt-1">{errors.nombre.message}</p>}
                                    </div>
                                    <div>
                                        <Label htmlFor="descripcion">Descripción (opcional)</Label>
                                        <Textarea id="descripcion" {...register('descripcion')} placeholder="Breve descripción de la actividad" />
                                        {errors.descripcion && <p className="text-destructive text-sm font-medium mt-1">{errors.descripcion.message}</p>}
                                    </div>
                                     {isEditing && actividad.estado === 'inscripcion_abierta' && (
                                        <div>
                                            <Label htmlFor="comensalesNoUsuarios">Comensales No Usuarios</Label>
                                            <Input id="comensalesNoUsuarios" type="number" {...register('comensalesNoUsuarios', { valueAsNumber: true })} />
                                            {errors.comensalesNoUsuarios && <p className="text-destructive text-sm font-medium mt-1">{errors.comensalesNoUsuarios.message}</p>}
                                        </div>
                                     )}
                                    {modoAtencionActividad === 'residencia' && (
                                    <div>
                                        <Label htmlFor="comedorActividad">Comedor</Label>
                                        <Controller
                                            name="comedorActividad"
                                            control={control}
                                            render={({ field }) => (
                                                <Select onValueChange={field.onChange} value={field.value ?? undefined}>
                                                    <SelectTrigger><SelectValue placeholder="Seleccionar comedor..." /></SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="comensal">Su propio comedor (Residente)</SelectItem>
                                                        {comedoresList.map(c => (
                                                            <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            )}
                                        />
                                        {errors.comedorActividad && <p className="text-destructive text-sm font-medium mt-1">{errors.comedorActividad.message}</p>}
                                    </div>
                                    )}
                                </AccordionContent>
                            </AccordionItem>

                            {/* Campos de cálculo de comidas */}
                            <AccordionItem value="calculo-comidas">
                                <AccordionTrigger className="text-lg font-semibold">Campos de cálculo de comidas</AccordionTrigger>
                                <AccordionContent className="space-y-4 pt-2">
                                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <Label htmlFor="fechaInicio">Fecha de Inicio</Label>
                                            <Input 
                                                id="fechaInicio" 
                                                type="date" 
                                                {...register('fechaInicio')} 
                                                disabled={isEditing && actividad.estado !== 'borrador'} 
                                            />
                                            {errors.fechaInicio && <p className="text-destructive text-sm font-medium mt-1">{errors.fechaInicio.message}</p>}
                                        </div>
                                        <div>
                                            <Label htmlFor="fechaFin">Fecha de Fin</Label>
                                            <Input 
                                                id="fechaFin" 
                                                type="date" 
                                                {...register('fechaFin')} 
                                                disabled={isEditing && actividad.estado !== 'borrador'}
                                            />
                                            {errors.fechaFin && <p className="text-destructive text-sm font-medium mt-1">{errors.fechaFin.message}</p>}
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <Label htmlFor="tiempoComidaInicial">Primer tiempo excluido</Label>
                                            <Controller
                                                name="tiempoComidaInicial"
                                                control={control}
                                                render={({ field }) => (
                                                    <Select 
                                                        onValueChange={field.onChange} 
                                                        defaultValue={field.value}
                                                        disabled={isEditing && actividad.estado !== 'borrador'}
                                                    >
                                                        <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                                                        <SelectContent>
                                                            {tiemposComidaList.map(tc => (
                                                                <SelectItem key={tc.id} value={tc.id}>{tc.nombre} ({tc.dia ? DayOfWeekMap[tc.dia] : 'General'})</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                )}
                                            />
                                            {errors.tiempoComidaInicial && <p className="text-destructive text-sm font-medium mt-1">{errors.tiempoComidaInicial.message}</p>}
                                        </div>
                                        <div>
                                            <Label htmlFor="tiempoComidaFinal">Último tiempo excluido</Label>
                                             <Controller
                                                name="tiempoComidaFinal"
                                                control={control}
                                                render={({ field }) => (
                                                    <Select 
                                                        onValueChange={field.onChange} 
                                                        defaultValue={field.value}
                                                        disabled={isEditing && actividad.estado !== 'borrador'}
                                                    >
                                                        <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                                                        <SelectContent>
                                                            {tiemposComidaList.map(tc => (
                                                                <SelectItem key={tc.id} value={tc.id}>{tc.nombre} ({tc.dia ? DayOfWeekMap[tc.dia] : 'General'})</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                )}
                                            />
                                            {errors.tiempoComidaFinal && <p className="text-destructive text-sm font-medium mt-1">{errors.tiempoComidaFinal.message}</p>}
                                        </div>
                                    </div>

                                    <div>
                                        <Label htmlFor="modoAtencionActividad">Modo de Atención</Label>
                                        <Controller
                                            name="modoAtencionActividad"
                                            control={control}
                                            render={({ field }) => (
                                                <Select 
                                                    onValueChange={field.onChange} 
                                                    defaultValue={field.value}
                                                    disabled={isEditing && actividad.estado !== 'borrador'}
                                                >
                                                    <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="residencia">Residencia (Se suma a los comensales normales)</SelectItem>
                                                        <SelectItem value="externa">Externa (Se muestra por separado)</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            )}
                                        />
                                        {errors.modoAtencionActividad && <p className="text-destructive text-sm font-medium mt-1">{errors.modoAtencionActividad.message}</p>}
                                    </div>
                                    
                                     {/* Plan de Comidas */}
                                    <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
                                        <div className="flex justify-between items-center">
                                            <Label className="text-base">Plan de Comidas de la Actividad</Label>
                                            <Button 
                                                type="button" 
                                                variant="outline" 
                                                size="sm" 
                                                onClick={() => append({ 
                                                    nombreTiempoComida_AlternativaUnica: '', 
                                                    nombreGrupoTiempoComida: '', 
                                                    ordenGrupoTiempoComida: 0, 
                                                    fecha: watch('fechaInicio') || new Date().toISOString().split('T')[0] 
                                                })}
                                                disabled={isEditing && actividad.estado !== 'borrador'}
                                            >
                                                <PlusCircle className="mr-2 h-4 w-4" />Añadir Comida
                                            </Button>
                                        </div>
                                         <div className="space-y-3">
                                            {fields.map((field, index) => (
                                                <Card key={field.id} className="p-3 bg-card shadow-sm border-2">
                                                    <div className="flex justify-between items-center mb-3">
                                                        <p className="font-semibold text-sm">Comida #{index + 1}</p>
                                                        <Button 
                                                            type="button" 
                                                            variant="ghost" 
                                                            size="icon" 
                                                            className="text-destructive h-8 w-8 hover:bg-destructive/10" 
                                                            onClick={() => remove(index)}
                                                            disabled={isEditing && actividad.estado !== 'borrador'}
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                     <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                         <div className="space-y-1">
                                                             <Label className="text-xs">Nombre Grupo (ej: Almuerzo)</Label>
                                                             <Input 
                                                                {...register(`planComidas.${index}.nombreGrupoTiempoComida` as const)} 
                                                                disabled={isEditing && actividad.estado !== 'borrador'}
                                                             />
                                                         </div>
                                                         <div className="space-y-1">
                                                             <Label className="text-xs">Nombre Alternativa Única (ej: Buffet)</Label>
                                                             <Input 
                                                                {...register(`planComidas.${index}.nombreTiempoComida_AlternativaUnica` as const)} 
                                                                disabled={isEditing && actividad.estado !== 'borrador'}
                                                             />
                                                         </div>
                                                         <div className="space-y-1">
                                                             <Label className="text-xs">Fecha</Label>
                                                             <Input 
                                                                type="date" 
                                                                {...register(`planComidas.${index}.fecha` as const)} 
                                                                disabled={isEditing && actividad.estado !== 'borrador'}
                                                             />
                                                         </div>
                                                         <div className="space-y-1">
                                                             <Label className="text-xs">Orden (número)</Label>
                                                             <Input 
                                                                type="number" 
                                                                {...register(`planComidas.${index}.ordenGrupoTiempoComida` as const, { valueAsNumber: true })} 
                                                                disabled={isEditing && actividad.estado !== 'borrador'}
                                                             />
                                                         </div>
                                                     </div>
                                                </Card>
                                            ))}
                                         </div>
                                    </div>
                                </AccordionContent>
                            </AccordionItem>
                            
                            {/* Campos de lógica de inscripción */}
                            <AccordionItem value="logica-inscripcion">
                                <AccordionTrigger className="text-lg font-semibold">Campos de lógica de inscripción</AccordionTrigger>
                                <AccordionContent className="space-y-4 pt-2">
                                    <div className="flex items-center space-x-2 p-2 border rounded-md bg-muted/20">
                                        <Controller
                                            name="requiereInscripcion"
                                            control={control}
                                            render={({ field }) => (
                                                <Checkbox 
                                                    id="requiereInscripcion" 
                                                    checked={field.value} 
                                                    onCheckedChange={field.onChange}
                                                    disabled={isEditing && actividad.estado !== 'borrador'}
                                                />
                                            )}
                                        />
                                        <Label htmlFor="requiereInscripcion" className="cursor-pointer font-medium">¿Requiere Inscripción Voluntaria?</Label>
                                    </div>
                                    {requiereInscripcion && (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
                                            <div>
                                                <Label htmlFor="tipoAccesoResidentes">Acceso para Residentes</Label>
                                                <Controller
                                                    name="tipoAccesoResidentes"
                                                    control={control}
                                                    render={({ field }) => (
                                                        <Select 
                                                            onValueChange={field.onChange} 
                                                            defaultValue={field.value}
                                                            disabled={isEditing && actividad.estado !== 'borrador'}
                                                        >
                                                            <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="abierta">Abierta (Inscripción libre)</SelectItem>
                                                                <SelectItem value="invitacion_requerida">Por Invitación (Admin invita)</SelectItem>
                                                                <SelectItem value="opcion_unica">Opción Única (No hay otra comida)</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    )}
                                                />
                                                {errors.tipoAccesoResidentes && <p className="text-destructive text-sm font-medium mt-1">{errors.tipoAccesoResidentes.message}</p>}
                                            </div>
                                             <div>
                                                <Label htmlFor="tipoAccesoInvitados">Acceso para Invitados Exteriores</Label>
                                                <Controller
                                                    name="tipoAccesoInvitados"
                                                    control={control}
                                                    render={({ field }) => (
                                                        <Select 
                                                            onValueChange={field.onChange} 
                                                            defaultValue={field.value}
                                                            disabled={isEditing && actividad.estado !== 'borrador'}
                                                        >
                                                            <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="abierta">Abierta</SelectItem>
                                                                <SelectItem value="invitacion_requerida">Por Invitación</SelectItem>
                                                                <SelectItem value="opcion_unica">Opción Única</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    )}
                                                />
                                            </div>
                                        </div>
                                    )}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <Label htmlFor="maxParticipantes">Máximo de Participantes (opcional)</Label>
                                            <Input 
                                                id="maxParticipantes" 
                                                type="number" 
                                                {...register('maxParticipantes', { valueAsNumber: true })} 
                                                placeholder="Sin límite si está vacío"
                                            />
                                            {errors.maxParticipantes && <p className="text-destructive text-sm font-medium mt-1">{errors.maxParticipantes.message}</p>}
                                        </div>
                                        <div>
                                            <Label htmlFor="diasAntelacion">Días antelación solicitud admin</Label>
                                            <Input 
                                                id="diasAntelacion" 
                                                type="number" 
                                                {...register('diasAntelacionSolicitudAdministracion', { valueAsNumber: true })} 
                                            />
                                             {errors.diasAntelacionSolicitudAdministracion && <p className="text-destructive text-sm font-medium mt-1">{errors.diasAntelacionSolicitudAdministracion.message}</p>}
                                        </div>
                                    </div>
                                </AccordionContent>
                            </AccordionItem>
                            
                            {/* Campos de costo */}
                            <AccordionItem value="costo">
                                <AccordionTrigger className="text-lg font-semibold">Campos de costo</AccordionTrigger>
                                <AccordionContent className="space-y-4 pt-2">
                                     <div>
                                        <Label htmlFor="defaultCentroCostoId">Centro de Costo Imputable</Label>
                                        <Controller
                                            name="defaultCentroCostoId"
                                            control={control}
                                            render={({ field }) => (
                                                <Select onValueChange={field.onChange} defaultValue={field.value ?? undefined}>
                                                    <SelectTrigger><SelectValue placeholder="Centro de costo por defecto..." /></SelectTrigger>
                                                    <SelectContent>
                                                        {centroCostosList.map(cc => (
                                                            <SelectItem key={cc.id} value={cc.id}>{cc.nombre} ({cc.codigoInterno})</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            )}
                                        />
                                    </div>
                                </AccordionContent>
                            </AccordionItem>
                        </Accordion>
                    </CardContent>
                    <CardFooter className="flex-shrink-0 flex flex-col items-end space-y-2 sticky bottom-0 bg-background py-4 border-t z-10">

                        <div className="flex justify-end space-x-2 w-full">
                            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>Cancelar</Button>
                            <Button type="submit" disabled={isPending}>
                                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                {isEditing ? 'Guardar Cambios' : 'Crear Actividad'}
                            </Button>
                        </div>
                    </CardFooter>
                </form>
            </Card>
        </div>

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
                    <AlertDialogAction onClick={() => handleSubmit(handleActualSubmit)()}>Sí, continuar</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
        </>
    );
}
