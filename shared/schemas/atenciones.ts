import { z } from 'zod';
import {
  AuthIdSchema,
  OptionalAuthIdSchema,
  FirestoreIdSchema,
  OptionalSlugIdSchema,
  TimestampSchema,
  SlugIdSchema,
} from './common';
import { FechaHoraIsoSchema, FechaIsoSchema } from './fechas';

export const AtencionEstadoSchema = z.enum(['pendiente', 'aprobada', 'rechazada']);
export const AtencionAvisoAdministracionSchema = z.enum([
  'no_comunicado',
  'comunicado',
  'cancelado',
]);

const ComentariosAtencionSchema = z.preprocess(
  (val) => (val === '' || val === null ? undefined : val),
  z.string().trim().min(1, 'Comentario invalido').max(500).optional(),
);

const NombreAtencionSchema = z.string().trim().min(1).max(120);

export const AtencionSchema = z
  .object({
    id: FirestoreIdSchema,
    residenciaId: SlugIdSchema,
    autorId: AuthIdSchema,
    aprobadorId: OptionalAuthIdSchema,

    nombre: NombreAtencionSchema,
    comentarios: ComentariosAtencionSchema,
    timestampCreacion: TimestampSchema,
    fechaSolicitudComida: FechaIsoSchema,
    fechaHoraAtencion: FechaHoraIsoSchema,

    estado: AtencionEstadoSchema,
    avisoAdministracion: AtencionAvisoAdministracionSchema,

    centroCostoId: OptionalSlugIdSchema,
  })
  .strict();

export const CrearAtencionPayloadSchema = AtencionSchema.omit({
  id: true,
  residenciaId: true,
  autorId: true,
  aprobadorId: true,
  timestampCreacion: true,
  estado: true,
  avisoAdministracion: true,
});

export const ActualizarAtencionPayloadSchema = z
  .object({
    id: FirestoreIdSchema,
    nombre: NombreAtencionSchema,
    comentarios: ComentariosAtencionSchema,
    fechaSolicitudComida: FechaIsoSchema,
    fechaHoraAtencion: FechaHoraIsoSchema,
    centroCostoId: OptionalSlugIdSchema,
    estado: AtencionEstadoSchema.optional(),
  })
  .strict();

export const CambiarEstadoAtencionPayloadSchema = z
  .object({
    id: FirestoreIdSchema,
    estado: AtencionEstadoSchema,
  })
  .strict();

export type Atencion = z.infer<typeof AtencionSchema>;
export type CrearAtencionPayload = z.infer<typeof CrearAtencionPayloadSchema>;
export type ActualizarAtencionPayload = z.infer<typeof ActualizarAtencionPayloadSchema>;
export type CambiarEstadoAtencionPayload = z.infer<typeof CambiarEstadoAtencionPayloadSchema>;
