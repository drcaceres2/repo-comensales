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

// Formato HH:mm (24 horas)
export const TimeStringSchema = z.string().regex(
  /^([01]\d|2[0-3]):([0-5]\d)$/, 
  "Formato HH:mm requerido (00:00 - 23:59)"
);

// Formato YYYY-MM-DD
// Modificado para ser más estricto con el formato ISO Date
export const IsoDateStringSchema = z.string().regex(
    /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/,
    { message: "La fecha debe tener formato YYYY-MM-DD válido" }
);

// Formato YYYY-MM-DD HH:mm:ss
export const isoDateTimeStringSchema = z.string().regex(
    /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01]) ([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/,
    { message: "La fecha y hora debe tener formato YYYY-MM-DD HH:mm:ss válido" }
);

// Identificador IANA (ej: "America/Tegucigalpa")
// Valida contra la lista de zonas soportadas
export const IanaTimezoneSchema = z.string().refine(
    isValidTimeZone, { message: "Zona horaria inválida" }
);

// ISO 3166-1 alpha-2 (ej: "HN", "MX")
export const IsoCountryCodeSchema = z.string().regex(
  /^[A-Z]{2}$/, 
  "El código de país debe ser 2 letras mayúsculas (ISO 3166-1 alpha-2)"
);

// --- Interfaces ---

export const UbicacionSchema = z.object({
  pais: IsoCountryCodeSchema,
  region: z.string().optional(),
  ciudad: z.string().min(1, "La ciudad es obligatoria"),
  direccion: z.string().optional(),
  timezone: IanaTimezoneSchema,
});

export const ZonaHorariaOptionSchema = z.object({
  region: z.string(),
  name: z.string(),
  offset: z.string().optional(), // Solo visualización
});

// Day of week schema
export const DayOfWeekKeySchema = z.enum(['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo']);

// Estructura estricta para fechas con zona horaria
export const campoFechaConZonaHorariaSchema = z.object({
    fecha: z.string().refine((val) => {
        // Acepta fecha (YYYY-MM-DD), fecha-hora (ISO base), o solo hora (HH:mm[:ss])
        // Regex simplificada para cubrir los casos mencionados en el tipo:
        // "YYYY-MM-DD" / "yyyy-MM-dd HH:mm" / "yyyy-MM-dd HH:mm:ss" / "HH:mm" / "HH:mm:ss"
        const dateRegex = /^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}(:\d{2})?)?$/;
        const timeRegex = /^\d{2}:\d{2}(:\d{2})?$/;
        return dateRegex.test(val) || timeRegex.test(val);
    }, "Formato de fecha/hora inválido"),
    zonaHoraria: IanaTimezoneSchema,
});
