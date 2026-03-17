import { z } from 'zod';
import { 
    AuthIdSchema, 
    FirestoreIdSchema, 
    TimestampSchema 
} from 'shared/schemas/common';
import { FechaIsoSchema } from 'shared/schemas/fechas';

// ============================================\
// Enums y Taxonomía
// ============================================\

export const EstadoActividadEnum = z.enum([
    'pendiente',              // Creada, esperando aprobación del Director
    'aprobada',               // Aprobada, lista para abrir inscripciones
    'inscripcion_abierta',    // Usuarios pueden inscribirse o ser invitados
    'inscripcion_cerrada',    // Cierre organizativo. Solo el Organizador puede forzar cambios
    'finalizada',             // Ya pasó cronológicamente
    'cancelada'               // Abortada (estado terminal)
]);

export const VisibilidadActividadEnum = z.enum([
    'publica', // Visible en el feed de la residencia
    'oculta',  // Solo accesible por invitación directa o link
]);

export const TipoAccesoActividadEnum = z.enum([
    'abierta',         // Cualquier residente puede darle "Inscribirme"
    'solo_invitacion', // El botón está bloqueado, requiere ser invitado por organizador o tercero
]);

export const TipoSolicitudAdministracionEnum = z.enum([
    'ninguna',         // La comida no la da la administración (Ej: van a un restaurante)
    'solicitud_unica', // Evento puntual (ordinario)
    'diario',          // Eventos largos (Ej: retiro de varios días)
]);

export const EstadoInscripcionEnum = z.enum([
    'invitacion_pendiente',      // Se creó el registro, el usuario aún no acepta
    'confirmada',                // El usuario va a consumir una ración (Autoinscrito o aceptada)
    'rechazada',                 // El usuario declinó la invitación
    'cancelada_por_usuario',     // Confirmó, pero luego se dio de baja
    'cancelada_por_organizador'  // El organizador purgó al usuario (Modo Dios)
]);

// ============================================\
// Sub-Esquemas Core
// ============================================\

export const FronterasActividadSchema = z.object({
    fechaInicio: FechaIsoSchema,
    tiempoComidaInicioId: z.string(), // ID del Singleton de horarios
    
    fechaFin: FechaIsoSchema,
    tiempoComidaFinId: z.string(),    // ID del Singleton de horarios
});

// ============================================\
// Esquemas Principales
// ============================================\

export const ActividadBaseSchema = z.object({
    id: FirestoreIdSchema,
    residenciaId: FirestoreIdSchema,
    
    // --- Metadatos y UI (Mutables sin impacto destructivo) ---
    titulo: z.string().min(3),
    descripcion: z.string().optional(),
    lugar: z.string().optional(),
    organizadorId: AuthIdSchema,
    
    // --- Taxonomía y Máquina de Estados ---
    estado: EstadoActividadEnum,
    visibilidad: VisibilidadActividadEnum,
    tipoAcceso: TipoAccesoActividadEnum,
    permiteInvitadosExternos: z.boolean(),
    
    // --- Configuración B2B / Contable (Críticos) ---
    centroCostoId: FirestoreIdSchema,
    solicitudAdministracion: TipoSolicitudAdministracionEnum,
    
    // --- Control de Cupos y Raciones (OCC) ---
    maxParticipantes: z.number().int().positive(), // Cupo máximo nominal
    conteoInscritos: z.number().int().nonnegative().default(0), // Total de inscripciones en estado 'confirmada'
    adicionalesNoNominales: z.number().int().nonnegative().default(0), // "A ojo de buen cubero"
    
    // --- Trazabilidad ---
    timestampCreacion: TimestampSchema,
    timestampModificacion: TimestampSchema,
}).merge(FronterasActividadSchema);

export const ActividadCreateSchema = ActividadBaseSchema.omit({
    id: true,
    conteoInscritos: true,
    timestampCreacion: true,
    timestampModificacion: true,
}).extend({
    // Permite que el server inyecte los timestamps
    timestampCreacion: TimestampSchema.optional(),
    timestampModificacion: TimestampSchema.optional(),
});

export const ActividadUpdateSchema = ActividadBaseSchema.omit({
    id: true,
    residenciaId: true,
}).partial();

// ============================================\
// Esquema de Inscripciones (Subcolección)
// ============================================\

export const InscripcionActividadSchema = z.object({
    id: z.string(), // Generalmente igual al usuarioId, o un ID autogenerado para shadow accounts invitadas múltiples veces a distintos eventos
    actividadId: FirestoreIdSchema,
    usuarioId: z.string(), // Puede ser un AuthId real o el ID de una Shadow Account (invitado)
    
    invitadoPorId: z.string().optional(), // ID del residente/organizador que gestionó la invitación
    estado: EstadoInscripcionEnum,
    
    timestampCreacion: TimestampSchema,
    timestampModificacion: TimestampSchema,
});

export const InscripcionActividadCreateSchema = InscripcionActividadSchema.omit({
    id: true,
    timestampCreacion: true,
    timestampModificacion: true,
}).extend({
    timestampCreacion: TimestampSchema.optional(),
    timestampModificacion: TimestampSchema.optional(),
});

export const InscripcionActividadUpdateSchema = InscripcionActividadSchema.omit({
    id: true,
    actividadId: true,
    usuarioId: true,
}).partial();

// ============================================\
// Types Exports
// ============================================\

export type Actividad = z.infer<typeof ActividadBaseSchema>;
export type ActividadCreate = z.infer<typeof ActividadCreateSchema>;
export type ActividadUpdate = z.infer<typeof ActividadUpdateSchema>;

export type InscripcionActividad = z.infer<typeof InscripcionActividadSchema>;
export type InscripcionActividadCreate = z.infer<typeof InscripcionActividadCreateSchema>;
export type InscripcionActividadUpdate = z.infer<typeof InscripcionActividadUpdateSchema>;