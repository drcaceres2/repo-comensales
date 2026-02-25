"use client";

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Calendar, ChevronsUpDown, Archive, ArchiveRestore, PlusCircle } from 'lucide-react';
import { useHorariosAlmacen } from '../../_lib/useHorariosAlmacen';
import { GrupoComidaSchema, type GrupoComida } from 'shared/schemas/horarios';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { slugify } from 'shared/utils/commonUtils';

type FormValues = Omit<GrupoComida, 'estaActivo'>;

export default function Paso1Grupos() {
    const { residenciaId } = useParams<{ residenciaId: string }>();
    const { 
        datosBorrador, 
        mostrarInactivos, 
        toggleMostrarInactivos, 
        upsertGrupoComida,
        setPasoActual
    } = useHorariosAlmacen();

    const [editingId, setEditingId] = useState<string | null>(null); // null = not editing, 'new' = creating, or the slug for editing

    const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({
        resolver: zodResolver(GrupoComidaSchema.omit({ estaActivo: true })),
        defaultValues: {
            nombre: '',
            orden: 0,
        }
    });
    
    // The prompt mentions `avanzarPaso` but the store has `setPasoActual`. I'll use `setPasoActual(2)`
    const avanzarPaso = () => setPasoActual(2);

    const gruposArray = Object.entries(datosBorrador.gruposComidas || {})
        .sort(([, a], [, b]) => a.orden - b.orden);

    const filteredGrupos = mostrarInactivos ? gruposArray : gruposArray.filter(([, grupo]) => grupo.estaActivo);
    
    const hasActiveGroups = Object.values(datosBorrador.gruposComidas || {}).some(g => g.estaActivo);

    const handleEditClick = (id: string, grupo: GrupoComida) => {
        setEditingId(id);
        reset({
            nombre: grupo.nombre,
            orden: grupo.orden,
        });
    };

    const handleAddNewClick = () => {
        setEditingId('new');
        reset({
            nombre: '',
            orden: (gruposArray.length > 0) ? Math.max(...gruposArray.map(([, g]) => g.orden)) + 1 : 0,
        });
    };

    const handleCancel = () => {
        setEditingId(null);
        reset();
    };

    const handleArchiveToggle = (id: string, grupo: GrupoComida) => {
        upsertGrupoComida(id, { ...grupo, estaActivo: !grupo.estaActivo });
    };

    const onSubmit: SubmitHandler<FormValues> = (data) => {
        const id = editingId === 'new' ? slugify(data.nombre) : editingId;
        if (!id) return;
        
        if (editingId === 'new' && datosBorrador.gruposComidas[id]) {
            alert(`Error: El grupo con el nombre "${data.nombre}" ya existe.`);
            return;
        }
        
        const estaActivo = editingId === 'new' ? true : datosBorrador.gruposComidas[editingId!]?.estaActivo ?? true;
        
        upsertGrupoComida(id, { ...data, estaActivo });
        setEditingId(null);
        reset();
    };

    const handleCreateTradicionales = () => {
        upsertGrupoComida('desayuno', { nombre: 'Desayuno', orden: 1, estaActivo: true });
        upsertGrupoComida('almuerzo', { nombre: 'Almuerzo', orden: 2, estaActivo: true });
        upsertGrupoComida('cena', { nombre: 'Cena', orden: 3, estaActivo: true });
    };
    
    const renderForm = () => (
        <form onSubmit={handleSubmit(onSubmit)} className="bg-slate-100 dark:bg-slate-800 p-4 rounded-lg my-4 border border-slate-200 dark:border-slate-700">
            <h3 className="font-semibold text-lg mb-3 text-slate-800 dark:text-slate-200">
                {editingId === 'new' ? 'Añadir Nuevo Grupo' : 'Editar Grupo'}
            </h3>
            <div className="space-y-4">
                <div>
                    <label htmlFor="nombre" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Nombre
                    </label>
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
                <div>
                    <label htmlFor="orden" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Orden
                    </label>
                    <input
                        id="orden"
                        type="number"
                        {...register('orden', { valueAsNumber: true })}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm px-3 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    {errors.orden && <p className="text-red-500 text-xs mt-1">{errors.orden.message}</p>}
                </div>
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

    const renderNextButton = () => {
        const button = (
            <button
                onClick={avanzarPaso}
                disabled={!hasActiveGroups}
                className="w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                Siguiente Paso
            </button>
        );

        if (!hasActiveGroups) {
            return (
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            {/* The button is wrapped in a span to allow the tooltip to show even when the button is disabled. */}
                            <span tabIndex={0} className="block w-full">{button}</span>
                        </TooltipTrigger>
                        <TooltipContent>
                            <p>Debe tener al menos un grupo de comida activo para continuar.</p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            );
        }

        return button;
    };

    return (
        <div className="p-4 max-w-2xl mx-auto">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4">Grupos de Comida</h1>

            <div className="flex items-center justify-start mt-4 mb-6">
                <label htmlFor="show-inactive" className="flex items-center gap-2 cursor-pointer text-sm font-medium text-slate-700 dark:text-slate-300">
                     <input
                        id="show-inactive"
                        type="checkbox"
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        checked={mostrarInactivos}
                        onChange={toggleMostrarInactivos}
                    />
                    Mostrar Inactivos
                </label>
            </div>

            {editingId && renderForm()}

            <div className="space-y-3">
                {filteredGrupos.map(([id, grupo]) => (
                    <div
                        key={id}
                        className={`p-3 rounded-lg border flex items-center justify-between transition-opacity ${
                            grupo.estaActivo ? 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700' : 'bg-slate-50 dark:bg-slate-800/30 border-slate-200/70 opacity-60'
                        }`}
                    >
                        <div className="flex items-center gap-3">
                            <p className="text-sm text-slate-400 dark:text-slate-500 w-6 text-center">{grupo.orden}</p>
                            <p className="font-semibold text-slate-800 dark:text-slate-200">{grupo.nombre}</p>
                        </div>
                        <div className="flex items-center gap-1">
                             <button 
                                onClick={() => handleEditClick(id, grupo)}
                                className="px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md"
                                aria-label="Editar"
                            >
                                Editar
                            </button>
                            <button 
                                onClick={() => handleArchiveToggle(id, grupo)}
                                className="p-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 rounded-md"
                                aria-label={grupo.estaActivo ? 'Archivar' : 'Reactivar'}
                            >
                                {grupo.estaActivo ? <Archive className="h-4 w-4" /> : <ArchiveRestore className="h-4 w-4" />}
                            </button>
                        </div>
                    </div>
                ))}
            </div>
            
            {!editingId && filteredGrupos.length === 0 && (
                <div className="text-center my-8">
                    <p className="text-slate-500 dark:text-slate-400 mb-4">No hay grupos de comida activos.</p>
                    <button
                        onClick={handleCreateTradicionales}
                        className="px-4 py-2 font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700"
                    >
                        Crear grupos tradicionales
                    </button>
                </div>
            )}

            {!editingId && (
                 <button 
                    onClick={handleAddNewClick}
                    className="w-full flex items-center justify-center gap-2 mt-4 px-4 py-3 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:border-slate-400 dark:hover:border-slate-500 transition-colors"
                >
                    <PlusCircle className="h-5 w-5" />
                    Añadir Grupo de Comida
                </button>
            )}

            <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-700">
                {renderNextButton()}
            </div>
        </div>
    );
}
