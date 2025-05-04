'use client'; // Make it a client component

import type { Metadata } from 'next';
import { Inter, Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { Toaster } from "@/components/ui/toaster"; // Import Toaster

// React and Next.js hooks
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Firebase Auth
import { getAuth, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '@/lib/firebase'; // Your initialized auth instance

// UI Components
import { Button } from "@/components/ui/button";
import { LogOut } from 'lucide-react'; // Logout icon

const inter = Inter({ subsets: ['latin'] });

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const router = useRouter();

  // Listen for auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      console.log('Layout Auth State Change:', user?.uid ?? 'No User');
      setCurrentUser(user);
      setIsLoadingAuth(false);
    });
    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, []);

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

  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {/* Simple Header for Logout Button */}
        {!isLoadingAuth && currentUser && (
          <header className="bg-primary text-primary-foreground p-2 flex justify-end items-center sticky top-0 z-50">
            <span className="mr-4 text-sm">{currentUser.email}</span>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              Cerrar Sesión
            </Button>
          </header>
        )}

        {/* Main Content */}
        <main>{children}</main>

        {/* Toaster for notifications */}
        <Toaster />
      </body>
    </html>
  );
}
