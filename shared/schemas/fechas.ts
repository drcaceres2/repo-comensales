import { z } from "zod";
import timezoneData from "../data/zonas_horarias_soportadas.json";
import { UbicacionSchema  } from './common';

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

// Formato YYYY-MM-DD
export const FechaIsoSchema = z.string().regex(
    /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/,
    { message: "La fecha debe tener formato YYYY-MM-DD válido" }
);

// Formato YYYY-MM-DD opcional (para formularios)
export const FechaIsoOpcionalSchema = z.preprocess(
    (val) => (val === "" || val === null) ? undefined : val,
    z.string().optional().pipe(FechaIsoSchema.optional())
);

// Formato YYYY-MM-DDTHH:mm:ss
export const FechaHoraIsoSchema = z.string().regex(
    /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/,
    { message: "La fecha y hora debe tener formato YYYY-MM-DDTHH:mm:ss válido" }
);

// Identificador IANA (ej: "America/Tegucigalpa")
// Valida contra la lista de zonas soportadas
export const ZonaHorariaIanaSchema = z.string().refine(
    isValidTimeZone, { message: "Zona horaria inválida" }
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

export type DiaDeLaSemana = z.infer<typeof DiaDeLaSemanaSchema>;
export type FechaIso = z.infer<typeof FechaIsoSchema>;
export type FechaHoraIso = z.infer<typeof FechaHoraIsoSchema>;
export type HoraIso = z.infer<typeof HoraIsoSchema>;
export type ZonaHorariaIana = z.infer<typeof ZonaHorariaIanaSchema>;