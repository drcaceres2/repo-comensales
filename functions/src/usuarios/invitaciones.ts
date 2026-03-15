import {
  CallableRequest,
  HttpsError,
  onCall,
  onRequest,
} from 'firebase-functions/v2/https';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as functions from 'firebase-functions/v2';
import jwt from 'jsonwebtoken';
import { Resend } from 'resend';
import { randomUUID } from 'crypto';

import { admin, db, FieldValue, Timestamp } from '../lib/firebase';
import { getCallerSecurityInfo } from '../common/security';
import { logAction } from '../common/logging';
import {
  AceptarInvitacionPayloadSchema,
  CrearUsuarioInvitacionPayload,
  CrearUsuarioInvitacionPayloadSchema,
  ReenviarInvitacionPayload,
  ReenviarInvitacionPayloadSchema,
} from '../../../shared/schemas/invitaciones';
import { Usuario } from '../../../shared/schemas/usuarios';
import { Residencia } from '../../../shared/schemas/residencia';

// Mantener hardcodeada la expiracion facilita trazabilidad del flujo y evita variaciones por entorno.
const INVITE_EXPIRATION_HOURS = 2;
const RESEND_COOLDOWN_MS = 60 * 1000;

interface InviteJwtPayload {
  uid: string;
  v: number;
}

function getInviteJwtSecret(): string {
  const secret = process.env.INVITE_JWT_SECRET;
  if (secret) {
    return secret;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('Missing INVITE_JWT_SECRET in production environment.');
  }

  functions.logger.warn('Using local fallback for INVITE_JWT_SECRET. Configure env var before production.');
  return 'local-dev-invite-secret';
}

function getInviteBaseUrl(): string {
  return process.env.INVITE_BASE_URL || 'http://localhost:3001';
}

function asDate(value: unknown): Date | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : new Date(parsed);
  }

  if (typeof value === 'object') {
    const maybe = value as { toDate?: () => Date; seconds?: number };
    if (typeof maybe.toDate === 'function') {
      const d = maybe.toDate();
      return Number.isNaN(d.getTime()) ? null : d;
    }
    if (typeof maybe.seconds === 'number') {
      const d = new Date(maybe.seconds * 1000);
      return Number.isNaN(d.getTime()) ? null : d;
    }
  }

  return null;
}

function maskEmail(email: string): string {
  const [localPart, domain] = email.split('@');
  if (!localPart || !domain) {
    return 'correo-no-disponible';
  }

  if (localPart.length <= 2) {
    return `${localPart[0] || '*'}***@${domain}`;
  }

  return `${localPart.slice(0, 2)}***@${domain}`;
}

function buildInviteLink(token: string): string {
  return `${getInviteBaseUrl()}/invitacion/finalizar?token=${encodeURIComponent(token)}`;
}

async function getClaimsForResidencia(residenciaId: string | null, email: string, roles: string[], isActive: boolean) {
  const claimsToSet: Record<string, any> = {
    roles,
    isActive,
    email,
  };

  if (!residenciaId) {
    return claimsToSet;
  }

  claimsToSet.residenciaId = residenciaId;

  const residenciaDoc = await db.collection('residencias').doc(residenciaId).get();
  if (!residenciaDoc.exists) {
    return claimsToSet;
  }

  const residenciaData = residenciaDoc.data() as Residencia;
  if (residenciaData.ubicacion?.zonaHoraria) {
    claimsToSet.zonaHoraria = residenciaData.ubicacion.zonaHoraria;
  }
  if (residenciaData.contextoTraduccion) {
    claimsToSet.contextoTraduccion = residenciaData.contextoTraduccion;
    claimsToSet.ctxTraduccion = residenciaData.contextoTraduccion;
  }

  return claimsToSet;
}

