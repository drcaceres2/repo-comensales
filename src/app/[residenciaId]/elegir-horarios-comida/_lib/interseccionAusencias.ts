import { Ausencia } from "shared/schemas/elecciones/domain.schema";

/**
 * Determina si un tiempo de comida específico está afectado por un registro de ausencia prolongada.
 * * @param fechaEvaluada - Fecha del día en evaluación (YYYY-MM-DD).
 * @param tiempoComidaId - ID del tiempo de comida evaluado (ej. 'almuerzo-viernes').
 * @param ausenciasUsuario - Arreglo de todas las ausencias vigentes del usuario.
 * @param ordenTiemposComida - Arreglo ordenado lógicamente de los IDs de tiempos de comida del día para evaluar cruces en los días de inicio/fin.
 * @returns Ausencia | undefined - Retorna el objeto de la ausencia si hay intersección.
 */
export function detectarInterseccionAusencia(
  fechaEvaluada: string,
  tiempoComidaId: string,
  ausenciasUsuario: Ausencia[],
  ordenTiemposComida: string[] 
): Ausencia | undefined {
  if (!ordenTiemposComida.includes(tiempoComidaId)) {
    throw new Error(
      `[detectarInterseccionAusencia] El tiempoComidaId '${tiempoComidaId}' no está presente en ordenTiemposComida.`
    );
  }

  const indiceEvaluado = ordenTiemposComida.indexOf(tiempoComidaId);

  const ausenciasOrdenadas = [...ausenciasUsuario].sort((a, b) => {
    if (a.fechaInicio !== b.fechaInicio) {
      return a.fechaInicio.localeCompare(b.fechaInicio);
    }
    return a.fechaFin.localeCompare(b.fechaFin);
  });

  for (const ausencia of ausenciasOrdenadas) {
    if (fechaEvaluada < ausencia.fechaInicio || fechaEvaluada > ausencia.fechaFin) {
      continue;
    }

    const esDiaInicio = fechaEvaluada === ausencia.fechaInicio;
    const esDiaFin = fechaEvaluada === ausencia.fechaFin;

    if (esDiaInicio) {
      if (!ausencia.primerTiempoAusente) {
        return ausencia;
      }

      const indicePrimerTiempo = ordenTiemposComida.indexOf(ausencia.primerTiempoAusente);
      if (indicePrimerTiempo === -1) {
        throw new Error(
          `[detectarInterseccionAusencia] primerTiempoAusente '${ausencia.primerTiempoAusente}' no está presente en ordenTiemposComida.`
        );
      }

      if (indiceEvaluado < indicePrimerTiempo) {
        continue;
      }
    }

    if (esDiaFin) {
      if (!ausencia.ultimoTiempoAusente) {
        return ausencia;
      }

      const indiceUltimoTiempo = ordenTiemposComida.indexOf(ausencia.ultimoTiempoAusente);
      if (indiceUltimoTiempo === -1) {
        throw new Error(
          `[detectarInterseccionAusencia] ultimoTiempoAusente '${ausencia.ultimoTiempoAusente}' no está presente en ordenTiemposComida.`
        );
      }

      if (indiceEvaluado > indiceUltimoTiempo) {
        continue;
      }
    }

    return ausencia;
  }

  return undefined;
}