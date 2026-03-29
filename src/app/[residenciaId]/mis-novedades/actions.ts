"use server";

import { revalidatePath } from "next/cache";
import { db, FieldValue } from "@/lib/firebaseAdmin";
import {
  type NovedadInternaFormValues,
  type NovedadInternaUpdate,
  NovedadInternaFormSchema,
  NovedadInternaUpdateSchema
} from "shared/schemas/novedades";
import {obtenerInfoUsuarioServer} from "@/lib/obtenerInfoUsuarioServer";

type NovedadCreatePayload = NovedadInternaFormValues;

const getCollectionPath = (residenciaId: string) => `residencias/${residenciaId}/novedadesOperativas`;

export async function crearNovedadAction(
  residenciaId: string,
  payload: NovedadCreatePayload
) {
  console.log("[crearNovedadAction] payload:", payload, "residenciaId", residenciaId);
  try {
    const { usuarioId: autorId, residenciaId: userResidenciaId } = await obtenerInfoUsuarioServer();

    if (residenciaId !== userResidenciaId) {
      console.warn("[crearNovedadAction] residencia mismatch", residenciaId, userResidenciaId);
      return { success: false, error: "Acceso no autorizado." };
    }

    const validatedData = NovedadInternaFormSchema.safeParse(payload);

    if (!validatedData.success) {
      console.warn("[crearNovedadAction] validación fallida", validatedData.error);
      return { success: false, error: "Datos inválidos.", details: validatedData.error.issues };
    }

    const nuevaNovedad = {
      ...validatedData.data,
      origen: "interno" as const,
      residenciaId,
      autorId,
      estado: "pendiente" as const,
      fechaProgramada: new Date().toISOString().split("T")[0],
      // use server-side timestamps to keep clock consistent and sortable
      timestampCreacion: FieldValue.serverTimestamp(),
    };

    const docRef = await db.collection(getCollectionPath(residenciaId)).add(nuevaNovedad);
    console.log("[crearNovedadAction] document created with id", docRef.id);

    revalidatePath(`/${residenciaId}/mis-novedades`);

    return { success: true, data: { id: docRef.id } };
  } catch (error) {
    console.error("Error en crearNovedadAction:", error);
    return { success: false, error: "No se pudo crear la novedad." };
  }
}

export async function actualizarNovedadAction(
  residenciaId: string,
  novedadId: string,
  payload: NovedadInternaUpdate
) {
  console.log(`[actualizarNovedadAction] Iniciando. Novedad ID: ${novedadId}`);
  try {
    console.log("[actualizarNovedadAction] 1. Autenticando usuario...");
    const { usuarioId: autorId } = await obtenerInfoUsuarioServer();
    console.log(`[actualizarNovedadAction] 2. Usuario autenticado: ${autorId}`);

    console.log("[actualizarNovedadAction] 3. Validando payload...", payload);
    const validatedData = NovedadInternaUpdateSchema.safeParse(payload);
    if (!validatedData.success) {
        console.error("[actualizarNovedadAction] Error de validación:", validatedData.error);
        return { success: false, error: "Datos inválidos.", details: validatedData.error.issues };
    }
    console.log("[actualizarNovedadAction] 4. Payload validado.");

    const novedadRef = db.collection(getCollectionPath(residenciaId)).doc(novedadId);
    console.log(`[actualizarNovedadAction] 5. Obteniendo documento: ${novedadRef.path}`);

    const novedadDoc = await novedadRef.get();
    console.log("[actualizarNovedadAction] 6. Documento obtenido.");

    if (!novedadDoc.exists) {
      console.error("[actualizarNovedadAction] Error: La novedad no existe.");
      throw new Error("La novedad no existe.");
    }
    
    const novedadData = novedadDoc.data();
    console.log("[actualizarNovedadAction] 7. Verificando permisos...");
    if (novedadData?.autorId !== autorId) {
      console.error("[actualizarNovedadAction] Error: Permiso denegado (autorId no coincide).");
      throw new Error("No tiene permiso para editar esta novedad.");
    }
    if (novedadData?.origen !== "interno") {
      console.error("[actualizarNovedadAction] Error: El origen no es interno.");
      throw new Error("Solo se pueden editar novedades internas.");
    }
    if (novedadData?.estado !== "pendiente") {
      console.error("[actualizarNovedadAction] Error: La novedad no está pendiente.");
      throw new Error("No se puede modificar una novedad ya procesada.");
    }
    console.log("[actualizarNovedadAction] 8. Permisos verificados.");

    console.log("[actualizarNovedadAction] 9. Actualizando documento...");
    await novedadRef.update({ 
        ...validatedData.data,
    });
    console.log("[actualizarNovedadAction] 10. Documento actualizado.");
    
    console.log("[actualizarNovedadAction] 11. Revalidando path...");
    revalidatePath(`/${residenciaId}/mis-novedades`);
    console.log("[actualizarNovedadAction] 12. Path revalidado.");

    console.log("[actualizarNovedadAction] Finalizado con éxito.");
    return { success: true };
  } catch (error: any) {
    console.error("[actualizarNovedadAction] Error en el bloque catch:", error);
    return { success: false, error: error.message || "No se pudo actualizar la novedad." };
  }
}

export async function eliminarNovedadAction(novedadId: string, residenciaId: string) {
  try {
    const { usuarioId: autorId } = await obtenerInfoUsuarioServer();
    const novedadRef = db.collection(getCollectionPath(residenciaId)).doc(novedadId);
    
    await db.runTransaction(async (transaction) => {
        const novedadDoc = await transaction.get(novedadRef);
        if (!novedadDoc.exists) throw new Error("La novedad no existe o ya fue eliminada.");

        const novedadData = novedadDoc.data();
        if (novedadData?.autorId !== autorId) throw new Error("No tiene permiso para eliminar esta novedad.");
        if (novedadData?.origen !== "interno") throw new Error("Solo se pueden eliminar novedades internas.");
        if (novedadData?.estado !== "pendiente") throw new Error("No se puede eliminar una novedad ya procesada.");

        transaction.delete(novedadRef);
    });

    revalidatePath(`/${residenciaId}/mis-novedades`);
    
    return { success: true };
  } catch (error: any) {
    console.error("Error en eliminarNovedadAction:", error);
    return { success: false, error: error.message || "No se pudo eliminar la novedad." };
  }
}
