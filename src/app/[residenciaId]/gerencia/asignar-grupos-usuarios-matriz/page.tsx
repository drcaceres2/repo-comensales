import React from "react";
import { redirect } from "next/navigation";
import { CONFIG_RESIDENCIA_ID } from "shared/models/types";
import { ConfiguracionResidencia } from "shared/schemas/residencia";
import {
  GrupoUsuario,
  isGrupoAnalitico,
  isGrupoContable,
  isGrupoRestrictivo,
} from "shared/schemas/usuariosGrupos";
import { db } from "@/lib/firebaseAdmin";
import { obtenerInfoUsuarioServer } from "@/lib/obtenerInfoUsuarioServer";
import { verificarPermisoGestionWrapper } from "@/lib/acceso-privilegiado";
import { MatrizAsignacionClient } from "./components/MatrizAsignacionClient";
import { UsuarioMatrizRow } from "./components/FilaUsuario";
import {urlAccesoNoAutorizado} from "@/lib/utils";

export default async function AsignarGruposUsuariosMatrizPage() {
  const usuarioSesion = await obtenerInfoUsuarioServer();

  if (!usuarioSesion.usuarioId || !usuarioSesion.email) {
    redirect(urlAccesoNoAutorizado("Problemas con la sesión del usuario."));
  }

  const permiso = await verificarPermisoGestionWrapper("gestionGrupos");
  if (!permiso.tieneAcceso) {
    const mensaje = permiso.mensaje ?? "Hubo un error en obtener el mensaje de error (actividades:VerificarPermisoGestionWrapper).";
    redirect(urlAccesoNoAutorizado(mensaje));
  }

  const [usuariosSnap, configSnap] = await Promise.all([
    db
      .collection("usuarios")
      .where("residenciaId", "==", usuarioSesion.residenciaId)
      .where("estaActivo", "==", true)
      .select("nombre", "apellido", "roles", "grupoContableId", "grupoRestrictivoId", "gruposAnaliticosIds")
      .limit(250)
      .get(),
    db.doc(`residencias/${usuarioSesion.residenciaId}/configuracion/${CONFIG_RESIDENCIA_ID}`).get(),
  ]);

  const initialRows: UsuarioMatrizRow[] = usuariosSnap.docs
    .map((docSnap) => {
      const data = docSnap.data() as {
        nombre?: string;
        apellido?: string;
        roles?: string[];
        grupoContableId?: string;
        grupoRestrictivoId?: string;
        gruposAnaliticosIds?: string[];
      };

      const nombreCompleto = [data.nombre ?? "", data.apellido ?? ""].join(" ").trim();

      return {
        usuarioId: docSnap.id,
        nombreCompleto: nombreCompleto || docSnap.id,
        roles: Array.isArray(data.roles) ? data.roles : [],
        grupoContableId: data.grupoContableId ?? null,
        grupoRestrictivoId: data.grupoRestrictivoId ?? null,
        otrosGruposIds: Array.isArray(data.gruposAnaliticosIds) ? data.gruposAnaliticosIds : [],
      };
    })
    .sort((a, b) => a.nombreCompleto.localeCompare(b.nombreCompleto));

  const configData = (configSnap.exists ? configSnap.data() : undefined) as
    | Partial<ConfiguracionResidencia>
    | undefined;

  const grupos = Object.values((configData?.gruposUsuarios ?? {}) as Record<string, GrupoUsuario>)
    .filter((grupo) => grupo.estaActivo);

  const gruposContables = grupos
    .filter((grupo) => isGrupoContable(grupo))
    .map((grupo) => ({ id: grupo.id, nombre: grupo.nombre }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  const gruposRestrictivos = grupos
    .filter((grupo) => isGrupoRestrictivo(grupo))
    .map((grupo) => ({ id: grupo.id, nombre: grupo.nombre }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  const gruposAnaliticos = grupos
    .filter((grupo) => isGrupoAnalitico(grupo))
    .map((grupo) => ({ id: grupo.id, nombre: grupo.nombre }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  return (
    <div className="container mx-auto space-y-4 p-4">
      <div>
        <h1 className="text-2xl font-bold">Matriz de Asignación de Grupos</h1>
        <p className="text-sm text-muted-foreground">
          Edición masiva de grupos por usuario. Solo se enviarán las mutaciones sucias al guardar.
        </p>
      </div>

      <MatrizAsignacionClient
        residenciaId={usuarioSesion.residenciaId}
        initialRows={initialRows}
        gruposContables={gruposContables}
        gruposRestrictivos={gruposRestrictivos}
        gruposAnaliticos={gruposAnaliticos}
      />
    </div>
  );
}
