import React from 'react';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { AppProviders } from '@/components/layout/AppProviders';
import { AppShell } from '@/components/layout/AppShell';
import { headers } from 'next/headers'
import { InfoUsuario } from 'shared/models/types'

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
    roles: JSON.parse(headersList.get('x-usuario-roles') || '[]'),
    residenciaId: headersList.get('x-residencia-id') || '',
    zonaHoraria: headersList.get('x-residencia-zh') || '',
    ctxTraduccion: headersList.get('x-residencia-ct') || '',
  };

  return (
    <html lang="en" className="h-full">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased font-sans flex flex-col min-h-full bg-background`}>
        <AppProviders infoUsuario={infoUsuarioHeaders}>
          <AppShell>{children}</AppShell>
        </AppProviders>
      </body>
    </html>
  );
}
