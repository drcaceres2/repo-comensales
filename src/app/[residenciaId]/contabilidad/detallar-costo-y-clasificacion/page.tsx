'use client';

import React from 'react';

interface ContabilidadDetalleCostoPageProps {
  params: {
    residenciaId: string;
  };
}

export default function ContabilidadDetalleCostoPage({ params }: ContabilidadDetalleCostoPageProps) {
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Detallar Costo y Clasificación</h1>
      <p>Residencia ID: {params.residenciaId}</p>
      <p>Modificación de precios unitarios y centros de costo de elecciones abiertas (contablemente) y solicitadas</p>
      <p className="mt-4 text-sm text-gray-500">Este es un placeholder para la página de detalle de costos y clasificación.</p>
    </div>
  );
}
