import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createAlteracionCommand, deleteAlteracionDiaCommand, updateAlteracion } from '../actions';
import { AlteracionDiaria } from 'shared/schemas/alteraciones';
import { CreateAlteracionDiaria, UpdateAlteracionDiaria } from './esquemas';
import { ConfiguracionResidencia } from 'shared/schemas/residencia';
import { CONFIG_RESIDENCIA_ID, HORARIOS_QUERY_KEY, ResidenciaId} from "shared/models/types";
import {doc, getDoc, collection, getDocs, db} from "@/lib/firebase";

const ALTERACIONES_HORARIO_COLLECTION = 'alteracionesHorario';

const alteracionesKeys = {
  all: ['alteraciones'] as const,
  residencia: (residenciaId: ResidenciaId) => [...alteracionesKeys.all, residenciaId] as const,
  byDate: (residenciaId: ResidenciaId, fecha: string) => [...alteracionesKeys.residencia(residenciaId), fecha] as const,
};

const fetchHorarios = async (residenciaId: ResidenciaId): Promise<Partial<ConfiguracionResidencia>> => {
    const docRef = doc(db, `residencias/${residenciaId}/configuracion/${CONFIG_RESIDENCIA_ID}`);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
        const data = docSnap.data() as ConfiguracionResidencia;
        return {
            residenciaId: data.residenciaId,
            horariosSolicitud: data.horariosSolicitud || {},
            gruposComidas: data.gruposComidas || {},
            esquemaSemanal: data.esquemaSemanal || {},
            catalogoAlternativas: data.catalogoAlternativas || {},
            configuracionesAlternativas: data.configuracionesAlternativas || {},
            comedores: data.comedores || {},
            fechaHoraReferenciaUltimaSolicitud: data.fechaHoraReferenciaUltimaSolicitud || '',
        };
    }
    return {};
}

export const useCreateAlteracion = (residenciaId: ResidenciaId) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateAlteracionDiaria): Promise<AlteracionDiaria> => {
      return createAlteracionCommand(residenciaId, data);
    },
    onMutate: async (nuevaAlteracion) => {
      const queryKey = alteracionesKeys.byDate(residenciaId, nuevaAlteracion.fecha);

      await queryClient.cancelQueries({ queryKey });

      const previousAlteracion = queryClient.getQueryData<AlteracionDiaria | null>(queryKey);

      queryClient.setQueryData<AlteracionDiaria>(queryKey, {
        ...nuevaAlteracion,
        residenciaId,
      } as AlteracionDiaria);

      return { previousAlteracion, queryKey };
    },
    onError: (err, newTodo, context) => {
      console.error('[useCreateAlteracion] mutation error', err, { newTodo, context });
      if (context?.queryKey) {
        queryClient.setQueryData(context.queryKey, context.previousAlteracion ?? null);
      }
    },
    onSettled: (_data, _error, nuevaAlteracion) => {
      queryClient.invalidateQueries({ queryKey: alteracionesKeys.byDate(residenciaId, nuevaAlteracion.fecha) });
    },
  });
};

export const useUpdateAlteracion = (residenciaId: ResidenciaId) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: UpdateAlteracionDiaria): Promise<void> => {
      return updateAlteracion(residenciaId, data);
    },
    onMutate: async (updatedAlteracion) => {
      const queryKey = alteracionesKeys.byDate(residenciaId, updatedAlteracion.fecha);

      await queryClient.cancelQueries({ queryKey });

      const previousAlteracion = queryClient.getQueryData<AlteracionDiaria | null>(queryKey);

      const nextAlteracion: AlteracionDiaria = {
        ...(previousAlteracion ?? {
          fecha: updatedAlteracion.fecha,
          residenciaId,
          tiemposComidaAfectados: {},
        }),
        ...updatedAlteracion,
        residenciaId,
        fecha: updatedAlteracion.fecha,
        tiemposComidaAfectados: {
          ...(previousAlteracion?.tiemposComidaAfectados ?? {}),
          ...updatedAlteracion.tiemposComidaAfectados,
        },
      };

      queryClient.setQueryData<AlteracionDiaria>(queryKey, nextAlteracion);

      return { previousAlteracion, queryKey };
    },
    onError: (err, newTodo, context) => {
      console.error('[useUpdateAlteracion] mutation error', err, { newTodo, context });
      if (context?.queryKey) {
        queryClient.setQueryData(context.queryKey, context.previousAlteracion ?? null);
      }
    },
    onSettled: (_data, _error, updatedAlteracion) => {
      queryClient.invalidateQueries({ queryKey: alteracionesKeys.byDate(residenciaId, updatedAlteracion.fecha) });
    },
  });
};

export const useDeleteAlteracionDia = (residenciaId: ResidenciaId) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (fecha: string): Promise<void> => {
      return deleteAlteracionDiaCommand(residenciaId, fecha);
    },
    onMutate: async (fecha) => {
      const queryKey = alteracionesKeys.byDate(residenciaId, fecha);

      await queryClient.cancelQueries({ queryKey });

      const previousAlteracion = queryClient.getQueryData<AlteracionDiaria | null>(queryKey);
      queryClient.setQueryData<AlteracionDiaria | null>(queryKey, null);

      return { previousAlteracion, queryKey };
    },
    onError: (err, fecha, context) => {
      console.error('[useDeleteAlteracionDia] mutation error', err, { fecha, context });
      if (context?.queryKey) {
        queryClient.setQueryData(context.queryKey, context.previousAlteracion ?? null);
      }
    },
    onSettled: (_data, _error, fecha) => {
      queryClient.invalidateQueries({ queryKey: alteracionesKeys.byDate(residenciaId, fecha) });
    },
  });
};

export const useAlteracionDiaQuery = (residenciaId: ResidenciaId, fecha: string) => {
  return useQuery<AlteracionDiaria | null>({
    queryKey: alteracionesKeys.byDate(residenciaId, fecha),
    queryFn: async () => {
      if (!residenciaId || !fecha) return null;
      const docRef = doc(db, `residencias/${residenciaId}/${ALTERACIONES_HORARIO_COLLECTION}/${fecha}`);
      const docSnap = await getDoc(docRef);
      if (!docSnap.exists()) return null;
      return docSnap.data() as AlteracionDiaria;
    },
    enabled: !!residenciaId && !!fecha,
  });
};

/** @deprecated Usar `useAlteracionDiaQuery(residenciaId, fecha)` para evitar cargas completas de colección. */
export const useAlteracionesQuery = (residenciaId: ResidenciaId) => {
    return useQuery<AlteracionDiaria[]>({
        queryKey: alteracionesKeys.residencia(residenciaId),
        queryFn: async () => {
            if (!residenciaId) return [];
      const querySnapshot = await getDocs(collection(db, `residencias/${residenciaId}/${ALTERACIONES_HORARIO_COLLECTION}`));
            return querySnapshot.docs.map(doc => doc.data() as AlteracionDiaria);
        },
        enabled: !!residenciaId,
    });
};

export const useConfiguracionResidenciaQuery = (residenciaId: ResidenciaId) => {
    return useQuery<Partial<ConfiguracionResidencia>>({
        queryKey: [HORARIOS_QUERY_KEY, residenciaId],
        queryFn: () => fetchHorarios(residenciaId),
        enabled: !!residenciaId,
    });
};
