"use client";

import React from 'react';
import { Check } from 'lucide-react';

interface BarraProgresoProps {
  pasoActual: number;
  totalPasos?: number;
}

const pasos = [
  "Grupos",
  "Cortes",
  "Tiempos",
  "Catálogo",
  "Matriz",
];

export function BarraProgreso({ pasoActual, totalPasos = 5 }: BarraProgresoProps) {
  // Asegurarse de que el paso actual no sea menor que 1 o mayor que el total de pasos
  const pasoActualValidado = Math.max(1, Math.min(pasoActual, totalPasos));

  return (
    <div className="w-full py-4 px-2">
      <div className="flex items-center justify-between">
        {pasos.map((nombre, index) => {
          const pasoNumero = index + 1;
          const isCompletado = pasoActualValidado > pasoNumero;
          const isActual = pasoActualValidado === pasoNumero;

          return (
            <React.Fragment key={nombre}>
              <div className="flex flex-col items-center text-center">
                <div
                  className={`
                    flex items-center justify-center w-8 h-8 rounded-full text-lg font-bold transition-all duration-300
                    ${isCompletado ? 'bg-blue-600 text-white' : ''}
                    ${isActual ? 'border-2 border-blue-600 bg-white text-blue-600' : ''}
                    ${!isCompletado && !isActual ? 'border-2 border-gray-300 bg-white text-gray-400' : ''}
                  `}
                >
                  {isCompletado ? <Check className="w-5 h-5" /> : <span>{pasoNumero}</span>}
                </div>
                <p
                  className={`
                    mt-2 text-xs sm:text-sm font-medium transition-colors duration-300
                    ${isActual ? 'text-blue-600' : 'text-gray-500'}
                    ${isCompletado ? 'text-gray-600' : ''}
                  `}
                >
                  {nombre}
                </p>
              </div>

              {/* Barra de conexión */}
              {pasoNumero < totalPasos && (
                <div className={`flex-1 h-1 mx-2 rounded-full transition-colors duration-300 ${isCompletado ? 'bg-blue-600' : 'bg-gray-200'}`}></div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
