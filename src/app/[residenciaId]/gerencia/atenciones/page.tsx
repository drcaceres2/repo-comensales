import { redirect } from 'next/navigation';
import { ResultadoAcceso, verificarPermisoGestionWrapper } from '@/lib/acceso-privilegiado';
import { obtenerInfoUsuarioServer } from '@/lib/obtenerInfoUsuarioServer';
import { AtencionesMasterDetailLayout } from './components/AtencionesMasterDetailLayout';
import { obtenerAtenciones } from './lib/actions';

export default async function PaginaGestionAtenciones() {
  const resultado: ResultadoAcceso = await verificarPermisoGestionWrapper('gestionAtenciones');

  if (resultado.error) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600">Error de Verificacion</h1>
          <p className="mt-2 text-gray-600">
            No se pudo verificar tus permisos para gestionar atenciones.
          </p>
          <p className="mt-1 text-xs text-gray-500">Detalle: {resultado.error}</p>
        </div>
      </div>
    );
  }

  if (!resultado.tieneAcceso) {
    redirect('/acceso-no-autorizado');
  }

  const usuarioSesion = await obtenerInfoUsuarioServer();

  if (!usuarioSesion.residenciaId) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600">Error de Configuracion de Cuenta</h1>
          <p className="mt-2 text-gray-600">
            Tu usuario no esta asociado a ninguna residencia.
          </p>
        </div>
      </div>
    );
  }

  const initialAtenciones = await obtenerAtenciones(usuarioSesion.residenciaId);

  return (
    <AtencionesMasterDetailLayout
      residenciaId={usuarioSesion.residenciaId}
      usuarioId={usuarioSesion.usuarioId}
      email={usuarioSesion.email}
      initialAtenciones={initialAtenciones}
    />
  );
}
