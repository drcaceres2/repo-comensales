'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CentroDeCosto } from 'shared/schemas/contabilidad';
import type { ComedorData } from 'shared/schemas/complemento1';
import type { TiempoComida } from 'shared/schemas/horarios';
import type { GrupoComida } from 'shared/schemas/horarios';
import type { ComedorId, ResidenciaId, TiempoComidaId } from 'shared/models/types';
import {
    createActividad,
    obtenerDatosInicialesGestionActividades,
    updateActividad,
    updateActividadEstado,
    type ActividadGestion,
    type EstadoActividadGestion,
    type InscripcionGestion,
} from './actions';

export type ActividadInput = {
    titulo: string;
    descripcion?: string;
    lugar?: string;
    visibilidad: 'publica' | 'oculta';
    tipoAcceso: 'abierta' | 'solo_invitacion';
    permiteInvitadosExternos: boolean;
    fechaInicio: string;
    tiempoComidaInicioId: string;
    fechaFin: string;
    tiempoComidaFinId: string;
    centroCostoId?: string;
    maxParticipantes: number;
    adicionalesNoNominales: number;
};

type GestionActividadesData = {
    actividades: ActividadGestion[];
    inscripciones: InscripcionGestion[];
    centroCostos: CentroDeCosto[];
    tiemposComida: (TiempoComida & { id: TiempoComidaId })[];
    comedores: (ComedorData & { id: ComedorId })[];
    gruposComidas?: (GrupoComida & { id: string })[];
};

type ActionResult = {
    success: boolean;
    error?: unknown;
};

export const gestionActividadesQueryKey = (residenciaId: ResidenciaId) =>
    ['gerencia-actividades', residenciaId] as const;

const normalizarActividad = (actividad: Partial<ActividadGestion> & { id: string; residenciaId: string }): ActividadGestion => ({
    id: actividad.id,
    residenciaId: actividad.residenciaId,
    organizadorId: actividad.organizadorId || '',
    titulo: actividad.titulo || 'Actividad',
    descripcion: actividad.descripcion || undefined,
    lugar: actividad.lugar || undefined,
    estado: actividad.estado || 'pendiente',
    visibilidad: actividad.visibilidad || 'publica',
    tipoAcceso: actividad.tipoAcceso || 'abierta',
    permiteInvitadosExternos: Boolean(actividad.permiteInvitadosExternos),
    fechaInicio: actividad.fechaInicio || '',
    tiempoComidaInicioId: actividad.tiempoComidaInicioId || '',
    fechaFin: actividad.fechaFin || '',
    tiempoComidaFinId: actividad.tiempoComidaFinId || '',
    centroCostoId: actividad.centroCostoId ?? null,
    avisoAdministracion: (actividad as any).avisoAdministracion || 'no_comunicado',
    maxParticipantes: actividad.maxParticipantes ?? 1,
    conteoInscritos: actividad.conteoInscritos ?? 0,
    adicionalesNoNominales: actividad.adicionalesNoNominales ?? 0,
});

const esCambioCritico = (antes: ActividadGestion, despues: ActividadInput): boolean =>
    antes.fechaInicio !== despues.fechaInicio ||
    antes.fechaFin !== despues.fechaFin ||
    antes.tiempoComidaInicioId !== despues.tiempoComidaInicioId ||
    antes.tiempoComidaFinId !== despues.tiempoComidaFinId ||
    (antes.centroCostoId || undefined) !== (despues.centroCostoId || undefined);

export function useGestionActividadesQuery(residenciaId: ResidenciaId) {
    return useQuery<GestionActividadesData>({
        queryKey: gestionActividadesQueryKey(residenciaId),
        enabled: Boolean(residenciaId),
        queryFn: async () => {
            const result = await obtenerDatosInicialesGestionActividades(residenciaId);
            if (!result.success || !result.data) {
                throw new Error(typeof result.error === 'string' ? result.error : 'No se pudo cargar actividades.');
            }
            return result.data as GestionActividadesData;
        },
    });
}

