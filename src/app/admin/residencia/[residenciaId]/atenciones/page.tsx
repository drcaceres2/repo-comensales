'use client';

import React from 'react';

interface AdminAtencionesPageProps {
  params: {
    residenciaId: string;
  };
}

export default function AdminAtencionesPage({ params }: AdminAtencionesPageProps) {
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Recoger necesidades de atenciones especiales</h1>
      <p>Residencia ID: {params.residenciaId}</p>
      <p>CRUD de atenciones especiales (aperitivo, merienda, coffee break, etc.)</p>
      <p className="mt-4 text-sm text-gray-500">Este es un placeholder para la página de gestión de atenciones especiales.</p>
    </div>
  );
}
