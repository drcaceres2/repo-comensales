import { z } from 'zod';
import {ColorHTMLSchema, FirestoreIdSchema, slugIdSchema} from "./common";
import {FechaIsoOpcionalSchema, FechaIsoSchema} from "./fechas";

export const RRULEString = z.string();

// 1. Esquema Base (Zod) - Capa 2 de Integridad
export const RecordatorioSchema = z.object({
    id: FirestoreIdSchema,
    residenciaId: slugIdSchema,
    usuarioIniciadorId: FirestoreIdSchema,

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

    timestampCreacion: z.string().datetime(),
    estaActivo: z.boolean().default(true) // Para el borrado lógico o desactivación anual
});

// 2. Inferencia de Tipos para TypeScript
export type Recordatorio = z.infer<typeof RecordatorioSchema>;

// 3. Tipos Auxiliares para el Frontend (Payload de creación)
export type CrearRecordatorioPayload = Omit<Recordatorio, 'id' | 'timestampCreacion' | 'tipo'>;