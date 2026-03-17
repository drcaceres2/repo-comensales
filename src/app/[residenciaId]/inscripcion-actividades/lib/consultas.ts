'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/useToast';
import {
    autoInscribirse,
    cancelarInscripcion,
    forceAddParticipants,
    invitarParticipante,
    kickParticipant,
    obtenerDatosInscripcionActividades,
    responderInvitacion,
    type DatosInscripcionActividades,
    type EstadoInscripcion,
} from './actions';

export const inscripcionesQueryKey = (residenciaId: string) => ['inscripcion-actividades', residenciaId] as const;

function getEstadoActual(
    data: DatosInscripcionActividades,
    actividadId: string,
    usuarioId: string
): EstadoInscripcion | null {
    const item = data.inscripciones.find((ins) => ins.actividadId === actividadId && ins.usuarioId === usuarioId);
    return item?.estado || null;
}

function aplicarEstadoOptimista(
    data: DatosInscripcionActividades,
    actividadId: string,
    usuarioId: string,
    nuevoEstado: EstadoInscripcion,
    invitadoPorId?: string
): DatosInscripcionActividades {
    const estadoActual = getEstadoActual(data, actividadId, usuarioId);
    const deltaConfirmadas =
        (estadoActual === 'confirmada' ? 0 : nuevoEstado === 'confirmada' ? 1 : 0) -
        (estadoActual === 'confirmada' && nuevoEstado !== 'confirmada' ? 1 : 0);

    const inscripcionExiste = data.inscripciones.some(
        (ins) => ins.actividadId === actividadId && ins.usuarioId === usuarioId
    );

    const nuevasInscripciones = inscripcionExiste
        ? data.inscripciones.map((ins) =>
              ins.actividadId === actividadId && ins.usuarioId === usuarioId
                  ? { ...ins, estado: nuevoEstado, invitadoPorId: invitadoPorId || ins.invitadoPorId }
                  : ins
          )
        : [
              ...data.inscripciones,
              {
                  id: usuarioId,
                  actividadId,
                  usuarioId,
                  invitadoPorId,
                  estado: nuevoEstado,
              },
          ];

    const nuevasActividades = data.actividades.map((actividad) =>
        actividad.id === actividadId
            ? { ...actividad, conteoInscritos: Math.max(0, actividad.conteoInscritos + deltaConfirmadas) }
            : actividad
    );

    return {
        ...data,
        actividades: nuevasActividades,
        inscripciones: nuevasInscripciones,
    };
}

export function useInscripcionActividadesQuery(residenciaId: string) {
    return useQuery({
        queryKey: inscripcionesQueryKey(residenciaId),
        queryFn: async () => {
            const result = await obtenerDatosInscripcionActividades(residenciaId);
            if (!result.success) {
                throw new Error(result.error);
            }
            return result.data;
        },
        enabled: Boolean(residenciaId),
    });
}

