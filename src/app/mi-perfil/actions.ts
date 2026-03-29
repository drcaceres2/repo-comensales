"use server";

import { db, Timestamp } from "@/lib/firebaseAdmin";
import { verificarPermisoUsuarioAsistido } from "@/lib/acceso-privilegiado";
import { obtenerInfoUsuarioServer } from "@/lib/obtenerInfoUsuarioServer";
import { ActionResponse } from "shared/models/types";
import { CampoPersonalizado, ConfiguracionResidencia, Residencia } from "shared/schemas/residencia";
import { MiPerfilReadDTO, MiPerfilReadDTOSchema, Usuario } from "shared/schemas/usuarios";

export type MiPerfilObjetivoOption = {
  id: string;
  nombreCompleto: string;
  esPropio: boolean;
};

export type MiPerfilCampoConfig = {
  etiqueta: string;
  tipoControl: "text" | "textArea";
  placeholder?: string;
  esObligatorio: boolean;
  regex?: string;
  mensajeError?: string;
  modificablePorInteresado: boolean;
};

export type MiPerfilReadResponse = {
  targetUid: string;
  dto: MiPerfilReadDTO;
  camposConfigurados: MiPerfilCampoConfig[];
};

function errorResponse<T>(
  code: NonNullable<ActionResponse<T>["error"]>["code"],
  message: string,
  detalles?: unknown
): ActionResponse<T> {
  return { success: false, error: { code, message, detalles } };
}

function normalizeIsoDateTime(value: unknown): string {
  if (!value) {
    return new Date().toISOString();
  }

  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? new Date().toISOString() : new Date(parsed).toISOString();
  }

  if (typeof value === "object") {
    const maybeTimestamp = value as { toDate?: () => Date; seconds?: number };
    if (typeof maybeTimestamp.toDate === "function") {
      return maybeTimestamp.toDate().toISOString();
    }
    if (typeof maybeTimestamp.seconds === "number") {
      return new Date(maybeTimestamp.seconds * 1000).toISOString();
    }
  }

  return new Date().toISOString();
}

function descripcionDietaParaPerfil(dieta: any): string | undefined {
  const descripcion = dieta?.descripcion;
  if (!descripcion || typeof descripcion !== "object") {
    return undefined;
  }

  if (descripcion.tipo === "texto_corto") {
    return descripcion.descripcion;
  }

  if (descripcion.tipo === "texto_enriquecido") {
    return descripcion.titulo;
  }

  if (descripcion.tipo === "enlace_externo") {
    return descripcion.notas || descripcion.urlDocumento;
  }

  return undefined;
}

function mapCampoConfig(field: CampoPersonalizado): MiPerfilCampoConfig {
  return {
    etiqueta: field.configuracionVisual.etiqueta,
    tipoControl: field.configuracionVisual.tipoControl,
    placeholder: field.configuracionVisual.placeholder,
    esObligatorio: field.validacion.esObligatorio,
    regex: field.validacion.regex,
    mensajeError: field.validacion.mensajeError,
    modificablePorInteresado: field.permisos.modificablePorInteresado,
  };
}

async function resolveActorAndTarget(targetUid?: string): Promise<
  | { success: true; actor: Usuario; target: Usuario; targetUid: string }
  | { success: false; error: ActionResponse<void>["error"] }
> {
  const sesion = await obtenerInfoUsuarioServer();

  if (!sesion.usuarioId) {
    return { success: false, error: errorResponse("UNAUTHORIZED", "Debes iniciar sesión.").error };
  }

  const actorSnap = await db.doc(`usuarios/${sesion.usuarioId}`).get();
  if (!actorSnap.exists) {
    return {
      success: false,
      error: errorResponse("UNAUTHORIZED", "No se pudo resolver tu perfil de usuario.").error,
    };
  }

  const actor = actorSnap.data() as Usuario;
  const resolvedTargetUid = targetUid?.trim() || sesion.usuarioId;

  const targetSnap = await db.doc(`usuarios/${resolvedTargetUid}`).get();
  if (!targetSnap.exists) {
    return {
      success: false,
      error: errorResponse("UNAUTHORIZED", "El usuario objetivo no existe.").error,
    };
  }

  const target = targetSnap.data() as Usuario;

  if (!actor.residenciaId || actor.residenciaId !== target.residenciaId) {
    return {
      success: false,
      error: errorResponse("UNAUTHORIZED", "No tienes permisos sobre este usuario.").error,
    };
  }

  if (resolvedTargetUid !== actor.id) {
    if (!actor.roles.includes("asistente")) {
      return {
        success: false,
        error: errorResponse("UNAUTHORIZED", "Solo puedes editar tu propio perfil.").error,
      };
    }

    const permiso = await verificarPermisoUsuarioAsistido(actor, resolvedTargetUid, sesion.zonaHoraria, Timestamp.now());
    if (!permiso.tieneAcceso) {
      return {
        success: false,
        error: errorResponse("UNAUTHORIZED", "No tienes permisos de asistente para este usuario.").error,
      };
    }
  }

  return { success: true, actor, target, targetUid: resolvedTargetUid };
}

