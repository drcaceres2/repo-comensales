import { format, FormatOptions, getDay, addDays } from 'date-fns';
import { fromZonedTime, toZonedTime, formatInTimeZone } from 'date-fns-tz';
import { DayOfWeekKey } from '@/../../shared/models/types';
import { es } from 'date-fns/locale'; // Spanish locale for ISO 8601 week (Monday first)

// --- Helper Functions for Date/Day Operations ---

// Converts 'lunes', 'martes', etc. to a number (0=Monday, 1=Tuesday, ..., 6=Sunday for consistency with ISO 8601 if needed, or date-fns getDay-like)
// date-fns getDay: Sunday=0, Monday=1, ..., Saturday=6
// ISO 8601 weekDay: Monday=1, ..., Sunday=7
// For this component, let's try to stick to DayOfWeekKey strings primarily and convert to numbers for date-fns where necessary.

export const dayKeyToDateFnsNumber = (day: DayOfWeekKey): number => {
  // date-fns: Sunday=0, Monday=1, ..., Saturday=6
  const map: Record<DayOfWeekKey, number> = {
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

// Helper to get a Date object for a specific DayOfWeekKey within a given week (represented by its start date)
export const dayOfWeekKeyToDate = (dayKey: DayOfWeekKey, weekStartDate: Date): Date => {
  const targetDayIndex = dayKeyToDateFnsNumber(dayKey); // 0 (Sun) - 6 (Sat)
  const weekStartDayIndex = getDay(weekStartDate); // 0 (Sun) - 6 (Sat)
  
  // Calculate difference, ensuring we handle week wrap-around correctly if weekStartDate is not Sunday
  // Since our weekStartDate is Monday (from startOfWeek with locale:es, weekStartsOn:1)
  // getDay(weekStartDate) will be 1.
  // If targetDayIndex is 0 (Sunday) and weekStartDayIndex is 1 (Monday), diff is -1. addDays(monday, -1) = Sunday. This logic is complex.
  // A simpler way: startOfWeek already gives Monday. Add days based on the difference from Monday.
  let daysToAdd = targetDayIndex - 1; // Assuming Monday is 1 from dayKeyToDateFnsNumber
  if (dayKey === 'domingo') daysToAdd = 6; // Sunday is 6 days after Monday

  return addDays(weekStartDate, daysToAdd);
};

// Helper to convert a Date to DayOfWeekKey ('lunes', 'martes', etc.)
export const formatToDayOfWeekKey = (date: Date): DayOfWeekKey => {
  // format with 'eeee' gives full day name, locale handles language
  const dayString = format(date, 'eeee', { locale: es }).toLowerCase();
  // Ensure it matches your DayOfWeekKey type, e.g., 'miércoles' -> 'miercoles'
  let dayName: DayOfWeekKey;
  if (dayString === 'miércoles') dayName = 'miercoles';
  else if (dayString === 'sábado') dayName = 'sabado';
  else dayName = dayString as DayOfWeekKey; 
  return dayName;
};
interface HorarioComidaProps {
  fecha: string; // "YYYY-MM-DD"
  hora?: string; // "HH:MM"
  zonaHoraria: string; // "Europe/Madrid"
}
export function formatoIsoCompleto({ fecha, hora, zonaHoraria }: HorarioComidaProps): Date | null {
  
  if (!fecha || !zonaHoraria ) {
    console.log("Faltan parámetros (formatIsoCompleto2)");
    return null;
  }

  let fechaHoraString: string;
  let fechaIsoCompleto: Date;
  if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/.test(fecha)) {
    if(!hora || hora === fecha.slice(12,5)){
      fechaHoraString = fecha;
      fechaIsoCompleto = new Date(
        format(
          toZonedTime(fechaHoraString, zonaHoraria),
          'YYYY-MM-DDTHH:mmXXX', 
          { timeZone: zonaHoraria } as FormatOptions
        )
      )
    } else {
      console.log("Información contradictoria (formatIsoCompleto2)");
      return null;  
    }
  } else {
    if(/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      if (!hora) {
        fechaHoraString = `${fecha}T00:00`;
      } else if(/^\d{2}:\d{2}$/.test(hora) || /^\d{2}:\d{2}:\d{2}$/.test(hora)) {
        fechaHoraString = `${fecha}T${hora}`;
      } else {
        console.log("Formato inválido de fecha y/o hora (formatoIsoCompleto");
        return null;
      }
    } else if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(fecha) || /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(fechaHora)) {
      fechaHoraString = fecha.replace(" ", "T");
    } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(fecha) 
            || /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(fecha)
            || /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(fecha))
    {
      fechaHoraString = fecha;
    } else {
      console.log("Formato de fechaHora incorrecto (formatIsoCompleto2)");
      return null;
    }
    const fechaHoraEnZonaResidencia = fromZonedTime(fechaHoraString, zonaHoraria);
    fechaIsoCompleto = new Date(
      format(
        toZonedTime(fechaHoraEnZonaResidencia, zonaHoraria),
        'YYYY-MM-DDTHH:mmXXX', 
        { timeZone: zonaHoraria } as FormatOptions
      )
    )
  }

  return fechaIsoCompleto;
}


