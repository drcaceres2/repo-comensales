"use client";

import { useState } from "react";
import type {
  NovedadOperativa,
  NovedadOperativaUpdate,
  NovedadFormValues
} from "../../../../../shared/schemas/novedades";
import { NovedadCard } from "@/components/novedades/NovedadCard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useNovedades } from "../hooks/useNovedades";
import NovedadFormModal from "@/components/novedades/NovedadFormModal";
import { useToast } from "@/hooks/useToast";
import { type ZodIssue } from "zod";

interface TableroMisNovedadesProps {
  initialData: NovedadOperativa[];
}

export default function TableroMisNovedades({ initialData }: TableroMisNovedadesProps) {
  const [activeTab, setActiveTab] = useState("pendientes");
  const [editingNovedad, setEditingNovedad] = useState<NovedadOperativa | null>(null);
  const [serverErrors, setServerErrors] = useState<ZodIssue[] | null>(null);
  const { toast } = useToast();

  const { 
    novedades, 
    handleEdit, 
    handleDelete,
    handleArchive 
  } = useNovedades(initialData);

  const novedadesPendientes = novedades?.filter((n) => n.estado === "pendiente") ?? [];
  const historialNovedades = novedades?.filter((n) => n.estado !== "pendiente") ?? [];

  const onCardEdit = (novedad: NovedadOperativa) => {
    if (novedad.estado !== 'pendiente') {
      toast({
        title: "Acción no permitida",
        description: "Solo se pueden editar novedades en estado 'pendiente'.",
        variant: "destructive",
      });
      return;
    }
    setServerErrors(null); // Clear previous errors
    setEditingNovedad(novedad);
  };

  const handleModalSubmit = async (data: NovedadFormValues) => {
    console.log("[TableroMisNovedades] Step 2: handleModalSubmit called with data:", data);
    if (!editingNovedad) return;

    try {
      const result = await handleEdit(editingNovedad.id, data);
      
      if (!result.success && result.details) {
        setServerErrors(result.details);
        return; // Keep modal open
      }

      if (!result.success) {
        toast({ title: "Error", description: result.error, variant: "destructive" });
        return; // Keep modal open
      }
      
      toast({ title: "Éxito", description: "Novedad actualizada." });
      setEditingNovedad(null); // Close modal on success
    } catch (e) {
      toast({ title: "Error inesperado", description: "No se pudo conectar con el servidor.", variant: "destructive" });
    }
  };

  return (
    <>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="pendientes">Pendientes</TabsTrigger>
          <TabsTrigger value="historial">Historial</TabsTrigger>
        </TabsList>
        <TabsContent value="pendientes">
          <div className="space-y-4 mt-4">
            {novedadesPendientes.map((novedad) => (
              <NovedadCard
                key={novedad.id}
                novedad={novedad}
                rolContext="residente"
                onEdit={() => onCardEdit(novedad)}
                onDelete={() => handleDelete(novedad.id)}
                onArchive={() => handleArchive(novedad.id)}
              />
            ))}
          </div>
        </TabsContent>
        <TabsContent value="historial">
          <div className="space-y-4 mt-4">
            {historialNovedades.map((novedad) => (
              <NovedadCard
                key={novedad.id}
                novedad={novedad}
                rolContext="residente"
                onArchive={() => handleArchive(novedad.id)}
              />
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {editingNovedad && (
        <NovedadFormModal
          isOpen={!!editingNovedad}
          onClose={() => setEditingNovedad(null)}
          onSubmit={handleModalSubmit}
          defaultValues={editingNovedad}
          serverErrors={serverErrors}
        />
      )}
    </>
  );
}
