'use client';

import { useState, useEffect, useCallback, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/useToast';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogTrigger,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogContent,
    AlertDialogDescription,
} from '@/components/ui/alert-dialog';
import {
    Loader2,
    PlusCircle,
    Edit,
    Hourglass,
    Users,
    XCircle,
    ArrowRight,
    Play,
    Calendar,
} from 'lucide-react';

import { type CentroDeCosto } from 'shared/schemas/contabilidad';
import { type ComedorData } from 'shared/schemas/complemento1';
import { type TiempoComida } from 'shared/schemas/horarios';
import type { ActividadId, ResidenciaId, ComedorId, TiempoComidaId } from 'shared/models/types';

import { ActivityForm } from './activity-form';
import {
    obtenerDatosInicialesGestionActividades,
    updateActividadEstado,
    type ActividadGestion,
    type InscripcionGestion,
    type EstadoActividadGestion,
} from './actions';
import { useInfoUsuario } from '@/components/layout/AppProviders';

interface GestionActividadesClientProps {
    residenciaId: ResidenciaId;
}

const getInscripcionesCount = (inscripciones: InscripcionGestion[], actividadId: ActividadId) => {
    return inscripciones.filter((i) => i.actividadId === actividadId && i.estado === 'confirmada').length;
};

const getInvitacionesCount = (inscripciones: InscripcionGestion[], actividadId: ActividadId) => {
    return inscripciones.filter((i) => i.actividadId === actividadId && i.estado === 'invitacion_pendiente').length;
};

