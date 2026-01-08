import { db } from '@/lib/firebase';
import { doc, getDoc, DocumentData } from 'firebase/firestore';

/**
 * Retrieves the status/data of a Residencia by its ID.
 * @param residenciaId - The ID of the Residencia.
 * @returns Promise<DocumentData | undefined>
 */
export async function getResidenciaStatus(residenciaId: string): Promise<DocumentData | undefined> {
  if (!residenciaId) {
    throw new Error("residenciaId is required");
  }

  try {
    const docRef = doc(db, 'residencias', residenciaId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      return docSnap.data();
    } else {
      console.warn(`Residencia with ID ${residenciaId} not found.`);
      return undefined;
    }
  } catch (error) {
    console.error(`Error fetching residencia status for ${residenciaId}:`, error);
    throw error;
  }
}
