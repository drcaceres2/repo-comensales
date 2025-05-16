'use client';

import React from 'react';

interface ContabilidadConfiguracionPageProps {
  params: {
    residenciaId: string;
  };
}

export default function ContabilidadConfiguracionPage({ params }: ContabilidadConfiguracionPageProps) {
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Configuración de Contabilidad</h1>
      <p>Residencia ID: {params.residenciaId}</p>
      <p>CRUD centro de costo y configuración contabilidad de la residencia</p>
      <p className="mt-4 text-sm text-gray-500">Este es un placeholder para la página de configuración de contabilidad.</p>
    </div>
  );
}
