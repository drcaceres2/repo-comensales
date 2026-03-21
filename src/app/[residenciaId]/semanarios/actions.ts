"use server";

import { db } from '@/lib/firebaseAdmin';
import { FieldPath } from 'firebase-admin/firestore';
import { obtenerInfoUsuarioServer } from '@/lib/obtenerInfoUsuarioServer';
import { ActionResponse } from 'shared/models/types';
import { ConfiguracionResidencia } from 'shared/schemas/residencia';
import { SemanarioReadDTO, SemanarioReadDTOSchema } from 'shared/schemas/semanarios/semanario.dto';
import { Usuario } from 'shared/schemas/usuarios';

type ModoEdicion = 'read-only' | 'read-write';

type SemanarioReadResponse = {
  dto: SemanarioReadDTO;
  targetUid: string;
  semanaIsoActual: string;
  modoEdicion: ModoEdicion;
};

type SemanarioSingletonResponse = {
  fechaHoraReferenciaUltimaSolicitud: string;
  gruposComidas: ConfiguracionResidencia['gruposComidas'];
  esquemaSemanal: ConfiguracionResidencia['esquemaSemanal'];
  configuracionesAlternativas: ConfiguracionResidencia['configuracionesAlternativas'];
  catalogoAlternativas: ConfiguracionResidencia['catalogoAlternativas'];
};

type UsuarioObjetivoSemanario = {
  id: string;
  nombre: string;
  apellido: string;
  nombreCorto: string;
};

type ContextoTargetSemanario = {
  actor: Usuario;
  target: Usuario;
  targetUid: string;
  modoEdicion: ModoEdicion;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function errorResponse<T>(
  code: NonNullable<ActionResponse<T>['error']>['code'],
  message: string,
  detalles?: unknown
): ActionResponse<T> {
  return { success: false, error: { code, message, detalles } };
}

function dateAtUtcMidnight(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function formatSemanaIso(dateInput: Date): string {
  const date = dateAtUtcMidnight(dateInput);
  const thursday = new Date(date);
  const day = thursday.getUTCDay();
  const isoDay = day === 0 ? 7 : day;
  thursday.setUTCDate(thursday.getUTCDate() + (4 - isoDay));

  const year = thursday.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay();
  const jan4IsoDay = jan4Day === 0 ? 7 : jan4Day;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - (jan4IsoDay - 1));

  const diffDays = Math.floor((date.getTime() - week1Monday.getTime()) / DAY_MS);
  const week = Math.floor(diffDays / 7) + 1;

  return `${year}-W${String(week).padStart(2, '0')}`;
}

function normalizeIsoDateTime(value: unknown): string {
  if (!value) {
    return new Date().toISOString();
  }

  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? new Date().toISOString() : new Date(parsed).toISOString();
  }

  if (typeof value === 'object' && value !== null) {
    const maybeTimestamp = value as { toDate?: () => Date; seconds?: number };
    if (typeof maybeTimestamp.toDate === 'function') {
      return maybeTimestamp.toDate().toISOString();
    }
    if (typeof maybeTimestamp.seconds === 'number') {
      return new Date(maybeTimestamp.seconds * 1000).toISOString();
    }
  }

  return new Date().toISOString();
}

function isResidenteOInvitado(user: Usuario): boolean {
  return user.roles.includes('residente') || user.roles.includes('invitado');
}

function isMasterOAdmin(roles: string[]): boolean {
  return roles.includes('master') || roles.includes('admin');
}

function hasAccessRole(roles: string[]): boolean {
  return roles.includes('residente') || roles.includes('invitado') || roles.includes('asistente');
}

function hasInvalidRoleCombination(roles: string[]): boolean {
  return roles.includes('director') && roles.includes('asistente');
}

