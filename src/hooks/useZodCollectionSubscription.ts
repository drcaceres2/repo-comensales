import { useCollectionSubscription } from './useDataSubscription';
import { z } from 'zod';
import { useMemo } from 'react';
import { Query } from 'firebase/firestore';

export function useZodCollectionSubscription<T>(
  schema: z.ZodSchema<T>,
  queryRef: Query | null
) {
  const { data, loading, error } = useCollectionSubscription<any>(queryRef); // Get raw data

  const parsedData = useMemo(() => {
    if (!data) return null;
    const result = schema.array().safeParse(data);
    if (!result.success) {
      console.error("Zod validation error in useZodCollectionSubscription:", result.error);
      // Decide how to handle the error. For now, return null and log.
      return null;
    }
    return result.data;
  }, [data, schema]);

  return { data: parsedData, loading, error };
}