async function validateInvitationToken(token: string): Promise<{ uid: string; tokenVersion: number; invitacionData: any }> {
  let decoded: jwt.JwtPayload;
  try {
    decoded = jwt.verify(token, getInviteJwtSecret(), {
      algorithms: ['HS256']
    }) as jwt.JwtPayload;
  } catch {
    throw new HttpsError('unauthenticated', 'Token de invitacion invalido o expirado.');
  }

  const uid = String(decoded.uid || '');
  const tokenVersion = Number(decoded.v || 0);
  if (!uid || !Number.isInteger(tokenVersion) || tokenVersion <= 0) {
    throw new HttpsError('invalid-argument', 'Token de invitacion mal formado.');
  }

  const invitacionRef = db.collection('invitaciones').doc(uid);
  const invitacionSnap = await invitacionRef.get();

  if (!invitacionSnap.exists) {
    throw new HttpsError('not-found', 'Invitacion no encontrada o ya utilizada.');
  }

  const invitacionData = invitacionSnap.data() as any;
  const expiresAt = asDate(invitacionData.expiresAt);

  if (!expiresAt || expiresAt.getTime() <= Date.now()) {
    throw new HttpsError('deadline-exceeded', 'La invitacion ha expirado.');
  }

  if ((invitacionData.tokenVersion || 0) !== tokenVersion) {
    throw new HttpsError('aborted', 'Token de invitacion invalidado por reenvio.');
  }

  return { uid, tokenVersion, invitacionData };
}

async function dispatchInvitationEmail(uid: string, invitacionData: any): Promise<void> {
  const token = jwt.sign(
    { uid, v: invitacionData.tokenVersion } satisfies InviteJwtPayload,
    getInviteJwtSecret(),
    { expiresIn: `${INVITE_EXPIRATION_HOURS}h` }
  );

  const inviteUrl = buildInviteLink(token);
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    console.log(`[INVITACION][DEV] uid=${uid}; email=${invitacionData.email}; enlace=${inviteUrl}`);
  }

  try {
    if (isProduction) {
      const apiKey = process.env.RESEND_API_KEY;
      const from = process.env.INVITE_FROM_EMAIL;
      if (!apiKey || !from) {
        throw new Error('Missing RESEND_API_KEY or INVITE_FROM_EMAIL for production invite email.');
      }

      const resend = new Resend(apiKey);
      await resend.emails.send({
        from,
        to: invitacionData.email,
        subject: 'Completa tu registro en Comensales',
        html: `<p>Has sido invitado(a) a Comensales.</p><p>Completa tu registro aqui:</p><p><a href="${inviteUrl}">${inviteUrl}</a></p>`,
      });
    }

    await db.collection('invitaciones').doc(uid).update({
      status: 'enviada',
      lastError: FieldValue.delete(),
      lastSentAt: FieldValue.serverTimestamp(),
      timestampActualizacion: FieldValue.serverTimestamp(),
    });

    await logAction(
      { uid: invitacionData.createdByUid || 'SYSTEM', token: { email: invitacionData.email } },
      {
        action: 'INVITACION_ENVIADA',
        targetId: uid,
        targetCollection: 'invitaciones',
        residenciaId: invitacionData.residenciaId,
        details: { email: invitacionData.email },
      }
    );
  } catch (error: any) {
    await db.collection('invitaciones').doc(uid).update({
      status: 'error_envio',
      lastError: error?.message || 'Error desconocido al enviar invitacion',
      timestampActualizacion: FieldValue.serverTimestamp(),
    });

    throw error;
  }
}