export function useMutacionesInscripcionActividades(residenciaId: string, actorId: string) {
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const queryKey = inscripcionesQueryKey(residenciaId);

    const invalidate = () => queryClient.invalidateQueries({ queryKey });

    const autoInscribirMutation = useMutation({
        mutationFn: (input: { actividadId: string; usuarioObjetivoId?: string }) =>
            autoInscribirse(residenciaId, input.actividadId, { usuarioObjetivoId: input.usuarioObjetivoId }),
        onMutate: async (input) => {
            await queryClient.cancelQueries({ queryKey });
            const prev = queryClient.getQueryData<DatosInscripcionActividades>(queryKey);
            if (prev) {
                const targetId = input.usuarioObjetivoId || actorId;
                queryClient.setQueryData(
                    queryKey,
                    aplicarEstadoOptimista(prev, input.actividadId, targetId, 'confirmada')
                );
            }
            return { prev };
        },
        onError: (error, _vars, context) => {
            if (context?.prev) {
                queryClient.setQueryData(queryKey, context.prev);
            }
            toast({ title: 'Error', description: error.message, variant: 'destructive' });
        },
        onSuccess: (result) => {
            if (!result.success) {
                toast({ title: 'Error', description: result.error, variant: 'destructive' });
            }
        },
        onSettled: invalidate,
    });

    const invitarMutation = useMutation({
        mutationFn: (input: { actividadId: string; usuarioObjetivoId: string }) =>
            invitarParticipante(residenciaId, input.actividadId, { usuarioObjetivoId: input.usuarioObjetivoId }),
        onMutate: async (input) => {
            await queryClient.cancelQueries({ queryKey });
            const prev = queryClient.getQueryData<DatosInscripcionActividades>(queryKey);
            if (prev) {
                queryClient.setQueryData(
                    queryKey,
                    aplicarEstadoOptimista(
                        prev,
                        input.actividadId,
                        input.usuarioObjetivoId,
                        'invitacion_pendiente',
                        actorId
                    )
                );
            }
            return { prev };
        },
        onError: (error, _vars, context) => {
            if (context?.prev) {
                queryClient.setQueryData(queryKey, context.prev);
            }
            toast({ title: 'Error', description: error.message, variant: 'destructive' });
        },
        onSuccess: (result) => {
            if (!result.success) {
                toast({ title: 'Error', description: result.error, variant: 'destructive' });
            }
        },
        onSettled: invalidate,
    });

    const responderMutation = useMutation({
        mutationFn: (input: { actividadId: string; decision: 'aceptar' | 'rechazar'; usuarioObjetivoId?: string }) =>
            responderInvitacion(residenciaId, input.actividadId, input.decision, {
                usuarioObjetivoId: input.usuarioObjetivoId,
            }),
        onMutate: async (input) => {
            await queryClient.cancelQueries({ queryKey });
            const prev = queryClient.getQueryData<DatosInscripcionActividades>(queryKey);
            if (prev) {
                const targetId = input.usuarioObjetivoId || actorId;
                const estado = input.decision === 'aceptar' ? 'confirmada' : 'rechazada';
                queryClient.setQueryData(
                    queryKey,
                    aplicarEstadoOptimista(prev, input.actividadId, targetId, estado)
                );
            }
            return { prev };
        },
        onError: (error, _vars, context) => {
            if (context?.prev) {
                queryClient.setQueryData(queryKey, context.prev);
            }
            toast({ title: 'Error', description: error.message, variant: 'destructive' });
        },
        onSuccess: (result) => {
            if (!result.success) {
                toast({ title: 'Error', description: result.error, variant: 'destructive' });
            }
        },
        onSettled: invalidate,
    });

    const cancelarMutation = useMutation({
        mutationFn: (input: { actividadId: string; usuarioObjetivoId?: string }) =>
            cancelarInscripcion(residenciaId, input.actividadId, { usuarioObjetivoId: input.usuarioObjetivoId }),
        onMutate: async (input) => {
            await queryClient.cancelQueries({ queryKey });
            const prev = queryClient.getQueryData<DatosInscripcionActividades>(queryKey);
            if (prev) {
                const targetId = input.usuarioObjetivoId || actorId;
                queryClient.setQueryData(
                    queryKey,
                    aplicarEstadoOptimista(prev, input.actividadId, targetId, 'cancelada_por_usuario')
                );
            }
            return { prev };
        },
        onError: (error, _vars, context) => {
            if (context?.prev) {
                queryClient.setQueryData(queryKey, context.prev);
            }
            toast({ title: 'Error', description: error.message, variant: 'destructive' });
        },
        onSuccess: (result) => {
            if (!result.success) {
                toast({ title: 'Error', description: result.error, variant: 'destructive' });
            }
        },
        onSettled: invalidate,
    });

    const forceAddMutation = useMutation({
        mutationFn: (input: { actividadId: string; usuarioIds: string[] }) =>
            forceAddParticipants(residenciaId, input),
        onSuccess: (result) => {
            if (!result.success) {
                toast({ title: 'Error', description: result.error, variant: 'destructive' });
            }
        },
        onSettled: invalidate,
    });

    const kickMutation = useMutation({
        mutationFn: (input: { actividadId: string; usuarioObjetivoId: string }) =>
            kickParticipant(residenciaId, input.actividadId, { usuarioObjetivoId: input.usuarioObjetivoId }),
        onSuccess: (result) => {
            if (!result.success) {
                toast({ title: 'Error', description: result.error, variant: 'destructive' });
            }
        },
        onSettled: invalidate,
    });

    return {
        autoInscribirMutation,
        invitarMutation,
        responderMutation,
        cancelarMutation,
        forceAddMutation,
        kickMutation,
    };
}
