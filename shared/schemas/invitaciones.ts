import { z } from 'zod';
import { AuthIdSchema } from './common';
import { createUsuarioSchema } from './usuarios';

export const InvitacionUsuarioSchema = z.object({
  uid: AuthIdSchema,
  email: z.string().email(),
  residenciaId: z.string().min(1),
  tokenVersion: z.number().int().min(1),
  expiresAt: z.any(),
  timestampCreacion: z.any().optional(),
  timestampActualizacion: z.any().optional(),
  lastSentAt: z.any().nullable().optional(),
  lastResendRequestedAt: z.any().nullable().optional(),
  status: z.enum(['pendiente', 'enviada', 'error_envio']).default('pendiente'),
  lastError: z.string().optional(),
  createdByUid: AuthIdSchema.optional(),
});

export const CrearUsuarioInvitacionPayloadSchema = z.object({
  profileData: createUsuarioSchema,
});

export const ReenviarInvitacionPayloadSchema = z.object({
  uid: AuthIdSchema,
});

export const AceptarInvitacionPayloadSchema = z.object({
  token: z.string().min(10),
  password: z.string().min(6),
});

export type InvitacionUsuario = z.infer<typeof InvitacionUsuarioSchema>;
export type CrearUsuarioInvitacionPayload = z.infer<typeof CrearUsuarioInvitacionPayloadSchema>;
export type ReenviarInvitacionPayload = z.infer<typeof ReenviarInvitacionPayloadSchema>;
export type AceptarInvitacionPayload = z.infer<typeof AceptarInvitacionPayloadSchema>;

