import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { Timestamp, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { LogActionType, ClientLogWrite, UserId, campoFechaConZonaHoraria } from '@/../../shared/models/types';
import { toDate, formatInTimeZone } from 'date-fns-tz';
import { isValid, format, intervalToDuration, Duration, add } from 'date-fns';
import { es } from 'date-fns/locale';
import timezonesDataJson from '@/../../shared/data/zonas_horarias_soportadas.json';

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

export const formatFCZHToMonthYear = (fczh: campoFechaConZonaHoraria | null | undefined): string => {
  if (!fczh || !fczh.fecha) {
    return 'N/A';
  }
  try {
    return format(fczh.fecha, 'MMM-yy', { locale: es }); // e.g., "ene-25"
  } catch (error) {
    console.error("Error formatting FCZH to MonthYear:", error, fczh);
    return fczh.fecha; // Fallback to original string on error
  }
};

interface TimezoneDetail {
  name: string; // IANA timezone name e.g., "America/New_York"
  offset: string; // UTC offset e.g., "-04:00", "+05:30"
  // Add other properties if they exist
}

// Interface for the overall timezones data structure (from TimezoneSelector.tsx)
interface TimezonesData {
  [region: string]: TimezoneDetail[];
}

// Cast the imported JSON to our TimezonesData interface
const timezonesData: TimezonesData = timezonesDataJson as TimezonesData;

/**
 * Gets the UTC offset string for a given IANA timezone name.
 * The timezone must be one of the examples defined in '@/app/zonas_horarias_ejemplos.json'.
 * @param ianaTimezoneName The IANA timezone name (e.g., "America/New_York").
 * @returns The UTC offset string (e.g., "-04:00") or null if not found.
 */
export const getUtcOffsetFromIanaName = (ianaTimezoneName: string): string | null => {
  if (!ianaTimezoneName) {
    return null;
  }

  // Iterate through each region in the timezonesData
  for (const region in timezonesData) {
    if (timezonesData.hasOwnProperty(region)) {
      const timezoneDetailsArray = timezonesData[region];
      // Find the timezone detail with the matching IANA name
      const foundTimezone = timezoneDetailsArray.find(
        (tzDetail) => tzDetail.name === ianaTimezoneName
      );

      if (foundTimezone) {
        return foundTimezone.offset; // Return the offset string
      }
    }
  }

  console.warn(`getUtcOffsetFromIanaName: Timezone "${ianaTimezoneName}" not found in zonas_horarias_ejemplos.json`);
  return null; // Return null if the timezone name is not found
};
