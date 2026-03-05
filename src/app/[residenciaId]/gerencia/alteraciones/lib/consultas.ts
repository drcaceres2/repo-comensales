import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createAlteracionCommand } from '../actions';
import { AlteracionDiaria } from '../../../../../../shared/schemas/alteraciones';
import { CreateAlteracionDiaria } from './esquemas';
import { ConfiguracionResidencia } from '../../../../../../shared/schemas/residencia';
import { CONFIG_RESIDENCIA_ID, HORARIOS_QUERY_KEY} from "../../../../../../shared/models/types";
import {doc, getDoc, collection, getDocs} from "firebase/firestore";
import {db} from "@/lib/firebase";

const fetchHorarios = async (residenciaId: string): Promise<Partial<ConfiguracionResidencia>> => {
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
            configuracionAlternativas: data.configuracionAlternativas || {},
            comedores: data.comedores || {},
        };
    }
    return {};
}

export const useCreateAlteracion = (residenciaId: string) => {
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

export const useAlteracionesQuery = (residenciaId: string) => {
    return useQuery<AlteracionDiaria[]>({
        queryKey: ['alteraciones', residenciaId],
        queryFn: async () => {
            if (!residenciaId) return [];
            const querySnapshot = await getDocs(collection(db, `residencias/${residenciaId}/alteraciones`));
            return querySnapshot.docs.map(doc => doc.data() as AlteracionDiaria);
        },
        enabled: !!residenciaId,
    });
};

export const useConfiguracionResidenciaQuery = (residenciaId: string) => {
    return useQuery<Partial<ConfiguracionResidencia>>({
        queryKey: [HORARIOS_QUERY_KEY, residenciaId],
        queryFn: () => fetchHorarios(residenciaId),
        enabled: !!residenciaId,
    });
};
