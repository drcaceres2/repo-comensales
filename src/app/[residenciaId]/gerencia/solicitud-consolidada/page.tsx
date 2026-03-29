'use client';

import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Plus, FileText, Calendar, Users, ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useHistorialSolicitudesConsolidadas } from './_lib/queries';

/**
 * Feed Histórico de Solicitudes Consolidadas (Fase 0).
 *
 * Vista de solo lectura que muestra todas las solicitudes pasadas
 * en estado CONSOLIDADO. Punto de entrada del módulo con botón
 * "Iniciar Nueva Consolidación" que lleva al wizard de consolidar/.
 */
export default function SolicitudConsolidadaHistorialPage() {
  const params = useParams<{ residenciaId: string }>();
  const router = useRouter();
  const residenciaId = params?.residenciaId || null;

  const { solicitudes, isLoading, error } = useHistorialSolicitudesConsolidadas(residenciaId);

  function handleNuevaConsolidacion() {
    router.push(`/${residenciaId}/gerencia/solicitud-consolidada/consolidar`);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b bg-white px-4 py-4 shadow-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Solicitudes Consolidadas</h1>
            <p className="text-sm text-gray-500">Historial de consolidaciones</p>
          </div>
          <Button onClick={handleNuevaConsolidacion} className="gap-2">
            <Plus className="h-4 w-4" />
            Nueva Consolidación
          </Button>
        </div>
      </header>

      {/* Contenido */}
      <main className="mx-auto max-w-3xl px-4 py-6">
        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        )}

        {/* Error */}
        {error && !isLoading && (
          <div className="rounded-xl border bg-red-50 p-6 text-center">
            <p className="text-sm font-medium text-red-700">Error al cargar historial</p>
            <p className="mt-1 text-xs text-red-600">{error.message}</p>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !error && solicitudes.length === 0 && (
          <div className="rounded-xl border border-dashed bg-white p-12 text-center">
            <FileText className="mx-auto h-12 w-12 text-gray-300" />
            <h3 className="mt-4 text-base font-semibold text-gray-700">
              Sin consolidaciones recientes
            </h3>
            <p className="mt-2 text-sm text-gray-500">
              Inicia tu primera consolidación del día para generar el reporte.
            </p>
            <Button onClick={handleNuevaConsolidacion} className="mt-6 gap-2">
              <Plus className="h-4 w-4" />
              Iniciar Nueva Consolidación
            </Button>
          </div>
        )}

        {/* Lista de tarjetas */}
        {!isLoading && solicitudes.length > 0 && (
          <div className="space-y-3">
            {solicitudes.map((sol) => (
              <SolicitudCard key={sol.id} solicitud={sol} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function SolicitudCard({ solicitud }: { solicitud: any }) {
  const fechaOperativa = String(solicitud?.fechaOperativa ?? 'N/A');
  const totalComensales = Number(solicitud?.totalComensales ?? 0);
  const totalTiemposComida = Number(solicitud?.totalTiemposComida ?? 0);
  const estadoDocumento = String(solicitud?.estadoDocumento ?? 'DESCONOCIDO');
  const urlPdf = solicitud?.urlPdfReporte as string | undefined;
  const fechaCierre = solicitud?.timestampCierreOficial
    ? new Date(String(solicitud.timestampCierreOficial)).toLocaleString('es', {
        dateStyle: 'short',
        timeStyle: 'short',
      })
    : null;

  return (
    <article className="rounded-xl border bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-gray-500" />
            <span className="text-base font-semibold text-gray-900">{fechaOperativa}</span>
            <Badge
              variant="secondary"
              className={
                estadoDocumento === 'CONSOLIDADO'
                  ? 'bg-emerald-100 text-emerald-700'
                  : estadoDocumento === 'CANCELADO'
                    ? 'bg-red-100 text-red-700'
                    : 'bg-gray-100 text-gray-700'
              }
            >
              {estadoDocumento}
            </Badge>
          </div>

          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <Users className="h-3.5 w-3.5" />
              {totalComensales} comensales
            </span>
            <span>{totalTiemposComida} tiempos de comida</span>
            {fechaCierre && <span>Cerrada: {fechaCierre}</span>}
          </div>
        </div>

        {urlPdf && (
          <a
            href={urlPdf}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0"
          >
            <Button variant="outline" size="sm" className="gap-1.5 text-xs">
              <ExternalLink className="h-3.5 w-3.5" />
              PDF
            </Button>
          </a>
        )}
      </div>
    </article>
  );
}

