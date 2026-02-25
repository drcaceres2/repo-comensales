import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { Timestamp, collection, addDoc, serverTimestamp, WriteBatch } from 'firebase/firestore';
import { db, auth } from './firebase';
import { LogActionType } from 'shared/models/types';
import { Usuario } from 'shared/schemas/usuarios';
import { type Toast } from "@/hooks/useToast";
import timezonesDataJson from 'shared/data/zonas_horarias_soportadas.json';
import { ParsedToken, IdTokenResult } from "firebase/auth";
import { getDoc, doc } from 'firebase/firestore';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Checks if the client's timezone differs from the provided residence timezone
 * and displays a toast warning if they are different.
 * @param residenceZoneHoraria The IANA timezone string of the residence.
 * @returns resultadoVerificacionZonaHoraria
 */
export function verificarZonaHoraria(
  residenceZoneHoraria: string | undefined | null
): resultadoVerificacionZonaHoraria {
  if (!residenceZoneHoraria) {
    return 'no_hay_zona_horaria_residencia'; 
  }

  try {
    const clientTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    if (!clientTimezone) {
      return 'no_hay_zona_horaria_cliente';
    } else {
      if(clientTimezone === residenceZoneHoraria)
        return 'igual';
      else
        return 'diferente';
    }
  } catch (error) {
    console.error("Error getting client timezone or displaying warning:", error);
    return 'error_zona_horaria'; 
  }
}
export type resultadoVerificacionZonaHoraria = 'igual' | 'no_hay_zona_horaria_residencia' | 'no_hay_zona_horaria_cliente' | 'diferente' | 'error_zona_horaria';

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

// Interfaz local para los argumentos (Opcional, pero ayuda al intellisense)
interface ClientLogOptions {
  targetId?: string | null;
  targetCollection?: string; // Ej: 'menus', 'dietas'
  residenciaId?: string;     // Vital para filtrar logs por residencia después
  details?: Record<string, any>;
}

/**
 * Escribe un log de auditoría desde el Cliente (Frontend).
 * Es "Fire and Forget": No bloquea la UI si falla.
 */
export const logClientAction = async (
  action: LogActionType,
  options: ClientLogOptions = {}
): Promise<void> => {
  const user = auth.currentUser;

  // 1. Fail-safe: Si no hay usuario logueado, no intentamos escribir
  // (Las reglas de Firestore lo bloquearían de todas formas)
  if (!user) {
    console.warn('[Audit] Intento de log sin usuario autenticado:', action);
    return;
  }

  try {
    const logData = {
      // Identidad (Autrellenada para garantizar seguridad)
      userId: user.uid,
      userEmail: user.email, 

      // Acción y Contexto
      action: action,
      targetId: options.targetId || null,
      targetCollection: options.targetCollection || null,
      residenciaId: options.residenciaId || null,
      details: options.details || {},

      // Metadata Técnica
      // OJO: Usamos el serverTimestamp del CLIENT SDK (importado de 'firebase/firestore')
      // NO el de 'firebase-admin' que usamos en functions. Son objetos diferentes.
      timestamp: serverTimestamp(), 
      source: 'web-client'
    };

    // 2. Escritura directa
    await addDoc(collection(db, 'logs'), logData);

  } catch (error) {
    // 3. Silent Fail: Si falla el log (ej. internet lento), no rompemos la app al usuario.
    // Solo dejamos constancia en la consola del navegador para depuración.
    console.error('[Audit] Error escribiendo log:', error);
  }
};

/**
 * Agrega un log a un batch existente. NO ejecuta el commit.
 * Garantiza atomicidad: Si el dato se guarda, el log se guarda.
 */
export const addLogToBatch = (
  batch: WriteBatch,
  action: LogActionType,
  options: {
    targetId?: string;
    targetCollection?: string;
    residenciaId?: string;
    details?: Record<string, any>;
  }
) => {
  const user = auth.currentUser;
  if (!user) return; // O lanzar error si es estricto

  // 1. Creamos una referencia vacía para el nuevo log
  const logRef = doc(collection(db, 'logs'));

  // 2. Preparamos la data (Idéntica a tu logClientAction)
  const logData = {
    userId: user.uid,
    userEmail: user.email,
    action: action,
    targetId: options.targetId || null,
    targetCollection: options.targetCollection || null,
    residenciaId: options.residenciaId || null,
    details: options.details || {},
    timestamp: serverTimestamp(), // Funciona perfecto dentro de batches
    source: 'web-client-batch'
  };

  // 3. Insertamos en el batch (Set)
  batch.set(logRef, logData);
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

export async function validarResidenciaUsuario({
  authUser,
  claims,
  params,
}: {
  authUser: any | undefined;
  claims: ParsedToken | undefined;
  params: any | undefined;
}): Promise<Usuario> {
  if (!authUser || !authUser.id || !claims || !params) {
    throw new Error('No se encontró el usuario autenticado en la base de datos.');
  }
  const userProfileRef = doc(db, 'usuarios', authUser.uid)
  const userProfileDoc = await getDoc(userProfileRef);
  let userProfileData: Usuario;
  if (userProfileDoc.exists()) {
    userProfileData = userProfileDoc.data() as Usuario;
  } else {
    throw new Error('No se encontró el usuario autenticado en la base de datos.');
  }
  if (!claims || !claims.roles || !Array.isArray(claims.roles) || !userProfileData.roles || !Array.isArray(userProfileData.roles) || claims.roles.sort().toString() !== userProfileData.roles.sort().toString()) {
    throw new Error('Inconsistencia en los roles del usuario.');
  }
  if (claims.residenciaId !== userProfileData.residenciaId || claims.residenciaId !== params.residenciaId) {
    throw new Error('Inconsistencia en la residencia del usuario.');
  }

  if (!userProfileData.residenciaId) {
    throw new Error('No se encontró la residencia en el perfil del usuario.');
  }

  return userProfileData;
}

export async function getUserProfileData(userId: string): Promise<Usuario | null> {
  const userProfileDoc = await getDoc(doc(db, 'usuarios', userId));
  return userProfileDoc.exists() ? (userProfileDoc.data() as Usuario) : null;
}