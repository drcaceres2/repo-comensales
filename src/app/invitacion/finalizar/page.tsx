'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface PreloadResponse {
  success: boolean;
  maskedEmail?: string;
  expiresAt?: string | null;
  message?: string;
}

interface FinalizeResponse {
  success: boolean;
  message?: string;
}

function getAceptarInvitacionEndpoint(): string {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const emulatorHost = process.env.NEXT_PUBLIC_FUNCTIONS_EMULATOR_HOST;

  if (!projectId) {
    return '';
  }

  if (emulatorHost) {
    const clean = emulatorHost.replace(/^https?:\/\//, '');
    const protocol = emulatorHost.startsWith('https://') ? 'https' : 'http';
    return `${protocol}://${clean}/${projectId}/us-central1/aceptarInvitacionHttp`;
  }

  return `https://us-central1-${projectId}.cloudfunctions.net/aceptarInvitacionHttp`;
}

export default function FinalizarInvitacionPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const endpoint = useMemo(() => getAceptarInvitacionEndpoint(), []);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isValid, setIsValid] = useState(false);
  const [maskedEmail, setMaskedEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    let cancelled = false;

    const preload = async () => {
      if (!token || !endpoint) {
        setError('No se encontro un token de invitacion valido.');
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`${endpoint}?token=${encodeURIComponent(token)}`, {
          method: 'GET',
        });
        const data = (await response.json()) as PreloadResponse;

        if (cancelled) {
          return;
        }

        if (!response.ok || !data.success) {
          setError(data.message || 'No se pudo validar la invitacion.');
          setIsValid(false);
          setLoading(false);
          return;
        }

        setMaskedEmail(data.maskedEmail || 'correo-no-disponible');
        setIsValid(true);
        setLoading(false);
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || 'Error de red al validar invitacion.');
          setLoading(false);
        }
      }
    };

    preload();
    return () => {
      cancelled = true;
    };
  }, [token, endpoint]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token, password }),
      });

      const data = (await response.json()) as FinalizeResponse;
      if (!response.ok || !data.success) {
        throw new Error(data.message || 'No se pudo completar la invitacion.');
      }

      setSuccess(data.message || 'Invitacion aceptada. Ya puedes iniciar sesion.');
      setIsValid(false);
    } catch (err: any) {
      setError(err?.message || 'Error al completar el proceso.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container mx-auto max-w-lg py-10">
      <Card>
        <CardHeader>
          <CardTitle>Finalizar invitacion</CardTitle>
          <CardDescription>
            Crea tu contrasena para activar tu acceso.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? <p>Validando invitacion...</p> : null}

          {!loading && error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : null}

          {success ? <p className="text-sm text-green-600">{success}</p> : null}

          {!loading && isValid ? (
            <form className="space-y-4" onSubmit={handleSubmit}>
              <p className="text-sm text-muted-foreground">
                Correo invitado: <strong>{maskedEmail}</strong>
              </p>

              <div>
                <Label htmlFor="password">Nueva contrasena</Label>
                <Input
                  id="password"
                  type="password"
                  minLength={6}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </div>

              <Button type="submit" disabled={submitting}>
                {submitting ? 'Guardando...' : 'Completar registro'}
              </Button>
            </form>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}


