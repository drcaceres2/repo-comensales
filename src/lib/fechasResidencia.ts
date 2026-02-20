import { format, getDay, addDays, endOfDay, startOfDay, startOfWeek, endOfWeek, isWithinInterval, isBefore, isAfter, parseISO } from 'date-fns';
import { fromZonedTime, toZonedTime, formatInTimeZone } from 'date-fns-tz';
import { es } from 'date-fns/locale'; // Spanish locale for ISO 8601 week (Monday first)
import { FechaIso, FechaHoraIso, ZonaHorariaIana, DiaDeLaSemana } from '../../shared/models/types';

export interface campoFechaConZonaHoraria {
    fecha: FechaIso | FechaHoraIso; // fecha-hora, fecha u hora guardada en formato ISO: "YYYY-MM-DD" / "yyyy-MM-dd HH:mm" / "yyyy-MM-dd HH:mm:ss" / "HH:mm" / "HH:mm:ss"
    zonaHoraria: ZonaHorariaIana; // formato IANA de zona horaria
}

// --- Helper Functions for Date/Day Operations ---

// Converts 'lunes', 'martes', etc. to a number (0=Monday, 1=Tuesday, ..., 6=Sunday for consistency with ISO 8601 if needed, or date-fns getDay-like)
// date-fns getDay: Sunday=0, Monday=1, ..., Saturday=6
// ISO 8601 weekDay: Monday=1, ..., Sunday=7
// For this component, let's try to stick to DiaDeLaSemana strings primarily and convert to numbers for date-fns where necessary.

export const dayKeyToDateFnsNumber = (day: DiaDeLaSemana): number => {
  // date-fns: Sunday=0, Monday=1, ..., Saturday=6
  const map: Record<DiaDeLaSemana, number> = {
    domingo: 0,
    lunes: 1,
    martes: 2,
    miercoles: 3,
    jueves: 4,
    viernes: 5,
    sabado: 6,
  };
  return map[day];
};

// Helper to get a Date object for a specific DiaDeLaSemana within a given week (represented by its start date)
export const dayOfWeekKeyToDate = (dayKey: DiaDeLaSemana, weekStartDate: Date): Date => {
  const targetDayIndex = dayKeyToDateFnsNumber(dayKey); // 0 (Sun) - 6 (Sat)
  
  // Calculate difference, ensuring we handle week wrap-around correctly if weekStartDate is not Sunday
  // Since our weekStartDate is Monday (from startOfWeek with locale:es, weekStartsOn:1)
  // getDay(weekStartDate) will be 1.
  // If targetDayIndex is 0 (Sunday) and weekStartDayIndex is 1 (Monday), diff is -1. addDays(monday, -1) = Sunday. This logic is complex.
  // A simpler way: startOfWeek already gives Monday. Add days based on the difference from Monday.
  let daysToAdd = targetDayIndex - 1; // Assuming Monday is 1 from dayKeyToDateFnsNumber
  if (dayKey === 'domingo') daysToAdd = 6; // Sunday is 6 days after Monday

  return addDays(weekStartDate, daysToAdd);
};

