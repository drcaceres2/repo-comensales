import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { Timestamp, collection, addDoc, serverTimestamp, FieldValue } from 'firebase/firestore';
import { db } from './firebase';
import { LogActionType, ClientLogWrite, UserId, ResidenciaId } from '@/../../shared/models/types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const formatTimestampForInput = (timestampValue: number | string | Date | Timestamp | null | undefined): string => {
    if (!timestampValue) return '';
    try {
        let date: Date;
        if (typeof timestampValue === 'number') {
            date = new Date(timestampValue);
        } else if (typeof timestampValue === 'string') {
             // Try parsing common formats, including the 'YYYY-MM-DD' from input itself
             date = new Date(timestampValue);
        } else if (timestampValue instanceof Timestamp) { // Handle Firestore Timestamp if necessary (e.g., initial load)
            date = timestampValue.toDate();
        } else if (timestampValue instanceof Date) {
            date = timestampValue;
        } else {
            return ''; // Invalid type
        }
  
        if (isNaN(date.getTime())) { // Check if date is valid
             return '';
        }
  
        // Format to YYYY-MM-DD for the date input
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        return `${year}-${month}-${day}`;
    } catch (error) {
        console.error("Error formatting timestamp:", error);
        return '';
    }
  };

export async function writeClientLog(
  actorUserId: UserId,
  actionType: LogActionType,
  logDetails: Partial<Omit<ClientLogWrite, 'userId' | 'actionType' | 'timestamp'>> = {}
): Promise<void> {
  if (!actorUserId) {
    console.warn("writeClientLog: actorUserId is missing.");
    return;
  }
  try {
    const logData: ClientLogWrite = {
      userId: actorUserId,
      actionType: actionType,
      timestamp: serverTimestamp(),
      residenciaId: logDetails.residenciaId,
      targetUid: logDetails.targetUid || null,
      relatedDocPath: logDetails.relatedDocPath,
      details: logDetails.details || `User ${actorUserId} performed ${actionType}.`,
    };
    await addDoc(collection(db, "logs"), logData);
  } catch (error) {
    console.error("Error writing client log:", error);
  }
}
