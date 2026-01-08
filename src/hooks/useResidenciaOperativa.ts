import { useEffect, useState } from 'react';
import { useAuth } from './useAuth';
import { getResidenciaStatus } from '@/services/firebase/residencia-service';

interface UseResidenciaOperativaResult {
  puedeOperar: boolean;
  motivoBloqueo: string | null;
  isLoading: boolean;
}

export function useResidenciaOperativa(residenciaId: string): UseResidenciaOperativaResult {
  const { user, claims, loading: authLoading } = useAuth();
  const [result, setResult] = useState<UseResidenciaOperativaResult>({
    puedeOperar: false,
    motivoBloqueo: null,
    isLoading: true,
  });

  useEffect(() => {
    let isMounted = true;

    const checkResidencia = async () => {
      // Si la autenticación aún está cargando, esperamos.
      if (authLoading) return;

      // Si no hay usuario, no puede operar.
      if (!user) {
        if (isMounted) {
          setResult({
            puedeOperar: false,
            motivoBloqueo: 'Usuario no autenticado.',
            isLoading: false,
          });
        }
        return;
      }

      // Verificación de administrador (acceso total).
      // Se comprueba claims.role === 'admin' como solicitado, 
      // y se añade robustez chequeando arrays de roles si existieran.
      const isAdmin = 
        claims?.role === 'admin' || 
        (Array.isArray(claims?.roles) && claims.roles.includes('admin')) ||
        (Array.isArray(claims?.roles) && claims.roles.includes('master'));

      if (isAdmin) {
        if (isMounted) {
          setResult({
            puedeOperar: true,
            motivoBloqueo: null,
            isLoading: false,
          });
        }
        return;
      }

      // Verificación de la residencia en Firestore.
      if (!residenciaId) {
        if (isMounted) {
          setResult({
            puedeOperar: false,
            motivoBloqueo: 'ID de residencia no válido.',
            isLoading: false,
          });
        }
        return;
      }

      try {
        // Consultamos el servicio (sin hooks aquí, solo promesa).
        const data = await getResidenciaStatus(residenciaId);

        if (!isMounted) return;

        if (!data) {
          setResult({
            puedeOperar: false,
            motivoBloqueo: 'Residencia no encontrada.',
            isLoading: false,
          });
          return;
        }

        // Verificamos propiedad 'isActive' (común) o 'status'.
        // Adaptamos según el modelo de datos probable (isActive suele ser boolean).
        const isActive = data.isActive === true || data.status === 'active';

        if (isActive) {
          setResult({
            puedeOperar: true,
            motivoBloqueo: null,
            isLoading: false,
          });
        } else {
          setResult({
            puedeOperar: false,
            motivoBloqueo: 'La residencia no está activa o la licencia ha expirado.',
            isLoading: false,
          });
        }

      } catch (error) {
        console.error("Error verificando residencia operativa:", error);
        if (isMounted) {
          setResult({
            puedeOperar: false,
            motivoBloqueo: 'Error de conexión al verificar el estado de la residencia.',
            isLoading: false,
          });
        }
      }
    };

    checkResidencia();

    return () => {
      isMounted = false;
    };
  }, [authLoading, user, claims, residenciaId]);

  return result;
}
