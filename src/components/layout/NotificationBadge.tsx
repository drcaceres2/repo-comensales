'use client';

import Link from 'next/link';
import { Mail } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { buildMensajesNoLeidosQueryKey, useInfoUsuario } from '@/components/layout/AppProviders';
import { contarMensajesNoLeidosAction } from '@/app/[residenciaId]/mensajes/actions';

export function NotificationBadge() {
  const { usuarioId, residenciaId } = useInfoUsuario();

  const { data } = useQuery({
    queryKey: buildMensajesNoLeidosQueryKey(residenciaId, usuarioId),
    queryFn: async () => {
      const result = await contarMensajesNoLeidosAction(residenciaId);
      if (!result.success) {
        return 0;
      }
      return result.data?.total ?? 0;
    },
    staleTime: 60 * 1000,
    enabled: Boolean(usuarioId && residenciaId),
  });

  if (!usuarioId || !residenciaId) {
    return null;
  }

  const total = data ?? 0;

  return (
    <Link
      href={`/${residenciaId}/mensajes`}
      className="relative inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-primary-foreground/10"
      title="Mensajes"
      aria-label="Mensajes"
    >
      <Mail className="h-5 w-5" />
      {total > 0 ? (
        <span className="absolute -right-1 -top-1 inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
          {total > 99 ? '99+' : total}
        </span>
      ) : null}
    </Link>
  );
}