// Helper to convert a Date to DiaDeLaSemana ('lunes', 'martes', etc.)
export const formatToDayOfWeekKey = (date: Date): DiaDeLaSemana => {
  // format with 'eeee' gives full day name, locale handles language
  const dayString = format(date, 'eeee', { locale: es }).toLowerCase();
  // Ensure it matches your DiaDeLaSemana type, e.g., 'miércoles' -> 'miercoles'
  let dayName: DiaDeLaSemana;
  if (dayString === 'miércoles') dayName = 'miercoles';
  else if (dayString === 'sábado') dayName = 'sabado';
  else dayName = dayString as DiaDeLaSemana; 
  return dayName;
};
interface formatoIsoCompletoProps {
  fecha: string | Date; // "YYYY-MM-DD"
  hora?: string; // "HH:MM"
  zonaHoraria: string; // "Europe/Madrid"
}
export function formatoIsoCompletoString({ fecha, hora, zonaHoraria }: formatoIsoCompletoProps): string | null {
  if (!fecha || !zonaHoraria ) { console.log("Faltan parámetros (formatoIsoCompletoString)"); return null; }
  let fechaIsoString: string; 
  let fechaIsoStringZonaResidencia: string;
  if(typeof fecha === 'string') {
    if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/.test(fecha) || /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}:\d{2}$/.test(fecha)) {
      if(!hora || hora === fecha.slice(12,5)){
        fechaIsoStringZonaResidencia = formatInTimeZone(fecha, zonaHoraria, 'YYYY-MM-DDTHH:mm:ssXXX');
      } else {
        console.log("Información contradictoria (formatIsoCompleto)");
        return null;  
      }
    } else {
      if(/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
        if (!hora) {
          fechaIsoString = `${fecha}T00:00`;
        } else if(/^\d{2}:\d{2}$/.test(hora) || /^\d{2}:\d{2}:\d{2}$/.test(hora)) {
          fechaIsoString = `${fecha}T${hora}`;
        } else {
          console.log("Formato inválido de fecha y/o hora (formatoIsoCompleto");
          return null;
        }
      } else if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(fecha) 
              || /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(fecha)) {
        fechaIsoString = fecha.replace(" ", "T");
      } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(fecha) 
              || /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(fecha))
      {
        fechaIsoString = fecha;
      } else { 
        console.log("Formato de fecha incorrecto (formatIsoCompleto2)"); 
        return null; 
      }
      fechaIsoStringZonaResidencia = formatInTimeZone(
        toZonedTime(
          fromZonedTime(
            fechaIsoString, 
            zonaHoraria), 
          zonaHoraria),
          zonaHoraria,
        'YYYY-MM-DDTHH:mm:ssXXX'
      );
    }
  } else {
    fechaIsoStringZonaResidencia = formatInTimeZone(fecha, zonaHoraria, 'YYYY-MM-DDTHH:mm:ssXXX');
  }
  return fechaIsoStringZonaResidencia;
}
export function formatoIsoCompletoDate({ fecha, hora, zonaHoraria }: formatoIsoCompletoProps): Date | null {
  const fechaString = formatoIsoCompletoString({ fecha, hora, zonaHoraria });
  if (!fechaString) return null;
  return new Date(fechaString);
}
export function formatoIsoFinalDiaString({ fecha, hora, zonaHoraria }: formatoIsoCompletoProps): string | null {
  if (!fecha || !zonaHoraria ) { console.log("Faltan parámetros (formatoIsoFinalDiaString)"); return null; }
  const fechaIsoStringZonaResidencia = formatoIsoCompletoString({ fecha, hora, zonaHoraria });
  if (!fechaIsoStringZonaResidencia) {
    console.log("No se recibió una fecha válida para obtener el final del dia (formatoIsoFinalDiaString)");
    return null;
  }
  return formatInTimeZone(endOfDay(fechaIsoStringZonaResidencia),zonaHoraria,'YYYY-MM-DDTHH:mm:ssXXX');
}
export function formatoIsoInicioDiaString({ fecha, hora, zonaHoraria }: formatoIsoCompletoProps): string | null {
  if (!fecha || !zonaHoraria ) { console.log("Faltan parámetros (formatIsoInicioDiaString)"); return null; }
  const fechaIsoStringZonaResidencia = formatoIsoCompletoString({ fecha, hora, zonaHoraria });
  if (!fechaIsoStringZonaResidencia) {
    console.log("No se recibió una fecha válida para obtener el final del dia (formatoIsoFinalDiaString)");
    return null;
  }
  return formatInTimeZone(startOfDay(fechaIsoStringZonaResidencia),zonaHoraria,'YYYY-MM-DDTHH:mm:ssXXX');
}
export function formatoIsoFinalSemanaString({ fecha, hora, zonaHoraria }: formatoIsoCompletoProps): string | null {
  if (!fecha || !zonaHoraria ) { console.log("Faltan parámetros (formatoIsoFinalSemanaString)"); return null; }
  const fechaIsoStringZonaResidencia = formatoIsoCompletoString({ fecha, hora, zonaHoraria });
  if (!fechaIsoStringZonaResidencia) {
    console.log("No se recibió una fecha válida para obtener el final del dia (formatoIsoFinalSemanaString)");
    return null;
  }
  return formatInTimeZone(endOfWeek(fechaIsoStringZonaResidencia,{ locale: es, weekStartsOn: 1 }),zonaHoraria,'YYYY-MM-DDTHH:mm:ssXXX');
}
export function formatoIsoInicioSemanaString({ fecha, hora, zonaHoraria }: formatoIsoCompletoProps): string | null {
  if (!fecha || !zonaHoraria ) { console.log("Faltan parámetros (formatoIsoFinalSemanaString)"); return null; }
  const fechaIsoStringZonaResidencia = formatoIsoCompletoString({ fecha, hora, zonaHoraria });
  if (!fechaIsoStringZonaResidencia) {
    console.log("No se recibió una fecha válida para obtener el final del dia (formatoIsoFinalSemanaString)");
    return null;
  }
  return formatInTimeZone(startOfWeek(fechaIsoStringZonaResidencia,{ locale: es, weekStartsOn: 1 }),zonaHoraria,'YYYY-MM-DDTHH:mm:ssXXX');
}
export function fechaNormalizadaADate(fechaNormalizada: string): Date {
  return new Date(fechaNormalizada);
}
// Checks if a targetDate is within the effective range of an item with fechaAplicacion and fechaFinAplicacion
export const estaDentroFechas = (fecha: Date | string, fechaInicio: Date | string, fechaFin: Date | string, zonaHoraria: string): boolean | null => {
  if (!fecha || !fechaInicio || !fechaFin || !zonaHoraria) {
    console.log('No se obtuvieron suficientes parámetros (estaDentroFechas)')
    return null;
  }
  const fechaIso = formatoIsoCompletoDate({fecha, zonaHoraria});
  const fechaInicioIso = formatoIsoInicioDiaString({fecha: fechaInicio, zonaHoraria});
  const fechaFinIso = formatoIsoFinalDiaString({fecha: fechaFin, zonaHoraria});
  if (!fechaIso || !fechaInicioIso || !fechaFinIso) {
    console.log('Fallo en la conversión de fechas (estaDentroFechas)');
    return null;
  }
  return isWithinInterval(fechaIso, { start: fechaInicioIso, end: fechaFinIso });
};
export type resultadoComparacionIntervalo = 'anterior' | 'igual inicio' | 'dentro' | 'igual final' | 'posterior';
export const comparacionFechaSinHoraIntervalo = (fecha: Date | string, fechaInicio: Date | string, fechaFin: Date | string, zonaHoraria: string): resultadoComparacionIntervalo | null => {
  if (!fecha || !fechaInicio || !fechaFin || !zonaHoraria) {
    console.log('No se obtuvieron suficientes parámetros (estaDentroFechas)')
    return null;
  }
  const fechaIso = formatoIsoCompletoDate({fecha, zonaHoraria});
  const fechaInicioIso = formatoIsoInicioDiaString({fecha: fechaInicio, zonaHoraria});
  const fechaFinIso = formatoIsoFinalDiaString({fecha: fechaFin, zonaHoraria});
  if (!fechaIso || !fechaInicioIso || !fechaFinIso) {
    console.log('Fallo en la conversión de fechas (estaDentroFechas)');
    return null;
  }
  const fechaIsoSinHora = parseISO(format(fechaIso, "YYYY-MM-DD"));
  const fechaInicioIsoSinHora = parseISO(format(fechaInicioIso, "YYYY-MM-DD"));
  const fechaFinIsoSinHora = parseISO(format(fechaFinIso, "YYYY-MM-DD"));
  if (fechaIsoSinHora === fechaInicioIsoSinHora) return 'igual inicio';
  else if (fechaIsoSinHora === fechaFinIsoSinHora) return 'igual final';
  else if (fechaIsoSinHora < fechaInicioIsoSinHora) return 'anterior';
  else if (fechaIsoSinHora > fechaFinIsoSinHora) return 'posterior';
  else return 'dentro';
};

