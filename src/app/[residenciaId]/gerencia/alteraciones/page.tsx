"use server"
import React, { Suspense } from 'react';
import { CalendarCog } from 'lucide-react';
import { redirect } from 'next/navigation';
import { FechaIsoSchema } from 'shared/schemas/fechas';
import AlteracionDiaContenedor from './components/AlteracionDiaContenedor';
import DatePickerClient from './components/DatePickerClient';

// --- Auth Helpers (Assumed to exist based on prompt) ---
import { obtenerInfoUsuarioServer } from '@/lib/obtenerInfoUsuarioServer';
import {verificarPermisoGestionWrapper} from "@/lib/acceso-privilegiado";
import {urlAccesoNoAutorizado} from "@/lib/utils";

type AlteracionesPageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

// A simple server-side function to get today's date in YYYY-MM-DD format
const getTodayIso = (): string => {
  const today = new Date();
  // Adjust for timezone to get the correct local date
  const offset = today.getTimezoneOffset();
  const todayWithOffset = new Date(today.getTime() - (offset * 60 * 1000));
  return todayWithOffset.toISOString().split('T')[0];
};

const AlteracionesPage = async ({ searchParams }: AlteracionesPageProps) => {

  // 1. Authorization Guard
  const infoUsuario = await obtenerInfoUsuarioServer();
  const residenciaId = infoUsuario.residenciaId;
  const validacionUsuario = await verificarPermisoGestionWrapper('gestionHorariosYAlteraciones')

  if(validacionUsuario.error) {
    return (
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Alteraciones de Horario</h1>
            <p>Error de validación de usuario</p>
          </div>
        </div>
    );
  }
  if (!validacionUsuario.tieneAcceso) {
    const mensaje = validacionUsuario.mensaje ?? "Hubo un error en obtener el mensaje de error (alteraciones:VerificarPermisoGestionWrapper)."
    redirect(urlAccesoNoAutorizado(mensaje));
  }

  // 2. URL State Management
  const resolvedSearchParams = await searchParams;
  const fechaResult = FechaIsoSchema.safeParse(resolvedSearchParams?.fecha);
  const fecha = fechaResult.success ? fechaResult.data : getTodayIso();

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <CalendarCog className="h-12 w-12 text-gray-700" />
          <div className="flex flex-col">
            <h1 className="text-2xl font-bold">Alteraciones Horario</h1>
            <p className="text-sm text-gray-600 mt-1">
              Modifique los horarios de un día. Los cambios anulan la configuración general.
            </p>
          </div>
        </div>
        <DatePickerClient initialFecha={fecha} />
      </div>

      {/* 3. Server-to-Client Boundary */}
      <Suspense fallback={<div>Cargando formulario...</div>}>
        <AlteracionDiaContenedor
          fecha={fecha}
          residenciaId={residenciaId}
        />
      </Suspense>
    </div>
  );
};

export default AlteracionesPage;
