'use client';

import React, { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SidebarProvider } from '@/components/ui/sidebar';
import { I18nLanguageSync } from '@/components/context/I18nLanguageSync';
import { Toaster } from '@/components/ui/toaster';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import {ResidenciaProvider} from "@/components/context/ResidenciaProvider";

import '@/lib/i18nConfig';

export function AppProviders({ children }: { children: React.ReactNode }) {
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

  return (
      <ResidenciaProvider>
        <QueryClientProvider client={queryClient}>
          <SidebarProvider>
            <I18nLanguageSync />
            {children}
            <Toaster />
            <ReactQueryDevtools initialIsOpen={false} />
          </SidebarProvider>
        </QueryClientProvider>
      </ResidenciaProvider>
  );
}
