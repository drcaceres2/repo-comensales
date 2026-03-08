import React from "react";
import { redirect } from "next/navigation";
import { obtenerInfoUsuarioServer } from "@/lib/obtenerInfoUsuarioServer";
import { GruposUsuariosManager } from "./components/GruposUsuariosManager";
import { verificarPermisoGestionWrapper } from "@/lib/acceso-privilegiado";

interface AdminGruposUsuariosPageProps {
  params: Promise<{ residenciaId: string; email: string; }>;
}

export default async function AdminGruposUsuariosPage({ params }: AdminGruposUsuariosPageProps) {
  const usuarioSesion = await obtenerInfoUsuarioServer();

  if (!usuarioSesion.usuarioId || !usuarioSesion.email) {
    redirect("/acceso-no-autorizado");
  }
  if (!usuarioSesion.residenciaId) {
    return <div className="text-red-500">Sesión inválida: falta residenciaId.</div>;
  }

  const permiso = await verificarPermisoGestionWrapper("gestionGrupos");

  if(permiso.tieneAcceso === false){
    redirect("/acceso-no-autorizado");
  }
  if(permiso.error) {
    return <div className="text-red-500">Error al verificar permisos: {permiso.error}</div>;
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Gestión de Grupos de Usuarios</h1>
      <GruposUsuariosManager
        usuarioId={usuarioSesion.usuarioId}
        email={usuarioSesion.email}
        residenciaId={usuarioSesion.residenciaId}
      />
    </div>
  );
}