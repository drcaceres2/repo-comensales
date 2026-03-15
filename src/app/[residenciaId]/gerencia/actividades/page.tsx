import { redirect } from 'next/navigation';
import { ResultadoAcceso, verificarPermisoGestionWrapper } from '@/lib/acceso-privilegiado';
import { obtenerInfoUsuarioServer } from '@/lib/obtenerInfoUsuarioServer';
import GestionActividadesClient from './GestionActividadesClient';
import type { ResidenciaId } from 'shared/models/types';

interface ActividadesPageProps {
    params: Promise<{ residenciaId: ResidenciaId }>;
}

export default async function ActividadesPage({ params }: ActividadesPageProps) {
    const { residenciaId } = await params;
    const resultado: ResultadoAcceso = await verificarPermisoGestionWrapper('gestionActividades');

    if (resultado.error) {
        return (
            <div className="flex h-screen items-center justify-center bg-gray-50">
                <div className="text-center">
                    <h1 className="text-2xl font-bold text-red-600">Error de Verificacion</h1>
                    <p className="mt-2 text-gray-600">
                        No se pudo verificar tus permisos para gestionar actividades.
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
    const esMaster = usuarioSesion.roles.includes('master');

    if (!usuarioSesion.residenciaId || (!esMaster && usuarioSesion.residenciaId !== residenciaId)) {
        redirect('/acceso-no-autorizado');
    }

    return <GestionActividadesClient residenciaId={residenciaId} />;
}