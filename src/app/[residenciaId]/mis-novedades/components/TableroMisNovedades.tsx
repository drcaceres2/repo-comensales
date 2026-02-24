"use client";

import { useState } from "react";
import { NovedadOperativa } from "../../../../../shared/schemas/novedades";
import { NovedadCard } from "@/components/novedades/NovedadCard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useNovedades } from "../hooks/useNovedades";
import { useToast } from "@/hooks/useToast";

interface TableroMisNovedadesProps {
  initialData: NovedadOperativa[];
}

export default function TableroMisNovedades({ initialData }: TableroMisNovedadesProps) {
  const [activeTab, setActiveTab] = useState("pendientes");
  const { toast } = useToast();
  const { 
    novedades, 
    handleEdit, 
    handleDelete,
    handleArchive 
  } = useNovedades(initialData);

  const novedadesPendientes = novedades?.filter((n) => n.estado === "pendiente") ?? [];
  const historialNovedades = novedades?.filter((n) => n.estado !== "pendiente") ?? [];

  // Adaptador para la función de edición.
  // Por ahora, solo muestra un toast porque no hay un modal de edición.
  const onCardEdit = (novedad: NovedadOperativa) => {
    toast({
      title: "Función no implementada",
      description: "El modal para editar novedades aún no está conectado.",
    });
    // En una implementación real, aquí se llamaría a un modal.
    // Ejemplo de cómo se llamaría al hook:
    // handleEdit(novedad.id, { texto: "Nuevo texto desde el modal" });
  };

  return (
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
              onEdit={onCardEdit}
              onDelete={handleDelete}
              onArchive={handleArchive}
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
              onArchive={handleArchive}
            />
          ))}
        </div>
      </TabsContent>
    </Tabs>
  );
}
