'use client';

import React, { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { TipoComunicacionPatch } from '../../_lib/store';

type ActividadLike = Record<string, any>;

type Lane = 'radar' | 'cierre' | 'cancelacion' | 'otros';

function resolveLane(
  item: ActividadLike,
  actividadPatches: Record<string, TipoComunicacionPatch>,
): Lane {
  // Prioridad: el patch del consolidador
  const patchTipo = actividadPatches[String(item?.id ?? '')];
  if (patchTipo) {
    if (patchTipo === 'CANCELACION') return 'cancelacion';
    if (patchTipo === 'DEFINITIVA') return 'cierre';
    if (patchTipo === 'PREVIA') return 'radar';
  }

  const antelacion = String(item?.antelacion ?? '').toLowerCase();
  if (antelacion === 'consolidacion_obligatoria') return 'cierre';
  if (antelacion === 'con_antelacion') return 'radar';
  return 'otros';
}

function defaultTipoForAntelacion(antelacion: string): TipoComunicacionPatch | '' {
  switch (antelacion) {
    case 'consolidacion_obligatoria':
      return 'DEFINITIVA';
    case 'con_antelacion':
      return 'PREVIA';
    default:
      return '';
  }
}

function ActivityCard({
  item,
  patchValue,
  onPatchChange,
}: {
  item: ActividadLike;
  patchValue: TipoComunicacionPatch | undefined;
  onPatchChange: (actividadId: string, tipo: TipoComunicacionPatch) => void;
}) {
  const antelacion = String(item?.antelacion ?? '');
  const esObligatoria = antelacion === 'consolidacion_obligatoria';
  const currentValue = patchValue ?? defaultTipoForAntelacion(antelacion);

  return (
    <article className="rounded-lg border bg-white p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">
            {item?.titulo ?? item?.nombreActividad ?? item?.id}
          </p>
          <p className="mt-0.5 text-xs text-gray-500">
            Estado: {String(item?.estado ?? 'sin_estado')} · Antelación:{' '}
            {String(item?.antelacion ?? 'sin_dato')}
          </p>
        </div>
        {esObligatoria && !patchValue && (
          <Badge className="shrink-0 bg-amber-100 text-amber-800 hover:bg-amber-100 text-[10px]">
            <AlertTriangle className="mr-1 h-3 w-3" />
            Definitiva requerida
          </Badge>
        )}
      </div>

      {/* Selector de tipo de comunicación */}
      <div className="pt-1">
        <Select
          value={currentValue || undefined}
          onValueChange={(v) => onPatchChange(String(item?.id), v as TipoComunicacionPatch)}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Elegir comunicación…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="PREVIA">📡 Comunicación Previa</SelectItem>
            <SelectItem value="DEFINITIVA">🔒 Comunicación Definitiva</SelectItem>
            <SelectItem value="CANCELACION">❌ Cancelación</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </article>
  );
}

function LaneColumn({
  title,
  items,
  badgeClass,
  actividadPatches,
  onPatchChange,
}: {
  title: string;
  items: ActividadLike[];
  badgeClass: string;
  actividadPatches: Record<string, TipoComunicacionPatch>;
  onPatchChange: (actividadId: string, tipo: TipoComunicacionPatch) => void;
}) {
  return (
    <section className="rounded-xl border bg-gray-50 p-3">
      <header className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-semibold">{title}</h4>
        <Badge className={badgeClass}>{items.length}</Badge>
      </header>

      <div className="space-y-2">
        {items.length === 0 ? (
          <p className="text-xs text-gray-500">Sin elementos.</p>
        ) : (
          items.map((item) => (
            <ActivityCard
              key={String(item?.id)}
              item={item}
              patchValue={actividadPatches[String(item?.id ?? '')]}
              onPatchChange={onPatchChange}
            />
          ))
        )}
      </div>
    </section>
  );
}

export default function ActividadesBoard({
  actividades,
  actividadPatches,
  onPatchChange,
}: {
  actividades: ActividadLike[];
  actividadPatches: Record<string, TipoComunicacionPatch>;
  onPatchChange: (actividadId: string, tipo: TipoComunicacionPatch) => void;
}) {
  const lanes = useMemo(() => {
    const output: Record<Lane, ActividadLike[]> = {
      radar: [],
      cierre: [],
      cancelacion: [],
      otros: [],
    };

    for (const actividad of actividades ?? []) {
      output[resolveLane(actividad, actividadPatches)].push(actividad);
    }

    return output;
  }, [actividades, actividadPatches]);

  return (
    <div className="grid gap-3 md:grid-cols-3">
      <LaneColumn
        title="Radar / Previa"
        items={lanes.radar}
        badgeClass="bg-blue-100 text-blue-700 hover:bg-blue-100"
        actividadPatches={actividadPatches}
        onPatchChange={onPatchChange}
      />
      <LaneColumn
        title="Cierre / Definitiva"
        items={lanes.cierre}
        badgeClass="bg-amber-100 text-amber-700 hover:bg-amber-100"
        actividadPatches={actividadPatches}
        onPatchChange={onPatchChange}
      />
      <LaneColumn
        title="Cancelación"
        items={lanes.cancelacion}
        badgeClass="bg-rose-100 text-rose-700 hover:bg-rose-100"
        actividadPatches={actividadPatches}
        onPatchChange={onPatchChange}
      />
    </div>
  );
}
