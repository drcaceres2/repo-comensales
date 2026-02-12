import { z } from 'zod';
import { CadenaOpcionalLimitada, FirestoreTimestampSchema } from './common';
import { IsoDateStringSchema, IsoTimeStringSchema } from './fechas';


// Esquema para el enum ActividadEstado
const ActividadEstadoEnum = z.enum([
  'borrador',
  'abierta_inscripcion',
  'cerrada_inscripcion',
  'confirmada_finalizada',
  'cancelada',
]);

// Esquema para el enum TipoAccesoActividad
const TipoAccesoActividadEnum = z.enum([
  'abierta',
  'invitacion_requerida',
  'opcion_unica',
]);

// Esquema para el enum TipoSolicitudComidasActividad
const TipoSolicitudComidasActividadEnum = z.enum([
  'ninguna',
  'solicitud_unica',
  'diario_externo',
  'diario_residencia',
  'solicitud_inicial_mas_confirmacion_diaria_residencia',
  'solicitud_inicial_mas_confirmacion_diaria_externa',
]);

// Esquema para el enum EstadoInscripcionActividad
const EstadoInscripcionActividadEnum = z.enum([
  'invitado_pendiente',
  'invitado_rechazado',
  'invitado_aceptado',
  'inscrito_directo',
  'cancelado_usuario',
  'cancelado_admin',
]);

// Esquema para Actividad
export const ActividadSchema = z.object({
  id: z.string(),
  residenciaId: z.string(),
  nombre: z.string().min(1, 'El nombre debe tener al menos 1 caracter').max(100, 'El nombre no puede tener más de 100 caracteres'),
  descripcionGeneral: z.string().max(500, 'La descripción es muy larga').optional(),
  maxParticipantes: z.number().int().min(1).max(1000).optional(),
  estado: ActividadEstadoEnum.default('borrador'),
  organizadorUserId: z.string(),
  comensalesNoUsuarios: z.number().int().min(0).max(1000).optional(),
  fechaInicio: z.string(), 
  fechaFin: z.string(),
  ultimoTiempoComidaAntes: z.string().optional(), 
  primerTiempoComidaDespues: z.string().optional(), 
  planComidas: z.array(z.any()).default([]),
  tipoSolicitudComidas: TipoSolicitudComidasActividadEnum.default('ninguna'),
  estadoSolicitudAdministracion: z.enum(['no_solicitado', 'solicitud_inicial_realizada', 'completada']).default('no_solicitado'),
  comedorActividad: z.string().optional(),
  modoAtencionActividad: z.enum(['residencia', 'externa']).default('residencia'),
  requiereInscripcion: z.boolean().default(true),
  diasAntelacionCierreInscripcion: z.number().optional(),
  tipoAccesoActividad: TipoAccesoActividadEnum.default('abierta'),
  aceptaResidentes: z.boolean().default(true),
  aceptaInvitados: z.enum(['no', 'por_invitacion', 'invitacion_libre']).default('no'),
  defaultCentroCostoId: z.string().optional(),
});

// Esquema para InscripcionActividad (lectura desde Firestore)
export const InscripcionActividadSchema = z.object({
  id: z.string(),
  actividadId: z.string(),
  userId: z.string(),
  residenciaId: z.string(),
  estadoInscripcion: EstadoInscripcionActividadEnum,
  invitadoPorUserId: z.string().optional(),
  nombreInvitadoNoAutenticado: CadenaOpcionalLimitada(1, 100),
  fechaInvitacionOriginal: IsoDateStringSchema.nullable().optional(),
  fechaHoraCreacion: FirestoreTimestampSchema,
  fechaHoraModificacion: FirestoreTimestampSchema,
});

// Esquema para crear InscripcionActividad (sin id, pues se asigna en Firestore)
export const InscripcionActividadCreateSchema = z.object({
  actividadId: z.string().min(1, 'ID de actividad requerido'),
  userId: z.string().min(1, 'ID de usuario requerido'),
  residenciaId: z.string().min(1, 'ID de residencia requerido'),
  estadoInscripcion: EstadoInscripcionActividadEnum,
  invitadoPorUserId: z.string().optional(),
  nombreInvitadoNoAutenticado: CadenaOpcionalLimitada(1, 100),
  fechaInvitacionOriginal: IsoDateStringSchema.nullable().optional(),
  // fechaHoraCreacion y fechaHoraModificacion se asignan con serverTimestamp()
});

// Esquema para actualizar InscripcionActividad
export const InscripcionActividadUpdateSchema = z.object({
  estadoInscripcion: EstadoInscripcionActividadEnum,
  // fechaHoraModificacion se asigna con serverTimestamp()
});

export type Actividad = z.infer<typeof ActividadSchema>;
export type InscripcionActividad = z.infer<typeof InscripcionActividadSchema>;
export type InscripcionActividadCreate = z.infer<typeof InscripcionActividadCreateSchema>;
export type InscripcionActividadUpdate = z.infer<typeof InscripcionActividadUpdateSchema>;
