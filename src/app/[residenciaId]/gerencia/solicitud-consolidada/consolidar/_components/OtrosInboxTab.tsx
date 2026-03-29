'use client';

import React from 'react';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useSolicitudConsolidadaStore } from '../../_lib/store';
import ActividadesBoard from './ActividadesBoard';

function inclusionKey(tipo: 'actividad' | 'atencion' | 'excepcion' | 'invitado', id: string) {
  return `${tipo}:${id}`;
}

function ToggleRow({
  label,
  subtitle,
  checked,
  onCheckedChange,
}: {
  label: string;
  subtitle?: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border bg-white px-3 py-2">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {subtitle ? <p className="text-xs text-gray-500">{subtitle}</p> : null}
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

export default function OtrosInboxTab() {
  const store = useSolicitudConsolidadaStore();
  const { actividades, atenciones, excepciones, solicitudesInvitados } = store.pestana3;
  const inclusion = store.inclusionEntidades;

  const totalItems = actividades.length + atenciones.length + excepciones.length + solicitudesInvitados.length;
  const totalIncluidos = Object.values(inclusion).filter(Boolean).length;

  const actividadesIncluidas = actividades.filter((item: any) => {
    const key = inclusionKey('actividad', String(item?.id));
    return inclusion[key] ?? true;
  });

  const handlePatchChange = (actividadId: string, tipo: string) => {
    store.setActividadPatch(actividadId, tipo as 'PREVIA' | 'DEFINITIVA' | 'CANCELACION');
  };

  return (
    <div className="space-y-4">
      <section className="rounded-xl border bg-gray-50 p-3">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Checklist de inclusión (Inbox Zero)</h3>
          <Badge variant="secondary">
            {totalIncluidos}/{totalItems} incluidos
          </Badge>
        </div>

        <p className="mb-3 text-xs text-gray-500">
          Entidades pre-aprobadas visibles para esta consolidación. Los toggles no mutan backend en esta fase.
        </p>

        <div className="space-y-2">
          {atenciones.map((item: any) => {
            const key = inclusionKey('atencion', String(item?.id));
            return (
              <ToggleRow
                key={key}
                label={`Atención: ${item?.nombre ?? item?.id}`}
                subtitle={`Estado: ${item?.estado ?? 'aprobada'}`}
                checked={inclusion[key] ?? true}
                onCheckedChange={(value) => store.setInclusionEntidad(key, value)}
              />
            );
          })}

          {excepciones.map((item: any) => {
            const key = inclusionKey('excepcion', String(item?.id));
            return (
              <ToggleRow
                key={key}
                label={`Excepción: ${item?.id}`}
                subtitle={`Usuario: ${item?.usuarioId ?? 'N/A'}`}
                checked={inclusion[key] ?? true}
                onCheckedChange={(value) => store.setInclusionEntidad(key, value)}
              />
            );
          })}

          {solicitudesInvitados.map((item: any) => {
            const key = inclusionKey('invitado', String(item?.id));
            return (
              <ToggleRow
                key={key}
                label={`Solicitud invitado: ${item?.id}`}
                subtitle={`Estado: ${item?.estado ?? 'aprobada'}`}
                checked={inclusion[key] ?? true}
                onCheckedChange={(value) => store.setInclusionEntidad(key, value)}
              />
            );
          })}
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Tablero de actividades (3 carriles)</h3>
        <ActividadesBoard
          actividades={actividadesIncluidas}
          actividadPatches={store.actividadPatches}
          onPatchChange={handlePatchChange}
        />
      </section>
    </div>
  );
}

