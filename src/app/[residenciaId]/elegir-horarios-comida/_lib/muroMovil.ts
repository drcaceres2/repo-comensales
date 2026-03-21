import { FechaHoraIso, FechaIso } from 'shared/schemas/fechas';
import { z } from 'zod';

const FechaSimpleSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const FechaHoraSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/);

/**
 * Normaliza una fecha o fecha-hora a formato YYYY-MM-DDTHH:mm:ss para comparación
 * lexicográfica válida en hora local de la residencia (sin offset).
 *
 * Acepta:
 *   'YYYY-MM-DD'
 *   'YYYY-MM-DDTHH:mm'
 *   'YYYY-MM-DDTHH:mm:ss'
 *   variantes con milisegundos (.sss), con sufijo Z, o con offset ±HH:mm
 *
 * En todos los casos descarta la información de zona horaria y trata la parte
 * de fecha-hora como hora local de la residencia.
 */
function normalizarFechaComparable(valor: FechaHoraIso | FechaIso, etiqueta: string): string {
  if (valor.trim().length === 0) {
    throw new Error(`[estaMuroMovilCerrado] ${etiqueta} es obligatorio y debe ser string.`);
  }

  // Eliminar milisegundos y cualquier indicador de zona horaria
  // (Z, +HH:mm, -HH:mm, +HHmm, -HHmm), tratando lo restante como hora local.
  const limpio = valor.trim()
    .replace(/\.\d+/, '')                      // quita milisegundos
    .replace(/(Z|[+-]\d{2}:?\d{2})$/i, '');   // quita Z o offset ±HH[:mm]

  if (FechaSimpleSchema.safeParse(limpio).success) {
    return `${limpio}T00:00:00`;
  }

  if (FechaHoraSchema.safeParse(limpio).success) {
    const conT = limpio.replace(' ', 'T');
    const hora = conT.split('T')[1] ?? '';
    return hora.length === 5 ? `${conT}:00` : conT;
  }

  throw new Error(
    `[estaMuroMovilCerrado] ${etiqueta} tiene formato inválido. Use YYYY-MM-DD o YYYY-MM-DDTHH:mm[:ss]. Recibido: ${valor}`
  );
}

/**
 * Evalúa si una alternativa está bloqueada por el proceso de solicitud consolidada.
 *
 * Todas las fechas se interpretan como hora local de la residencia (sin offset).
 * La comparación es lexicográfica sobre strings YYYY-MM-DDTHH:mm:ss, lo cual es
 * válido para ISO 8601 siempre que ambos valores estén en la misma zona horaria.
 *
 * @param horaCorteAlternativa - Resultado de `calcularHorarioReferenciaSolicitud`
 *   para esta alternativa y fecha (o el valor ya persistido en SlotEfectivo.opcionesActivas).
 * @param horaReferenciaProceso - `fechaHoraReferenciaUltimaSolicitud` del singleton
 *   (momento de la última consolidación del Director).
 * @returns `true` si la referencia alcanzó o superó el corte → muro CERRADO.
 */
export function estaMuroMovilCerrado(
  horaCorteAlternativa: FechaHoraIso | FechaIso,
  horaReferenciaProceso: FechaHoraIso | FechaIso
): boolean {
  const corte = normalizarFechaComparable(horaCorteAlternativa, 'horaCorteAlternativa');
  const referencia = normalizarFechaComparable(horaReferenciaProceso, 'horaReferenciaProceso');
  return referencia >= corte;
}