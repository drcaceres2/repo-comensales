'use client';

import React from 'react';

interface AdminGruposUsuariosPageProps {
  params: {
    residenciaId: string;
  };
}

export default function AdminGruposUsuariosPage({ params }: AdminGruposUsuariosPageProps) {
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Gestión de Grupos de Usuarios</h1>
      <p>Residencia ID: {params.residenciaId}</p>
      <p>CRUD de grupos de usuarios para eleccion comidas y para grupo personalizado</p>
      <p className="mt-4 text-sm text-gray-500">Este es un placeholder para la página de gestión de grupos de usuarios.</p>
    </div>
  );
}
