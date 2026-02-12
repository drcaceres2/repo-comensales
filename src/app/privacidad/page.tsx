'use client';

import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Home, FileText, UserCog, LocateFixed } from 'lucide-react';

export default function PrivacyPolicyPage() {
  const router = useRouter();
  const appName = "Comensales Residencia";
  const privacyPolicyTitle = "Política de Privacidad";
  const lastUpdated = "17 de Julio de 2024"; // Replace with actual date

  const privacyPolicyContent = {
    introduction: "En nuestra plataforma, nos tomamos muy en serio la privacidad y seguridad de los datos de nuestros usuarios. Esta Política de Privacidad explica qué información recolectamos, cómo la usamos y cuáles son nuestros compromisos respecto a su protección.",
    informationCollected: {
      title: "1. Información que recolectamos",
      text: "La única información que recopilamos es la que el usuario proporciona directamente al utilizar la aplicación, como su nombre, horarios de comida u otros datos relevantes para el funcionamiento del sistema. No recolectamos información sobre el uso de la aplicación, ni accedemos a datos del dispositivo sin autorización expresa."
    },
    locationUsage: {
      title: "2. Uso de la ubicación",
      text: "La aplicación puede solicitar acceso a la ubicación del usuario, exclusivamente con el fin de generar notificaciones relevantes para mejorar la experiencia, como recordatorios para actualizar horarios en caso de que el usuario se encuentre fuera de la ciudad.",
      points: [
        "El acceso a la ubicación es opcional y requiere autorización explícita del usuario.",
        "La información de ubicación no se almacena, ni se comparte con terceros, ni se transmite a servidores externos.",
        "El uso de la ubicación es local y se limita a desencadenar notificaciones útiles para el propio usuario o para otros residentes dentro del sistema, si aplica."
      ]
    },
    informationSharing: {
      title: "3. Compartición de información",
      points: ["No compartimos ninguna información del usuario con terceros.",
      "Tampoco utilizamos servicios de publicidad, ni integraciones con plataformas externas que rastreen o recopilen datos de los usuarios."]
    },
    security: {
      title: "4. Seguridad",
      text: "Implementamos medidas razonables para proteger la información proporcionada por los usuarios, manteniéndola segura y accesible únicamente dentro del propósito de la plataforma."
    },
    contact: "Si tenés alguna pregunta sobre nuestra política de privacidad, podés contactarnos directamente."
  };

  const handleGoToApp = () => {
    router.push('/');
  };

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8 space-y-8 min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-gray-100 dark:from-slate-900 dark:to-gray-800">
      <Card className="w-full max-w-3xl shadow-2xl rounded-lg overflow-hidden">
        <CardHeader className="bg-primary text-primary-foreground p-6 sm:p-8 text-center">
          <div className="mx-auto mb-4 flex justify-center items-center">
            <ShieldCheck className="h-16 w-16 text-white" />
          </div>
          <CardTitle className="text-3xl sm:text-4xl font-bold">
            {privacyPolicyTitle}
          </CardTitle>
          <CardDescription className="text-sm text-primary-foreground/80 mt-2">
            Última actualización: {lastUpdated} <br /> Para {appName}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 sm:p-8 space-y-6 text-base text-gray-700 dark:text-gray-300">
          <div className="prose prose-lg dark:prose-invert max-w-none">
            <p className="lead text-lg">{privacyPolicyContent.introduction}</p>

            {/* Section: Information Collected */}
            <div className="pt-4 space-y-2">
              <h2 className="text-2xl font-semibold flex items-center text-primary dark:text-sky-400">
                <UserCog className="mr-3 h-7 w-7" />
                {privacyPolicyContent.informationCollected.title}
              </h2>
              <p>{privacyPolicyContent.informationCollected.text}</p>
            </div>

            {/* Section: Location Usage */}
            <div className="pt-4 space-y-2">
              <h2 className="text-2xl font-semibold flex items-center text-primary dark:text-sky-400">
                <LocateFixed className="mr-3 h-7 w-7" />
                {privacyPolicyContent.locationUsage.title}
              </h2>
              <p>{privacyPolicyContent.locationUsage.text}</p>
              <ul className="list-disc list-inside space-y-1 pl-2">
                {privacyPolicyContent.locationUsage.points.map((point, index) => (
                  <li key={index}>{point}</li>
                ))}
              </ul>
            </div>

            {/* Section: Information Sharing */}
            <div className="pt-4 space-y-2">
              <h2 className="text-2xl font-semibold flex items-center text-primary dark:text-sky-400">
                <FileText className="mr-3 h-7 w-7" /> {/* Changed Icon */}
                {privacyPolicyContent.informationSharing.title}
              </h2>
               <ul className="list-disc list-inside space-y-1 pl-2">
                {privacyPolicyContent.informationSharing.points.map((point, index) => (
                  <li key={index}>{point}</li>
                ))}
              </ul>
            </div>

            {/* Section: Security */}
            <div className="pt-4 space-y-2">
              <h2 className="text-2xl font-semibold flex items-center text-primary dark:text-sky-400">
                <ShieldCheck className="mr-3 h-7 w-7" />
                {privacyPolicyContent.security.title}
              </h2>
              <p>{privacyPolicyContent.security.text}</p>
            </div>
            
            <div className="pt-6 border-t dark:border-gray-700">
              <p className="italic">{privacyPolicyContent.contact}</p>
            </div>
          </div>

          <div className="text-center pt-6">
            <Button onClick={handleGoToApp} size="lg" variant="outline">
              <Home className="mr-2 h-5 w-5" />
              Volver a la Aplicación
            </Button>
          </div>
        </CardContent>
      </Card>
      <footer className="text-center py-4 text-xs text-muted-foreground">
        {appName} &copy; {new Date().getFullYear()} - Todos los derechos reservados.
      </footer>
    </div>
  );
}
