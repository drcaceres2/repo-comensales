"use client";

import { useState } from 'react';
import { useHorariosAlmacen } from '../../_lib/useHorariosAlmacen';
import { useGuardarHorarios } from '../../_lib/useHorariosQuery';
import { Matriz } from '../matriz/Matriz';
import { auditarIntegridadHorarios, Alerta, CatalogoErrores } from '../../_lib/vistaModeloMapa';
import { DrawerConfigMultiple } from '../matriz/DrawerConfigMultiple';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { AlertCircle, AlertTriangle, CircleX } from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';

export function Paso5Matriz({ residenciaIdProp }: { residenciaIdProp: string }) {
  const {
    matriz,
    alertas,
    ejecutarAuditoria,
    mostrarInactivos,
    toggleMostrarInactivos,
    setPasoActual,
    inicializarDatos,
    datosOriginales,
    datosBorrador,
    version,
    errorDeGuardado,
    setErrorDeGuardado,
  } = useHorariosAlmacen();

  const [isMultipleFormOpen, setIsMultipleFormOpen] = useState(false);
  const { toast } = useToast();
  const { mutate: guardarHorarios, isPending } = useGuardarHorarios();
  const totalErrores = alertas.filter((alerta) => CatalogoErrores[alerta.tipo].severidad === 'error').length;
  const totalAdvertencias = alertas.filter((alerta) => CatalogoErrores[alerta.tipo].severidad === 'advertencia').length;

  const [showAdvertenciaDialog, setShowAdvertenciaDialog] = useState(false);
  const [pendingGuardar, setPendingGuardar] = useState(false);
  const [showBorrarDialog, setShowBorrarDialog] = useState(false);

  // Toast resumen tras auditoría
  const handleEjecutarAuditoria = () => {
    ejecutarAuditoria();
    // Calcula el resumen tras ejecutar
    const totalErrores = alertas.filter((alerta) => CatalogoErrores[alerta.tipo].severidad === 'error').length;
    const totalAdvertencias = alertas.filter((alerta) => CatalogoErrores[alerta.tipo].severidad === 'advertencia').length;
    if (totalErrores === 0 && totalAdvertencias === 0) {
      toast({
        title: 'Auditoría completada',
        description: '¡Sin errores ni advertencias! Todo está correcto.',
        className: 'bg-green-100 text-green-900 border border-green-300',
      });
    } else if (totalErrores === 0 && totalAdvertencias > 0) {
      toast({
        title: 'Auditoría: advertencias',
        description: `Se detectaron ${totalAdvertencias} advertencia(s).`,
        className: 'bg-yellow-100 text-yellow-900 border border-yellow-300',
      });
    } else if (totalErrores > 0) {
      toast({
        title: 'Auditoría: errores críticos',
        description: `Se detectaron ${totalErrores} error(es) y ${totalAdvertencias} advertencia(s). Corrija los errores antes de guardar.`,
        className: 'bg-red-100 text-red-900 border border-red-300',
      });
    }
  };

  const handleGuardar = () => {
    setErrorDeGuardado(null); // Limpiar errores previos antes de intentar guardar
    const auditoriaResultados = auditarIntegridadHorarios(datosBorrador);

    const errores = auditoriaResultados.filter(
      (alerta) => CatalogoErrores[alerta.tipo].severidad === 'error'
    );

    if (errores.length > 0) {
      toast({
        variant: 'destructive',
        title: 'No se puede guardar',
        description: 'Hay errores críticos en la configuración. Corríjalos antes de guardar.',
      });
      return;
    }

    const advertencias = auditoriaResultados.filter(
      (alerta) => CatalogoErrores[alerta.tipo].severidad === 'advertencia'
    );

    if (advertencias.length > 0) {
      setShowAdvertenciaDialog(true);
      setPendingGuardar(true);
      return;
    }

    guardarHorarios({
      residenciaId: residenciaIdProp,
      datos: datosBorrador,
      expectedVersion: version,
    });
  };

  const handleConfirmAdvertencia = () => {
    setShowAdvertenciaDialog(false);
    setPendingGuardar(false);
    guardarHorarios({
      residenciaId: residenciaIdProp,
      datos: datosBorrador,
      expectedVersion: version,
    });
  };

  const handleCancelAdvertencia = () => {
    setShowAdvertenciaDialog(false);
    setPendingGuardar(false);
  };

  const handleBorrarTodo = () => {
    if (!datosOriginales) {
      return;
    }
    setShowBorrarDialog(true);
  };

  const handleConfirmBorrar = () => {
    setShowBorrarDialog(false);
    if (datosOriginales) {
      inicializarDatos(datosOriginales, version);
    }
  };

  const handleCancelBorrar = () => {
    setShowBorrarDialog(false);
  };

  return (
    <>
      <div className="px-1 py-3 sm:p-4 flex flex-col h-full bg-gray-50">
        <div className="mb-2 flex-shrink-0">
          <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center space-x-2 order-1">
              <Switch id="show-inactive" checked={mostrarInactivos} onCheckedChange={toggleMostrarInactivos} />
              <Label htmlFor="show-inactive">Mostrar Inactivos</Label>
            </div>
            <div className="grid grid-cols-2 gap-2 order-2">
              <button
                onClick={handleEjecutarAuditoria}
                className="bg-blue-600 text-white font-semibold text-sm py-1.5 px-3 rounded-md shadow-sm hover:bg-blue-700 transition-colors"
              >
                Auditar
              </button>
              <button
                onClick={() => setIsMultipleFormOpen(true)}
                className="bg-purple-600 text-white font-semibold text-sm py-1.5 px-3 rounded-md shadow-sm hover:bg-purple-700 transition-colors"
              >
                + Añadir Múltiples
              </button>
            </div>
          </div>

          <div className="mb-2 flex items-center gap-3 text-xs">
            <div className="inline-flex items-center gap-1 rounded-md border border-red-300 bg-red-50 px-2 py-1 text-red-700">
              <CircleX className="h-3.5 w-3.5" />
              <span>{totalErrores}</span>
            </div>
            <div className="inline-flex items-center gap-1 rounded-md border border-yellow-300 bg-yellow-50 px-2 py-1 text-yellow-800">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>{totalAdvertencias}</span>
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
            <div className="mt-2 space-y-1.5 max-h-36 overflow-y-auto">
              {alertas.map((alerta: Alerta, index) => (
                <div
                  key={index}
                  className={`px-2 py-1.5 rounded-md border text-xs leading-snug ${
                      CatalogoErrores[alerta.tipo].severidad === 'error'
                      ? 'bg-red-50 border-red-400 text-red-800'
                      : 'bg-yellow-50 border-yellow-400 text-yellow-800'
                  }`}
                >
                  <p>{alerta.mensaje}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex-grow overflow-auto">
          {matriz && <Matriz datos={matriz} mostrarInactivos={mostrarInactivos} />}
        </div>

        <div className="mt-2 pt-2 border-t border-gray-200 flex justify-between items-center flex-shrink-0">
          <button
            onClick={() => setPasoActual(4)}
            className="bg-gray-200 text-gray-700 font-semibold text-sm py-1.5 px-4 rounded-md hover:bg-gray-300 transition-colors"
          >
            Anterior
          </button>
          <button
            onClick={handleGuardar}
            disabled={isPending}
            className="bg-green-600 text-white font-semibold text-sm py-1.5 px-4 rounded-md hover:bg-green-700 shadow-sm transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {isPending ? 'Guardando...' : 'Guardar Configuración'}
          </button>
              <AlertDialog open={showAdvertenciaDialog} onOpenChange={(open) => { if (!open) handleCancelAdvertencia(); }}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Advertencias en la configuración</AlertDialogTitle>
                    <AlertDialogDescription>
                      Hay advertencias en la configuración. ¿Desea continuar de todas formas?
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel onClick={handleCancelAdvertencia}>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleConfirmAdvertencia}>Continuar y guardar</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
        </div>

        <div className="mt-2 flex-shrink-0">
          <button
            onClick={handleBorrarTodo}
            className="w-full rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-50"
          >
            Cancelar
          </button>
          <AlertDialog open={showBorrarDialog} onOpenChange={(open) => { if (!open) handleCancelBorrar(); }}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Borrar toda la configuración?</AlertDialogTitle>
                <AlertDialogDescription>
                  Se descartarán todos los cambios y volverá al paso 1. ¿Desea continuar?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={handleCancelBorrar}>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleConfirmBorrar}>Sí, borrar todo</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
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
