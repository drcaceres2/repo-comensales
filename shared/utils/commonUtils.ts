import { parseISO, isValid, format, Duration, add, intervalToDuration, getTime } from 'date-fns'
import { toDate, formatInTimeZone } from 'date-fns-tz'
import { TZDate } from "@date-fns/tz";
import { FechaIsoSchema } from "../schemas/fechas";
import { esValidaZonaHoraria, FechaIso, ZonaHorariaIana } from "../schemas/fechas";
import { LogPayload } from "../models/types";
import { db } from '@/lib/firebaseAdmin'; 
import { FieldValue } from 'firebase-admin/firestore';
import { obtenerInfoUsuarioServer } from '@/lib/obtenerInfoUsuarioServer';

// --- Helper Functions ---
export const slugify = (text: string, longitudMax?: number): string => {
    return text
        .toString()
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')           // Replace spaces with -
        .replace(/[^\w\-]+/g, '')       // Remove all non-word chars
        .replace(/\-\-+/g, '-')         // Replace multiple - with single -
        .replace(/^-+/, '')             // Trim - from start of text
        .replace(/-+$/, '')            // Trim - from end of text
        .substring(0, longitudMax);
};

// =======================================
// Herramientas de fecha basadas en TZDate
// =======================================

export type resultadoFechaIntervalo = "dentro" | "fuera_antes" | "fuera_despues" | "error";

export async function HoyEstamosEntreFechasResidencia(
    fechaInicio: FechaIso | null | undefined,
    fechaFin: FechaIso | null | undefined,
    zonaHorariaResidencia: ZonaHorariaIana | null | undefined
): Promise<resultadoFechaIntervalo> {
    if (!fechaInicio || !fechaFin || !zonaHorariaResidencia) {
        return "error";
    }
    try {
        const timestampInicio = new TZDate(FechaIsoSchema.parse(fechaInicio)).getTime();
        const timestampFin = new TZDate(FechaIsoSchema.parse(fechaFin)).getTime();
        const respuestaFechaServidor = await fetch('/api/hora-servidor');
        const { timestampServidor } = await respuestaFechaServidor.json();
        if (!timestampServidor || (timestampInicio > timestampFin)) return "error";
        if (timestampServidor >= timestampInicio && timestampServidor <= timestampFin) {
            return "dentro"
        } else if (timestampServidor <= timestampInicio) {
            return "fuera_antes"
        }
        return "fuera_despues"
    } catch (error) {
        return 'error'
    }
}

export function EntreFechasResidencia(
    fechaInicio: FechaIso | null | undefined,
    fechaFin: FechaIso | null | undefined,
    zonaHorariaResidencia: ZonaHorariaIana | null | undefined,
    timestampServidor: any
): resultadoFechaIntervalo {
    if (!fechaInicio || !fechaFin || !zonaHorariaResidencia) {
        return "error";
    }
    try {
        const timestampInicio = new TZDate(FechaIsoSchema.parse(fechaInicio)).getTime();
        const timestampFin = new TZDate(FechaIsoSchema.parse(fechaFin)).getTime();
        if (!timestampServidor || (timestampInicio > timestampFin)) return "error";
        if (timestampServidor >= timestampInicio && timestampServidor <= timestampFin) {
            return "dentro"
        } else if (timestampServidor <= timestampInicio) {
            return "fuera_antes"
        }
        return "fuera_despues"
    } catch (error) {
        return 'error'
    }
}

export const logServer = async (payload: LogPayload): Promise<void> => {
    try {
        const auth = await obtenerInfoUsuarioServer();
        const actorId = auth?.usuarioId || 'SYSTEM';
        const actorEmail = auth?.email || 'system@internal';

        const entry = {
            userId: actorId,
            userEmail: actorEmail,
            action: payload.action,
            targetId: payload.targetId || null,
            targetCollection: payload.targetCollection || null,
            residenciaId: payload.residenciaId || auth.residenciaId || null,
            details: payload.details || {},
            timestamp: FieldValue.serverTimestamp(),
            source: 'server-action'
        };

        await db.collection("logs").add(entry);
    } catch (error) {
        console.error(`[AUDIT ERROR] Falló log para ${payload.action}`, error);
    }
};

// ===============================================
// Funciones de FECHA basadas en interfaz in-house
// ===============================================

export type resultadoComparacionFCZH = "mayor" | "igual" | "menor" | "invalido";

export type campoFechaConZonaHoraria = {
    fecha: string;
    zonaHoraria: string;
}

export const toDateFCZH = (fczh: campoFechaConZonaHoraria | null | undefined): string | null => {
    if (!fczh || !fczh.fecha || !fczh.zonaHoraria) {
        console.log("Objeto campoFechaConZonaHoraria incompleto, no se puede calcular fecha");
        return null;
    }
    const fechaISO = prepareFechaStringForParsing(fczh.fecha);
    if (!fechaISO) {
        console.log("Fecha en formato incorrecto, no se puede calcular fecha");
        return null;
    }
    return fechaISO;
}

const prepareFechaStringForParsing = (fechaOriginal: string): string | null => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(fechaOriginal)) {
        return `${fechaOriginal}T00:00:00`;
    }
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(fechaOriginal)) {
        return `${fechaOriginal.replace(' ', 'T')}:00`;
    }
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(fechaOriginal)) {
        return fechaOriginal.replace(' ', 'T');
    }
    if (fechaOriginal.includes('T')) {
        return fechaOriginal;
    }
    console.error(`prepareFechaStringForParsing: Fecha string "${fechaOriginal}" is not in an expected format for robust comparison (YYYY-MM-DD, YYYY-MM-DD HH:mm, or YYYY-MM-DD HH:mm:ss).`);
    return null;
};

