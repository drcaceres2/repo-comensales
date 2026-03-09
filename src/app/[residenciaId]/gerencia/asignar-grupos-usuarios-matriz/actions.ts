"use server";

import { db, FieldValue } from "@/lib/firebaseAdmin";
import { obtenerInfoUsuarioServer } from "@/lib/obtenerInfoUsuarioServer";
import { chunkArray } from "@/lib/batchHelpers";
import {
  AsignacionMasivaUsuariosPayload,
  AsignacionMasivaUsuariosPayloadSchema,
  AsignacionUsuarioMutacion,
} from "shared/schemas/asignacionMasivaUsuarios";

const CHUNK_SIZE = 100;

function buildUpdateData(mutacion: AsignacionUsuarioMutacion) {
  const updateData: Record<string, unknown> = {
    fechaHoraModificacion: FieldValue.serverTimestamp(),
    gruposAnaliticosIds: [...new Set(mutacion.otrosGruposIds)].sort(),
  };

  updateData.grupoContableId =
    mutacion.grupoContableId === null
      ? FieldValue.delete()
      : mutacion.grupoContableId;

  updateData.grupoRestrictivoId =
    mutacion.grupoRestrictivoId === null
      ? FieldValue.delete()
      : mutacion.grupoRestrictivoId;

  return updateData;
}

export async function guardarAsignacionesMasivas(
  residenciaId: string,
  payload: AsignacionMasivaUsuariosPayload
) {
  try {
    const sesion = await obtenerInfoUsuarioServer();
    if (!sesion.usuarioId) {
      return { success: false, error: "Usuario no autenticado." };
    }

    if (!residenciaId) {
      return { success: false, error: "residenciaId es obligatorio." };
    }

    const parsed = AsignacionMasivaUsuariosPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      return { success: false, error: parsed.error.flatten() };
    }

    const mutaciones = parsed.data.mutaciones;
    if (mutaciones.length === 0) {
      return {
        success: true,
        data: { procesados: 0, ignorados: 0, errores: [] as Array<{ usuarioId: string; razon: string }> },
      };
    }

    const errores: Array<{ usuarioId: string; razon: string }> = [];
    let procesados = 0;

    const lotes = chunkArray(mutaciones, CHUNK_SIZE);

    for (const lote of lotes) {
      const batch = db.batch();
      let operacionesLote = 0;

      const usuariosSnap = await Promise.all(
        lote.map((item) => db.collection("usuarios").doc(item.usuarioId).get())
      );

      for (let i = 0; i < lote.length; i += 1) {
        const mutacion = lote[i];
        const usuarioSnap = usuariosSnap[i];

        if (!usuarioSnap.exists) {
          errores.push({ usuarioId: mutacion.usuarioId, razon: "Usuario no existe." });
          continue;
        }

        const usuarioData = usuarioSnap.data() as { residenciaId?: string };
        if (usuarioData.residenciaId !== residenciaId) {
          errores.push({
            usuarioId: mutacion.usuarioId,
            razon: "Usuario fuera de la residencia objetivo.",
          });
          continue;
        }

        batch.update(usuarioSnap.ref, buildUpdateData(mutacion));
        operacionesLote += 1;
      }

      if (operacionesLote > 0) {
        await batch.commit();
        procesados += operacionesLote;
      }
    }

    return {
      success: true,
      data: {
        procesados,
        ignorados: mutaciones.length - procesados,
        errores,
      },
    };
  } catch (error) {
    console.error("Error guardando asignaciones masivas:", error);
    return { success: false, error: "No se pudieron guardar las asignaciones." };
  }
}
