'use client';

import React, { useEffect, useState } from 'react';
import { Loader2, Zap } from 'lucide-react';

/**
 * Componente visual de progreso mientras el Engine calcula el borrador.
 *
 * Simulación de progreso lineal con mensajes dinámicos que representan
 * las fases de cálculo:
 * - Lectura de actividades
 * - Aplicando cascada
 * - Generando borrador
 * - Completado
 *
 * No es polling real; es una progresión visual suave para mejorar UX.
 */
export default function EngineProgress() {
  const [progress, setProgress] = useState(0);
  const [messageIndex, setMessageIndex] = useState(0);

  const messages = [
    'Leyendo configuración...',
    'Cruzando actividades...',
    'Detectando ausencias...',
    'Aplicando cascada...',
    'Generando borrador...',
    '¡Listo!',
  ];

  // Simulación de progreso
  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 95) return 95;
        return prev + Math.random() * 15;
      });
    }, 400);

    return () => clearInterval(interval);
  }, []);

  // Actualizar mensaje cada vez que progreso avanza
  useEffect(() => {
    const nextIndex = Math.floor((progress / 100) * (messages.length - 1));
    setMessageIndex(Math.min(nextIndex, messages.length - 1));
  }, [progress, messages.length]);

  return (
    <div className="flex flex-col items-center justify-center w-full h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
      {/* Animación de logo/icono */}
      <div className="mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100">
          <Zap className="text-blue-600 animate-pulse" size={32} />
        </div>
      </div>

      {/* Título */}
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Generando Consolidación</h1>
      <p className="text-sm text-gray-600 mb-8">El tablero se cargará en momentos...</p>

      {/* Barra de progreso */}
      <div className="w-72 bg-gray-200 rounded-full h-2 overflow-hidden shadow-sm">
        <div
          className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-300 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Porcentaje y mensaje */}
      <div className="mt-6 text-center">
        <p className="text-3xl font-bold text-blue-600 mb-2">{Math.floor(progress)}%</p>
        <div className="flex items-center gap-2 justify-center min-h-6">
          <Loader2 size={16} className="text-blue-500 animate-spin" />
          <p className="text-sm text-gray-700 font-medium">{messages[messageIndex]}</p>
        </div>
      </div>

      {/* Tips de ayuda */}
      <div className="mt-12 max-w-md text-center">
        <p className="text-xs text-gray-500">
          💡 Mientras esperas, verifica que todos los pendientes fueron resueltos en la bandeja de entrada.
        </p>
      </div>
    </div>
  );
}

