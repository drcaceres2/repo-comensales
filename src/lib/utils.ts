import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { Timestamp, collection, addDoc, serverTimestamp, FieldValue } from 'firebase/firestore';
import { db } from './firebase';
import { LogActionType, ClientLogWrite, UserId, ResidenciaId, campoFechaConZonaHoraria } from '@/../../shared/models/types';
import { type Toast } from "@/hooks/use-toast"; // <--- ADD THIS IMPORT
import { toDate, formatInTimeZone } from 'date-fns-tz';
import { parseISO, isValid, formatISO, format, intervalToDuration, Duration, add } from 'date-fns';
import { es } from 'date-fns/locale';
import timezonesDataJson from '@/app/zonas_horarias_ejemplos.json';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const formatTimestampForInput = (timestampValue: number | string | Date | Timestamp | null | undefined): string => {
    if (!timestampValue) return '';
    try {
        let date: Date;
        if (typeof timestampValue === 'number') {
            date = new Date(timestampValue);
        } else if (typeof timestampValue === 'string') {
             // Try parsing common formats, including the 'YYYY-MM-DD' from input itself
             date = new Date(timestampValue);
        } else if (timestampValue instanceof Timestamp) { // Handle Firestore Timestamp if necessary (e.g., initial load)
            date = timestampValue.toDate();
        } else if (timestampValue instanceof Date) {
            date = timestampValue;
        } else {
            return ''; // Invalid type
        }
  
        if (isNaN(date.getTime())) { // Check if date is valid
             return '';
        }
  
        // Format to YYYY-MM-DD for the date input
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        return `${year}-${month}-${day}`;
    } catch (error) {
        console.error("Error formatting timestamp:", error);
        return '';
    }
};

export async function writeClientLog(
  actorUserId: UserId,
  actionType: LogActionType,
  logDetails: Partial<Omit<ClientLogWrite, 'userId' | 'actionType' | 'timestamp'>> = {}
): Promise<void> {
  if (!actorUserId) {
    console.warn("writeClientLog: actorUserId is missing.");
    return;
  }
  try {
    const logData: ClientLogWrite = {
      userId: actorUserId,
      actionType: actionType,
      timestamp: serverTimestamp(),
      residenciaId: logDetails.residenciaId,
      targetUid: logDetails.targetUid || null,
      relatedDocPath: logDetails.relatedDocPath,
      details: logDetails.details || `User ${actorUserId} performed ${actionType}.`,
    };
    await addDoc(collection(db, "logs"), logData);
  } catch (error) {
    console.error("Error writing client log:", error);
  }
}

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

// Example Usage (can be removed):
/*
console.log("--- Testing revised functions ---");

const resFechaHora1 = crearFCZH_FechaHora("2023-12-25", "10:30", "America/New_York");
console.log("FechaHora (NY 10:30):", resFechaHora1); // Expected: { fecha: "2023-12-25 10:30", zonaHoraria: "America/New_York" }

const resFechaHora2 = crearFCZH_FechaHora("2024-02-29", "23:59:58", "Europe/Paris");
console.log("FechaHora (Paris Leap Day):", resFechaHora2); // Expected: { fecha: "2024-02-29 23:59:58", zonaHoraria: "Europe/Paris" }

const resFechaHoraInvalid = crearFCZH_FechaHora("2023-02-29", "10:00", "UTC"); // Invalid date
console.log("FechaHora (Invalid Date):", resFechaHoraInvalid); // Expected: null

const resFecha1 = crearFCZH_fecha("2023-10-31", "Asia/Tokyo");
console.log("Fecha (Tokyo Halloween):", resFecha1); // Expected: { fecha: "2023-10-31", zonaHoraria: "Asia/Tokyo" }

const resFechaInvalid = crearFCZH_fecha("InvalidDate", "UTC");
console.log("Fecha (Invalid Format):", resFechaInvalid); // Expected: null
*/

// New type for the comparison result
export type resultadoComparacionFCZH = "mayor" | "igual" | "menor" | "invalido";

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

