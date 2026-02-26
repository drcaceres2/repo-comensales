"use client";

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useHorariosAlmacen } from './_lib/useHorariosAlmacen';
import { BarraProgreso } from './_components/shared/BarraProgreso';
import Paso1Grupos from './_components/wizard/Paso1Grupos';
import Paso2Cortes from './_components/wizard/Paso2Cortes';
import Paso3Tiempos from './_components/wizard/Paso3Tiempos';
import Paso4Catalogo from './_components/wizard/Paso4Catalogo';
import Paso5Matriz from './_components/wizard/Paso5Matriz';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar } from 'lucide-react';
import { useObtenerHorarios } from './_lib/useHorariosQuery';
import type { ResidenciaId, RolUsuario } from 'shared/models/types';
import { useAuth } from '@/hooks/useAuth';

// --- Orquestador Principal ---
export default function HorariosPage() {
    const { claims, loading: authLoading } = useAuth();
    const router = useRouter();
    const residenciaId = claims?.residenciaId as ResidenciaId;
    const roles = claims?.roles as RolUsuario[]
    const rolesPermitidos: RolUsuario[] = ['master','admin','asistente']

    const { data: horariosData, isLoading } = useObtenerHorarios(residenciaId);
    const { pasoActual, inicializarDatos, datosOriginales } = useHorariosAlmacen();

    useEffect(() => {
        if (!authLoading && roles
            && !(rolesPermitidos.some(
                    (rol) => roles.includes(rol)
                )
            )
        ) {
            router.push('/acceso-no-autorizado?mensaje=No%20tienes%20permiso%20a%20esta%20pp%C3%A1gina.');
        }
    }, [roles, authLoading, router]);

    useEffect(() => {
        if (horariosData && !datosOriginales) {
            inicializarDatos(horariosData.datos, horariosData.version);
        }
    }, [horariosData, datosOriginales, inicializarDatos]);

    if (authLoading || isLoading || !datosOriginales) {
        return (
            <div className="p-4 sm:p-6 space-y-6">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-64 w-full" />
                <div className="flex justify-between">
                    <Skeleton className="h-10 w-24" />
                    <Skeleton className="h-10 w-24" />
                </div>
            </div>
        );
    }

    const renderPaso = () => {
        switch (pasoActual) {
            case 1:
                return <Paso1Grupos />;
            case 2:
                return <Paso2Cortes />;
            case 3:
                return <Paso3Tiempos />;
            case 4:
                return <Paso4Catalogo />;
            case 5:
                return <Paso5Matriz residenciaIdProp={residenciaId} />;
            default:
                return <div>Paso desconocido</div>;
        }
    };

    return (
        <div className="container mx-auto p-4 sm:p-6">
            <header className="mb-8">
                <div className="flex items-center gap-3 mb-1">
                    <Calendar className="text-slate-600 dark:text-slate-400 h-8 w-8" />
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Gestión de Horarios</h1>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Residencia: {residenciaId}</p>
                    </div>
                </div>
                 <p className="text-gray-600 mt-2">
                    Sigue los pasos para establecer los horarios y las asignaciones para los diferentes grupos de comensales.
                </p>
            </header>

            <main>
                <BarraProgreso pasoActual={pasoActual} />
                <div className="mt-8 max-w-3xl mx-auto">
                    {renderPaso()}
                </div>
            </main>
        </div>
    );
}