async function resolveTargetContext(
  residenciaId: string,
  requestedTargetUid?: string
): Promise<{ success: true; data: ContextoTargetSemanario } | { success: false; error: ActionResponse<void>['error'] }> {
  const sesion = await obtenerInfoUsuarioServer();
  if (!sesion.usuarioId || sesion.residenciaId !== residenciaId) {
    return { success: false, error: errorResponse('UNAUTHORIZED', 'No autorizado para esta residencia.').error };
  }

  // Allow admin/master users to access the module only if they also have an
  // access role (residente/invitado/asistente). Otherwise deny.
  if (isMasterOAdmin(sesion.roles) && !hasAccessRole(sesion.roles)) {
    return { success: false, error: errorResponse('UNAUTHORIZED', 'Los roles admin/master no acceden al módulo de semanarios.').error };
  }

  if (hasInvalidRoleCombination(sesion.roles)) {
    return {
      success: false,
      error: errorResponse('UNAUTHORIZED', 'Configuración inválida de roles: director y asistente no pueden coexistir.').error,
    };
  }

  const actorSnap = await db.doc(`usuarios/${sesion.usuarioId}`).get();
  if (!actorSnap.exists) {
    return { success: false, error: errorResponse('UNAUTHORIZED', 'No se pudo resolver el perfil del usuario autenticado.').error };
  }

  const actor = actorSnap.data() as Usuario;
  const actorUid = actor.id || actorSnap.id;
  const targetUid = requestedTargetUid?.trim() || sesion.usuarioId;

  const targetSnap = await db.doc(`usuarios/${targetUid}`).get();
  if (!targetSnap.exists) {
    return { success: false, error: errorResponse('UNAUTHORIZED', 'El usuario objetivo no existe.').error };
  }

  const target = targetSnap.data() as Usuario;
  const targetConId = { ...target, id: target.id || targetSnap.id } as Usuario;
  if (targetConId.residenciaId !== residenciaId || !targetConId.estaActivo) {
    return { success: false, error: errorResponse('UNAUTHORIZED', 'El usuario objetivo no pertenece a esta residencia.').error };
  }

  if (!isResidenteOInvitado(targetConId)) {
    return { success: false, error: errorResponse('UNAUTHORIZED', 'El usuario objetivo no es residente/invitado.').error };
  }

  if (targetUid === actorUid) {
    if (isResidenteOInvitado(actor)) {
      return { success: true, data: { actor, target: targetConId, targetUid, modoEdicion: 'read-write' } };
    }

    return {
      success: false,
      error: errorResponse('UNAUTHORIZED', 'Tu perfil de usuario no permite editar tu propio semanario.').error,
    };
  }

  if (actor.roles.includes('director')) {
    return { success: true, data: { actor, target: targetConId, targetUid, modoEdicion: 'read-only' } };
  }

  if (actor.roles.includes('asistente')) {
    const delegacion = actor.asistente?.usuariosAsistidos?.[targetUid];
    if (delegacion && delegacion.nivelAcceso !== 'Ninguna') {
      return { success: true, data: { actor, target: targetConId, targetUid, modoEdicion: 'read-write' } };
    }
  }

  return {
    success: false,
    error: errorResponse('UNAUTHORIZED', 'No tienes permisos para consultar este semanario.').error,
  };
}

export async function obtenerSemanarioReadDTO(
  residenciaId: string,
  targetUid?: string
): Promise<ActionResponse<SemanarioReadResponse>> {
  try {
    const context = await resolveTargetContext(residenciaId, targetUid);
    if (!context.success) {
      return { success: false, error: context.error };
    }

    const singletonSnap = await db.doc(`residencias/${residenciaId}/configuracion/general`).get();
    if (!singletonSnap.exists) {
      return errorResponse('INTERNAL', 'No existe la configuración general de la residencia.');
    }

    const singleton = singletonSnap.data() as ConfiguracionResidencia;
    const updatedAt = normalizeIsoDateTime((context.data.target as any).updatedAt ?? context.data.target.timestampActualizacion);

    const dtoCandidate = {
      usuarioId: context.data.target.id,
      semanarios: context.data.target.semanarios ?? {},
      updatedAt,
    };

    const parsedDto = SemanarioReadDTOSchema.safeParse(dtoCandidate);
    if (!parsedDto.success) {
      return errorResponse('INTERNAL', 'No se pudo construir el DTO de semanario.', parsedDto.error.issues);
    }

    return {
      success: true,
      data: {
        dto: parsedDto.data,
        targetUid: context.data.targetUid,
        semanaIsoActual: formatSemanaIso(new Date(singleton.fechaHoraReferenciaUltimaSolicitud)),
        modoEdicion: context.data.modoEdicion,
      },
    };
  } catch (error) {
    return errorResponse('INTERNAL', 'No se pudo obtener el semanario.', error);
  }
}

