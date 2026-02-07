import { useState, useMemo } from 'react';
import { startOfWeek, eachDayOfInterval, format, endOfWeek } from 'date-fns';
import { useResidenciaConfig } from './useResidenciaConfig'; // Paso 1
import { buildSemanarioGrid } from '../utils/gridBuilder';   // Paso 2
import { 
  UserProfile, 
  Residencia, 
  SemanarioDesnormalizado,
  Semanario,
  Ausencia,
  InscripcionActividad,
  PermisosComidaPorGrupo,
  Actividad,
  TiempoComidaMod,
  AlternativaTiempoComidaMod 
} from '../../../../../shared/models/types';
// ... imports de Firebase y tipos

export function useComidasData(
  residencia: Residencia, 
  residenciaId: string, 
  selectedUser: UserProfile | null
) {
  // A. Estado de Fecha (Controlado localmente, no por fetch)
  const [currentDate, setCurrentDate] = useState(new Date());
  const [error, setError] = useState<Error | null>(null);
  
  const startOfWeekDate = useMemo(() => 
    startOfWeek(currentDate, { weekStartsOn: 1 /* Lunes */ }), 
  [currentDate]);

  // B. Traer Configuración (Paso 1)
  const { config, loading: configLoading } = useResidenciaConfig(residenciaId);

  // C. Traer Datos Dinámicos (Podrías hacer un hook useWeeklyData similar al de config)
  // Por ahora, supongamos que usas useCollectionSubscription aquí directamente 
  // para elecciones, ausencias, actividades filtradas por fecha.
  // ... (Queries de elecciones, ausencias usando startOfWeekDate)
  
  // D. MAGIA: Construir la UI con useMemo
  // Esto reemplaza al useEffect gigante. Se recalcula SOLO si cambian los datos.
  const semanarioUI = useMemo(() => {
    if (configLoading || !selectedUser) return null;

    // TODO: This date range calculation should be moved from the old hook and implemented here.
    // For now, just using the current week.
    const affectedPeriodDays = eachDayOfInterval({
      start: startOfWeekDate,
      end: endOfWeek(currentDate, { weekStartsOn: 1 }),
    }).map(date => format(date, 'yyyy-MM-dd'));

    return buildSemanarioGrid({
      residencia,
      affectedPeriodDays,
      config,
      userData: {
        userProfile: selectedUser,
        userSemanarioData: null, // Pasa aquí los datos de las queries del paso C
        ausencias: [],  // Pasa aquí los datos de las queries del paso C
        inscripciones: [],
        permissions: null
      },
      globalData: {
        actividades: [],
        tiemposComidaMod: [],
        alternativasMod: []
      }
    });
  }, [
    residencia, 
    startOfWeekDate, 
    config, 
    selectedUser, 
    configLoading
    // ... dependencias de datos dinámicos
  ]);

  return {
    semanarioUI,
    currentDate,
    setCurrentDate, // Para que la UI pueda cambiar de semana
    loading: configLoading // || dataLoading
  };
}
