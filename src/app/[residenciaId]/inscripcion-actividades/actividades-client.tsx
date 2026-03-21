'use client';

import Fuse from 'fuse.js';
import { useMemo, useRef, useState } from 'react';
import type { ResidenciaId } from 'shared/models/types';
import { useInfoUsuario } from '@/components/layout/AppProviders';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Calendar, Users, UserPlus, Ban, PlusCircle, ClipboardPen } from 'lucide-react';
import {
    useDirectorioUsuariosQuery,
    useInscripcionActividadesQuery,
    useMutacionesInscripcionActividades,
} from './lib/consultas';
import { useToast } from '@/hooks/useToast';
import type { EstadoInscripcion, InscripcionActividad, UsuarioDirectorioActividad } from './lib/actions';

interface Props {
    residenciaId: ResidenciaId;
}

const MAX_RESULTADOS_INVITACION = 30;

function estadoLabel(estado: EstadoInscripcion | null) {
    switch (estado) {
        case 'invitacion_pendiente':
            return 'Invitacion pendiente';
        case 'confirmada':
            return 'Confirmada';
        case 'rechazada':
            return 'Rechazada';
        case 'cancelada_por_usuario':
            return 'Cancelada por usuario';
        case 'cancelada_por_organizador':
            return 'Cancelada por organizador';
        default:
            return 'Sin inscripcion';
    }
}

function mezclarAleatorio<T>(items: T[]): T[] {
    const copia = [...items];
    for (let i = copia.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [copia[i], copia[j]] = [copia[j], copia[i]];
    }
    return copia;
}

