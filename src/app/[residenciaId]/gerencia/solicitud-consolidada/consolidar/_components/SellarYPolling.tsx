'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { Loader2, CheckCircle2, AlertTriangle, Download, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { functions, httpsCallable } from '@/lib/firebase';
import { useSolicitudConsolidadaStore, type TipoComunicacionPatch } from '../../_lib/store';
import type {
  SellarSolicitudConsolidadaPayload,
  SellarSolicitudConsolidadaResult,
} from 'shared/schemas/solicitudConsolidada.schema';

/**
 * Componente de cierre atómico (Fase 5).
 *
 * Flujo:
 * 1. Chequea actividades con consolidacion_obligatoria sin DEFINITIVA → pide confirmación → marca como CANCELACION
 * 2. Doble confirmación irreversible
 * 3. Invoca httpsCallable sellarSolicitudConsolidada
 * 4. Activa polling de estadoGeneracionPdf (vía usePollingEstadoPdf en page)
 * 5. Muestra enlace de descarga PDF al completar
 */
export default function SellarYPolling() {
  const store = useSolicitudConsolidadaStore();
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showSealConfirm, setShowSealConfirm] = useState(false);
  const [errorSellado, setErrorSellado] = useState<string | null>(null);

  const inclusion = store.inclusionEntidades;

  // Detectar actividades con consolidacion_obligatoria que NO tienen DEFINITIVA
  const actividadesSinDefinitiva = useMemo(() => {
    const actividadesIncluidas = (store.pestana3.actividades ?? []).filter((item: any) => {
      const key = `actividad:${String(item?.id ?? '')}`;
      return inclusion[key] ?? true;
    });

    return actividadesIncluidas.filter((item: any) => {
      const antelacion = String(item?.antelacion ?? '');
      if (antelacion !== 'consolidacion_obligatoria') return false;
      const patch = store.actividadPatches[String(item?.id ?? '')];
      return patch !== 'DEFINITIVA';
    });
  }, [store.pestana3.actividades, store.actividadPatches, inclusion]);

  // Construir payload deduciendo todo lo posible del store
  const buildPayload = useCallback((): SellarSolicitudConsolidadaPayload => {
    const { residenciaId, solicitudId, actividadPatches, pestana2, pestana3, inclusionEntidades } = 
      useSolicitudConsolidadaStore.getState();

    // Actividades incluidas con sus patches
    const actividadPatchesArray = (pestana3.actividades ?? [])
      .filter((item: any) => {
        const key = `actividad:${String(item?.id ?? '')}`;
        return inclusionEntidades[key] ?? true;
      })
      .map((item: any) => {
        const actividadId = String(item?.id ?? '');
        const tipo = actividadPatches[actividadId];
        if (!tipo) return null;
        return { actividadId, tipoComunicacion: tipo };
      })
      .filter((item): item is { actividadId: string; tipoComunicacion: TipoComunicacionPatch } => item !== null);

    // Atenciones incluidas
    const atencionIds = (pestana3.atenciones ?? [])
      .filter((item: any) => {
        const key = `atencion:${String(item?.id ?? '')}`;
        return inclusionEntidades[key] ?? true;
      })
      .map((item: any) => String(item?.id ?? ''))
      .filter((id: string) => id.length > 0);

    // Alteraciones de pestana2
    const alteracionIds = (pestana2.alteraciones ?? [])
      .map((item: any) => String(item?.id ?? ''))
      .filter((id: string) => id.length > 0);

    // Novedades de pestana2
    const novedadIds = (pestana2.novedades ?? [])
      .map((item: any) => String(item?.id ?? ''))
      .filter((id: string) => id.length > 0);

    return {
      residenciaId: residenciaId!,
      solicitudId: solicitudId!,
      expectedEstadoDocumento: 'BORRADOR' as const,
      actividadPatches: actividadPatchesArray,
      atencionIds,
      alteracionIds,
      novedadIds,
    };
  }, []);

  async function handleSellar() {
    setShowSealConfirm(false);
    setErrorSellado(null);
    store.setEstadoSellado('sellando');

    try {
      const payload = buildPayload();
      const callable = httpsCallable<SellarSolicitudConsolidadaPayload, SellarSolicitudConsolidadaResult>(
        functions,
        'sellarSolicitudConsolidada',
      );
      await callable(payload);
      store.setEstadoSellado('sellado');
    } catch (err: any) {
      store.setEstadoSellado('idle');
      setErrorSellado(err?.message || 'Error al sellar la solicitud consolidada.');
    }
  }

  function handleIniciarSellado() {
    setErrorSellado(null);

    // Paso 1: Verificar actividades con consolidacion_obligatoria sin DEFINITIVA
    if (actividadesSinDefinitiva.length > 0) {
      setShowCancelConfirm(true);
      return;
    }

    // Paso 2: Directo a confirmación final
    setShowSealConfirm(true);
  }

  function handleConfirmarCancelaciones() {
    // Forzar CANCELACION en las actividades obligatorias no marcadas
    for (const item of actividadesSinDefinitiva) {
      store.setActividadPatch(String(item?.id ?? ''), 'CANCELACION');
    }
    setShowCancelConfirm(false);

    // Ir a la confirmación final
    setShowSealConfirm(true);
  }

  const { estadoSellado, urlPdfDescarga } = store;

  return (
    <div className="space-y-3">
      {/* Botón principal */}
      {estadoSellado === 'idle' && (
        <Button
          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold h-12 text-base"
          onClick={handleIniciarSellado}
          disabled={!store.residenciaId || !store.solicitudId}
        >
          🔒 CONSOLIDAR DÍA
        </Button>
      )}

      {/* Estado: Sellando */}
      {estadoSellado === 'sellando' && (
        <div className="flex items-center justify-center gap-3 rounded-xl border bg-amber-50 p-4">
          <Loader2 className="h-5 w-5 animate-spin text-amber-600" />
          <span className="text-sm font-medium text-amber-800">Sellando solicitud…</span>
        </div>
      )}

      {/* Estado: Sellado, esperando PDF */}
      {(estadoSellado === 'sellado' || estadoSellado === 'pdf_generando') && (
        <div className="flex items-center justify-center gap-3 rounded-xl border bg-blue-50 p-4">
          <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
          <div>
            <p className="text-sm font-medium text-blue-800">¡Consolidación exitosa!</p>
            <p className="text-xs text-blue-600">Generando PDF y enviando email…</p>
          </div>
        </div>
      )}

      {/* Estado: PDF completado */}
      {estadoSellado === 'pdf_completado' && (
        <div className="space-y-2 rounded-xl border bg-emerald-50 p-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <p className="text-sm font-semibold text-emerald-800">
              Consolidación completada
            </p>
          </div>
          <p className="text-xs text-emerald-700">
            El PDF fue generado y enviado por email al consolidador.
          </p>
          {urlPdfDescarga && (
            <a
              href={urlPdfDescarga}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 mt-1"
            >
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-1" />
                Descargar PDF
              </Button>
            </a>
          )}
        </div>
      )}

      {/* Estado: Error en PDF */}
      {estadoSellado === 'pdf_error' && (
        <div className="flex items-center gap-2 rounded-xl border bg-red-50 p-4">
          <XCircle className="h-5 w-5 text-red-600" />
          <div>
            <p className="text-sm font-semibold text-red-800">
              La consolidación se completó pero hubo un error generando el PDF
            </p>
            <p className="text-xs text-red-600">
              Los datos fueron sellados correctamente. El PDF puede regenerarse manualmente.
            </p>
          </div>
        </div>
      )}

      {/* Error de sellado */}
      {errorSellado && estadoSellado === 'idle' && (
        <div className="flex items-start gap-2 rounded-xl border bg-red-50 p-3">
          <AlertTriangle className="h-4 w-4 mt-0.5 text-red-600 shrink-0" />
          <p className="text-xs text-red-700">{errorSellado}</p>
        </div>
      )}

      {/* Dialog: Actividades con consolidación obligatoria sin DEFINITIVA */}
      <AlertDialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              Actividades sin comunicación definitiva
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Las siguientes actividades requieren comunicación definitiva pero no han sido
                  marcadas. Si continúas, serán <strong>canceladas</strong> automáticamente:
                </p>
                <ul className="list-disc pl-5 space-y-1">
                  {actividadesSinDefinitiva.map((item: any) => (
                    <li key={String(item?.id)} className="text-sm">
                      <strong>{item?.titulo ?? item?.nombreActividad ?? item?.id}</strong>
                    </li>
                  ))}
                </ul>
                <p className="text-amber-700 font-medium">
                  ¿Deseas cancelar estas actividades y continuar con el sellado?
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Volver y revisar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmarCancelaciones}
              className="bg-amber-600 hover:bg-amber-700"
            >
              Cancelar actividades y continuar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog: Confirmación final irreversible */}
      <AlertDialog open={showSealConfirm} onOpenChange={setShowSealConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>⚠️ Confirmación irreversible</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Estás a punto de <strong>consolidar definitivamente</strong> esta solicitud.
                  Esta acción es irreversible y:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-sm">
                  <li>Blinda los números legal y financieramente</li>
                  <li>Cierra inscripciones de actividades con comunicación definitiva</li>
                  <li>Genera un PDF formal y lo envía por email</li>
                </ul>
                <p className="font-medium">
                  ¿Confirmas que deseas consolidar el día?
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleSellar}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              Sí, consolidar definitivamente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}



