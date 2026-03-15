"use server";

import { revalidatePath } from 'next/cache';
import { db, FieldValue, Timestamp } from '@/lib/firebaseAdmin';
import { obtenerInfoUsuarioServer } from '@/lib/obtenerInfoUsuarioServer';
import { ActionResponse } from 'shared/models/types';
import {
  CambiarEstadoMensaje,
  CambiarEstadoMensajeSchema,
  FormNuevoMensaje,
  FormNuevoMensajeSchema,
  GRUPO_TECNICO_DIRECCION_GENERAL,
} from 'shared/schemas/comunicacion/mensajes.dto';
import { Mensaje, MensajeSchema } from 'shared/schemas/comunicacion/mensajes.dominio';
import { ConfiguracionResidencia } from 'shared/schemas/residencia';
import { GrupoUsuario, isGrupoAnalitico } from 'shared/schemas/usuariosGrupos';
import { Usuario } from 'shared/schemas/usuarios';

type OpcionUsuarioDestino = {
  id: string;
  nombre: string;
  roles: string[];
};

type OpcionGrupoDestino = {
  id: string;
  nombre: string;
  esTecnico: boolean;
};

type DestinatariosMensajes = {
  usuarios: OpcionUsuarioDestino[];
  grupos: OpcionGrupoDestino[];
};

const MENSAJES_LIMIT = 100;
const CHUNK_LIMIT = 400;

function errorResponse(
  code: 'UNAUTHORIZED' | 'VALIDATION_ERROR' | 'INTERNAL',
  message: string,
  detalles?: unknown
): ActionResponse<never> {
  return { success: false, error: { code, message, detalles } };
}

function inferirRolRemitente(roles: string[]): 'residente' | 'director' | 'asistente' | 'sistema' {
  if (roles.includes('director')) return 'director';
  if (roles.includes('asistente')) return 'asistente';
  if (roles.includes('residente')) return 'residente';
  return 'sistema';
}

function toIso(value: unknown): string | undefined {
  if (!value) return undefined;
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  if (value && typeof value === 'object' && typeof (value as { toDate?: unknown }).toDate === 'function') {
    return ((value as { toDate: () => Date }).toDate()).toISOString();
  }
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) {
    return new Date(value).toISOString();
  }
  return undefined;
}

function serializeMensaje(doc: FirebaseFirestore.QueryDocumentSnapshot): Mensaje {
  const data = doc.data();
  return {
    ...data,
    id: doc.id,
    timestampCreacion: toIso(data.timestampCreacion),
    timestampLectura: toIso(data.timestampLectura),
  } as Mensaje;
}

async function getUsuariosActivosResidencia(residenciaId: string): Promise<Usuario[]> {
  const snap = await db
    .collection('usuarios')
    .where('residenciaId', '==', residenciaId)
    .where('estaActivo', '==', true)
    .select('id', 'nombre', 'apellido', 'roles', 'gruposAnaliticosIds')
    .limit(250)
    .get();

  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Usuario);
}

async function resolverDestinatariosGrupo(residenciaId: string, grupoId: string): Promise<string[]> {
  if (grupoId === GRUPO_TECNICO_DIRECCION_GENERAL) {
    const directores = await db
      .collection('usuarios')
      .where('residenciaId', '==', residenciaId)
      .where('estaActivo', '==', true)
      .where('roles', 'array-contains', 'director')
      .select('id')
      .limit(250)
      .get();

    return directores.docs.map((doc) => doc.id);
  }

  const configDoc = await db.doc(`residencias/${residenciaId}/configuracion/general`).get();
  const config = (configDoc.exists ? configDoc.data() : undefined) as ConfiguracionResidencia | undefined;
  const grupo = config?.gruposUsuarios?.[grupoId] as GrupoUsuario | undefined;

  if (!grupo || !grupo.estaActivo || !isGrupoAnalitico(grupo)) {
    return [];
  }

  const usersSnap = await db
    .collection('usuarios')
    .where('residenciaId', '==', residenciaId)
    .where('estaActivo', '==', true)
    .where('gruposAnaliticosIds', 'array-contains', grupoId)
    .select('id')
    .limit(250)
    .get();

  return usersSnap.docs.map((doc) => doc.id);
}

