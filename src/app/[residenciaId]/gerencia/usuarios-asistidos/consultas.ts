"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AsignarAsistentePayload, RevocarAsistentePayload, AsistentePermisosDetalle } from "shared/schemas/usuariosAsistentes";
import { Usuario } from "shared/schemas/usuarios";
import { 
  db, collection, query, where, getDocs,
  functions, httpsCallable
} from "@/lib/firebase";
import { useInfoUsuario } from "@/components/layout/AppProviders";

// --- Tipos de Datos para la UI ---

export interface AsistenteActual {
  id: string;
  nombreCompleto: string;
  permiso: AsistentePermisosDetalle;
}

// --- Factory de Query Keys ---

export const usuariosAsistidosKeys = {
  all: (residenciaId: string) => ['usuariosAsistidos', residenciaId] as const,
  // Usuarios que pueden ser asistidos
  asistidosElegibles: (residenciaId: string) => [...usuariosAsistidosKeys.all(residenciaId), 'asistidosElegibles'] as const,
  // Usuarios que pueden ser seleccionados para asignar (no incluye ya excluidos)
  usuariosParaAsignar: (residenciaId: string, asistidoId: string) => [...usuariosAsistidosKeys.all(residenciaId), 'usuariosParaAsignar', asistidoId] as const,
  // Asistentes actuales de un usuario
  asistentesDe: (residenciaId: string, asistidoId: string) => [...usuariosAsistidosKeys.all(residenciaId), 'asistentesActuales', asistidoId] as const,
};

// --- Cloud Functions (Mutations) ---

const asignarAsistenteProxy = httpsCallable<AsignarAsistentePayload, { success: boolean; message: string }>(functions, "asignarAsistenteProxy");
const revocarAsistenteProxy = httpsCallable<RevocarAsistentePayload, { success: boolean; message: string }>(functions, "revocarAsistenteProxy");

interface MutationOptions {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

export const useAsignarAsistenteMutation = ({ onSuccess, onError }: MutationOptions) => {
  const usuarioSesion = useInfoUsuario();

  const queryClient = useQueryClient();

  return useMutation<void, Error, AsignarAsistentePayload>({
    mutationFn: async (payload) => {
      const result = await asignarAsistenteProxy(payload);
      if (!result.data.success) {
        throw new Error(result.data.message || "Error desconocido desde la función.");
      }
    },
    onSuccess: (_, variables) => {
      // Invalida la lista de asistentes del usuario afectado
      queryClient.invalidateQueries({
        queryKey: usuariosAsistidosKeys.asistentesDe(usuarioSesion.residenciaId, variables.asistidoId)
      });
      // Invalida la lista de usuarios disponibles para asignar (el recién agregado debe desaparecer)
      queryClient.invalidateQueries({
        queryKey: usuariosAsistidosKeys.usuariosParaAsignar(usuarioSesion.residenciaId, variables.asistidoId)
      });
      onSuccess?.();
    },
    onError: (error) => {
      console.error("Error al asignar el asistente proxy:", error);
      onError?.(error);
    },
  });
};

export const useRevocarAsistenteMutation = ({ onSuccess, onError }: MutationOptions) => {
  const usuarioSesion = useInfoUsuario();
  const queryClient = useQueryClient();

  return useMutation<void, Error, RevocarAsistentePayload>({
    mutationFn: async (payload) => {
      const result = await revocarAsistenteProxy(payload);
      if (!result.data.success) {
        throw new Error(result.data.message || "Error desconocido desde la función.");
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: usuariosAsistidosKeys.asistentesDe(usuarioSesion.residenciaId, variables.asistidoId)
      });
      queryClient.invalidateQueries({
        queryKey: usuariosAsistidosKeys.usuariosParaAsignar(usuarioSesion.residenciaId, variables.asistidoId)
      });
      onSuccess?.();
    },
    onError: (error) => {
      console.error("Error al revocar el asistente proxy:", error);
      onError?.(error);
    },
  });
};


// --- Firestore SDK (Queries) ---

