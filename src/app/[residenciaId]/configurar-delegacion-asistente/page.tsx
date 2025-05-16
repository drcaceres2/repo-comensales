'use client';

import React from 'react';

interface ConfigurarDelegacionAsistentePageProps {
  params: {
    residenciaId: string;
  };
}

export default function ConfigurarDelegacionAsistentePage({ params }: ConfigurarDelegacionAsistentePageProps) {
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Configurar Delegación de Asistente</h1>
      <p>Residencia ID: {params.residenciaId}</p>
      <p>Página para configurar la delegación de un usuario a un asistente.</p>
      <p className="mt-4 text-sm text-gray-500">Este es un placeholder para la página de configuración de delegación de asistente.</p>
    </div>
  );
}
