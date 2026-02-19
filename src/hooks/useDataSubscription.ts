import { z } from 'zod';
import { useEffect, useState, useMemo } from 'react';
import { onSnapshot, Query, DocumentReference } from 'firebase/firestore';

interface SubscriptionResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

// Para colecciones (retorna array)
export function useCollectionSubscription<T>(queryRef: Query | null): SubscriptionResult<T[]> {
  const [data, setData] = useState<T[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!queryRef) {
      setLoading(false);
      return;
    }
    
    setLoading(true);
    const unsubscribe = onSnapshot(queryRef, 
      (snapshot) => {
        const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as T));
        setData(items);
        setLoading(false);
      },
      (err) => {
        console.error("Error en suscripción de colección:", err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [queryRef]); // Se re-ejecuta solo si la query cambia

  return { data, loading, error };
}

// Para documentos individuales (retorna objeto único)
export function useDocumentSubscription<T>(docRef: DocumentReference | null): SubscriptionResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!docRef) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = onSnapshot(docRef, 
      (snapshot) => {
        if (snapshot.exists()) {
          setData({ id: snapshot.id, ...snapshot.data() } as T);
        } else {
          setData(null);
        }
        setLoading(false);
      },
      (err) => {
        console.error("Error en suscripción de documento:", err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [docRef]);

  return { data, loading, error };
}

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
