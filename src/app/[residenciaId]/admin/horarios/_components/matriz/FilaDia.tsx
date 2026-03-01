"use client";

import { useMemo } from 'react';
import { FilaDia as FilaDiaType, TiempoComidaEnriquecido, AlternativaEnriquecida } from '../../_lib/vistaModeloMapa';

interface FilaDiaProps {
  fila: FilaDiaType;
  mostrarInactivos: boolean;
  columnasCount: number;
  onTiempoClick: (tiempoId: string) => void;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function FilaDia({ fila, mostrarInactivos, columnasCount, onTiempoClick }: FilaDiaProps) {
  const cortes = fila.solicitudesDelDia
    .map((s) => s.horaSolicitud)
    .filter(Boolean)
    .join(', ');

  const celdasFiltradas = useMemo(() => {
    return fila.celdas.map(celda => {
      const tiemposFiltrados = celda.tiempos
        .filter(tiempo => mostrarInactivos || tiempo.tiempoComida.estaActivo)
        .map(tiempo => {
          const alternativasFiltradas = tiempo.alternativas.filter(alt => mostrarInactivos || alt.configuracion.estaActivo);
          return { ...tiempo, alternativas: alternativasFiltradas };
        });
      return { ...celda, tiempos: tiemposFiltrados };
    });
  }, [fila.celdas, mostrarInactivos]);

  return (
    <tr className="border-b border-gray-200">
      <td className="sticky left-0 bg-white bg-opacity-95 z-10 p-2 border-r border-gray-300 w-24 min-w-[6rem] align-top">
        <div className="font-bold text-gray-800">{capitalize(fila.dia)}</div>
        {cortes && (
          <div className="text-xs text-gray-500 mt-1">
            Cortes: {cortes}
          </div>
        )}
      </td>
      {celdasFiltradas.map((celda, index) => (
        <td key={index} className="p-2 align-top border-l border-gray-200">
          <div className="flex flex-col space-y-2">
            {celda.tiempos.length > 0 ? (
              celda.tiempos.map((tiempo: TiempoComidaEnriquecido) => (
                <div
                  key={tiempo.tiempoComida.id}
                  className={`p-2 rounded-md shadow-sm border ${tiempo.tiempoComida.estaActivo ? 'bg-white border-gray-200' : 'bg-red-50 border-red-200 opacity-70'}`}
                >
                  <div
                    onClick={() => onTiempoClick(tiempo.tiempoComida.id)}
                    className="font-semibold text-sm text-gray-900 truncate cursor-pointer hover:text-blue-600"
                  >
                    {tiempo.tiempoComida.nombre}
                  </div>
                  
                  {tiempo.alternativas.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {tiempo.alternativas.map((alternativa: AlternativaEnriquecida) => (
                        <div 
                          key={alternativa.configuracion.id}
                          className={`text-xs text-gray-800 p-1 rounded border ${alternativa.configuracion.estaActivo ? 'bg-gray-100' : 'bg-red-100'}`}
                        >
                          {alternativa.configuracion.nombre}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="text-center text-gray-400 h-full flex items-center justify-center">-</div>
            )}
          </div>
        </td>
      ))}
    </tr>
  );
}
