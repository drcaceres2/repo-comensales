"use client";

import { ChangeEvent } from 'react';

// Se exporta el tipo para que otros componentes puedan usarlo.
export type UsuarioElegible = {
  id: string;
  nombreCompleto: string;
  rol: 'residente' | 'invitado';
};

interface BuscadorAsistidoProps {
  usuarios: UsuarioElegible[];
  onSelect: (asistidoId: string | null) => void;
  label?: string;
}

// Componentes UI Placeholder
const Label = ({ children, ...props }: any) => <label className="block text-sm font-medium text-gray-700" {...props}>{children}</label>;
const Select = ({ children, ...props }: any) => <select {...props} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-indigo-500 focus:border-indigo-500">{children}</select>;

export const BuscadorAsistido = ({
  usuarios,
  onSelect,
  label = "Usuario Asistido (quien recibe la ayuda)"
}: BuscadorAsistidoProps) => {

  const handleChange = (e: ChangeEvent<HTMLSelectElement>) => {
    onSelect(e.target.value || null);
  };

  return (
    <div className="w-full">
      <Label htmlFor="asistido-selector">{label}</Label>
      <Select id="asistido-selector" onChange={handleChange}>
        <option value="">-- Seleccione un residente o invitado --</option>
        {usuarios.map((usuario) => (
          <option key={usuario.id} value={usuario.id}>
            {`(${usuario.rol}) ${usuario.nombreCompleto}`}
          </option>
        ))}
      </Select>
    </div>
  );
};
