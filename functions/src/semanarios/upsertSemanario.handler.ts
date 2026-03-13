import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https';
import * as functions from 'firebase-functions/v2';
import { getCallerSecurityInfo } from '../common/security';
import { logAction } from '../common/logging';
import { UpsertSemanarioPayload, UpsertSemanarioPayloadSchema } from '../../../shared/schemas/semanarios/semanario.dto';
import { upsertSemanarioService } from './semanario.service';

export const upsertSemanario = onCall(
  {
    region: 'us-central1',
    cors: ['http://localhost:3001', 'http://127.0.0.1:3001'],
    timeoutSeconds: 300,
  },
  async (request: CallableRequest<UpsertSemanarioPayload>) => {
    const callerInfo = await getCallerSecurityInfo(request.auth);
    const callerProfile = callerInfo.profile;

    if (!callerProfile || !callerProfile.id || !callerProfile.residenciaId) {
      throw new HttpsError('permission-denied', 'No se pudo resolver el perfil del usuario autenticado.');
    }

    const parsed = UpsertSemanarioPayloadSchema.safeParse(request.data);
    if (!parsed.success) {
      const zodErrors = parsed.error.flatten();
      const errorMessages = Object.entries(zodErrors.fieldErrors)
        .map(([field, messages]) => `${field}: ${messages?.join(', ') ?? 'Invalid'}`)
        .join('; ');

      functions.logger.warn('Validation failed for upsertSemanario:', errorMessages);
      throw new HttpsError('invalid-argument', 'Payload invalido para semanario.', {
        validationError: true,
        message: errorMessages,
      });
    }

    try {
      const result = await upsertSemanarioService({
        callerUid: callerInfo.uid,
        callerProfile,
        payload: parsed.data,
      });

      await logAction(request.auth, {
        action: 'SEMANARIO_ACTUALIZADO',
        targetId: parsed.data.usuarioId,
        targetCollection: 'usuarios',
        residenciaId: callerProfile.residenciaId,
        details: {
          semanaIsoEfectivaSolicitada: parsed.data.semanaIsoEfectiva,
          semanaIsoAplicada: result.semanaIsoAplicada,
        },
      });

      return {
        success: true,
        semanaIsoAplicada: result.semanaIsoAplicada,
        updatedAt: result.updatedAt,
        message: 'Semanario guardado correctamente.',
      };
    } catch (error: any) {
      if (error instanceof HttpsError) {
        throw error;
      }

      functions.logger.error('Error inesperado en upsertSemanario', error);
      throw new HttpsError('internal', `No se pudo guardar el semanario: ${error?.message ?? 'Error desconocido'}`);
    }
  }
);
