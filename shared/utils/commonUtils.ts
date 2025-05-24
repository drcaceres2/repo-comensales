import { campoFechaConZonaHoraria } from '../models/types';
import { isValid, format, Duration, add, intervalToDuration } from 'date-fns'
import { toDate, formatInTimeZone } from 'date-fns-tz'

export type resultadoComparacionFCZH = "mayor" | "igual" | "menor" | "invalido";

export const toDateFCZH = (fczh: campoFechaConZonaHoraria | null | undefined): string | null => {
    if (!fczh || !fczh.fecha || !fczh.zonaHoraria) {
      console.log("Objeto campoFechaConZonaHoraria incompleto, no se puede calcular fecha"); // e.g., "-07:00"
      return null;
    }
    const fechaISO = prepareFechaStringForParsing(fczh.fecha);
    if (!fechaISO) {
      console.log("Fecha en formato incorrecto, no se puede calcular fecha");
      return null;
    }
    return fechaISO;
  }
  
/**
 * Helper function to prepare the 'fecha' string from campoFechaConZonaHoraria
 * into a format more reliably parsed by date-fns-tz's toDate (ISO-like with 'T' separator).
 * Assumes that for comparison, 'fecha' represents a full date or date-time.
 * Time-only strings ("HH:mm", "HH:mm:ss") are not handled by this helper for comparison.
 */
const prepareFechaStringForParsing = (fechaOriginal: string): string | null => {
    // Case 1: "YYYY-MM-DD" (date only)
    if (/^\d{4}-\d{2}-\d{2}$/.test(fechaOriginal)) {
        return `${fechaOriginal}T00:00:00`; // Assume midnight
    }
    // Case 2: "YYYY-MM-DD HH:mm" (date and time, no seconds)
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(fechaOriginal)) {
        return `${fechaOriginal.replace(' ', 'T')}:00`; // Add 'T' and seconds
    }
    // Case 3: "YYYY-MM-DD HH:mm:ss" (date and time with seconds)
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(fechaOriginal)) {
        return fechaOriginal.replace(' ', 'T'); // Add 'T'
    }
    // Case 4: Already contains 'T' (likely already ISO-like)
    if (fechaOriginal.includes('T')) {
        return fechaOriginal;
    }
    
    // If the format is not one of the above, it's not supported by this helper for comparison.
    console.error(`prepareFechaStringForParsing: Fecha string "${fechaOriginal}" is not in an expected format for robust comparison (YYYY-MM-DD, YYYY-MM-DD HH:mm, or YYYY-MM-DD HH:mm:ss).`);
    return null;
};

/**
 * Creates a campoFechaConZonaHoraria object from a date string and timezone string.
 * The 'fecha' field will store the date as "YYYY-MM-DD".
 *
 * @param fechaStr The date string in "YYYY-MM-DD" format.
 * @param zonaHorariaStr The IANA timezone string (e.g., "America/New_York", "Europe/London", "UTC").
 * @returns A campoFechaConZonaHoraria object or null if inputs are invalid.
 */
export const crearFCZH_fecha = (
    fechaStr: string,
    zonaHorariaStr: string
  ): campoFechaConZonaHoraria | null => {
    if (!fechaStr || !zonaHorariaStr) {
      console.error("crearFCZH_fecha: Fecha y zona horaria son requeridos.");
      return null;
    }
  
    // For validation, assume midnight in the target timezone.
    const validationDateTimeStr = `${fechaStr}T00:00:00`;
  
    try {
      // Validate if the date and timezone form a real moment (at midnight).
      const validationDate = toDate(validationDateTimeStr, { timeZone: zonaHorariaStr });
  
      if (!isValid(validationDate)) {
        console.error(`crearFCZH_fecha: Combinación de fecha/zona horaria inválida: "${fechaStr}" en "${zonaHorariaStr}"`);
        return null;
      }
  
      // If valid, store the local date string.
      return {
        fecha: format(validationDate, 'yyyy-MM-dd'), // Ensures "YYYY-MM-DD" format
        zonaHoraria: zonaHorariaStr,
      };
    } catch (error) {
      console.error(`crearFCZH_fecha: Error durante la validación para timezone ${zonaHorariaStr}:`, error);
      return null;
    }
  };

/**
 * Creates a campoFechaConZonaHoraria object from a date string, time string, and timezone string.
 * The 'fecha' field will store the combined date and time as "YYYY-MM-DD HH:mm" or "YYYY-MM-DD HH:mm:ss".
 *
 * @param fechaStr The date string in "YYYY-MM-DD" format.
 * @param horaStr The time string in "HH:mm" or "HH:mm:ss" format.
 * @param zonaHorariaStr The IANA timezone string (e.g., "America/New_York", "Europe/London", "UTC").
 * @returns A campoFechaConZonaHoraria object or null if inputs are invalid.
 */
