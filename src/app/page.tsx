'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
// <<< Remove Firebase imports
import { UserProfile, UserRole } from '@/models/firestore';

// --- LOGO URL ---
const LOGO_URL = "https://firebasestorage.googleapis.com/v0/b/comensales-residencia.firebasestorage.app/o/imagenes%2Fcomensales-logo.png?alt=media&token=d8d50163-1817-45b1-be6e-b43541118347";

// --- RESTORE MOCK USER DATA with mock password ---
const mockUsers: (UserProfile & { password?: string })[] = [
    { id: 'usr-1', nombre: 'Ana', apellido: 'García', email: 'ana.garcia@email.com', roles: ['residente'], residenciaId: 'res-guaymura', dietaId: 'dieta-std-g', isActive: true, password: '123' },
    { id: 'usr-2', nombre: 'Carlos', apellido: 'López', email: 'carlos.lopez@email.com', roles: ['director', 'residente'], residenciaId: 'res-guaymura', dietaId: 'dieta-std-g', isActive: true, password: '123' },
    { id: 'usr-3', nombre: 'Admin', apellido: 'General', email: 'admin@sistema.com', roles: ['admin'], isActive: true, password: '123' },
    { id: 'usr-4', nombre: 'Beatriz', apellido: 'Fernández', email: 'beatriz.fernandez@email.com', roles: ['residente'], residenciaId: 'res-del-valle', dietaId: 'dieta-celi-g', isActive: false, password: '123' }, // Inactive user
    { id: 'usr-5', nombre: 'David', apellido: 'Martínez', email: 'david.martinez@email.com', roles: ['director'], residenciaId: 'res-del-valle', isActive: true, password: '123' },
    { id: 'usr-6', nombre: 'Master', apellido: 'User', email: 'master@sistema.com', roles: ['master', 'admin'], isActive: true, password: '123' },
    { id: 'usr-7', nombre: 'Master', apellido: 'Only', email: 'master.only@email.com', roles: ['master'], isActive: true, password: '123' },
];
// --- END MOCK USER DATA ---

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // <<< Remove getUserProfile helper function >>>

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    console.log('Attempting mock login with:', { email });

    // <<< Restore Simulated Authentication Logic >>>
    await new Promise(resolve => setTimeout(resolve, 500)); // Simulate delay

    const foundUser = mockUsers.find(user => user.email.toLowerCase() === email.toLowerCase());

    // 1. Check if user exists
    if (!foundUser) {
        toast({ title: "Error de Inicio de Sesión", description: "Usuario no encontrado.", variant: "destructive" });
        setIsLoading(false);
        return;
    }

    // 2. Check if user is active
    if (!foundUser.isActive) {
         toast({ title: "Error de Inicio de Sesión", description: "Este usuario no está activo. Contacte al administrador.", variant: "destructive" });
         setIsLoading(false);
         return;
    }

    // 3. Mock Password Check
    if (!foundUser.password || foundUser.password !== password) {
        toast({ title: "Error de Inicio de Sesión", description: "Credenciales incorrectas.", variant: "destructive" });
        setIsLoading(false);
        return;
    }
    // --- End Simulated Authentication Logic ---

    toast({ title: "Inicio de Sesión Exitoso", description: `Bienvenido ${foundUser.nombre}!` });

    // --- Restore Role-Based Redirection Logic (using mock data) ---
    const roles = foundUser.roles || [];
    const residenciaId = foundUser.residenciaId;
    let redirectPath = '/';

    if (roles.includes('director')) {
      if (!residenciaId) {
        console.error("Mock Director user has no residenciaId:", foundUser);
        toast({ title: "Error de Configuración", description: "Usuario Director sin residencia asignada.", variant: "destructive" });
        setIsLoading(false); return;
      }
      redirectPath = `/${residenciaId}/solicitar-comensales`;
    } else if (roles.includes('residente')) {
      if (!residenciaId) {
            console.error("Mock Residente user has no residenciaId:", foundUser);
            toast({ title: "Error de Configuración", description: "Usuario Residente sin residencia asignada.", variant: "destructive" });
            setIsLoading(false); return;
      }
      redirectPath = `/${residenciaId}/elegir-comidas`;
    } else if (roles.includes('admin')) {
        redirectPath = '/admin/users';
    } else if (roles.includes('master')) {
        redirectPath = '/admin/residencia';
    } else {
         console.error("Mock User logged in but has no recognized role:", foundUser);
         toast({ title: "Error", description: "Rol de usuario no reconocido.", variant: "destructive" });
         setIsLoading(false);
         return;
    }

    console.log(`Redirecting mock user with roles [${roles.join(', ')}] to: ${redirectPath}`);
    router.push(redirectPath);
  };

  // <<< Restore mailto link using mock data >>>
  const masterEmails = mockUsers
    .filter(user => user.roles.includes('master') && user.isActive && user.email)
    .map(user => user.email)
    .join(',');

  const mailtoLink = masterEmails ? `mailto:${masterEmails}?subject=Consulta%20Comensales%20Residencia` : '#';


  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4">
       <Card className="w-full max-w-md shadow-md">
         <CardHeader className="space-y-1 text-center">
           <div className="mb-4 flex justify-center"> 
             <Image 
               src={LOGO_URL} 
               alt="Comensales Residencia Logo" 
               width={192}
               height={64}
               className="h-auto"
               priority 
             />
           </div>
           <CardTitle className="text-2xl font-semibold tracking-tight">Comensales Residencia</CardTitle>
           <CardDescription>
             Tu aplicación para el manejo de tus horarios de comidas en el Centro Universitario o Colegio Mayor.
           </CardDescription>
         </CardHeader>
         <form onSubmit={handleLogin}>
             <CardContent className="grid gap-4">
                 <div className="grid gap-2">
                     <Label htmlFor="email">Email</Label>
                     <Input
                         id="email"
                         type="email"
                         placeholder="tu.email@ejemplo.com"
                         value={email}
                         onChange={(e) => setEmail(e.target.value)}
                         required
                         autoComplete="email" // Keep autocomplete
                         disabled={isLoading}
                     />
                 </div>
                 <div className="grid gap-2">
                     <Label htmlFor="password">Contraseña</Label>
                     <Input
                         id="password"
                         type="password"
                         placeholder="Tu contraseña"
                         value={password}
                         onChange={(e) => setPassword(e.target.value)}
                         required
                         autoComplete="current-password" // Keep autocomplete
                         disabled={isLoading}
                     />
                 </div>
             </CardContent>
             <CardFooter className="flex flex-col gap-4">
                 <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
                 </Button>
             </CardFooter>
         </form>
       </Card>

        {/* Restore Admin Link */}
        <div className="mt-4 text-center text-sm">
            <a
                href={mailtoLink}
                className={`text-muted-foreground hover:text-primary ${!masterEmails ? 'opacity-50 cursor-not-allowed' : ''}`}
                onClick={(e) => !masterEmails && e.preventDefault()} // Prevent click if no emails
                aria-disabled={!masterEmails}
            >
                Escribir al administrador del sistema
            </a>
        </div>
    </div>
  );
}
