/**
 * @file MealPlannerContainer.tsx
 * @description The "brain" component for the meal planner.
 * It orchestrates data fetching, state management, and user interactions for a single user.
 * It is designed to be re-mounted when the user changes via a `key` prop in its parent.
 */
'use client';

import { useState, useEffect } from 'react';
import { useMealPlanningData, MealPlanningData } from '../hooks/useMealPlanningData';
import { buildMealGrid, GridMatrix, CellData } from '../utils/gridBuilder';
import { ResidenciaId, UserId, Excepcion } from '@/../shared/models/types';
import { startOfWeek, addDays, format } from 'date-fns';
import { debounce } from 'lodash';
import { doc, setDoc, deleteDoc, collection } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// --- TODO: Create these dumb components ---
// import { WeeklyGrid } from './WeeklyGrid';
// import { ExceptionsPanel } from './ExceptionsPanel';
// import { StatsWidget } from './StatsWidget';
// import { MealPlannerSkeleton } from './MealPlannerSkeleton';

// --- Placeholder Components ---
const WeeklyGrid = ({ grid, onCellClick }: { grid: GridMatrix, onCellClick: (day: string, group: string) => void }) => (
  <div className="p-4 border rounded-lg bg-gray-50">
    <h2 className="text-lg font-bold mb-2">Weekly Grid (Dumb Component)</h2>
    <pre className="text-xs overflow-auto">{JSON.stringify(grid, null, 2)}</pre>
  </div>
);
const MealPlannerSkeleton = () => <div className="p-4 border rounded-lg bg-gray-50 animate-pulse">Loading Planner...</div>;
const ExceptionsPanel = () => null; // Placeholder
const StatsWidget = () => null; // Placeholder


interface MealPlannerContainerProps {
  userId: UserId;
  residenciaId: ResidenciaId;
}

export function MealPlannerContainer({ userId, residenciaId }: MealPlannerContainerProps) {
  const [weekDate, setWeekDate] = useState(new Date());
  
  // The local 'displayGrid' can be updated optimistically.
  const [displayGrid, setDisplayGrid] = useState<GridMatrix | null>(null);

  // The hook provides the source-of-truth data from the server.
  const { data: serverData, isLoading, error } = useMealPlanningData({ userId, residenciaId, weekDate });

  // When server data changes, rebuild the grid. This ensures our local state
  // is reset when the user or week changes.
  useEffect(() => {
    if (serverData) {
      const newGrid = buildMealGrid({
        weekDays: getWeekDays(weekDate),
        residenciaId: residenciaId,
        zonaHoraria: 'UTC', // TODO: Get from residencia data
        tiemposComida: serverData.tiemposComida,
        semanario: serverData.semanario,
        ausencias: serverData.ausencias,
        actividades: serverData.actividades,
        inscripciones: serverData.inscripciones,
        excepciones: serverData.excepciones,
      });
      setDisplayGrid(newGrid);
    }
  }, [serverData, weekDate, residenciaId]);

  const handleCellClick = (day: string, mealGroup: string) => {
    if (!displayGrid) return;

    const currentCell = displayGrid[day][mealGroup];
    if (currentCell.status === 'blocked' || currentCell.status === 'non-existent') {
      // Maybe show a toast explaining why it's blocked
      return;
    }

    const newStatus: 'selected' | 'unselected' = currentCell.status === 'selected' ? 'unselected' : 'selected';

    // Optimistic UI Update
    const newGrid: GridMatrix = {
      ...displayGrid,
      [day]: {
        ...displayGrid[day],
        [mealGroup]: {
          status: newStatus,
          source: 'manual' as const,
          tiempoComidaId: currentCell.tiempoComidaId,
          isConflicting: false,
        },
      },
    };
    setDisplayGrid(newGrid);
    
    // Debounce the save operation
    saveExcepcion(day, currentCell.tiempoComidaId, newStatus);
  };
  
  // Debounced save operation for exceptions
  const saveExcepcionImpl = async (day: string, tiempoComidaId: string | null, newStatus: 'selected' | 'unselected') => {
    if (!tiempoComidaId) return;
    
    try {
      const dateStr = format(addDays(startOfWeek(weekDate, { weekStartsOn: 1 }), parseInt(day)), 'yyyy-MM-dd');
      const excepcionDocId = `${userId}_${dateStr}_${tiempoComidaId}`;
      const excecionDocRef = doc(collection(db, 'residencias', residenciaId, 'excepciones'), excepcionDocId);

      if (newStatus === 'unselected') {
        // Delete the exception if deselected
        await deleteDoc(excecionDocRef);
        console.log(`Deleted exception: ${excepcionDocId}`);
      } else {
        // Create/update the exception if selected
        const excepcionData: Omit<Excepcion, 'id'> = {
          usuarioId: userId,
          residenciaId: residenciaId,
          fecha: dateStr,
          tiempoComidaId: tiempoComidaId,
          tipo: 'cambio_alternativa', // Default type - can be customized per alternative
          // alternativaTiempoComidaId will be set based on the actual selection
          motivo: undefined,
          autorizadoPor: undefined,
        };
        await setDoc(excecionDocRef, excepcionData);
        console.log(`Saved exception: ${excepcionDocId}`, excepcionData);
      }
    } catch (error) {
      console.error(`Error saving exception: ${error}`);
      // TODO: Show error toast and rollback UI
    }
  };

  // Create debounced version with 1 second delay
  const saveExcepcion = debounce(saveExcepcionImpl, 1000);

  if (error) {
    return <div className="text-red-500">Error: {error.message}</div>;
  }
  
  // Show skeleton on initial load, but keep stale data visible during re-fetches for better UX.
  if (isLoading && !displayGrid) {
    return <MealPlannerSkeleton />;
  }

  return (
    <div className={`transition-opacity duration-300 ${isLoading ? 'opacity-50' : 'opacity-100'}`}>
      {/* TODO: Add week navigation controls to update `weekDate` */}
      <StatsWidget />
      <ExceptionsPanel />
      {displayGrid && <WeeklyGrid grid={displayGrid} onCellClick={handleCellClick} />}
    </div>
  );
}


// --- Helper Functions ---
// TODO: Move to a date utility file
function getWeekDays(date: Date): Date[] {
    const start = startOfWeek(date, { weekStartsOn: 1 });
    return Array.from({ length: 7 }).map((_, i) => addDays(start, i));
}
