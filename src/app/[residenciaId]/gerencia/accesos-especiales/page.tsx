"use server"
import { redirect } from 'next/navigation';
import {ResultadoAcceso, verificarPermisoGestionWrapper} from '@/lib/acceso-privilegiado';
import { MatrizAccesosClient } from './components/MatrizAccesosClient';
import {obtenerInfoUsuarioServer} from "@/lib/obtenerInfoUsuarioServer";
import {urlAccesoNoAutorizado} from "@/lib/utils";
import { KeyRound } from 'lucide-react';

export default async function AccesoEspecialesPage() {

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
    const mensaje = resultado.mensaje ?? "Hubo un error en obtener el mensaje de error (accesos-especiales:VerificarPermisoGestionWrapper)."
    redirect(urlAccesoNoAutorizado(mensaje));
  }

  // Verificación de seguridad adicional: el usuario debe tener un residenciaId en su sesión.
  if (!usuarioSesion.residenciaId) {
    return (
        <div className="flex h-screen items-center justify-center bg-gray-50">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-red-600">Error de Sesión</h1>
            <p className="mt-2 text-gray-600">
              No se pudo validar tu pertenencia a una residencia.
            </p>
          </div>
        </div>
    );
  }

  return (
    <div className="p-4">
      <div className="flex items-center gap-3">
        <KeyRound className="h-8 w-8 text-gray-700" />
        <div className="flex flex-col">
          <h1 className="text-2xl font-bold">Permisos Especiales</h1>
          <p className="text-sm text-gray-600 mt-1">Residencia: {usuarioSesion.residenciaId}</p>
        </div>
      </div>

      <div className="mt-4">
        <MatrizAccesosClient residenciaId={usuarioSesion.residenciaId} />
      </div>
    </div>
  );
}
