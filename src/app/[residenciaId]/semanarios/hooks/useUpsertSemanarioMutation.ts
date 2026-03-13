'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/useToast';
import { functions, httpsCallable } from '@/lib/firebase';
import { SEMANARIOS_QUERY_KEY } from 'shared/models/types';
import { UpsertSemanarioPayload } from 'shared/schemas/semanarios/semanario.dto';

type UpsertSemanarioResponse = {
  success: boolean;
  semanaIsoAplicada: string;
  updatedAt: string;
  message: string;
};

const upsertSemanarioFn = httpsCallable<UpsertSemanarioPayload, UpsertSemanarioResponse>(
  functions,
  'upsertSemanario'
);

function parseCallableError(error: any): Error {
  const code = error?.code ?? error?.details?.code;
  const message = error?.message ?? error?.details?.message ?? 'No se pudo guardar el semanario.';
  const err = new Error(message);
  (err as Error & { code?: string }).code = code;
  return err;
}

export function useUpsertSemanarioMutation(residenciaId: string, targetUid?: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationKey: [SEMANARIOS_QUERY_KEY, residenciaId, targetUid ?? 'self', 'upsert'],
    mutationFn: async (payload: UpsertSemanarioPayload) => {
      try {
        const result = await upsertSemanarioFn(payload);
        return result.data;
      } catch (error: any) {
        throw parseCallableError(error);
      }
    },
    onSuccess: async () => {
      toast({ title: 'Semanario guardado', description: 'Los cambios se aplicaron correctamente.' });
      await queryClient.invalidateQueries({ queryKey: [SEMANARIOS_QUERY_KEY, residenciaId] });
    },
    onError: (error: Error & { code?: string }) => {
      const isConflict = error.code?.includes('failed-precondition');
      toast({
        title: isConflict ? 'Conflicto de concurrencia' : 'No se pudo guardar',
        description: isConflict
          ? 'Otro usuario actualizó el semanario antes que tú. Recarga la vista e intenta de nuevo.'
          : error.message,
        variant: 'destructive',
      });
    },
  });
}
