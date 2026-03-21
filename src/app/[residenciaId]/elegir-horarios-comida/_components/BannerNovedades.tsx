'use client';

import { Bell } from 'lucide-react';

type BannerNovedadesProps = {
  hayPendientesSync: boolean;
  visible?: boolean;
};

export function BannerNovedades({ hayPendientesSync, visible = false }: BannerNovedadesProps) {
  if (!visible) {
    return null;
  }

  return (
    <section className="sticky top-2 z-10 rounded-lg border bg-background/95 p-3 backdrop-blur">
      <div className="flex items-center gap-2 text-sm">
        <Bell className="h-4 w-4" />
        <span className="font-medium">Novedades operativas</span>
      </div>
      {hayPendientesSync ? (
        <p className="mt-1 text-xs text-amber-700">Tienes cambios pendientes por sincronizar cuando vuelva la conexión.</p>
      ) : null}
    </section>
  );
}
