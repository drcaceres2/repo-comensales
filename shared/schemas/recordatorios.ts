import { z } from 'zod';
import {AuthIdSchema, ColorHTMLSchema, FirestoreIdSchema, slugIdSchema, TimestampSchema} from "./common";
import {FechaIsoOpcionalSchema, FechaIsoSchema} from "./fechas";

// Valida que empiece con FREQ y contenga solo los modificadores que permitimos en V1
const rruleRegex = /^FREQ=(DAILY|WEEKLY|MONTHLY)(;(INTERVAL=[1-9]\d*|BYDAY=(-?\d+)?[A-Z]{2}(,(-?\d+)?[A-Z]{2})*|BYMONTHDAY=\d+|COUNT=[1-9]\d*))*$/;

export const RRULEString = z.string().superRefine((val, ctx) => {
    // 1. Validación de formato estricto
    if (!rruleRegex.test(val)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Formato RRULE inválido o no soportado en V1",
        });
        return;
    }

    // 2. Validaciones de lógica cruzada
    if (val.includes('FREQ=MONTHLY')) {
        const tieneByDay = val.includes('BYDAY=');
        const tieneByMonthDay = val.includes('BYMONTHDAY=');

        if (tieneByDay && tieneByMonthDay) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Una regla mensual no puede mezclar días de la semana y días del mes simultáneamente en esta versión",
            });
        }
        if (!tieneByDay && !tieneByMonthDay) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Una regla mensual debe especificar BYDAY o BYMONTHDAY",
            });
        }
    }
});

// 1. Esquema Base (Zod) - Capa 2 de Integridad
export const RecordatorioSchema = z.object({
    id: FirestoreIdSchema,
    residenciaId: slugIdSchema,
    usuarioIniciadorId: AuthIdSchema,

    // Clasificación para saber cómo renderizarlo o si se puede editar manualmente
    tipo: z.enum(['manual', 'cumpleanos', 'sistema']),

    titulo: z.string().min(1, "El título debe tener al menos 1 caracter").max(25),
    descripcion: z.string().max(500).optional(),
    color: ColorHTMLSchema,

    // Ventana de Validez. Fundamental para la consulta en TSQ.
    // Usamos string ISO 8601 (ej. "2025-01-01T00:00:00Z")
    fechaInicioValidez: FechaIsoSchema,
    fechaFinValidez: FechaIsoSchema,

    // El núcleo de la recurrencia
    reglaRecurrencia: RRULEString.optional(), // Ej: "FREQ=MONTHLY;BYDAY=3WE"
    duracionDias: z.number().int().positive().default(1),

    // Arreglo de fechas ISO para las excepciones/cancelaciones puntuales
    exclusiones: z.array(FechaIsoOpcionalSchema).optional(),

    timestampCreacion: TimestampSchema,
    estaActivo: z.boolean().default(true) // Para el borrado lógico o desactivación anual
});

// 2. Inferencia de Tipos para TypeScript
export type Recordatorio = z.infer<typeof RecordatorioSchema>;

// 3. Tipos Auxiliares para el Frontend (Payload de creación)
export type CrearRecordatorioPayload = Omit<Recordatorio, 'id' | 'timestampCreacion' | 'tipo'>;