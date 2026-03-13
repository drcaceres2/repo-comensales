import { FechaHoraIso, FechaIso } from 'shared/schemas/fechas';
import { z } from 'zod';

const FechaSimpleSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const FechaHoraSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/);

function normalizarFechaComparable(valor: FechaHoraIso | FechaIso, etiqueta: string): string {
  if (typeof valor !== 'string' || valor.trim().length === 0) {
    throw new Error(`[estaMuroMovilCerrado] ${etiqueta} es obligatorio y debe ser string.`);
  }

  // Strip milliseconds and Z suffix to normalize any ISO 8601 variant
  // e.g. "2026-03-13T11:40:56.165Z" → "2026-03-13T11:40:56"
  const limpio = valor.trim().replace(/\.\d+/, '').replace(/Z$/, '');

  if (FechaSimpleSchema.safeParse(limpio).success) {
    const normalizado = `${limpio}T00:00:00`;
    const fecha = new Date(`${normalizado}Z`);
    if (Number.isNaN(fecha.getTime())) {
      throw new Error(`[estaMuroMovilCerrado] ${etiqueta} no es una fecha válida: ${valor}`);
    }
    return normalizado;
  }

  if (FechaHoraSchema.safeParse(limpio).success) {
    const conT = limpio.replace(' ', 'T');
    const partes = conT.split('T');
    const hora = partes[1] ?? '';
    const normalizado = hora.length === 5 ? `${conT}:00` : conT;
    const fecha = new Date(`${normalizado}Z`);
    if (Number.isNaN(fecha.getTime())) {
      throw new Error(`[estaMuroMovilCerrado] ${etiqueta} no es fecha-hora válida: ${valor}`);
    }
    return normalizado;
  }

  throw new Error(
    `[estaMuroMovilCerrado] ${etiqueta} tiene formato inválido. Use YYYY-MM-DD o YYYY-MM-DDTHH:mm[:ss]. Recibido: ${valor}`
  );
}

/**
 * Evalúa si una alternativa está bloqueada por el proceso de solicitud consolidada.
 * @param horaCorteAlternativa - El 'horarioReferenciaSolicitud' específico de esa configuración.
 * @param horaReferenciaProceso - La hora estampada en el Singleton cuando el Director inició la consolidación.
 * @returns boolean - `true` si la hora de referencia del proceso ya superó o igualó el corte de la alternativa (CERRADO).
 */
export function estaMuroMovilCerrado(
  horaCorteAlternativa: FechaHoraIso | FechaIso,
  horaReferenciaProceso: FechaHoraIso | FechaIso
): boolean {
  const corte = normalizarFechaComparable(horaCorteAlternativa, 'horaCorteAlternativa');
  const referencia = normalizarFechaComparable(horaReferenciaProceso, 'horaReferenciaProceso');

  // Al ser ISO 8601 completos (YYYY-MM-DDTHH:mm:ss.sssZ), 
  // la comparación de strings es lexicográficamente segura.
  return referencia >= corte;
}