'use server';

export async function submitFeedback(formData: FormData) {
  const text = formData.get('text')?.toString() || '';
  if (!text.trim()) throw new Error('El feedback no puede estar vacío.');

  const payload = {
    text,
    page: formData.get('page')?.toString() || undefined,
    userAgent: formData.get('userAgent')?.toString() || undefined,
    screenResolution: formData.get('screenResolution')?.toString() || undefined,
    viewportSize: formData.get('viewportSize')?.toString() || undefined,
    userId: formData.get('userId')?.toString() || undefined,
    userEmail: formData.get('userEmail')?.toString() || undefined,
    residenciaId: formData.get('residenciaId')?.toString() || undefined,
    status: 'nuevo',
  };

  const res = await fetch('/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error || `Error en servidor: ${res.status}`);
  }

  return res.json();
}
