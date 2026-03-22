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

// Accept a wrapper from the client: { payload: UpsertSemanarioPayload, configContext?: Record<string, { requiereAprobacion?: boolean }> }
// Use broad typing for the callable input to remain compatible with the new wrapper shape.
const upsertSemanarioFn = httpsCallable<any, UpsertSemanarioResponse>(functions, 'upsertSemanario');

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
    // The mutation accepts either the raw UpsertSemanarioPayload (backwards compatible)
    // or an object { payload, configContext } where configContext is serializable and
    // maps configuracionAlternativaId -> { requiereAprobacion: boolean }.
    mutationFn: async (input: UpsertSemanarioPayload | { payload: UpsertSemanarioPayload; configContext?: Record<string, { requiereAprobacion?: boolean }> }) => {
      try {
        // Normalize into wrapper shape
        const wrapper = (('payload' in (input as any)) ? (input as any) : { payload: input });

        // Ensure serializable: strip any non-serializable values
        const safeWrapper = JSON.parse(JSON.stringify(wrapper));

        const result = await upsertSemanarioFn(safeWrapper);
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
