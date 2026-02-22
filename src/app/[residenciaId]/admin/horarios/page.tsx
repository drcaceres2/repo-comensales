"use client";

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useHorariosAlmacen } from './_lib/useHorariosAlmacen';
import { DatosHorariosEnBruto } from './_lib/vistaModeloMapa';
import { BarraProgreso } from './_components/shared/BarraProgreso';
import Paso1Grupos from './_components/wizard/Paso1Grupos';
import Paso2Cortes from './_components/wizard/Paso2Cortes';
import Paso3Tiempos from './_components/wizard/Paso3Tiempos';
import Paso4Catalogo from './_components/wizard/Paso4Catalogo';
import Paso5Matriz from './_components/wizard/Paso5Matriz';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar } from 'lucide-react';

// Mock de datos y hook de fetching
const mockDatosCrudos: DatosHorariosEnBruto = {
    // 1. GRUPOS DE COMIDA (Desayuno, Almuerzo, Cena)
    gruposComidas: {
        'desayuno': {nombre: 'Desayuno', orden: 1, estaActivo: true},
        'almuerzo': {nombre: 'Almuerzo', orden: 2, estaActivo: true},
        'cena': {nombre: 'Cena', orden: 3, estaActivo: true},
    },

    // 2. HORARIOS LÍMITE PARA SOLICITUDES
    horariosSolicitud: {
        // NOTA: El schema 'HorarioSolicitudDataSchema' usa 'dia' de la semana, lo cual es probablemente incorrecto para un deadline.
        // Se usa 'lunes' como placeholder para satisfacer el schema, pero la lógica sugiere un valor relativo como 'anterior' o 'mismo'.
        'dia-anterior-2000': {
            nombre: 'Día anterior 20:00',
            dia: 'lunes',
            horaSolicitud: '20:00',
            esPrimario: true,
            estaActivo: true
        },
        'mismo-dia-0900': {
            nombre: 'Mismo día 09:00',
            dia: 'lunes',
            horaSolicitud: '09:00',
            esPrimario: false,
            estaActivo: true
        },
    },

    // 3. CATÁLOGO DE ALTERNATIVAS DISPONIBLES
    definicionesAlternativas: {
        'des-normal': {
            nombre: 'Normal en Comedor',
            grupoComida: 'desayuno',
            tipo: 'comedor',
            estaActiva: true,
            descripcion: 'Servicio de desayuno estándar en el comedor.'
        },
        'alm-normal': {
            nombre: 'Normal en Comedor',
            grupoComida: 'almuerzo',
            tipo: 'comedor',
            estaActiva: true,
            descripcion: 'Servicio de almuerzo estándar en el comedor.'
        },
        'alm-llevar': {
            nombre: 'Para Llevar',
            grupoComida: 'almuerzo',
            tipo: 'para_llevar',
            estaActiva: true,
            descripcion: 'Recoger el almuerzo en un empaque para llevar.'
        },
        'cen-normal': {
            nombre: 'Normal en Comedor',
            grupoComida: 'cena',
            tipo: 'comedor',
            estaActiva: true,
            descripcion: 'Servicio de cena estándar en el comedor.'
        },
        'cen-fria': {
            nombre: 'Cena Fría',
            grupoComida: 'cena',
            tipo: 'para_llevar',
            estaActiva: true,
            descripcion: 'Opción de cena fría para recoger y consumir más tarde.'
        },
    },

    // 4. CONFIGURACIONES (INSTANCIAS) DE LAS ALTERNATIVAS
    configuracionesAlternativas: {
        // Lunes - Desayuno
        'lun-des-normal': {
            nombre: 'Lunes Desayuno Normal',
            tiempoComidaId: 'lunes-desayuno',
            definicionAlternativaId: 'des-normal',
            horarioSolicitudComidaId: 'dia-anterior-2000',
            ventanaServicio: {horaInicio: '07:30', horaFin: '09:30', tipoVentana: 'normal'},
            estaActivo: true,
            requiereAprobacion: false
        },
        // Lunes - Almuerzo
        'lun-alm-normal': {
            nombre: 'Lunes Almuerzo Normal',
            tiempoComidaId: 'lunes-almuerzo',
            definicionAlternativaId: 'alm-normal',
            horarioSolicitudComidaId: 'mismo-dia-0900',
            ventanaServicio: {horaInicio: '13:00', horaFin: '15:00', tipoVentana: 'normal'},
            estaActivo: true,
            requiereAprobacion: false
        },
        'lun-alm-llevar': {
            nombre: 'Lunes Almuerzo para Llevar',
            tiempoComidaId: 'lunes-almuerzo',
            definicionAlternativaId: 'alm-llevar',
            horarioSolicitudComidaId: 'mismo-dia-0900',
            ventanaServicio: {horaInicio: '12:30', horaFin: '13:30', tipoVentana: 'normal'},
            estaActivo: true,
            requiereAprobacion: true
        },
        // Lunes - Cena
        'lun-cen-normal': {
            nombre: 'Lunes Cena Normal',
            tiempoComidaId: 'lunes-cena',
            definicionAlternativaId: 'cen-normal',
            horarioSolicitudComidaId: 'mismo-dia-0900',
            ventanaServicio: {horaInicio: '20:00', horaFin: '22:00', tipoVentana: 'normal'},
            estaActivo: true,
            requiereAprobacion: false
        },
        'lun-cen-fria': {
            nombre: 'Lunes Cena Fría',
            tiempoComidaId: 'lunes-cena',
            definicionAlternativaId: 'cen-fria',
            horarioSolicitudComidaId: 'dia-anterior-2000',
            ventanaServicio: {horaInicio: '22:00', horaFin: '22:30', tipoVentana: 'normal'},
            estaActivo: true,
            requiereAprobacion: true,
        }
    },

    // 5. TIEMPOS DE COMIDA (dias y grupos)
    tiemposComidas: {
        'lunes-desayuno': {
            nombre: 'Desayuno del Lunes',
            grupoComida: 'desayuno',
            dia: 'lunes',
            horaReferencia: '08:00',
            alternativas: {
                principal: 'lun-des-normal',
                secundarias: [],
            },
            estaActivo: true,
        },
        'lunes-almuerzo': {
            nombre: 'Almuerzo del Lunes',
            grupoComida: 'almuerzo',
            dia: 'lunes',
            horaReferencia: '14:00',
            alternativas: {
                principal: 'lun-alm-normal',
                secundarias: ['lun-alm-llevar'],
            },
            estaActivo: true,
        },
        'lunes-cena': {
            nombre: 'Cena del Lunes',
            grupoComida: 'cena',
            dia: 'lunes',
            horaReferencia: '21:00',
            alternativas: {
                principal: 'lun-cen-normal',
                secundarias: ['lun-cen-fria']
            },
            estaActivo: true
        },
        // Martes (inactivo para mostrar la funcionalidad)
        'martes-almuerzo': {
            nombre: 'Almuerzo del Martes',
            grupoComida: 'almuerzo',
            dia: 'martes',
            horaReferencia: '14:00',
            alternativas: {
                // Reutilizando config solo para el ejemplo, idealmente serían configs de martes.
                principal: 'lun-alm-normal',
                secundarias: ['lun-alm-llevar'],
            },
            estaActivo: false
        }
    },
};

const useObtenerConfiguracionHorarios = () => {
    const [isLoading, setIsLoading] = useState(true);
    const [data, setData] = useState<DatosHorariosEnBruto | null>(null);

    useEffect(() => {
        const timer = setTimeout(() => {
            setData(mockDatosCrudos);
            setIsLoading(false);
        }, 1500); // Simula una carga de 1.5 segundos
        return () => clearTimeout(timer);
    }, []);

    return { data, isLoading };
};


// --- Orquestador Principal ---
export default function HorariosPage() {
    const { residenciaId } = useParams<{ residenciaId: string }>();
    const { data, isLoading } = useObtenerConfiguracionHorarios();
    const { pasoActual, inicializarDatos, datosOriginales } = useHorariosAlmacen();

    useEffect(() => {
        if (data && !datosOriginales) {
            inicializarDatos(data);
        }
    }, [data, datosOriginales, inicializarDatos]);

    if (isLoading || !datosOriginales) {
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
                return <Paso5Matriz />;
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
