import { z } from 'zod';
import { FirebaseIdSchema, FirestoreTimestampSchema } from './common';

// --- Enums from types.ts ---

const ActividadEstadoEnum = z.enum([
  'borrador',
  'inscripcion_abierta',
  'inscripcion_cerrada',
  'solicitada_administracion',
  'cancelada',
]);

const TipoAccesoActividadEnum = z.enum([
  'abierta',
  'invitacion_requerida',
  'opcion_unica',
]);

const TipoSolicitudComidasActividadEnum = z.enum([
  'ninguna',
  'solicitud_unica',
  'solicitud_diaria',
  'solicitud_inicial_mas_confirmacion_diaria',
]);

const EstadoInscripcionActividadEnum = z.enum([
  'invitado_pendiente',
  'invitado_rechazado',
  'invitado_aceptado',
  'inscrito_directo',
  'cancelado_usuario',
  'cancelado_admin',
]);

// --- Schema for nested object ---
export const TiempoComidaAlternativaUnicaActividadSchema = z.object({
  id: FirebaseIdSchema.optional(),
  nombreTiempoComida_AlternativaUnica: z.string(),
  nombreGrupoTiempoComida: z.string(),
  ordenGrupoTiempoComida: z.number(),
  fecha: z.string(), // ISO Date String
  horaEstimada: z.string().optional(), // ISO Time String
});


// --- Base Schema ---

const ActividadBaseSchema = z.object({
  // Campos generales
  id: FirebaseIdSchema,
  residenciaId: FirebaseIdSchema,
  organizadorId: FirebaseIdSchema,
  nombre: z.string().trim().min(1, 'El nombre es obligatorio').max(25, 'El nombre no puede exceder los 25 caracteres'),
  descripcion: z.string().trim().max(255, 'La descripción no puede exceder los 255 caracteres').optional(),
  estado: ActividadEstadoEnum,
  tipoSolicitudComidas: TipoSolicitudComidasActividadEnum,

  // Campos de cálculo de comidas
  fechaInicio: z.string(), // ISO 8601 "YYYY-MM-DD"
  fechaFin: z.string(), // ISO 8601 "YYYY-MM-DD"
  tiempoComidaInicial: FirebaseIdSchema,
  tiempoComidaFinal: FirebaseIdSchema,
  planComidas: z.array(TiempoComidaAlternativaUnicaActividadSchema), // Refined with specific schema
  comedorActividad: FirebaseIdSchema.nullable().optional(),
  modoAtencionActividad: z.enum(['residencia', 'externa']),

  // Campos de lógica de inscripción
  maxParticipantes: z.number().int('Debe ser un número entero').min(2, 'El máximo de participantes debe ser al menos 2').optional(),
  comensalesNoUsuarios: z.number().int('Debe ser un número entero').nonnegative('Debe ser un número positivo o cero'),
  requiereInscripcion: z.boolean(),
  diasAntelacionSolicitudAdministracion: z.number().int().nonnegative(),
  tipoAccesoResidentes: TipoAccesoActividadEnum.optional(),
  tipoAccesoInvitados: TipoAccesoActividadEnum.optional(),
  
  // Campos de costo
  defaultCentroCostoId: FirebaseIdSchema.nullable().optional(),
});

// --- Create Schema ---

export const ActividadCreateSchema = ActividadBaseSchema.omit({ 
    id: true, 
    residenciaId: true, 
    organizadorId: true,
    estado: true,
    comensalesNoUsuarios: true,
  }).extend({
    estado: ActividadEstadoEnum.default('borrador'),
    comensalesNoUsuarios: z.number().int().nonnegative().default(0),
  }).refine(data => data.fechaFin >= data.fechaInicio, {
    message: "La fecha de finalización no puede ser anterior a la fecha de inicio",
    path: ["fechaFin"],
  })
  .superRefine((data, ctx) => {
    if (data.requiereInscripcion) {
      if (!data.tipoAccesoResidentes) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['tipoAccesoResidentes'],
          message: 'El tipo de acceso para residentes es obligatorio si se requiere inscripción.',
        });
      }
    } else {
      // If requiresInscripcion is false, these shouldn't be set (though they are optional in base)
    }
  }).superRefine((data, ctx) => {
    if (data.modoAtencionActividad === 'residencia' && !data.comedorActividad) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['comedorActividad'],
            message: 'El comedor es obligatorio cuando el modo de atención es "residencia".',
        });
    }
});

// --- Update Schema ---

export const ActividadUpdateSchema = ActividadBaseSchema.omit({
    id: true,
    residenciaId: true,
    organizadorId: true,
}).partial().refine(data => {
    if (data.fechaInicio && data.fechaFin) {
        return data.fechaFin >= data.fechaInicio;
    }
    return true;
}, {
    message: "La fecha de finalización no puede ser anterior a la fecha de inicio",
    path: ["fechaFin"],
})
.superRefine((data, ctx) => {
    // Note: State-based field restriction enforcement should be done in the server action 
    // because Zod schemas don't have access to the *current* state of the document in DB.
    // However, if the state is being updated in the same transaction, we can check it.
    
    if (data.estado === 'borrador' && data.comensalesNoUsuarios !== undefined && data.comensalesNoUsuarios !== 0) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['comensalesNoUsuarios'],
            message: 'Los comensales no usuarios deben ser 0 en estado "borrador".',
        });
    }

    if (data.requiereInscripcion === true && !data.tipoAccesoResidentes) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['tipoAccesoResidentes'],
          message: 'El tipo de acceso para residentes es obligatorio si se requiere inscripción.',
        });
    }
}).superRefine((data, ctx) => {
    if (data.modoAtencionActividad === 'residencia' && !data.comedorActividad) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['comedorActividad'],
            message: 'El comedor es obligatorio cuando el modo de atención es "residencia".',
        });
    }
});


export const ActividadEstadoUpdateSchema = z.object({
    estado: ActividadEstadoEnum,
});

export const ActividadSchema = ActividadBaseSchema;

// --- Inscripciones Schemas ---

export const InscripcionActividadSchema = z.object({
  id: FirebaseIdSchema,
  actividadId: FirebaseIdSchema,
  userId: FirebaseIdSchema,
  residenciaId: FirebaseIdSchema,
  estadoInscripcion: EstadoInscripcionActividadEnum,
  invitadoPorUserId: FirebaseIdSchema.optional(),
  nombreInvitadoNoAutenticado: z.string().trim().optional(),
  fechaInvitacionOriginal: z.string().nullable().optional(),
  fechaHoraCreacion: FirestoreTimestampSchema,
  fechaHoraModificacion: FirestoreTimestampSchema,
});

export const InscripcionActividadCreateSchema = InscripcionActividadSchema.omit({
  id: true,
  fechaHoraCreacion: true,
  fechaHoraModificacion: true,
}).extend({
  fechaHoraCreacion: FirestoreTimestampSchema.optional(),
  fechaHoraModificacion: FirestoreTimestampSchema.optional(),
});

export const InscripcionActividadUpdateSchema = InscripcionActividadSchema.omit({
  id: true,
  actividadId: true,
  userId: true,
  residenciaId: true,
}).partial();

export type Actividad = z.infer<typeof ActividadBaseSchema>;
export type ActividadCreate = z.infer<typeof ActividadCreateSchema>;
export type ActividadUpdate = z.infer<typeof ActividadUpdateSchema>;
export type InscripcionActividad = z.infer<typeof InscripcionActividadSchema>;