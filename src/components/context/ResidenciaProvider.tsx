'use client';
import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { db } from '@/lib/firebase';
import { doc, getDoc } from "firebase/firestore";
import { Residencia as ResidenciaDoc } from '../../../shared/schemas/residencia'
import { ResidenciaId } from '../../../shared/models/types'

const ResidenciaContext = createContext<{
  residencia: ResidenciaDoc | null,
  loading: boolean
}>({ residencia: null, loading: true });

export const useResidencia = () => {
  const context = useContext(ResidenciaContext);
  if (context === undefined) {
    throw new Error('useResidencia must be used within a ResidenciaProvider');
  }
  return context;
};

export function ResidenciaProvider({ children, residenciaId }: { children: ReactNode, residenciaId?: ResidenciaId }) {
  const [residencia, setResidencia] = useState<ResidenciaDoc | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!residenciaId) {
      setResidencia(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const docRef = doc(db, "residencias", residenciaId);
    getDoc(docRef).then(snap => {
      if (snap.exists()) {
        setResidencia(snap.data() as ResidenciaDoc);
      } else {
        setResidencia(null);
        console.error(`Residencia with id ${residenciaId} not found.`);
      }
      setLoading(false);
    }).catch(error => {
        console.error("Error fetching residencia:", error);
        setResidencia(null);
        setLoading(false);
    });
  }, [residenciaId]);

  return (
      <ResidenciaContext.Provider value={{ residencia, loading }}>
        {children}
      </ResidenciaContext.Provider>
  );
}