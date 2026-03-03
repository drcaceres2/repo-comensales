'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSidebar } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { LogOut, Loader2, AlertCircle, MessageSquare } from 'lucide-react';
import { Navigation } from '@/components/Navigation';
import { IndicadorZonaHoraria } from './IndicadorZonaHoraria';
import { useInfoUsuario } from "@/components/layout/AppProviders";
import { signOut } from "firebase/auth";
import { auth } from '@/lib/firebase';

function LayoutHeader() {
  const { usuarioId: user, email } = useInfoUsuario()
  const router = useRouter();

  const handleLogout = async () => {
    try {
      // 1. Sign out from the Firebase client SDK
      await signOut(auth);
      console.log('User signed out from Firebase client.');

      // 2. Invalidate the server-side session cookie
      await fetch('/api/auth/logout', {
          method: 'GET',
      });
      console.log('Server session cookie cleared.');

      // 3. Redirect and refresh to ensure a clean state
      router.push('/');
      router.refresh();
    } catch (errorMsg) {
      console.error("Error signing out: ", errorMsg);
    }
  };

  const contentPositioningClasses = "p-2 flex justify-end items-center pl-16 sm:pl-20";
  // the header contains actionable elements (logout, etc.) that should
  // remain visible even when a transient overlay (toast, sheet, dialog)
  // appears. many of those components use z‑indexes of 50+, 100, or even
  // 200; raising the header here keeps it on top. if you ever need a
  // modal to *cover* the header, give that modal an explicit, higher
  // z‑index rather than lowering the header.
  const commonHeaderStyles = "h-10 sticky top-0 z-40 w-full";

  if (user) {
    return (
      <header className={`bg-primary text-primary-foreground ${commonHeaderStyles} ${contentPositioningClasses}`}>
        <div className="mr-4">
          <IndicadorZonaHoraria />
        </div>
        {/* make sure a long address doesn’t push the button off
            screen – let the email shrink and ellipsise */}
        <span className="mr-4 text-sm truncate max-w-xs flex-shrink">
          {email}
        </span>
        {/* ghost buttons inherit their color from the parent header; if
            the parent background/foreground ever end up matching (dark
            mode, theme tweaks, etc.) the link can vanish.  Override with
            an explicit text color so the icon and label remain visible */}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleLogout}
          className="text-primary-foreground hover:bg-primary/90"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Cerrar Sesión
        </Button>
      </header>
    );
  }
  return <header className={`${commonHeaderStyles} bg-transparent`}></header>;
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
          <div className="flex-grow p-4 md:p-6">
            {children}
          </div>
        </main>
        <LayoutFooter />
      </div>
    </>
  );
}