export async function enviarMensajeAction(
  residenciaId: string,
  payload: FormNuevoMensaje
): Promise<ActionResponse<{ enviados: number }>> {
  try {
    const parsed = FormNuevoMensajeSchema.safeParse(payload);
    if (!parsed.success) {
      return errorResponse('VALIDATION_ERROR', 'Mensaje inválido.', parsed.error.issues);
    }

    const sesion = await obtenerInfoUsuarioServer();
    if (!sesion.usuarioId || sesion.residenciaId !== residenciaId) {
      return errorResponse('UNAUTHORIZED', 'No autorizado para enviar mensajes.');
    }

    let destinatarios: string[] = [];
    if (parsed.data.destinoTipo === 'usuario') {
      const userDoc = await db.doc(`usuarios/${parsed.data.destinatarioUsuarioId}`).get();
      const userData = userDoc.data() as Usuario | undefined;

      if (!userDoc.exists || !userData?.estaActivo || userData.residenciaId !== residenciaId) {
        return errorResponse('VALIDATION_ERROR', 'El destinatario no es válido para la residencia.');
      }

      destinatarios = [parsed.data.destinatarioUsuarioId];
    } else {
      destinatarios = await resolverDestinatariosGrupo(residenciaId, parsed.data.destinatarioGrupoAnaliticoId);
      if (destinatarios.length === 0) {
        return errorResponse('VALIDATION_ERROR', 'No se encontraron destinatarios para el grupo seleccionado.');
      }
    }

    const destinatariosUnicos = Array.from(new Set(destinatarios));
    const remitenteRol = inferirRolRemitente(sesion.roles ?? []);

    for (let i = 0; i < destinatariosUnicos.length; i += CHUNK_LIMIT) {
      const chunk = destinatariosUnicos.slice(i, i + CHUNK_LIMIT);
      const batch = db.batch();

      for (const destinatarioId of chunk) {
        const mensajeBase = {
          residenciaId,
          remitenteId: sesion.usuarioId,
          remitenteRol,
          destinatarioId,
          destinoTipo: parsed.data.destinoTipo,
          destinatarioGrupoAnaliticoId:
            parsed.data.destinoTipo === 'grupo' ? parsed.data.destinatarioGrupoAnaliticoId : undefined,
          asunto: parsed.data.asunto,
          cuerpo: parsed.data.cuerpo,
          estado: 'enviado' as const,
          referenciaContexto: parsed.data.referenciaContexto,
          timestampCreacion: FieldValue.serverTimestamp(),
          timestampLectura: undefined,
        };

        const valid = MensajeSchema.safeParse(mensajeBase);
        if (!valid.success) {
          return errorResponse('VALIDATION_ERROR', 'No fue posible construir el mensaje.', valid.error.issues);
        }

        const ref = db.collection(`residencias/${residenciaId}/mensajes`).doc();
        batch.set(ref, valid.data);
      }

      await batch.commit();
    }

    revalidatePath(`/${residenciaId}/mensajes`);
    return { success: true, data: { enviados: destinatariosUnicos.length } };
  } catch (error) {
    return errorResponse('INTERNAL', 'No se pudo enviar el mensaje.', error);
  }
}

export async function obtenerMensajesBandejaAction(
  residenciaId: string
): Promise<ActionResponse<Mensaje[]>> {
  try {
    const sesion = await obtenerInfoUsuarioServer();
    if (!sesion.usuarioId || sesion.residenciaId !== residenciaId) {
      return errorResponse('UNAUTHORIZED', 'No autorizado para consultar mensajes.');
    }

    const snap = await db
      .collection(`residencias/${residenciaId}/mensajes`)
      .where('destinatarioId', '==', sesion.usuarioId)
      .orderBy('timestampCreacion', 'desc')
      .limit(MENSAJES_LIMIT)
      .get();

    return {
      success: true,
      data: snap.docs.map(serializeMensaje),
    };
  } catch (error) {
    return errorResponse('INTERNAL', 'No se pudo obtener la bandeja.', error);
  }
}