export const esAnteriorOIgualFechaSinHora = (fecha1: Date | string, fecha2: Date | string, zonaHoraria: string): boolean | null => {
  if (!fecha1 || !fecha2 || !zonaHoraria) {
    console.log('No se obtuvieron suficientes parámetros (esAnterior)')
    return null;
  }
  const fecha1Iso = formatoIsoCompletoString({fecha: fecha1, zonaHoraria});
  const fecha2Iso = formatoIsoCompletoString({fecha: fecha2, zonaHoraria});
  if (!fecha1Iso || !fecha2Iso) {
    console.log('Las fechas proporcionadas no son válidas (esAnterior)')
    return null;
  }
  const fecha1IsoSinHora = format(fecha1Iso, "YYYY-MM-DD");
  const fecha2IsoSinHora = format(fecha1Iso, "YYYY-MM-DD");
  return isBefore(fecha1IsoSinHora, fecha2IsoSinHora) || fecha1IsoSinHora===fecha2IsoSinHora;
}
export type resultadoComparacionFecha = 'antes' | 'igual' | 'despues';
export const comprararFechasSinHora = (fecha1: Date | string, fecha2: Date | string, zonaHoraria: string): resultadoComparacionFecha | null => {
  if (!fecha1 || !fecha2 || !zonaHoraria) {
    console.log('No se obtuvieron suficientes parámetros (comprararFechasSinHora)');
    return null;
  }
  const fecha1Iso = formatoIsoCompletoString({fecha: fecha1, zonaHoraria});
  const fecha2Iso = formatoIsoCompletoString({fecha: fecha2, zonaHoraria});
  if (!fecha1Iso || !fecha2Iso) {
    console.log('Las fechas proporcionadas no son válidas (comprararFechasSinHora)');
    return null;
  }
  const fecha1IsoSinHora = format(fecha1Iso, "YYYY-MM-DD");
  const fecha2IsoSinHora = format(fecha2Iso, "YYYY-MM-DD");
  if(fecha1IsoSinHora===fecha2IsoSinHora)
    return 'igual';
  else if(isBefore(fecha1IsoSinHora, fecha2IsoSinHora))
    return 'antes';
  else if(isAfter(fecha1IsoSinHora, fecha2IsoSinHora))
    return 'despues';
  else {
    console.log('Fallo en la comparación de fechas (comprararFechasSinHora)');
    return null;
  }
}

export const agregarDias = (fecha1: Date | string, dias: number, zonaHoraria: string): Date | null => {
  if (!fecha1 || !dias || !zonaHoraria) {
    console.log('No se obtuvieron suficientes parámetros (agregarDias)');
    return null;
  }
  const fecha1Iso = formatoIsoCompletoString({fecha: fecha1, zonaHoraria});
  if (!fecha1Iso) {
    console.log('La fecha proporcionada no es válida (agregarDias)');
    return null;
  }
  return addDays(fecha1Iso, dias);
}