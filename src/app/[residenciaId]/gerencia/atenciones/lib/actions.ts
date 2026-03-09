'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  Atencion,
  AtencionSchema,
  ActualizarAtencionPayload,
  ActualizarAtencionPayloadSchema,
  CambiarEstadoAtencionPayload,
  CambiarEstadoAtencionPayloadSchema,
  CrearAtencionPayload,
  CrearAtencionPayloadSchema,
} from 'shared/schemas/atenciones';
import { FirestoreIdSchema } from 'shared/schemas/common';
import { db, FieldValue } from '@/lib/firebaseAdmin';
import { obtenerInfoUsuarioServer } from '@/lib/obtenerInfoUsuarioServer';

type ActionResponse<T> =
  | {
      success: true;
      data: T;
    }
  | {
      success: false;
      errors?: z.ZodError['formErrors'];
      message: string;
    };

const atencionesColeccion = (residenciaId: string) =>
  db.collection(`residencias/${residenciaId}/atenciones`);

function normalizarAtencion(docId: string, raw: any): Atencion {
  const data = { ...raw };

  if (data?.timestampCreacion?.toDate) {
    data.timestampCreacion = data.timestampCreacion.toDate().toISOString();
  }

  return {
    id: docId,
    ...data,
  } as Atencion;
}

function validarSesionResidencia(
  residenciaId: string,
  sesionResidenciaId: string,
): ActionResponse<never> | null {
  if (!residenciaId || residenciaId !== sesionResidenciaId) {
    return {
      success: false,
      message: 'Acceso no autorizado para la residencia solicitada.',
    };
  }

  return null;
}

function limpiarUndefined<T extends Record<string, any>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

function aplicarReglasEstado(
  estado?: Atencion['estado'],
): Partial<Pick<Atencion, 'estado' | 'avisoAdministracion'>> {
  if (!estado) {
    return {};
  }

  if (estado === 'rechazada') {
    return {
      estado,
      avisoAdministracion: 'cancelado',
    };
  }

  return { estado };
}

export async function obtenerAtenciones(residenciaId: string): Promise<Atencion[]> {
  const { residenciaId: residenciaSesion } = await obtenerInfoUsuarioServer();
  const validacion = validarSesionResidencia(residenciaId, residenciaSesion);

  if (validacion) {
    return [];
  }

  const snapshot = await atencionesColeccion(residenciaId).get();

  return snapshot.docs
    .map((doc) => normalizarAtencion(doc.id, doc.data()))
    .sort((a, b) => {
      const fechaA = new Date(a.fechaHoraAtencion).getTime();
      const fechaB = new Date(b.fechaHoraAtencion).getTime();
      return fechaB - fechaA;
    });
}

export async function crearAtencion(
  residenciaId: string,
  payload: CrearAtencionPayload,
): Promise<ActionResponse<Atencion>> {
  const { usuarioId, residenciaId: residenciaSesion } = await obtenerInfoUsuarioServer();
  const validacionResidencia = validarSesionResidencia(residenciaId, residenciaSesion);

  if (validacionResidencia) {
    return validacionResidencia;
  }

  const parsed = CrearAtencionPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      success: false,
      errors: parsed.error.flatten(),
      message: 'Datos invalidos para crear la atencion.',
    };
  }

  const docRef = atencionesColeccion(residenciaId).doc();

  const nuevaAtencion: Atencion = {
    id: docRef.id,
    residenciaId,
    autorId: usuarioId,
    nombre: parsed.data.nombre,
    comentarios: parsed.data.comentarios,
    fechaSolicitudComida: parsed.data.fechaSolicitudComida,
    fechaHoraAtencion: parsed.data.fechaHoraAtencion,
    estado: 'pendiente',
    avisoAdministracion: 'no_comunicado',
    centroCostoId: parsed.data.centroCostoId,
    timestampCreacion: FieldValue.serverTimestamp() as any,
  };

  const atencionValidada = AtencionSchema.safeParse(nuevaAtencion);
  if (!atencionValidada.success) {
    return {
      success: false,
      errors: atencionValidada.error.flatten(),
      message: 'No se pudo validar la atencion antes de guardar.',
    };
  }

  try {
    await docRef.set(limpiarUndefined(nuevaAtencion) as any);
    const docEscrito = await docRef.get();
    const atencion = normalizarAtencion(docRef.id, docEscrito.data());
    revalidatePath(`/${residenciaId}/gerencia/atenciones`);
    return { success: true, data: atencion };
  } catch (error) {
    console.error('crearAtencion: error al escribir en Firestore', error);
    return {
      success: false,
      message: 'No se pudo crear la atencion.',
    };
  }
}