/**
 * Obtiene usuarios de una residencia que son elegibles para SER ASISTIDOS (residentes o invitados).
 * Usado en el buscador principal.
 */
export const useAsistidosElegiblesQuery = (residenciaId: string) => {
  return useQuery({
    queryKey: usuariosAsistidosKeys.asistidosElegibles(residenciaId),
    queryFn: async (): Promise<Usuario[]> => {
      if (!residenciaId) return [];
      const usuariosRef = collection(db, "usuarios");
      const q = query(
          usuariosRef,
          where("residenciaId", "==", residenciaId),
          where("roles", "array-contains-any", ["residente", "invitado"])
      );
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Usuario));
    },
    enabled: !!residenciaId,
  });
};

/**
 * Busca todos los usuarios que tienen asignado un 'asistidoId' específico y los transforma.
 * Usado para llenar la tabla de asistentes actuales.
 */
export const useAsistentesActualesQuery = (asistidoId: string | null, residenciaId: string) => {
  return useQuery({
    queryKey: asistidoId ? usuariosAsistidosKeys.asistentesDe(residenciaId, asistidoId) : [],
    queryFn: async (): Promise<AsistenteActual[]> => {
      if (!asistidoId || !residenciaId) return [];

      const usuariosRef = collection(db, "usuarios");

      // 1. Buscamos a TODOS los usuarios que tengan el rol 'asistente' en esta residencia.
      // Esto requiere un solo índice compuesto (residenciaId + roles) y es sumamente rápido.
      const q = query(
          usuariosRef,
          where("residenciaId", "==", residenciaId),
          where("roles", "array-contains", "asistente")
      );

      const querySnapshot = await getDocs(q);

      // 2. Filtramos en memoria (O(n) donde n es pequeño)
      const asistentesFiltrados: AsistenteActual[] = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data() as Usuario;
        const permisoSobreEsteAsistido = data.asistente?.usuariosAsistidos?.[asistidoId];

        if (permisoSobreEsteAsistido) {
          asistentesFiltrados.push({
            id: doc.id,
            nombreCompleto: `${data.nombre} ${data.apellido}`,
            permiso: permisoSobreEsteAsistido,
          });
        }
      });

      return asistentesFiltrados;
    },
    enabled: !!asistidoId && !!residenciaId,
  });
};

/**
 * Obtiene usuarios que pueden SER ASISTENTES para un usuario específico.
 * Usado en el formulario para el selector de asistentes.
 * Excluye al propio usuario asistido y a los que ya son sus asistentes.
 */
export const useUsuariosParaAsignarQuery = (residenciaId: string, asistidoId: string | null) => {
  const { data: asistentesActuales } = useAsistentesActualesQuery(asistidoId, residenciaId);

  return useQuery({
    queryKey: usuariosAsistidosKeys.usuariosParaAsignar(residenciaId, asistidoId || ''),
    queryFn: async (): Promise<Pick<Usuario, 'id' | 'nombre' | 'apellido' | 'roles'>[]> => {
      if (!residenciaId || !asistidoId) return [];

      // Calculamos los excluidos correctamente
      const idsAsistentesActuales = asistentesActuales?.map(a => a.id) || [];
      const idsExcluidos = new Set([asistidoId, ...idsAsistentesActuales]); // Usamos Set para búsqueda O(1)

      const usuariosRef = collection(db, "usuarios");
      const q = query(usuariosRef, where("residenciaId", "==", residenciaId));
      const querySnapshot = await getDocs(q);

      // 3. Aplicamos el filtro en memoria antes de retornar
      return querySnapshot.docs
          .filter(doc => !idsExcluidos.has(doc.id)) // seguimos excluyendo id's ya asignados o el propio asistido
          .map(doc => {
            const data = doc.data() as Usuario;
            return { id: doc.id, nombre: data.nombre, apellido: data.apellido, roles: data.roles || [] };
          });
    },
    enabled: !!asistidoId && !!residenciaId && asistentesActuales !== undefined,
    // Esperamos a que la primera query termine para saber a quién excluir
  });
};