export const crearFCZH_FechaHora = (
    fechaStr: string,
    horaStr: string,
    zonaHorariaStr: string
  ): campoFechaConZonaHoraria | null => {
    if (!fechaStr || !horaStr || !zonaHorariaStr) {
      console.error("crearFCZH_FechaHora: Fecha, hora, y zona horaria son requeridos.");
      return null;
    }
  
    // Construct a string suitable for parsing and validation by date-fns-tz
    const validationDateTimeStr = `${fechaStr}T${horaStr}`; 
  
    try {
      // Validate if the combined date, time, and timezone form a real moment.
      // toDate will parse validationDateTimeStr and interpret it in the context of zonaHorariaStr.
      const validationDate = toDate(validationDateTimeStr, { timeZone: zonaHorariaStr });
  
      if (!isValid(validationDate)) {
        console.error(`crearFCZH_FechaHora: Combinación de fecha/hora/zona horaria inválida: "${validationDateTimeStr}" en "${zonaHorariaStr}"`);
        return null;
      }
  
      // If valid, store the local date and time strings.
      // The format of the stored 'fecha' will be "YYYY-MM-DD HH:mm" or "YYYY-MM-DD HH:mm:ss".
      return {
        fecha: format(validationDate, 'yyyy-MM-dd HH:mm:ss'), // Store the combined local date and time string
        zonaHoraria: zonaHorariaStr,
      };
    } catch (error) {
      // Catch any unexpected errors during validation (e.g., truly malformed timezone string if not caught by toDate)
      console.error(`crearFCZH_FechaHora: Error durante la validación para timezone ${zonaHorariaStr}:`, error);
      return null;
    }
  };

/**
 * Compares two campoFechaConZonaHoraria objects to determine if the first (fcZH1) is
 * greater than (later than), equal to, or less than (earlier than) the second (fcZH2).
 *
 * The comparison is based on the absolute moment in time each object represents.
 *
 * @param fcZH1 The first campoFechaConZonaHoraria object.
 * @param fcZH2 The second campoFechaConZonaHoraria object.
 * @returns resultadoComparacionFCZH: 
 *          "mayor" if fcZH1 is later than fcZH2,
 *          "menor" if fcZH1 is earlier than fcZH2,
 *          "igual" if they represent the same moment,
 *          "invalido" if either date cannot be parsed or is invalid.
 */
export const compararFCZH = (
    fcZH1: campoFechaConZonaHoraria | null | undefined,
    fcZH2: campoFechaConZonaHoraria | null | undefined
): resultadoComparacionFCZH => {
    if (!fcZH1 || !fcZH1.fecha || !fcZH1.zonaHoraria) {
        console.error("compararFCZH: fcZH1 (primer argumento) es inválido o incompleto.");
        return "invalido";
    }
    if (!fcZH2 || !fcZH2.fecha || !fcZH2.zonaHoraria) {
        console.error("compararFCZH: fcZH2 (segundo argumento) es inválido o incompleto.");
        return "invalido";
    }

    const parsableFecha1Str = prepareFechaStringForParsing(fcZH1.fecha);
    const parsableFecha2Str = prepareFechaStringForParsing(fcZH2.fecha);

    if (!parsableFecha1Str) {
        console.error(`compararFCZH: Formato de fecha de fcZH1 ("${fcZH1.fecha}") no soportado para comparación.`);
        return "invalido";
    }
    if (!parsableFecha2Str) {
        console.error(`compararFCZH: Formato de fecha de fcZH2 ("${fcZH2.fecha}") no soportado para comparación.`);
        return "invalido";
    }

    let date1: Date;
    let date2: Date;

    try {
        // Convert to JavaScript Date objects (which are UTC-based representations of an instant)
        date1 = toDate(parsableFecha1Str, { timeZone: fcZH1.zonaHoraria });
        if (!isValid(date1)) { // isValid is from date-fns
            console.error(`compararFCZH: fcZH1 ("${fcZH1.fecha}" en "${fcZH1.zonaHoraria}") no pudo ser convertido a una fecha válida.`);
            return "invalido";
        }
    } catch (e) {
        console.error(`compararFCZH: Error al parsear fcZH1 ("${fcZH1.fecha}" en "${fcZH1.zonaHoraria}"):`, e);
        return "invalido";
    }

    try {
        date2 = toDate(parsableFecha2Str, { timeZone: fcZH2.zonaHoraria });
        if (!isValid(date2)) { // isValid is from date-fns
            console.error(`compararFCZH: fcZH2 ("${fcZH2.fecha}" en "${fcZH2.zonaHoraria}") no pudo ser convertido a una fecha válida.`);
            return "invalido";
        }
    } catch (e) {
        console.error(`compararFCZH: Error al parsear fcZH2 ("${fcZH2.fecha}" en "${fcZH2.zonaHoraria}"):`, e);
        return "invalido";
    }

    // Compare the timestamps (milliseconds since epoch)
    const time1 = date1.getTime();
    const time2 = date2.getTime();

    if (time1 > time2) {
        return "mayor"; // fcZH1 is later than fcZH2
    } else if (time1 < time2) {
        return "menor"; // fcZH1 is earlier than fcZH2
    } else {
        return "igual"; // fcZH1 and fcZH2 represent the same instant
    }
};

