'use client';

import React, { useEffect, useState } from 'react';
import { useLoginC, useResidenciaC, useUserC } from '../page'; // Assuming useLoginC is exported from here correctly
import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  DocumentData,
  QueryDocumentSnapshot,
} from 'firebase/firestore';

import {
  startOfWeek,
  endOfWeek,
  endOfDay, // Added for date calculations
  startOfDay, // Added for date calculations
  format,
  addDays,
  addWeeks,
  subDays,
  isBefore,
  isAfter,
  isEqual,
  isWithinInterval, // Standard date-fns function
  parseISO,
  eachDayOfInterval,
  getDay, // Returns 0 for Sunday, 1 for Monday, ..., 6 for Saturday
  parse,
  getISOWeek,
} from 'date-fns';
import { es } from 'date-fns/locale'; // Spanish locale for ISO 8601 week (Monday first)

import {
  Residencia,
  UserProfile,
  TiempoComida,
  AlternativaTiempoComida,
  HorarioSolicitudComida,
  TiempoComidaMod,
  AlternativaTiempoComidaMod,
  AlteracionHorario,
  Actividad,
  TiempoComidaAlternativaUnicaActividad,
  Semanario,
  Eleccion,
  Ausencia,
  InscripcionActividad,
  Comentario,
  PermisosComidaPorGrupo,
  DayOfWeekKey, // 'lunes', 'martes', etc.
  CeldaSemanarioDesnormalizado,
  SemanarioDesnormalizado
} from '@/../../shared/models/types'; // Adjusted path

// --- Helper Functions for Date/Day Operations ---

// Converts 'lunes', 'martes', etc. to a number (0=Monday, 1=Tuesday, ..., 6=Sunday for consistency with ISO 8601 if needed, or date-fns getDay-like)
// date-fns getDay: Sunday=0, Monday=1, ..., Saturday=6
// ISO 8601 weekDay: Monday=1, ..., Sunday=7
// For this component, let's try to stick to DayOfWeekKey strings primarily and convert to numbers for date-fns where necessary.
const dayKeyToDateFnsNumber = (day: DayOfWeekKey): number => {
  // date-fns: Sunday=0, Monday=1, ..., Saturday=6
  const map: Record<DayOfWeekKey, number> = {
    domingo: 0,
    lunes: 1,
    martes: 2,
    miercoles: 3,
    jueves: 4,
    viernes: 5,
    sabado: 6,
  };
  return map[day];
};

// Helper to get a Date object for a specific DayOfWeekKey within a given week (represented by its start date)
const dayOfWeekKeyToDate = (dayKey: DayOfWeekKey, weekStartDate: Date): Date => {
    const targetDayIndex = dayKeyToDateFnsNumber(dayKey); // 0 (Sun) - 6 (Sat)
    const weekStartDayIndex = getDay(weekStartDate); // 0 (Sun) - 6 (Sat)
    
    // Calculate difference, ensuring we handle week wrap-around correctly if weekStartDate is not Sunday
    // Since our weekStartDate is Monday (from startOfWeek with locale:es, weekStartsOn:1)
    // getDay(weekStartDate) will be 1.
    // If targetDayIndex is 0 (Sunday) and weekStartDayIndex is 1 (Monday), diff is -1. addDays(monday, -1) = Sunday. This logic is complex.
    // A simpler way: startOfWeek already gives Monday. Add days based on the difference from Monday.
    let daysToAdd = targetDayIndex - 1; // Assuming Monday is 1 from dayKeyToDateFnsNumber
    if (dayKey === 'domingo') daysToAdd = 6; // Sunday is 6 days after Monday

    return addDays(weekStartDate, daysToAdd);
};

// Helper to convert a Date to DayOfWeekKey ('lunes', 'martes', etc.)
const formatToDayOfWeekKey = (date: Date): DayOfWeekKey => {
  // format with 'eeee' gives full day name, locale handles language
  const dayName = format(date, 'eeee', { locale: es }).toLowerCase() as DayOfWeekKey;
  // Ensure it matches your DayOfWeekKey type, e.g., 'miércoles' -> 'miercoles'
  if (dayName === 'miércoles') return 'miercoles';
  if (dayName === 'sábado') return 'sabado';
  return dayName;
};

// Checks if a targetDate is within the effective range of an item with fechaAplicacion and fechaFinAplicacion
const isDateAffected = (targetDate: Date, fechaAplicacion?: Timestamp | string, fechaFinAplicacion?: Timestamp | string): boolean => {
  if (!fechaAplicacion) return true; // If no start date, assume it's always applicable (or handle as error)
  
  const startDate = startOfDay(fechaAplicacion instanceof Timestamp ? fechaAplicacion.toDate() : parseISO(fechaAplicacion));
  
  if (!fechaFinAplicacion) { // No end date, so it applies from startDate onwards
    return isEqual(startOfDay(targetDate), startDate) || isAfter(startOfDay(targetDate), startDate);
  }
  
  const endDate = endOfDay(fechaFinAplicacion instanceof Timestamp ? fechaFinAplicacion.toDate() : parseISO(fechaFinAplicacion));
  return isWithinInterval(targetDate, { start: startDate, end: endDate });
};

