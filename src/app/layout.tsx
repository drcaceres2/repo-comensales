import type { Metadata } from 'next';
import { Inter, Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { Toaster } from "@/components/ui/toaster"; // Import Toaster

const inter = Inter({ subsets: ['latin'] });

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Comensales Residencia', // <<< UPDATED TITLE
  description: 'Meal Schedule App for University Residences',
  icons: {
    icon: [
      // <<< UPDATED ICON URL and added type
      { url: 'https://firebasestorage.googleapis.com/v0/b/comensales-residencia.firebasestorage.app/o/imagenes%2Ficono_comensales_residencia.ico?alt=media&token=a56c08fa-6bb4-48bd-855e-1f14d86ea167', type: 'image/x-icon', sizes: 'any' },
    ],
    // Optional: You might want specific icons for Apple touch, etc.
    // apple: '/apple-touch-icon.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      {/* The <head> section is automatically managed by Next.js based on metadata */}
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}
        <Toaster /> {/* Add Toaster here */}
      </body>
    </html>
  );
}
