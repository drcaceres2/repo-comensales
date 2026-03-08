import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createAlteracionCommand, updateAlteracion } from '../actions';
import { AlteracionDiaria } from 'shared/schemas/alteraciones';
import { CreateAlteracionDiaria, UpdateAlteracionDiaria } from './esquemas';
import { ConfiguracionResidencia } from 'shared/schemas/residencia';
import { CONFIG_RESIDENCIA_ID, HORARIOS_QUERY_KEY, ResidenciaId} from "shared/models/types";
import {doc, getDoc, collection, getDocs, db} from "@/lib/firebase";

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
      const queryKey = ['alteraciones', residenciaId];

      await queryClient.cancelQueries({ queryKey });

      const previousAlteraciones = queryClient.getQueryData<AlteracionDiaria[]>(queryKey);

      queryClient.setQueryData<AlteracionDiaria[]>(queryKey, (old = []) => [
        ...old,
        {
          ...nuevaAlteracion,
          residenciaId,
        } as AlteracionDiaria,
      ]);

      return { previousAlteraciones };
    },
    onError: (err, newTodo, context) => {
      if (context?.previousAlteraciones) {
        queryClient.setQueryData(['alteraciones', residenciaId], context.previousAlteraciones);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['alteraciones', residenciaId] });
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
      const queryKey = ['alteraciones', residenciaId];

      await queryClient.cancelQueries({ queryKey });

      const previousAlteraciones = queryClient.getQueryData<AlteracionDiaria[]>(queryKey);

      queryClient.setQueryData<AlteracionDiaria[]>(queryKey, (old = []) =>
        old.map(alteracion =>
          alteracion.fecha === updatedAlteracion.fecha ? { ...alteracion, ...updatedAlteracion } : alteracion
        )
      );

      return { previousAlteraciones };
    },
    onError: (err, newTodo, context) => {
      if (context?.previousAlteraciones) {
        queryClient.setQueryData(['alteraciones', residenciaId], context.previousAlteraciones);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['alteraciones', residenciaId] });
    },
  });
};

export const useAlteracionesQuery = (residenciaId: ResidenciaId) => {
    return useQuery<AlteracionDiaria[]>({
        queryKey: ['alteraciones', residenciaId],
        queryFn: async () => {
            if (!residenciaId) return [];
      const querySnapshot = await getDocs(collection(db, `residencias/${residenciaId}/alteracionesHorario`));
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
