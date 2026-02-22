"use client";

import { useState } from 'react';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Archive, ArchiveRestore, PlusCircle } from 'lucide-react';
import { useHorariosAlmacen } from '../../_lib/useHorariosAlmacen';
import { HorarioSolicitudDataSchema, type HorarioSolicitudData } from 'shared/schemas/horarios';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { slugify } from 'shared/utils/commonUtils';
import { DiaDeLaSemanaSchema } from 'shared/schemas/fechas';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

// Omitting 'estaActivo' as it's handled by the archive toggle, not the form.
type FormValues = Omit<HorarioSolicitudData, 'estaActivo'>;

const DIAS_SEMANA = DiaDeLaSemanaSchema.options; // ['lunes', 'martes', ...]
const DIAS_SEMANA_ORDEN = Object.fromEntries(DIAS_SEMANA.map((dia, index) => [dia, index]));


export default function Paso2Cortes() {
    const { 
        datosBorrador, 
        mostrarInactivos, 
        toggleMostrarInactivos, 
        upsertHorarioSolicitud,
        setPasoActual
    } = useHorariosAlmacen();

    // null = not editing, 'new' = creating, or the slug for editing
    const [editingId, setEditingId] = useState<string | null>(null);

    const { register, handleSubmit, reset, watch, formState: { errors } } = useForm<FormValues>({
        resolver: zodResolver(HorarioSolicitudDataSchema.omit({ estaActivo: true })),
        defaultValues: {
            nombre: '',
            dia: 'lunes',
            horaSolicitud: '10:00',
            esPrimario: false
        }
    });

    const avanzarPaso = () => setPasoActual(3);
    const retrocederPaso = () => setPasoActual(1);

    const horariosArray = Object.entries(datosBorrador.horariosSolicitud || {})
        .sort(([, a], [, b]) => {
            // Sort by day of the week index first
            const diaCompare = DIAS_SEMANA_ORDEN[a.dia] - DIAS_SEMANA_ORDEN[b.dia];
            if (diaCompare !== 0) return diaCompare;
            // Then sort by time
            return a.horaSolicitud.localeCompare(b.horaSolicitud);
        });

    const filteredHorarios = mostrarInactivos ? horariosArray : horariosArray.filter(([, horario]) => horario.estaActivo);
    
    const hasActiveHorarios = Object.values(datosBorrador.horariosSolicitud || {}).some(h => h.estaActivo);

    const handleEditClick = (id: string, horario: HorarioSolicitudData) => {
        setEditingId(id);
        reset({
            nombre: horario.nombre,
            dia: horario.dia,
            horaSolicitud: horario.horaSolicitud.startsWith('T') ? horario.horaSolicitud.substring(1) : horario.horaSolicitud,
            esPrimario: horario.esPrimario
        });
    };

    const handleAddNewClick = () => {
        setEditingId('new');
        reset({
            nombre: '',
            dia: 'lunes',
            horaSolicitud: '10:00',
            esPrimario: false
        });
    };

    const handleCancel = () => {
        setEditingId(null);
        reset();
    };

    const handleArchiveToggle = (id: string, horario: HorarioSolicitudData) => {
        upsertHorarioSolicitud(id, { ...horario, estaActivo: !horario.estaActivo });
    };

    const onSubmit: SubmitHandler<FormValues> = (data) => {
        const id = editingId === 'new' ? slugify(data.nombre) : editingId;
        if (!id) return;
        
        if (editingId === 'new' && datosBorrador.horariosSolicitud[id]) {
            // A simple alert is fine for this client-side validation
            alert(`Error: El horario con el nombre "${data.nombre}" ya existe. El nombre debe ser único.`);
            return;
        }
        
        const estaActivo = editingId === 'new' ? true : datosBorrador.horariosSolicitud[editingId!]?.estaActivo ?? true;
        
        // The schema validator handles the 'T' prefix, so we can pass the time directly
        upsertHorarioSolicitud(id, { ...data, horaSolicitud: data.horaSolicitud, estaActivo });
        setEditingId(null);
        reset();
    };
    
    const renderForm = () => (
        <form onSubmit={handleSubmit(onSubmit)} className="bg-slate-100 dark:bg-slate-800 p-4 rounded-lg my-4 border border-slate-200 dark:border-slate-700">
            <h3 className="font-semibold text-lg mb-3 text-slate-800 dark:text-slate-200">
                {editingId === 'new' ? 'Añadir Nuevo Corte' : 'Editar Corte'}
            </h3>
            <div className="space-y-4">
                {/* Nombre */}
                <div>
                    <Label htmlFor="nombre">Nombre</Label>
                    <input
                        id="nombre"
                        type="text"
                        {...register('nombre')}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm px-3 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
                        readOnly={editingId !== 'new'}
                        disabled={editingId !== 'new'}
                    />
                    {errors.nombre && <p className="text-red-500 text-xs mt-1">{errors.nombre.message}</p>}
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Dia de la Semana */}
                    <div>
                        <Label htmlFor="dia">Día</Label>
                        <select
                            id="dia"
                            {...register('dia')}
                            className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm px-3 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                            {DIAS_SEMANA.map(dia => (
                                <option key={dia} value={dia} className="capitalize">{dia.charAt(0).toUpperCase() + dia.slice(1)}</option>
                            ))}
                        </select>
                        {errors.dia && <p className="text-red-500 text-xs mt-1">{errors.dia.message}</p>}
                    </div>

                    {/* Hora de Solicitud */}
                    <div>
                        <Label htmlFor="horaSolicitud">Hora</Label>
                        <input
                            id="horaSolicitud"
                            type="time"
                            {...register('horaSolicitud')}
                            className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm px-3 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                        {errors.horaSolicitud && <p className="text-red-500 text-xs mt-1">{errors.horaSolicitud.message}</p>}
                    </div>
                </div>

                {/* Es Primario */}
                <div className="flex items-center space-x-2 pt-2">
                    <Switch
                        id="esPrimario"
                        checked={watch('esPrimario')}
                        onCheckedChange={(checked) => reset({ ...watch(), esPrimario: checked })}
                    />
                    <Label htmlFor="esPrimario" className="cursor-pointer">
                        ¿Es el horario principal para este día?
                    </Label>
                </div>
                 {errors.esPrimario && <p className="text-red-500 text-xs mt-1">{errors.esPrimario.message}</p>}
            </div>

            <div className="flex items-center justify-end gap-3 mt-4">
                <button type="button" onClick={handleCancel} className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 bg-transparent rounded-md hover:bg-slate-200 dark:hover:bg-slate-700">
                    Cancelar
                </button>
                <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
                    Guardar
                </button>
            </div>
        </form>
    );
    
    const renderNavButtons = () => {
        const nextButton = (
            <button
                onClick={avanzarPaso}
                disabled={!hasActiveHorarios}
                className="w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                Siguiente
            </button>
        );

        return (
            <div className="grid grid-cols-2 gap-4">
                <button
                    onClick={retrocederPaso}
                    className="w-full bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold py-3 px-4 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
                >
                    Anterior
                </button>
                {!hasActiveHorarios ? (
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <span tabIndex={0} className="block w-full">{nextButton}</span>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>Debe tener al menos un horario de corte activo.</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                ) : (
                    nextButton
                )}
            </div>
        );
    };

    return (
        <div className="p-4 max-w-2xl mx-auto">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2">Paso 2: Horarios de Corte (Solicitudes)</h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">Define las horas límite para que los usuarios puedan solicitar comidas para cada día.</p>


            <div className="flex items-center justify-start mt-4 mb-6">
                 <div className="flex items-center space-x-2">
                    <Switch id="show-inactive" checked={mostrarInactivos} onCheckedChange={toggleMostrarInactivos} />
                    <Label htmlFor="show-inactive">Mostrar Inactivos</Label>
                </div>
            </div>

            {editingId && renderForm()}

            <div className="space-y-3">
                {filteredHorarios.map(([id, horario]) => (
                    <div
                        key={id}
                        className={`p-3 rounded-lg border flex items-center justify-between transition-opacity ${
                            horario.estaActivo ? 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700' : 'bg-slate-50 dark:bg-slate-800/30 border-slate-200/70 opacity-60'
                        }`}
                    >
                        <div className="flex flex-col sm:flex-row sm:items-center sm:gap-4">
                           <div className="font-semibold text-slate-800 dark:text-slate-200">{horario.nombre}</div>
                           <div className="flex items-center gap-4 text-sm text-slate-500 dark:text-slate-400">
                                <span className="capitalize">{horario.dia}</span>
                                <span>{horario.horaSolicitud.replace('T', '')}</span>
                                {horario.esPrimario && (
                                    <span className="inline-block bg-blue-100 text-blue-800 text-xs font-semibold px-2.5 py-0.5 rounded-full dark:bg-blue-900 dark:text-blue-300">
                                        Principal
                                    </span>
                                )}
                           </div>
                        </div>

                        <div className="flex items-center gap-1 flex-shrink-0">
                             <button 
                                onClick={() => handleEditClick(id, horario)}
                                className="px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md"
                                aria-label="Editar"
                            >
                                Editar
                            </button>
                            <button 
                                onClick={() => handleArchiveToggle(id, horario)}
                                className="p-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 rounded-md"
                                aria-label={horario.estaActivo ? 'Archivar' : 'Reactivar'}
                            >
                                {horario.estaActivo ? <Archive className="h-4 w-4" /> : <ArchiveRestore className="h-4 w-4" />}
                            </button>
                        </div>
                    </div>
                ))}
            </div>
            
            {!editingId && (
                 <button 
                    onClick={handleAddNewClick}
                    className="w-full flex items-center justify-center gap-2 mt-4 px-4 py-3 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:border-slate-400 dark:hover:border-slate-500 transition-colors"
                >
                    <PlusCircle className="h-5 w-5" />
                    Añadir Horario de Corte
                </button>
            )}

            <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-700">
                {renderNavButtons()}
            </div>
        </div>
    );
}
