"use client";

import React from 'react';
import { useHorariosAlmacen } from '../../_lib/useHorariosAlmacen';
import { Button } from '@/components/ui/button';

export default function Paso5Matriz() {
  const { setPasoActual } = useHorariosAlmacen();

  return (
    <div className="p-4 border rounded-md shadow-sm">
      <h2 className="text-xl font-semibold mb-4">Paso 5: Matriz de Asignación</h2>
      <p className="mb-6">Contenido del paso 5...</p>
      <div className="flex justify-between">
        <Button variant="outline" onClick={() => setPasoActual(4)}>
          Anterior
        </Button>
        <Button>
          Finalizar
        </Button>
      </div>
    </div>
  );
}
