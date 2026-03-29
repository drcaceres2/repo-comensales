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
import { FechaHoraIsoSchema } from 'shared/schemas/fechas';
import { FirestoreIdSchema } from 'shared/schemas/common';
import { ConfiguracionResidencia } from 'shared/schemas/residencia';
import { db, FieldValue } from '@/lib/firebaseAdmin';
import { obtenerInfoUsuarioServer } from '@/lib/obtenerInfoUsuarioServer';
import { verificarPermisoGestionWrapper } from '@/lib/acceso-privilegiado';
import { calcularHorarioReferenciaSolicitud } from '../../../elegir-horarios-comida/_lib/calcularHorarioReferenciaSolicitud';

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

type ContextoPermisos = {
  usuarioId: string;
  nivelAcceso: 'Todas' | 'Propias';
};

type ResultadoContexto =
  | { ok: true; contexto: ContextoPermisos }
  | { ok: false; error: ActionResponse<never> };

export type OpcionFechaHoraSolicitudComida = {
  horarioSolicitudId: string;
  value: string;
  label: string;
};

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

async function validarContextoAtenciones(
  residenciaId: string,
): Promise<ResultadoContexto> {
  const { usuarioId, residenciaId: residenciaSesion, roles } = await obtenerInfoUsuarioServer();
  const esMaster = roles.includes('master');

  if (!usuarioId) {
    return {
      ok: false,
      error: {
        success: false,
        message: 'Usuario no autenticado.',
      },
    };
  }

  if (!esMaster) {
    const validacion = validarSesionResidencia(residenciaId, residenciaSesion);
    if (validacion) {
      return {
        ok: false,
        error: validacion,
      };
    }
  }

  const acceso = await verificarPermisoGestionWrapper('gestionAtenciones');
  if (acceso.error) {
    return {
      ok: false,
      error: {
        success: false,
        message: acceso.error,
      },
    };
  }

  if (!acceso.tieneAcceso || acceso.nivelAcceso === 'Ninguna') {
    return {
      ok: false,
      error: {
        success: false,
        message: 'No tienes permisos para gestionar atenciones.',
      },
    };
  }

  return {
    ok: true,
    contexto: {
      usuarioId,
      nivelAcceso: acceso.nivelAcceso,
    },
  };
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

function calcularOpcionesFechaHoraSolicitudComida(
  fechaHoraAtencion: string,
  horariosSolicitud: ConfiguracionResidencia['horariosSolicitud'] = {},
): OpcionFechaHoraSolicitudComida[] {
  const fechaAtencion = fechaHoraAtencion.slice(0, 10);
  if (!fechaAtencion) {
    return [];
  }

  return Object.entries(horariosSolicitud)
    .filter(([, horario]) => horario?.estaActivo)
    .map(([horarioSolicitudId, horario]) => {
      const value = calcularHorarioReferenciaSolicitud(
        fechaAtencion,
        horarioSolicitudId,
        horariosSolicitud,
      );

      return {
        horarioSolicitudId,
        value,
        label: `${horario.nombre} (${horario.dia} ${horario.horaSolicitud}) - ${value}`,
      };
    })
    .sort((a, b) => a.value.localeCompare(b.value));
}

async function obtenerOpcionesFechaHoraSolicitudComidaInterno(
  residenciaId: string,
  fechaHoraAtencion: string,
): Promise<ActionResponse<OpcionFechaHoraSolicitudComida[]>> {
  const parsedFecha = FechaHoraIsoSchema.safeParse(fechaHoraAtencion);
  if (!parsedFecha.success) {
    return {
      success: false,
      message: 'Fecha/hora de atencion invalida.',
    };
  }

  const singletonSnap = await db.doc(`residencias/${residenciaId}/configuracion/general`).get();
  if (!singletonSnap.exists) {
    return {
      success: false,
      message: 'No existe la configuracion general de la residencia.',
    };
  }

  const singleton = singletonSnap.data() as ConfiguracionResidencia;
  const opciones = calcularOpcionesFechaHoraSolicitudComida(
    parsedFecha.data,
    singleton.horariosSolicitud,
  );

  return {
    success: true,
    data: opciones,
  };
}

export async function obtenerAtenciones(residenciaId: string): Promise<Atencion[]> {
  const resultadoContexto = await validarContextoAtenciones(residenciaId);
  if (!resultadoContexto.ok) {
    return [];
  }

  const { contexto } = resultadoContexto;

  const snapshot = await atencionesColeccion(residenciaId).get();

  const atenciones = snapshot.docs
    .map((doc) => normalizarAtencion(doc.id, doc.data()))
    .sort((a, b) => {
      const fechaA = new Date(a.fechaHoraAtencion).getTime();
      const fechaB = new Date(b.fechaHoraAtencion).getTime();
      return fechaB - fechaA;
    });

  if (contexto.nivelAcceso === 'Propias') {
    return atenciones.filter((item) => item.autorId === contexto.usuarioId);
  }

  return atenciones;
}

export async function obtenerOpcionesFechaHoraSolicitudComida(
  residenciaId: string,
  fechaHoraAtencion: string,
): Promise<ActionResponse<OpcionFechaHoraSolicitudComida[]>> {
  const resultadoContexto = await validarContextoAtenciones(residenciaId);
  if (!resultadoContexto.ok) {
    return resultadoContexto.error as ActionResponse<OpcionFechaHoraSolicitudComida[]>;
  }

  return obtenerOpcionesFechaHoraSolicitudComidaInterno(residenciaId, fechaHoraAtencion);
}

export async function crearAtencion(
  residenciaId: string,
  payload: CrearAtencionPayload,
): Promise<ActionResponse<Atencion>> {
  const resultadoContexto = await validarContextoAtenciones(residenciaId);
  if (!resultadoContexto.ok) {
    return resultadoContexto.error as ActionResponse<Atencion>;
  }

  const { contexto } = resultadoContexto;

  const parsed = CrearAtencionPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      success: false,
      errors: parsed.error.flatten(),
      message: 'Datos invalidos para crear la atencion.',
    };
  }

  const opcionesResult = await obtenerOpcionesFechaHoraSolicitudComidaInterno(
    residenciaId,
    parsed.data.fechaHoraAtencion,
  );

  if (!opcionesResult.success) {
    return {
      success: false,
      message: opcionesResult.message,
    };
  }

  const opciones = opcionesResult.data;
  if (opciones.length === 0) {
    return {
      success: false,
      message: 'No hay horarios de solicitud disponibles para la fecha/hora de atencion seleccionada.',
    };
  }

  const coincideSolicitud = opciones.some(
    (opcion) => opcion.value === parsed.data.fechaHoraSolicitudComida,
  );

  if (!coincideSolicitud) {
    return {
      success: false,
      message: 'La fecha/hora de solicitud no coincide con las opciones permitidas para la fecha/hora de atencion.',
    };
  }

  const docRef = atencionesColeccion(residenciaId).doc();

  const nuevaAtencion: Atencion = {
    id: docRef.id,
    residenciaId,
    autorId: contexto.usuarioId,
    nombre: parsed.data.nombre,
    comentarios: parsed.data.comentarios,
    fechaHoraSolicitudComida: parsed.data.fechaHoraSolicitudComida,
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
  const resultadoContexto = await validarContextoAtenciones(residenciaId);
  if (!resultadoContexto.ok) {
    return resultadoContexto.error as ActionResponse<Atencion>;
  }

  const { contexto } = resultadoContexto;

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
    fechaHoraSolicitudComida: parsed.data.fechaHoraSolicitudComida,
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

  const docRef = atencionesColeccion(residenciaId).doc(parsed.data.id);

  const existente = await docRef.get();
  if (!existente.exists) {
    return { success: false, message: 'La atencion ya no existe.' };
  }

  const atencionActual = existente.data() as Atencion;
  if (contexto.nivelAcceso === 'Propias' && atencionActual.autorId !== contexto.usuarioId) {
    return {
      success: false,
      message: 'No puedes actualizar atenciones de otros usuarios.',
    };
  }

  if (parsed.data.estado === 'aprobada') {
    patch.aprobadorId = contexto.usuarioId;
  }

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
  const resultadoContexto = await validarContextoAtenciones(residenciaId);
  if (!resultadoContexto.ok) {
    return resultadoContexto.error as ActionResponse<Atencion>;
  }

  const { contexto } = resultadoContexto;

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

      const atencionActual = snap.data() as Atencion;
      if (contexto.nivelAcceso === 'Propias' && atencionActual.autorId !== contexto.usuarioId) {
        throw new Error('FORBIDDEN_PROPIAS');
      }

      const patch: Record<string, any> = {
        ...aplicarReglasEstado(parsed.data.estado),
      };

      if (parsed.data.estado === 'aprobada') {
        patch.aprobadorId = contexto.usuarioId;
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

    if (error?.message === 'FORBIDDEN_PROPIAS') {
      return {
        success: false,
        message: 'No puedes modificar el estado de atenciones de otros usuarios.',
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
  const resultadoContexto = await validarContextoAtenciones(residenciaId);
  if (!resultadoContexto.ok) {
    return resultadoContexto.error as ActionResponse<void>;
  }

  const { contexto } = resultadoContexto;

  const parsedId = FirestoreIdSchema.safeParse(atencionId);
  if (!parsedId.success) {
    return {
      success: false,
      message: 'ID de atencion invalido.',
    };
  }

  const docRef = atencionesColeccion(residenciaId).doc(parsedId.data);

  const existente = await docRef.get();
  if (!existente.exists) {
    return {
      success: false,
      message: 'La atencion no fue encontrada.',
    };
  }

  const atencionActual = existente.data() as Atencion;
  if (contexto.nivelAcceso === 'Propias' && atencionActual.autorId !== contexto.usuarioId) {
    return {
      success: false,
      message: 'No puedes eliminar atenciones de otros usuarios.',
    };
  }

  try {
    await docRef.delete();
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
