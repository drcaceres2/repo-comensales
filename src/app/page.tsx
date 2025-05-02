'use client';

import React, { useState } from 'react'; // Import useState
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter // Added CardFooter
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast"; // Import useToast for feedback
import { UserProfile, UserRole } from '@/models/firestore'; // Import UserProfile for mock data

// --- MOCK USER DATA (Assume this exists or is fetched for login simulation) ---
// Using the same mock users from user management for simulation consistency
const mockUsers: UserProfile[] = [
    { id: 'usr-1', nombre: 'Ana', apellido: 'García', email: 'ana.garcia@email.com', roles: ['residente'], residenciaId: 'res-guaymura', dietaId: 'dieta-std-g', isActive: true },
    { id: 'usr-2', nombre: 'Carlos', apellido: 'López', email: 'carlos.lopez@email.com', roles: ['director', 'residente'], residenciaId: 'res-guaymura', dietaId: 'dieta-std-g', isActive: true },
    { id: 'usr-3', nombre: 'Admin', apellido: 'General', email: 'admin@sistema.com', roles: ['admin'], isActive: true },
    { id: 'usr-4', nombre: 'Beatriz', apellido: 'Fernández', email: 'beatriz.fernandez@email.com', roles: ['residente'], residenciaId: 'res-del-valle', dietaId: 'dieta-celi-g', isActive: false }, // Inactive user
    { id: 'usr-5', nombre: 'David', apellido: 'Martínez', email: 'david.martinez@email.com', roles: ['director'], residenciaId: 'res-del-valle', isActive: true },
    { id: 'usr-6', nombre: 'Master', apellido: 'User', email: 'master@sistema.com', roles: ['master', 'admin'], isActive: true },
    { id: 'usr-7', nombre: 'Master', apellido: 'Only', email: 'master.only@email.com', roles: ['master'], isActive: true },
];
// --- END MOCK USER DATA ---

export default function LoginPage() { // Renamed component function for clarity
  const router = useRouter();
  const { toast } = useToast(); // Initialize toast
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false); // Loading state for login button

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); // Prevent default form submission
    setIsLoading(true);
    console.log('Attempting login with:', { email, password });

    // --- Simulated Authentication Logic ---
    // TODO: Replace with actual Firebase signInWithEmailAndPassword
    await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate network delay

    const foundUser = mockUsers.find(user => user.email.toLowerCase() === email.toLowerCase()); // Case-insensitive email match

    // Basic checks (add password check with real auth)
    if (!foundUser) {
        toast({ title: "Error de Inicio de Sesión", description: "Usuario no encontrado.", variant: "destructive" });
        setIsLoading(false);
        return;
    }

    if (!foundUser.isActive) {
         toast({ title: "Error de Inicio de Sesión", description: "Este usuario no está activo. Contacte al administrador.", variant: "destructive" });
         setIsLoading(false);
         return;
    }

    // TODO: Add password validation against real auth service
    // For simulation, we'll assume password is correct if user is found and active

    toast({ title: "Inicio de Sesión Exitoso", description: `Bienvenido ${foundUser.nombre}!` });

    // --- Role-Based Redirection Logic (Updated) ---
    const roles = foundUser.roles || [];
    const residenciaId = foundUser.residenciaId; // Get the residence ID
    let redirectPath = '/'; // Default path (should ideally not be reached)

    if (roles.includes('director')) {
      if (!residenciaId) { // Check if director has a residence assigned
        console.error("Director user has no residenciaId:", foundUser);
        toast({ title: "Error de Configuración", description: "Usuario Director sin residencia asignada.", variant: "destructive" });
        setIsLoading(false); return;
      }
      redirectPath = `/${residenciaId}/solicitar-comensales`; // Include residenciaId
    } else if (roles.includes('residente')) {
      if (!residenciaId) { // Check if resident has a residence assigned (should always be true ideally)
            console.error("Residente user has no residenciaId:", foundUser);
            toast({ title: "Error de Configuración", description: "Usuario Residente sin residencia asignada.", variant: "destructive" });
            setIsLoading(false); return;
      }
      // --- > Fixed: Missing assignment to redirectPath for residente < --- 
      redirectPath = `/${residenciaId}/elegir-comidas`; // Include residenciaId
    } else if (roles.includes('admin')) {
        redirectPath = '/admin/users';
    } else if (roles.includes('master')) {
        redirectPath = '/admin/residencia'; // Assuming this is residence management
    } else {
        // Should not happen if users always have roles, but good practice to have a fallback
         console.error("User logged in but has no recognized role:", foundUser);
         toast({ title: "Error", description: "Rol de usuario no reconocido.", variant: "destructive" });
         setIsLoading(false);
         return; // Stay on login page
    }

    console.log(`Redirecting user with roles [${roles.join(', ')}] to: ${redirectPath}`);
    router.push(redirectPath);
    // No need to setLoading(false) as we are navigating away
  };

  // Prepare mailto link
  const masterEmails = mockUsers
    .filter(user => user.roles.includes('master') && user.isActive && user.email)
    .map(user => user.email)
    .join(','); // Comma-separated list for mailto

  const mailtoLink = masterEmails ? `mailto:${masterEmails}?subject=Consulta%20Comensales%20Residencia` : '#'; // Fallback if no master emails


  return (
    // Centered layout
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4">
       {/* You can add your logo here */}
       {/* <img src="/path/to/logo.svg" alt="Comensales Residencia Logo" className="mb-6 h-16 w-auto" /> */}

       <Card className="w-full max-w-md shadow-md">
         <CardHeader className="space-y-1 text-center">
           <CardTitle className="text-2xl font-semibold tracking-tight">Comensales Residencia</CardTitle>
           <CardDescription>
             Tu aplicación para el manejo de tus horarios de comidas en el Centro Universitario o Colegio Mayor.
           </CardDescription>
         </CardHeader>
         {/* Use form element for better accessibility and Enter key submission */}
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
                         required // Add basic HTML validation
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
                         required // Add basic HTML validation
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

        {/* Add Admin Link */}
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