interface HorarioComidaProps1 {
  fecha: string; // "YYYY-MM-DD"
  hora?: string; // "HH:MM"
  zonaHoraria: string; // "Europe/Madrid"
}
export function formatoIsoCompleto1({ fecha, hora, zonaHoraria } : HorarioComidaProps1): Date | null {
  
  if (!fecha || !zonaHoraria ) return null;
  if (!hora) hora='00:00';

  // 1. Combina fecha y hora en un string ISO-like
  const fechaHoraString = `${fecha}T${hora}`;

  // 2. Crea un objeto Date que representa ese momento EXACTO en la zona horaria de la residencia.
  // Primero lo convertimos a UTC para tener una referencia universal y luego lo formateamos.
  const fechaHoraEnZonaResidencia = fromZonedTime(fechaHoraString, zonaHoraria);

  // 3. Formatea la fecha para mostrarla al usuario. 
  // La formateamos de vuelta a la zona horaria original para asegurarnos de que se muestre correctamente.
  return new 
    Date(
      format(
        toZonedTime(fechaHoraEnZonaResidencia, zonaHoraria),
        'YYYY-MM-DDTHH:mmXXX', 
        { timeZone: zonaHoraria } as FormatOptions
      )
    );
}
interface HorarioComidaProps2 {
  fechaHora: string; // "YYYY-MM-DD HH:MM"
  zonaHoraria: string; // "Europe/Madrid"
}
export function formatoIsoCompleto2({ fechaHora, zonaHoraria}: HorarioComidaProps2): Date | null {
  
  if (!fechaHora || !zonaHoraria ) {
    console.log("Faltan parámetros (formatIsoCompleto2)");
    return null;
  }

  let fechaHoraString: string;
  if(/^\d{4}-\d{2}-\d{2}$/.test(fechaHora)) {
    fechaHoraString = `${fechaHora}T00:00`;
  } else if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(fechaHora) || /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(fechaHora)) {
    fechaHoraString = fechaHora.replace(" ", "T");
  } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(fechaHora)) {
    fechaHoraString = fechaHora;
  } else {
    console.log("Formato de fechaHora incorrecto (formatIsoCompleto2)");
    return null;
  }

  // 1. Crea un objeto Date que representa ese momento EXACTO en la zona horaria de la residencia.
  // Primero lo convertimos a UTC para tener una referencia universal y luego lo formateamos.
  const fechaHoraEnZonaResidencia = fromZonedTime(fechaHora, zonaHoraria);

  // 3. Formatea la fecha para mostrarla al usuario. 
  // La formateamos de vuelta a la zona horaria original para asegurarnos de que se muestre correctamente.
  return new 
    Date(
      format(
        toZonedTime(fechaHoraEnZonaResidencia, zonaHoraria),
        'YYYY-MM-DDTHH:mmXXX', 
        { timeZone: zonaHoraria } as FormatOptions
      )
    );
}