/**
 * Compares two campoFechaConZonaHoraria objects to determine if they fall on the
 * same calendar date, or if the first (fcZH1) is on a later or earlier calendar date
 * than the second (fcZH2). The comparison uses fcZH1.zonaHoraria as the reference
 * for determining the calendar date of both moments.
 *
 * Example: fcZH1={fecha:"2023-01-01 23:00", zonaHoraria:"America/New_York"} (UTC: 2023-01-02 04:00Z)
 *          fcZH2={fecha:"2023-01-02 02:00", zonaHoraria:"America/New_York"} (UTC: 2023-01-02 07:00Z)
 *          Both are on "2023-01-02" in New York time. Result: "igual"
 *
 * Example: fcZH1={fecha:"2023-01-01 23:00", zonaHoraria:"America/New_York"} (UTC: 2023-01-02 04:00Z) -> is "2023-01-02" in NY
 *          fcZH2={fecha:"2023-01-01 23:00", zonaHoraria:"Europe/London"}    (UTC: 2023-01-01 23:00Z) -> is "2023-01-01" in NY
 *          Result: "mayor" (fcZH1's date in NY is later than fcZH2's date in NY)
 *
 * @param fcZH1 The first campoFechaConZonaHoraria object.
 * @param fcZH2 The second campoFechaConZonaHoraria object.
 * @returns resultadoComparacionFCZH:
 *          "mayor" if fcZH1's calendar date is later than fcZH2's,
 *          "menor" if fcZH1's calendar date is earlier than fcZH2's,
 *          "igual" if they fall on the same calendar date,
 *          "invalido" if either date cannot be parsed or is invalid.
 */
export const compararSoloFechaFCZH = (
    fcZH1: campoFechaConZonaHoraria | null | undefined,
    fcZH2: campoFechaConZonaHoraria | null | undefined
  ): resultadoComparacionFCZH => {
    if (!fcZH1 || !fcZH1.fecha || !fcZH1.zonaHoraria) {
        console.error("compararSoloFechaFCZH: fcZH1 (primer argumento) es inválido o incompleto.");
        return "invalido";
    }
    if (!fcZH2 || !fcZH2.fecha || !fcZH2.zonaHoraria) {
        console.error("compararSoloFechaFCZH: fcZH2 (segundo argumento) es inválido o incompleto.");
        return "invalido";
    }
  
    const parsableFecha1Str = prepareFechaStringForParsing(fcZH1.fecha);
    const parsableFecha2Str = prepareFechaStringForParsing(fcZH2.fecha);
  
    if (!parsableFecha1Str) {
        console.error(`compararSoloFechaFCZH: Formato de fecha de fcZH1 ("${fcZH1.fecha}") no soportado.`);
        return "invalido";
    }
    if (!parsableFecha2Str) {
        console.error(`compararSoloFechaFCZH: Formato de fecha de fcZH2 ("${fcZH2.fecha}") no soportado.`);
        return "invalido";
    }
  
    let jsDate1: Date;
    let jsDate2: Date;
  
    try {
        jsDate1 = toDate(parsableFecha1Str, { timeZone: fcZH1.zonaHoraria });
        if (!isValid(jsDate1)) {
            console.error(`compararSoloFechaFCZH: fcZH1 ("${fcZH1.fecha}" en "${fcZH1.zonaHoraria}") no es una fecha válida.`);
            return "invalido";
        }
    } catch (e) {
        console.error(`compararSoloFechaFCZH: Error al parsear fcZH1:`, e);
        return "invalido";
    }
  
    try {
        jsDate2 = toDate(parsableFecha2Str, { timeZone: fcZH2.zonaHoraria });
        if (!isValid(jsDate2)) {
            console.error(`compararSoloFechaFCZH: fcZH2 ("${fcZH2.fecha}" en "${fcZH2.zonaHoraria}") no es una fecha válida.`);
            return "invalido";
        }
    } catch (e) {
        console.error(`compararSoloFechaFCZH: Error al parsear fcZH2:`, e);
        return "invalido";
    }
  
    // Get the "yyyy-MM-dd" string for each JavaScript Date object,
    // both interpreted in the timezone of fcZH1.
    // This determines what calendar date each moment falls on, from fcZH1's perspective.
    const referenceTimeZone = fcZH1.zonaHoraria;
    let calendarDateStr1: string;
    let calendarDateStr2: string;
  
    try {
        calendarDateStr1 = formatInTimeZone(jsDate1, referenceTimeZone, 'yyyy-MM-dd');
        calendarDateStr2 = formatInTimeZone(jsDate2, referenceTimeZone, 'yyyy-MM-dd');
    } catch (e) {
        console.error(`compararSoloFechaFCZH: Error al formatear fechas en timezone "${referenceTimeZone}":`, e);
        return "invalido"; // Could be an issue with an invalid referenceTimeZone string itself.
    }
  
  
    if (calendarDateStr1 > calendarDateStr2) {
        return "mayor";
    } else if (calendarDateStr1 < calendarDateStr2) {
        return "menor";
    } else {
        return "igual";
    }
  };

