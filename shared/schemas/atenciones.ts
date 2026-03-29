import { z } from 'zod';
import {
  AuthIdSchema,
  OptionalAuthIdSchema,
  FirestoreIdSchema,
  OptionalSlugIdSchema,
  TimestampSchema,
  SlugIdSchema,
} from './common';
import { FechaHoraIsoSchema } from './fechas';

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
    fechaHoraSolicitudComida: FechaHoraIsoSchema,
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
}).superRefine((data, ctx) => {
  // 1) fechaHoraAtencion debe ser hoy o futuro (comparando solo fecha parte)
  try {
    const now = new Date();
    const localToday = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 10);

    const fechaAtencionDatePart = String(data.fechaHoraAtencion).slice(0, 10);
    if (fechaAtencionDatePart < localToday) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['fechaHoraAtencion'],
        message: 'La fecha/hora de la atencion debe ser hoy o una fecha futura.',
      });
    }

    // 2) fechaHoraAtencion (solo fecha parte) >= fechaHoraSolicitudComida (solo fecha parte)
    const fechaSolicitudDatePart = String(data.fechaHoraSolicitudComida).slice(0, 10);
    if (fechaAtencionDatePart < fechaSolicitudDatePart) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['fechaHoraAtencion'],
        message: 'La fecha/hora de la atención debe ser el mismo día o posterior a la fecha de solicitud.',
      });
    }
  } catch (err) {
    // No detener el flujo de validación por errores inesperados en la comprobación
  }
});

export const ActualizarAtencionPayloadSchema = z
  .object({
    id: FirestoreIdSchema,
    nombre: NombreAtencionSchema,
    comentarios: ComentariosAtencionSchema,
    fechaHoraSolicitudComida: FechaHoraIsoSchema,
    fechaHoraAtencion: FechaHoraIsoSchema,
    centroCostoId: OptionalSlugIdSchema,
    estado: AtencionEstadoSchema.optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    try {
      const now = new Date();
      const localToday = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 10);

      const fechaAtencionDatePart = String(data.fechaHoraAtencion).slice(0, 10);
      if (fechaAtencionDatePart < localToday) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['fechaHoraAtencion'],
          message: 'La fecha/hora de la atencion debe ser hoy o una fecha futura.',
        });
      }

      const fechaSolicitudDatePart = String(data.fechaHoraSolicitudComida).slice(0, 10);
      if (fechaAtencionDatePart < fechaSolicitudDatePart) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['fechaHoraAtencion'],
          message: 'La fecha/hora de la atención debe ser el mismo día o posterior a la fecha de solicitud.',
        });
      }
    } catch (err) {
      // ignore
    }
  });

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
