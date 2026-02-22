"use client";

import React from 'react';
import { useHorariosAlmacen } from '../../_lib/useHorariosAlmacen';
import { Button } from '@/components/ui/button';

export default function Paso4Catalogo() {
  const { setPasoActual } = useHorariosAlmacen();

  return (
    <div className="p-4 border rounded-md shadow-sm">
      <h2 className="text-xl font-semibold mb-4">Paso 4: Catálogo de Horarios</h2>
      <p className="mb-6">Contenido del paso 4...</p>
      <div className="flex justify-between">
        <Button variant="outline" onClick={() => setPasoActual(3)}>
          Anterior
        </Button>
        <Button onClick={() => setPasoActual(5)}>
          Siguiente
        </Button>
      </div>
    </div>
  );
}
