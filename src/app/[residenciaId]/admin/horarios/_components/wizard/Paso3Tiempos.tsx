"use client";

import { useState, useMemo } from 'react';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Archive, ArchiveRestore, PlusCircle, AlertTriangle, Sparkles } from 'lucide-react';
import { useHorariosAlmacen } from '../../_lib/useHorariosAlmacen';
import { TiempoComidaSchema, TiempoComidaFormSchema, type TiempoComida } from 'shared/schemas/horarios';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { slugify } from 'shared/utils/commonUtils';
import { DiaDeLaSemanaSchema } from 'shared/schemas/fechas';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { type SafeParseReturnType } from 'zod';

type FormValues = Omit<TiempoComida, 'estaActivo' | 'alternativas'>;

const DIAS_SEMANA = DiaDeLaSemanaSchema.options;
const DIAS_SEMANA_ORDEN = Object.fromEntries(DIAS_SEMANA.map((dia, index) => [dia, index]));

export default function Paso3Tiempos() {
    const {
        datosBorrador,
        mostrarInactivos,
        toggleMostrarInactivos,
        upsertTiempoComida,
        setPasoActual
    } = useHorariosAlmacen();

    const [editingId, setEditingId] = useState<string | null>(null);

    const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({
        resolver: zodResolver(TiempoComidaFormSchema),
        defaultValues: {
            nombre: '',
            dia: 'lunes',
            grupoComida: '',
            horaReferencia: '13:00',
        }
    });

    const avanzarPaso = () => setPasoActual(4);
    const retrocederPaso = () => setPasoActual(2);

    const validatedTiemposComida = useMemo(() => {
        const grupoOrdenMap = new Map(
            Object.entries(datosBorrador.gruposComidas)
                .filter(([, grupo]) => grupo.estaActivo)
                .map(([id, grupo]) => [id, grupo.orden])
        );

        return Object.entries(datosBorrador.tiemposComidas || {})
            .map(([id, datos]) => ({
                id,
                datos,
                validacion: TiempoComidaSchema.safeParse(datos) as SafeParseReturnType<TiempoComida, TiempoComida>
            }))
            .sort((a, b) => {
                const diaCompare = DIAS_SEMANA_ORDEN[a.datos.dia] - DIAS_SEMANA_ORDEN[b.datos.dia];
                if (diaCompare !== 0) return diaCompare;
                
                const ordenA = grupoOrdenMap.get(a.datos.grupoComida) ?? Infinity;
                const ordenB = grupoOrdenMap.get(b.datos.grupoComida) ?? Infinity;
                return ordenA - ordenB;
            });
    }, [datosBorrador.tiemposComidas, datosBorrador.gruposComidas]);
    

    const filteredTiempos = mostrarInactivos ? validatedTiemposComida : validatedTiemposComida.filter(({ datos }) => datos.estaActivo);
    const gruposComidaActivos = Object.entries(datosBorrador.gruposComidas).filter(([, grupo]) => grupo.estaActivo);

    const handleEditClick = (id: string, tiempo: TiempoComida) => {
        setEditingId(id);
        reset({
            nombre: tiempo.nombre,
            dia: tiempo.dia,
            grupoComida: tiempo.grupoComida,
            horaReferencia: tiempo.horaReferencia,
        });
    };

    const handleAddNewClick = () => {
        setEditingId('new');
        reset({
            nombre: '',
            dia: 'lunes',
            grupoComida: gruposComidaActivos[0]?.[0] || '',
            horaReferencia: '13:00',
        });
    };

    const handleCancel = () => {
        setEditingId(null);
        reset();
    };

    const handleArchiveToggle = (id: string, tiempo: TiempoComida) => {
        upsertTiempoComida(id, { ...tiempo, estaActivo: !tiempo.estaActivo });
    };

    const onSubmit: SubmitHandler<FormValues> = (data) => {
        const id = editingId === 'new' ? slugify(data.nombre) : editingId;
        if (!id) return;

        if (editingId === 'new') {
            // CREATION
            if (datosBorrador.tiemposComidas[id]) {
                alert(`Error: Ya existe un tiempo de comida con el nombre "${data.nombre}". El nombre debe ser único.`);
                return;
            }
            // Crea un objeto que coincide con TiempoComidaCreateSchema (sin campo 'alternativas')
            const nuevoTiempo = { ...data, estaActivo: true, alternativas: { principal: '' } };
            upsertTiempoComida(id, nuevoTiempo);
        } else {
            // MODIFICATION
            const originalTiempo = datosBorrador.tiemposComidas[editingId!];
            if (!originalTiempo) {
                console.error("No se encontró el tiempo de comida original para editar.");
                return;
            }

            // Fusiona los datos del formulario en el objeto original para preservar 'alternativas'
            const tiempoActualizado = { ...originalTiempo, ...data };
            upsertTiempoComida(id, tiempoActualizado);
        }

        setEditingId(null);
        reset();
    };

    const handleLlenarTabla = () => {
        if (!gruposComidaActivos.length) {
            alert("No hay grupos de comida activos para generar los tiempos.");
            return;
        }

        const tiemposExistentes = new Set(
            Object.values(datosBorrador.tiemposComidas)
            .filter(t => t.estaActivo)
            .map(t => `${t.dia}-${t.grupoComida}`)
        );

        DIAS_SEMANA.forEach(dia => {
            gruposComidaActivos.forEach(([grupoSlug, grupo]) => {
                if (!tiemposExistentes.has(`${dia}-${grupoSlug}`)) {
                    const nombre = `${dia.charAt(0).toUpperCase() + dia.slice(1)} ${grupo.nombre}`;
                    const id = slugify(nombre);
                    if (!datosBorrador.tiemposComidas[id]) {
                        upsertTiempoComida(id, {
                            nombre,
                            dia,
                            grupoComida: grupoSlug,
                            horaReferencia: '',
                            alternativas: { principal: '' },
                            estaActivo: true
                        });
                    }
                }
            });
        });
    };

    const renderForm = () => (
        <Card className="bg-slate-50 dark:bg-slate-800/50 my-4 border-slate-200 dark:border-slate-700">
            <form onSubmit={handleSubmit(onSubmit)}>
                <CardHeader>
                    <CardTitle>{editingId === 'new' ? 'Añadir Tiempo de Comida' : 'Editar Tiempo de Comida'}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <Label htmlFor="nombre">Nombre</Label>
                        <input id="nombre" type="text" {...register('nombre')}
                            className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm px-3 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
                            readOnly={editingId !== 'new'} disabled={editingId !== 'new'}
                        />
                        {errors.nombre && <p className="text-red-500 text-xs mt-1">{errors.nombre.message}</p>}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <Label htmlFor="dia">Día</Label>
                            <select id="dia" {...register('dia')} className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm px-3 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                                {DIAS_SEMANA.map(dia => <option key={dia} value={dia}>{dia.charAt(0).toUpperCase() + dia.slice(1)}</option>)}
                            </select>
                            {errors.dia && <p className="text-red-500 text-xs mt-1">{errors.dia.message}</p>}
                        </div>
                        <div>
                            <Label htmlFor="horaReferencia">Hora</Label>
                            <input id="horaReferencia" type="time" {...register('horaReferencia')} className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm px-3 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                            {errors.horaReferencia && <p className="text-red-500 text-xs mt-1">{errors.horaReferencia.message}</p>}
                        </div>
                    </div>
                    <div>
                        <Label htmlFor="grupoComida">Grupo de Comida</Label>
                        <select id="grupoComida" {...register('grupoComida')} className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm px-3 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                            <option value="" disabled>Seleccione un grupo</option>
                            {gruposComidaActivos.map(([slug, grupo]) => <option key={slug} value={slug}>{grupo.nombre}</option>)}
                        </select>
                        {errors.grupoComida && <p className="text-red-500 text-xs mt-1">{errors.grupoComida.message}</p>}
                    </div>
                </CardContent>
                <CardFooter className="flex justify-end gap-3">
                    <Button type="button" variant="ghost" onClick={handleCancel}>Cancelar</Button>
                    <Button type="submit">Guardar</Button>
                </CardFooter>
            </form>
        </Card>
    );
    
    return (
        <div className="p-4 max-w-3xl mx-auto">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Paso 3: Tiempos de Comida</h1>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Define los diferentes tiempos de comida para cada día (ej. Almuerzo, Cena).</p>
                </div>
                <div className="flex items-center space-x-2 mt-4 sm:mt-0">
                    <Switch id="show-inactive" checked={mostrarInactivos} onCheckedChange={toggleMostrarInactivos} />
                    <Label htmlFor="show-inactive">Mostrar Inactivos</Label>
                </div>
            </div>

            {editingId && renderForm()}

            <div className="space-y-3">
                {filteredTiempos.map(({ id, datos, validacion }) => {
                    const grupo = datosBorrador.gruposComidas[datos.grupoComida];
                    const isValid = validacion.success;
                    return (
                        <Card key={id} className={`transition-all ${!datos.estaActivo ? 'opacity-50 bg-slate-50 dark:bg-slate-800/20' : 'bg-white dark:bg-slate-800'} ${!isValid ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-400 dark:border-yellow-700' : ''}`}>
                            <CardContent className="p-4 flex items-center justify-between">
                                <div className="flex flex-col sm:flex-row sm:items-center sm:gap-4">
                                    <div className="font-semibold text-slate-800 dark:text-slate-200">{datos.nombre}</div>
                                    <div className="flex items-center gap-4 text-sm text-slate-500 dark:text-slate-400">
                                        <span className="capitalize">{datos.dia}</span>
                                        <span>{datos.horaReferencia}</span>
                                        {grupo && <span className="inline-block bg-gray-200 text-gray-800 text-xs font-semibold px-2.5 py-0.5 rounded-full dark:bg-gray-700 dark:text-gray-300">{grupo.nombre}</span>}
                                    </div>
                                    {!isValid && (
                                        <div className="mt-2 sm:mt-0 sm:ml-4 text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
                                            <AlertTriangle className="h-4 w-4" />
                                            <span>Error: {validacion.error.issues.map(i => i.path[0]).join(', ')}</span>
                                        </div>
                                    )}
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                    <Button variant="ghost" size="sm" onClick={() => handleEditClick(id, datos)}>Editar</Button>
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Button variant="ghost" size="icon" onClick={() => handleArchiveToggle(id, datos)} className="h-9 w-9">
                                                    {datos.estaActivo ? <Archive className="h-4 w-4" /> : <ArchiveRestore className="h-4 w-4" />}
                                                </Button>
                                            </TooltipTrigger>
                                            <TooltipContent><p>{datos.estaActivo ? 'Archivar' : 'Restaurar'}</p></TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            {!editingId && (
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <button onClick={handleAddNewClick} className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:border-slate-400 dark:hover:border-slate-500 transition-colors">
                        <PlusCircle className="h-5 w-5" />
                        Añadir Tiempo
                    </button>
                    <TooltipProvider>
                         <Tooltip>
                            <TooltipTrigger asChild>
                                 <button onClick={handleLlenarTabla} disabled={!gruposComidaActivos.length} className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-blue-400 dark:border-blue-600 rounded-lg text-blue-500 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 hover:border-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                                    <Sparkles className="h-5 w-5" />
                                    Llenar Tabla
                                </button>
                            </TooltipTrigger>
                            <TooltipContent><p>Crea automáticamente un tiempo por cada combinación día/grupo que falte.</p></TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>
            )}

            <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-700 grid grid-cols-2 gap-4">
                <Button variant="outline" onClick={retrocederPaso}>Anterior</Button>
                <Button onClick={avanzarPaso}>Siguiente</Button>
            </div>
        </div>
    );
}
