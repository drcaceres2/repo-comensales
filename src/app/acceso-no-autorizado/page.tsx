"use client";

import { useRouter } from "next/navigation"; // Corrected import
import { ShieldAlert, LockKeyhole, Info, Home, LogOut } from "lucide-react"; // Added LogOut for clarity if needed later
import { Button } from "@/components/ui/button"; // Assuming this is your button component
import { useEffect, useState } from "react"; // Added useEffect and useState

interface AccesoNoAutorizadoPageProps {
  searchParams?: {
    mensaje?: string;
  };
}

export default function AccesoNoAutorizadoPage({ searchParams }: AccesoNoAutorizadoPageProps) {
  const router = useRouter();
  const customMessage = searchParams?.mensaje;
  const [countdown, setCountdown] = useState(5); // Countdown for redirection

  useEffect(() => {
    // Countdown timer for redirection
    const timer = setInterval(() => {
      setCountdown((prevCountdown) => prevCountdown - 1);
    }, 1000);

    // Redirect after countdown finishes
    const redirectTimeout = setTimeout(() => {
      // If there was a logout function from an auth context, you'd call it here.
      // Example: auth.signOut();
      router.push("/"); // Redirect to login page (home page)
    }, countdown * 1000);

    // Clear timers on component unmount
    return () => {
      clearInterval(timer);
      clearTimeout(redirectTimeout);
    };
  }, [router]); // router is stable, but good practice to include if used

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
        
        {customMessage ? (
          <p className="text-md text-slate-200 mb-8 bg-red-500/20 p-3 rounded-md border border-red-500/50">
            <strong>Mensaje del sistema:</strong> {customMessage}
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
            onClick={() => router.push("/")} // Manual redirect to login/home
          >
            <Home className="mr-2 h-4 w-4" />
            Ir a Inicio / Login
          </Button>
          {/* You could add a "Go Back" button if it makes sense */}
          {/* <Button
            variant="ghost"
            className="w-full md:w-auto text-slate-400 hover:text-yellow-400"
            onClick={() => router.back()}
          >
            <Undo2 className="mr-2 h-4 w-4" />
            Volver Atrás
          </Button> */}
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