// Example Usage (can be removed or commented out):
/*
console.log("--- Testing compararFCZH ---");

const dateA: campoFechaConZonaHoraria = { fecha: "2023-01-01 12:00:00", zonaHoraria: "America/New_York" }; // EST (UTC-5) -> 2023-01-01 17:00:00Z
const dateB: campoFechaConZonaHoraria = { fecha: "2023-01-01 17:00:00", zonaHoraria: "UTC" };             // UTC         -> 2023-01-01 17:00:00Z
const dateC: campoFechaConZonaHoraria = { fecha: "2023-01-01 18:00:00", zonaHoraria: "Europe/London" };   // GMT (UTC+0) -> 2023-01-01 18:00:00Z
const dateD_dateOnly: campoFechaConZonaHoraria = { fecha: "2023-01-01", zonaHoraria: "America/New_York" }; // Midnight NY EST -> 2023-01-01 05:00:00Z
const dateE_dateOnlyUTC: campoFechaConZonaHoraria = { fecha: "2023-01-01", zonaHoraria: "UTC" }; // Midnight UTC -> 2023-01-01 00:00:00Z

console.log(`A vs B (NY 12pm vs UTC 5pm): Should be "igual". Result: ${compararFCZH(dateA, dateB)}`);
console.log(`A vs C (NY 12pm vs London 6pm): Should be "menor". Result: ${compararFCZH(dateA, dateC)}`);
console.log(`C vs A (London 6pm vs NY 12pm): Should be "mayor". Result: ${compararFCZH(dateC, dateA)}`);
console.log(`D vs E (NY Midnight vs UTC Midnight): Should be "mayor". Result: ${compararFCZH(dateD_dateOnly, dateE_dateOnlyUTC)}`);

const invalidDate1: campoFechaConZonaHoraria = { fecha: "2023-02-30 10:00", zonaHoraria: "UTC" }; // Invalid date
const validDate: campoFechaConZonaHoraria = { fecha: "2023-01-01 10:00", zonaHoraria: "UTC" };
console.log(`Invalid vs Valid: Should be "invalido". Result: ${compararFCZH(invalidDate1, validDate)}`);
console.log(`Valid vs Invalid: Should be "invalido". Result: ${compararFCZH(validDate, invalidDate1)}`);
console.log(`Null test: Should be "invalido". Result: ${compararFCZH(null, validDate)}`);

const dateF_malformed: campoFechaConZonaHoraria = { fecha: "2023/01/01 10:00", zonaHoraria: "UTC"}; // Malformed for helper
console.log(`Malformed fecha vs Valid: Should be "invalido". Result: ${compararFCZH(dateF_malformed, validDate)}`);
*/


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

export const formatFCZHToMonthYear = (fczh: campoFechaConZonaHoraria | null | undefined): string => {
  if (!fczh || !fczh.fecha) {
    return 'N/A';
  }
  try {
    return format(fczh.fecha, 'MMM-yy', { locale: es }); // e.g., "ene-25"
  } catch (error) {
    console.error("Error formatting FCZH to MonthYear:", error, fczh);
    return fczh.fecha; // Fallback to original string on error
  }
};

interface TimezoneDetail {
  name: string; // IANA timezone name e.g., "America/New_York"
  offset: string; // UTC offset e.g., "-04:00", "+05:30"
  // Add other properties if they exist
}

// Interface for the overall timezones data structure (from TimezoneSelector.tsx)
interface TimezonesData {
  [region: string]: TimezoneDetail[];
}

// Cast the imported JSON to our TimezonesData interface
const timezonesData: TimezonesData = timezonesDataJson as TimezonesData;

/**
 * Gets the UTC offset string for a given IANA timezone name.
 * The timezone must be one of the examples defined in '@/app/zonas_horarias_ejemplos.json'.
 * @param ianaTimezoneName The IANA timezone name (e.g., "America/New_York").
 * @returns The UTC offset string (e.g., "-04:00") or null if not found.
 */
export const getUtcOffsetFromIanaName = (ianaTimezoneName: string): string | null => {
  if (!ianaTimezoneName) {
    return null;
  }

  // Iterate through each region in the timezonesData
  for (const region in timezonesData) {
    if (timezonesData.hasOwnProperty(region)) {
      const timezoneDetailsArray = timezonesData[region];
      // Find the timezone detail with the matching IANA name
      const foundTimezone = timezoneDetailsArray.find(
        (tzDetail) => tzDetail.name === ianaTimezoneName
      );

      if (foundTimezone) {
        return foundTimezone.offset; // Return the offset string
      }
    }
  }

  console.warn(`getUtcOffsetFromIanaName: Timezone "${ianaTimezoneName}" not found in zonas_horarias_ejemplos.json`);
  return null; // Return null if the timezone name is not found
};

export const toDateFCZH = (fczh: campoFechaConZonaHoraria | null | undefined): string | null => {
  if (!fczh || !fczh.fecha || !fczh.zonaHoraria) {
    console.log("Objeto campoFechaConZonaHoraria incompleto, no se puede calcular fecha"); // e.g., "-07:00"
    return null;
  }
  let fechaISO: string = '';
  const ianaTz = fczh.zonaHoraria;
  const offset = getUtcOffsetFromIanaName(ianaTz);
  if (offset) {
    fechaISO = format(fczh.fecha,"YYYY-MM-DD HH:MM:SS.SSS").replace(" ", "T") + offset.substring(3);
    return fechaISO;
  } else {
    console.log("Error al obtener offset para obtener fecha en formato string");
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