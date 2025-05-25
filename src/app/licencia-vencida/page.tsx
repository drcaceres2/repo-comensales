\
"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button"; // Assuming this is your button component
import { CalendarClock, ShieldQuestion, MailWarning } from "lucide-react"; // Icons for the theme

// ** IMPORTANT: Logo Integration **
// Replace this with your actual Logo component or Image tag from /src/app/page.tsx
const AppLogo = () => (
  <div className="w-32 h-32 bg-slate-700 flex items-center justify-center rounded-full mx-auto mb-6">
    <span className="text-slate-400 text-sm">(Tu Logo Aquí)</span>
  </div>
);

export default function LicenciaVencidaPage() {
  const router = useRouter();

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 text-white p-6">
      <div className="bg-slate-800/60 backdrop-blur-lg shadow-2xl rounded-xl p-8 md:p-12 text-center max-w-lg w-full">
        
        <AppLogo />

        <div className="mb-6">
          {/* Using CalendarClock as a primary icon for expired/pending status */}
          <CalendarClock className="h-20 w-20 text-amber-400 mx-auto animate-pulse" />
        </div>

        <h1 className="text-3xl md:text-4xl font-bold text-amber-400 mb-5">
          Atención Necesaria en tu Licencia
        </h1>

        <p className="text-lg text-slate-300 mb-4">
          Hemos detectado una situación con la licencia asociada a tu residencia.
        </p>
        <p className="text-md text-slate-300 mb-6">
          Esto podría deberse a que la licencia ha expirado recientemente o, en casos menos comunes,
          aún no se ha activado completamente en nuestro sistema. Entendemos que esto puede ser un inconveniente
          y queremos ayudarte a resolverlo lo antes posible.
        </p>
        
        <p className="text-md text-slate-200 mb-8 bg-sky-600/20 p-4 rounded-md border border-sky-500/50">
          Para continuar disfrutando de todas las funcionalidades, es necesario regularizar el estado de tu licencia.
          Agradecemos tu comprensión y paciencia mientras revisamos o actualizamos tu acceso.
        </p>

        <div className="mt-10">
          <Button
            variant="outline"
            className="w-full md:w-auto border-amber-400 text-amber-400 hover:bg-amber-400 hover:text-slate-900 transition-colors duration-300 py-3 px-6 text-lg"
            disabled // Button is disabled as requested
            title="Funcionalidad de contacto de ventas por implementar" // Tooltip for disabled button
            // onClick={() => { /* Logic for contacting sales - To be implemented */ }}
          >
            <MailWarning className="mr-2 h-5 w-5" />
            Contactar a Ventas
          </Button>
        </div>

         <p className="text-xs text-slate-500 mt-10">
          Si crees que esto es un error o tienes alguna duda urgente, nuestro equipo de soporte también está disponible.
          (Puedes agregar aquí un enlace o información de contacto de soporte si lo deseas)
        </p>
      </div>
    </div>
  );
}
