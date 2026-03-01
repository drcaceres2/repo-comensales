'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from "next/navigation";
import Image from 'next/image';
import { Loader2 } from "lucide-react";
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
import { useToast } from "@/hooks/useToast";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from '@/lib/firebase';
import { useInfoUsuario } from '@/components/layout/AppProviders';
import { ResidenciaId, RolUsuario } from 'shared/models/types';

const LOGO_URL = "https://firebasestorage.googleapis.com/v0/b/comensales-residencia.firebasestorage.app/o/public%2Flogo_web_app_1024x1024.jpg?alt=media&token=3d7a3f7c-71a1-403a-b858-bd0ec567dd10";

const redirectToDashboard = (residenciaId: ResidenciaId, roles: RolUsuario[], router: ReturnType<typeof useRouter>) => {
    console.log(`LOGIN: redirectToDashboard with residenciaId: ${residenciaId}, roles: ${roles.join(', ')}`);
    if (roles.includes('master' as RolUsuario)) {
      router.push('/restringido-master/crear-residencia');
    } else if (residenciaId) {
        if (roles.includes('admin' as RolUsuario)) router.push(`/admin/users`);
        else if (roles.includes('director' as RolUsuario)) router.push(`/${residenciaId}/solicitar-comensales`);
        else if (roles.includes('residente' as RolUsuario)) router.push(`/${residenciaId}/elegir-comidas`);
        else if (roles.includes('invitado' as RolUsuario)) router.push(`/${residenciaId}/bienvenida-invitados`);
        else if (roles.includes('asistente' as RolUsuario)) router.push(`/${residenciaId}/elecciones-invitados`);
        else if (roles.includes('contador' as RolUsuario)) router.push(`/${residenciaId}/contabilidad/reporte-costos`);
        else router.push(`/`);
    } else {
      console.warn("LOGIN: User logged in but has undefined role/residenciaId or unknown role combination:", roles);
      router.push('/acceso-no-autorizado?mensaje=Perfil%20incompleto%20o%20rol%20no%20reconocido.');
    }
};

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { usuarioId: usuario, residenciaId, roles } = useInfoUsuario();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoginLoading, setIsLoginLoading] = useState(false);

  useEffect(() => {
    console.log(`LOGIN (useEffect): User state change. usuarioId: ${usuario}, residenciaId: ${residenciaId}, roles: ${roles}`);
    if (usuario) {
      console.log("LOGIN (useEffect): User authenticated, redirecting...");
      redirectToDashboard(residenciaId, roles, router);
    } else {
      console.log("LOGIN (useEffect): User is signed out, staying on login page.");
    }
  }, [usuario, router, residenciaId, roles]);

  const handleLogin = async (event: React.FormEvent) => {
    console.log("LOGIN (handleLogin): Attempting login...");
    event.preventDefault();
    if (!email || !password) {
      console.log("LOGIN (handleLogin): Email or password empty.");
      toast({ title: "Faltan Datos", description: "Introduce email y contraseña.", variant: "destructive" });
      return;
    }
    setIsLoginLoading(true);
    try {
      console.log("LOGIN (handleLogin): Calling signInWithEmailAndPassword...");
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      console.log("LOGIN (handleLogin): Firebase sign-in successful. User UID:", userCredential.user.uid);
      
      console.log("LOGIN (handleLogin): Getting ID token...");
      const idToken = await userCredential.user.getIdToken();
      console.log("LOGIN (handleLogin): ID token received. Calling /api/auth/login to create session cookie...");

      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
      });
      
      console.log(`LOGIN (handleLogin): Server response status: ${res.status}`);

      if (!res.ok) {
        const errorBody = await res.text();
        console.error(`LOGIN (handleLogin): Server login failed. Status: ${res.status}, Body: ${errorBody}`);
        throw new Error('El inicio de sesión en el servidor falló. Inténtalo de nuevo.');
      }
      
      console.log("LOGIN (handleLogin): Server login successful. Cookie should be set.");
      // The onAuthStateChanged listener in AppProviders will now update the user context,
      // which will trigger the useEffect hook to redirect.
      toast({
        title: "Inicio de sesión exitoso",
        description: `Bienvenido de nuevo. Redirigiendo...`,
      });

      // Force a refresh to re-run middleware and redirect correctly.
      router.refresh();

    } catch (loginError: any) {
      console.error("LOGIN (handleLogin): Login failed.", loginError);
      let errorMessage = "Ha ocurrido un error al iniciar sesión.";
      if (loginError.code) {
        switch (loginError.code) {
          case 'auth/user-not-found':
          case 'auth/wrong-password':
          case 'auth/invalid-credential':
            errorMessage = "El correo electrónico o la contraseña son incorrectos.";
            break;
          case 'auth/invalid-email':
            errorMessage = "El formato del correo electrónico no es válido.";
            break;
          case 'auth/user-disabled':
            errorMessage = "Esta cuenta ha sido deshabilitada.";
            break;
          case 'auth/too-many-requests':
              errorMessage = "Acceso bloqueado temporalmente debido a demasiados intentos fallidos. Intenta más tarde.";
              break;
          default:
            errorMessage = `Error inesperado (${loginError.code}). Por favor, inténtalo de nuevo.`;
        }
      } else {
          errorMessage = loginError.message || "Error de conexión o del servidor.";
      }
      toast({ title: "Error de inicio de sesión", description: errorMessage, variant: "destructive" });
    } finally {
      console.log("LOGIN (handleLogin): Finished login attempt.");
      setIsLoginLoading(false);
    }
  };

  if (usuario) {
      console.log("LOGIN: User is authenticated, rendering redirect loader.");
      return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2">Redirigiendo...</span>
      </div>
    );
  }

  if (!usuario) {
    console.log("LOGIN: User is not authenticated, rendering login form.");
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900 px-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            {LOGO_URL && (
              <Image
                src={LOGO_URL}
                alt="Logo Comensales"
                width={80}
                height={80}
                className="mx-auto mb-4 rounded-full"
                priority
              />
            )}
            <CardTitle className="text-2xl font-bold">Iniciar Sesión</CardTitle>
            <CardDescription>Accede a tu cuenta de Comensales</CardDescription>
          </CardHeader>
          <form onSubmit={handleLogin}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Correo Electrónico</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="tu@email.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoginLoading}
                  autoComplete="email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Contraseña</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Tu contraseña"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoginLoading}
                  autoComplete="current-password"
                />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-4">
              <Button type="submit" className="w-full" disabled={isLoginLoading}>
                {isLoginLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {isLoginLoading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    );
  }
  return null;
}
