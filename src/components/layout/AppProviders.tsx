'use client';

import React, { useState, ReactNode, createContext, useContext } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SidebarProvider } from '@/components/ui/sidebar';
import { useTranslation } from 'react-i18next';
import { Toaster } from '@/components/ui/toaster';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { InfoUsuario } from 'shared/models/types';
import { ctxTraduccionSoportados } from 'shared/models/types';

import '@/lib/i18nConfig';

// 1. Creamos un contexto para la información del usuario
const InfoUsuarioContext = createContext<InfoUsuario | null>(null);

// 2. Definimos las props del componente
interface AppProvidersProps {
    infoUsuario: InfoUsuario;
    children: ReactNode; // ReactNode permite strings, números, JSX, etc.
}

// 3. Creamos el hook para consumir la información del usuario
export const useInfoUsuario = () => {
    const context = useContext(InfoUsuarioContext);
    if (context === null) {
        throw new Error('useInfoUsuario must be used within an AppProviders');
    }
    return context;
};

export function AppProviders({ infoUsuario, children }: AppProvidersProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 1000 * 60 * 5,
            retry: 1,
          },
        },
      })
  );

  const { i18n } = useTranslation();
  const { ctxTraduccion } = infoUsuario;

  if (!ctxTraduccion || !ctxTraduccionSoportados.includes(ctxTraduccion)) {
      if (i18n.language !== 'es') i18n.changeLanguage('es');
  } else if (ctxTraduccion !== i18n.language) {
      i18n.changeLanguage(ctxTraduccion);
  }

  return (
    <InfoUsuarioContext.Provider value={infoUsuario}>
        <QueryClientProvider client={queryClient}>
          <SidebarProvider>
            {children}
            <Toaster />
            <ReactQueryDevtools initialIsOpen={false} />
          </SidebarProvider>
        </QueryClientProvider>
    </InfoUsuarioContext.Provider>
  );
}

