'use client'; // Make it a client component

// Removed AuthProvider and useAuth imports
import type { Metadata } from 'next';
import { Inter, Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { Toaster } from "@/components/ui/toaster"; // Import Toaster

// React and Next.js hooks
import React from 'react';
import { useRouter, usePathname } from 'next/navigation'; // Import usePathname
import Link from 'next/link'; // Import Link for navigation

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
  // Use the hook to get user, loading state, and error
  const [user, loading, error] = useAuthState(auth);
  const router = useRouter();

  // Logout handler (remains the same)
  const handleLogout = async () => {
    try {
      await signOut(auth);
      console.log('User signed out successfully');
      // Redirect to login page after sign out
      router.push('/');
    } catch (error) {
      console.error("Error signing out: ", error);
      // Optionally show a toast message for logout error
      // You might need access to useToast here if you want to show a toast
    }
  };

  // Show loading state while checking auth
  if (loading) {
    return (
         <header className="bg-muted text-muted-foreground p-2 h-10 flex justify-end items-center sticky top-0 z-50">
             <Loader2 className="h-5 w-5 animate-spin" />
         </header>
    );
  }

  // Show error state if auth check failed
  if (error) {
      console.error("Auth Error in Header:", error);
      return (
           <header className="bg-destructive text-destructive-foreground p-2 h-10 flex justify-end items-center sticky top-0 z-50">
               <AlertCircle className="h-5 w-5 mr-2" />
               <span className="text-sm">Error de autenticación</span>
               {/* Optionally add a retry or logout button here */}
           </header>
      );
  }

  // Render header with user info and logout button if user is logged in
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

  // Render nothing (or perhaps an empty placeholder header) if no user is logged in
  // An empty div can help prevent layout shifts if the header appears/disappears
  return <header className="h-10 sticky top-0 z-50"></header>; // Placeholder to maintain height
}

// Footer component with conditional Feedback Link
function LayoutFooter() {
  const pathname = usePathname();
  const showFeedbackLink = pathname !== '/'; // Condición para mostrar el enlace

  if (!showFeedbackLink) {
    return null; // No renderizar nada si estamos en la página principal
  }

  return (
    <footer className="p-4 text-center border-t mt-auto">
      <Link href="/feedback" className="text-sm text-muted-foreground hover:text-primary">
        Dejar feedback sobre la aplicación
      </Link>
    </footer>
  );
}


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {

  return (
    <html lang="en" className="h-full">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased font-sans flex flex-col min-h-full`}>
          {/* LayoutHeader now manages its own auth state */}
          <LayoutHeader />

          {/* Main Content */}
          <main className="flex-grow">{children}</main>
          
          {/* Footer with conditional feedback link */}
          <LayoutFooter />

          {/* Toaster for notifications */}
          <Toaster />
      </body>
    </html>
  );
}
