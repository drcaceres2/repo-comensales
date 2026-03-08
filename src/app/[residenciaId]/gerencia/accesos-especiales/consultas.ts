"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  UpdateMatrizAccesosPayload,
  AsistentePermisosDetalle,
} from "shared/schemas/usuariosAsistentes";
import { Usuario } from "shared/schemas/usuarios";
import { db, functions, 
  collection, query, where, getDocs, doc, getDoc,
  httpsCallable
} from "@/lib/firebase";

// --- Cloud Functions (Mutations) ---

const actualizarMatrizAccesos = httpsCallable<
  UpdateMatrizAccesosPayload,
  { success: boolean; message: string }
>(functions, "actualizarMatrizAccesos");

// El tipo para las variables de la mutación, incluyendo el contexto extra.
type ActualizarMatrizVariables = {
  payload: UpdateMatrizAccesosPayload;
  residenciaId: string;
};

export const useActualizarMatrizMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ payload }: ActualizarMatrizVariables) => {
      console.log("Calling 'actualizarMatrizAccesos' with payload:", payload);
      try {
        const result = await actualizarMatrizAccesos(payload);
        console.log("Function result:", result.data);
        return result.data;
      } catch (error) {
        console.error("Error calling 'actualizarMatrizAccesos':", error);
        throw error;
      }
    },
    onSuccess: (data, variables) => {
      console.log("Mutation successful:", data);
      // Ahora 'variables' contiene tanto el payload como el residenciaId
      queryClient.invalidateQueries({ queryKey: ["usuarios", { residenciaId: variables.residenciaId }] });
      queryClient.invalidateQueries({ queryKey: ["privilegiosUsuario", variables.payload.targetUserId] });
    },
    onError: (error) => {
      console.error("Error al actualizar la matriz de accesos:", error);
    },
  });
};

// --- Firestore SDK (Queries) ---

/**
 * Obtiene todos los usuarios de una residencia específica.
 */
export const useUsuariosElegiblesQuery = (residenciaId: string) => {
  return useQuery({
    queryKey: ["usuarios", { residenciaId }],
    queryFn: async () => {
      if (!residenciaId) return [];
      const usuariosRef = collection(db, "usuarios");
      const q = query(usuariosRef, where("residenciaId", "==", residenciaId));
      const querySnapshot = await getDocs(q);
      const usuarios = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Usuario));
      return usuarios;
    },
    enabled: !!residenciaId,
  });
};

/**
 * Obtiene el documento de un usuario específico y extrae sus privilegios de asistente.
 */
export const usePrivilegiosUsuarioQuery = (userId: string | null) => {
  return useQuery({
    queryKey: ["privilegiosUsuario", userId],
    // Dejamos que TypeScript infiera el tipo de retorno para evitar conflictos.
    // TanStack Query manejará el tipo 'AsistentePermisos | null' correctamente.
    queryFn: async () => {
      if (!userId) return null;
      const userDocRef = doc(db, "usuarios", userId);
      const userDoc = await getDoc(userDocRef);
      if (userDoc.exists()) {
        const userData = userDoc.data() as Usuario;
        return userData.asistente || null;
      }
      return null;
    },
    enabled: !!userId, // La query solo se ejecuta si userId no es nulo
  });
};
