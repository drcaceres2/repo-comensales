import { useEffect, useState } from 'react';
import {
  DocumentReference,
  Query,
  onSnapshot,
  DocumentData,
  FirestoreError,
  DocumentSnapshot,
  QuerySnapshot
} from 'firebase/firestore';

interface FirestoreHookResult<T> {
  data: T | undefined;
  loading: boolean;
  error: FirestoreError | undefined;
}

interface CollectionHookResult<T> extends FirestoreHookResult<T[]> {
  snapshot: QuerySnapshot<T> | undefined;
}

interface DocumentHookResult<T> extends FirestoreHookResult<T> {
  snapshot: DocumentSnapshot<T> | undefined;
}

/**
 * Hook to subscribe to a single Firestore document.
 * @param docRef - The DocumentReference to listen to. If null/undefined, listener is skipped.
 */
export function useDocumentData<T = DocumentData>(
  docRef: DocumentReference<T> | null | undefined
): DocumentHookResult<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [snapshot, setSnapshot] = useState<DocumentSnapshot<T> | undefined>(undefined);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<FirestoreError | undefined>(undefined);

  useEffect(() => {
    if (!docRef) {
      setData(undefined);
      setSnapshot(undefined);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(undefined);

    const unsubscribe = onSnapshot(
      docRef,
      (snap) => {
        setSnapshot(snap);
        setData(snap.data());
        setLoading(false);
      },
      (err) => {
        console.error("useDocumentData Error:", err);
        setError(err);
        setLoading(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [docRef]); // Ensure docRef is memoized in parent or stable

  return { data, loading, error, snapshot };
}

/**
 * Hook to subscribe to a Firestore query or collection.
 * @param queryRef - The Query or CollectionReference to listen to. If null/undefined, listener is skipped.
 */
export function useCollectionData<T = DocumentData>(
  queryRef: Query<T> | null | undefined
): CollectionHookResult<T> {
  const [data, setData] = useState<T[] | undefined>(undefined);
  const [snapshot, setSnapshot] = useState<QuerySnapshot<T> | undefined>(undefined);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<FirestoreError | undefined>(undefined);

  useEffect(() => {
    if (!queryRef) {
      setData(undefined);
      setSnapshot(undefined);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(undefined);

    const unsubscribe = onSnapshot(
      queryRef,
      (snap) => {
        setSnapshot(snap);
        const docsData = snap.docs.map((doc) => doc.data());
        setData(docsData);
        setLoading(false);
      },
      (err) => {
        console.error("useCollectionData Error:", err);
        setError(err);
        setLoading(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [queryRef]); // Ensure queryRef is memoized in parent or stable

  return { data, loading, error, snapshot };
}