export default function InscripcionActividadesClient({ residenciaId }: Props) {
    const { usuarioId } = useInfoUsuario();
    const { data, isLoading, error } = useInscripcionActividadesQuery(residenciaId);
    const { data: directorioUsuarios = [] } = useDirectorioUsuariosQuery(residenciaId);
    const mutaciones = useMutacionesInscripcionActividades(residenciaId, usuarioId);
    const { toast } = useToast();

    const [usuarioObjetivoId, setUsuarioObjetivoId] = useState<string>(usuarioId);
    const [busquedaInvitadoPorActividad, setBusquedaInvitadoPorActividad] = useState<Record<string, string>>({});
    const [invitadoSeleccionadoPorActividad, setInvitadoSeleccionadoPorActividad] = useState<Record<string, string>>({});
    const [shadowNombrePorActividad, setShadowNombrePorActividad] = useState<Record<string, string>>({});
    const [shadowEmailPorActividad, setShadowEmailPorActividad] = useState<Record<string, string>>({});
    const [busquedaBulkPorActividad, setBusquedaBulkPorActividad] = useState<Record<string, string>>({});
    const [bulkSeleccionadosPorActividad, setBulkSeleccionadosPorActividad] = useState<Record<string, string[]>>({});
    const poolInvitablesRef = useRef<Record<string, { firma: string; usuarioIds: string[] }>>({});

    const rolesActor = data?.actor?.roles || [];
    const actorEsPrivilegiado = rolesActor.some((rol) => ['master', 'admin', 'director'].includes(rol));

    const directorioPorId = useMemo(() => {
        return new Map(directorioUsuarios.map((usuario) => [usuario.id, usuario]));
    }, [directorioUsuarios]);

    const inscripcionesPorActividad = useMemo(() => {
        const mapa = new Map<string, InscripcionActividad[]>();
        for (const item of data?.inscripciones || []) {
            const list = mapa.get(item.actividadId) || [];
            list.push(item);
            mapa.set(item.actividadId, list);
        }
        return mapa;
    }, [data?.inscripciones]);

    const obtenerPoolAleatorio = (actividadId: string, elegibles: UsuarioDirectorioActividad[]) => {
        const idsOrdenados = elegibles.map((usuario) => usuario.id).sort();
        const firma = idsOrdenados.join('|');
        const cache = poolInvitablesRef.current[actividadId];

        if (cache?.firma === firma) {
            return cache.usuarioIds;
        }

        const usuarioIds = mezclarAleatorio(idsOrdenados).slice(0, MAX_RESULTADOS_INVITACION);
        poolInvitablesRef.current[actividadId] = { firma, usuarioIds };
        return usuarioIds;
    };

    if (isLoading) {
        return (
            <div className='flex h-[50vh] items-center justify-center'>
                <Loader2 className='h-7 w-7 animate-spin' />
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className='mx-auto max-w-3xl p-6 text-center text-destructive'>
                {error instanceof Error ? error.message : 'No se pudo cargar el modulo de inscripciones.'}
            </div>
        );
    }

    return (
        <div className='container mx-auto space-y-6 p-4'>
            <div className='flex flex-col gap-3 md:flex-row md:items-end md:justify-between'>
                <div className='flex items-center gap-3'>
                    <ClipboardPen className='h-8 w-8 text-gray-700' />
                    <div className='flex flex-col'>
                        <h1 className='text-2xl font-bold tracking-tight'>Inscripciones Actividades</h1>
                        <p className='text-sm text-gray-600 mt-1'>{`Residencia: ${residenciaId}`}</p>
                    </div>
                </div>

                <div className='w-full md:w-80 space-y-1'>
                    <Label>Usuario objetivo</Label>
                    <Select value={usuarioObjetivoId} onValueChange={setUsuarioObjetivoId}>
                        <SelectTrigger>
                            <SelectValue placeholder='Selecciona usuario' />
                        </SelectTrigger>
                        <SelectContent>
                            {data.usuariosObjetivo.map((u) => (
                                <SelectItem key={u.id} value={u.id}>
                                    {u.nombre}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className='grid grid-cols-1 gap-5 lg:grid-cols-2'>
                {data.actividades.map((actividad) => {
                    const listaInscripciones = inscripcionesPorActividad.get(actividad.id) || [];
                    const idsInscritos = new Set(listaInscripciones.map((ins) => ins.usuarioId));
                    const inscripcionObjetivo = listaInscripciones.find((ins) => ins.usuarioId === usuarioObjetivoId);
                    const estadoActual = (inscripcionObjetivo?.estado || null) as EstadoInscripcion | null;
                    const puedeAutoInscribir =
                        actividad.estado === 'inscripcion_abierta' &&
                        actividad.tipoAcceso === 'abierta' &&
                        !['confirmada', 'invitacion_pendiente'].includes(estadoActual || '');
                    const puedeInvitar =
                        actividad.permiteInvitadosExternos ||
                        actividad.organizadorId === usuarioId ||
                        actorEsPrivilegiado;
                    const esOrganizador = actividad.organizadorId === usuarioId || actorEsPrivilegiado;
                    const esOrganizadorReal = actividad.organizadorId === usuarioId;

                    const demandaTotal = actividad.conteoInscritos + actividad.adicionalesNoNominales;

                    const elegibles = directorioUsuarios.filter(
                        (usuario) => usuario.id !== usuarioId && !idsInscritos.has(usuario.id)
                    );
                    const textoBusqueda = (busquedaInvitadoPorActividad[actividad.id] || '').trim();

                    const resultadosInvitables = textoBusqueda
                        ? new Fuse(elegibles, {
                              keys: ['nombre', 'email'],
                              threshold: 0.35,
                              ignoreLocation: true,
                          })
                              .search(textoBusqueda)
                              .map((resultado) => resultado.item)
                              .slice(0, MAX_RESULTADOS_INVITACION)
                        : obtenerPoolAleatorio(actividad.id, elegibles)
                              .map((id) => directorioPorId.get(id))
                              .filter((usuario): usuario is UsuarioDirectorioActividad => Boolean(usuario));

                    const invitadoSeleccionadoId = invitadoSeleccionadoPorActividad[actividad.id] || '';
                    const invitadoSeleccionado = directorioPorId.get(invitadoSeleccionadoId);

                    // Bulk: pool independiente con prefijo "bulk_" para no colisionar con invitar
                    const textoBusquedaBulk = (busquedaBulkPorActividad[actividad.id] || '').trim();
                    const resultadosBulk = textoBusquedaBulk
                        ? new Fuse(elegibles, {
                              keys: ['nombre', 'email'],
                              threshold: 0.35,
                              ignoreLocation: true,
                          })
                              .search(textoBusquedaBulk)
                              .map((resultado) => resultado.item)
                              .slice(0, MAX_RESULTADOS_INVITACION)
                        : obtenerPoolAleatorio(`bulk_${actividad.id}`, elegibles)
                              .map((id) => directorioPorId.get(id))
                              .filter((usuario): usuario is UsuarioDirectorioActividad => Boolean(usuario));
                    const bulkSeleccionados = bulkSeleccionadosPorActividad[actividad.id] || [];
                    const bulkSeleccionadosSet = new Set(bulkSeleccionados);

                    const toggleBulkUsuario = (uid: string) => {
                        setBulkSeleccionadosPorActividad((prev) => {
                            const actual = new Set(prev[actividad.id] || []);
                            if (actual.has(uid)) actual.delete(uid);
                            else actual.add(uid);
                            return { ...prev, [actividad.id]: Array.from(actual) };
                        });
                    };

                    return (
                        <Card key={actividad.id}>
                            <CardHeader className='space-y-3'>
                                <div className='flex items-start justify-between gap-2'>
                                    <CardTitle className='text-xl'>{actividad.titulo}</CardTitle>
                                    <Badge variant={actividad.estado === 'inscripcion_abierta' ? 'default' : 'outline'}>
                                        {actividad.estado.replace('_', ' ')}
                                    </Badge>
                                </div>

                                <div className='flex flex-wrap gap-2'>
                                    <Badge variant='outline'>{actividad.visibilidad}</Badge>
                                    <Badge variant='outline'>{actividad.tipoAcceso}</Badge>
                                    {actividad.permiteInvitadosExternos && <Badge variant='secondary'>Invitados externos</Badge>}
                                </div>
                            </CardHeader>

                            <CardContent className='space-y-4'>
                                <p className='text-sm text-muted-foreground'>
                                    {actividad.descripcion || 'Sin descripcion'}
                                </p>

                                <div className='grid grid-cols-2 gap-2 text-xs'>
                                    <div className='rounded border bg-muted/40 p-2'>
                                        <div className='text-muted-foreground'>
                                            <Calendar className='mr-1 inline h-3 w-3' /> Fechas
                                        </div>
                                        <div>
                                            {actividad.fechaInicio}
                                            {actividad.fechaInicio !== actividad.fechaFin && ` - ${actividad.fechaFin}`}
                                        </div>
                                    </div>
                                    <div className='rounded border bg-muted/40 p-2'>
                                        <div className='text-muted-foreground'>
                                            <Users className='mr-1 inline h-3 w-3' /> Cupo
                                        </div>
                                        <div>
                                            {demandaTotal} / {actividad.maxParticipantes || '-'}
                                        </div>
                                    </div>
                                </div>

                                <div className='rounded border p-3'>
                                    <div className='mb-2 text-xs font-medium uppercase text-muted-foreground'>
                                        Estado para usuario objetivo
                                    </div>
                                    <div className='text-sm font-medium'>{estadoLabel(estadoActual)}</div>
                                </div>

                                <div className='flex flex-wrap gap-2'>
                                    {puedeAutoInscribir && (
                                        <Button
                                            size='sm'
                                            onClick={() =>
                                                mutaciones.autoInscribirMutation.mutate({
                                                    actividadId: actividad.id,
                                                    usuarioObjetivoId,
                                                })
                                            }
                                            disabled={mutaciones.autoInscribirMutation.isPending}
                                        >
                                            <UserPlus className='mr-2 h-4 w-4' /> Inscribir
                                        </Button>
                                    )}

                                    {estadoActual === 'invitacion_pendiente' && (
                                        <>
                                            <Button
                                                size='sm'
                                                onClick={() =>
                                                    mutaciones.responderMutation.mutate({
                                                        actividadId: actividad.id,
                                                        decision: 'aceptar',
                                                        usuarioObjetivoId,
                                                    })
                                                }
                                                disabled={mutaciones.responderMutation.isPending}
                                            >
                                                Aceptar invitacion
                                            </Button>
                                            <Button
                                                size='sm'
                                                variant='outline'
                                                onClick={() =>
                                                    mutaciones.responderMutation.mutate({
                                                        actividadId: actividad.id,
                                                        decision: 'rechazar',
                                                        usuarioObjetivoId,
                                                    })
                                                }
                                                disabled={mutaciones.responderMutation.isPending}
                                            >
                                                Rechazar
                                            </Button>
                                        </>
                                    )}

                                    {estadoActual === 'confirmada' && (
                                        <Button
                                            size='sm'
                                            variant='outline'
                                            onClick={() =>
                                                mutaciones.cancelarMutation.mutate({
                                                    actividadId: actividad.id,
                                                    usuarioObjetivoId,
                                                })
                                            }
                                            disabled={mutaciones.cancelarMutation.isPending}
                                        >
                                            <Ban className='mr-2 h-4 w-4' /> Cancelar
                                        </Button>
                                    )}
                                </div>

                                {puedeInvitar && (
                                    <div className='space-y-2 rounded border p-3'>
                                        <div className='text-xs font-medium uppercase text-muted-foreground'>
                                            Invitar usuario de la residencia
                                        </div>
                                        <Input
                                            placeholder='Buscar por nombre o correo'
                                            value={busquedaInvitadoPorActividad[actividad.id] || ''}
                                            onChange={(e) =>
                                                setBusquedaInvitadoPorActividad((prev) => ({
                                                    ...prev,
                                                    [actividad.id]: e.target.value,
                                                }))
                                            }
                                        />
                                        <div className='max-h-48 space-y-1 overflow-auto rounded border p-2'>
                                            {resultadosInvitables.length === 0 && (
                                                <div className='text-xs text-muted-foreground'>No hay usuarios elegibles.</div>
                                            )}
                                            {resultadosInvitables.map((usuario) => {
                                                const seleccionado = invitadoSeleccionadoId === usuario.id;
                                                return (
                                                    <button
                                                        key={usuario.id}
                                                        type='button'
                                                        className={`w-full rounded border px-2 py-1 text-left text-sm ${
                                                            seleccionado ? 'border-primary bg-primary/10' : 'border-transparent hover:border-muted-foreground/40'
                                                        }`}
                                                        onClick={() =>
                                                            setInvitadoSeleccionadoPorActividad((prev) => ({
                                                                ...prev,
                                                                [actividad.id]: usuario.id,
                                                            }))
                                                        }
                                                    >
                                                        <div className='font-medium'>{usuario.nombre}</div>
                                                        <div className='text-xs text-muted-foreground'>
                                                            {usuario.email || 'Sin correo'}
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        <div className='flex items-center justify-between gap-2'>
                                            <div className='text-xs text-muted-foreground'>
                                                {invitadoSeleccionado
                                                    ? `Seleccionado: ${invitadoSeleccionado.nombre}`
                                                    : 'Selecciona un usuario para invitar.'}
                                            </div>
                                            <Button
                                                size='sm'
                                                variant='secondary'
                                                onClick={() => {
                                                    if (!invitadoSeleccionadoId) {
                                                        toast({ title: 'Error', description: 'Selecciona un usuario valido.', variant: 'destructive' });
                                                        return;
                                                    }
                                                    mutaciones.invitarMutation.mutate({
                                                        actividadId: actividad.id,
                                                        usuarioObjetivoId: invitadoSeleccionadoId,
                                                    });
                                                }}
                                                disabled={mutaciones.invitarMutation.isPending || !invitadoSeleccionadoId}
                                            >
                                                Invitar
                                            </Button>
                                        </div>
                                    </div>
                                )}

                                {esOrganizadorReal && (
                                    <div className='space-y-2 rounded border p-3'>
                                        <div className='text-xs font-medium uppercase text-muted-foreground'>
                                            <PlusCircle className='mr-1 inline h-3 w-3' /> Agregar shadow account
                                        </div>
                                        <Input
                                            placeholder='Nombre del invitado (obligatorio)'
                                            value={shadowNombrePorActividad[actividad.id] || ''}
                                            onChange={(e) =>
                                                setShadowNombrePorActividad((prev) => ({
                                                    ...prev,
                                                    [actividad.id]: e.target.value,
                                                }))
                                            }
                                        />
                                        <Input
                                            placeholder='Correo (opcional)'
                                            value={shadowEmailPorActividad[actividad.id] || ''}
                                            onChange={(e) =>
                                                setShadowEmailPorActividad((prev) => ({
                                                    ...prev,
                                                    [actividad.id]: e.target.value,
                                                }))
                                            }
                                        />
                                        <Button
                                            size='sm'
                                            variant='outline'
                                            onClick={() => {
                                                const nombre = (shadowNombrePorActividad[actividad.id] || '').trim();
                                                const email = (shadowEmailPorActividad[actividad.id] || '').trim();
                                                if (!nombre) {
                                                    toast({ title: 'Error', description: 'El nombre es obligatorio.', variant: 'destructive' });
                                                    return;
                                                }

                                                mutaciones.crearShadowEInvitarMutation.mutate(
                                                    {
                                                        actividadId: actividad.id,
                                                        nombre,
                                                        email: email || undefined,
                                                    },
                                                    {
                                                        onSuccess: (result) => {
                                                            if (!result.success) {
                                                                return;
                                                            }
                                                            setShadowNombrePorActividad((prev) => ({ ...prev, [actividad.id]: '' }));
                                                            setShadowEmailPorActividad((prev) => ({ ...prev, [actividad.id]: '' }));
                                                        },
                                                    }
                                                );
                                            }}
                                            disabled={mutaciones.crearShadowEInvitarMutation.isPending}
                                        >
                                            Crear e invitar
                                        </Button>
                                    </div>
                                )}

                                {esOrganizador && (
                                    <div className='space-y-2 rounded border p-3'>
                                        <div className='text-xs font-medium uppercase text-muted-foreground'>
                                            Forzar alta masiva
                                        </div>
                                        <Input
                                            placeholder='Buscar por nombre o correo'
                                            value={busquedaBulkPorActividad[actividad.id] || ''}
                                            onChange={(e) =>
                                                setBusquedaBulkPorActividad((prev) => ({
                                                    ...prev,
                                                    [actividad.id]: e.target.value,
                                                }))
                                            }
                                        />
                                        <div className='max-h-48 space-y-1 overflow-auto rounded border p-2'>
                                            {resultadosBulk.length === 0 && (
                                                <div className='text-xs text-muted-foreground'>No hay usuarios elegibles.</div>
                                            )}
                                            {resultadosBulk.map((usuario) => {
                                                const seleccionado = bulkSeleccionadosSet.has(usuario.id);
                                                return (
                                                    <button
                                                        key={usuario.id}
                                                        type='button'
                                                        className={`w-full rounded border px-2 py-1 text-left text-sm transition-colors ${
                                                            seleccionado
                                                                ? 'border-primary bg-primary/10 font-medium'
                                                                : 'border-transparent hover:border-muted-foreground/40'
                                                        }`}
                                                        onClick={() => toggleBulkUsuario(usuario.id)}
                                                    >
                                                        <div className='flex items-center gap-2'>
                                                            <span
                                                                className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border text-xs ${
                                                                    seleccionado
                                                                        ? 'border-primary bg-primary text-primary-foreground'
                                                                        : 'border-muted-foreground/50'
                                                                }`}
                                                            >
                                                                {seleccionado && '✓'}
                                                            </span>
                                                            <div className='min-w-0'>
                                                                <div className='truncate'>{usuario.nombre}</div>
                                                                <div className='truncate text-xs text-muted-foreground'>
                                                                    {usuario.email || 'Sin correo'}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        {bulkSeleccionados.length > 0 && (
                                            <div className='flex flex-wrap gap-1'>
                                                {bulkSeleccionados.map((uid) => {
                                                    const nombre = directorioPorId.get(uid)?.nombre || uid;
                                                    return (
                                                        <span
                                                            key={uid}
                                                            className='inline-flex items-center gap-1 rounded-full border bg-muted px-2 py-0.5 text-xs'
                                                        >
                                                            {nombre}
                                                            <button
                                                                type='button'
                                                                className='ml-0.5 rounded-full hover:text-destructive'
                                                                onClick={() => toggleBulkUsuario(uid)}
                                                            >
                                                                ×
                                                            </button>
                                                        </span>
                                                    );
                                                })}
                                            </div>
                                        )}
                                        <div className='flex items-center justify-between gap-2'>
                                            <div className='text-xs text-muted-foreground'>
                                                {bulkSeleccionados.length > 0
                                                    ? `${bulkSeleccionados.length} usuario${bulkSeleccionados.length > 1 ? 's' : ''} seleccionado${bulkSeleccionados.length > 1 ? 's' : ''}`
                                                    : 'Selecciona uno o varios usuarios.'}
                                            </div>
                                            <Button
                                                size='sm'
                                                onClick={() => {
                                                    mutaciones.forceAddMutation.mutate(
                                                        { actividadId: actividad.id, usuarioIds: bulkSeleccionados },
                                                        {
                                                            onSuccess: (result) => {
                                                                if (result.success) {
                                                                    setBulkSeleccionadosPorActividad((prev) => ({
                                                                        ...prev,
                                                                        [actividad.id]: [],
                                                                    }));
                                                                    setBusquedaBulkPorActividad((prev) => ({
                                                                        ...prev,
                                                                        [actividad.id]: '',
                                                                    }));
                                                                }
                                                            },
                                                        }
                                                    );
                                                }}
                                                disabled={mutaciones.forceAddMutation.isPending || bulkSeleccionados.length === 0}
                                            >
                                                Forzar alta ({bulkSeleccionados.length})
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </CardContent>

                            {esOrganizador && listaInscripciones.length > 0 && (
                                <CardFooter className='flex-col items-stretch gap-2 border-t pt-4'>
                                    <div className='text-xs font-medium uppercase text-muted-foreground'>
                                        Inscripciones vinculadas
                                    </div>
                                    {listaInscripciones.map((ins) => {
                                        const nombreInscrito = directorioPorId.get(ins.usuarioId)?.nombre || ins.usuarioId;
                                        return (
                                            <div key={`${ins.actividadId}-${ins.usuarioId}`} className='flex items-center justify-between rounded border p-2 text-sm'>
                                                <div>
                                                    {nombreInscrito}
                                                    <span className='ml-2 text-xs text-muted-foreground'>({ins.estado})</span>
                                                </div>
                                                {ins.estado === 'confirmada' && (
                                                    <Button
                                                        size='sm'
                                                        variant='outline'
                                                        onClick={() =>
                                                            mutaciones.kickMutation.mutate({
                                                                actividadId: actividad.id,
                                                                usuarioObjetivoId: ins.usuarioId,
                                                            })
                                                        }
                                                        disabled={mutaciones.kickMutation.isPending}
                                                    >
                                                        Expulsar
                                                    </Button>
                                                )}
                                            </div>
                                        );
                                    })}
                                </CardFooter>
                            )}
                        </Card>
                    );
                })}
            </div>
        </div>
    );
}
