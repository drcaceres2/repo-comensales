'use client';

import React from 'react';
import Link from 'next/link';
import { useSidebar } from '@/components/ui/sidebar';
import { MessageSquare } from 'lucide-react';
import { Navigation } from '@/components/Navigation';
import { IndicadorZonaHoraria } from './IndicadorZonaHoraria';
import { NotificationBadge } from './NotificationBadge';
import { useInfoUsuario } from "@/components/layout/AppProviders";

function LayoutHeader() {
  const { usuarioId: user, email } = useInfoUsuario();

  const contentPositioningClasses = "p-2 flex justify-end items-center pl-16 sm:pl-20";
  // the header contains actionable elements (logout, etc.) that should
  // remain visible even when a transient overlay (toast, sheet, dialog)
  // appears. many of those components use z‑indexes of 50+, 100, or even
  // 200; raising the header here keeps it on top. if you ever need a
  // modal to *cover* the header, give that modal an explicit, higher
  // z‑index rather than lowering the header.
  const commonHeaderStyles = "h-10 sticky top-0 z-40 w-full";

  return (
    <header className={`bg-primary text-primary-foreground dark:bg-gray-900 dark:text-gray-100 ${commonHeaderStyles} ${contentPositioningClasses}`}>
      {user && (
        <>
          <div className="mr-4">
            <IndicadorZonaHoraria />
          </div>
          <div className="mr-4">
            <NotificationBadge />
          </div>
          <span className="mr-4 text-sm truncate max-w-xs flex-shrink">
            {email}
          </span>
        </>
      )}
    </header>
  );
}

function LayoutFooter() {
  return (
    <footer className="sticky bottom-0 z-30 w-full p-4 text-center border-t border-border text-sm text-muted-foreground bg-background">
      <Link href="/feedback" className="inline-flex items-center hover:text-primary">
        <MessageSquare size={14} className="mr-2" />
        Enviar comentarios o solicitar ayuda
      </Link>
    </footer>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { state: sidebarState, isMobile } = useSidebar();

  const mainContentMarginClass = !isMobile
    ? sidebarState === 'expanded'
      ? 'md:ml-64'
      : 'md:ml-12'
    : '';

  return (
    <>
      <Navigation />
      <div
        className={`flex-1 flex flex-col min-h-0 min-w-0 ${mainContentMarginClass}`}
      >
        <LayoutHeader />
        <main className="flex-1 flex flex-col overflow-y-auto overflow-x-auto bg-background">
          <div className="flex-grow p-2 md:p-6">
            {children}
          </div>
        </main>
        <LayoutFooter />
      </div>
    </>
  );
}
