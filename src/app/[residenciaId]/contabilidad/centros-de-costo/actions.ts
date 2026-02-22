"use server"

import { db } from "@/lib/firebaseAdmin";
import { requireAuth } from "@/lib/serverAuth";
import { CentroDeCostoSchema } from "shared/schemas/contabilidad";
import { slugify } from "shared/utils/commonUtils";

/**
 * Interface consistente para las respuestas de las Server Actions
 */
interface ActionResponse<T = any> {
    success: boolean;
    data?: T;
    error?: string;
}

/**
 * Crea un nuevo Centro de Costo bajo la ruta residencias/{residenciaId}/centrosDeCosto/{slug}
 */
export async function crearCentroDeCosto(residenciaId: string, payload: unknown): Promise<ActionResponse> {
    try {
        // 1. Seguridad: Verificar auth y rol contador
        const auth = await requireAuth();
        if (!auth.roles.includes("contador")) {
            return { success: false, error: "No autorizado: Se requiere rol de contador." };
        }

        // 2. Generación de ID determinista (slug) basado en el nombre
        const rawData = payload as any;
        if (!rawData?.nombre) {
            return { success: false, error: "El nombre es obligatorio para generar el ID." };
        }
        
        const id = slugify(rawData.nombre);
        
        // 3. Inyección de ID y Validación con Zod
        const validatedData = CentroDeCostoSchema.parse({
            ...rawData,
            id
        });

        // 4. Guardado en Firestore
        await db.collection("residencias")
            .doc(residenciaId)
            .collection("centrosDeCosto")
            .doc(id)
            .set(validatedData);

        return { success: true, data: validatedData };

    } catch (error: any) {
        console.error("Error en crearCentroDeCosto:", error);
        return { 
            success: false, 
            error: error?.name === "ZodError" 
                ? "Error de validación: " + error.errors.map((e: any) => e.message).join(", ")
                : error.message || "Error desconocido al crear el Centro de Costo" 
        };
    }
}

/**
 * Actualiza un Centro de Costo existente
 */
export async function actualizarCentroDeCosto(residenciaId: string, id: string, payload: unknown): Promise<ActionResponse> {
    try {
        // 1. Seguridad: Verificar auth y rol contador
        const auth = await requireAuth();
        if (!auth.roles.includes("contador")) {
            return { success: false, error: "No autorizado: Se requiere rol de contador." };
        }

        // 2. Validación con Zod
        // Nota: El schema tiene .strict(), así que pasamos solo el payload validado.
        // Aseguramos que el id sea parte de la validación si es necesario, 
        // aunque .update() no requiere el ID en el cuerpo.
        const validatedData = CentroDeCostoSchema.partial().parse(payload);

        // 3. Actualización en Firestore
        await db.collection("residencias")
            .doc(residenciaId)
            .collection("centrosDeCosto")
            .doc(id)
            .update(validatedData);

        return { success: true };

    } catch (error: any) {
        console.error("Error en actualizarCentroDeCosto:", error);
        return { 
            success: false, 
            error: error?.name === "ZodError" 
                ? "Error de validación: " + error.errors.map((e: any) => e.message).join(", ")
                : error.message || "Error desconocido al actualizar el Centro de Costo" 
        };
    }
}

/**
 * Archiva (Soft Delete) un Centro de Costo
 */
export async function archivarCentroDeCosto(residenciaId: string, id: string): Promise<ActionResponse> {
    try {
        // 1. Seguridad: Verificar auth y rol contador
        const auth = await requireAuth();
        if (!auth.roles.includes("contador")) {
            return { success: false, error: "No autorizado: Se requiere rol de contador." };
        }

        // 2. Actualización de soft delete
        await db.collection("residencias")
            .doc(residenciaId)
            .collection("centrosDeCosto")
            .doc(id)
            .update({ estaActivo: false });

        return { success: true };

    } catch (error: any) {
        console.error("Error en archivarCentroDeCosto:", error);
        return { 
            success: false, 
            error: error.message || "Error desconocido al archivar el Centro de Costo" 
        };
    }
}
