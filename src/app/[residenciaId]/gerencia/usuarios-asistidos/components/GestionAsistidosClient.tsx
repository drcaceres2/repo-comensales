"use client";

import { useState } from "react";
import { useAsistidosElegiblesQuery, useAsistentesActualesQuery, useRevocarAsistenteMutation, useUsuariosParaAsignarQuery } from "../consultas";
import type { AsistenteActual } from "../consultas";

import { BuscadorAsistido, type UsuarioElegible } from "./BuscadorAsistido";
import { ListaAsistentesActuales } from "./ListaAsistentesActuales";
import { FormularioNuevaAsignacion } from "./FormularioNuevaAsignacion";
import { useToast } from "@/hooks/useToast";

interface GestionAsistidosClientProps {
  residenciaId: string;
}

export const GestionAsistidosClient = ({ residenciaId }: GestionAsistidosClientProps) => {
  const [asistidoId, setAsistidoId] = useState<string | null>(null);
  const [asistenteAEditar, setAsistenteAEditar] = useState<AsistenteActual | null>(null);
  const { toast } = useToast();

  const { data: asistidosElegibles, isLoading: isLoadingAsistidos } = useAsistidosElegiblesQuery(residenciaId);
  const { data: asistentesActuales, isLoading: isLoadingAsistentesActuales, refetch } = useAsistentesActualesQuery(asistidoId, residenciaId);
  // consultamos todos los usuarios disponibles para asignar (sin filtrar por rol)
  const { data: usuariosParaAsignar, isLoading: isLoadingUsuariosParaAsignar } = useUsuariosParaAsignarQuery(residenciaId, asistidoId);

  const revocarMutation = useRevocarAsistenteMutation({
    onSuccess: () => {
      toast({
        title: "Éxito",
        description: "Asignación revocada exitosamente.",
      });
      refetch(); // Invalida y recarga la lista de asistentes
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Error al revocar",
        description: error.message,
      });
    }
  });

  const handleSelectAsistido = (id: string | null) => {
    setAsistidoId(id);
    setAsistenteAEditar(null); // Resetea el formulario al cambiar de asistido
  };

  const handleEditarAsistente = (asistente: AsistenteActual) => {
    setAsistenteAEditar(asistente);
    // Opcional: scroll hacia el formulario
    document.getElementById('formulario-asignacion')?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleRevocarAsistente = (asistenteId: string) => {
    if (!asistidoId) return;
    // Aquí podrías abrir un modal de confirmación
    revocarMutation.mutate({ asistidoId, asistenteId });
  };

  const handleFormularioSuccess = () => {
    setAsistenteAEditar(null); // Limpia el formulario
    refetch(); // Recarga la lista
  };

  const usuariosParaBuscador: UsuarioElegible[] = asistidosElegibles?.map(u => ({
    id: u.id,
    nombreCompleto: `${u.nombre} ${u.apellido}`,
    rol: u.roles.includes('residente') ? 'residente' : 'invitado',
  })) || [];

  // aplicamos el filtro de rol asistente para el formulario
  const asistentesElegibles = usuariosParaAsignar?.filter(u => u.roles.includes('asistente')) || [];

  return (
    <div className="p-4 md:p-6 space-y-8">
      <div className="max-w-xl">
        <h1 className="text-2xl font-bold text-gray-900">Gestión de Asistentes (Proxy)</h1>
        <p className="mt-2 text-sm text-gray-600">
          Seleccione un usuario para ver sus asistentes actuales o para asignarle uno nuevo.
        </p>
      </div>

      <div className="max-w-md">
        <BuscadorAsistido
          usuarios={usuariosParaBuscador}
          onSelect={handleSelectAsistido}
          label={isLoadingAsistidos ? "Cargando usuarios..." : "Usuario Asistido (quien recibe la ayuda)"}
        />
      </div>

      {asistidoId && residenciaId && (
        <div className="space-y-10">
          <ListaAsistentesActuales
            asistentes={asistentesActuales || []}
            isLoading={isLoadingAsistentesActuales}
            onEdit={handleEditarAsistente}
            onRevoke={handleRevocarAsistente}
          />
          <div id="formulario-asignacion">
            <FormularioNuevaAsignacion
              residenciaId={residenciaId}
              asistidoId={asistidoId}
              asistenteAEditar={asistenteAEditar}
              onSuccess={handleFormularioSuccess}
              candidatos={asistentesElegibles}
              isLoadingCandidatos={isLoadingUsuariosParaAsignar}
            />
          </div>
        </div>
      )}
    </div>
  );
};
