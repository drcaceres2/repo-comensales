import { useMemo } from 'react';
import { collection, query, where, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useCollectionSubscription } from '@/hooks/useDataSubscription'; // Tu nuevo hook
import { Residencia, TiempoComida, AlternativaTiempoComida, HorarioSolicitudComida } from '../../../../../shared/models/types'; // Ajusta la ruta a tus types

export function useResidenciaConfig(residenciaId: string) {
  // 1. Definir referencias (Memorizadas para evitar re-renders infinitos)
  const tiemposQuery = useMemo(() => 
    query(
      collection(db, 'residencias', residenciaId, 'tiemposComida'), 
      where('activa', '==', true),
      orderBy('ordenGrupo')
    ), 
  [residenciaId]);

  const alternativasQuery = useMemo(() => 
    query(
      collection(db, 'residencias', residenciaId, 'alternativasTiempoComida'),
      where('isActive', '==', true)
    ), 
  [residenciaId]);

  const horariosQuery = useMemo(() => 
    query(
      collection(db, 'residencias', residenciaId, 'horariosSolicitudComida'),
      where('isActive', '==', true)
    ), 
  [residenciaId]);

  // 2. Usar tus nuevos hooks de suscripción
  const { data: tiemposComida, loading: l1, error: e1 } = useCollectionSubscription<TiempoComida>(tiemposQuery);
  const { data: alternativas, loading: l2, error: e2 } = useCollectionSubscription<AlternativaTiempoComida>(alternativasQuery);
  const { data: horariosSolicitud, loading: l3, error: e3 } = useCollectionSubscription<HorarioSolicitudComida>(horariosQuery);

  return {
    config: {
      tiemposComida: tiemposComida || [],
      alternativas: alternativas || [],
      horariosSolicitud: horariosSolicitud || []
    },
    loading: l1 || l2 || l3,
    error: e1 || e2 || e3
  };
}