export const crearUsuarioInvitacion = onCall(
  {
    region: 'us-central1',
    cors: ['http://localhost:3001', 'http://127.0.0.1:3001'],
    timeoutSeconds: 300,
  },
  async (request: CallableRequest<CrearUsuarioInvitacionPayload>) => {
    const callerInfo = await getCallerSecurityInfo(request.auth);

    if (!callerInfo.isAdmin && !callerInfo.isMaster) {
      throw new HttpsError('permission-denied', 'Solo usuarios admin pueden crear invitaciones.');
    }

    const parsed = CrearUsuarioInvitacionPayloadSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError('invalid-argument', parsed.error.flatten().formErrors.join('; ') || 'Payload invalido.');
    }

    const validatedProfile = parsed.data.profileData;
    const callerResidenciaId = callerInfo.profile?.residenciaId || null;

    if (callerInfo.isAdmin && !callerInfo.isMaster) {
      if (!callerResidenciaId) {
        throw new HttpsError('failed-precondition', 'El admin no tiene residencia asignada.');
      }
      if (validatedProfile.residenciaId !== callerResidenciaId) {
        throw new HttpsError('permission-denied', 'Solo puedes crear usuarios en tu residencia.');
      }
    }

    const targetResidenciaId = validatedProfile.residenciaId || callerResidenciaId;
    if (!targetResidenciaId) {
      throw new HttpsError('failed-precondition', 'No se pudo resolver la residencia del usuario a crear.');
    }

    const nowMs = Date.now();
    const expiresAt = Timestamp.fromMillis(nowMs + INVITE_EXPIRATION_HOURS * 60 * 60 * 1000);

    if (!validatedProfile.tieneAutenticacion) {
      const uid = randomUUID();
      const usuarioDoc: Usuario = {
        id: uid,
        timestampCreacion: FieldValue.serverTimestamp(),
        timestampActualizacion: FieldValue.serverTimestamp(),
        ...validatedProfile,
        residenciaId: targetResidenciaId,
        estaActivo: true,
      } as Usuario;

      await db.collection('usuarios').doc(uid).set(usuarioDoc);

      await logAction(
        { uid: callerInfo.uid, token: callerInfo.claims },
        {
          action: 'USUARIO_CREADO',
          targetId: uid,
          targetCollection: 'usuarios',
          residenciaId: targetResidenciaId,
          details: { flow: 'sin-autenticacion' },
        }
      );

      return {
        success: true,
        userId: uid,
        invitationCreated: false,
        message: 'Usuario creado sin autenticacion.',
      };
    }

    let authUser: admin.auth.UserRecord | null = null;
    try {
      authUser = await admin.auth().createUser({
        email: validatedProfile.email,
        emailVerified: false,
        displayName: `${validatedProfile.nombre || ''} ${validatedProfile.apellido || ''}`.trim(),
        disabled: true,
      });

      const claimsToSet = await getClaimsForResidencia(
        targetResidenciaId,
        validatedProfile.email,
        validatedProfile.roles,
        false
      );

      await admin.auth().setCustomUserClaims(authUser.uid, claimsToSet);

      const usuarioDoc: Usuario = {
        id: authUser.uid,
        timestampCreacion: FieldValue.serverTimestamp(),
        timestampActualizacion: FieldValue.serverTimestamp(),
        ...validatedProfile,
        residenciaId: targetResidenciaId,
        estaActivo: false,
      } as Usuario;

      const invitacionDoc = {
        uid: authUser.uid,
        email: validatedProfile.email,
        residenciaId: targetResidenciaId,
        tokenVersion: 1,
        expiresAt,
        timestampCreacion: FieldValue.serverTimestamp(),
        timestampActualizacion: FieldValue.serverTimestamp(),
        status: 'pendiente',
        lastSentAt: null,
        lastResendRequestedAt: Timestamp.fromMillis(nowMs),
        createdByUid: callerInfo.uid,
      };

      const batch = db.batch();
      batch.set(db.collection('usuarios').doc(authUser.uid), usuarioDoc);
      batch.set(db.collection('invitaciones').doc(authUser.uid), invitacionDoc);
      await batch.commit();

      await logAction(
        { uid: callerInfo.uid, token: callerInfo.claims },
        {
          action: 'USUARIO_CREADO',
          targetId: authUser.uid,
          targetCollection: 'usuarios',
          residenciaId: targetResidenciaId,
          details: { flow: 'invitacion' },
        }
      );

      return {
        success: true,
        userId: authUser.uid,
        invitationCreated: true,
        message: 'Usuario creado. La invitacion sera despachada en segundo plano.',
      };
    } catch (error: any) {
      if (authUser) {
        await admin.auth().deleteUser(authUser.uid).catch((rollbackError) => {
          functions.logger.error('FUGA DE DATOS CRÍTICA: Falló el rollback en Auth. UID huérfano:', authUser!.uid, rollbackError);
        });
      }
      if (error?.code === 'auth/email-already-exists') {
        throw new HttpsError('already-exists', 'El correo ya existe en Firebase Auth.');
      }

      throw new HttpsError('internal', error?.message || 'No se pudo crear el usuario por invitacion.');
    }
  }
);

