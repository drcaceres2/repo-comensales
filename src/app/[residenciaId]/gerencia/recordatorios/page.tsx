"use server";

import { redirect } from 'next/navigation';
import { ResultadoAcceso, verificarPermisoGestionWrapper } from '@/lib/acceso-privilegiado';
import { obtenerInfoUsuarioServer } from '@/lib/obtenerInfoUsuarioServer';
import { GestionRecordatoriosClient } from './components/GestionRecordatoriosClient';
import {urlAccesoNoAutorizado} from "@/lib/utils";

export default async function PaginaGestionRecordatorios() {
    // validación de permisos en el servidor
    const resultado: ResultadoAcceso = await verificarPermisoGestionWrapper('gestionRecordatorios');

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
        const mensaje = resultado.mensaje ?? "Hubo un error en obtener el mensaje de error (actividades:VerificarPermisoGestionWrapper).";
        redirect(urlAccesoNoAutorizado(mensaje));
    }

    const usuarioSesion = await obtenerInfoUsuarioServer();

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

    // el cliente se encargará de la interactividad; la comprobación ya está hecha
    return <GestionRecordatoriosClient residenciaSlug={usuarioSesion.residenciaId} />;
}
