'use client';

import React from 'react';
import { Users, Bell, Settings } from 'lucide-react';
import { useSolicitudConsolidadaStore, type TabActiva } from '../../_lib/store';
import { cn } from '@/lib/utils';

/**
 * Navegación inferior con 3 pestañas:
 * - Comensales: Vista principal de cascada (Nivel 1, 2, 3)
 * - Novedades: Dietas, novedades operativas, alteraciones
 * - Otros: Actividades, atenciones, excepciones, solicitudes de invitados
 *
 * Sticky al pie para acceso constante.
 */
export default function BottomNav() {
  const store = useSolicitudConsolidadaStore();

  const tabs: Array<{ id: TabActiva; label: string; icon: React.ReactNode }> = [
    { id: 'comensales', label: 'Comensales', icon: <Users size={20} /> },
    { id: 'novedades', label: 'Novedades', icon: <Bell size={20} /> },
    { id: 'otros', label: 'Otros', icon: <Settings size={20} /> },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg">
      <div className="max-w-2xl mx-auto px-4 py-2 flex gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => store.setTabActiva(tab.id)}
            className={cn(
              'flex-1 flex flex-col items-center gap-1 py-2 px-3 rounded-lg transition-colors',
              store.tabActiva === tab.id
                ? 'bg-blue-50 text-blue-600 font-semibold'
                : 'bg-gray-50 text-gray-600 hover:bg-gray-100',
            )}
          >
            <div className="text-gray-400">{tab.icon}</div>
            <span className="text-xs">{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

