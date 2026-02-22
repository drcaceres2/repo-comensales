import { z } from "zod";
import timezoneData from "../data/zonas_horarias_soportadas.json";

// --- Helpers ---
// Para validar una zona horaria con JSON
const validTimezonesJSON = Object.entries(timezoneData).flatMap(([region, zones]) => 
  zones.map(zone => `${region}/${zone.name}`)
);
// Helper para validar una zona horaria con Intl
const isValidTimeZone = (tz: string) => {
  if (!tz) return false;
  try {
    // Le preguntamos al navegador/servidor: "¿Entiendes esta zona?"
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch (e) {
    return false;
  }
};

// --- Zod Schemas ---

// 1. Tipos de fecha base

// Regex para validar el formato T-hh:mm o T-hh:mm:ss
const isoTimeRegex = /^T([01]\d|2[0-3]):([0-5]\d)(:([0-5]\d))?$/;

// Regex para validar el formato hh:mm o hh:mm:ss
const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)(:([0-5]\d))?$/;

export const HoraIsoSchema = z.string().transform((val, ctx) => {
  if (isoTimeRegex.test(val)) {
    return val;
  }
  if (timeRegex.test(val)) {
    return `T${val}`;
  }
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message: 'La hora debe estar en formato "T-hh:mm", "T-hh:mm:ss", "hh:mm" o "hh:mm:ss"',
  });
  return z.NEVER;
});

// Alias para compatibilidad
export const IsoTimeStringSchema = HoraIsoSchema;

// Formato YYYY-MM-DD
export const FechaIsoSchema = z.string().regex(
    /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/,
    { message: "La fecha debe tener formato YYYY-MM-DD válido" }
);

// Alias para compatibilidad
export const IsoDateStringSchema = FechaIsoSchema;

// Formato YYYY-MM-DD opcional (para formularios)
export const OptionalFechaIsoSchema = z.preprocess(
    (val) => (val === "" || val === null) ? undefined : val,
    z.string().optional().pipe(FechaIsoSchema.optional())
);

// Alias para compatibilidad
export const OptionalIsoDateStringSchema = OptionalFechaIsoSchema;

// Formato YYYY-MM-DDTHH:mm:ss
export const FechaHoraIsoSchema = z.string().regex(
    /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/,
    { message: "La fecha y hora debe tener formato YYYY-MM-DDTHH:mm:ss válido" }
);

// Alias para compatibilidad
export const IsoDateTimeStringSchema = FechaHoraIsoSchema;

// Formato ISO 8601 Completo (YYYY-MM-DDTHH:mm:ss.sssZ)
export const TimestampStringSchema = z.string().datetime({
    message: "El timestamp debe estar en formato ISO 8601 (YYYY-MM-DDTHH:mm:ss.sssZ)",
});


// Identificador IANA (ej: "America/Tegucigalpa")
// Valida contra la lista de zonas soportadas
export const ZonaHorariaIanaSchema = z.string().refine(
    isValidTimeZone, { message: "Zona horaria inválida" }
);

// Alias para compatibilidad
export const IanaTimezoneSchema = ZonaHorariaIanaSchema;

// ISO 3166-1 alpha-2 (ej: "HN", "MX")
export const CodigoPaisIsoSchema = z.string().regex(
  /^[A-Z]{2}$/, 
  "El código de país debe ser 2 letras mayúsculas (ISO 3166-1 alpha-2)"
);

// Alias para compatibilidad  
export const IsoCountryCodeSchema = CodigoPaisIsoSchema;

// --- Interfaces ---

export const UbicacionSchema = z.object({
  pais: CodigoPaisIsoSchema,
  region: z.string().optional(),
  ciudad: z.string().min(1, "La ciudad es obligatoria"),
  direccion: z.string().optional(),
  zonaHoraria: ZonaHorariaIanaSchema,
});

export const OpcionZonaHorariaSchema = z.object({
  region: z.string(),
  ciudad: z.string(),
  diferenciaHoraria: z.string().optional(), // Solo visualización
});

// Alias para compatibilidad
export const ZonaHorariaOptionSchema = OpcionZonaHorariaSchema;

// Día de la semana
export const DiaDeLaSemanaSchema = z.enum(['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo']);

// Alias para compatibilidad
export const DayOfWeekKeySchema = DiaDeLaSemanaSchema;

// Estructura estricta para fechas con zona horaria
export const campoFechaConZonaHorariaSchema = z.object({
    fecha: z.string().refine((val) => {
        const dateRegex = /^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}(:\d{2})?)?$/;
        const timeRegex = /^\d{2}:\d{2}(:\d{2})?$/;
        return dateRegex.test(val) || timeRegex.test(val);
    }, "Formato de fecha/hora inválido"),
    zonaHoraria: ZonaHorariaIanaSchema,
});

// Color HTML
export const ColorHTMLSchema = z.string().regex(
  /^#[0-9A-Fa-f]{6}$/,
  "El color debe estar en formato #RRGGBB"
);