export function useMutacionesGestionActividades(residenciaId: ResidenciaId, actorId: string) {
    const queryClient = useQueryClient();
    const queryKey = gestionActividadesQueryKey(residenciaId);

    const invalidate = () => queryClient.invalidateQueries({ queryKey });

    const crearActividadMutation = useMutation({
        mutationFn: (payload: ActividadInput) => createActividad(residenciaId, payload),
        onMutate: async (payload) => {
            await queryClient.cancelQueries({ queryKey });
            const prev = queryClient.getQueryData<GestionActividadesData>(queryKey);

            const tempId = `temp-${Date.now()}`;
            if (prev) {
                const optimisticActividad = normalizarActividad({
                    id: tempId,
                    residenciaId,
                    organizadorId: actorId,
                    estado: 'pendiente',
                    conteoInscritos: 0,
                    ...payload,
                });

                queryClient.setQueryData<GestionActividadesData>(queryKey, {
                    ...prev,
                    actividades: [optimisticActividad, ...prev.actividades],
                });
            }

            return { prev, tempId };
        },
        onError: (_error, _payload, context) => {
            if (context?.prev) {
                queryClient.setQueryData(queryKey, context.prev);
            }
        },
        onSuccess: (result, _payload, context) => {
            if (!result.success) {
                if (context?.prev) {
                    queryClient.setQueryData(queryKey, context.prev);
                }
                return;
            }

            if (!result.data || !context?.tempId) {
                return;
            }

            queryClient.setQueryData<GestionActividadesData>(queryKey, (current) => {
                if (!current) return current;

                const creada = normalizarActividad(result.data as ActividadGestion);
                return {
                    ...current,
                    actividades: current.actividades.map((actividad) =>
                        actividad.id === context.tempId ? creada : actividad
                    ),
                };
            });
        },
        onSettled: invalidate,
    });

    const actualizarActividadMutation = useMutation({
        mutationFn: (input: { actividadId: string; payload: ActividadInput }) =>
            updateActividad(input.actividadId, residenciaId, input.payload),
        onMutate: async ({ actividadId, payload }) => {
            await queryClient.cancelQueries({ queryKey });
            const prev = queryClient.getQueryData<GestionActividadesData>(queryKey);

            if (prev) {
                const actividadActual = prev.actividades.find((actividad) => actividad.id === actividadId);
                const cambiosCriticos = actividadActual ? esCambioCritico(actividadActual, payload) : false;

                queryClient.setQueryData<GestionActividadesData>(queryKey, {
                    ...prev,
                    actividades: prev.actividades.map((actividad) =>
                        actividad.id === actividadId
                            ? {
                                  ...actividad,
                                  ...payload,
                                  descripcion: payload.descripcion || undefined,
                                  lugar: payload.lugar || undefined,
                                  centroCostoId: payload.centroCostoId || null,
                                  conteoInscritos:
                                      cambiosCriticos && actividad.estado !== 'pendiente'
                                          ? 0
                                          : actividad.conteoInscritos,
                              }
                            : actividad
                    ),
                    inscripciones:
                        cambiosCriticos && actividadActual?.estado !== 'pendiente'
                            ? prev.inscripciones.filter((inscripcion) => inscripcion.actividadId !== actividadId)
                            : prev.inscripciones,
                });
            }

            return { prev };
        },
        onError: (_error, _payload, context) => {
            if (context?.prev) {
                queryClient.setQueryData(queryKey, context.prev);
            }
        },
        onSuccess: (result, _payload, context) => {
            if (!result.success && context?.prev) {
                queryClient.setQueryData(queryKey, context.prev);
            }
        },
        onSettled: invalidate,
    });

    const cambiarEstadoMutation = useMutation({
        mutationFn: (input: { actividadId: string; newState: EstadoActividadGestion }) =>
            updateActividadEstado(input.actividadId, residenciaId, input.newState),
        onMutate: async ({ actividadId, newState }) => {
            await queryClient.cancelQueries({ queryKey });
            const prev = queryClient.getQueryData<GestionActividadesData>(queryKey);

            if (prev) {
                queryClient.setQueryData<GestionActividadesData>(queryKey, {
                    ...prev,
                    actividades: prev.actividades.map((actividad) =>
                        actividad.id === actividadId ? { ...actividad, estado: newState } : actividad
                    ),
                    inscripciones:
                        newState === 'cancelada'
                            ? prev.inscripciones.map((inscripcion) =>
                                  inscripcion.actividadId === actividadId
                                      ? { ...inscripcion, estado: 'cancelada_por_organizador' }
                                      : inscripcion
                              )
                            : prev.inscripciones,
                });
            }

            return { prev };
        },
        onError: (_error, _payload, context) => {
            if (context?.prev) {
                queryClient.setQueryData(queryKey, context.prev);
            }
        },
        onSuccess: (result: ActionResult, _payload, context) => {
            if (!result.success && context?.prev) {
                queryClient.setQueryData(queryKey, context.prev);
            }
        },
        onSettled: invalidate,
    });

    return {
        crearActividadMutation,
        actualizarActividadMutation,
        cambiarEstadoMutation,
    };
}

