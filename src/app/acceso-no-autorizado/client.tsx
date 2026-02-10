"use client";

import { useRouter } from "next/navigation";
import { ShieldAlert, LockKeyhole, Info, Home, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";

interface AccesoNoAutorizadoClientProps {
  mensaje?: string;
}

export default function AccesoNoAutorizadoClient({ mensaje }: AccesoNoAutorizadoClientProps) {
  const router = useRouter();
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prevCountdown) => prevCountdown - 1);
    }, 1000);

    const redirectTimeout = setTimeout(() => {
      router.push("/");
    }, countdown * 1000);

    return () => {
      clearInterval(timer);
      clearTimeout(redirectTimeout);
    };
  }, [router, countdown]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 text-white p-6">
      <div className="bg-slate-800/50 backdrop-blur-md shadow-2xl rounded-xl p-8 md:p-12 text-center max-w-lg w-full">
        <div className="mb-6">
          <LockKeyhole className="h-20 w-20 text-yellow-400 mx-auto animate-pulse" />
        </div>
        <h1 className="text-4xl font-bold text-yellow-400 mb-4">
          ¡Alto ahí!
        </h1>
        <p className="text-lg text-slate-300 mb-2">
          Parece que has encontrado una puerta cerrada.
        </p>
        
        {mensaje ? (
          <p className="text-md text-slate-200 mb-8 bg-red-500/20 p-3 rounded-md border border-red-500/50">
            <strong>Mensaje del sistema:</strong> {mensaje}
          </p>
        ) : (
          <p className="text-md text-slate-200 mb-8">
            No tienes los permisos necesarios para acceder a esta sección, o la página que buscas requiere autenticación.
          </p>
        )}

        <div className="space-y-4 md:space-y-0 md:space-x-4 flex flex-col md:flex-row justify-center items-center">
          <Button
            variant="outline"
            className="w-full md:w-auto border-yellow-400 text-yellow-400 hover:bg-yellow-400 hover:text-slate-900 transition-colors duration-300"
            onClick={() => router.push("/")}
          >
            <Home className="mr-2 h-4 w-4" />
            Ir a Inicio / Login
          </Button>
        </div>

        <p className="text-sm text-slate-400 mt-8">
          {countdown > 0 
            ? `Serás redirigido a la página de inicio en ${countdown} segundos...`
            : "Redirigiendo..."}
        </p>
      </div>
    </div>
  );
}
