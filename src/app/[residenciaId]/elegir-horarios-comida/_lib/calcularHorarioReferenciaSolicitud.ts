// Indexación idéntica a JavaScript Date.getUTCDay(): 0=domingo, 1=lunes ... 6=sábado
const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'] as const;

type HorarioSolicitudMinimo = {
  dia: string;
  horaSolicitud: string; // 'THH:mm' o 'HH:mm' (según HoraIsoSchema)
};

/**
 * Calcula la fecha-hora de cierre del muro móvil para una alternativa concreta en una fecha de comida.
 *
 * Dado `fecha` (la fecha del tiempo de comida), busca el `HorarioSolicitudData` correspondiente
 * al `horarioSolicitudId`, retrocede hasta la última ocurrencia del día de cierre ≤ `fecha`,
 * y combina esa fecha con la hora de solicitud del horario.
 *
 * El resultado está en hora local de la residencia (sin offset), listo para comparar
 * directamente con `fechaHoraReferenciaUltimaSolicitud` en `estaMuroMovilCerrado`.
 *
 * Ejemplo: fecha='2026-03-20' (viernes), horario.dia='jueves', horario.horaSolicitud='T10:00'
 *   → diasARestar=1 → fechaCierre='2026-03-19' → '2026-03-19T10:00:00'
 *
 * @param fecha - Fecha del tiempo de comida (YYYY-MM-DD, hora local de residencia).
 * @param horarioSolicitudId - ID del HorarioSolicitudData que rige la alternativa.
 * @param horariosSolicitud - Mapa Record<id, HorarioSolicitudData> del singleton.
 * @returns Fecha-hora de cierre en formato YYYY-MM-DDTHH:mm:ss (hora local de residencia).
 */
export function calcularHorarioReferenciaSolicitud(
  fecha: string,
  horarioSolicitudId: string,
  horariosSolicitud: Record<string, HorarioSolicitudMinimo>
): string {
  const horario = horariosSolicitud[horarioSolicitudId];
  if (!horario) {
    // Sin horario definido: fallback conservador – medianoche del mismo día.
    return `${fecha}T00:00:00`;
  }

  // Usar UTC midnight para interpretar `fecha` como fecha de calendario
  // sin desplazamientos de zona horaria al extraer el día de semana.
  const fechaDate = new Date(`${fecha}T00:00:00Z`);
  const diaMealNum = fechaDate.getUTCDay(); // 0=domingo, 1=lunes … 6=sábado

  const diaCierreNum = DIAS_SEMANA.indexOf(horario.dia as typeof DIAS_SEMANA[number]);
  if (diaCierreNum === -1) {
    // Día desconocido en el catálogo – fallback conservador.
    return `${fecha}T00:00:00`;
  }

  // Días a restar para encontrar la última ocurrencia del día de cierre ≤ fecha.
  // diasARestar === 0 → el cierre es el mismo día de la comida (p. ej. cierre viernes para comida viernes).
  const diasARestar = (diaMealNum - diaCierreNum + 7) % 7;

  const fechaCierreDate = new Date(fechaDate);
  fechaCierreDate.setUTCDate(fechaCierreDate.getUTCDate() - diasARestar);

  // YYYY-MM-DD de la fecha de cierre (en UTC, equivale a la fecha de calendario local).
  const fechaCierreIso = fechaCierreDate.toISOString().slice(0, 10);

  // Normalizar horaSolicitud: 'THH:mm' → 'HH:mm:ss'  |  'HH:mm' → 'HH:mm:ss'
  const horaRaw = horario.horaSolicitud.replace(/^T/, '');
  const hora = horaRaw.length === 5 ? `${horaRaw}:00` : horaRaw;

  return `${fechaCierreIso}T${hora}`;
}

