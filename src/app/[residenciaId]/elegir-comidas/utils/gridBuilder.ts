/**
 * @file gridBuilder.ts
 * @description Pure function to build the state matrix for the meal selection grid.
 * This file implements the layered composition logic described in the Architecture Definition Document.
 */
import {
  Residencia,
  Semanario,
  TiempoComida,
  Ausencia,
  InscripcionActividad,
  Actividad,
  Eleccion, // Assuming this type exists in types.ts
} from '../../../../../shared/models/types';
import { format, parseISO, isSameDay } from 'date-fns';
import { formatToDayOfWeekKey, estaDentroFechas } from '@/lib/fechasResidencia';

// --- TYPE DEFINITIONS ---

/**
 * Represents the state and metadata of a single cell in the meal grid.
 */
export interface CellData {
  /** The effective state of the cell (e.g., selected, blocked). */
  status: 'selected' | 'unselected' | 'blocked' | 'non-existent';
  /** The layer of logic that determined the final status. */
  source: 'weekly' | 'manual' | 'activity' | 'absence' | 'structure';
  /** A descriptive reason, especially for 'blocked' status (e.g., 'Ausencia', 'Actividad: Salida cultural'). */
  reason?: string;
  /** The unique identifier of the corresponding TiempoComida configuration. */
  tiempoComidaId: string | null;
  /** True if a user's manual choice is overridden by a higher-priority layer (e.g., an absence). */
  isConflicting: boolean;
}

/**
 * The complete data structure for the grid, mapping days and meal groups to cell states.
 * @example
 * {
 *   "2026-02-09": { "Desayuno": { status: 'selected', source: 'weekly', ... }, "Almuerzo": { ... } },
 *   "2026-02-10": { ... }
 * }
 */
export interface GridMatrix {
  [day: string]: { // Format: "YYYY-MM-DD"
    [mealGroup: string]: CellData;
  };
}

/**
 * Input parameters for the grid builder function.
 */
interface BuildGridParams {
  weekDays: Date[];
  residencia: Residencia;
  tiemposComida: TiempoComida[];
  semanario: Semanario | null;
  ausencias: Ausencia[];
  actividades: Actividad[];
  inscripciones: InscripcionActividad[];
  elecciones: Eleccion[];
}

// --- CORE FUNCTION ---

/**
 * Constructs the meal planning grid based on a strict set of layered rules.
 * This is a pure function where the output is solely dependent on its inputs.
 *
 * @param params - An object containing all necessary data collections for the given week and user.
 * @returns A GridMatrix object representing the final state of the UI.
 */
export function buildMealGrid(params: BuildGridParams): GridMatrix {
  const {
    weekDays,
    residencia,
    tiemposComida,
    semanario,
    ausencias,
    actividades,
    inscripciones,
    elecciones,
  } = params;

  const grid: GridMatrix = {};
  const mealGroups = [...new Set(tiemposComida.map(tc => tc.nombreGrupo))];

  for (const day of weekDays) {
    const dayStr = format(day, 'yyyy-MM-dd');
    const dayOfWeekKey = formatToDayOfWeekKey(day);
    grid[dayStr] = {};

    for (const group of mealGroups) {
      // --- Layer 0: Structure ---
      // Determine if a meal is even offered at this time.
      const tiempoComidaConfig = tiemposComida.find(
        tc => tc.dia === dayOfWeekKey && tc.nombreGrupo === group
      );

      if (!tiempoComidaConfig) {
        grid[dayStr][group] = {
          status: 'non-existent',
          source: 'structure',
          tiempoComidaId: null,
          isConflicting: false,
        };
        continue;
      }

      let cell: CellData = {
        status: 'unselected',
        source: 'structure',
        tiempoComidaId: tiempoComidaConfig.id,
        isConflicting: false,
      };

      // --- Layer 1: Preference (Semanario) ---
      // Apply the user's base weekly preference.
      const semanarioHasEleccion = semanario?.elecciones[tiempoComidaConfig.id];
      if (semanarioHasEleccion) {
        cell.status = 'selected';
        cell.source = 'weekly';
      }

      // --- Layer 2: Exclusion (Ausencias) ---
      // Absences block the cell, overriding weekly preferences.
      const ausenciaDelDia = ausencias.find(a =>
        estaDentroFechas(dayStr, a.fechaInicio, a.fechaFin, residencia.zonaHoraria)
      );
      if (ausenciaDelDia) {
        cell.status = 'blocked';
        cell.source = 'absence';
        cell.reason = ausenciaDelDia.motivo || 'Ausencia';
      }

      // --- Layer 3: Imposition (Actividades) ---
      // Mandatory activities block the cell, overriding absences and weekly preferences.
      const inscripcionDelDia = inscripciones.find(i => {
        const actividad = actividades.find(a => a.id === i.actividadId);
        // This logic assumes an activity on a given day blocks all meals.
        // A more granular check against meal times might be needed if activities are shorter.
        return actividad && isSameDay(parseISO(actividad.fechaInicio), day);
      });

      if (inscripcionDelDia) {
        const actividad = actividades.find(a => a.id === inscripcionDelDia.actividadId);
        cell.status = 'blocked';
        cell.source = 'activity';
        cell.reason = `Actividad: ${actividad?.nombre || 'ver detalles'}`;
      }
      
      // --- Layer 4: Volition (Elecciones) ---
      // A user's specific choice for a day.
      const eleccionDelDia = elecciones.find(
        e => e.fecha === dayStr && e.tiempoComidaId === tiempoComidaConfig.id
      );

      if (eleccionDelDia) {
        const isBlocked = cell.status === 'blocked';
        // If the cell is blocked, the manual choice is a conflict.
        cell.isConflicting = isBlocked;

        if (!isBlocked) {
          // If not blocked, the manual choice wins over the weekly preference.
          cell.status = eleccionDelDia.selected ? 'selected' : 'unselected';
          cell.source = 'manual';
        }
      }
      
      grid[dayStr][group] = cell;
    }
  }

  return grid;
}