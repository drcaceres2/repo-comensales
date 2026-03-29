"use server";

import { db, FieldValue } from "@/lib/firebaseAdmin";
import { obtenerInfoUsuarioServer } from "@/lib/obtenerInfoUsuarioServer";
import { chunkArray } from "shared/utils/serverUtils";
import {
  AsignacionMasivaUsuariosPayload,
  AsignacionMasivaUsuariosPayloadSchema,
  AsignacionUsuarioMutacionSchema,
  AsignacionUsuarioMutacion,
} from "shared/schemas/asignacionMasivaUsuarios";

const CHUNK_SIZE = 100;

function buildUpdateData(mutacion: AsignacionUsuarioMutacion) {
  const updateData: Record<string, unknown> = {
    fechaHoraModificacion: FieldValue.serverTimestamp(),
    gruposAnaliticosIds: [...new Set(mutacion.otrosGruposIds)].sort(),
  };
// TODO: Verificar fechaHoraModificacion, ha de pertenecer a esquema viejo
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
    // Log del payload recibido para diagnóstico en caso de validación fallida
    console.debug('[guardarAsignacionesMasivas] payload recibido:', JSON.stringify(payload));
    const sesion = await obtenerInfoUsuarioServer();
    if (!sesion.usuarioId) {
      return { success: false, error: "Usuario no autenticado." };
    }

    if (!residenciaId) {
      return { success: false, error: "residenciaId es obligatorio." };
    }

    const parsed = AsignacionMasivaUsuariosPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      // Loguear el detalle de validación para poder identificar el problema en el servidor
      try {
        console.error('[guardarAsignacionesMasivas] Validación Zod fallida (format):', parsed.error.format());
      } catch (e) {
        console.error('[guardarAsignacionesMasivas] Validación Zod fallida (flatten):', parsed.error.flatten());
      }

      // Intentar validar item por item para obtener errores más específicos
      try {
        if (Array.isArray((payload as any).mutaciones)) {
          console.error('[guardarAsignacionesMasivas] Detalle por mutación:');
          (payload as any).mutaciones.forEach((m: any, idx: number) => {
            const r = AsignacionUsuarioMutacionSchema.safeParse(m);
            if (!r.success) {
              console.error(`  Mutación[${idx}] inválida:`, JSON.stringify(m));
              try {
                console.error('    Errores:', r.error.format());
              } catch (e) {
                console.error('    Errores (flatten):', r.error.flatten());
              }
            }
          });
        }
      } catch (e) {
        console.error('[guardarAsignacionesMasivas] Error al desglosar mutaciones para diagnóstico', e);
      }

      // Devolver el error como string serializado para que el cliente pueda mostrarlo en el toast
      try {
        const serialized = JSON.stringify(parsed.error.flatten(), null, 2);
        return { success: false, error: serialized };
      } catch (e) {
        return { success: false, error: String(parsed.error) };
      }
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
