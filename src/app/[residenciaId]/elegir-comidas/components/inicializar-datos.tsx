'use client';

import React, { useEffect, useState } from 'react';
import { useLoginC, useResidenciaC, useUserC } from '../page'; // Assuming useLoginC is exported from here correctly
import {
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
  const dayString = format(date, 'eeee', { locale: es }).toLowerCase();
  // Ensure it matches your DayOfWeekKey type, e.g., 'miércoles' -> 'miercoles'
  let dayName: DayOfWeekKey;
  if (dayString === 'miércoles') dayName = 'miercoles';
  else if (dayString === 'sábado') dayName = 'sabado';
  else dayName = dayString as DayOfWeekKey; 
  return dayName;
};

// Checks if a targetDate is within the effective range of an item with fechaAplicacion and fechaFinAplicacion
const isDateAffected = (targetDate: Date, fechaAplicacion?: string, fechaFinAplicacion?: string): boolean => {
  if (!fechaAplicacion) return true; // If no start date, assume it's always applicable (or handle as error)
  
  const startDate = startOfDay(parseISO(fechaAplicacion));
  
  if (!fechaFinAplicacion) { // No end date, so it applies from startDate onwards
    return isEqual(startOfDay(targetDate), startDate) || isAfter(startOfDay(targetDate), startDate);
  }
  
  const endDate = endOfDay(parseISO(fechaFinAplicacion));
  return isWithinInterval(targetDate, { start: startDate, end: endDate });
};

