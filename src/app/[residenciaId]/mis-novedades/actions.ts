"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/firebaseAdmin";
import { requireAuth } from "@/lib/serverAuth";
import { NovedadOperativa, NovedadOperativaCreateSchema, NovedadOperativaUpdateSchema } from "shared/schemas/novedades";

type NovedadCreatePayload = Omit<NovedadOperativa, "id" | "timestampCreacion" | "timestampActualizacion" | "autorId" | "residenciaId" | "estado" | "fechaProgramada">;

export async function crearNovedadAction(
  residenciaId: string,
  payload: NovedadCreatePayload
) {
  try {
    const { uid: autorId, residenciaId: userResidenciaId } = await requireAuth();

    if (residenciaId !== userResidenciaId) {
      return { success: false, error: "Acceso no autorizado." };
    }

    const validatedData = NovedadOperativaCreateSchema.safeParse(payload);

    if (!validatedData.success) {
      return { success: false, error: "Datos inválidos.", details: validatedData.error.issues };
    }

    const nuevaNovedad = {
      ...validatedData.data,
      residenciaId,
      autorId,
      estado: "pendiente" as const,
      fechaProgramada: new Date().toISOString().split('T')[0],
      timestampCreacion: new Date().toISOString(),
      timestampActualizacion: new Date().toISOString(),
    };

    const docRef = await db.collection("novedadesOperativas").add(nuevaNovedad);

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
  payload: Partial<NovedadOperativa>
) {
  try {
    const { uid: autorId } = await requireAuth();

    const validatedData = NovedadOperativaUpdateSchema.safeParse(payload);
    if (!validatedData.success) {
        return { success: false, error: "Datos inválidos.", details: validatedData.error.issues };
    }

    const novedadRef = db.collection("novedadesOperativas").doc(novedadId);

    await db.runTransaction(async (transaction) => {
        const novedadDoc = await transaction.get(novedadRef);
        if (!novedadDoc.exists) throw new Error("La novedad no existe.");
        
        const novedadData = novedadDoc.data();
        if (novedadData?.autorId !== autorId) throw new Error("No tiene permiso para editar esta novedad.");
        if (novedadData?.estado !== "pendiente") throw new Error("No se puede modificar una novedad ya procesada.");

        transaction.update(novedadRef, { 
            ...validatedData.data,
            timestampActualizacion: new Date().toISOString(),
        });
    });
    
    revalidatePath(`/${residenciaId}/mis-novedades`);

    return { success: true };
  } catch (error: any) {
    console.error("Error en actualizarNovedadAction:", error);
    return { success: false, error: error.message || "No se pudo actualizar la novedad." };
  }
}

export async function eliminarNovedadAction(novedadId: string, residenciaId: string) {
  try {
    const { uid: autorId } = await requireAuth();
    const novedadRef = db.collection("novedadesOperativas").doc(novedadId);
    
    await db.runTransaction(async (transaction) => {
        const novedadDoc = await transaction.get(novedadRef);
        if (!novedadDoc.exists) throw new Error("La novedad no existe o ya fue eliminada.");

        const novedadData = novedadDoc.data();
        if (novedadData?.autorId !== autorId) throw new Error("No tiene permiso para eliminar esta novedad.");
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
