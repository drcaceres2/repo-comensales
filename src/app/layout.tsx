'use client';

import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import { Navigation } from '@/components/Navigation';
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar";

import React from 'react';
import Link from 'next/link'; // Import Link for the footer
import { useRouter } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useAuthState } from 'react-firebase-hooks/auth';

import { Button } from "@/components/ui/button";
import { LogOut, Loader2, AlertCircle, MessageSquare } from 'lucide-react'; // Added MessageSquare for feedback icon

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

function LayoutHeader() {
  const [user, loading, error] = useAuthState(auth);
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await signOut(auth);
      console.log('User signed out successfully');
      router.push('/');
    } catch (errorMsg) {
      console.error("Error signing out: ", errorMsg);
    }
  };

  const contentPositioningClasses = "p-2 flex justify-end items-center pl-16 sm:pl-20";
  const commonHeaderStyles = "h-10 sticky top-0 z-40 w-full";

  if (loading) {
    return (
      <header className={`bg-muted text-muted-foreground ${commonHeaderStyles} ${contentPositioningClasses}`}>
        <Loader2 className="h-5 w-5 animate-spin" />
      </header>
    );
  }

  if (error) {
    console.error("Auth Error in Header:", error);
    return (
      <header className={`bg-destructive text-destructive-foreground ${commonHeaderStyles} ${contentPositioningClasses}`}>
        <AlertCircle className="h-5 w-5 mr-2" />
        <span className="text-sm">Error de autenticación</span>
      </header>
    );
  }

  if (user) {
    return (
      <header className={`bg-primary text-primary-foreground ${commonHeaderStyles} ${contentPositioningClasses}`}>
        <span className="mr-4 text-sm truncate">{user.email}</span>
        <Button variant="ghost" size="sm" onClick={handleLogout} className="hover:bg-primary/90">
          <LogOut className="mr-2 h-4 w-4" />
          Cerrar Sesión
        </Button>
      </header>
    );
  }
  return <header className={`${commonHeaderStyles} bg-transparent`}></header>;
}

// Simple Footer Component
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

function AppShell({ children }: { children: React.ReactNode }) {
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
        className={`flex-1 flex flex-col min-h-0 min-w-0 transition-all duration-200 ease-in-out ${mainContentMarginClass}`}
      >
        <LayoutHeader />
        <main className="flex-1 flex flex-col overflow-y-auto overflow-x-auto bg-background">
          <div className="flex-grow p-4 md:p-6">
            {children}
          </div>
        </main>
        <LayoutFooter />
      </div>
      <Toaster />
    </>
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased font-sans flex flex-col min-h-full bg-background`}>
        <SidebarProvider>
          <AppShell>{children}</AppShell>
        </SidebarProvider>
      </body>
    </html>
  );
}
