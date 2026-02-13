'use server';

import { db, admin } from '@/lib/firebaseAdmin';

export async function submitFeedback(prevState: any, formData: FormData) {
  try {
    const text = formData.get('text')?.toString() || '';
    if (!text.trim()) {
      return { error: 'El feedback no puede estar vacío.' };
    }

    const payload = {
      text,
      page: formData.get('page')?.toString() || null,
      userAgent: formData.get('userAgent')?.toString() || null,
      screenResolution: formData.get('screenResolution')?.toString() || null,
      viewportSize: formData.get('viewportSize')?.toString() || null,
      userId: formData.get('userId')?.toString() || null,
      userEmail: formData.get('userEmail')?.toString() || null,
      residenciaId: formData.get('residenciaId')?.toString() || null,
      status: 'nuevo',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await db.collection('feedback').add(payload);

    return { message: 'Tu feedback ha sido enviado correctamente. ¡Gracias!' };
  } catch (err) {
    console.error('Error submitting feedback action:', err);
    return { error: err instanceof Error ? err.message : 'Error desconocido al enviar el feedback.' };
  }
}
