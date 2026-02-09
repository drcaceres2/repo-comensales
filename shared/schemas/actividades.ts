import { z } from 'zod';
import {
  ActividadEstado,
  TipoAccesoActividad,
  TipoSolicitudComidasActividad,
  EstadoInscripcionActividad,
} from '@/../shared/models/types';

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
  nombre: z.string().min(1, 'El nombre debe tener al menos 1 caracter').max(25, 'El nombre no puede tener más de 25 caracteres'),
  descripcionGeneral: z.string().min(1).max(63).optional(),
  maxParticipantes: z.number().int().min(1).max(1000).optional(),
  estado: ActividadEstadoEnum,
  organizadorUserId: z.string(),
  comensalesNoUsuarios: z.number().int().min(1).max(1000).optional(),
  fechaInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener el formato YYYY-MM-DD'),
  fechaFin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener el formato YYYY-MM-DD'),
  ultimoTiempoComidaAntes: z.string(),
  primerTiempoComidaDespues: z.string(),
  planComidas: z.array(z.any()), // Se puede detallar más si es necesario
  tipoSolicitudComidas: TipoSolicitudComidasActividadEnum,
  estadoSolicitudAdministracion: z.enum(['no_solicitado', 'solicitud_inicial_realizada', 'completada']),
  comedorActividad: z.string().nullable().optional(),
  modoAtencionActividad: z.enum(['residencia', 'externa']),
  requiereInscripcion: z.boolean(),
  diasAntelacionCierreInscripcion: z.number().optional(),
  tipoAccesoActividad: TipoAccesoActividadEnum,
  aceptaResidentes: z.boolean(),
  aceptaInvitados: z.enum(['no', 'por_invitacion', 'invitacion_libre']),
  defaultCentroCostoId: z.string().nullable().optional(),
});

// Esquema para InscripcionActividad
export const InscripcionActividadSchema = z.object({
  id: z.string(),
  actividadId: z.string(),
  userId: z.string(),
  residenciaId: z.string(),
  estadoInscripcion: EstadoInscripcionActividadEnum,
  fechaEstado: z.number(), // Timestamp en milisegundos
  invitadoPorUserId: z.string().optional(),
  fechaInvitacionOriginal: z.number().nullable().optional(), // Timestamp en milisegundos
  nombreInvitadoNoAutenticado: z.string().min(1).max(100).optional(),
});

export type Actividad = z.infer<typeof ActividadSchema>;
export type InscripcionActividad = z.infer<typeof InscripcionActividadSchema>;
