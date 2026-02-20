'use client';

import React from 'react';

interface ContabilidadCentrosDeCostoPageProps {
  params: {
    residenciaId: string;
  };
}

export default function ContabilidadCentrosDeCostoPage({ params }: ContabilidadCentrosDeCostoPageProps) {
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Centros de Costo</h1>
      <p>Residencia ID: {params.residenciaId}</p>
      <p>Creación y gestión de Centros de Costo</p>
      <p className="mt-4 text-sm text-gray-500">Este es un placeholder para la página de centros de costo.</p>
    </div>
  );
}
