import { parseISO, isValid, format, Duration, add, intervalToDuration, getTime } from 'date-fns'
import { toDate, formatInTimeZone } from 'date-fns-tz'
import { TZDate } from "@date-fns/tz";
import { FechaIsoSchema } from "../schemas/fechas";
import { esValidaZonaHoraria, FechaIso, ZonaHorariaIana } from "../schemas/fechas";

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