// --- Main Component ---
const InicializarDatos: React.FC = () => {
  const contextLogin = useLoginC();
  const contextResidencia = useResidenciaC();
  const contextUser = useUserC();

  if (!contextLogin || !contextResidencia || !contextUser) {
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
    isLoadingLoggedUser,
    isLoadingSelectedUserData,
    setIsLoadingUserMealData,
    // isDenormalizingData, // Will be used later
    setIsDenormalizingData,
    db,
  } = contextLogin;
  const {
    // Residence-wide data and setters from context
    residenciaTiemposComida, setResidenciaTiemposComida,
    residenciaAlternativas, setResidenciaAlternativas,
    residenciaHorariosSolicitud, setResidenciaHorariosSolicitud,
    residenciaAlteracionesHorario, setResidenciaAlteracionesHorario, // Ensure this is destructured
    residenciaTiemposComidaMod, setResidenciaTiemposComidaMod,    // Ensure this is destructured
    residenciaAlternativasMod, setResidenciaAlternativasMod,     // Ensure this is destructured
    residenciaActividadesParaResidentes, setResidenciaActividadesParaResidentes, // Ensure this is destructured
    residenciaAlternativasActividades, setResidenciaAlternativasActividades, // Ensure this is destructured

  } = contextResidencia
  const {
    // User-specific data and setters from context (will be used in Step 2)
    setUserSemanario,
    setUserElecciones,
    setUserAusencias,
    setUserInscripciones,
    setUserComentarios,
    
    // Denormalized data structure for UI (will be used in Step 4)
     setSemanarioUI 
  } = contextUser

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
        // --- Step 1: Fetch / Prepare Residence-Wide Data ---
        let currentAffectedPeriodStart: Date;
        let currentAffectedPeriodEnd: Date;
        
        const today = new Date(); // Use a stable 'today' for all calculations in this run

        // Check if base data for this residenciaId is already in context and fetched by this component instance
        const needsResidenceBaseFetch = residenceDataFetchedForId !== residenciaId ||
                                    !residenciaTiemposComida || residenciaTiemposComida.length === 0 ||
                                    !residenciaAlternativas || residenciaAlternativas.length === 0 ||
                                    !residenciaHorariosSolicitud || residenciaHorariosSolicitud.length === 0;

        let localTiemposComida = residenciaTiemposComida || [];
        let localAlternativas = residenciaAlternativas || [];
        let localHorariosSolicitud = residenciaHorariosSolicitud || [];

        if (needsResidenceBaseFetch) {
          // console.log(`InicializarDatos: Fetching residence-wide base data for ${residenciaId}`);
          const tiemposComidaQuery = query(collection(db, 'residencias', residenciaId, 'tiemposComida'), where('isActive', '==', true));
          const alternativasTiempoComidaQuery = query(collection(db, 'residencias', residenciaId, 'alternativasTiempoComida'), where('isActive', '==', true));
          const horariosSolicitudQuery = query(collection(db, 'residencias', residenciaId, 'horariosSolicitudComida'), where('isActive', '==', true));

          const [tiemposComidaSnap, alternativasSnap, horariosSolicitudSnap] = await Promise.all([
            getDocs(tiemposComidaQuery),
            getDocs(alternativasTiempoComidaQuery),
            getDocs(horariosSolicitudQuery),
          ]);

          localTiemposComida = tiemposComidaSnap.docs.map(d => ({ id: d.id, ...d.data() } as TiempoComida));
          localAlternativas = alternativasSnap.docs.map(d => ({ id: d.id, ...d.data() } as AlternativaTiempoComida));
          localHorariosSolicitud = horariosSolicitudSnap.docs.map(d => ({ id: d.id, ...d.data() } as HorarioSolicitudComida));
          
          setResidenciaTiemposComida(localTiemposComida);
          setResidenciaAlternativas(localAlternativas);
          setResidenciaHorariosSolicitud(localHorariosSolicitud);
          setResidenceDataFetchedForId(residenciaId);
          // console.log("InicializarDatos: Residence-wide base data fetched and set to context.");
        } else {
          // console.log(`InicializarDatos: Using residence-wide base data from context for ${residenciaId}.`);
        }

        // 1.2 Calculate affected period - Start with current week (Mon-Sun)
        currentAffectedPeriodStart = startOfWeek(today, { locale: es, weekStartsOn: 1 }); // Monday
        currentAffectedPeriodEnd = endOfWeek(today, { locale: es, weekStartsOn: 1 });   // Sunday
        // console.log(`InicializarDatos: Initial affected period: ${format(currentAffectedPeriodStart, 'yyyy-MM-dd')} to ${format(currentAffectedPeriodEnd, 'yyyy-MM-dd')}`);

        // 1.2.1 Extend affected period based on HorarioSolicitudComida and AlternativaTiempoComida
        localHorariosSolicitud.forEach(hsc => {
          const hscTimeParts = hsc.horaSolicitud.split(':').map(Number); // HH:mm
          // Create a date for HSC based on its dayKey within the *current* week to establish a baseline
          const hscBaseDateCurrentWeek = dayOfWeekKeyToDate(hsc.dia, currentAffectedPeriodStart);
          const hscDateTimeCurrentWeek = new Date(hscBaseDateCurrentWeek.getFullYear(), hscBaseDateCurrentWeek.getMonth(), hscBaseDateCurrentWeek.getDate(), hscTimeParts[0], hscTimeParts[1]);

          hsc.alternativasAfectadas.forEach(altId => {
            const alternativa = localAlternativas.find(a => a.id === altId);
            if (!alternativa) return;
            const tiempoComida = localTiemposComida.find(tc => tc.id === alternativa.tiempoComidaId);
            if (!tiempoComida) return;

            const altVentanaParts = alternativa.ventanaInicio.split(':').map(Number); // HH:mm
            
            // Determine the date for the TiempoComida this Alternativa refers to.
            // It could be in the current week or next week relative to the HSC time.
            let tcDate = dayOfWeekKeyToDate(tiempoComida.dia, currentAffectedPeriodStart); // Assume current week first
            let tcDateTime = new Date(tcDate.getFullYear(), tcDate.getMonth(), tcDate.getDate(), altVentanaParts[0], altVentanaParts[1]);

            if (alternativa.iniciaDiaAnterior) { // If it starts on a previous day (e.g. Monday breakfast prep starts Sunday night)
              tcDateTime = subDays(tcDateTime, 1);
            }

            // If the TC's effective time is before or same day but earlier time than HSC time (in current week context), it must be for next week.
            if (isBefore(tcDateTime, hscDateTimeCurrentWeek) || (isEqual(startOfDay(tcDateTime), startOfDay(hscDateTimeCurrentWeek)) && alternativa.ventanaInicio < hsc.horaSolicitud )) {
                 // This TC is for the *next* week
                const tcDateNextWeek = dayOfWeekKeyToDate(tiempoComida.dia, addWeeks(currentAffectedPeriodStart,1));
                let tcDateTimeNextWeek = new Date(tcDateNextWeek.getFullYear(), tcDateNextWeek.getMonth(), tcDateNextWeek.getDate(), altVentanaParts[0], altVentanaParts[1]);
                 if (alternativa.iniciaDiaAnterior) {
                    tcDateTimeNextWeek = subDays(tcDateTimeNextWeek, 1);
                }
                tcDateTime = tcDateTimeNextWeek; // This is the one we care about
            }
            
            // If this meal's date (potentially next week) is after the current end of affected period, extend.
            // We care about the day of the TiempoComida itself, not necessarily the ventanaInicio if it crosses midnight.
            const actualMealDay = dayOfWeekKeyToDate(tiempoComida.dia, startOfWeek(tcDateTime, {locale: es, weekStartsOn: 1}));

            if (isAfter(endOfDay(actualMealDay), currentAffectedPeriodEnd)) {
              currentAffectedPeriodEnd = endOfDay(actualMealDay);
              // console.log(`Extended affectedPeriodEnd to ${format(currentAffectedPeriodEnd, 'yyyy-MM-dd')} due to HSC/Alt next week logic for TC ${tiempoComida.id}`);
            }
          });
        });

        // 1.2.2 Extend for AlternativaTiempoComida.iniciaDiaAnterior=true on Monday
        localAlternativas.forEach(alt => {
          if (alt.iniciaDiaAnterior) {
            const tiempoComida = localTiemposComida.find(tc => tc.id === alt.tiempoComidaId);
            if (tiempoComida && tiempoComida.dia === 'lunes') {
              const sundayBeforeCurrentMonday = subDays(currentAffectedPeriodStart, 1);
              if (isBefore(sundayBeforeCurrentMonday, currentAffectedPeriodStart)) {
                currentAffectedPeriodStart = startOfDay(sundayBeforeCurrentMonday);
                // console.log(`Extended affectedPeriodStart to ${format(currentAffectedPeriodStart, 'yyyy-MM-dd')} due to 'iniciaDiaAnterior' on Monday`);
              }
            }
          }
        });
        
        // Final affected period object, ensure start is before end
        if(isAfter(currentAffectedPeriodStart, currentAffectedPeriodEnd)) {
            // This can happen if 'today' is Sunday, initial end is Sunday, but an 'iniciaDiaAnterior' for Monday TC (from current week) pulls start to previous Sunday.
            // And no HSC logic extended the end further. In this case, the end should at least be the original end of week.
            currentAffectedPeriodEnd = endOfWeek(today, { locale: es, weekStartsOn: 1 });
             if(isAfter(currentAffectedPeriodStart, currentAffectedPeriodEnd)) { // If it's still inverted, something is odd, default to current week
                currentAffectedPeriodStart = startOfWeek(today, { locale: es, weekStartsOn: 1 });
                currentAffectedPeriodEnd = endOfWeek(today, { locale: es, weekStartsOn: 1 });
             }
        }
        
        const finalAffectedPeriod = { start: currentAffectedPeriodStart, end: currentAffectedPeriodEnd };
        // console.log(`InicializarDatos: Final calculated affected period: ${format(finalAffectedPeriod.start, 'yyyy-MM-dd')} to ${format(finalAffectedPeriod.end, 'yyyy-MM-dd')}`);

        // 1.3 Fetch *Mod and AlteracionHorario data. Filter client-side by affected period.
        // These are fetched every time as their relevance depends on the calculated 'finalAffectedPeriod' which can change.
        const tcmQuery = query(collection(db, 'residencias', residenciaId, 'tiemposComidaMod'));
        const altcmQuery = query(collection(db, 'residencias', residenciaId, 'alternativasTiempoComidaMod'));
        const ahQuery = query(collection(db, 'residencias', residenciaId, 'alteracionesHorario'));

        const [tcmSnap, altcmSnap, ahSnap] = await Promise.all([
            getDocs(tcmQuery), getDocs(altcmQuery), getDocs(ahQuery)
        ]);

        const tiemposComidaModData = tcmSnap.docs.map(d => ({ id: d.id, ...d.data() } as TiempoComidaMod))
            .filter(mod => isDateAffected(finalAffectedPeriod.start, mod.fechaAplicacion, mod.fechaFinAplicacion) || 
                           isDateAffected(finalAffectedPeriod.end, mod.fechaAplicacion, mod.fechaFinAplicacion) ||
                           (mod.fechaAplicacion && isWithinInterval(mod.fechaAplicacion.toDate(), finalAffectedPeriod)) // checks if mod starts within period
                           // Add more checks if a mod can span the period without start/end being inside
            );
        const alternativasModData = altcmSnap.docs.map(d => ({ id: d.id, ...d.data() } as AlternativaTiempoComidaMod))
            .filter(mod => isDateAffected(finalAffectedPeriod.start, mod.fechaAplicacion, mod.fechaFinAplicacion) || 
                           isDateAffected(finalAffectedPeriod.end, mod.fechaAplicacion, mod.fechaFinAplicacion) ||
                           (mod.fechaAplicacion && isWithinInterval(mod.fechaAplicacion.toDate(), finalAffectedPeriod))
            );
        const alteracionesHorarioData = ahSnap.docs.map(d => ({ id: d.id, ...d.data() } as AlteracionHorario))
             .filter(alt => isDateAffected(finalAffectedPeriod.start, alt.fechaAplicacion, alt.fechaFinAplicacion) ||
                            isDateAffected(finalAffectedPeriod.end, alt.fechaAplicacion, alt.fechaFinAplicacion) ||
                            (alt.fechaAplicacion && isWithinInterval(alt.fechaAplicacion.toDate(), finalAffectedPeriod))
             );
        
        setResidenciaTiemposComidaMod(tiemposComidaModData);
        setResidenciaAlternativasMod(alternativasModData);
        setResidenciaAlteracionesHorario(alteracionesHorarioData);
        // console.log("InicializarDatos: Mods and Alteraciones fetched and filtered for affected period.");

        // 1.4 Fetch Actividad[]
        // Query for activities that *overlap* with the finalAffectedPeriod.
        // An activity overlaps if (ActStart <= PeriodEnd) and (ActEnd >= PeriodStart)
        const actividadesBaseQuery = query(collection(db, 'residencias', residenciaId, 'actividades'),
            where('aceptaResidentes', '==', true),
            where('fechaInicio', '<=', Timestamp.fromDate(finalAffectedPeriod.end))
            // Second part of overlap (fechaFin >= PeriodStart) will be filtered client-side if complex for query
        );
        const actividadesSnap = await getDocs(actividadesBaseQuery);
        let actividadesData = actividadesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Actividad))
            .filter(act => {
                const actFinDate = act.fechaFin instanceof Timestamp ? act.fechaFin.toDate() : parseISO(act.fechaFin as string);
                return isAfter(actFinDate, finalAffectedPeriod.start) || isEqual(actFinDate, finalAffectedPeriod.start);
            })
            .filter(act => act.estado !== 'borrador' && act.estado !== 'cancelada');
        
        // 1.5 Fetch TiempoComidaAlternativaUnicaActividad[] within the period
        const tcauaQuery = query(collection(db, 'residencias', residenciaId, 'tiemposComidaAlternativaUnicaActividad'),
            where('fecha', '>=', Timestamp.fromDate(finalAffectedPeriod.start)),
            where('fecha', '<=', Timestamp.fromDate(finalAffectedPeriod.end))
        );
        const tcauaSnap = await getDocs(tcauaQuery);
        const tcauaData = tcauaSnap.docs.map(d => ({ id: d.id, ...d.data() } as TiempoComidaAlternativaUnicaActividad));

        // Add activities referenced by TCAUA if not already fetched
        const actividadIdsFromTCAUA = new Set(tcauaData.map(t => t.actividadId).filter(id => id));
        const fetchedActividadIds = new Set(actividadesData.map(a => a.id));
        const missingActividadIds: string[] = [];
        actividadIdsFromTCAUA.forEach(id => {
          if (id && !fetchedActividadIds.has(id)) {
            missingActividadIds.push(id);
          }
        });

        if (missingActividadIds.length > 0) {
          // In Firestore, 'in' queries are limited (currently 30 elements). Batch if necessary.
          // For simplicity, fetching one by one here, but batching is better for production.
          const newActividadesPromises = missingActividadIds.map(id => getDoc(doc(db, 'residencias', residenciaId, 'actividades', id)));
          const newActividadesDocs = await Promise.all(newActividadesPromises);
          newActividadesDocs.forEach(actDoc => {
            if (actDoc.exists()) {
              const actData = { id: actDoc.id, ...actDoc.data() } as Actividad;
              if (actData.aceptaResidentes && actData.estado !== 'borrador' && actData.estado !== 'cancelada') {
                // Check if it overlaps with the period before adding
                const actInicioDate = actData.fechaInicio instanceof Timestamp ? actData.fechaInicio.toDate() : parseISO(actData.fechaInicio as string);
                const actFinDate = actData.fechaFin instanceof Timestamp ? actData.fechaFin.toDate() : parseISO(actData.fechaFin as string);
                if (isBefore(actInicioDate, finalAffectedPeriod.end) && isAfter(actFinDate, finalAffectedPeriod.start)) {
                     actividadesData.push(actData);
                }
              }
            }
          });
        }
        setResidenciaActividadesParaResidentes(actividadesData);
        setResidenciaAlternativasActividades(tcauaData);
        // console.log("InicializarDatos: Actividades and TCAUA fetched for affected period.");

        // --- Step 2: Fetch User-Specific Data ---
        // This data is fetched every time selectedUser changes, as this whole useEffect reruns.
        // console.log(`InicializarDatos: Fetching user-specific data for ${selectedUser.id} within period ${format(finalAffectedPeriod.start, 'yyyy-MM-dd')} to ${format(finalAffectedPeriod.end, 'yyyy-MM-dd')}`);
        const userId = selectedUser.id;

        // 2.1 Semanario object for this user and residenciaId
        const semanarioQuery = query(
          collection(db, 'users', userId, 'semanarios'),
          where('residenciaId', '==', residenciaId)
          // limit(1) // Assuming one semanario per user per residencia
        );
        const semanarioSnap = await getDocs(semanarioQuery);
        let userSemanarioData: Semanario | null = null;
        if (!semanarioSnap.empty) {
          // Assuming there's at most one semanario document per user/residencia
          userSemanarioData = { id: semanarioSnap.docs[0].id, ...semanarioSnap.docs[0].data() } as Semanario;
        }
        setUserSemanario(userSemanarioData);
        // console.log("User Semanario fetched: ", userSemanarioData);

        // 2.2 Eleccion[] and Ausencia[] that fall into affected period
        const eleccionesQuery = query(
          collection(db, 'users', userId, 'elecciones'),
          where('residenciaId', '==', residenciaId),
          where('fecha', '>=', Timestamp.fromDate(finalAffectedPeriod.start)),
          where('fecha', '<=', Timestamp.fromDate(finalAffectedPeriod.end))
        );

        // For Ausencias, it's safer to fetch all for the residence and filter client-side due to start/end range complexities in queries.
        const ausenciasQuery = query(
          collection(db, 'users', userId, 'ausencias'),
          where('residenciaId', '==', residenciaId)
        );

        const [eleccionesSnap, ausenciasSnap] = await Promise.all([
          getDocs(eleccionesQuery),
          getDocs(ausenciasQuery),
        ]);

        const eleccionesData = eleccionesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Eleccion));
        const ausenciasData = ausenciasSnap.docs.map(d => ({ id: d.id, ...d.data() } as Ausencia))
          .filter(aus => {
            const ausInicio = aus.fechaInicio instanceof Timestamp ? aus.fechaInicio.toDate() : parseISO(aus.fechaInicio as string);
            const ausFin = aus.fechaFin instanceof Timestamp ? aus.fechaFin.toDate() : parseISO(aus.fechaFin as string);
            // Check for overlap: (AusStart <= PeriodEnd) AND (AusEnd >= PeriodStart)
            return (isBefore(ausInicio, finalAffectedPeriod.end) || isEqual(ausInicio, finalAffectedPeriod.end)) &&
                   (isAfter(ausFin, finalAffectedPeriod.start) || isEqual(ausFin, finalAffectedPeriod.start));
          });

        setUserElecciones(eleccionesData);
        setUserAusencias(ausenciasData);
        // console.log("User Elecciones fetched: ", eleccionesData.length);
        // console.log("User Ausencias fetched and filtered: ", ausenciasData.length);

        // 2.3 All existing InscripcionActividad[] related to fetched Actividad[]
        // residenciaActividadesParaResidentes is already up-to-date in context from Step 1
        const actividadIdsParaInscripcion = (residenciaActividadesParaResidentes || []).map(a => a.id).filter(id => id);
        let inscripcionesData: InscripcionActividad[] = [];

        if (actividadIdsParaInscripcion.length > 0) {
          // Firestore 'in' query limitation (max 30 values). Batch if necessary.
          const idBatches: string[][] = [];
          for (let i = 0; i < actividadIdsParaInscripcion.length; i += 30) {
            idBatches.push(actividadIdsParaInscripcion.slice(i, i + 30));
          }

          const inscripcionPromises = idBatches.map(batch => {
            if (batch.length === 0) return Promise.resolve({ docs: [] }); // Handle empty batch case
            const inscQuery = query(
              collection(db, 'users', userId, 'inscripcionesActividades'),
              where('residenciaId', '==', residenciaId),
              where('actividadId', 'in', batch)
            );
            return getDocs(inscQuery);
          });
          
          const inscripcionSnapsArray = await Promise.all(inscripcionPromises);
          inscripcionSnapsArray.forEach(snap => {
            snap.docs.forEach(d => inscripcionesData.push({ id: d.id, ...d.data() } as InscripcionActividad));
          });
        }
        setUserInscripciones(inscripcionesData);
        // console.log("User Inscripciones fetched: ", inscripcionesData.length);

        // 2.4 All Comentario[] having leido=false and archivado=false
        const comentariosQuery = query(
          collection(db, 'users', userId, 'comentarios'),
          where('residenciaId', '==', residenciaId),
          where('leido', '==', false),
          where('archivado', '==', false)
        );
        const comentariosSnap = await getDocs(comentariosQuery);
        const comentariosData = comentariosSnap.docs.map(d => ({ id: d.id, ...d.data() } as Comentario));
        setUserComentarios(comentariosData);
        // console.log("User Comentarios fetched: ", comentariosData.length);

        // --- Step 3: All Firestore document fetching are finished ---
        setIsLoadingUserMealData(false);
        // console.log("InicializarDatos: All user and residence data fetched. isLoadingUserMealData set to false.");

        // --- Step 4: Denormalize Data ---
        // console.log("InicializarDatos: Starting data denormalization.");
        setIsDenormalizingData(true);

        // 4.1 Initialize SemanarioDenormalizado object
        const affectedPeriodDays = eachDayOfInterval(finalAffectedPeriod).map(date => format(date, 'yyyy-MM-dd'));
        
        const newSemanarioUI: SemanarioDenormalizado = {
          userId: selectedUser.id,
          residenciaId: residenciaId,
          semana: `${format(finalAffectedPeriod.start, 'yyyy')}-W${getISOWeek(finalAffectedPeriod.start)}`,
          ordenGruposComida: [],
          tabla: {},
          affectedPeriodDays: affectedPeriodDays,
        };

        // 4.2 Determine complete list of meal groups and ordenGruposComida
        const uniqueMealGroups = new Set<string>();
        (residenciaTiemposComida || []).forEach(tc => uniqueMealGroups.add(tc.nombreGrupo));
        (residenciaTiemposComidaMod || []).forEach(tcm => {
          if (tcm.nombreGrupo) uniqueMealGroups.add(tcm.nombreGrupo); // If TCMod defines a new group
          else if (tcm.nombreGrupoAfectado) uniqueMealGroups.add(tcm.nombreGrupoAfectado); // Or affects an existing
        });
        // Sort alphabetically, or apply custom sort order if defined elsewhere
        newSemanarioUI.ordenGruposComida = Array.from(uniqueMealGroups).sort();

        // --- 4.3 Populate semanarioDenormalizado.tabla ---
        const todayForDeadlineCheck = new Date(); // For checking request deadlines

        for (const diaStr of affectedPeriodDays) { // diaStr is 'YYYY-MM-DD'
          newSemanarioUI.tabla[diaStr] = {};
          const currentDate = parseISO(diaStr);
          const dayOfWeekKey = formatToDayOfWeekKey(currentDate); // 'lunes', 'martes', etc.

          for (const nombreGrupo of newSemanarioUI.ordenGruposComida) {
            // Initialize celda for this day and group
            let celda: CeldaSemanarioDenormalizado = {
              dia: diaStr,
              nombreGrupo: nombreGrupo,
              tiempoComidaId: null,
              alternativasDisponibles: [],
              tiempoComidaModId: null,
              alternativasModId: null, // Could be an array if multiple alt mods apply
              hayAlternativasAlteradas: false,
              nombreTiempoComida: null,
              alternativasRestringidasId: [],
              restriccionAlternativas: false,
              alternativaActividadInscritaId: null,
              hayActividadInscrita: false,
              actividadesDisponiblesId: [],
              actividadesDisponibles: false,
              ausenciaAplicableId: null,
              hayAusencia: false,
              eleccionSemanarioId: null,
              estadoCelda: 'normal',
              puedeElegir: true, // Assume true initially, conditions below will set to false
              eleccionActualId: null,
              eleccionActualAlternativaId: null,
            };

            // Find original TiempoComida for this cell based on dayOfWeekKey and nombreGrupo
            const originalTiempoComida = (residenciaTiemposComida || []).find(
              tc => tc.dia === dayOfWeekKey && tc.nombreGrupo === nombreGrupo
            );
            let effectiveTiempoComida: TiempoComida | null = originalTiempoComida ? { ...originalTiempoComida } : null;

            // 4.3.1 Apply TiempoComidaMod (TCM)
            const relevantTcm = (residenciaTiemposComidaMod || []).find(
              tcm => tcm.diaSemana === dayOfWeekKey && 
                     tcm.nombreGrupoAfectado === nombreGrupo &&
                     isDateAffected(currentDate, tcm.fechaAplicacion, tcm.fechaFinAplicacion)
            );

            if (relevantTcm) {
              celda.tiempoComidaModId = relevantTcm.id;
              celda.hayAlternativasAlteradas = true;
              if (relevantTcm.tipoAlteracion === 'eliminar') {
                effectiveTiempoComida = null;
                celda.estadoCelda = 'eliminada';
              } else if (relevantTcm.tipoAlteracion === 'agregar') {
                if (relevantTcm.tiempoAfectado) { console.error("Error: tiempoAfectado should be null for 'agregar' TCMod", relevantTcm); }
                effectiveTiempoComida = { // Create a synthetic TiempoComida based on the Mod
                  id: `mod-tc-${relevantTcm.id}`, // Synthetic ID
                  nombre: relevantTcm.nombre || `Comida Agregada (${nombreGrupo})`,
                  nombreGrupo: relevantTcm.nombreGrupo || nombreGrupo, // Use mod's group or fallback
                  dia: dayOfWeekKey,
                  isActive: true, // Assuming active if added
                  // Populate other essential TiempoComida fields if available from TCM or default
                } as TiempoComida;
                celda.estadoCelda = 'nueva';
              } else if (relevantTcm.tipoAlteracion === 'modificar') {
                if (effectiveTiempoComida) {
                  if (relevantTcm.nombre) effectiveTiempoComida.nombre = relevantTcm.nombre;
                  // Potentially modify other TC properties if TCM allows
                } else {
                  // This case (modifying a non-existent TC) might need specific handling or be an error.
                  // Or, it could imply adding if originalTiempoComida was null.
                  // For now, assume it modifies an existing one.
                }
                celda.estadoCelda = 'modificada';
              }
            }
            celda.tiempoComidaId = effectiveTiempoComida ? effectiveTiempoComida.id : null;
            celda.nombreTiempoComida = effectiveTiempoComida ? effectiveTiempoComida.nombre : null;
            if(celda.estadoCelda === 'eliminada' && originalTiempoComida) {
                 celda.nombreTiempoComida = originalTiempoComida.nombre; // Keep original name for reference if eliminated
            }


            // 4.3.2 AlternativasDisponibles (considering AlternativaTiempoComidaMod - ATCM)
            if (effectiveTiempoComida) {
              // Start with alternatives of the original TC if not a brand new 'added' TC
              // If effectiveTiempoComida is new (mod-tc-...), it won't have pre-existing alternatives from residenciaAlternativas.
              let baseAlternativas: AlternativaTiempoComida[] = [];
              if (originalTiempoComida && !effectiveTiempoComida.id.startsWith('mod-tc-')) {
                  baseAlternativas = (residenciaAlternativas || [])
                    .filter(alt => alt.tiempoComidaId === originalTiempoComida.id) // Link to original TC for modifications
                    .map(alt => ({ ...alt })); // Clone
              } else if (effectiveTiempoComida.id.startsWith('mod-tc-') && relevantTcm && relevantTcm.alternativasPredeterminadas) {
                  // If it's a new TC added by mod, and it specifies default alternatives
                  baseAlternativas = relevantTcm.alternativasPredeterminadas.map(altData => ({
                      id: `mod-alt-${Math.random().toString(36).substr(2, 9)}`, // Synthetic ID
                      tiempoComidaId: effectiveTiempoComida!.id, // Link to the new TC
                      ...altData, // nombre, descripcion etc from alternativasPredeterminadas
                      isActive: true,
                  } as AlternativaTiempoComida));
              }


              const relevantAtcms = (residenciaAlternativasMod || []).filter(
                altm => altm.diaSemana === dayOfWeekKey &&
                        altm.tiempoComidaAfectado === (originalTiempoComida?.id || effectiveTiempoComida?.id) && // Compare with original TC for ATCM context
                        isDateAffected(currentDate, altm.fechaAplicacion, altm.fechaFinAplicacion)
              );

              relevantAtcms.forEach(altm => {
                celda.hayAlternativasAlteradas = true;
                // Storing one ID, but logic might need to handle multiple ATCMs affecting same cell
                celda.alternativasModId = altm.id; 

                if (altm.tipoAlteracion === 'eliminar') {
                  if (!altm.alternativaAfectada) { console.error("Error: alternativaAfectada is null for 'eliminar' ATCM", altm); return; }
                  baseAlternativas = baseAlternativas.filter(alt => alt.id !== altm.alternativaAfectada);
                } else if (altm.tipoAlteracion === 'agregar') {
                  if (altm.alternativaAfectada) { console.error("Error: alternativaAfectada should not be null for 'agregar' ATCM", altm); }
                  baseAlternativas.push({ // Create a synthetic AlternativaTiempoComida
                    id: `mod-alt-${altm.id}`, // Synthetic ID
                    tiempoComidaId: effectiveTiempoComida!.id, // Link to current effective TC
                    nombre: altm.nombre || 'Alternativa Agregada',
                    descripcion: altm.descripcion,
                    // Populate other fields from altm or default
                    isActive: true,
                    esNueva: true, // Custom flag
                  } as AlternativaTiempoComida & { esNueva?: boolean });
                } else if (altm.tipoAlteracion === 'modificar') {
                  if (!altm.alternativaAfectada) { console.error("Error: alternativaAfectada is null for 'modificar' ATCM", altm); return; }
                  const altIndex = baseAlternativas.findIndex(alt => alt.id === altm.alternativaAfectada);
                  if (altIndex > -1) {
                    if(altm.nombre) baseAlternativas[altIndex].nombre = altm.nombre;
                    if(altm.descripcion) baseAlternativas[altIndex].descripcion = altm.descripcion;
                    // Mark as modified
                    (baseAlternativas[altIndex] as AlternativaTiempoComida & { esModificada?: boolean }).esModificada = true;
                  }
                }
              });
              celda.alternativasDisponibles = baseAlternativas;
            } else { // No effective TiempoComida (e.g., eliminated)
              celda.alternativasDisponibles = [];
            }
            if (celda.tiempoComidaId === null) celda.puedeElegir = false; // Cannot choose if TC is gone

            // 4.3.5 alternativasRestringidasId, restriccionAlternativas
            if (selectedUserMealPermissions && selectedUserMealPermissions.restriccionAlternativas === true) {
              celda.restriccionAlternativas = true;
              celda.alternativasRestringidasId = (selectedUserMealPermissions.alternativasRestringidas || [])
                .filter(restrictedAltId => celda.alternativasDisponibles.some(availAlt => availAlt.id === restrictedAltId));
              // Filter out restricted alternatives from selection, or handle in UI
              // For 'puedeElegir', if all available alternatives are restricted, then puedeElegir = false for the cell.
              // This sub-logic can be complex. For now, just flagging them.
            }

            // --- Determine cell's state based on user data ---
            const originalTcIdForLookup = originalTiempoComida?.id || (effectiveTiempoComida?.id.startsWith('mod-tc-') ? null : effectiveTiempoComida?.id);

            // 4.3.6 Actividad Inscrita
            if (originalTcIdForLookup) {
                for (const inscripcion of (userInscripciones || [])) {
                    const actividad = (residenciaActividadesParaResidentes || []).find(a => a.id === inscripcion.actividadId);
                    if (actividad) {
                        const actividadInicio = parseISO(actividad.fechaInicio as string);
                        const actividadFin = parseISO(actividad.fechaFin as string);
                        // Check if current cell's date is within activity's date range
                        if (isWithinInterval(currentDate, { start: actividadInicio, end: actividadFin })) {
                            // More specific check: if this TiempoComida is covered by the activity's meal rules
                            // This might involve checking actividad.ultimoTiempoComidaAntes / primerTiempoComidaDespues
                            // For simplicity: if the activity has a specific alternative for this day/TC.
                            const tcaua = (residenciaAlternativasActividades || []).find(
                                t => t.actividadId === actividad.id && 
                                format(t.fecha.toDate(), 'yyyy-MM-dd') === diaStr && // Ensure TCAUA is for this specific day
                                t.tiempoComidaOriginalId === originalTcIdForLookup // And this specific TiempoComida
                            );
                            if (tcaua) {
                                celda.alternativaActividadInscritaId = tcaua.alternativaUnicaId; // This is the ID of the AlternativaTiempoComida
                                celda.hayActividadInscrita = true;
                                celda.puedeElegir = false; // Activity dictates the meal
                                break; 
                            } else if (actividad.afectaComidasDefault) { // General flag if activity overrides meals without specific TCAUA
                                celda.hayActividadInscrita = true;
                                celda.puedeElegir = false; // Activity dictates, but no specific alternative, implies "no meal" or "special meal"
                                break;
                            }
                        }
                    }
                }
            }

            // 4.3.7 Actividades Disponibles (not inscribed)
            if (originalTcIdForLookup && celda.puedeElegir) { // Only if user can still choose & TC exists
                 (residenciaActividadesParaResidentes || []).forEach(actividad => {
                    const isUserInscribed = (userInscripciones || []).some(ins => ins.actividadId === actividad.id);
                    if (!isUserInscribed) {
                        const actividadInicio = parseISO(actividad.fechaInicio as string);
                        const actividadFin = parseISO(actividad.fechaFin as string);
                        if (isWithinInterval(currentDate, { start: actividadInicio, end: actividadFin })) {
                            // Check if this activity *could* affect this meal (e.g. has a TCAUA for it)
                             const tcauaForThisActivity = (residenciaAlternativasActividades || []).find(
                                t => t.actividadId === actividad.id && 
                                format(t.fecha.toDate(), 'yyyy-MM-dd') === diaStr &&
                                t.tiempoComidaOriginalId === originalTcIdForLookup
                            );
                            if (tcauaForThisActivity) { // If activity offers an alternative for this meal
                                celda.actividadesDisponiblesId.push(actividad.id);
                            } else if (actividad.afectaComidasDefault && actividad.permiteInscripcionLibreComidas) {
                                // If activity generally affects meals and allows sign-up that might provide a meal
                                celda.actividadesDisponiblesId.push(actividad.id);
                            }
                        }
                    }
                });
                if (celda.actividadesDisponiblesId.length > 0) celda.actividadesDisponibles = true;
            }

            // 4.3.8 Ausencia Aplicable
            if (originalTcIdForLookup && celda.puedeElegir) {
                for (const ausencia of (userAusencias || [])) {
                    const ausenciaInicio = ausencia.fechaInicio instanceof Timestamp ? ausencia.fechaInicio.toDate() : parseISO(ausencia.fechaInicio as string);
                    const ausenciaFin = ausencia.fechaFin instanceof Timestamp ? ausencia.fechaFin.toDate() : parseISO(ausencia.fechaFin as string);

                    if (isWithinInterval(currentDate, { start: ausenciaInicio, end: ausenciaFin })) {
                        // Check if this specific TiempoComida is covered by the ausencia's TC range
                        let tcCoveredByAusencia = false;
                        if (ausencia.primerTiempoComidaId && ausencia.ultimoTiempoComidaId) {
                            // This requires a way to order TCs within a day/week to check "betweenness"
                            // For simplicity now, assume if day matches, and TC range exists, it applies.
                            // A more robust check would involve comparing originalTcIdForLookup against the sequence.
                            // If this TC is between primer and ultimo (inclusive of day and TC sequence)
                            if(originalTcIdForLookup === ausencia.primerTiempoComidaId || originalTcIdForLookup === ausencia.ultimoTiempoComidaId) {
                                tcCoveredByAusencia = true;
                            } else {
                                    // Simplified: if the ausencia spans the whole day or multiple days covering this one,
                                    // and this TC is not specifically excluded by the ausencia's TC range.
                                    // A more robust check would involve:
                                    // 1. Getting all TCs for 'diaStr' in their correct order.
                                    // 2. Finding index of 'originalTcIdForLookup', 'ausencia.primerTiempoComidaId', 'ausencia.ultimoTiempoComidaId'.
                                    // 3. Checking if current TC's index is between primer and ultimo's indices.
                                    // For now, if an ausencia covers the day and has TC ranges, we assume precise matching would be complex here.
                                    // If no TC range specified in ausencia, it applies to all TCs on that day.
                                    tcCoveredByAusencia = true; // Simplified: if day matches, it's covered.
                                }
                            } else { // No specific TC range in ausencia, so it applies to all TCs on the day.
                                tcCoveredByAusencia = true;
                            }

                            if (tcCoveredByAusencia) {
                                celda.ausenciaAplicableId = ausencia.id;
                                celda.hayAusencia = true;
                                celda.puedeElegir = false; // User is absent
                                break; // Found an applicable ausencia
                            }
                        }
                    }
                }
            }

            // 4.3.9 EleccionSemanarioId (from userSemanario.elecciones map)
            // This refers to the *standing* weekly choice from the Semanario document.
            if (originalTcIdForLookup && userSemanario && userSemanario.elecciones && userSemanario.elecciones[originalTcIdForLookup]) {
              celda.eleccionSemanarioId = userSemanario.elecciones[originalTcIdForLookup]; // This ID is an AlternativaTiempoComida ID
            }

            // EleccionActual (from userElecciones collection for the specific date)
            // This overrides semanario choice for the specific day.
            if (originalTcIdForLookup && celda.puedeElegir) { // Check puedeElegir again, as ausencia might have changed it
                const eleccionDelDia = (userElecciones || []).find(
                    el => format(el.fecha.toDate(), 'yyyy-MM-dd') === diaStr && el.tiempoComidaId === originalTcIdForLookup
                );
                if (eleccionDelDia) {
                    celda.eleccionActualId = eleccionDelDia.id;
                    celda.eleccionActualAlternativaId = eleccionDelDia.alternativaId;
                }
            } else if (originalTcIdForLookup && !celda.puedeElegir && celda.hayAusencia) {
                // If absent, ensure no 'eleccionActual' is shown as active, even if one exists in DB (it shouldn't ideally)
                celda.eleccionActualId = null;
                celda.eleccionActualAlternativaId = null;
            }


            // Final check on 'puedeElegir' based on HorarioSolicitudComida (deadlines)
            if (celda.puedeElegir && effectiveTiempoComida) {
                let deadlinePassed = false;
                const horariosParaEsteTC = (residenciaHorariosSolicitud || []).filter(hsc => {
                    // Check if this HSC applies to any of the *available* alternatives for the current *effective* TC
                    return celda.alternativasDisponibles.some(altDisp => hsc.alternativasAfectadas.includes(altDisp.id));
                });

                if (horariosParaEsteTC.length > 0) {
                    // If there are specific HSCs for the alternatives of this TC, check them.
                    // This logic assumes user must respect the *earliest* deadline if multiple HSCs apply.
                    // Or, it might be that *any* valid HSC window allows choice.
                    // For now, let's assume if *any* relevant HSC allows choosing, it's fine.
                    // A stricter interpretation would be: if *all* relevant HSC deadlines have passed.
                    
                    let atLeastOneHscAllowsChoice = false;
                    for (const hsc of horariosParaEsteTC) {
                        const hscDayKey = hsc.dia;
                        const hscTime = hsc.horaSolicitud; // "HH:mm"
                        
                        // Calculate the actual datetime of the deadline for this specific cell's date
                        // The HSC's dayKey refers to the day *of request*.
                        // The cell's 'currentDate' is the day *of consumption*.
                        
                        // Example: Meal on Wednesday. HSC is on Tuesday 18:00.
                        // todayForDeadlineCheck must be before Tuesday 18:00.
                        
                        // Find the date of the HSC deadline relative to the meal's date (currentDate)
                        let deadlineDate = dayOfWeekKeyToDate(hscDayKey, startOfWeek(currentDate, {locale: es, weekStartsOn:1} ));
                        
                        // If the HSC day is "after" the meal's day in the week (e.g. meal Mon, HSC Sun),
                        // then the HSC deadline refers to the *previous* week's Sunday.
                        const mealDayIndex = dayKeyToDateFnsNumber(dayOfWeekKey);
                        const hscDayIndex = dayKeyToDateFnsNumber(hscDayKey);

                        if (hscDayIndex > mealDayIndex) { // e.g. meal on Monday (1), HSC on Sunday (0, but we use 6 for end of week in logic)
                                                        // This means HSC is for previous week's Sunday to order for current week's Monday
                            deadlineDate = subWeeks(deadlineDate, 1);
                        }
                        // Adjust if an alternativa.iniciaDiaAnterior pushed the meal effectively earlier than the HSC's reference day
                        // This part gets complex if an Alt for a Monday meal (requested Sunday) has iniciaDiaAnterior (so prep is Sat night)
                        // For now, assuming HSC refers to the request time for the *named* day of the meal.

                        const [hours, minutes] = hscTime.split(':').map(Number);
                        const deadlineDateTime = new Date(deadlineDate.getFullYear(), deadlineDate.getMonth(), deadlineDate.getDate(), hours, minutes);

                        if (isBefore(todayForDeadlineCheck, deadlineDateTime)) {
                            atLeastOneHscAllowsChoice = true;
                            break; // Found a valid window
                        }
                    }
                    if (!atLeastOneHscAllowsChoice && horariosParaEsteTC.length > 0) { // if there were HSCs, but none allow choice now
                        deadlinePassed = true;
                    }

                } else if (celda.alternativasDisponibles.length > 0) {
                    // No specific HSC for the available alternatives of this TC.
                    // What's the default behavior? Assume can't choose, or use a global deadline?
                    // For now, if no HSC explicitly covers it, assume choice is not possible unless it's a default/always open meal.
                    // This might need a residence-level default deadline setting.
                    // console.warn(`No HorarioSolicitudComida found for TC ${effectiveTiempoComida.id} on ${diaStr} with available alternatives. Defaulting to 'puedeElegir=false'.`);
                    // deadlinePassed = true; // Or false if default is "open unless specified"
                }


                if (deadlinePassed) {
                    celda.puedeElegir = false;
                }
            }
            
            // If restricted and all available are restricted, then cannot choose.
            if (celda.restriccionAlternativas && celda.alternativasDisponibles.length > 0 &&
                celda.alternativasDisponibles.every(alt => celda.alternativasRestringidasId.includes(alt.id))) {
                celda.puedeElegir = false;
            }

            // Final safety: if no alternatives, cannot choose (unless it's an activity meal or ausencia)
            if (celda.alternativasDisponibles.length === 0 && !celda.hayActividadInscrita && !celda.hayAusencia) {
                celda.puedeElegir = false;
            }


            newSemanarioUI.tabla[diaStr][nombreGrupo] = celda;
          } // end for nombreGrupo
        } // end for diaStr

        // 4.4 After successful denormalization
        setSemanarioUI(newSemanarioUI); // Update context with the denormalized structure
        // console.log("InicializarDatos: Data denormalization finished. SemanarioUI updated in context.", newSemanarioUI);
        setIsDenormalizingData(false);

      } catch (error) {
        console.error("InicializarDatos: Error in fetchAndProcessData: ", error);
        setIsLoadingUserMealData(false);
        setIsDenormalizingData(false);
        // Consider setting an error state in the context if applicable
      }
    }; // End of fetchAndProcessData function

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
  const { isLoadingUserMealData: isLoadingDisplay, isDenormalizingData: isDenormalizingDisplay } = contextLogin;

  if (isLoadingDisplay) {
    return <div>Cargando datos de comidas del usuario...</div>; // Or use a proper loading component
  }
  if (isDenormalizingDisplay) {
    return <div>Procesando información del horario de comidas...</div>; // Or use a proper processing component
  }

  return null; // This component primarily handles data and context, not direct UI rendering of the schedule
};

export default InicializarDatos;
