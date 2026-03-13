"use server";

import { db } from '@/lib/firebaseAdmin';
import { obtenerInfoUsuarioServer } from '@/lib/obtenerInfoUsuarioServer';
import { ActionResponse } from 'shared/models/types';
import { RolUsuario } from 'shared/models/types';
import { Usuario } from 'shared/schemas/usuarios';

type TargetUsuarioContext = {
  sesion: Awaited<ReturnType<typeof obtenerInfoUsuarioServer>>;
  targetUid: string;
  targetUsuario: Usuario;
  origenAutoridad: 'residente' | 'director-modificable';
};

function errorResponse(
  code: NonNullable<ActionResponse<void>['error']>['code'],
  message: string,
  detalles?: unknown
): ActionResponse<void> {
  return { success: false, error: { code, message, detalles } };
}

export async function resolveTargetUsuarioContext(
  residenciaId: string,
  requestedTargetUid?: string
): Promise<{ success: true; data: TargetUsuarioContext } | { success: false; error: ActionResponse<void>['error'] }> {
  const sesion = await obtenerInfoUsuarioServer();
  if (!sesion.usuarioId || sesion.residenciaId !== residenciaId) {
    return {
      success: false,
      error: errorResponse('UNAUTHORIZED', 'No autorizado para esta residencia.').error,
    };
  }

  const targetUid = requestedTargetUid?.trim() || sesion.usuarioId;

  const targetSnap = await db.collection('usuarios').doc(targetUid).get();
  if (!targetSnap.exists) {
    return {
      success: false,
      error: errorResponse('UNAUTHORIZED', 'El usuario objetivo no existe o no está disponible.').error,
    };
  }

  const targetUsuario = targetSnap.data() as Usuario;
  if (targetUsuario.residenciaId !== residenciaId || !targetUsuario.estaActivo) {
    return {
      success: false,
      error: errorResponse('UNAUTHORIZED', 'El usuario objetivo no pertenece a esta residencia.').error,
    };
  }

  if (targetUid === sesion.usuarioId) {
    return {
      success: true,
      data: {
        sesion,
        targetUid,
        targetUsuario,
        origenAutoridad: 'residente',
      },
    };
  }

  const rolesPrivilegiados: RolUsuario[] = ['director', 'admin', 'master'];
  const esDirectorOPrivilegiado = rolesPrivilegiados.some((rol) => sesion.roles.includes(rol));
  if (esDirectorOPrivilegiado) {
    return {
      success: true,
      data: {
        sesion,
        targetUid,
        targetUsuario,
        origenAutoridad: 'director-modificable',
      },
    };
  }

  if (sesion.roles.includes('asistente')) {
    const assistantSnap = await db.collection('usuarios').doc(sesion.usuarioId).get();
    if (!assistantSnap.exists) {
      return {
        success: false,
        error: errorResponse('INTERNAL', 'No se pudo resolver la configuración del asistente.').error,
      };
    }

    const assistantUser = assistantSnap.data() as Usuario;
    const puedeActuarSobreTarget = Boolean(assistantUser.asistente?.usuariosAsistidos?.[targetUid]);
    if (puedeActuarSobreTarget) {
      return {
        success: true,
        data: {
          sesion,
          targetUid,
          targetUsuario,
          origenAutoridad: 'director-modificable',
        },
      };
    }
  }

  return {
    success: false,
    error: errorResponse('UNAUTHORIZED', 'No tienes permiso para gestionar las elecciones de este usuario.').error,
  };
}