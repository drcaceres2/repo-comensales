"use client";

import { UIEvent, useState } from 'react';
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
  const [diaCompacto, setDiaCompacto] = useState(false);

  if (!datos || !datos.columnasOrdenadas || !datos.filasPorDia) {
    return <div className="text-center p-8">Cargando datos de la matriz...</div>;
  }

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    setDiaCompacto(event.currentTarget.scrollLeft > 8);
  };

  const clasesColumnaDia = diaCompacto
    ? 'w-[2.5rem] min-w-[2.5rem] max-w-[2.5rem] px-1 text-center'
    : 'w-auto min-w-[6.25rem] px-2 text-left';

  return (
    <>
      <div className="overflow-x-auto relative h-full" onScroll={handleScroll}>
        <table className="min-w-full border-collapse bg-white">
          <thead className="sticky top-0 bg-gray-100 z-20">
            <tr>
              <th className={`sticky left-0 bg-gray-100 z-30 py-1.5 border-b border-r border-gray-300 whitespace-nowrap transition-all duration-200 ${clasesColumnaDia}`}>
                {diaCompacto ? 'D' : 'Día'}
              </th>
              {datos.columnasOrdenadas.map((grupo) => (
                <th
                  key={grupo.id}
                  className="p-1.5 border-b border-gray-300 text-xs font-semibold text-gray-700 whitespace-nowrap"
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
                isDiaCompacto={diaCompacto}
                onTiempoClick={setTiempoSeleccionado}
              />
            ))}
          </tbody>
        </table>
      </div>
      <DrawerConfig 
        tiempoComidaId={tiempoSeleccionado} 
        onClose={() => setTiempoSeleccionado(null)}
        comedores={datos.comedores}
      />
    </>
  );
}
