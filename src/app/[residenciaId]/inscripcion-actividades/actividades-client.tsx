'use client';

import { useMemo, useState } from 'react';
import type { ResidenciaId } from 'shared/models/types';
import { useInfoUsuario } from '@/components/layout/AppProviders';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Calendar, Users, UserPlus, Ban } from 'lucide-react';
import { useInscripcionActividadesQuery, useMutacionesInscripcionActividades } from './lib/consultas';
import type { EstadoInscripcion, InscripcionActividad } from './lib/actions';

interface Props {
    residenciaId: ResidenciaId;
}

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

export default function InscripcionActividadesClient({ residenciaId }: Props) {
    const { usuarioId } = useInfoUsuario();
    const { data, isLoading, error } = useInscripcionActividadesQuery(residenciaId);
    const mutaciones = useMutacionesInscripcionActividades(residenciaId, usuarioId);

    const [usuarioObjetivoId, setUsuarioObjetivoId] = useState<string>(usuarioId);
    const [invitadoManualPorActividad, setInvitadoManualPorActividad] = useState<Record<string, string>>({});
    const [bulkPorActividad, setBulkPorActividad] = useState<Record<string, string>>({});

    const rolesActor = data?.actor?.roles || [];
    const actorEsPrivilegiado = rolesActor.some((rol) => ['master', 'admin', 'director'].includes(rol));

    const inscripcionesPorActividad = useMemo(() => {
        const mapa = new Map<string, InscripcionActividad[]>();
        for (const item of data?.inscripciones || []) {
            const list = mapa.get(item.actividadId) || [];
            list.push(item);
            mapa.set(item.actividadId, list);
        }
        return mapa;
    }, [data?.inscripciones]);

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
                <div>
                    <h1 className='text-2xl font-bold tracking-tight'>Inscripcion e Invitaciones</h1>
                    <p className='text-sm text-muted-foreground'>
                        Gestiona participacion por usuario, invitaciones y cupos con actualizacion optimista.
                    </p>
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

                    const demandaTotal = actividad.conteoInscritos + actividad.adicionalesNoNominales;

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
                                            Invitar por ID de usuario
                                        </div>
                                        <div className='flex gap-2'>
                                            <Input
                                                placeholder='uid del invitado'
                                                value={invitadoManualPorActividad[actividad.id] || ''}
                                                onChange={(e) =>
                                                    setInvitadoManualPorActividad((prev) => ({
                                                        ...prev,
                                                        [actividad.id]: e.target.value,
                                                    }))
                                                }
                                            />
                                            <Button
                                                size='sm'
                                                variant='secondary'
                                                onClick={() =>
                                                    mutaciones.invitarMutation.mutate({
                                                        actividadId: actividad.id,
                                                        usuarioObjetivoId: (invitadoManualPorActividad[actividad.id] || '').trim(),
                                                    })
                                                }
                                                disabled={mutaciones.invitarMutation.isPending}
                                            >
                                                Invitar
                                            </Button>
                                        </div>
                                    </div>
                                )}

                                {esOrganizador && (
                                    <div className='space-y-2 rounded border p-3'>
                                        <div className='text-xs font-medium uppercase text-muted-foreground'>
                                            Bulk add (uids separados por coma)
                                        </div>
                                        <div className='flex gap-2'>
                                            <Input
                                                placeholder='uid1,uid2,uid3'
                                                value={bulkPorActividad[actividad.id] || ''}
                                                onChange={(e) =>
                                                    setBulkPorActividad((prev) => ({
                                                        ...prev,
                                                        [actividad.id]: e.target.value,
                                                    }))
                                                }
                                            />
                                            <Button
                                                size='sm'
                                                onClick={() => {
                                                    const usuarioIds = (bulkPorActividad[actividad.id] || '')
                                                        .split(',')
                                                        .map((s) => s.trim())
                                                        .filter(Boolean);
                                                    mutaciones.forceAddMutation.mutate({ actividadId: actividad.id, usuarioIds });
                                                }}
                                                disabled={mutaciones.forceAddMutation.isPending}
                                            >
                                                Forzar alta
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
                                    {listaInscripciones.map((ins) => (
                                        <div key={`${ins.actividadId}-${ins.usuarioId}`} className='flex items-center justify-between rounded border p-2 text-sm'>
                                            <div>
                                                {ins.usuarioId}
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
                                    ))}
                                </CardFooter>
                            )}
                        </Card>
                    );
                })}
            </div>
        </div>
    );
}
