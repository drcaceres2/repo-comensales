"use client";

import React from 'react';
import { useHorariosAlmacen } from '../../_lib/useHorariosAlmacen';
import { Button } from '@/components/ui/button';

export default function Paso3Tiempos() {
  const { setPasoActual } = useHorariosAlmacen();

  return (
    <div className="p-4 border rounded-md shadow-sm">
      <h2 className="text-xl font-semibold mb-4">Paso 3: Tiempos de Servicio</h2>
      <p className="mb-6">Contenido del paso 3...</p>
      <div className="flex justify-between">
        <Button variant="outline" onClick={() => setPasoActual(2)}>
          Anterior
        </Button>
        <Button onClick={() => setPasoActual(4)}>
          Siguiente
        </Button>
      </div>
    </div>
  );
}
