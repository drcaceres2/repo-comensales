"use client";

import React, { useState } from "react";
import { useParams } from "next/navigation";
import { Wallet, Landmark, AlertCircle, Loader2 } from "lucide-react";
import { useCentrosDeCosto } from "./hooks/useCentrosDeCosto";
import CentroDeCostoItem from "./components/CentroDeCostoItem";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/**
 * Página principal de Gestión de Centros de Costo.
 * Ensambla el hook de datos con los componentes de UI e implementa el estado del acordeón.
 */
export default function CentrosDeCostoPage() {
  const { residenciaId } = useParams<{ residenciaId: string }>();
  
  // Estado para controlar qué acordeón está expandido (solo uno a la vez)
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Hook de integración con Firestore y Server Actions via TanStack Query
  const {
    centrosDeCosto,
    isLoading,
    error,
    createCentroDeCosto,
    updateCentroDeCosto,
    archiveCentroDeCosto,
  } = useCentrosDeCosto(residenciaId);

  // Renderizado de estado de error
  if (error) {
    return (
      <div className="container mx-auto p-4 sm:p-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error al cargar datos</AlertTitle>
          <AlertDescription>
            Hubo un problema al obtener los centros de costo. Por favor, intenta de nuevo más tarde.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-8">
      {/* Header de la página */}
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg text-primary">
            <Landmark className="h-8 w-8" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Centros de Costo
            </h1>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
              Residencia: <span className="font-mono">{residenciaId}</span>
            </p>
          </div>
        </div>
        <p className="text-slate-600 dark:text-slate-400 mt-2 max-w-2xl">
          Administra las entidades contables para la clasificación y seguimiento de gastos e ingresos.
        </p>
      </header>

      <main className="space-y-6">
        {/* Sección de Crear Nuevo (Siempre arriba) */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground ml-1">
            Operaciones
          </h2>
          <CentroDeCostoItem
            centro={null}
            isExpanded={expandedId === "new"}
            onToggle={() => setExpandedId(expandedId === "new" ? null : "new")}
            onSave={async (data) => {
              const { id, ...payload } = data;
              await createCentroDeCosto(payload);
              setExpandedId(null);
            }}
          />
        </section>

        {/* Lista de Centros Existentes */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground ml-1">
            Centros Registrados
          </h2>
          
          <div className="grid gap-4">
            {isLoading ? (
              // Skeletons mientras carga
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="border rounded-lg p-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <div className="flex gap-3 items-center">
                      <Skeleton className="h-2.5 w-2.5 rounded-full" />
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-3 w-48" />
                      </div>
                    </div>
                    <Skeleton className="h-8 w-8 rounded-full" />
                  </div>
                </div>
              ))
            ) : centrosDeCosto.length === 0 ? (
              // Estado vacío
              <div className="text-center py-12 border-2 border-dashed rounded-xl bg-muted/20">
                <Wallet className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100">
                  No hay centros de costo
                </h3>
                <p className="text-slate-500">
                  Comienza creando el primero usando el formulario superior.
                </p>
              </div>
            ) : (
              // Mapeo de ítems reales
              centrosDeCosto.map((cc) => (
                <CentroDeCostoItem
                  key={cc.id}
                  centro={cc}
                  isExpanded={expandedId === cc.id}
                  onToggle={() => setExpandedId(expandedId === cc.id ? null : cc.id)}
                  onSave={async (data) => {
                    await updateCentroDeCosto({ id: cc.id, payload: data });
                    setExpandedId(null);
                  }}
                  onArchive={async () => {
                    await archiveCentroDeCosto(cc.id);
                    setExpandedId(null);
                  }}
                />
              ))
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
