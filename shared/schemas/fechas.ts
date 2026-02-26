import { z } from "zod";
import { parseISO, isValid } from 'date-fns'
import timezoneData from "../data/zonas_horarias_soportadas.json";
import { UbicacionSchema  } from './common';

const tzCache = new Map<string, boolean>;

// --- Helpers ---
const regexHoraISO = /^T([01]\d|2[0-3]):([0-5]\d)(:([0-5]\d))?$/;
const regexHora = /^([01]\d|2[0-3]):([0-5]\d)(:([0-5]\d))?$/;
const regexFechaHoraIsoHoraObligatoria = /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?)?$/;
const regexFechaIsoSoloFecha = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/**
 * Valida formatos YYYY-MM-DD, YYYY-MM-DD HH:mm, YYYY-MM-DDTHH:mm:ss, etc.
 * Prohíbe estrictamente Z y offsets.
 * Verifica que la fecha sea lógicamente correcta (días del mes, bisiestos).
 */
const validacionDateFns = (fecha: string | null | undefined): boolean => {
  if(!fecha) return false;
  const objetoFecha = parseISO(fecha);
  return isValid(objetoFecha);
};
const validacionDateFnsOpcional = (fecha: string | null | undefined): boolean => {
  if(!fecha) return true;
  const objetoFecha = parseISO(fecha);
  return isValid(objetoFecha);
};

// Para validar una zona horaria con JSON
const validTimezonesJSON = Object.entries(timezoneData).flatMap(([region, zones]) => 
  zones.map(zone => `${region}/${zone.name}`)
);
// Helper para validar una zona horaria con Intl
export const esValidaZonaHoraria = (tz: string): boolean => {
  if (!tz) return false;

  if (tzCache.has(tz)) return tzCache.get(tz)!;

  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    tzCache.set(tz, true);
    return true;
  } catch (e) {
    // No cacheamos los errores para permitir re-intentos si algo fallara
    // (aunque con Intl, si falla es que es inválida).
    return false;
  }
};

// --- Zod Schemas ---

// 1. Tipos de fecha base
export const HoraIsoSchema = z.preprocess(
    (val) => (val === "" || val === null ? undefined : val),
    z.string()
        .trim()
        .transform((val, ctx) => {
          if (regexHoraISO.test(val)) return val;
          if (regexHora.test(val)) return `T${val}`; // Normaliza HH:mm -> THH:mm

          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Formato inválido (HH:mm o THH:mm)',
          });
          return z.NEVER;
        })
);

// Formato YYYY-MM-DD
export const FechaIsoSchema = z.preprocess(
    // Convierte vacíos en undefined para que Zod dispare el error de "Requerido"
    (val) => (val === "" || val === null ? undefined : val),
    z.string({ required_error: "La fecha es obligatoria" })
        .trim()
        .regex(regexFechaIsoSoloFecha, "Formato requerido: YYYY-MM-DD")
        .refine(validacionDateFns, "La fecha no existe en el calendario")
);

export const FechaIsoOpcionalSchema = z.preprocess(
    (val) => (val === "" || val === null ? undefined : val),
    z.string().trim().optional().superRefine((val, ctx) => {
      if (!val) return;
      if (!regexFechaIsoSoloFecha.test(val)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Formato YYYY-MM-DD" });
        return;
      }
      if (!validacionDateFns(val)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Fecha inexistente" });
      }
    })
);

// Formato YYYY-MM-DDTHH:mm:ss
export const FechaHoraIsoSchema = z.preprocess(
    // 1. Preprocesa cadena vacía o nulo y lo vuelve undefined
    (val) => (val === "" || val === null ? undefined : val),
    z.string({ required_error: "La fecha es requerida" })
        // 2. Valida cadena y hace trim
        .trim()
        // 3 y 4. Transformación inteligente basada en Regex
        .transform((val, ctx) => {
          // Caso 3: Es solo fecha? -> Le agregamos la medianoche
          if (regexFechaIsoSoloFecha.test(val)) {
            return `${val}T00:00:00`;
          }

          // Caso 4: Es fecha y hora? -> Normalizamos espacio a T si es necesario
          if (regexFechaHoraIsoHoraObligatoria.test(val)) {
            return val.replace(' ', 'T');
          }

          // Si no cumple ninguno, lanzamos error de formato
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Formato inválido. Use YYYY-MM-DD o YYYY-MM-DDTHH:mm:ss",
          });
          return z.NEVER;
        })
        // 5. Refine con esFechaValida (ya con el string normalizado a ISO completo)
        .refine((val) => validacionDateFns(val), {
          message: "La fecha o hora no es válida en el calendario",
        })
);

// Identificador IANA (ej: "America/Tegucigalpa")
// Valida contra la lista de zonas soportadas
export const ZonaHorariaIanaSchema = z.string().refine(
    esValidaZonaHoraria, { message: "Zona horaria inválida" }
);

export const OpcionZonaHorariaSchema = z.object({
  region: z.string(),
  ciudad: z.string(),
  diferenciaHoraria: z.string().optional(), // Solo visualización
});

// Día de la semana
export const DiaDeLaSemanaSchema = z.enum(['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo']);


export const MapaDiaDeLaSemana: Record<DiaDeLaSemana, string> = {
  lunes: 'Lunes',
  martes: 'Martes',
  miercoles: 'Miércoles',
  jueves: 'Jueves',
  viernes: 'Viernes',
  sabado: 'Sábado',
  domingo: 'Domingo'
};

export const ArregloDiaDeLaSemana: DiaDeLaSemana[] = Object.keys(MapaDiaDeLaSemana) as DiaDeLaSemana[];

export const mapaDiasANumero: Record<DiaDeLaSemana, number> = {
    lunes: 0,
    martes: 1,
    miercoles: 2,
    jueves: 3,
    viernes: 4,
    sabado: 5,
    domingo: 6
};

export type DiaDeLaSemana = z.infer<typeof DiaDeLaSemanaSchema>;
export type FechaIso = z.infer<typeof FechaIsoSchema>;
export type FechaHoraIso = z.infer<typeof FechaHoraIsoSchema>;
export type HoraIso = z.infer<typeof HoraIsoSchema>;
export type ZonaHorariaIana = z.infer<typeof ZonaHorariaIanaSchema>;