export async function obtenerDestinatariosMensajesAction(
  residenciaId: string
): Promise<ActionResponse<DestinatariosMensajes>> {
  try {
    const sesion = await obtenerInfoUsuarioServer();
    if (!sesion.usuarioId || sesion.residenciaId !== residenciaId) {
      return errorResponse('UNAUTHORIZED', 'No autorizado para consultar destinatarios.');
    }

    const [usuarios, configDoc] = await Promise.all([
      getUsuariosActivosResidencia(residenciaId),
      db.doc(`residencias/${residenciaId}/configuracion/general`).get(),
    ]);

    const config = (configDoc.exists ? configDoc.data() : undefined) as ConfiguracionResidencia | undefined;
    const gruposConfig = Object.values((config?.gruposUsuarios ?? {}) as Record<string, GrupoUsuario>);

    const gruposAnaliticos = gruposConfig
      .filter((grupo) => grupo.estaActivo && isGrupoAnalitico(grupo))
      .map((grupo) => ({
        id: grupo.id,
        nombre: grupo.nombre,
        esTecnico: false,
      }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));

    const grupos: OpcionGrupoDestino[] = [
      {
        id: GRUPO_TECNICO_DIRECCION_GENERAL,
        nombre: 'Dirección general',
        esTecnico: true,
      },
      ...gruposAnaliticos,
    ];

    const usuariosOpciones: OpcionUsuarioDestino[] = usuarios
      .map((u) => ({
        id: u.id,
        nombre: `${u.nombre} ${u.apellido}`.trim() || u.id,
        roles: u.roles,
      }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));

    return {
      success: true,
      data: {
        usuarios: usuariosOpciones,
        grupos,
      },
    };
  } catch (error) {
    return errorResponse('INTERNAL', 'No se pudo obtener los destinatarios.', error);
  }
}

export async function cambiarEstadoMensajeAction(
  residenciaId: string,
  payload: CambiarEstadoMensaje
): Promise<ActionResponse<void>> {
  try {
    const parsed = CambiarEstadoMensajeSchema.safeParse(payload);
    if (!parsed.success) {
      return errorResponse('VALIDATION_ERROR', 'Solicitud inválida.', parsed.error.issues);
    }

    const sesion = await obtenerInfoUsuarioServer();
    if (!sesion.usuarioId || sesion.residenciaId !== residenciaId) {
      return errorResponse('UNAUTHORIZED', 'No autorizado para actualizar mensajes.');
    }

    const ref = db.doc(`residencias/${residenciaId}/mensajes/${parsed.data.mensajeId}`);
    const snap = await ref.get();

    if (!snap.exists) {
      return errorResponse('VALIDATION_ERROR', 'El mensaje no existe.');
    }

    const data = snap.data() as Mensaje;
    if (data.destinatarioId !== sesion.usuarioId) {
      return errorResponse('UNAUTHORIZED', 'No puedes modificar este mensaje.');
    }

    await ref.update({
      estado: parsed.data.estado,
      timestampLectura: parsed.data.estado === 'leido' ? FieldValue.serverTimestamp() : data.timestampLectura,
    });

    revalidatePath(`/${residenciaId}/mensajes`);
    return { success: true };
  } catch (error) {
    return errorResponse('INTERNAL', 'No se pudo actualizar el estado del mensaje.', error);
  }
}

export async function contarMensajesNoLeidosAction(
  residenciaId: string
): Promise<ActionResponse<{ total: number }>> {
  try {
    const sesion = await obtenerInfoUsuarioServer();
    if (!sesion.usuarioId || sesion.residenciaId !== residenciaId) {
      return errorResponse('UNAUTHORIZED', 'No autorizado para consultar mensajes.');
    }

    const snap = await db
      .collection(`residencias/${residenciaId}/mensajes`)
      .where('destinatarioId', '==', sesion.usuarioId)
      .where('estado', '==', 'enviado')
      .limit(200)
      .get();

    return { success: true, data: { total: snap.size } };
  } catch (error) {
    return errorResponse('INTERNAL', 'No se pudo contar los mensajes no leídos.', error);
  }
}

