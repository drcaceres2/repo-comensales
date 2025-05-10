'use client';

import type { Metadata } from 'next';
import { Inter, Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import { Navigation } from '@/components/Navigation';
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar"; // Import useSidebar

import React from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useAuthState } from 'react-firebase-hooks/auth';

import { Button } from "@/components/ui/button";
import { LogOut, Loader2, AlertCircle } from 'lucide-react';

const inter = Inter({ subsets: ['latin'] });

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

// Modified LayoutHeader
function LayoutHeader() {
  const [user, loading, error] = useAuthState(auth);
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await signOut(auth);
      console.log('User signed out successfully');
      router.push('/');
    } catch (errorMsg) { // Renamed to avoid conflict with 'error' from useAuthState
      console.error("Error signing out: ", errorMsg);
    }
  };

  // Base classes for padding and flex alignment.
  // pl-16 (4rem) default, sm:pl-20 (5rem) for slightly more space on small+ screens for the hamburger.
  const contentPositioningClasses = "p-2 flex justify-end items-center pl-16 sm:pl-20";
  // Common styles for header: height, sticky, z-index (below sidebar trigger), full width.
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

  // Render a placeholder header to maintain layout consistency (e.g., for pt-10 on main)
  // It uses commonHeaderStyles for height, stickiness, z-index, and width.
  // It can be transparent or have a default background.
  return <header className={`${commonHeaderStyles} bg-transparent`}></header>;
}

// New component to handle the main app shell structure and consume sidebar context
function AppShell({ children }: { children: React.ReactNode }) {
  const { state: sidebarState, isMobile } = useSidebar();

  // Determine margin for desktop based on sidebar state.
  // Sidebar widths from sidebar.tsx: expanded: 16rem (ml-64), collapsed: 3rem (ml-12)
  const mainContentMarginClass = !isMobile
    ? sidebarState === 'expanded'
      ? 'md:ml-64' // 16rem
      : 'md:ml-12'  // 3rem
    : ''; // No margin on mobile as sidebar is an overlay

  return (
    <>
      <Navigation /> {/* Contains Sidebar and its fixed trigger (fixed left-4 top-4 z-50) */}
      
      {/* This div wraps the header and main content. It shifts based on sidebar state on desktop. */}
      <div 
        className={`flex-1 flex flex-col min-h-0 transition-all duration-200 ease-in-out ${mainContentMarginClass}`}
      >
        <LayoutHeader /> {/* Header is sticky, h-10, z-40. Has pl-16 sm:pl-20 for hamburger. */}
        <main className="flex-1 pt-10 overflow-y-auto bg-background"> {/* Default background for main content area */}
          {/* 
            pt-10: to clear sticky header (h-10).
            flex-1: to take remaining vertical space within its parent div.
            overflow-y-auto: for scrollable main content.
            The /admin/users page being too wide: This structure should provide a constrained width.
            If content still overflows horizontally, the issue is likely within that page's specific content.
          */}
          <div className="p-4 md:p-6"> {/* Inner padding for page content */}
            {children}
          </div>
        </main>
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
      {/* Added bg-background as a default fallback for the entire page */}
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased font-sans flex flex-col min-h-full bg-background`}>
        <SidebarProvider>
          <AppShell>{children}</AppShell>
        </SidebarProvider>
      </body>
    </html>
  );
}
