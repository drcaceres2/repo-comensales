import { formatInTimeZone } from 'date-fns-tz'
import { FechaIsoSchema } from "../schemas/fechas";
import { esValidaZonaHoraria, FechaIso, ZonaHorariaIana } from "../schemas/fechas";
import { RolUsuario } from '../models/types';

// --- Helper Functions ---
export const slugify = (text: string, longitudMax?: number): string => {
    // Reemplazo de caracteres acentuados y ñ
    const from = 'áéíóúüÁÉÍÓÚÜñÑ-';
    const to   = 'aeiouuAEIOUUnN_';
    let slug = text.toString().toLowerCase().trim();
    // Reemplazar tildes y ñ
    slug = slug.split('').map((char) => {
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

export const normalizarEtiquetaCampoPersonalizado = (value: string): string => {
    return value
        .normalize('NFKC')
        .replace(/[^\p{L}\p{N}\s_-]+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
};

export const normalizarHoraParaInput = (hora: string | null | undefined): string => {
    if (!hora) return '';

    const sinPrefijo = hora.startsWith('T') ? hora.substring(1) : hora;
    const partes = sinPrefijo.split(':');
    if (partes.length < 2) return '';

    const [hh, mm] = partes;
    if (!/^\d{2}$/.test(hh) || !/^\d{2}$/.test(mm)) return '';

    return `${hh}:${mm}`;
};

export const normalizarHoraParaIso = (hora: string | null | undefined): string => {
    const valorInput = normalizarHoraParaInput(hora);
    return valorInput ? `T${valorInput}` : '';
};

export const convertirHoraAMinutos = (hora: string | null | undefined): number | null => {
    const valorInput = normalizarHoraParaInput(hora);
    if (!valorInput) return null;

    const [hh, mm] = valorInput.split(':').map(Number);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;

    return (hh * 60) + mm;
};

export function compararHorasReferencia(horaA: string | null | undefined, horaB: string | null | undefined): number {
    const minutosA = convertirHoraAMinutos(horaA);
    const minutosB = convertirHoraAMinutos(horaB);

    if (minutosA !== null && minutosB !== null) {
        return minutosA - minutosB;
    }

    if (minutosA !== null) return -1;
    if (minutosB !== null) return 1;

    return String(horaA ?? '').localeCompare(String(horaB ?? ''));
}

// =======================================
// Herramientas de fecha basadas en TZDate
// =======================================

export type resultadoFechaIntervalo = "dentro" | "fuera_antes" | "fuera_despues" | "error";

type TimestampServidorLike =
    | number
    | string
    | Date
    | { toDate: () => Date }
    | { seconds: number; nanoseconds?: number }
    | null
    | undefined;

function convertirTimestampServidorADate(timestampServidor: TimestampServidorLike): Date | null {
    if (!timestampServidor) return null;

    if (timestampServidor instanceof Date) {
        return Number.isNaN(timestampServidor.getTime()) ? null : timestampServidor;
    }

    if (typeof timestampServidor === 'number') {
        const fecha = new Date(timestampServidor);
        return Number.isNaN(fecha.getTime()) ? null : fecha;
    }

    if (typeof timestampServidor === 'string') {
        const fecha = new Date(timestampServidor);
        return Number.isNaN(fecha.getTime()) ? null : fecha;
    }

    if (typeof timestampServidor === 'object') {
        if ('toDate' in timestampServidor && typeof timestampServidor.toDate === 'function') {
            const fecha = timestampServidor.toDate();
            return Number.isNaN(fecha.getTime()) ? null : fecha;
        }

        if ('seconds' in timestampServidor) {
            const nanoseconds = 'nanoseconds' in timestampServidor && typeof timestampServidor.nanoseconds === 'number'
                ? timestampServidor.nanoseconds
                : 0;
            const fecha = new Date((timestampServidor.seconds * 1000) + Math.floor(nanoseconds / 1_000_000));
            return Number.isNaN(fecha.getTime()) ? null : fecha;
        }
    }

    return null;
}

function obtenerFechaActualResidencia(
    timestampServidor: TimestampServidorLike,
    zonaHorariaResidencia: ZonaHorariaIana | null | undefined
): FechaIso | null {
    if (!zonaHorariaResidencia || !esValidaZonaHoraria(zonaHorariaResidencia)) {
        return null;
    }

    const fechaServidor = convertirTimestampServidorADate(timestampServidor);
    if (!fechaServidor) {
        return null;
    }

    return FechaIsoSchema.parse(
        formatInTimeZone(fechaServidor, zonaHorariaResidencia, 'yyyy-MM-dd')
    );
}

export async function HoyEstamosEntreFechasResidencia(
    fechaInicio: FechaIso | null | undefined,
    fechaFin: FechaIso | null | undefined,
    zonaHorariaResidencia: ZonaHorariaIana | null | undefined
): Promise<resultadoFechaIntervalo> {
    if (!fechaInicio || !fechaFin || !zonaHorariaResidencia) {
        return "error";
    }
    try {
        const fechaInicioValidada = FechaIsoSchema.parse(fechaInicio);
        const fechaFinValidada = FechaIsoSchema.parse(fechaFin);
        const respuestaFechaServidor = await fetch('/api/hora-servidor');
        const { timestampServidor } = await respuestaFechaServidor.json();

        const fechaActualResidencia = obtenerFechaActualResidencia(timestampServidor, zonaHorariaResidencia);
        if (!fechaActualResidencia || fechaInicioValidada > fechaFinValidada) return "error";

        if (fechaActualResidencia >= fechaInicioValidada && fechaActualResidencia <= fechaFinValidada) {
            return "dentro"
        } else if (fechaActualResidencia < fechaInicioValidada) {
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
    timestampServidor: TimestampServidorLike
): resultadoFechaIntervalo {
    if (!fechaInicio || !fechaFin || !zonaHorariaResidencia) {
        return "error";
    }
    try {
        const fechaInicioValidada = FechaIsoSchema.parse(fechaInicio);
        const fechaFinValidada = FechaIsoSchema.parse(fechaFin);
        const fechaActualResidencia = obtenerFechaActualResidencia(timestampServidor, zonaHorariaResidencia);

        if (!fechaActualResidencia || fechaInicioValidada > fechaFinValidada) return "error";

        if (fechaActualResidencia >= fechaInicioValidada && fechaActualResidencia <= fechaFinValidada) {
            return "dentro"
        } else if (fechaActualResidencia < fechaInicioValidada) {
            return "fuera_antes"
        }
        return "fuera_despues"
    } catch (error) {
        return 'error'
    }
}

type ResultadoVerificacionRoles = {
    sonCoherentes: boolean;
    error: string | null;
}

export function verificarCoherenciaRoles(roles: RolUsuario[]): ResultadoVerificacionRoles {
    if (!roles || roles.length === 0) {
        return {
            sonCoherentes: false,
            error: "Error interno: La verificación de roles no se ha podido realizar."
        }
    }
    const esResidente = roles.includes('residente');
    const esInvitado = roles.includes('invitado');
    const esAsistente = roles.includes('asistente');
    const esDirector = roles.includes('director');
    if (
        (esInvitado && (esResidente || esAsistente || esDirector))
        || (esAsistente && esDirector)
    ) {
        return {
            sonCoherentes: false,
            error: null
        }
    }
    return {
        sonCoherentes: true,
        error: null
    };
}