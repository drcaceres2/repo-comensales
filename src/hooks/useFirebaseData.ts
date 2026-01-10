import { useState, useEffect } from 'react';
import { DocumentData, Query, onSnapshot, QuerySnapshot, DocumentReference, DocumentSnapshot } from 'firebase/firestore';

interface Subscription<T> {
  loading: boolean;
  error: Error | null;
  value: T | null;
}

export function useCollectionSubscription<T>(query: Query | null): Subscription<T[]> {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [value, setValue] = useState<T[] | null>(null);

  useEffect(() => {
    if (!query) {
      setValue(null);
      setLoading(false);
      return;
    }

    const unsubscribe = onSnapshot(query, 
      (snapshot: QuerySnapshot<DocumentData>) => {
        const data: T[] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as unknown as T));
        setValue(data);
        setLoading(false);
      },
      (err) => {
        setError(err);
        setLoading(false);
      }
    );

    // Cleanup function
    return () => {
      unsubscribe();
    };
  }, [query]);

  return { loading, error, value };
}

export function useDocumentSubscription<T>(ref: DocumentReference<DocumentData> | null): Subscription<T> {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [value, setValue] = useState<T | null>(null);

  useEffect(() => {
    if (!ref) {
      setValue(null);
      setLoading(false);
      return;
    }

    const unsubscribe = onSnapshot(ref,
      (snapshot: DocumentSnapshot<DocumentData>) => {
        if (snapshot.exists()) {
          const data = { id: snapshot.id, ...snapshot.data() } as unknown as T;
          setValue(data);
        } else {
          setValue(null);
        }
        setLoading(false);
      },
      (err) => {
        setError(err);
        setLoading(false);
      }
    );

    // Cleanup function
    return () => {
      unsubscribe();
    };
  }, [ref]);

  return { loading, error, value };
}
