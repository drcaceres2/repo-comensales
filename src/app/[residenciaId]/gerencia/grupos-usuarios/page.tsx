import React from "react";
import { redirect } from "next/navigation";
import { Users } from 'lucide-react';
import { obtenerInfoUsuarioServer } from "@/lib/obtenerInfoUsuarioServer";
import { GruposUsuariosManager } from "./components/GruposUsuariosManager";
import { verificarPermisoGestionWrapper } from "@/lib/acceso-privilegiado";
import { urlAccesoNoAutorizado } from "@/lib/utils";

export default async function AdminGruposUsuariosPage() {
  const usuarioSesion = await obtenerInfoUsuarioServer();

  if (!usuarioSesion.usuarioId || !usuarioSesion.email) {
    redirect(urlAccesoNoAutorizado("Problemas con la sesión del usuario."));
  }
  if (!usuarioSesion.residenciaId) {
    return <div className="text-red-500">Sesión inválida: falta residenciaId.</div>;
  }

  const permiso = await verificarPermisoGestionWrapper("gestionGrupos");

  if(permiso.error) {
    return <div className="text-red-500">Error al verificar permisos: {permiso.error}</div>;
  }
  if(!permiso.tieneAcceso){
    const mensaje = permiso.mensaje ?? "Hubo un error en obtener el mensaje de error (actividades:VerificarPermisoGestionWrapper).";
    redirect(urlAccesoNoAutorizado(mensaje));
  }

  return (
    <div className="container mx-auto p-4">
      <div className="flex items-center gap-3 mb-4">
        <Users className="h-8 w-8 text-gray-700" />
        <div className="flex flex-col">
          <h1 className="text-2xl font-bold tracking-tight">Grupos de Usuarios</h1>
          <p className="text-sm text-gray-600 mt-1">{`Residencia: ${usuarioSesion.residenciaId}`}</p>
        </div>
      </div>

      <GruposUsuariosManager
        usuarioId={usuarioSesion.usuarioId}
        email={usuarioSesion.email}
        residenciaId={usuarioSesion.residenciaId}
      />
    </div>
  );
}