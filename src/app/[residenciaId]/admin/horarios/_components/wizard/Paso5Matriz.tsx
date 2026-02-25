"use client";

import { useHorariosAlmacen } from '../../_lib/useHorariosAlmacen';
import { Matriz } from '../matriz/Matriz';
import { DatosHorariosEnBruto, auditarIntegridadHorarios, Alerta, CatalogoErrores } from '../../_lib/vistaModeloMapa';

export default function Paso5Matriz() {
  const {
    matriz,
    alertas,
    ejecutarAuditoria,
    mostrarInactivos,
    setPasoActual,
    datosBorrador,
  } = useHorariosAlmacen();

  const handleGuardar = () => {
    const auditoriaResultados = auditarIntegridadHorarios(datosBorrador);
    
    const errores = auditoriaResultados.filter(
      (alerta) => CatalogoErrores[alerta.tipo].severidad === 'error'
    );

    if (errores.length > 0) {
      alert('Hay errores críticos en la configuración. Por favor, corríjalos antes de guardar.');
      return;
    }

    const advertencias = auditoriaResultados.filter(
      (alerta) => CatalogoErrores[alerta.tipo].severidad === 'advertencia'
    );

    if (advertencias.length > 0) {
      if (!confirm('Hay advertencias en la configuración. ¿Desea continuar de todas formas?')) {
        return;
      }
    }
    
    console.log("PAYLOAD FINAL A FIREBASE:", datosBorrador);
    // Aquí iría la llamada a la mutación de TanStack Query
    alert('Configuración guardada (simulación). Revisa la consola para ver el payload.');
  };

  return (
    <div className="p-4 flex flex-col h-full bg-gray-50">
      {/* Panel de Auditoría */}
      <div className="mb-4 flex-shrink-0">
        <button
          onClick={ejecutarAuditoria}
          className="w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-lg shadow-md hover:bg-blue-700 transition-colors text-base"
        >
          Ejecutar Auditoría Global
        </button>
        {alertas.length > 0 && (
          <div className="mt-4 space-y-2">
            {alertas.map((alerta: Alerta, index) => (
              <div
                key={index}
                className={`p-3 rounded-lg border ${
                    CatalogoErrores[alerta.tipo].severidad === 'error'
                    ? 'bg-red-50 border-red-400 text-red-800'
                    : 'bg-yellow-50 border-yellow-400 text-yellow-800'
                }`}
              >
                <p className="font-bold capitalize">{alerta.tipo}</p>
                <p className="text-sm">{alerta.mensaje}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Cuerpo Principal */}
      <div className="flex-grow overflow-auto">
        {matriz && <Matriz datos={matriz} mostrarInactivos={mostrarInactivos} />}
      </div>

      {/* Navegación */}
      <div className="mt-4 pt-4 border-t border-gray-200 flex justify-between items-center flex-shrink-0">
        <button
          onClick={() => setPasoActual(4)}
          className="bg-gray-200 text-gray-700 font-bold py-2 px-6 rounded-lg hover:bg-gray-300 transition-colors"
        >
          Anterior
        </button>
        <button
          onClick={handleGuardar}
          className="bg-green-600 text-white font-bold py-2 px-6 rounded-lg hover:bg-green-700 shadow-lg transition-transform transform hover:scale-105"
        >
          Guardar Configuración Definitiva
        </button>
      </div>
    </div>
  );
}