export function GestionActividadesClient({ residenciaId }: GestionActividadesClientProps) {
    const { toast } = useToast();
    const { usuarioId: authUser } = useInfoUsuario();
    const [isPending, startTransition] = useTransition();

    const [actividades, setActividades] = useState<ActividadGestion[]>([]);
    const [inscripciones, setInscripciones] = useState<InscripcionGestion[]>([]);
    const [centroCostosList, setCentroCostosList] = useState<CentroDeCosto[]>([]);
    const [tiemposComidaList, setTiemposComidaList] = useState<(TiempoComida & { id: TiempoComidaId })[]>([]);
    const [comedoresList, setComedoresList] = useState<(ComedorData & { id: ComedorId })[]>([]);

    const [isLoadingPageData, setIsLoadingPageData] = useState(true);
    const [pageError, setPageError] = useState<string | null>(null);
    const [showActivityForm, setShowActivityForm] = useState(false);
    const [editingActividad, setEditingActividad] = useState<ActividadGestion | null>(null);

    const fetchData = useCallback(async () => {
        if (!residenciaId || !authUser) {
            return;
        }

        setIsLoadingPageData(true);
        setPageError(null);

        try {
            const result = await obtenerDatosInicialesGestionActividades(residenciaId);
            if (!result.success) {
                throw new Error(typeof result.error === 'string' ? result.error : 'Error desconocido al cargar datos.');
            }

            if (!result.data) {
                throw new Error('No se recibieron datos de actividades.');
            }

            setActividades(result.data.actividades);
            setInscripciones(result.data.inscripciones);
            setCentroCostosList(result.data.centroCostos as CentroDeCosto[]);
            setTiemposComidaList(result.data.tiemposComida as (TiempoComida & { id: TiempoComidaId })[]);
            setComedoresList(result.data.comedores as (ComedorData & { id: ComedorId })[]);
        } catch (err) {
            console.error('Error fetching admin activities data:', err);
            setPageError(err instanceof Error ? err.message : 'Error desconocido al cargar datos.');
        } finally {
            setIsLoadingPageData(false);
        }
    }, [residenciaId, authUser]);

    useEffect(() => {
        if (authUser) {
            fetchData();
        }
    }, [authUser, fetchData]);

    const handleOpenAddForm = () => {
        setEditingActividad(null);
        setShowActivityForm(true);
    };

    const handleOpenEditForm = (actividad: ActividadGestion) => {
        setEditingActividad(actividad);
        setShowActivityForm(true);
    };

    const handleCloseForm = () => {
        setShowActivityForm(false);
        setEditingActividad(null);
        fetchData();
    };

    const handleStateChange = (actividadId: ActividadId, newState: EstadoActividadGestion) => {
        startTransition(async () => {
            const result = await updateActividadEstado(actividadId, residenciaId, newState);
            if (result.success) {
                toast({ title: 'Estado de la actividad actualizado' });
                fetchData();
            } else {
                const errorMsg = typeof result.error === 'string' ? result.error : 'Error de validacion';
                toast({ title: 'Error', description: errorMsg, variant: 'destructive' });
            }
        });
    };

    const getStateButtonStyle = (actividad: ActividadGestion) => {
        switch (actividad.estado) {
            case 'pendiente':
                return { label: 'Aprobar', icon: Play, nextState: 'aprobada' as EstadoActividadGestion };
            case 'aprobada':
                return {
                    label: 'Abrir Inscripcion',
                    icon: ArrowRight,
                    nextState: 'inscripcion_abierta' as EstadoActividadGestion,
                };
            case 'inscripcion_abierta':
                return {
                    label: 'Cerrar Inscripcion',
                    icon: XCircle,
                    nextState: 'inscripcion_cerrada' as EstadoActividadGestion,
                };
            case 'inscripcion_cerrada':
                return {
                    label: 'Finalizar',
                    icon: ArrowRight,
                    nextState: 'finalizada' as EstadoActividadGestion,
                };
            default:
                return null;
        }
    };

    if (isLoadingPageData) {
        return (
            <div className='flex justify-center items-center h-screen'>
                <Loader2 className='h-8 w-8 animate-spin' />
            </div>
        );
    }

    if (pageError) {
        return <div className='text-destructive text-center mt-8'>{pageError}</div>;
    }

    return (
        <div className='container mx-auto p-4 space-y-6'>
            <div className='flex flex-col md:flex-row md:justify-between md:items-start space-y-4 md:space-y-0'>
                <div>
                    <h1 className='text-2xl md:text-3xl font-bold tracking-tight'>Gestionar Actividades</h1>
                </div>
                <Button onClick={handleOpenAddForm} disabled={isPending} className='w-full md:w-auto'>
                    <PlusCircle className='mr-2 h-5 w-5' /> Anadir Actividad
                </Button>
            </div>

            <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
                {actividades.map((actividad) => {
                    const stateButton = getStateButtonStyle(actividad);
                    const inscritos = getInscripcionesCount(inscripciones, actividad.id);
                    const invitados = getInvitacionesCount(inscripciones, actividad.id);
                    const dateRange = `${new Date(actividad.fechaInicio).toLocaleDateString()} ${
                        actividad.fechaInicio !== actividad.fechaFin
                            ? `- ${new Date(actividad.fechaFin).toLocaleDateString()}`
                            : ''
                    }`;

                    return (
                        <Card
                            key={actividad.id}
                            className={`flex flex-col relative transition-all duration-300 hover:shadow-lg ${
                                actividad.estado === 'cancelada' ? 'opacity-60 grayscale-[0.5] bg-muted/20' : ''
                            }`}
                        >
                            <CardHeader className='pb-2'>
                                <div className='flex flex-wrap justify-between items-start gap-x-4 gap-y-2'>
                                    <div className='space-y-1 flex-grow'>
                                        <CardTitle className='text-xl font-bold line-clamp-1'>{actividad.titulo}</CardTitle>
                                        <div className='flex items-center text-sm text-muted-foreground'>
                                            <Calendar className='mr-1 h-3 w-3' />
                                            {dateRange}
                                        </div>
                                    </div>
                                    <div className='flex flex-col items-end space-y-2'>
                                        <Badge
                                            variant={
                                                actividad.estado === 'pendiente'
                                                    ? 'outline'
                                                    : actividad.estado === 'cancelada'
                                                    ? 'destructive'
                                                    : 'default'
                                            }
                                            className='px-2 py-0.5'
                                        >
                                            {actividad.estado === 'pendiente' && (
                                                <Hourglass className='mr-1 h-3 w-3 inline' />
                                            )}
                                            {actividad.estado === 'cancelada' && (
                                                <XCircle className='mr-1 h-3 w-3 inline' />
                                            )}
                                            {actividad.estado.replace('_', ' ').charAt(0).toUpperCase() +
                                                actividad.estado.replace('_', ' ').slice(1)}
                                        </Badge>

                                        {['inscripcion_abierta', 'inscripcion_cerrada', 'finalizada'].includes(
                                            actividad.estado
                                        ) && (
                                            <div className='flex space-x-1'>
                                                <Badge variant='outline' className='bg-blue-50 text-blue-700 border-blue-200'>
                                                    <Users className='mr-1 h-3 w-3' />
                                                    {inscritos}
                                                </Badge>
                                                {actividad.maxParticipantes > 0 && (
                                                    <Badge
                                                        variant='outline'
                                                        className='bg-gray-50 text-gray-700 border-gray-200'
                                                    >
                                                        / {actividad.maxParticipantes}
                                                    </Badge>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className='flex-grow py-2'>
                                <p className='text-sm text-muted-foreground line-clamp-3 min-h-[3rem]'>
                                    {actividad.descripcion || 'Sin descripcion'}
                                </p>
                                <div className='mt-4 grid grid-cols-2 gap-2 text-xs'>
                                    <div className='flex flex-col p-2 bg-muted/40 rounded'>
                                        <span className='text-muted-foreground uppercase font-semibold'>Tipo Acceso</span>
                                        <span className='font-medium'>Inscripcion</span>
                                    </div>
                                    <div className='flex flex-col p-2 bg-muted/40 rounded'>
                                        <span className='text-muted-foreground uppercase font-semibold'>Lugar</span>
                                        <span className='font-medium truncate'>{actividad.lugar || 'No asignado'}</span>
                                    </div>
                                </div>
                            </CardContent>
                            <CardFooter className='pt-2 pb-4 border-t mt-auto flex flex-col gap-2'>
                                <div className='flex gap-2 w-full'>
                                    <Button
                                        variant='outline'
                                        size='sm'
                                        className='flex-1'
                                        onClick={() => handleOpenEditForm(actividad)}
                                        disabled={
                                            isPending ||
                                            !['pendiente', 'aprobada', 'inscripcion_abierta'].includes(actividad.estado)
                                        }
                                    >
                                        <Edit className='mr-2 h-4 w-4' /> Editar
                                    </Button>

                                    {!['cancelada', 'finalizada'].includes(actividad.estado) && (
                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button
                                                    variant='secondary'
                                                    size='sm'
                                                    className='flex-1 text-destructive hover:bg-destructive/10'
                                                    disabled={isPending}
                                                >
                                                    <XCircle className='mr-2 h-4 w-4' /> Cancelar
                                                </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>Esta seguro de cancelar?</AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        Se cancelara la actividad "{actividad.titulo}".
                                                        {inscritos > 0 &&
                                                            ` Se notificaran a los ${inscritos} inscritos.`}
                                                        {invitados > 0 &&
                                                            ` Se cancelaran las ${invitados} invitaciones pendientes.`}
                                                        Esta accion no se puede deshacer facilmente.
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>No, volver</AlertDialogCancel>
                                                    <AlertDialogAction
                                                        className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
                                                        onClick={() => handleStateChange(actividad.id, 'cancelada')}
                                                    >
                                                        Si, Cancelar Actividad
                                                    </AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                    )}
                                </div>

                                <div className='w-full'>
                                    {stateButton && !['cancelada', 'finalizada'].includes(actividad.estado) && (
                                        <Button
                                            variant='default'
                                            size='sm'
                                            className='w-full bg-blue-600 hover:bg-blue-700 h-9'
                                            onClick={() => handleStateChange(actividad.id, stateButton.nextState)}
                                            disabled={isPending}
                                        >
                                            <stateButton.icon className='mr-2 h-4 w-4' />
                                            {stateButton.label}
                                        </Button>
                                    )}

                                    {actividad.estado === 'finalizada' && (
                                        <p className='text-xs text-muted-foreground text-center py-2'>Actividad finalizada</p>
                                    )}
                                </div>
                            </CardFooter>
                        </Card>
                    );
                })}
            </div>

            {showActivityForm && (
                <ActivityForm
                    onClose={handleCloseForm}
                    actividad={editingActividad}
                    tiemposComidaList={tiemposComidaList}
                    centroCostosList={centroCostosList}
                    comedoresList={comedoresList}
                />
            )}
        </div>
    );
}

export default GestionActividadesClient;