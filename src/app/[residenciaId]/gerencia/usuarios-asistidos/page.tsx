"use server";
import { redirect } from 'next/navigation';
import { ResultadoAcceso, verificarPermisoGestionWrapper } from '@/lib/acceso-privilegiado';
import { GestionAsistidosClient } from './components/GestionAsistidosClient';
import { obtenerInfoUsuarioServer } from "@/lib/obtenerInfoUsuarioServer";

export default async function UsuariosAsistidosPage() {
  
  const resultado: ResultadoAcceso = await verificarPermisoGestionWrapper('gestionAsistentes');
  const usuarioSesion = await obtenerInfoUsuarioServer();
  
  if (resultado.error) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600">Error de Verificación</h1>
          <p className="mt-2 text-gray-600">
            No se pudo verificar tus permisos. Por favor, intenta de nuevo más tarde.
          </p>
          <p className="mt-1 text-xs text-gray-500">Detalle: {resultado.error}</p>
        </div>
      </div>
    );
  }

  if (!resultado.tieneAcceso) {
    redirect('/acceso-no-autorizado');
  }

  // Verificación de seguridad adicional: el usuario debe tener un residenciaId en su sesión.
  if (!usuarioSesion.residenciaId) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600">Error de Configuración de Cuenta</h1>
          <p className="mt-2 text-gray-600">
            Tu usuario no está asociado a ninguna residencia. Contacta al administrador.
          </p>
        </div>
      </div>
    );
  }

  return <GestionAsistidosClient residenciaId={usuarioSesion.residenciaId} />;
}