/**
 * Adds a date-fns Duration object to a campoFechaConZonaHoraria.
 * @param fczh The base date and time with timezone.
 * @param duration The date-fns Duration object to add.
 * @returns A new campoFechaConZonaHoraria object with the duration added, or null on error.
 */
export function addDurationToFCZH(
    fczh: campoFechaConZonaHoraria | null | undefined,
    duration: Duration
  ): campoFechaConZonaHoraria | null {
    if (!fczh || !fczh.fecha || !fczh.zonaHoraria) {
      console.error("Invalid campoFechaConZonaHoraria input for addDurationToFCZH", fczh);
      return null;
    }
    if (!duration || Object.keys(duration).length === 0) {
      console.warn("addDurationToFCZH called with an empty or invalid duration object. Returning original fczh.", duration);
      return null;
    }
  
    try {
      let dateStr = toDateFCZH(fczh);
      if (!dateStr) {
        console.warn("No se puede comvertir el campoFechaConZonaHoraria a una cadena de fecha válida.", duration);
        return null;
      }
      const initialDate = new Date(dateStr);
  
      if (isNaN(initialDate.getTime())) {
        console.error("Invalid date string in FCZH for parsing:", fczh.fecha);
        return null;
      }
  
      // Use date-fns 'add' function
      const newDate = add(initialDate, duration);
  
      // Format the newDate back to your desired string format "YYYY-MM-DD HH:mm:ss.SSS"
      // This simple formatting might not be robust enough for all timezones or locales.
      // Using date-fns format function is more reliable.
      // The 'HH' (00-23) is generally preferred over 'hh' (01-12 with am/pm).
      const formattedDateString = format(newDate, 'yyyy-MM-dd');
      const formattedTimeString = format(newDate, 'HH:mm:ss.SSS');
  
      // Create a new campoFechaConZonaHoraria object
      // The zonaHoraria of the result is preserved from the input.
      // This implies the ADDITION was done in the context of that original timezone's local time.
      return crearFCZH_FechaHora(formattedDateString, formattedTimeString, fczh.zonaHoraria);
  
    } catch (error) {
      console.error("Error in addDurationToFCZH:", error);
      return null;
    }
  }

  export const intervalToDurationFCZH = (fczh1: campoFechaConZonaHoraria | null | undefined, fczh2: campoFechaConZonaHoraria | null | undefined): Duration | null => {
    if (!fczh1 || !fczh1.fecha || !fczh1.zonaHoraria || !fczh2 || !fczh2.fecha || !fczh2.zonaHoraria) {
      console.log("Objeto campoFechaConZonaHoraria incompleto, no se puede calcular duración a partir del intervalo"); // e.g., "-07:00"
      return null;
    }
    let duration: Duration = {days:0};
    const start: string | null = toDateFCZH(fczh1);
    const end: string | null = toDateFCZH(fczh2);
    if (!start || !end) {
      console.log("Problemas al procesar las fechas del intervalo"); // e.g., "-07:00"
      return null;
    }
    duration = intervalToDuration({ start, end });
    return duration;
  }