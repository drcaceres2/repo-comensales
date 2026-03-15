"use server";

import { db, FieldValue } from '@/lib/firebaseAdmin';
import { obtenerInfoUsuarioServer } from '@/lib/obtenerInfoUsuarioServer';
import {
  FormNuevoMensajeSchema,
  GRUPO_TECNICO_DIRECCION_GENERAL,
} from 'shared/schemas/comunicacion/mensajes.dto';
import { MensajeSchema } from 'shared/schemas/comunicacion/mensajes.dominio';
import { ActionResponse } from 'shared/models/types';
import { z } from 'zod';

type FormNuevoMensaje = z.infer<typeof FormNuevoMensajeSchema>;

function inferirRolRemitente(roles: string[]): 'residente' | 'director' | 'asistente' | 'sistema' {
  if (roles.includes('director')) return 'director';
  if (roles.includes('asistente')) return 'asistente';
  if (roles.includes('residente')) return 'residente';
  return 'sistema';
}

export async function enviarMensaje(
  residenciaId: string,
  payload: FormNuevoMensaje
): Promise<ActionResponse<void>> {
  try {
    const parsed = FormNuevoMensajeSchema.safeParse({
      ...payload,
      destinoTipo: 'grupo',
      destinatarioGrupoAnaliticoId: GRUPO_TECNICO_DIRECCION_GENERAL,
    });
    if (!parsed.success) {
      return {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Mensaje inválido.',
          detalles: parsed.error.issues,
        },
      };
    }

    const sesion = await obtenerInfoUsuarioServer();
    if (!sesion.usuarioId || sesion.residenciaId !== residenciaId) {
      return {
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'No autorizado para enviar mensajes en esta residencia.',
        },
      };
    }

    const directoresSnap = await db
      .collection('usuarios')
      .where('residenciaId', '==', residenciaId)
      .where('estaActivo', '==', true)
      .where('roles', 'array-contains', 'director')
      .select('id')
      .limit(250)
      .get();

    if (directoresSnap.empty) {
      return {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'No hay destinatarios en dirección general.',
        },
      };
    }

    const batch = db.batch();
    for (const directorDoc of directoresSnap.docs) {
      const mensaje = {
        residenciaId,
        remitenteId: sesion.usuarioId,
        remitenteRol: inferirRolRemitente(sesion.roles ?? []),
        destinatarioId: directorDoc.id,
        destinoTipo: 'grupo' as const,
        destinatarioGrupoAnaliticoId: GRUPO_TECNICO_DIRECCION_GENERAL,
        asunto: parsed.data.asunto,
        cuerpo: parsed.data.cuerpo,
        estado: 'enviado' as const,
        referenciaContexto: parsed.data.referenciaContexto,
        timestampCreacion: FieldValue.serverTimestamp(),
      };

      const valid = MensajeSchema.safeParse(mensaje);
      if (!valid.success) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'No fue posible construir el mensaje.',
            detalles: valid.error.issues,
          },
        };
      }

      const ref = db.collection(`residencias/${residenciaId}/mensajes`).doc();
      batch.set(ref, valid.data);
    }

    await batch.commit();
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'INTERNAL',
        message: 'No se pudo enviar el mensaje.',
        detalles: error,
      },
    };
  }
}