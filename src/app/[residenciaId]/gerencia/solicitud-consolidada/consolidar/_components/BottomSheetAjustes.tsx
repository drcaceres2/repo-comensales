'use client';

import React, { useState, useMemo } from 'react';
import { Search, X, UserCog } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useSolicitudConsolidadaStore } from '../../_lib/store';

/**
 * Bottom Sheet de ajustes "en caliente" (Fase 4).
 *
 * Buscador predictivo de usuarios → selección de usuario →
 * cambio forzado de alternativa/dieta por tiempo de comida →
 * despacha addOverride al store Zustand (mutación local inmediata,
 * persitencia en segundo plano vía debouncer).
 */
export default function BottomSheetAjustes() {
  const store = useSolicitudConsolidadaStore();
  const [busqueda, setBusqueda] = useState('');
  const [usuarioSeleccionado, setUsuarioSeleccionado] = useState<string | null>(null);
  const [tiempoComidaSeleccionado, setTiempoComidaSeleccionado] = useState<string>('');
  const [nuevaAlternativaId, setNuevaAlternativaId] = useState<string>('');
  const [nuevaDietaId, setNuevaDietaId] = useState<string>('');

  const usuarios = store.pestana1.usuariosDiccionario;
  const arbol = store.pestana1.arbolComensales;

  // Lista de todos los tiempos de comida disponibles (deducidos del árbol)
  const tiemposComidaDisponibles = useMemo(() => {
    const set = new Set<string>();
    for (const tiempos of Object.values(arbol)) {
      for (const tcId of Object.keys(tiempos)) {
        set.add(tcId);
      }
    }
    return [...set].sort();
  }, [arbol]);

  // Lista de dietas disponibles (deducidas del árbol)
  const dietasDisponibles = useMemo(() => {
    const set = new Set<string>();
    for (const tiempos of Object.values(arbol)) {
      for (const dietas of Object.values(tiempos)) {
        for (const dietaId of Object.keys(dietas)) {
          set.add(dietaId);
        }
      }
    }
    return [...set].sort();
  }, [arbol]);

  // Buscador predictivo: filtra por nombre, apellido o ID
  const resultadosBusqueda = useMemo(() => {
    if (!busqueda.trim() || busqueda.trim().length < 2) return [];

    const termino = busqueda
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

    return Object.entries(usuarios)
      .filter(([, u]) => {
        const nombre = String(u?.nombre ?? '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase();
        const apellido = String(u?.apellido ?? '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase();
        const id = String(u?.id ?? '').toLowerCase();
        return nombre.includes(termino) || apellido.includes(termino) || id.includes(termino);
      })
      .slice(0, 10)
      .map(([id, u]) => ({
        id,
        nombre: `${u?.nombre ?? ''} ${u?.apellido ?? ''}`.trim(),
        dieta: u?.dietaNombre ?? 'Sin dieta',
      }));
  }, [busqueda, usuarios]);

  const usuarioInfo = usuarioSeleccionado ? usuarios[usuarioSeleccionado] : null;

  function handleSeleccionarUsuario(id: string) {
    setUsuarioSeleccionado(id);
    setBusqueda('');
    setTiempoComidaSeleccionado('');
    setNuevaAlternativaId('');
    setNuevaDietaId('');
  }

  function handleConfirmar() {
    if (!usuarioSeleccionado || !tiempoComidaSeleccionado) return;

    store.addOverride({
      usuarioId: usuarioSeleccionado,
      tiempoComidaId: tiempoComidaSeleccionado,
      nuevaAlternativaId: nuevaAlternativaId || undefined,
      nuevaDietaId: nuevaDietaId || undefined,
    });

    // Reset para siguiente override
    setUsuarioSeleccionado(null);
    setTiempoComidaSeleccionado('');
    setNuevaAlternativaId('');
    setNuevaDietaId('');
  }

  function handleCerrar(open: boolean) {
    if (!open) {
      store.toggleBottomSheet();
      setBusqueda('');
      setUsuarioSeleccionado(null);
    }
  }

  const overridesCount = store.overrides.length;

  return (
    <Sheet open={store.bottomSheetAbierto} onOpenChange={handleCerrar}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader className="pb-2">
          <SheetTitle className="flex items-center gap-2">
            <UserCog className="h-5 w-5" />
            Ajustes en caliente
            {overridesCount > 0 && (
              <Badge variant="secondary" className="ml-2">
                {overridesCount} cambio{overridesCount !== 1 ? 's' : ''}
              </Badge>
            )}
          </SheetTitle>
          <SheetDescription>
            Busca un residente y cambia su alternativa o dieta para este borrador.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 pt-2">
          {/* Buscador predictivo */}
          {!usuarioSeleccionado && (
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                  placeholder="Buscar residente por nombre..."
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  className="pl-10"
                  autoFocus
                />
              </div>

              {resultadosBusqueda.length > 0 && (
                <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border bg-white p-1">
                  {resultadosBusqueda.map((r) => (
                    <button
                      key={r.id}
                      className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-gray-100"
                      onClick={() => handleSeleccionarUsuario(r.id)}
                    >
                      <span className="font-medium">{r.nombre || r.id}</span>
                      <Badge variant="outline" className="text-xs">
                        {r.dieta}
                      </Badge>
                    </button>
                  ))}
                </div>
              )}

              {busqueda.trim().length >= 2 && resultadosBusqueda.length === 0 && (
                <p className="px-1 text-xs text-gray-500">Sin resultados para &quot;{busqueda}&quot;</p>
              )}
            </div>
          )}

          {/* Formulario de override */}
          {usuarioSeleccionado && usuarioInfo && (
            <div className="space-y-4 rounded-xl border bg-gray-50 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">
                    {usuarioInfo.nombre} {usuarioInfo.apellido}
                  </p>
                  <p className="text-xs text-gray-500">
                    Dieta actual: {usuarioInfo.dietaNombre ?? 'Sin dieta'}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setUsuarioSeleccionado(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Tiempo de comida */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-700">Tiempo de comida</label>
                <Select value={tiempoComidaSeleccionado} onValueChange={setTiempoComidaSeleccionado}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar tiempo de comida" />
                  </SelectTrigger>
                  <SelectContent>
                    {tiemposComidaDisponibles.map((tc) => (
                      <SelectItem key={tc} value={tc}>
                        {tc}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Nueva alternativa */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-700">
                  Nueva alternativa <span className="text-gray-400">(opcional)</span>
                </label>
                <Input
                  placeholder="ID de alternativa (ej: menu-regular)"
                  value={nuevaAlternativaId}
                  onChange={(e) => setNuevaAlternativaId(e.target.value)}
                />
              </div>

              {/* Nueva dieta */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-700">
                  Nueva dieta <span className="text-gray-400">(opcional)</span>
                </label>
                <Select value={nuevaDietaId} onValueChange={setNuevaDietaId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sin cambio de dieta" />
                  </SelectTrigger>
                  <SelectContent>
                    {dietasDisponibles.map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                className="w-full"
                onClick={handleConfirmar}
                disabled={!tiempoComidaSeleccionado || (!nuevaAlternativaId && !nuevaDietaId)}
              >
                Aplicar cambio
              </Button>
            </div>
          )}

          {/* Lista de overrides pendientes */}
          {overridesCount > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-gray-700">Cambios aplicados en esta sesión</h4>
              <div className="max-h-32 space-y-1 overflow-y-auto">
                {store.overrides.map((o, i) => {
                  const u = usuarios[o.usuarioId];
                  return (
                    <div
                      key={`${o.usuarioId}-${o.tiempoComidaId}-${i}`}
                      className="flex items-center justify-between rounded-md border bg-white px-3 py-1.5 text-xs"
                    >
                      <span>
                        <strong>{u?.nombre ?? o.usuarioId}</strong> · {o.tiempoComidaId}
                        {o.nuevaAlternativaId && ` → alt: ${o.nuevaAlternativaId}`}
                        {o.nuevaDietaId && ` → dieta: ${o.nuevaDietaId}`}
                      </span>
                      <button
                        className="text-red-500 hover:text-red-700"
                        onClick={() => store.removeOverride(o.usuarioId, o.tiempoComidaId)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

