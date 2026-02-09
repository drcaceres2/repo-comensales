import { useMemo } from 'react';
import { collection, query, where, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useZodCollectionSubscription } from '@/hooks/useZodCollectionSubscription';
import { TiempoComidaSchema } from '../../../../../shared/schemas/tiempoComida';
import { AlternativaTiempoComidaSchema } from '../../../../../shared/schemas/alternativasTiempoComida';
import { HorarioSolicitudComidaSchema } from '../../../../../shared/schemas/horariosSolicitudComida';

export function useResidenciaConfig(residenciaId: string) {
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

  const { data: tiemposComida, loading: l1, error: e1 } = useZodCollectionSubscription(TiempoComidaSchema, tiemposQuery);
  const { data: alternativas, loading: l2, error: e2 } = useZodCollectionSubscription(AlternativaTiempoComidaSchema, alternativasQuery);
  const { data: horariosSolicitud, loading: l3, error: e3 } = useZodCollectionSubscription(HorarioSolicitudComidaSchema, horariosQuery);

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