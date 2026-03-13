"use server";

import { db, FieldValue } from '@/lib/firebaseAdmin';
import { obtenerInfoUsuarioServer } from '@/lib/obtenerInfoUsuarioServer';
import { FormNuevoMensajeSchema } from 'shared/schemas/comunicacion/mensajes.dto'; // o ui.schema
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
    const parsed = FormNuevoMensajeSchema.safeParse(payload);
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

    const mensaje = {
      residenciaId,
      remitenteId: sesion.usuarioId,
      remitenteRol: inferirRolRemitente(sesion.roles ?? []),
      destinatarioId: null,
      asunto: parsed.data.asunto,
      cuerpo: parsed.data.cuerpo,
      estado: 'no_leido',
      referenciaContexto: parsed.data.referenciaContexto,
      timestampCreacion: FieldValue.serverTimestamp(),
      timestampLectura: undefined,
      timestampResolucion: undefined,
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

    await db.collection(`usuarios/${sesion.usuarioId}/mensajes`).add(mensaje);
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