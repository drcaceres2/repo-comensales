'use client';

import React from 'react';
import { Globe, Loader2 } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { verificarZonaHoraria, resultadoVerificacionZonaHoraria } from '@/lib/utils';
import {useInfoUsuario} from "@/components/layout/AppProviders";

export function IndicadorZonaHoraria() {
  const loading = false;
  const { zonaHoraria: zonaHorariaResidencia } = useInfoUsuario();
  if (loading) {
    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger>
                    <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                </TooltipTrigger>
                <TooltipContent>
                    <p>Verificando zona horaria...</p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
  }

  // The verification function handles null/undefined safely
  const status: resultadoVerificacionZonaHoraria = verificarZonaHoraria(zonaHorariaResidencia);

  let color = 'text-white';
  let tooltipText = 'Zona horaria no verificada.';
  let bubbleColor = 'bg-gray-500';

  switch (status) {
    case 'igual':
      tooltipText = 'La zona horaria de tu navegador coincide con la de tu residencia.';
      bubbleColor = 'bg-green-500';
      break;
    case 'diferente':
      tooltipText = 'La zona horaria de tu navegador no coincide con la de tu residencia.';
      bubbleColor = 'bg-yellow-500';
      break;
    case 'no_hay_zona_horaria_residencia':
      tooltipText = 'No hay una zona horaria de residencia configurada.';
      bubbleColor = 'bg-gray-500';
      break;
    case 'error_zona_horaria':
      tooltipText = 'Error al verificar la zona horaria del navegador.';
      bubbleColor = 'bg-red-500';
      break;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>
          <div className="flex items-center">
            <Globe className={`h-6 w-6 mt-1 ${color}`} />
            <div
                className={`
                  h-3 w-3 rounded-full -ml-2 -mt-2 ${bubbleColor}
                  border border-white/70
                `}
            />
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>{tooltipText}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}