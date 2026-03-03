"use client";

import { useState, ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

interface CategoriaPermisosAcordeonProps {
  titulo: string;
  children: ReactNode;
  defaultOpen?: boolean;
}

export const CategoriaPermisosAcordeon = ({
  titulo,
  children,
  defaultOpen = false,
}: CategoriaPermisosAcordeonProps) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border rounded-lg">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex justify-between items-center p-4 bg-gray-50 hover:bg-gray-100 focus:outline-none"
      >
        <h2 className="text-lg font-semibold">{titulo}</h2>
        <ChevronDown
          className={`transform transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          size={20}
        />
      </button>
      {isOpen && (
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {children}
        </div>
      )}
    </div>
  );
};
