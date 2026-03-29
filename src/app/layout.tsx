import React from 'react';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { AppProviders } from '@/components/layout/AppProviders';
import { AppShell } from '@/components/layout/AppShell';
import { headers } from 'next/headers'
import { InfoUsuario } from 'shared/models/types'
import { Usuario } from 'shared/schemas/usuarios';
import { obtenerDocUsuario } from '@/lib/obtenerDocsUsuarioServer';

function parseRolesHeader(value: string | null): InfoUsuario['roles'] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const headersList = await headers();

  // Extraemos la Verdad Absoluta dejada por el Middleware
  const infoUsuarioHeaders: InfoUsuario = {
    usuarioId: headersList.get('x-usuario-id') || '',
    email: headersList.get('x-usuario-email') || '',
    roles: parseRolesHeader(headersList.get('x-usuario-roles')),
    residenciaId: headersList.get('x-residencia-id') || '',
    zonaHoraria: headersList.get('x-residencia-zh') || '',
    ctxTraduccion: headersList.get('x-residencia-ct') || '',
  };

  const usuarioDocSesion = await obtenerDocUsuario();

  // Build a serializable object for the client: include the three timestamp
  // fields (set to 0) so the object is not a partial; exclude
  // `fechaHoraModificacion` which we don't want to send.
  let usuarioDocSesionSerializable: Usuario | null = null;
  if (usuarioDocSesion) {
    // Exclude fechaHoraModificacion and force timestamps to 0
    // (prevents non-plain Firestore Timestamp objects from being passed to client)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { fechaHoraModificacion, ...rest } = usuarioDocSesion as any;
    usuarioDocSesionSerializable = {
      ...rest,
      timestampActualizacion: 0,
      timestampCreacion: 0,
      timestampUltimoIngreso: 0,
    } as Usuario;
  }

  return (
    <html lang="es" className="h-full" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased font-sans flex flex-col min-h-screen bg-background`}>
        <AppProviders infoUsuario={infoUsuarioHeaders}>
          <AppShell usuarioDocSesion={usuarioDocSesionSerializable}>{children}</AppShell>
        </AppProviders>
      </body>
    </html>
  );
}