export const reenviarInvitacion = onCall(
  {
    region: 'us-central1',
    cors: ['http://localhost:3001', 'http://127.0.0.1:3001'],
  },
  async (request: CallableRequest<ReenviarInvitacionPayload>) => {
    const callerInfo = await getCallerSecurityInfo(request.auth);
    if (!callerInfo.isAdmin && !callerInfo.isMaster) {
      throw new HttpsError('permission-denied', 'No tienes permisos para reenviar invitaciones.');
    }

    const parsed = ReenviarInvitacionPayloadSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError('invalid-argument', 'uid es obligatorio.');
    }

    const invitacionRef = db.collection('invitaciones').doc(parsed.data.uid);
    const invitacionSnap = await invitacionRef.get();
    if (!invitacionSnap.exists) {
      throw new HttpsError('not-found', 'No existe invitacion pendiente para este usuario.');
    }

    const invitacionData = invitacionSnap.data() as any;

    if (
      callerInfo.isAdmin &&
      !callerInfo.isMaster &&
      callerInfo.profile?.residenciaId !== invitacionData.residenciaId
    ) {
      throw new HttpsError('permission-denied', 'Solo puedes reenviar invitaciones de tu residencia.');
    }

    const lastRequestedAt = asDate(invitacionData.lastResendRequestedAt);
    if (lastRequestedAt) {
      const msSinceLastRequest = Date.now() - lastRequestedAt.getTime();
      if (msSinceLastRequest < RESEND_COOLDOWN_MS) {
        const waitSeconds = Math.ceil((RESEND_COOLDOWN_MS - msSinceLastRequest) / 1000);
        throw new HttpsError('failed-precondition', `Debes esperar ${waitSeconds}s antes de reenviar.`);
      }
    }

    const nowMs = Date.now();
    await invitacionRef.update({
      tokenVersion: FieldValue.increment(1),
      expiresAt: Timestamp.fromMillis(nowMs + INVITE_EXPIRATION_HOURS * 60 * 60 * 1000),
      lastResendRequestedAt: Timestamp.fromMillis(nowMs),
      status: 'pendiente',
      timestampActualizacion: FieldValue.serverTimestamp(),
    });

    await logAction(
      { uid: callerInfo.uid, token: callerInfo.claims },
      {
        action: 'INVITACION_REENVIADA',
        targetId: parsed.data.uid,
        targetCollection: 'invitaciones',
        residenciaId: invitacionData.residenciaId,
        details: { tokenVersionBefore: invitacionData.tokenVersion },
      }
    );

    return { success: true, message: 'Reenvio solicitado. Se despachara en segundo plano.' };
  }
);

export const onInvitacionCreada = onDocumentCreated(
  {
    document: 'invitaciones/{uid}',
    region: 'us-central1',
  },
  async (event) => {
    const uid = event.params.uid;
    const invitacionData = event.data?.data();

    if (!uid || !invitacionData) {
      return;
    }

    try {
      await dispatchInvitationEmail(uid, invitacionData);
    } catch (error) {
      functions.logger.error('Error enviando invitacion (create trigger):', { uid, error });
    }
  }
);

export const onInvitacionActualizada = onDocumentUpdated(
  {
    document: 'invitaciones/{uid}',
    region: 'us-central1',
  },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    const uid = event.params.uid;

    if (!uid || !before || !after) {
      return;
    }

    if ((before.tokenVersion || 0) === (after.tokenVersion || 0)) {
      return;
    }

    try {
      await dispatchInvitationEmail(uid, after);
    } catch (error) {
      functions.logger.error('Error enviando invitacion (update trigger):', { uid, error });
    }
  }
);

