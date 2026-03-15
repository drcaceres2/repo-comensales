"use client";

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/useToast';
import { buildMensajesQueryKey } from '@/components/layout/AppProviders';
import {
  cambiarEstadoMensajeAction,
  enviarMensajeAction,
  obtenerDestinatariosMensajesAction,
  obtenerMensajesBandejaAction,
} from '../actions';
import { Mensaje } from 'shared/schemas/comunicacion/mensajes.dominio';
import { CambiarEstadoMensaje, FormNuevoMensaje } from 'shared/schemas/comunicacion/mensajes.dto';

export type DestinatariosMensajesData = {
  usuarios: Array<{ id: string; nombre: string; roles: string[] }>;
  grupos: Array<{ id: string; nombre: string; esTecnico: boolean }>;
};

function destinatariosQueryKey(residenciaId: string) {
  return ['mensajes-destinatarios', residenciaId] as const;
}

export function useMensajes(
  residenciaId: string,
  usuarioId: string,
  initialMensajes: Mensaje[],
  initialDestinatarios: DestinatariosMensajesData
) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const keyMensajes = buildMensajesQueryKey(residenciaId, usuarioId);
  const keyDestinatarios = destinatariosQueryKey(residenciaId);

  const mensajesQuery = useQuery({
    queryKey: keyMensajes,
    queryFn: async () => {
      const result = await obtenerMensajesBandejaAction(residenciaId);
      if (!result.success || !result.data) {
        throw new Error(result.error?.message ?? 'No se pudo cargar la bandeja.');
      }
      return result.data;
    },
    initialData: initialMensajes,
    enabled: Boolean(residenciaId && usuarioId),
  });

  const destinatariosQuery = useQuery({
    queryKey: keyDestinatarios,
    queryFn: async () => {
      const result = await obtenerDestinatariosMensajesAction(residenciaId);
      if (!result.success || !result.data) {
        throw new Error(result.error?.message ?? 'No se pudo cargar destinatarios.');
      }
      return result.data as DestinatariosMensajesData;
    },
    initialData: initialDestinatarios,
    enabled: Boolean(residenciaId),
  });

  const enviarMutation = useMutation({
    mutationFn: (payload: FormNuevoMensaje) => enviarMensajeAction(residenciaId, payload),
    onSuccess: (result) => {
      if (!result.success) {
        toast({
          variant: 'destructive',
          title: 'Error al enviar',
          description: result.error?.message ?? 'No se pudo enviar el mensaje.',
        });
        return;
      }

      toast({
        title: 'Mensaje enviado',
        description: `Se entregó a ${result.data?.enviados ?? 0} destinatario(s).`,
      });
      queryClient.invalidateQueries({ queryKey: keyMensajes });
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: 'Error al enviar',
        description: error.message,
      });
    },
  });

  const estadoMutation = useMutation({
    mutationFn: (payload: CambiarEstadoMensaje) => cambiarEstadoMensajeAction(residenciaId, payload),
    onSuccess: (result) => {
      if (!result.success) {
        toast({
          variant: 'destructive',
          title: 'No se pudo actualizar',
          description: result.error?.message ?? 'Error desconocido.',
        });
        return;
      }

      queryClient.invalidateQueries({ queryKey: keyMensajes });
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: 'Error al actualizar',
        description: error.message,
      });
    },
  });

  return {
    mensajes: mensajesQuery.data,
    destinatarios: destinatariosQuery.data,
    isLoading: mensajesQuery.isLoading || destinatariosQuery.isLoading,
    isSending: enviarMutation.isPending,
    isUpdating: estadoMutation.isPending,
    enviarMensaje: (payload: FormNuevoMensaje) => enviarMutation.mutate(payload),
    cambiarEstado: (payload: CambiarEstadoMensaje) => estadoMutation.mutate(payload),
  };
}


