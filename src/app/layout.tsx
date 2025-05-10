'use client'; // Make it a client component

// Removed AuthProvider and useAuth imports
import type { Metadata } from 'next';
import { Inter, Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { Toaster } from "@/components/ui/toaster"; // Import Toaster
import { Navigation } from '@/components/Navigation'; // Import Navigation
import { SidebarProvider } from "@/components/ui/sidebar"; // Import SidebarProvider

// React and Next.js hooks
import React from 'react';
import { useRouter } from 'next/navigation';

// Firebase Auth
import { signOut } from 'firebase/auth'; // Keep signOut
import { auth } from '@/lib/firebase'; // Your initialized auth instance
import { useAuthState } from 'react-firebase-hooks/auth'; // Import the new hook

// UI Components
import { Button } from "@/components/ui/button";
import { LogOut, Loader2, AlertCircle } from 'lucide-react'; // Logout icon, Loader, and Error icon

const inter = Inter({ subsets: ['latin'] });

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

// Internal Header component using useAuthState
function LayoutHeader() {
  const [user, loading, error] = useAuthState(auth);
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await signOut(auth);
      console.log('User signed out successfully');
      router.push('/');
    } catch (error) {
      console.error("Error signing out: ", error);
    }
  };

  if (loading) {
    return (
         <header className="bg-muted text-muted-foreground p-2 h-10 flex justify-end items-center sticky top-0 z-50">
             <Loader2 className="h-5 w-5 animate-spin" />
         </header>
    );
  }

  if (error) {
      console.error("Auth Error in Header:", error);
      return (
           <header className="bg-destructive text-destructive-foreground p-2 h-10 flex justify-end items-center sticky top-0 z-50">
               <AlertCircle className="h-5 w-5 mr-2" />
               <span className="text-sm">Error de autenticación</span>
           </header>
      );
  }

  if (user) {
    return (
      <header className="bg-primary text-primary-foreground p-2 h-10 flex justify-end items-center sticky top-0 z-50">
        <span className="mr-4 text-sm truncate">{user.email}</span>
        <Button variant="ghost" size="sm" onClick={handleLogout} className="hover:bg-primary/90">
          <LogOut className="mr-2 h-4 w-4" />
          Cerrar Sesión
        </Button>
      </header>
    );
  }

  return <header className="h-10 sticky top-0 z-50"></header>; // Placeholder to maintain height
}


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {

  return (
    <html lang="en" className="h-full">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased font-sans flex flex-col min-h-full`}>
        <SidebarProvider> {/* Wrap Navigation and children with SidebarProvider */}
          <Navigation /> {/* Add Navigation component here */}
          <LayoutHeader />
          <main className="flex-grow pt-10">{/* Added pt-10 to account for header height */}
            {children}
          </main>
          {/* LayoutFooter removed as feedback link is in Navigation */}
          <Toaster />
        </SidebarProvider>
      </body>
    </html>
  );
}
