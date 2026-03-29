import { Resend } from 'resend';

interface EnviarCorreoSolicitudConsolidadaInput {
  to: string;
  residenciaId: string;
  solicitudId: string;
  pdfBuffer: Buffer;
  pdfDownloadUrl: string;
}

const FROM_EMAIL = 'notificaciones@comensales.app';

export async function enviarCorreoSolicitudConsolidada(input: EnviarCorreoSolicitudConsolidadaInput): Promise<void> {
  const { to, residenciaId, solicitudId, pdfBuffer, pdfDownloadUrl } = input;

  const recipient = String(to || '').trim().toLowerCase();
  if (!recipient) {
    throw new Error('No se puede enviar el correo sin destinatario principal.');
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    if (process.env.NODE_ENV !== 'production') {
      // En desarrollo no bloqueamos el flujo para facilitar pruebas del worker.
      console.log('[SOLICITUD_CONSOLIDADA][DEV] Correo omitido por falta de RESEND_API_KEY.', {
        to: recipient,
        solicitudId,
      });
      return;
    }
    throw new Error('Missing RESEND_API_KEY for production email delivery.');
  }

  const resend = new Resend(apiKey);

  await resend.emails.send({
    from: FROM_EMAIL,
    to: [recipient],
    cc: [FROM_EMAIL],
    subject: `Solicitud consolidada ${solicitudId} - ${residenciaId}`,
    html: [
      '<p>Hola,</p>',
      '<p>La solicitud consolidada fue sellada y se adjunta el reporte formal en PDF.</p>',
      `<p><strong>Residencia:</strong> ${residenciaId}</p>`,
      `<p><strong>Solicitud:</strong> ${solicitudId}</p>`,
      `<p>También puedes acceder al archivo con este enlace temporal: <a href="${pdfDownloadUrl}">Abrir PDF</a></p>`,
      '<p>Equipo Comensales</p>',
    ].join(''),
    attachments: [
      {
        filename: `solicitud-consolidada-${solicitudId}.pdf`,
        content: pdfBuffer.toString('base64'),
      },
    ],
  });
}

