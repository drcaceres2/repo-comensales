'use client';

import React from 'react';

interface EleccionesInvitadosPageProps {
  params: {
    residenciaId: string;
  };
}

export default function EleccionesInvitadosPage({ params }: EleccionesInvitadosPageProps) {
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Elección de horarios de comida de un Invitado</h1>
      <p>Residencia ID: {params.residenciaId}</p>
      <p>Elección de comidas por parte de invitados o asistentes: calendario según fechas de invitado (puede venir varias veces, son fechas elegidas en el formulario</p>
      <p className="mt-4 text-sm text-gray-500">Este es un placeholder para la página de elección de comidas para invitados.</p>
    </div>
  );
}
