import { parseISO, isValid, format, Duration, add, intervalToDuration, getTime } from 'date-fns'
import { toDate, formatInTimeZone } from 'date-fns-tz'
import { TZDate } from "@date-fns/tz";
import { FechaIsoSchema } from "../schemas/fechas";
import { esValidaZonaHoraria, FechaIso, ZonaHorariaIana } from "../schemas/fechas";

// --- Helper Functions ---
export const slugify = (text: string, longitudMax?: number): string => {
    // Reemplazo de caracteres acentuados y ñ
    const from = 'áéíóúüÁÉÍÓÚÜñÑ-';
    const to   = 'aeiouuAEIOUUnN_';
    let slug = text.toString().toLowerCase().trim();
    // Reemplazar tildes y ñ
    slug = slug.split('').map((char, i) => {
        const idx = from.indexOf(char);
        return idx > -1 ? to[idx] : char;
    }).join('');
    return slug
        .replace(/\s+/g, '_')           // Reemplaza espacios por _
        .replace(/[^a-z0-9_]+/g, '')     // Solo permite a-z, 0-9 y _
        .replace(/__+/g, '_')            // Reemplaza múltiples _ por uno solo
        .replace(/^_+/, '')              // Quita _ al inicio
        .replace(/_+$/, '')              // Quita _ al final
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
