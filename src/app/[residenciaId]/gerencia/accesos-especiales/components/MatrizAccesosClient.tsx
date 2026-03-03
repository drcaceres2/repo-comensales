"use client";

import { useState, useEffect } from "react";
import { useForm, FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  UpdateMatrizAccesosPayloadSchema,
  UpdateMatrizAccesosPayload,
} from "shared/schemas/usuariosAsistentes";
import { 
  useActualizarMatrizMutation, 
  useUsuariosElegiblesQuery, 
  usePrivilegiosUsuarioQuery 
} from "../consultas";

import { SelectorUsuarios } from "./SelectorUsuarios";
import { FacultadCard } from "./FacultadCard";
import { CategoriaPermisosAcordeon } from "./CategoriaPermisosAcordeon";
import { Button } from "@/components/ui/button";

const categorias = {
  "Operación Diaria": [
    { key: "solicitarComensales", label: "Solicitar Comidas" },
    { key: "gestionRecordatorios", label: "Gestión de Recordatorios" },
    { key: "gestionAtenciones", label: "Gestión de Atenciones" },
  ],
  "Gestión de Comunidad": [
    { key: "gestionActividades", label: "Gestión de Actividades" },
    { key: "gestionInvitados", label: "Gestión de Invitados" },
    { key: "gestionGrupos", label: "Gestión de Grupos de Usuarios" },
  ],
  "Administración": [
    { key: "gestionHorariosYAlteraciones", label: "Gestión de Horarios y Alteraciones" },
    { key: "gestionComedores", label: "Gestión de Comedores" },
    { key: "gestionDietas", label: "Gestión de Dietas" },
    { key: "gestionAsistentes", label: "Gestión de Asistentes" },
  ],
};

interface GestionAsistidosClientProps {
  residenciaId: string;
}

export const MatrizAccesosClient = ({ residenciaId }: GestionAsistidosClientProps) => {
  const [targetUserId, setTargetUserId] = useState<string | null>(null);
  const { data: usuarios, isLoading: isLoadingUsuarios } = useUsuariosElegiblesQuery(residenciaId!);
  const { data: privilegios, isLoading: isLoadingPrivilegios } = usePrivilegiosUsuarioQuery(targetUserId);
  const { mutate: actualizarMatriz, isPending: isUpdating } = useActualizarMatrizMutation();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isDirty },
  } = useForm<UpdateMatrizAccesosPayload>({
    resolver: zodResolver(UpdateMatrizAccesosPayloadSchema),
    defaultValues: {
      targetUserId: "",
      permisos: {},
    }
  });

  useEffect(() => {
    if (privilegios) {
      // Excluimos 'usuariosAsistidos' antes de pasarlo al formulario
      const { usuariosAsistidos, ...permisosParaForm } = privilegios;
      reset({
        targetUserId: targetUserId || "",
        permisos: permisosParaForm,
      });
    } else {
      reset({
        targetUserId: targetUserId || "",
        permisos: {},
      });
    }
  }, [privilegios, targetUserId, reset]);

  const handleUserSelect = (userId: string | null) => {
    setTargetUserId(userId);
  };

  const onSubmit = (data: UpdateMatrizAccesosPayload) => {
    if (!residenciaId) {
      alert("Error: No se ha encontrado el ID de la residencia.");
      return;
    }
    actualizarMatriz({ payload: data, residenciaId }, {
      onSuccess: () => {
        alert("Permisos actualizados con éxito");
        reset(data);
      },
      onError: (error) => {
        alert(`Error: ${error.message}`);
      }
    });
  };

  const onInvalid = (errors: FieldErrors<UpdateMatrizAccesosPayload>) => {
    console.error("Falló la validación del formulario:", errors);
    alert("Hay errores en el formulario. Por favor, revise los campos marcados.");
  };

  const usuariosParaSelector = usuarios
    ?.filter(u => u.roles.includes('asistente'))
    .map(u => ({ id: u.id, nombreCompleto: `${u.nombre} ${u.apellido}` })) || [];

  return (
    <div className="p-4 space-y-6">
      <h1 className="text-2xl font-bold">Matriz de Accesos del Sistema</h1>
      
      <div className="max-w-md">
        <SelectorUsuarios
          usuarios={usuariosParaSelector}
          value={targetUserId}
          onChange={handleUserSelect}
          disabled={isDirty || isLoadingUsuarios}
          placeholder={isLoadingUsuarios ? "Cargando usuarios..." : "Seleccione un usuario"}
        />
        {isDirty && (
          <p className="text-sm text-yellow-600 mt-1">
            Guarde o descarte los cambios antes de seleccionar otro usuario.
          </p>
        )}
      </div>

      {isLoadingPrivilegios && <p>Cargando privilegios...</p>}

      {targetUserId && !isLoadingPrivilegios && (
        <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="space-y-4">
          {Object.entries(categorias).map(([titulo, permisos]) => (
            <CategoriaPermisosAcordeon key={titulo} titulo={titulo}>
              {permisos.map(({ key, label }) => (
                <FacultadCard
                  key={key}
                  permisoKey={key as keyof UpdateMatrizAccesosPayload["permisos"]}
                  titulo={label}
                  control={control}
                />
              ))}
            </CategoriaPermisosAcordeon>
          ))}

          <div className="flex justify-end gap-4 pt-4">
            <Button
              type="submit"
              disabled={!isDirty || isUpdating}
            >
              {isUpdating ? "Guardando..." : "Guardar Cambios"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
};