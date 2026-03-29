'use client';

import React, { useMemo } from 'react';
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
  const fechaInicioCalendario = (calendario as { fechaInicio?: string }).fechaInicio;

  const diasCalendario = useMemo(() => {
    const fechaBase = fechaInicioCalendario || new Date().toISOString().slice(0, 10);
    const inicio = new Date(`${fechaBase}T00:00:00`);
    if (Number.isNaN(inicio.getTime())) {
      return [] as string[];
    }

    return Array.from({ length: 7 }, (_, idx) => {
      const d = new Date(inicio);
      d.setDate(inicio.getDate() + idx);
      return d.toISOString().slice(0, 10);
    });
  }, [fechaInicioCalendario]);

  const eventosPorDia = useMemo(() => {
    const salida: Record<string, Array<{ id: string; tipo: 'recordatorio' | 'cumpleanios'; titulo: string; detalle?: string }>> = {};

    for (const dia of diasCalendario) {
      salida[dia] = [];
    }

    for (const recordatorio of calendario.recordatorios ?? []) {
      const inicio = String(recordatorio.fechaInicioValidez ?? recordatorio.fechaInicio ?? '');
      const fin = String(recordatorio.fechaFinValidez ?? inicio);
      if (!inicio) {
        continue;
      }

      for (const dia of diasCalendario) {
        if (dia >= inicio && dia <= fin) {
          salida[dia].push({
            id: `r:${recordatorio.id}:${dia}`,
            tipo: 'recordatorio',
            titulo: String(recordatorio.nombre ?? 'Recordatorio'),
            detalle: inicio !== fin ? `${inicio} - ${fin}` : undefined,
          });
        }
      }
    }

    for (const cumple of calendario.cumpleanios ?? []) {
      const fecha = String(cumple.fechaCumpleanios ?? '');
      if (!salida[fecha]) {
        continue;
      }
      salida[fecha].push({
        id: `c:${cumple.id}:${fecha}`,
        tipo: 'cumpleanios',
        titulo: `${cumple.nombre} ${cumple.apellido?.slice(0, 1) ? `${cumple.apellido?.slice(0, 1)}.` : ''}`.trim(),
      });
    }

    return salida;
  }, [calendario.cumpleanios, calendario.recordatorios, diasCalendario]);

  const formatearFecha = (fechaIso: string) => {
    const fecha = new Date(`${fechaIso}T00:00:00`);
    if (Number.isNaN(fecha.getTime())) {
      return fechaIso;
    }
    const partes = new Intl.DateTimeFormat('es-ES', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).formatToParts(fecha);
    const weekday = partes.find((p) => p.type === 'weekday')?.value ?? '';
    const day = partes.find((p) => p.type === 'day')?.value ?? '';
    const month = partes.find((p) => p.type === 'month')?.value ?? '';
    const texto = `${weekday} ${day} ${month}`.trim();
    return texto ? `${texto[0].toUpperCase()}${texto.slice(1)}` : fechaIso;
  };

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
          <div className="mt-3 mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">Calendario</h3>
            <p className="text-[11px] text-gray-400">3 visibles, desliza para ver 7 días</p>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory">
            {diasCalendario.map((dia) => {
              const eventos = eventosPorDia[dia] ?? [];
              return (
                <article
                  key={dia}
                  className="min-w-[calc(33.333%-8px)] snap-start rounded-lg border bg-gray-50 p-2"
                >
                  <p className="mb-1.5 text-[11px] font-semibold text-gray-700">{formatearFecha(dia)}</p>
                  {eventos.length === 0 && (
                    <p className="text-[10px] text-gray-400">Sin eventos</p>
                  )}
                  <div className="space-y-1">
                    {eventos.map((evento) => (
                      <div
                        key={evento.id}
                        className={cn(
                          'rounded-sm px-1.5 py-0.5 text-[10px]',
                          evento.tipo === 'recordatorio'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-amber-100 text-amber-800',
                        )}
                      >
                        <p className="line-clamp-1 text-[9px]">{evento.tipo === 'recordatorio' ? '📌 ' : '🎂 '}{evento.titulo}</p>
                        {evento.detalle && (
                          <p className="mt-0.5 text-[8px] opacity-80">{evento.detalle}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </article>
              );
            })}
            </div>
        </div>
      )}
    </div>
  );
}