export const aceptarInvitacionHttp = onRequest(
  {
    region: 'us-central1',
    cors: true,
  },
  async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    try {
      if (req.method === 'GET') {
        const token = String(req.query.token || '');
        if (!token) {
          res.status(400).json({ success: false, message: 'token es requerido.' });
          return;
        }

        const { invitacionData } = await validateInvitationToken(token);

        const rawEmail = String(invitacionData.email || '');
        const maskedEmail = maskEmail(rawEmail);
        const expiresAt = asDate(invitacionData.expiresAt)?.toISOString() || null;

        res.status(200).json({
          success: true,
          maskedEmail,
          expiresAt,
        });
        return;
      }

      if (req.method === 'POST') {
        const parsed = AceptarInvitacionPayloadSchema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({ success: false, message: 'Payload invalido.' });
          return;
        }

        const { uid, invitacionData } = await validateInvitationToken(parsed.data.token);

        await admin.auth().updateUser(uid, {
          password: parsed.data.password,
          disabled: false,
        });

        const authUser = await admin.auth().getUser(uid);
        const newClaims = { ...(authUser.customClaims || {}), isActive: true };
        await admin.auth().setCustomUserClaims(uid, newClaims);

        const batch = db.batch();
        batch.update(db.collection('usuarios').doc(uid), {
          estaActivo: true,
          timestampActualizacion: FieldValue.serverTimestamp(),
        });
        batch.delete(db.collection('invitaciones').doc(uid));
        await batch.commit();

        await logAction(
          { uid, token: { email: invitacionData.email } },
          {
            action: 'INVITACION_ACEPTADA',
            targetId: uid,
            targetCollection: 'invitaciones',
            residenciaId: invitacionData.residenciaId,
            details: {},
          }
        );

        res.status(200).json({ success: true, message: 'Invitacion aceptada correctamente.' });
        return;
      }

      res.status(405).json({ success: false, message: 'Metodo no permitido.' });
    } catch (error: any) {
      const code = error?.code as string | undefined;
      if (code === 'not-found') {
        res.status(404).json({ success: false, message: error.message });
        return;
      }
      if (code === 'deadline-exceeded') {
        res.status(410).json({ success: false, message: error.message });
        return;
      }
      if (code === 'unauthenticated' || code === 'invalid-argument' || code === 'aborted') {
        res.status(400).json({ success: false, message: error.message });
        return;
      }

      functions.logger.error('Error en aceptarInvitacionHttp:', error);
      res.status(500).json({ success: false, message: 'Error interno procesando invitacion.' });
    }
  }
);

export const limpiarInvitacionesExpiradas = onSchedule(
  {
    // Ejecutar a las 04:41 UTC para mantener una ventana de bajo trafico transversal.
    schedule: '41 4 * * *',
    region: 'us-central1',
    timeZone: 'Etc/UTC',
  },
  async () => {
    const now = Timestamp.now();
    const expiredInvites = await db
      .collection('invitaciones')
      .where('expiresAt', '<', now)
      .limit(500)
      .get();

    for (const inviteDoc of expiredInvites.docs) {
      const uid = inviteDoc.id;
      const invitacionData = inviteDoc.data();

      try {
        await admin.auth().deleteUser(uid).catch((error: any) => {
          if (error?.code !== 'auth/user-not-found') {
            throw error;
          }
        });

        const batch = db.batch();
        batch.delete(db.collection('usuarios').doc(uid));
        batch.delete(db.collection('invitaciones').doc(uid));
        await batch.commit();

        await logAction(
          { uid: 'SYSTEM', token: { email: 'system@internal' } },
          {
            action: 'INVITACION_EXPIRADA_ELIMINADA',
            targetId: uid,
            targetCollection: 'invitaciones',
            residenciaId: invitacionData.residenciaId,
            details: {},
          }
        );
      } catch (error) {
        functions.logger.error('Error limpiando invitacion expirada', { uid, error });
      }
    }
  }
);


