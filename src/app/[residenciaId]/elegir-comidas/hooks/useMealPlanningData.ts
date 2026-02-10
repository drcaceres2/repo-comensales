/**
 * @file useMealPlanningData.ts
 * @description Custom hook to fetch all data required for the meal planning grid.
 * It follows the parallel fetching pattern outlined in the Architecture Definition Document.
 */
import { useState, useEffect } from 'react';
import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  doc,
} from 'firebase/firestore';
import { startOfWeek, endOfWeek, subDays, addDays, format } from 'date-fns';
import { z } from 'zod';
import { db } from '@/lib/firebase';
import {
  ResidenciaId,
  UserId,
} from '@/../../shared/models/types';
import { TiempoComidaSchema } from '@/../../shared/schemas/tiempoComida';
import { AusenciaSchema } from '@/../../shared/schemas/ausencias';
import { InscripcionActividadSchema, ActividadSchema } from '@/../../shared/schemas/actividades';
import { ExcepcionSchema } from '@/../../shared/schemas/excepciones';
import { SemanarioSchema } from '@/../../shared/schemas/semanario';

// Infer types from Zod schemas
type TiempoComida = z.infer<typeof TiempoComidaSchema>;
type Ausencia = z.infer<typeof AusenciaSchema>;
type InscripcionActividad = z.infer<typeof InscripcionActividadSchema>;
type Actividad = z.infer<typeof ActividadSchema>;
type Excepcion = z.infer<typeof ExcepcionSchema>;
type Semanario = z.infer<typeof SemanarioSchema>;


/**
 * The shape of the data returned by the hook.
 */
export interface MealPlanningData {
  tiemposComida: TiempoComida[];
  semanario: Semanario | null;
  ausencias: Ausencia[];
  inscripciones: InscripcionActividad[];
  actividades: Actividad[];
  excepciones: Excepcion[];
}

interface UseMealPlanningDataParams {
  userId: UserId | null;
  residenciaId: ResidenciaId;
  weekDate: Date;
}

/**
 * Custom hook to fetch all data required for the meal planning component.
 * It centralizes data fetching, handles loading and error states, and returns
 * all necessary data collections for a specific user and week.
 *
 * @param params - The user ID, residence ID, and the reference date for the week.
 * @returns An object containing the fetched data, loading state, and any error.
 */
export const useMealPlanningData = ({
  userId,
  residenciaId,
  weekDate,
}: UseMealPlanningDataParams) => {
  const [data, setData] = useState<MealPlanningData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!userId || !residenciaId) {
      setIsLoading(false);
      return;
    }

    const fetchData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const weekStartsOn = 1; // Monday
        const start = startOfWeek(weekDate, { weekStartsOn });
        const end = endOfWeek(weekDate, { weekStartsOn });
        const startDateString = format(subDays(start, 1), 'yyyy-MM-dd');
        const endDateString = format(addDays(end, 1), 'yyyy-MM-dd');

        const [
          tiemposComidaSnap,
          semanarioSnap,
          ausenciasSnap,
          inscripcionesSnap,
          excepcionesSnap,
        ] = await Promise.all([
          getDocs(collection(db, 'residencias', residenciaId, 'tiemposComida')),
          getDoc(doc(db, 'residencias', residenciaId, 'semanarios', userId)),
          getDocs(query(collection(db, 'residencias', residenciaId, 'ausencias'), where('userId', '==', userId))),
          getDocs(query(collection(db, 'residencias', residenciaId, 'inscripciones'), where('userId', '==', userId))),
          getDocs(query(collection(db, 'residencias', residenciaId, 'excepciones'), 
            where('usuarioId', '==', userId), 
            where('fecha', '>=', startDateString), 
            where('fecha', '<=', endDateString)
          )),
        ]);

        const parseResult = <T>(schema: z.ZodSchema<T>, data: any) => {
          const result = schema.safeParse(data);
          if (!result.success) {
            console.error(`Validation error for ${schema.description}:`, result.error.issues);
            throw new Error(`Failed to validate ${schema.description}`);
          }
          return result.data;
        };

        const parseArrayResult = <T>(schema: z.ZodSchema<T>, docs: { id: string, [key: string]: any }[]) => {
            return parseResult(z.array(schema), docs);
        };

        const tiemposComida = parseArrayResult(TiempoComidaSchema, tiemposComidaSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        const ausencias = parseArrayResult(AusenciaSchema, ausenciasSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        const inscripciones = parseArrayResult(InscripcionActividadSchema, inscripcionesSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        const excepciones = parseArrayResult(ExcepcionSchema, excepcionesSnap.docs.map(d => ({ id: d.id, ...d.data() })));

        const semanario = semanarioSnap.exists() ? parseResult(SemanarioSchema, {id: semanarioSnap.id, ...semanarioSnap.data()}) : null;

        let actividades: Actividad[] = [];
        const actividadIds = [...new Set(inscripciones.map(i => i.actividadId))];

        if (actividadIds.length > 0) {
          const actividadPromises = actividadIds.map(id => 
            getDoc(doc(db, 'residencias', residenciaId, 'actividades', id))
          );
          const actividadSnaps = await Promise.all(actividadPromises);
          const actividadData = actividadSnaps
            .filter(snap => snap.exists())
            .map(snap => ({ id: snap.id, ...snap.data() }));

          actividades = parseArrayResult(ActividadSchema, actividadData);
        }

        setData({
          tiemposComida,
          semanario,
          ausencias,
          inscripciones,
          actividades,
          excepciones,
        });

      } catch (e: any) {
        console.error("Error fetching meal planning data:", e);
        setError(e);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [userId, residenciaId, weekDate]);

  return { data, isLoading, error };
};
