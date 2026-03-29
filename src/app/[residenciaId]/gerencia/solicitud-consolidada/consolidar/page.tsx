'use client';

import React, { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { UserCog, Cloud, CloudOff, Check } from 'lucide-react';
import { useSolicitudConsolidadaStore } from '../_lib/store';
import {
  useFase3SolicitudConsolidada,
  useDebouncedBorradorSync,
  usePollingEstadoPdf,
} from '../_lib/queries';
import StickyHeader from './_components/StickyHeader';
import BottomNav from './_components/BottomNav';
import EngineProgress from './_components/EngineProgress';
import MainAccordion from './_components/MainAccordion';
import OtrosInboxTab from './_components/OtrosInboxTab';
import BottomSheetAjustes from './_components/BottomSheetAjustes';
import SellarYPolling from './_components/SellarYPolling';

/**
 * Contenedor principal del Wizard de solicitud consolidada.
 *
 * Flujo:
 * 1. Fase 0: Triage (Inbox Zero) - lista de pendientes
 * 2. Fase 2: Engine Progress - cálculo del motor de cascada
 * 3. Fase 3: Tablero principal con Bottom Navigation
 * 4. Fase 4: Ajustes en caliente (BottomSheet)
 * 5. Fase 5: Cierre atómico (SellarYPolling)
 *
 * Integra:
 * - useDebouncedBorradorSync: persiste overrides cada 3s de inactividad
 * - usePollingEstadoPdf: polling del estado de generación del PDF tras sellar
 * - BottomSheetAjustes: buscador predictivo de residentes
 * - SellarYPolling: botón de cierre + doble confirmación + polling + descarga
 */
export default function SolicitudConsolidadaPage() {
  const params = useParams<{ residenciaId: string }>();
  const residenciaId = params?.residenciaId || null;

  const store = useSolicitudConsolidadaStore();
  const setContexto = useSolicitudConsolidadaStore((s) => s.setContexto);
  const reset = useSolicitudConsolidadaStore((s) => s.reset);
  const { data: fase3Data, isLoading: loadingFase3 } = useFase3SolicitudConsolidada(
    residenciaId,
  );

  // Debouncer: sincroniza overrides con Firestore cada 3s
  const { isSyncing, syncError } = useDebouncedBorradorSync();

  // Polling: consulta estado del PDF tras sellar
  usePollingEstadoPdf();

  // Inicializar contexto en el store
  useEffect(() => {
    if (residenciaId && fase3Data) {
      const horarioId = String(fase3Data.selectedHorarioSolicitudId ?? 'placeholder');
      setContexto(residenciaId, `${new Date().toISOString().split('T')[0]}__${horarioId}`);
    }
  }, [residenciaId, fase3Data, setContexto]);

  // Limpiar store al desmontar el componente para evitar fugas de memoria
  useEffect(() => {
    return () => {
      reset();
    };
  }, [reset]);

  // Mientras se cargan los datos de la Fase 3, mostrar loader
  if (loadingFase3) {
    return <EngineProgress />;
  }

  // Si hay error, mostrar mensaje
  if (store.errorCarga) {
    return (
      <div className="flex items-center justify-center w-full h-screen bg-red-50">
        <div className="text-center">
          <h2 className="text-xl font-bold text-red-700 mb-2">Error de Carga</h2>
          <p className="text-red-600">{store.errorCarga}</p>
        </div>
      </div>
    );
  }

  // Si no hay datos, mostrar placeholder
  if (!fase3Data) {
    return (
      <div className="flex items-center justify-center w-full h-screen bg-gray-50">
        <div className="text-center">
          <p className="text-gray-600">Preparando datos...</p>
        </div>
      </div>
    );
  }

  const yaConsolidado =
    store.estadoSellado === 'pdf_completado' ||
    store.estadoSellado === 'pdf_error' ||
    store.estadoSellado === 'sellado' ||
    store.estadoSellado === 'pdf_generando' ||
    store.estadoSellado === 'sellando';

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header pegajoso colapsable */}
      <StickyHeader />

      {/* Indicador de sincronización */}
      <div className="px-4 pt-1">
        <div className="flex items-center justify-between">
          {/* Sync indicator */}
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            {isSyncing && (
              <>
                <Cloud className="h-3.5 w-3.5 animate-pulse text-blue-500" />
                <span className="text-blue-500">Guardando…</span>
              </>
            )}
            {!isSyncing && store.dirty && (
              <>
                <CloudOff className="h-3.5 w-3.5 text-amber-500" />
                <span className="text-amber-500">Cambios sin guardar</span>
              </>
            )}
            {!isSyncing && !store.dirty && store.overrides.length > 0 && (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-500" />
                <span className="text-emerald-500">Guardado ✓</span>
              </>
            )}
            {syncError && (
              <span className="text-red-500 text-[10px] ml-2">Error al sincronizar</span>
            )}
          </div>

          {/* Override count */}
          {store.overrides.length > 0 && (
            <span className="text-[10px] text-gray-400">
              {store.overrides.length} ajuste{store.overrides.length !== 1 ? 's' : ''} aplicado{store.overrides.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Contenido principal con tab activa */}
      <main className="flex-1 overflow-y-auto pb-36 px-4 pt-3">
        {store.tabActiva === 'comensales' && (
          <div className="space-y-3">
            <h2 className="text-lg font-bold mb-4">Comensales por Tiempo de Comida</h2>
            <p className="text-sm text-gray-500">
              Vista de 3 niveles: Tiempo Comida → Alternativa → Dieta
            </p>
            <MainAccordion />
          </div>
        )}

        {store.tabActiva === 'novedades' && (
          <div>
            <h2 className="text-lg font-bold mb-4">Novedades y Comunicación</h2>
            <p className="text-sm text-gray-500">Dietas, Novedades Operativas y Alteraciones</p>
            {/* TODO: Implementar componente de novedades */}
          </div>
        )}

        {store.tabActiva === 'otros' && (
          <div className="space-y-3">
            <h2 className="text-lg font-bold mb-4">Otros Elementos</h2>
            <p className="text-sm text-gray-500">
              Actividades (Radar, Cierre, Cancelación), Atenciones, Excepciones
            </p>
            <OtrosInboxTab />
          </div>
        )}

        {/* Separador antes del botón de sellado */}
        <div className="mt-6 border-t pt-4">
          <SellarYPolling />
        </div>
      </main>

      {/* FAB para abrir Bottom Sheet de ajustes */}
      {!yaConsolidado && (
        <button
          onClick={() => store.toggleBottomSheet()}
          className="fixed right-4 bottom-20 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg transition-transform hover:scale-105 hover:bg-blue-700 active:scale-95"
          aria-label="Ajustes en caliente"
        >
          <UserCog className="h-6 w-6" />
        </button>
      )}

      {/* Bottom Sheet de ajustes */}
      <BottomSheetAjustes />

      {/* Bottom Navigation (Sticky) */}
      <BottomNav />
    </div>
  );
}