export async function obtenerOpcionesObjetivoMiPerfil(): Promise<ActionResponse<MiPerfilObjetivoOption[]>> {
  try {
    const sesion = await obtenerInfoUsuarioServer();
    if (!sesion.usuarioId) {
      return errorResponse("UNAUTHORIZED", "Debes iniciar sesión.");
    }

    const actorSnap = await db.doc(`usuarios/${sesion.usuarioId}`).get();
    if (!actorSnap.exists) {
      return errorResponse("UNAUTHORIZED", "No se pudo resolver tu perfil.");
    }

    const actor = actorSnap.data() as Usuario;
    if (!actor.residenciaId) {
      return errorResponse("UNAUTHORIZED", "Tu perfil no tiene residencia asignada.");
    }

    const ids = new Set<string>([actor.id]);

    if (actor.roles.includes("asistente")) {
      const delegaciones = Object.keys(actor.asistente?.usuariosAsistidos ?? {});
      const timestampServidor = Timestamp.now();
      for (const uid of delegaciones) {
        const permiso = await verificarPermisoUsuarioAsistido(actor, uid, sesion.zonaHoraria, timestampServidor);
        if (permiso.tieneAcceso) {
          ids.add(uid);
        }
      }
    }

    const users = await Promise.all(
      Array.from(ids).map(async (uid) => {
        const snap = await db.doc(`usuarios/${uid}`).get();
        return snap.exists ? (snap.data() as Usuario) : null;
      })
    );

    const options = users
      .filter((user): user is Usuario => Boolean(user))
      .filter((user) => user.residenciaId === actor.residenciaId && user.estaActivo)
      .map((user) => ({
        id: user.id,
        nombreCompleto: `${user.nombre} ${user.apellido}`.trim(),
        esPropio: user.id === actor.id,
      }))
      .sort((a, b) => {
        if (a.esPropio && !b.esPropio) {
          return -1;
        }
        if (!a.esPropio && b.esPropio) {
          return 1;
        }
        return a.nombreCompleto.localeCompare(b.nombreCompleto);
      });

    return { success: true, data: options };
  } catch (error) {
    return errorResponse("INTERNAL", "No se pudo cargar la lista de perfiles disponibles.", error);
  }
}

export async function obtenerMiPerfilRead(targetUid?: string): Promise<ActionResponse<MiPerfilReadResponse>> {
  try {
    const context = await resolveActorAndTarget(targetUid);
    if (!context.success) {
      return { success: false, error: context.error };
    }

    const target = context.target;
    const residenciaId = target.residenciaId;

    if (!residenciaId) {
      return errorResponse("UNAUTHORIZED", "El usuario objetivo no tiene residencia asignada.");
    }

    const [residenciaSnap, singletonSnap] = await Promise.all([
      db.doc(`residencias/${residenciaId}`).get(),
      db.doc(`residencias/${residenciaId}/configuracion/general`).get(),
    ]);

    if (!residenciaSnap.exists || !singletonSnap.exists) {
      return errorResponse("INTERNAL", "No se pudo cargar la configuración de residencia para el perfil.");
    }

    const residencia = residenciaSnap.data() as Residencia;
    const singleton = singletonSnap.data() as ConfiguracionResidencia;
    const dietaId = target.residente?.dietaId || "";
    const dieta = dietaId ? singleton.dietas?.[dietaId] : undefined;

    const dtoCandidate: MiPerfilReadDTO = {
      nombre: target.nombre,
      apellido: target.apellido,
      nombreCorto: target.nombreCorto,
      identificacion: target.identificacion,
      referidoPorNombre: target.referidoPorNombre,
      referidoFecha: target.referidoFecha,
      telefonoMovil: target.telefonoMovil,
      fechaDeNacimiento: target.fechaDeNacimiento || undefined,
      fotoPerfil: target.fotoPerfil,
      universidad: target.universidad,
      carrera: target.carrera,
      logistica: {
        habitacion: target.residente?.habitacion || "",
        numeroDeRopa: target.residente?.numeroDeRopa || "",
        dieta: {
          nombre: dieta?.nombre || "Sin dieta asignada",
          descripcion: descripcionDietaParaPerfil(dieta),
        },
      },
      camposPersonalizados: target.camposPersonalizados || {},
      timestampActualizacion: normalizeIsoDateTime(target.timestampActualizacion),
    };

    const parsed = MiPerfilReadDTOSchema.safeParse(dtoCandidate);
    if (!parsed.success) {
      return errorResponse("INTERNAL", "No se pudo construir el perfil para renderizar.", parsed.error.issues);
    }

    const camposConfigurados = (residencia.camposPersonalizadosPorUsuario || [])
      .filter((field) => field.activo)
      .map(mapCampoConfig);

    return {
      success: true,
      data: {
        targetUid: context.targetUid,
        dto: parsed.data,
        camposConfigurados,
      },
    };
  } catch (error) {
    return errorResponse("INTERNAL", "No se pudo cargar los datos del perfil.", error);
  }
}



