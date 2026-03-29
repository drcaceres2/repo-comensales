'use client';

import React from 'react';
import { ChevronDown } from 'lucide-react';
import { useSolicitudConsolidadaStore } from '../../_lib/store';
import { cn } from '@/lib/utils';

/**
 * Header pegajoso colapsable que muestra:
 * - Fecha operativa y total global (siempre visible)
 * - Calendario con recordatorios y cumpleaños (expandible)
 *
 * Patrón: acordeón que expande/contrae al hacer clic
 */
export default function StickyHeader() {
  const store = useSolicitudConsolidadaStore();
  const { calendario } = store.encabezado;

  const totalComensales = Object.values(store.pestana1.arbolComensales).reduce(
    (sum, tiempos) => {
      return (
        sum +
        Object.values(tiempos).reduce((timeSum, dietas) => {
          return timeSum + Object.values(dietas).reduce((dietSum, usuarios) => dietSum + usuarios.length, 0);
        }, 0)
      );
    },
    0,
  );

  return (
    <div className="sticky top-0 z-40 bg-white border-b border-gray-200 shadow-sm">
      {/* Barra compacta siempre visible */}
      <div className="px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Consolidación</h1>
          <p className="text-sm text-gray-500">Total: {totalComensales} comensales</p>
        </div>

        {/* Botón de colapso */}
        <button
          onClick={() => store.toggleEncabezadoColapsado()}
          className={cn(
            'p-2 rounded-lg transition-transform',
            store.encabezado.colapsado ? 'bg-gray-100' : 'bg-blue-50',
          )}
        >
          <ChevronDown
            size={20}
            className={cn(
              'text-gray-600 transition-transform',
              store.encabezado.colapsado ? 'rotate-180' : '',
            )}
          />
        </button>
      </div>

      {/* Sección expandible: Recordatorios + Cumpleaños */}
      {!store.encabezado.colapsado && (
        <div className="px-4 pb-4 border-t border-gray-100">
          <div className="grid grid-cols-2 gap-4 mt-3">
            {/* Recordatorios */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Recordatorios</h3>
              {calendario.recordatorios.length > 0 ? (
                <ul className="space-y-1 text-xs text-gray-600">
                  {calendario.recordatorios.map((r) => (
                    <li key={r.id} className="line-clamp-2">
                      📌 {r.nombre || r.id}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-gray-400">Sin recordatorios hoy</p>
              )}
            </div>

            {/* Cumpleaños */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Cumpleaños</h3>
              {calendario.cumpleanios.length > 0 ? (
                <ul className="space-y-1 text-xs text-gray-600">
                  {calendario.cumpleanios.map((c) => (
                    <li key={c.id} className="line-clamp-2">
                      🎂 {c.nombre} {c.apellido?.slice(0, 1)}.
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-gray-400">Sin cumpleaños hoy</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


