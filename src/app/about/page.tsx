// src/app/about/page.tsx
'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Building, Info, Mail, MapPin, FileText, Cloud, Zap, Wand2, Home, ExternalLink, Watch } from 'lucide-react';

export default function AboutPage() {
  const router = useRouter();
  const appName = "Comensales Residencia";
  const appDescription = "Una aplicación moderna para mejorar la comunicación interna y la gestión de horarios de comidas en residencias, facilitando la interacción entre residentes y administradores.";
  const appLogoUrl = "https://firebasestorage.googleapis.com/v0/b/comensales-residencia.firebasestorage.app/o/public%2Flogo_web_app_1024x1024.png?alt=media&token=b40d208d-ca35-4dfd-954e-4119d6e8f58d";

  const companyName = "Comercios Electrónicos de Honduras S. de R.L.";
  const rtn = "08259024059873";
  const address = "Tatumbla, Francisco Morazán, Honduras";
  const email = "ventas@dcventa.shop";
  const otherShopUrl = "https://www.dcventas.shop";

  const handleGoToApp = () => {
    router.push('/');
  };

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8 space-y-8 min-h-screen flex flex-col items-center justify-center">
      <Card className="w-full max-w-2xl shadow-xl">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 bg-white rounded-lg p-2" style={{ width: '100px', height: '100px' }}>
            <img
              src={appLogoUrl}
              alt={`${appName} Logo`}
              className="object-contain w-full h-full"
            />
          </div>
          <CardTitle className="text-3xl font-bold text-primary">
            {appName}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-8 text-base">
          {/* Section 1: About the App */}
          <div className="space-y-4 text-center">
            <p className="text-lg text-muted-foreground px-4">
              {appDescription}
            </p>
            <Button onClick={handleGoToApp} size="lg">
              <Home className="mr-2 h-5 w-5" />
              Ir a la Aplicación
            </Button>
          </div>

          {/* Section 2: ¿Quiénes Somos? */}
          <div className="space-y-3 pt-6 border-t">
            <h2 className="text-2xl font-semibold text-gray-800 dark:text-gray-200 text-center mb-4">
              ¿Quiénes Somos?
            </h2>
            <div className="flex flex-col items-center space-y-2 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
              <div className="flex items-center space-x-3">
                <Building className="h-6 w-6 text-primary flex-shrink-0" />
                <div>
                  <p className="font-semibold text-lg text-center md:text-left">{companyName}</p>
                  <p className="text-sm text-muted-foreground text-center md:text-left">Soluciones innovadoras para el sector digital.</p>
                </div>
              </div>
              {/* --- BEGIN GARMIN/DCVENTAS.SHOP REFERENCE --- */}
              <div className="pt-2 text-sm text-center text-gray-600 dark:text-gray-400 flex items-center">
                <Watch className="h-4 w-4 mr-2 text-blue-500 flex-shrink-0"/>
                <span>¿Te interesan los relojes GARMIN? También tenemos</span>
                <a href={otherShopUrl} target="_blank" rel="noopener noreferrer" className="ml-1 text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium underline flex items-center">
                  {otherShopUrl.replace('https://www.','')}
                  <ExternalLink className="ml-1 h-3 w-3" />
                </a>
              </div>
              {/* --- END GARMIN/DCVENTAS.SHOP REFERENCE --- */}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3">
                <div className="flex items-start space-x-3">
                  <FileText className="h-5 w-5 mt-1 text-primary flex-shrink-0" />
                  <p>
                    <span className="font-medium text-gray-600 dark:text-gray-400">RTN:</span> {rtn}
                  </p>
                </div>
                <div className="flex items-start space-x-3">
                  <MapPin className="h-5 w-5 mt-1 text-primary flex-shrink-0" />
                  <p>
                    <span className="font-medium text-gray-600 dark:text-gray-400">Sede Social:</span> {address}
                  </p>
                </div>
                <div className="flex items-start space-x-3 md:col-span-2">
                  <Mail className="h-5 w-5 mt-1 text-primary flex-shrink-0" />
                  <p>
                    <span className="font-medium text-gray-600 dark:text-gray-400">Contacto:</span>{' '}
                    <a href={`mailto:${email}`} className="text-primary hover:underline">
                      {email}
                    </a>
                  </p>
                </div>
            </div>
          </div>

          {/* Section 3: Nuestra Misión */}
          <div className="space-y-3 pt-6 border-t">
            <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300 border-b pb-2">
              Nuestra Misión
            </h2>
            <div className="flex items-start space-x-3">
              <Info className="h-5 w-5 mt-1 text-primary flex-shrink-0" />
              <p className="text-gray-700 dark:text-gray-300">
                Facilitar la transformación digital de las empresas en Honduras a través de soluciones tecnológicas robustas, intuitivas y adaptadas a las necesidades del mercado local, impulsando el crecimiento y la eficiencia de nuestros clientes.
              </p>
            </div>
          </div>

          {/* Section 4: Nuestra Tecnología y Desarrollo */}
          <div className="space-y-3 pt-6 border-t">
            <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300 border-b pb-2">
              Nuestra Tecnología y Desarrollo
            </h2>
            <div className="flex items-start space-x-3">
              <Cloud className="h-5 w-5 mt-1 text-green-500 flex-shrink-0" />
              <p className="text-gray-700 dark:text-gray-300">
                Esta plataforma está construida sobre la robusta infraestructura de <span className="font-semibold">Google Cloud</span>, utilizando <span className="font-semibold">Firebase</span> para servicios de backend, base de datos en tiempo real, autenticación y hosting.
              </p>
            </div>
            <div className="flex items-start space-x-3">
              <Zap className="h-5 w-5 mt-1 text-blue-500 flex-shrink-0" />
              <p className="text-gray-700 dark:text-gray-300">
                El desarrollo se realiza en un entorno moderno y eficiente, aprovechando las capacidades de <span className="font-semibold">IDX (anteriormente Firebase Studio)</span>.
              </p>
            </div>
            <div className="flex items-start space-x-3">
              <Wand2 className="h-5 w-5 mt-1 text-purple-500 flex-shrink-0" />
              <p className="text-gray-700 dark:text-gray-300">
                Contamos con la asistencia de <span className="font-semibold">Gemini Code Assistant</span> para agilizar y optimizar nuestro ciclo de desarrollo, permitiéndonos entregar soluciones innovadoras de manera más rápida.
              </p>
            </div>
          </div>

           <div className="text-center pt-8 text-xs text-muted-foreground border-t">
            CEH S. de R.L. &copy; {new Date().getFullYear()} - Todos los derechos reservados.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
