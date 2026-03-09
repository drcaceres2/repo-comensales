"use client";

import { useMemo } from 'react';
import { FilaDia as FilaDiaType, TiempoComidaEnriquecido, AlternativaEnriquecida } from '../../_lib/vistaModeloMapa';

interface FilaDiaProps {
  fila: FilaDiaType;
  mostrarInactivos: boolean;
  isDiaCompacto: boolean;
  onTiempoClick: (tiempoId: string) => void;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const inicialDia = (dia: string) => capitalize(dia).charAt(0);

export function FilaDia({ fila, mostrarInactivos, isDiaCompacto, onTiempoClick }: FilaDiaProps) {
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

  const clasesColumnaDia = isDiaCompacto
    ? 'w-[2.5rem] min-w-[2.5rem] max-w-[2.5rem] px-1 text-center'
    : 'w-auto min-w-[6.25rem] px-2 text-left';

  return (
    <tr className="border-b border-gray-200">
      <td className={`sticky left-0 bg-white bg-opacity-95 z-10 py-1.5 border-r border-gray-300 align-top transition-all duration-200 ${clasesColumnaDia}`}>
        <div className="font-bold text-gray-800 whitespace-nowrap">{isDiaCompacto ? inicialDia(fila.dia) : capitalize(fila.dia)}</div>
        {!isDiaCompacto && cortes && (
          <div className="text-[11px] text-gray-500 mt-0.5 leading-tight">
            Cortes: {cortes}
          </div>
        )}
      </td>
      {celdasFiltradas.map((celda, index) => (
        <td key={index} className="p-1 align-top border-l border-gray-200">
          <div className="flex flex-col space-y-1">
            {celda.tiempos.length > 0 ? (
              celda.tiempos.map((tiempo: TiempoComidaEnriquecido) => (
                <div
                  key={tiempo.tiempoComida.id}
                  className={`p-1.5 rounded-md shadow-sm border ${tiempo.tiempoComida.estaActivo ? 'bg-white border-gray-200' : 'bg-red-50 border-red-200 opacity-70'}`}
                >
                  <div
                    onClick={() => onTiempoClick(tiempo.tiempoComida.id)}
                    className="font-semibold text-sm text-gray-900 truncate cursor-pointer hover:text-blue-600"
                  >
                    {tiempo.tiempoComida.nombre}
                  </div>
                  
                  {tiempo.alternativas.length > 0 && (
                    <div className="mt-1 space-y-0.5">
                      {tiempo.alternativas.map((alternativa: AlternativaEnriquecida) => (
                        <div 
                          key={alternativa.configuracion.id}
                          className={`text-[11px] text-gray-800 px-1 py-0.5 rounded border ${alternativa.configuracion.estaActivo ? 'bg-gray-100' : 'bg-red-100'}`}
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
