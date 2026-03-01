import 'server-only'; // Patrón de seguridad: Evita que este archivo se importe en componentes 'use client'
import { headers } from 'next/headers';
import { InfoUsuario } from 'shared/models/types'

// Función asíncrona utilitaria para Server Components y Server Actions
export async function useInfoUsuarioServer(): Promise<InfoUsuario> {
    // En Next.js 15+, headers() es una promesa
    const headersList = await headers();

    return {
        usuarioId: headersList.get('x-usuario-id') || '',
        email: headersList.get('x-usuario-email') || '',
        roles: JSON.parse(headersList.get('x-usuario-roles') || '[]'),
        residenciaId: headersList.get('x-residencia-id') || '',
        zonaHoraria: headersList.get('x-residencia-zh') || '',
        ctxTraduccion: headersList.get('x-residencia-ct') || ''
    };
}