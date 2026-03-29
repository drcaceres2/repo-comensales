'use client';

import React, { useMemo } from 'react';
import { ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useSolicitudConsolidadaStore } from '../../_lib/store';

type DietMap = Record<string, string[]>;
type AltMap = Record<string, DietMap>;

function capitalizar(texto: string): string {
  return texto ? `${texto[0].toUpperCase()}${texto.slice(1)}` : texto;
}

function formatearFecha(fechaIso: string): string {
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

  return capitalizar(`${weekday} ${day} ${month}`.trim());
}

function resolveAlternativaId(usuario: any, fecha: string, tiempoComidaId: string): string {
  const byFechaTiempo = usuario?.alternativasPorFecha?.[fecha]?.[tiempoComidaId];
  if (typeof byFechaTiempo === 'string' && byFechaTiempo) {
    return byFechaTiempo;
  }

  const byTiempo = usuario?.alternativasPorTiempoComida?.[tiempoComidaId];
  if (typeof byTiempo === 'string' && byTiempo) {
    return byTiempo;
  }

  return 'alternativa_no_determinada';
}

export default function MainAccordion() {
  const store = useSolicitudConsolidadaStore();
  const arbol = store.pestana1.arbolComensales;
  const usuarios = store.pestana1.usuariosDiccionario;
  const tiempoComidaNombres = store.pestana1.tiempoComidaNombres;
  const alternativaNombres = store.pestana1.alternativaNombres;

  // Debug: mostrar mapas disponibles
  React.useEffect(() => {
    console.log('[MainAccordion] tiempoComidaNombres:', tiempoComidaNombres);
    console.log('[MainAccordion] alternativaNombres:', alternativaNombres);
    console.log('[MainAccordion] usuariosDiccionario keys:', Object.keys(usuarios));
  }, [tiempoComidaNombres, alternativaNombres, usuarios]);

  const fechas = useMemo(() => Object.keys(arbol).sort(), [arbol]);

  if (fechas.length === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-white p-6 text-sm text-gray-500">
        No hay comensales para mostrar en este borrador.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {fechas.map((fecha) => {
        const tiempos = arbol[fecha] ?? {};
        const tiempoIds = Object.keys(tiempos).sort();

        return (
          <section key={fecha} className="rounded-xl border bg-white p-3">
            <h3 className="mb-3 text-sm font-semibold text-gray-700">{formatearFecha(fecha)}</h3>

            <div className="space-y-2">
              {tiempoIds.map((tiempoComidaId) => {
                const dietsMap = tiempos[tiempoComidaId] ?? {};
                const tiempoKey = `t:${fecha}:${tiempoComidaId}`;
                const openTiempo = store.arbolComensalesExpandido.has(tiempoKey);

                const totalTiempo = Object.values(dietsMap).reduce((acc, arr) => acc + (arr?.length ?? 0), 0);

                // Se crea un nivel 2 sintético por alternativa a partir de la info del usuario.
                const alternativas: AltMap = {};
                for (const [dietaId, userIds] of Object.entries(dietsMap)) {
                  for (const uid of userIds) {
                    const usuario = usuarios[uid];
                    const altId = resolveAlternativaId(usuario, fecha, tiempoComidaId);
                    console.log(`[MainAccordion] Usuario ${uid} (${usuario?.nombre}), Fecha: ${fecha}, Tiempo: ${tiempoComidaId}, Dieta: ${dietaId}, AltId: ${altId}`);
                    alternativas[altId] = alternativas[altId] ?? {};
                    alternativas[altId][dietaId] = alternativas[altId][dietaId] ?? [];
                    alternativas[altId][dietaId].push(uid);
                  }
                }

                return (
                  <div key={tiempoKey} className="rounded-lg border">
                    <button
                      className="flex w-full items-center justify-between px-3 py-2 text-left"
                      onClick={() => store.toggleComensalExpandido(tiempoKey)}
                    >
                      <div>
                        <p className="text-sm font-medium">{tiempoComidaNombres[tiempoComidaId] ?? tiempoComidaId}</p>
                        <p className="text-xs text-gray-500">Nivel 1: tiempo de comida</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{totalTiempo}</Badge>
                        <ChevronDown className={cn('h-4 w-4 transition-transform', openTiempo && 'rotate-180')} />
                      </div>
                    </button>

                    {openTiempo && (
                      <div className="space-y-2 border-t p-2">
                        {Object.entries(alternativas).map(([altId, dietasAlt]) => {
                          const altKey = `a:${fecha}:${tiempoComidaId}:${altId}`;
                          const openAlt = store.arbolComensalesExpandido.has(altKey);
                          const totalAlt = Object.values(dietasAlt).reduce((acc, ids) => acc + ids.length, 0);

                          return (
                            <div key={altKey} className="rounded-md border">
                              <button
                                className="flex w-full items-center justify-between px-3 py-2 text-left"
                                onClick={() => store.toggleComensalExpandido(altKey)}
                              >
                                <div>
                                  <p className="text-sm">{alternativaNombres[altId] ?? altId}</p>
                                  <p className="text-xs text-gray-500">Nivel 2: alternativa</p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline">{totalAlt}</Badge>
                                  <ChevronDown className={cn('h-4 w-4 transition-transform', openAlt && 'rotate-180')} />
                                </div>
                              </button>

                              {openAlt && (
                                <div className="space-y-1 border-t p-2">
                                  {Object.entries(dietasAlt).map(([dietaId, ids]) => (
                                    <div
                                      key={`${altKey}:${dietaId}`}
                                      className="flex items-center justify-between rounded bg-gray-50 px-2 py-1"
                                    >
                                      <div>
                                        <p className="text-sm">{dietaId}</p>
                                        <p className="text-xs text-gray-500">Nivel 3: dieta</p>
                                      </div>
                                      <Badge>{ids.length}</Badge>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

