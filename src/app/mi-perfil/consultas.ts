'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { obtenerMiPerfilRead, obtenerOpcionesObjetivoMiPerfil } from './actions';

// ── Query keys ────────────────────────────────────────────────────────────────
// viewerUid siempre incluido para aislar el caché entre distintos usuarios
// que comparten el mismo navegador/sesión de React Query.
export const miPerfilQueryKeys = {
    objetivos: (viewerUid: string) =>
        ['mi-perfil', viewerUid, 'objetivos'] as const,
    detalle: (viewerUid: string, targetUid: string) =>
        ['mi-perfil', viewerUid, 'detalle', targetUid] as const,
};

// ── Hooks de consulta ─────────────────────────────────────────────────────────

export function useObjetivosQuery(viewerUid: string) {
    return useQuery({
        queryKey: miPerfilQueryKeys.objetivos(viewerUid),
        queryFn: async () => {
            const response = await obtenerOpcionesObjetivoMiPerfil();
            if (!response.success || !response.data) {
                throw new Error(response.error?.message ?? 'No se pudo cargar usuarios disponibles.');
            }
            return response.data;
        },
        enabled: Boolean(viewerUid),
        staleTime: 1000 * 60 * 10,
    });
}

export function usePerfilDetalleQuery(viewerUid: string, targetUid: string) {
    return useQuery({
        queryKey: miPerfilQueryKeys.detalle(viewerUid, targetUid),
        queryFn: async () => {
            const response = await obtenerMiPerfilRead(targetUid);
            if (!response.success || !response.data) {
                throw new Error(response.error?.message ?? 'No se pudo cargar el perfil.');
            }
            return response.data;
        },
        enabled: Boolean(viewerUid && targetUid),
        staleTime: 1000 * 60 * 3,
    });
}

// ── Hook de invalidación ──────────────────────────────────────────────────────

export function useInvalidarPerfil(viewerUid: string) {
    const queryClient = useQueryClient();

    return {
        invalidarDetalle: (targetUid: string) =>
            queryClient.invalidateQueries({
                queryKey: miPerfilQueryKeys.detalle(viewerUid, targetUid),
            }),
        invalidarObjetivos: () =>
            queryClient.invalidateQueries({
                queryKey: miPerfilQueryKeys.objetivos(viewerUid),
            }),
    };
}
