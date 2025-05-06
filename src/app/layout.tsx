'use client'; // Make it a client component

import { AuthProvider, useAuth } from '@/hooks/useAuth'; // Import the provider and hook
import type { Metadata } from 'next';
import { Inter, Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { Toaster } from "@/components/ui/toaster"; // Import Toaster

// React and Next.js hooks
import React from 'react'; // No longer need useState, useEffect here
import { useRouter } from 'next/navigation';

// Firebase Auth
import { getAuth, signOut } from 'firebase/auth'; // Keep signOut
import { auth } from '@/lib/firebase'; // Your initialized auth instance

// UI Components
import { Button } from "@/components/ui/button";
import { LogOut, Loader2 } from 'lucide-react'; // Logout icon and Loader

const inter = Inter({ subsets: ['latin'] });

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

// Internal Header component that uses the Auth Context
function LayoutHeader() {
  const { user, loading } = useAuth(); // Use the hook to get user and loading state
  const router = useRouter();

  // Logout handler
  const handleLogout = async () => {
    try {
      await signOut(auth);
      console.log('User signed out successfully');
      // Redirect to login page after sign out
      router.push('/');
    } catch (error) {
      console.error("Error signing out: ", error);
      // Optionally show a toast message for logout error
    }
  };

  // Don't render header until auth state is determined
  if (loading) {
    // Optionally show a minimal loading state in the header area
    return (
         <header className="bg-muted text-muted-foreground p-2 flex justify-end items-center sticky top-0 z-50">
             <Loader2 className="h-5 w-5 animate-spin" />
         </header>
    );
  }

  // Render header only if user is logged in
  if (user) {
    return (
      <header className="bg-primary text-primary-foreground p-2 flex justify-end items-center sticky top-0 z-50">
        <span className="mr-4 text-sm">{user.email}</span>
        <Button variant="ghost" size="sm" onClick={handleLogout}>
          <LogOut className="mr-2 h-4 w-4" />
          Cerrar Sesión
        </Button>
      </header>
    );
  }

  // Render nothing if no user is logged in and auth check is complete
  return null;
}


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Removed useState and useEffect for local auth handling

  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <AuthProvider> {/* Wrap everything that needs auth context */}
          {/* Render Header using context */}
          <LayoutHeader />

          {/* Main Content */}
          <main>{children}</main>

          {/* Toaster for notifications (can be outside or inside AuthProvider) */}
          <Toaster />
        </AuthProvider>
      </body>
    </html>
  );
}