export async function actualizarAtencion(
  residenciaId: string,
  payload: ActualizarAtencionPayload,
): Promise<ActionResponse<Atencion>> {
  const { residenciaId: residenciaSesion, usuarioId } = await obtenerInfoUsuarioServer();
  const validacionResidencia = validarSesionResidencia(residenciaId, residenciaSesion);

  if (validacionResidencia) {
    return validacionResidencia;
  }

  const parsed = ActualizarAtencionPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      success: false,
      errors: parsed.error.flatten(),
      message: 'Datos invalidos para actualizar la atencion.',
    };
  }

  const patch: Record<string, any> = {
    nombre: parsed.data.nombre,
    fechaSolicitudComida: parsed.data.fechaSolicitudComida,
    fechaHoraAtencion: parsed.data.fechaHoraAtencion,
    ...aplicarReglasEstado(parsed.data.estado),
  };

  if (parsed.data.comentarios) {
    patch.comentarios = parsed.data.comentarios;
  } else {
    patch.comentarios = FieldValue.delete();
  }

  if (parsed.data.centroCostoId) {
    patch.centroCostoId = parsed.data.centroCostoId;
  } else {
    patch.centroCostoId = FieldValue.delete();
  }

  if (parsed.data.estado === 'aprobada') {
    patch.aprobadorId = usuarioId;
  }

  const docRef = atencionesColeccion(residenciaId).doc(parsed.data.id);

  try {
    await docRef.set(patch, { merge: true });
    const actualizado = await docRef.get();
    if (!actualizado.exists) {
      return { success: false, message: 'La atencion ya no existe.' };
    }

    const atencion = normalizarAtencion(docRef.id, actualizado.data());
    revalidatePath(`/${residenciaId}/gerencia/atenciones`);
    return { success: true, data: atencion };
  } catch (error) {
    console.error('actualizarAtencion: error al actualizar en Firestore', error);
    return {
      success: false,
      message: 'No se pudo actualizar la atencion.',
    };
  }
}

export async function cambiarEstadoAtencion(
  residenciaId: string,
  payload: CambiarEstadoAtencionPayload,
): Promise<ActionResponse<Atencion>> {
  const { residenciaId: residenciaSesion, usuarioId } = await obtenerInfoUsuarioServer();
  const validacionResidencia = validarSesionResidencia(residenciaId, residenciaSesion);

  if (validacionResidencia) {
    return validacionResidencia;
  }

  const parsed = CambiarEstadoAtencionPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      success: false,
      errors: parsed.error.flatten(),
      message: 'Datos invalidos para cambiar estado de atencion.',
    };
  }

  const docRef = atencionesColeccion(residenciaId).doc(parsed.data.id);

  try {
    await db.runTransaction(async (trx) => {
      const snap = await trx.get(docRef);
      if (!snap.exists) {
        throw new Error('NOT_FOUND');
      }

      const patch: Record<string, any> = {
        ...aplicarReglasEstado(parsed.data.estado),
      };

      if (parsed.data.estado === 'aprobada') {
        patch.aprobadorId = usuarioId;
      }

      trx.update(docRef, patch);
    });

    const actualizado = await docRef.get();
    if (!actualizado.exists) {
      return { success: false, message: 'La atencion ya no existe.' };
    }

    const atencion = normalizarAtencion(docRef.id, actualizado.data());
    revalidatePath(`/${residenciaId}/gerencia/atenciones`);
    return { success: true, data: atencion };
  } catch (error: any) {
    if (error?.message === 'NOT_FOUND') {
      return {
        success: false,
        message: 'La atencion no fue encontrada.',
      };
    }

    console.error('cambiarEstadoAtencion: error en transaccion', error);
    return {
      success: false,
      message: 'No se pudo cambiar el estado de la atencion.',
    };
  }
}

export async function eliminarAtencion(
  residenciaId: string,
  atencionId: string,
): Promise<ActionResponse<void>> {
  const { residenciaId: residenciaSesion } = await obtenerInfoUsuarioServer();
  const validacionResidencia = validarSesionResidencia(residenciaId, residenciaSesion);

  if (validacionResidencia) {
    return validacionResidencia;
  }

  const parsedId = FirestoreIdSchema.safeParse(atencionId);
  if (!parsedId.success) {
    return {
      success: false,
      message: 'ID de atencion invalido.',
    };
  }

  try {
    await atencionesColeccion(residenciaId).doc(parsedId.data).delete();
    revalidatePath(`/${residenciaId}/gerencia/atenciones`);
    return { success: true, data: undefined };
  } catch (error) {
    console.error('eliminarAtencion: error al eliminar documento', error);
    return {
      success: false,
      message: 'No se pudo eliminar la atencion.',
    };
  }
}