export async function obtenerSemanarioSingleton(
  residenciaId: string
): Promise<ActionResponse<SemanarioSingletonResponse>> {
  try {
    const sesion = await obtenerInfoUsuarioServer();
    if (!sesion.usuarioId || sesion.residenciaId !== residenciaId || (isMasterOAdmin(sesion.roles) && !hasAccessRole(sesion.roles))) {
      return errorResponse('UNAUTHORIZED', 'No autorizado para consultar semanarios.');
    }

    if (hasInvalidRoleCombination(sesion.roles)) {
      return errorResponse('UNAUTHORIZED', 'Configuración inválida de roles: director y asistente no pueden coexistir.');
    }

    const singletonSnap = await db.doc(`residencias/${residenciaId}/configuracion/general`).get();
    if (!singletonSnap.exists) {
      return errorResponse('INTERNAL', 'No existe la configuración general de la residencia.');
    }

    const singleton = singletonSnap.data() as ConfiguracionResidencia;

    return {
      success: true,
      data: {
        fechaHoraReferenciaUltimaSolicitud: singleton.fechaHoraReferenciaUltimaSolicitud,
        gruposComidas: singleton.gruposComidas,
        esquemaSemanal: singleton.esquemaSemanal,
        configuracionesAlternativas: singleton.configuracionesAlternativas,
        catalogoAlternativas: singleton.catalogoAlternativas,
      },
    };
  } catch (error) {
    return errorResponse('INTERNAL', 'No se pudo obtener la configuración del semanario.', error);
  }
}

export async function obtenerUsuariosObjetivoSemanarios(
  residenciaId: string
): Promise<ActionResponse<UsuarioObjetivoSemanario[]>> {
  try {
    const sesion = await obtenerInfoUsuarioServer();
    if (!sesion.usuarioId || sesion.residenciaId !== residenciaId || (isMasterOAdmin(sesion.roles) && !hasAccessRole(sesion.roles))) {
      return errorResponse('UNAUTHORIZED', 'No autorizado para consultar usuarios objetivo.');
    }

    if (hasInvalidRoleCombination(sesion.roles)) {
      return errorResponse('UNAUTHORIZED', 'Configuración inválida de roles: director y asistente no pueden coexistir.');
    }

    const actorSnap = await db.doc(`usuarios/${sesion.usuarioId}`).get();
    if (!actorSnap.exists) {
      return errorResponse('UNAUTHORIZED', 'No se pudo resolver el usuario autenticado.');
    }

    const actor = actorSnap.data() as Usuario;
    const actorUid = actor.id || actorSnap.id;

    const toOption = (user: Usuario, uid?: string): UsuarioObjetivoSemanario => ({
      id: uid || user.id,
      nombre: user.nombre,
      apellido: user.apellido,
      nombreCorto: user.nombreCorto,
    });

    if (actor.roles.includes('director')) {
      const snap = await db
        .collection('usuarios')
        .where('residenciaId', '==', residenciaId)
        .where('estaActivo', '==', true)
        .where('roles', 'array-contains-any', ['residente', 'invitado'])
        .get();

      return {
        success: true,
        data: snap.docs
          .map((doc) => toOption(doc.data() as Usuario, doc.id))
          .sort((a, b) => a.nombre.localeCompare(b.nombre)),
      };
    }

    if (actor.roles.includes('asistente')) {
      const idsDelegados = Object.entries(actor.asistente?.usuariosAsistidos ?? {})
        .filter(([, permiso]) => permiso.nivelAcceso !== 'Ninguna')
        .map(([uid]) => uid);

      const shouldIncludeSelf = isResidenteOInvitado(actor);
      const ids = [...new Set([...(shouldIncludeSelf ? [actorUid] : []), ...idsDelegados])];

      if (ids.length === 0) {
        return { success: true, data: [] };
      }

      const chunks: string[][] = [];
      for (let i = 0; i < ids.length; i += 30) {
        chunks.push(ids.slice(i, i + 30));
      }

      const snaps = await Promise.all(
        chunks.map((chunk) => db.collection('usuarios').where(FieldPath.documentId(), 'in', chunk).get())
      );

      const users = snaps.flatMap((snap) => snap.docs.map((doc) => ({ ...(doc.data() as Usuario), id: doc.id } as Usuario)));
      const filtered = users.filter(
        (user) => user.residenciaId === residenciaId && user.estaActivo && isResidenteOInvitado(user)
      );
      return {
        success: true,
        data: filtered.map((user) => toOption(user)).sort((a, b) => a.nombre.localeCompare(b.nombre)),
      };
    }

    if (isResidenteOInvitado(actor)) {
      return { success: true, data: [toOption(actor, actorUid)] };
    }

    return { success: true, data: [] };
  } catch (error) {
    return errorResponse('INTERNAL', 'No se pudo obtener usuarios objetivo.', error);
  }
}
