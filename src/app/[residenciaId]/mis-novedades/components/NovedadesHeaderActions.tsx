"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import { useToast } from "@/hooks/useToast";
import NovedadFormModal from "@/components/novedades/NovedadFormModal";
import { crearNovedadAction } from "../actions";
import { type NovedadFormValues } from "shared/schemas/novedades";

export default function NovedadesHeaderActions({ residenciaId }: { residenciaId: string }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  const handleCreateNovedad = (data: NovedadFormValues) => {
    startTransition(async () => {
      const result = await crearNovedadAction(residenciaId, data);
      if (result.success) {
        toast({
          title: "Éxito",
          description: "Novedad creada correctamente.",
        });
        setIsModalOpen(false);
      } else {
        toast({
          variant: "destructive",
          title: "Error",
          description: result.error || "No se pudo crear la novedad.",
        });
      }
    });
  };

  return (
    <>
      <Button onClick={() => setIsModalOpen(true)} disabled={isPending}>
        <PlusCircle className="mr-2 h-4 w-4" />
        Nueva Novedad
      </Button>
      {isModalOpen && (
        <NovedadFormModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSubmit={handleCreateNovedad}
        />
      )}
    </>
  );
}
