"use client";

import { useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useInfoUsuario } from "@/components/layout/AppProviders";
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

  const queryClient = useQueryClient();
  const { usuarioId } = useInfoUsuario();

  const handleCreateNovedad = (data: NovedadFormValues) => {
    startTransition(async () => {
      try {
        const result = await crearNovedadAction(residenciaId, data);
        if (result.success) {
          toast({
            title: "Éxito",
            description: "Novedad creada correctamente.",
          });
          // refresh the list managed by useNovedades so the new item appears
          if (usuarioId) {
            queryClient.invalidateQueries({
              queryKey: ["novedades", { residenciaId, usuarioId }],
            });
          }
          setIsModalOpen(false);
        } else {
          toast({
            variant: "destructive",
            title: "Error",
            description: result.error || "No se pudo crear la novedad.",
          });
        }
      } catch (e: any) {
        console.error("[NovedadesHeaderActions] create error", e);
        toast({
          variant: "destructive",
          title: "Error inesperado",
          description: e?.message || "No se pudo ejecutar la acción.",
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
