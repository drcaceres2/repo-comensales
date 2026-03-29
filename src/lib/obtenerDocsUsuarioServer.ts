import 'server-only';

import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { db } from '@/lib/firebaseAdmin';
import { obtenerInfoUsuarioServer } from '@/lib/obtenerInfoUsuarioServer';
import type { Usuario } from 'shared/schemas/usuarios';
import type { Residencia } from 'shared/schemas/residencia';

const REVALIDATE_RESIDENCIA_SEGUNDOS = 86400;

async function leerUsuarioPorId(usuarioId: string): Promise<Usuario | null> {
  const snapshot = await db.collection('usuarios').doc(usuarioId).get();

  if (!snapshot.exists) {
    return null;
  }

  return snapshot.data() as Usuario;
}

async function leerResidenciaPorId(residenciaId: string): Promise<Residencia | null> {
  const snapshot = await db.collection('residencias').doc(residenciaId).get();

  if (!snapshot.exists) {
    return null;
  }

  return snapshot.data() as Residencia;
}

/**
 * Nivel 1 (React.cache): deduplica lecturas repetidas dentro del mismo request/render.
 */
export const obtenerDocUsuario = cache(async (): Promise<Usuario | null> => {
  const { usuarioId } = await obtenerInfoUsuarioServer();

  if (!usuarioId) {
    return null;
  }

  return leerUsuarioPorId(usuarioId);
});

/**
 * Nivel 1 (React.cache): deduplica en el request actual.
 * Nivel 2 (unstable_cache): persiste el resultado entre requests por 24h y habilita invalidación por tags.
 */
export const obtenerDocResidencia = cache(async (): Promise<Residencia | null> => {
  const { residenciaId } = await obtenerInfoUsuarioServer();

  if (!residenciaId) {
    return null;
  }

  const getCachedResidencia = unstable_cache(
    async () => leerResidenciaPorId(residenciaId),
    ['dal-residencia', residenciaId],
    {
      revalidate: REVALIDATE_RESIDENCIA_SEGUNDOS,
      tags: ['residencia', `residencia:${residenciaId}`],
    }
  );

  return getCachedResidencia();
});

