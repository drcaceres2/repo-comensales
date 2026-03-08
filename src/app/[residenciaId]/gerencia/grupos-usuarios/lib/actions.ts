"use server";

import { GrupoUsuarioSchema, RestriccionCatalogoSchema, RestriccionCatalogo } from "shared/schemas/usuariosGrupos";
import { db, FieldValue } from "@/lib/firebaseAdmin";
import { CONFIG_RESIDENCIA_ID } from "shared/models/types";
import { obtenerInfoUsuarioServer } from "@/lib/obtenerInfoUsuarioServer";

const COLLECTION_PATH = (residenciaId: string) => `residencias/${residenciaId}/configuracion/${CONFIG_RESIDENCIA_ID}`;

// --- 1. Upsert GrupoUsuario ---
export async function upsertGrupoUsuario(residenciaId: string, payload: unknown) {
  const datosSesion = await obtenerInfoUsuarioServer();
  if (!datosSesion.usuarioId || !datosSesion.residenciaId) {
    return { success: false, error: "UpsertGU: No se pudo leer datos de la sesión" };
  }
  const parsed = GrupoUsuarioSchema.safeParse(payload);
  if (!parsed.success) {
    return { success: false, error: "Falló validación esquema:", data: parsed.error.flatten() };
  }
  const grupo = parsed.data;
  try {
    const docRef = db.doc(COLLECTION_PATH(residenciaId));
    await docRef.update({ [`gruposUsuarios.${grupo.id}`]: grupo });
    return { success: true, data: grupo };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// --- 2. Delete GrupoUsuario ---
export async function deleteGrupoUsuario(residenciaId: string, grupoId: string) {
  const datosSesion = await obtenerInfoUsuarioServer();
  if (!datosSesion.usuarioId || !datosSesion.residenciaId) {
    return { success: false, error: "delGU: No se pudo leer datos de la sesión" };
  }
  try {
    const docRef = db.doc(COLLECTION_PATH(residenciaId));
    await docRef.update({ [`gruposUsuarios.${grupoId}`]: FieldValue.delete() });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// --- 3. Upsert RestriccionCatalogo ---
export async function upsertRestriccionCatalogo(residenciaId: string, payload: RestriccionCatalogo) {
  const datosSesion = await obtenerInfoUsuarioServer();
  if (!datosSesion.usuarioId || !datosSesion.residenciaId) {
    return { success: false, error: "UpsertRC: No se pudo leer datos de la sesión" };
  }
  const parsed = RestriccionCatalogoSchema.safeParse(payload);
  if (!parsed.success) {
    return { success: false, error: "Falló validación esquema:", data: parsed.error.flatten() };
  }
  const restriccion = parsed.data;
  try {
    const docRef = db.doc(COLLECTION_PATH(residenciaId));
    await docRef.update({ [`restriccionesCatalogo.${restriccion.id}`]: restriccion });
    return { success: true, data: restriccion };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// --- 4. Delete RestriccionCatalogo ---
export async function deleteRestriccionCatalogo(residenciaId: string, restriccionId: string) {
  const datosSesion = await obtenerInfoUsuarioServer();
  if (!datosSesion.usuarioId || !datosSesion.residenciaId) {
    return { success: false, error: "delRC: No se pudo leer datos de la sesión" };
  }
  try {
    const docRef = db.doc(COLLECTION_PATH(residenciaId));
    await docRef.update({ [`restriccionesCatalogo.${restriccionId}`]: FieldValue.delete() });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
