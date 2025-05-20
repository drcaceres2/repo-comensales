'use client';

import React from 'react';

interface ContabilidadReporteCostosPageProps {
  params: {
    residenciaId: string;
  };
}

export default function ContabilidadReporteCostosPage({ params }: ContabilidadReporteCostosPageProps) {
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Reporte de Costos</h1>
      <p>Residencia ID: {params.residenciaId}</p>
      <p>Calcular a base de comensalesContabilizados</p>
      <p className="mt-4 text-sm text-gray-500">Este es un placeholder para la página de reporte de costos.</p>
    </div>
  );
}
