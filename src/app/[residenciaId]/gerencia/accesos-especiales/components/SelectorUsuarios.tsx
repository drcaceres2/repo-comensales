"use client";

import { ChangeEvent } from 'react';

// Asumimos una estructura básica para el objeto de usuario
type UsuarioSimple = {
  id: string;
  nombreCompleto: string;
};

interface SelectorUsuariosProps {
  usuarios: UsuarioSimple[];
  value: string | null;
  onChange: (value: string) => void;
  disabled?: boolean;
  label?: string;
  placeholder?: string;
}

// Usamos componentes placeholder para la UI, reemplázalos con tu biblioteca de componentes.
const Label = ({ children, ...props }: any) => <label className="block text-sm font-medium text-gray-700" {...props}>{children}</label>;
const Select = ({ children, ...props }: any) => <select {...props} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-200">{children}</select>;

export const SelectorUsuarios = ({
  usuarios,
  value,
  onChange,
  disabled = false,
  label = "Seleccionar Usuario",
  placeholder = "-- Seleccione un usuario --"
}: SelectorUsuariosProps) => {

  const handleChange = (e: ChangeEvent<HTMLSelectElement>) => {
    onChange(e.target.value);
  };

  return (
    <div>
      {label && <Label htmlFor="user-selector">{label}</Label>}
      <Select
        id="user-selector"
        value={value || ""}
        onChange={handleChange}
        disabled={disabled}
      >
        <option value="">{placeholder}</option>
        {usuarios.map((usuario) => (
          <option key={usuario.id} value={usuario.id}>
            {usuario.nombreCompleto}
          </option>
        ))}
      </Select>
    </div>
  );
};
