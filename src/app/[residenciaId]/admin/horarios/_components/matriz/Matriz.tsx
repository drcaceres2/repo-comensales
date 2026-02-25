"use client";

import { useState } from 'react';
import {
  FilaDia as FilaDiaType,
  MatrizVistaHorarios as MatrizType
} from '../../_lib/vistaModeloMapa';
import { FilaDia } from './FilaDia';
import { DrawerConfig } from './DrawerConfig';

interface MatrizProps {
  datos: MatrizType;
  mostrarInactivos: boolean;
}

export function Matriz({ datos, mostrarInactivos }: MatrizProps) {
  const [tiempoSeleccionado, setTiempoSeleccionado] = useState<string | null>(null);

  if (!datos || !datos.columnasOrdenadas || !datos.filasPorDia) {
    return <div className="text-center p-8">Cargando datos de la matriz...</div>;
  }

  return (
    <>
      <div className="overflow-x-auto relative h-full">
        <table className="min-w-full border-collapse bg-white">
          <thead className="sticky top-0 bg-gray-100 z-20">
            <tr>
              <th className="sticky left-0 bg-gray-100 z-30 p-2 w-24 min-w-[6rem] border-b border-r border-gray-300">
                Día
              </th>
              {datos.columnasOrdenadas.map((grupo) => (
                <th
                  key={grupo.id}
                  className="p-2 border-b border-gray-300 text-sm font-semibold text-gray-700 whitespace-nowrap"
                >
                  {grupo.nombre}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {datos.filasPorDia.map((fila: FilaDiaType) => (
              <FilaDia
                key={fila.dia}
                fila={fila}
                mostrarInactivos={mostrarInactivos}
                columnasCount={datos.columnasOrdenadas.length}
                onTiempoClick={setTiempoSeleccionado}
              />
            ))}
          </tbody>
        </table>
      </div>
      <DrawerConfig 
        tiempoComidaId={tiempoSeleccionado} 
        onClose={() => setTiempoSeleccionado(null)} 
      />
    </>
  );
}
