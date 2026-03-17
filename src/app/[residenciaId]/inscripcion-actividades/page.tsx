import { redirect } from 'next/navigation';
import type { ResidenciaId } from 'shared/models/types';
import { obtenerInfoUsuarioServer } from '@/lib/obtenerInfoUsuarioServer';
import InscripcionActividadesClient from './actividades-client';
import {urlAccesoNoAutorizado} from "@/lib/utils";

interface PageProps {
    params: Promise<{ residenciaId: ResidenciaId }>;
}

const rolesPermitidos = new Set(['master', 'admin', 'director', 'asistente', 'residente', 'invitado']);

export default async function InscripcionActividadesPage({ params }: PageProps) {
    const { residenciaId } = await params;
    const session = await obtenerInfoUsuarioServer();
    
    if (!session.usuarioId || (
            session.roles.some((rol) => rolesPermitidos.has(rol))
            && session.residenciaId !== residenciaId
        )
    ) {
        redirect(urlAccesoNoAutorizado("Problemas con la sesión del usuario."));
    }

    return <InscripcionActividadesClient residenciaId={residenciaId} />;
}
