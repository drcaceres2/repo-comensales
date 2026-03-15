import { z } from 'zod';
import { AuthIdSchema, FirestoreIdSchema, TimestampSchema } from 'shared/schemas/common';
import { FechaIsoSchema } from 'shared/schemas/fechas';

export const EstadoActividadEnum = z.enum([
    'pendiente',              // Creada, esperando aprobación del Director
    'aprobada',               // Aprobada, lista para que el organizador abra inscripciones
    'inscripcion_abierta',    // Usuarios pueden crear documentos en la subcolección
    'inscripcion_cerrada',    // Antelación cumplida o forzado manual. No más inscripciones
    'finalizada',             // Ya pasó cronológicamente
    'cancelada'               // Abortada en cualquier punto (estado terminal)
]);

// Separamos las fronteras para poder validarlas fácilmente en el backend
export const FronterasActividadSchema = z.object({
    fechaInicio: FechaIsoSchema,
    tiempoComidaInicioId: z.string(), // Ej: 'desayuno_id'
    
    fechaFin: FechaIsoSchema,
    tiempoComidaFinId: z.string(),    // Ej: 'cena_id'
});

export const ActividadBaseSchema = z.object({
    id: FirestoreIdSchema,
    residenciaId: FirestoreIdSchema,
    
    // --- Metadatos y UI (Mutables sin impacto destructivo) ---
    titulo: z.string().min(3),
    descripcion: z.string().optional(),
    lugar: z.string().optional(),
    organizadorId: AuthIdSchema,
    
    // --- Máquina de Estados ---
    estado: EstadoActividadEnum,
    
    // --- Configuración B2B / Contable (Críticos) ---
    centroCostoId: FirestoreIdSchema,
    solicitudAdministracion: z.enum(['ninguna', 'solicitud_unica', 'diario']),
    
    // --- Control de Concurrencia (OCC) y Cupos ---
    maxParticipantes: z.number().int().positive(),
    conteoInscritos: z.number().int().nonnegative().default(0), // <- El token OCC
    
    // --- Trazabilidad ---
    timestampCreacion: TimestampSchema,
    timestampModificacion: TimestampSchema,
}).merge(FronterasActividadSchema);

export const InscripcionActividadSchema = z.object({
    id: z.string(), // Generalmente será el mismo usuarioId para evitar duplicados lógicos
    actividadId: FirestoreIdSchema,
    usuarioId: AuthIdSchema,
    
    // Trazabilidad básica para auditoría en caso de reclamos
    timestampCreacion: TimestampSchema,
});