// --- Main Component ---
const InicializarDatos: React.FC = () => {
  const context1 = useLoginC();
  const context2 = useResidenciaC();
  const context3 = useUserC();

  if (!context1 || !context2 || !context3) {
    // console.error("InicializarDatos: Context is not available.");
    // This component should not render or should show an error if context is missing.
    // Depending on how useLoginC is implemented, it might throw an error itself if context is undefined.
    return <div>Error: Contexto de comidas no disponible.</div>;
  }

  const {
    loggedUser,
    selectedUser,
    // selectedUserMealPermissions, // Will be used later
    residencia,
    residenciaId,
    db,
    isLoadingLoggedUser,
    isLoadingSelectedUserData,
    setIsLoadingUserMealData,
    // isDenormalizingData, // Will be used later
    setIsDenormalizingData,

    // Residence-wide data and setters from context
    residenciaTiemposComida, setResidenciaTiemposComida,
    residenciaAlternativas, setResidenciaAlternativas,
    residenciaHorariosSolicitud, setResidenciaHorariosSolicitud,
    // setResidenciaAlteracionesHorario, // Will be used later
    // setResidenciaTiemposComidaMod,    // Will be used later
    // setResidenciaAlternativasMod,     // Will be used later
    // setResidenciaActividadesParaResidentes, // Will be used later
    // setResidenciaAlternativasActividades, // Will be used later

    // User-specific data and setters from context (will be used in Step 2)
    // setUserSemanario,
    // setUserElecciones,
    // setUserAusencias,
    // setUserInscripciones,
    // setUserComentarios,
    
    // Denormalized data structure for UI (will be used in Step 4)
    // setSemanarioUI 
  } = context;

  // State to ensure residence-wide data is fetched only once per residenceId change or if not present in context
  const [residenceDataFetchedForId, setResidenceDataFetchedForId] = useState<string | null>(null);

  useEffect(() => {
    // console.log("InicializarDatos useEffect triggered");

    if (!db || isLoadingLoggedUser || isLoadingSelectedUserData || !residenciaId || !loggedUser || !selectedUser || !residencia) {
      // console.log("InicializarDatos: Early exit - waiting for essential data", { dbReady: !!db, isLoadingLoggedUser, isLoadingSelectedUserData, residenciaId, loggedUserPresent: !!loggedUser, selectedUserPresent: !!selectedUser, residenciaPresent: !!residencia });
      return;
    }

    // console.log("InicializarDatos: All essential data present, proceeding.");
    // Ensure flags are managed correctly
    // If we are about to fetch, set loading to true. Denormalizing is false until fetch is done.
    setIsLoadingUserMealData(true);
    setIsDenormalizingData(false); 

    const fetchAndProcessData = async () => {
      // console.log("InicializarDatos: fetchAndProcessData started.");
      try {
        // --- Step 1: Fetch Residence-Wide Data (if not already fetched for this residenciaId or not in context) ---
        let affectedPeriodStart: Date;
        let affectedPeriodEnd: Date;
        // let affectedPeriodDays: string[] = []; // 'YYYY-MM-DD' - Will be calculated and stored in denormalized structure

        // Check if data for this residenciaId is already in context and fetched by this component instance
        const needsResidenceFetch = residenceDataFetchedForId !== residenciaId || 
                                    !residenciaTiemposComida || residenciaTiemposComida.length === 0 ||
                                    !residenciaAlternativas || residenciaAlternativas.length === 0 ||
                                    !residenciaHorariosSolicitud || residenciaHorariosSolicitud.length === 0;

        if (needsResidenceFetch) {
          // console.log(`InicializarDatos: Fetching residence-wide data for ${residenciaId}`);
          
          // 1.1 Fetch base schedule structures (TiempoComida[], AlternativaTiempoComida[], HorarioSolicitudComida[])
          const tiemposComidaQuery = query(collection(db, 'residencias', residenciaId, 'tiemposComida'), where('isActive', '==', true));
          const alternativasTiempoComidaQuery = query(collection(db, 'residencias', residenciaId, 'alternativasTiempoComida'), where('isActive', '==', true));
          // For HorarioSolicitudComida, isActive might not be a field, adjust if needed. Assuming it is for consistency.
          const horariosSolicitudQuery = query(collection(db, 'residencias', residenciaId, 'horariosSolicitudComida'), where('isActive', '==', true));

          const [tiemposComidaSnap, alternativasSnap, horariosSolicitudSnap] = await Promise.all([
            getDocs(tiemposComidaQuery),
            getDocs(alternativasTiempoComidaQuery),
            getDocs(horariosSolicitudQuery),
          ]);

          const tiemposComidaData = tiemposComidaSnap.docs.map(d => ({ id: d.id, ...d.data() } as TiempoComida));
          const alternativasData = alternativasSnap.docs.map(d => ({ id: d.id, ...d.data() } as AlternativaTiempoComida));
          const horariosSolicitudData = horariosSolicitudSnap.docs.map(d => ({ id: d.id, ...d.data() } as HorarioSolicitudComida));
          
          setResidenciaTiemposComida(tiemposComidaData);
          setResidenciaAlternativas(alternativasData);
          setResidenciaHorariosSolicitud(horariosSolicitudData);
          
          setResidenceDataFetchedForId(residenciaId); // Mark as fetched by this instance for this ID
          // console.log("InicializarDatos: Residence-wide base data fetched and set to context.");
        } else {
          // console.log(`InicializarDatos: Residence-wide data for ${residenciaId} already in context or fetched by this instance.`);
          // Data is already in context from a previous run or another component, or this instance already fetched it.
        }

        // 1.2 Calculate affected period - Start with current week (Mon-Sun)
        // This calculation will now use the data from context (which might have just been fetched)
        const today = new Date(); // Use a stable 'today' for all calculations in this run
        affectedPeriodStart = startOfWeek(today, { locale: es, weekStartsOn: 1 }); // Monday
        affectedPeriodEnd = endOfWeek(today, { locale: es, weekStartsOn: 1 });   // Sunday
        // console.log(`InicializarDatos: Initial affected period: ${format(affectedPeriodStart, 'yyyy-MM-dd')} to ${format(affectedPeriodEnd, 'yyyy-MM-dd')}`);

        // TODO: Next steps will involve:
        // 1.2.1: Extending affectedPeriodEnd based on HorarioSolicitudComida and related Alternativas.
        // 1.2.2: Extending affectedPeriodStart based on Alternativas with iniciaDiaAnterior=true for Mondays.
        // 1.3: Fetching *Mod and AlteracionHorario data based on the calculated affected period.
        // 1.4 & 1.5: Fetching Actividad and TiempoComidaAlternativaUnicaActividad data.
        // Then Step 2 (User-specific data), Step 3 (set isLoadingUserMealData(false)), and Step 4 (Denormalization).

        // For now, let's assume the rest of the logic will follow in subsequent steps.
        // To prevent UI hanging on "loading", if we stop here, we should set loading to false.
        // However, this is just step 1 of the initial setup. The actual setIsLoadingUserMealData(false)
        // comes after ALL Firestore fetches (end of Step 2).

        // Placeholder for where the next chunk of logic will go
        // console.log("InicializarDatos: End of current Step 1 provided code.");
        // If all data processing were done:
        // setIsLoadingUserMealData(false);
        // setIsDenormalizingData(true); // then start denormalization
        // ... denormalization logic ...
        // setIsDenormalizingData(false);


      } catch (error) {
        // console.error("InicializarDatos: Error in fetchAndProcessData: ", error);
        setIsLoadingUserMealData(false);
        setIsDenormalizingData(false);
        // Consider setting an error state in the context if applicable
      }
    };

    fetchAndProcessData();

    // Cleanup function for useEffect if needed
    return () => {
      // console.log("InicializarDatos: useEffect cleanup.");
      // Any cleanup logic
    };
  // Watch for changes in essential data that should trigger a re-run
  }, [
    db, 
    loggedUser, 
    selectedUser, 
    residencia, 
    residenciaId, 
    isLoadingLoggedUser, 
    isLoadingSelectedUserData,
    // Context setters are stable, no need to list them unless their identity changes
    // which is unlikely for Zustand/Context.
    // Listing the data itself if we want to react to external changes to it,
    // but here we are primarily fetching it.
    residenciaTiemposComida,     // Added to re-evaluate if context changes externally
    residenciaAlternativas,       // though this component is the one setting them.
    residenciaHorariosSolicitud,  // More for the needsResidenceFetch logic.
    setResidenciaTiemposComida,
    setResidenciaAlternativas,
    setResidenciaHorariosSolicitud,
    setIsLoadingUserMealData,
    setIsDenormalizingData,
    // residenceDataFetchedForId // Internal state, not a dependency for triggering effect, but for logic within
  ]);

  // Render logic (will show loading messages based on context state)
  const { isLoadingUserMealData: isLoadingDisplay, isDenormalizingData: isDenormalizingDisplay } = context;

  if (isLoadingDisplay) {
    return <div>Cargando datos de comidas del usuario...</div>; // Or use a proper loading component
  }
  if (isDenormalizingDisplay) {
    return <div>Procesando información del horario de comidas...</div>; // Or use a proper processing component
  }

  return null; // This component primarily handles data and context, not direct UI rendering of the schedule
};

export default InicializarDatos;
