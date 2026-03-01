"use client";

import { useState } from 'react';
import { useHorariosAlmacen } from '../../_lib/useHorariosAlmacen';
import { useGuardarHorarios } from '../../_lib/useHorariosQuery';
import { Matriz } from '../matriz/Matriz';
import { auditarIntegridadHorarios, Alerta, CatalogoErrores } from '../../_lib/vistaModeloMapa';
import { DrawerConfigMultiple } from '../matriz/DrawerConfigMultiple';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { AlertCircle } from 'lucide-react';

export function Paso5Matriz({ residenciaIdProp }: { residenciaIdProp: string }) {
  const {
    matriz,
    alertas,
    ejecutarAuditoria,
    mostrarInactivos,
    toggleMostrarInactivos,
    setPasoActual,
    datosBorrador,
    version,
    errorDeGuardado,
    setErrorDeGuardado,
  } = useHorariosAlmacen();

  const [isMultipleFormOpen, setIsMultipleFormOpen] = useState(false);
  const { mutate: guardarHorarios, isPending } = useGuardarHorarios();

  const handleGuardar = () => {
    setErrorDeGuardado(null); // Limpiar errores previos antes de intentar guardar
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
    
    guardarHorarios({
      residenciaId: residenciaIdProp,
      datos: datosBorrador,
      expectedVersion: version,
    });
  };

  return (
    <>
      <div className="p-4 flex flex-col h-full bg-gray-50">
        <div className="mb-4 flex-shrink-0">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center space-x-2">
              <Switch id="show-inactive" checked={mostrarInactivos} onCheckedChange={toggleMostrarInactivos} />
              <Label htmlFor="show-inactive">Mostrar Inactivos</Label>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={ejecutarAuditoria}
                className="bg-blue-600 text-white font-bold py-2 px-4 rounded-lg shadow-md hover:bg-blue-700 transition-colors"
              >
                Auditar
              </button>
              <button
                onClick={() => setIsMultipleFormOpen(true)}
                className="bg-purple-600 text-white font-bold py-2 px-4 rounded-lg shadow-md hover:bg-purple-700 transition-colors"
              >
                + Añadir Múltiples
              </button>
            </div>
          </div>
          
          {errorDeGuardado && (
            <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4" role="alert">
              <div className="flex">
                <div className="py-1"><AlertCircle className="h-6 w-6 text-red-500 mr-4" /></div>
                <div>
                  <p className="font-bold">Error al Guardar</p>
                  <p className="text-sm">{errorDeGuardado}</p>
                </div>
              </div>
            </div>
          )}

          {alertas.length > 0 && (
            <div className="mt-4 space-y-2 max-h-48 overflow-y-auto">
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

        <div className="flex-grow overflow-auto">
          {matriz && <Matriz datos={matriz} mostrarInactivos={mostrarInactivos} />}
        </div>

        <div className="mt-4 pt-4 border-t border-gray-200 flex justify-between items-center flex-shrink-0">
          <button
            onClick={() => setPasoActual(4)}
            className="bg-gray-200 text-gray-700 font-bold py-2 px-6 rounded-lg hover:bg-gray-300 transition-colors"
          >
            Anterior
          </button>
          <button
            onClick={handleGuardar}
            disabled={isPending}
            className="bg-green-600 text-white font-bold py-2 px-6 rounded-lg hover:bg-green-700 shadow-lg transition-transform transform hover:scale-105 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {isPending ? 'Guardando...' : 'Guardar Configuración'}
          </button>
        </div>
      </div>
      <DrawerConfigMultiple
        isOpen={isMultipleFormOpen}
        onClose={() => setIsMultipleFormOpen(false)}
        comedores={matriz?.comedores || []}
      />
    </>
  );
}