export const crearFCZH_fecha = (
    fechaStr: string,
    zonaHorariaStr: string
): campoFechaConZonaHoraria | null => {
    if (!fechaStr || !zonaHorariaStr) {
        console.error("crearFCZH_fecha: Fecha y zona horaria son requeridos.");
        return null;
    }
    const validationDateTimeStr = `${fechaStr}T00:00:00`;
    try {
        const validationDate = toDate(validationDateTimeStr, { timeZone: zonaHorariaStr });
        if (!isValid(validationDate)) {
            console.error(`crearFCZH_fecha: Combinación de fecha/zona horaria inválida: "${fechaStr}" en "${zonaHorariaStr}"`);
            return null;
        }
        return {
            fecha: format(validationDate, 'yyyy-MM-dd'),
            zonaHoraria: zonaHorariaStr,
        };
    } catch (error) {
        console.error(`crearFCZH_fecha: Error durante la validación para timezone ${zonaHorariaStr}:`, error);
        return null;
    }
};

export const crearFCZH_FechaHora = (
    fechaStr: string,
    horaStr: string,
    zonaHorariaStr: string
): campoFechaConZonaHoraria | null => {
    if (!fechaStr || !horaStr || !zonaHorariaStr) {
        console.error("crearFCZH_FechaHora: Fecha, hora, y zona horaria son requeridos.");
        return null;
    }
    const validationDateTimeStr = `${fechaStr}T${horaStr}`;
    try {
        const validationDate = toDate(validationDateTimeStr, { timeZone: zonaHorariaStr });
        if (!isValid(validationDate)) {
            console.error(`crearFCZH_FechaHora: Combinación de fecha/hora/zona horaria inválida: "${validationDateTimeStr}" en "${zonaHorariaStr}"`);
            return null;
        }
        return {
            fecha: format(validationDate, 'yyyy-MM-dd HH:mm:ss'),
            zonaHoraria: zonaHorariaStr,
        };
    } catch (error) {
        console.error(`crearFCZH_FechaHora: Error durante la validación para timezone ${zonaHorariaStr}:`, error);
        return null;
    }
};

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
        date1 = toDate(parsableFecha1Str, { timeZone: fcZH1.zonaHoraria });
        if (!isValid(date1)) {
            console.error(`compararFCZH: fcZH1 ("${fcZH1.fecha}" en "${fcZH1.zonaHoraria}") no pudo ser convertido a una fecha válida.`);
            return "invalido";
        }
    } catch (e) {
        console.error(`compararFCZH: Error al parsear fcZH1 ("${fcZH1.fecha}" en "${fcZH1.zonaHoraria}"):`, e);
        return "invalido";
    }
    try {
        date2 = toDate(parsableFecha2Str, { timeZone: fcZH2.zonaHoraria });
        if (!isValid(date2)) {
            console.error(`compararFCZH: fcZH2 ("${fcZH2.fecha}" en "${fcZH2.zonaHoraria}") no pudo ser convertido a una fecha válida.`);
            return "invalido";
        }
    } catch (e) {
        console.error(`compararFCZH: Error al parsear fcZH2 ("${fcZH2.fecha}" en "${fcZH2.zonaHoraria}"):`, e);
        return "invalido";
    }
    const time1 = date1.getTime();
    const time2 = date2.getTime();
    if (time1 > time2) {
        return "mayor";
    } else if (time1 < time2) {
        return "menor";
    } else {
        return "igual";
    }
};

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
    const referenceTimeZone = fcZH1.zonaHoraria;
    let calendarDateStr1: string;
    let calendarDateStr2: string;
    try {
        calendarDateStr1 = formatInTimeZone(jsDate1, referenceTimeZone, 'yyyy-MM-dd');
        calendarDateStr2 = formatInTimeZone(jsDate2, referenceTimeZone, 'yyyy-MM-dd');
    } catch (e) {
        console.error(`compararSoloFechaFCZH: Error al formatear fechas en timezone "${referenceTimeZone}":`, e);
        return "invalido";
    }
    if (calendarDateStr1 > calendarDateStr2) {
        return "mayor";
    } else if (calendarDateStr1 < calendarDateStr2) {
        return "menor";
    } else {
        return "igual";
    }
};

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
        const newDate = add(initialDate, duration);
        const formattedDateString = format(newDate, 'yyyy-MM-dd');
        const formattedTimeString = format(newDate, 'HH:mm:ss.SSS');
        return crearFCZH_FechaHora(formattedDateString, formattedTimeString, fczh.zonaHoraria);
    } catch (error) {
        console.error("Error in addDurationToFCZH:", error);
        return null;
    }
}

export const intervalToDurationFCZH = (fczh1: campoFechaConZonaHoraria | null | undefined, fczh2: campoFechaConZonaHoraria | null | undefined): Duration | null => {
    if (!fczh1 || !fczh1.fecha || !fczh1.zonaHoraria || !fczh2 || !fczh2.fecha || !fczh2.zonaHoraria) {
        console.log("Objeto campoFechaConZonaHoraria incompleto, no se puede calcular duración a partir del intervalo");
        return null;
    }
    let duration: Duration = { days: 0 };
    const start: string | null = toDateFCZH(fczh1);
    const end: string | null = toDateFCZH(fczh2);
    if (!start || !end) {
        console.log("Problemas al procesar las fechas del intervalo");
        return null;
    }
    duration = intervalToDuration({ start, end });
    return duration;
}
