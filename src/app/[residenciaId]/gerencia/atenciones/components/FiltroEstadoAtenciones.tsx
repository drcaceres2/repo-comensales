'use client';

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

export type FiltroAtenciones = 'activas' | 'pendientes' | 'todas';

type ConteoFiltros = {
  activas: number;
  pendientes: number;
  todas: number;
};

interface FiltroEstadoAtencionesProps {
  value: FiltroAtenciones;
  onChange: (value: FiltroAtenciones) => void;
  conteos: ConteoFiltros;
}

export function FiltroEstadoAtenciones({
  value,
  onChange,
  conteos,
}: FiltroEstadoAtencionesProps) {
  return (
    <Tabs
      value={value}
      onValueChange={(nextValue) => onChange(nextValue as FiltroAtenciones)}
      className="w-full"
    >
      <TabsList className="grid w-full grid-cols-3 sm:w-auto">
        <TabsTrigger value="activas">Activas ({conteos.activas})</TabsTrigger>
        <TabsTrigger value="pendientes">Pendientes ({conteos.pendientes})</TabsTrigger>
        <TabsTrigger value="todas">Todas ({conteos.todas})</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
