import { redirect } from 'next/navigation';
import type { ResidenciaId } from 'shared/models/types';
import { obtenerInfoUsuarioServer } from '@/lib/obtenerInfoUsuarioServer';
import InscripcionActividadesClient from './actividades-client';
import {urlAccesoNoAutorizado} from "@/lib/utils";

const rolesPermitidos = new Set(['master', 'admin', 'director', 'asistente', 'residente', 'invitado']);

export default async function InscripcionActividadesPage() {
    const session = await obtenerInfoUsuarioServer();
    
    if ( !session.usuarioId || !session.residenciaId ) {
        redirect(urlAccesoNoAutorizado("Problemas con la sesión del usuario."));
    }

    return <InscripcionActividadesClient residenciaId={session.residenciaId} />;
}
