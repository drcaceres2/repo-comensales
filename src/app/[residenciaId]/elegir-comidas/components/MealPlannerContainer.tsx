/**
 * @file MealPlannerContainer.tsx
 * @description The "brain" component for the meal planner.
 * It orchestrates data fetching, state management, and user interactions for a single user.
 * It is designed to be re-mounted when the user changes via a `key` prop in its parent.
 */
'use client';

import { useState, useEffect } from 'react';
import { useMealPlanningData, MealPlanningData } from '../hooks/useMealPlanningData';
import { buildMealGrid, GridMatrix } from '../utils/gridBuilder';
import { ResidenciaId, UserId } from '../../../../../shared/models/types';
import { debounce } from 'lodash';

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
        weekDays: getWeekDays(weekDate), // Helper needed
        residencia: { id: residenciaId } as any, // Pass necessary parts of residencia
        ...serverData,
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

    const newStatus = currentCell.status === 'selected' ? 'unselected' : 'selected';

    // Optimistic UI Update
    const newGrid = {
      ...displayGrid,
      [day]: {
        ...displayGrid[day],
        [mealGroup]: {
          ...currentCell,
          status: newStatus,
          source: 'manual', // The user's choice is now the source of truth
          isConflicting: false,
        },
      },
    };
    setDisplayGrid(newGrid);
    
    // Debounce the save operation
    saveEleccion(day, currentCell.tiempoComidaId, newStatus);
  };
  
  // TODO: Implement debouncing with lodash or a custom hook
  const saveEleccion = (day: string, tiempoComidaId: string | null, newStatus: 'selected' | 'unselected') => {
    if (!tiempoComidaId) return;
    console.log(`Debounced save: User ${userId}, Day ${day}, TC ${tiempoComidaId}, Status ${newStatus}`);
    // --- Firestore Logic Here ---
    // 1. Create Composite ID: `${userId}_${day}_${tiempoComidaId}`
    // 2. If newStatus is 'unselected', perform a `deleteDoc`.
    // 3. If newStatus is 'selected', perform a `setDoc` with the Eleccion payload.
    // 4. Implement rollback by calling `buildMealGrid` again on error and show toast.
  };

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
