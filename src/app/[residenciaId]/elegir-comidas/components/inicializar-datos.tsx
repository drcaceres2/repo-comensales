'use client';

import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useLoginC, useResidenciaC, useUserC } from '../page'; // Assuming useLoginC is exported from here correctly
import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  query,
  where,
  DocumentData,
  QueryDocumentSnapshot,
  Timestamp
} from 'firebase/firestore';

import {
  startOfWeek,
  endOfWeek,
  endOfDay, // Added for date calculations
  startOfDay, // Added for date calculations
  format,
  addWeeks,
  subDays,
  isBefore,
  isAfter,
  isEqual,
  parseISO,
  eachDayOfInterval,
} from 'date-fns';
import { 
  dayKeyToDateFnsNumber, dayOfWeekKeyToDate, 
  formatToDayOfWeekKey,
  formatoIsoCompletoDate, formatoIsoInicioSemanaString, formatoIsoFinalSemanaString, 
  fechaNormalizadaADate, 
  estaDentroFechas, comprararFechasSinHora, comparacionFechaSinHoraIntervalo
} from '@/lib/fechasResidencia';
import { es } from 'date-fns/locale'; // Spanish locale for ISO 8601 week (Monday first)

import {
  Residencia,
  UserProfile,
  TiempoComida,
  TiempoComidaId,
  AlternativaTiempoComida,
  AlternativaTiempoComidaId,
  HorarioSolicitudComida,
  HorarioSolicitudComidaId,
  TiempoComidaMod,
  TiempoComidaModId,
  AlternativaTiempoComidaMod,
  AlternativaTiempoComidaModId,
  AlteracionHorario,
  AlteracionHorarioId,
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
} from '@/../../shared/models/types';

// --- Main Component ---
const InicializarDatos: React.FC = () => {
  const contextLogin = useLoginC();
  const contextResidencia = useResidenciaC();
  const contextUser = useUserC();

  if (!contextLogin || !contextResidencia || !contextUser) {
    console.error("InicializarDatos: Context is not available.");
    // This component should not render or should show an error if context is missing.
    // Depending on how useLoginC is implemented, it might throw an error itself if context is undefined.
    return <div>Error: Contexto de comidas no disponible.</div>;
  }

  const {
    loggedUser,
    selectedUser,
    selectedUserMealPermissions,
    residencia,
    residenciaId,
    isLoadingLoggedUser,
    isLoadingSelectedUserData,
    isLoadingUserMealData,
    setIsLoadingUserMealData,
    isDenormalizingData, // Will be used later
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

  } = contextResidencia;
  const {
    // User-specific data and setters from context (will be used in Step 2)
    userSemanario, setUserSemanario,
    setUserElecciones,
    userAusencias, setUserAusencias,
    userInscripciones, setUserInscripciones,
    setUserComentarios,
    
    // Denormalized data structure for UI (will be used in Step 4)
     setSemanarioUI 
  } = contextUser;

  // State to ensure residence-wide data is fetched only once per residenceId change or if not present in context
  const [residenceDataFetchedForId, setResidenceDataFetchedForId] = useState<string | null>(null);

  useEffect(() => {
    console.log("InicializarDatos useEffect triggered");
    if (!db || isLoadingLoggedUser || isLoadingSelectedUserData || !residenciaId || !loggedUser || !selectedUser || !residencia) {
      console.log("InicializarDatos: Early exit - waiting for essential data", { dbReady: !!db, isLoadingLoggedUser, isLoadingSelectedUserData, residenciaId, loggedUserPresent: !!loggedUser, selectedUserPresent: !!selectedUser, residenciaPresent: !!residencia });
      return;
    }
    console.log("InicializarDatos: All essential data present, proceeding.");

    // Ensure flags are managed correctly
    // If we are about to fetch, set loading to true. Denormalizing is false until fetch is done.
    setIsLoadingUserMealData(true);
    setIsDenormalizingData(false); 

    const fetchAndProcessData = async () => {
      console.log("InicializarDatos: fetchAndProcessData started.");
      try {
        // --- Step 1: Fetch / Prepare Residence-Wide Data ---
        let currentAffectedPeriodStart: Date;
        let currentAffectedPeriodEnd: Date;
        
        const today = formatoIsoCompletoDate({fecha: new Date(),zonaHoraria: residencia.zonaHoraria}); // Use a stable 'today' for all calculations in this run
        if(!today){
          console.log("Error procesando la fecha actual de este dispositivo (inicializarDatos");
          return
        }

        // Check if base data for this residenciaId is already in context and fetched by this component instance
        const needsResidenceBaseFetch = residenceDataFetchedForId !== residenciaId ||
                                    !residenciaTiemposComida || residenciaTiemposComida.length === 0 ||
                                    !residenciaAlternativas || residenciaAlternativas.length === 0 ||
                                    !residenciaHorariosSolicitud || residenciaHorariosSolicitud.length === 0;

        let localTiemposComida = residenciaTiemposComida || [];
        let localAlternativas = residenciaAlternativas || [];
        let localHorariosSolicitud = residenciaHorariosSolicitud || [];

        if (needsResidenceBaseFetch) {
          console.log(`InicializarDatos: Fetching residence-wide base data for ${residenciaId}`);
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
          console.log("InicializarDatos: Residence-wide base data fetched and set to context.");
        } else {
          console.log(`InicializarDatos: Using residence-wide base data from context for ${residenciaId}.`);
        }

        // 1.2 Calculate affected period - Start with current week (Mon-Sun)
        const currentAffectedPeriodStartString = formatoIsoInicioSemanaString({fecha: today, zonaHoraria: residencia.zonaHoraria});
        const currentAffectedPeriodEndString = formatoIsoFinalSemanaString({fecha: today, zonaHoraria: residencia.zonaHoraria});
        if( !currentAffectedPeriodStartString || !currentAffectedPeriodEndString ) {
          console.log("Problemas para calcular la fecha de hoy (fetchAndProcessData:InicializarDatos)");
          return;
        } 
        currentAffectedPeriodStart = fechaNormalizadaADate(currentAffectedPeriodStartString); // Monday
        currentAffectedPeriodEnd = fechaNormalizadaADate(currentAffectedPeriodEndString);   // Sunday
        console.log(`InicializarDatos: Initial affected period: ${format(currentAffectedPeriodStart, 'yyyy-MM-dd')} to ${format(currentAffectedPeriodEnd, 'yyyy-MM-dd')}`);

        // 1.2.1 Extend affected period based on HorarioSolicitudComida and AlternativaTiempoComida
        localHorariosSolicitud.forEach(hsc => {
          const hscTimeParts = hsc.horaSolicitud.split(':').map(Number); // HH:mm
          // Create a date for HSC based on its dayKey within the *current* week to establish a baseline
          const hscBaseDateCurrentWeek = dayOfWeekKeyToDate(hsc.dia, currentAffectedPeriodStart);
          const hscDateTimeCurrentWeek = new Date(hscBaseDateCurrentWeek.getFullYear(), hscBaseDateCurrentWeek.getMonth(), hscBaseDateCurrentWeek.getDate(), hscTimeParts[0], hscTimeParts[1]);
          const alternativasAfectadas = localAlternativas.filter(alt => alt.horarioSolicitudComidaId === hsc.id)

          alternativasAfectadas.forEach(altId => {
            const tiempoComida = localTiemposComida.find(tc => tc.id === altId.tiempoComidaId);
            if (!tiempoComida || !tiempoComida.dia) return;

            const altVentanaParts = altId.ventanaInicio.split(':').map(Number); // HH:mm
            
            // Determine the date for the TiempoComida this Alternativa refers to.
            // It could be in the current week or next week relative to the HSC time.
            let tcDate = dayOfWeekKeyToDate(tiempoComida.dia, currentAffectedPeriodStart); // Assume current week first
            let tcDateTime = new Date(tcDate.getFullYear(), tcDate.getMonth(), tcDate.getDate(), altVentanaParts[0], altVentanaParts[1]);

            if (altId.iniciaDiaAnterior) { // If it starts on a previous day (e.g. Monday breakfast prep starts Sunday night)
              tcDateTime = subDays(tcDateTime, 1);
            }

            // If the TC's effective time is before or same day but earlier time than HSC time (in current week context), it must be for next week.
            if (isBefore(tcDateTime, hscDateTimeCurrentWeek) || (isEqual(startOfDay(tcDateTime), startOfDay(hscDateTimeCurrentWeek)) && altId.ventanaInicio < hsc.horaSolicitud )) {
                 // This TC is for the *next* week
                const tcDateNextWeek = dayOfWeekKeyToDate(tiempoComida.dia, addWeeks(currentAffectedPeriodStart,1));
                let tcDateTimeNextWeek = new Date(tcDateNextWeek.getFullYear(), tcDateNextWeek.getMonth(), tcDateNextWeek.getDate(), altVentanaParts[0], altVentanaParts[1]);
                 if (altId.iniciaDiaAnterior) {
                    tcDateTimeNextWeek = subDays(tcDateTimeNextWeek, 1);
                }
                tcDateTime = tcDateTimeNextWeek; // This is the one we care about
            }
            
            // If this meal's date (potentially next week) is after the current end of affected period, extend.
            // We care about the day of the TiempoComida itself, not necessarily the ventanaInicio if it crosses midnight.
            const actualMealDay = dayOfWeekKeyToDate(tiempoComida.dia, startOfWeek(tcDateTime, {locale: es, weekStartsOn: 1}));

            if (isAfter(endOfDay(actualMealDay), currentAffectedPeriodEnd)) {
              currentAffectedPeriodEnd = endOfDay(actualMealDay);
              console.log(`Extended affectedPeriodEnd to ${format(currentAffectedPeriodEnd, 'yyyy-MM-dd')} due to HSC/Alt next week logic for TC ${tiempoComida.id}`);
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
                console.log(`Extended affectedPeriodStart to ${format(currentAffectedPeriodStart, 'yyyy-MM-dd')} due to 'iniciaDiaAnterior' on Monday`);
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
        console.log(`InicializarDatos: Final calculated affected period: ${format(finalAffectedPeriod.start, 'yyyy-MM-dd')} to ${format(finalAffectedPeriod.end, 'yyyy-MM-dd')}`);

        // 1.3 Fetch *Mod and AlteracionHorario data. Filter client-side by affected period.
        // These are fetched every time as their relevance depends on the calculated 'finalAffectedPeriod' which can change.
        const tcmQuery = query(collection(db, 'residencias', residenciaId, 'tiemposComidaMod'));
        const altcmQuery = query(collection(db, 'residencias', residenciaId, 'alternativasTiempoComidaMod'));
        const ahQuery = query(collection(db, 'residencias', residenciaId, 'alteracionesHorario'));

        const [tcmSnap, altcmSnap, ahSnap] = await Promise.all([
            getDocs(tcmQuery), getDocs(altcmQuery), getDocs(ahQuery)
        ]);

        const alteracionesHorarioData = ahSnap.docs.map(d => ({ id: d.id, ...d.data() } as AlteracionHorario))
             .filter(alt => estaDentroFechas(finalAffectedPeriod.start, alt.fechaInicio, alt.fechaFin, residencia.zonaHoraria) ||
                            estaDentroFechas(finalAffectedPeriod.end, alt.fechaInicio, alt.fechaFin, residencia.zonaHoraria) ||
                            (alt.fechaInicio && estaDentroFechas(alt.fechaInicio, finalAffectedPeriod.start, finalAffectedPeriod.end, residencia.zonaHoraria))
             );

        // Get the IDs of the filtered alteracionesHorarioData
        const alteracionHorarioIds = alteracionesHorarioData.map(alt => alt.id);

        // Filter tiemposComidaModData based on alteracionHorarioIds
        const tiemposComidaModData: TiempoComidaMod[] = tcmSnap.docs
            .map(d => ({ id: d.id, ...d.data() } as TiempoComidaMod))
            .filter(tcm => alteracionHorarioIds.includes(tcm.alteracionId));

        // Get the IDs of the filtered tiemposComidaModData
        const tiempoComidaModIds = tiemposComidaModData.map(tcm => tcm.id);

        // Filter alternativasModData based on tiempoComidaModIds
        const alternativasModData: AlternativaTiempoComidaMod[] = altcmSnap.docs
            .map(d => ({ id: d.id, ...d.data() } as AlternativaTiempoComidaMod))
            .filter(altcm => tiempoComidaModIds.includes(altcm.tiempoComidaModId));
         
        setResidenciaTiemposComidaMod(tiemposComidaModData);
        setResidenciaAlternativasMod(alternativasModData);
        setResidenciaAlteracionesHorario(alteracionesHorarioData);
        console.log("InicializarDatos: Mods and Alteraciones fetched and filtered for affected period.");

        // 1.4 Fetch Actividad[]
        // Query for activities that *overlap* with the finalAffectedPeriod.
        // An activity overlaps if (ActStart <= PeriodEnd) and (ActEnd >= PeriodStart)
        const actividadesBaseQuery = query(
          collection(db, 'residencias', residenciaId, 'actividades'),
          where('aceptaResidentes', '==', true),
          where('fechaFin', '>=', Timestamp.fromDate(finalAffectedPeriod.start)),
          where('fechaInicio', '<=', Timestamp.fromDate(finalAffectedPeriod.end)),
          where('estado', 'in', ['abierta_inscripcion', 'cerrada_inscripcion', 'confirmada_finalizada'])
        );
        const actividadesSnap = await getDocs(actividadesBaseQuery);
        let actividadesData = actividadesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Actividad));
        
        // 1.5 Fetch TiempoComidaAlternativaUnicaActividad[] within the period
        const tcauaQuery = query(collection(db, 'residencias', residenciaId, 'tiemposComidaAlternativaUnicaActividad'),
            where('fecha', '>=', Timestamp.fromDate(finalAffectedPeriod.start)),
            where('fecha', '<=', Timestamp.fromDate(finalAffectedPeriod.end))
        );
        const tcauaSnap = await getDocs(tcauaQuery);
        const tcauaData = tcauaSnap.docs.map(d => ({ id: d.id, ...d.data() } as TiempoComidaAlternativaUnicaActividad));

        // Add activities referenced by TCAUA if not already fetched
        const actividadIdsFromTCAUA = new Set(tcauaData.map(t => t.id).filter(id => id));
        const fetchedActividadIds = new Set(actividadesData.map(a => a.id));
        const missingActividadIds: string[] = [];
        actividadIdsFromTCAUA.forEach(id => {
          if (id && !fetchedActividadIds.has(id)) {
            missingActividadIds.push(id);
          }
        });

        if (missingActividadIds.length > 0) {
          // Handle 'in' query limit (max 10 items).
          // If missingActividadIds can be more than 10, you'll need to split it into chunks.
          // For now, assuming it's usually less than or equal to 10.
          const missingActivitiesQuery = query(
            collection(db, 'residencias', residenciaId, 'actividades'),
            where('id', 'in', missingActividadIds) // Query by document ID
          );
          const missingActivitiesSnap = await getDocs(missingActivitiesQuery);
          const missingActivitiesData = missingActivitiesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Actividad));

          // Combine the newly fetched activities with the initial set
          actividadesData = [...actividadesData, ...missingActivitiesData];
        }
        setResidenciaActividadesParaResidentes(actividadesData);
        setResidenciaAlternativasActividades(tcauaData);
        console.log("InicializarDatos: Actividades and TCAUA fetched for affected period.");

        // --- Step 2: Fetch User-Specific Data ---
        // This data is fetched every time selectedUser changes, as this whole useEffect reruns.
        console.log(`InicializarDatos: Fetching user-specific data for ${selectedUser.id} within period ${format(finalAffectedPeriod.start, 'yyyy-MM-dd')} to ${format(finalAffectedPeriod.end, 'yyyy-MM-dd')}`);
        const userId = selectedUser.id;

        // 2.1 Semanario object for this user and residenciaId
        const semanarioQuery = query(
          collection(db, 'users', userId, 'semanarios'),
          where('residenciaId', '==', residenciaId),
          // limit(2) // Limit to 2 to efficiently check if more than one exists
        );
        const semanarioSnap = await getDocs(semanarioQuery);
        let userSemanarioData: Semanario | null = null;

        if (semanarioSnap.size > 1) {
            // (2) More than one Semanario found, which is an error state.
            console.error(`Error de integridad de datos: El usuario ${userId} tiene ${semanarioSnap.size} documentos de Semanario para la residencia ${residenciaId}. Debería haber solo uno.`);
            // Optionally, throw an error to halt the process, as this is a critical issue.
            throw new Error("Múltiples documentos de Semanario encontrados para el usuario.");

        } else if (semanarioSnap.size === 1) {
            // (3) Exactly one Semanario found, proceed as normal.
            const doc = semanarioSnap.docs[0];
            userSemanarioData = { id: doc.id, ...doc.data() } as Semanario;
            console.log("User Semanario fetched: ", userSemanarioData);

        } else {
            // (1) No Semanario found, create one.
            console.log(`No se encontró Semanario para el usuario ${userId}. Creando uno nuevo...`);
            
            const nuevasElecciones: { [key: TiempoComidaId]: AlternativaTiempoComidaId | null } = {};
            
            // Filter for Tiempos de Comida that are part of the standard weekly schedule AND are active.
            const tiemposComidaOrdinariosActivos = (localTiemposComida || []).filter(
                tc => tc.aplicacionOrdinaria === true && tc.isActive === true
            );

            for (const tc of tiemposComidaOrdinariosActivos) {
                // Find the default (principal) AND active alternative for each TiempoComida.
                const principalAltActiva = (localAlternativas || []).find(
                    alt => alt.tiempoComidaId === tc.id && alt.esPrincipal === true && alt.isActive === true
                );
                
                if (principalAltActiva) {
                    nuevasElecciones[tc.id] = principalAltActiva.id;
                } else {
                    // If any standard, active meal time doesn't have a default, active alternative, it's a configuration error.
                    console.error(`Error de configuración: El Tiempo de Comida activo '${tc.nombre}' (ID: ${tc.id}) no tiene una Alternativa principal activa (esPrincipal: true, isActive: true). No se puede crear el Semanario por defecto.`);
                    throw new Error(`Error de configuración: Faltan alternativas principales activas para crear el horario semanal.`);
                }
            }

            const nuevoSemanario: Omit<Semanario, 'id'> = {
                userId: userId,
                residenciaId: residenciaId,
                elecciones: nuevasElecciones,
                ultimaActualizacion: Date.now(),
            };

            // Save the new Semanario to Firestore
            const newDocRef = await addDoc(collection(db, 'users', userId, 'semanarios'), nuevoSemanario);
            
            userSemanarioData = {
                id: newDocRef.id,
                ...nuevoSemanario
            };
            console.log("Nuevo Semanario creado y guardado: ", userSemanarioData);
        }
        
        // Set the found or newly created Semanario to the context
        setUserSemanario(userSemanarioData);

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
            const ausInicio = parseISO(aus.fechaInicio);
            const ausFin = parseISO(aus.fechaFin);
            // Check for overlap: (AusStart <= PeriodEnd) AND (AusEnd >= PeriodStart)
            return (isBefore(ausInicio, finalAffectedPeriod.end) || isEqual(ausInicio, finalAffectedPeriod.end)) &&
                   (isAfter(ausFin, finalAffectedPeriod.start) || isEqual(ausFin, finalAffectedPeriod.start));
          });

        setUserElecciones(eleccionesData);
        setUserAusencias(ausenciasData);
        console.log("User Elecciones fetched: ", eleccionesData.length);
        console.log("User Ausencias fetched and filtered: ", ausenciasData.length);

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
        console.log("User Inscripciones fetched: ", inscripcionesData.length);

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
        console.log("User Comentarios fetched: ", comentariosData.length);

        // --- Step 3: All Firestore document fetching are finished ---
        setIsLoadingUserMealData(false);
        console.log("InicializarDatos: All user and residence data fetched. isLoadingUserMealData set to false.");

        // --- Step 4: Denormalize Data ---
        console.log("InicializarDatos: Starting data denormalization.");
        setIsDenormalizingData(true);

        // 4.1 Initialize SemanarioDenormalizado object
        const affectedPeriodDays = eachDayOfInterval(finalAffectedPeriod).map(date => format(date, 'yyyy-MM-dd'));
        const newSemanarioUI: SemanarioDesnormalizado = {
          userId: selectedUser.id,
          residenciaId: residenciaId,
          semana: format(today, 'YYYY-Ww'),
          ordenGruposComida: [],
          tabla: {},
        };

        // 4.2 Determine complete list of meal groups and ordenGruposComida
        const mealGroupsMap = new Map<string, { nombreGrupo: string; ordenGrupo: number }>();
        // Process TiemposComida
        (residenciaTiemposComida || []).forEach(tc => {
                mealGroupsMap.set(tc.nombreGrupo, { nombreGrupo: tc.nombreGrupo, ordenGrupo: tc.ordenGrupo });
        });

        // Process TiemposComidaMod
        (residenciaTiemposComidaMod || []).forEach(tcm => {
            // Only add/update if both nombreGrupo and ordenGrupo are present in the modification.
            if (tcm.nombreGrupo && tcm.ordenGrupo) {
                mealGroupsMap.set(tcm.nombreGrupo, { nombreGrupo: tcm.nombreGrupo, ordenGrupo: tcm.ordenGrupo });
            }
        });

        // Convert the Map values to an array and sort it
        newSemanarioUI.ordenGruposComida = Array.from(mealGroupsMap.values()).sort((a, b) => {
            // Sort by ordenGrupo ascending
            if (a.ordenGrupo < b.ordenGrupo) {
                return -1;
            }
            if (a.ordenGrupo > b.ordenGrupo) {
                return 1;
            }
            // If ordenGrupo is the same, sort by nombreGrupo alphabetically for stable sorting
            return a.nombreGrupo.localeCompare(b.nombreGrupo);
        });

        // --- 4.3 Populate semanarioDesnormalizado.tabla ---
        // Initialize the tabla structure based on the new model { [nombreGrupo]: { [dia]: Celda } }
        for (const grupoInfo of newSemanarioUI.ordenGruposComida) {
          newSemanarioUI.tabla[grupoInfo.nombreGrupo] = {};
        }

        for (const diaStr of affectedPeriodDays) {    // diaStr is 'YYYY-MM-DD'
          const dayOfWeekKey = formatToDayOfWeekKey(today); // 'lunes', 'martes', etc.

          for (const grupoInfo of newSemanarioUI.ordenGruposComida) {
            const nombreGrupo = grupoInfo.nombreGrupo;

            // Initialize celda for this day and group according to the new interface
            let celda: CeldaSemanarioDesnormalizado = {
              tiempoComidaId: null,
              alternativasDisponiblesId: [],
              hayAlternativasAlteradas: false,
              tiempoComidaModId: null,
              alternativasModId: [],
              nombreTiempoComida: "", // Must be a string
              hayAlternativasRestringidas: false,
              alternativasRestringidasId: [],
              hayActividadInscrita: false,
              actividadesInscritasId: [],
              alternativasActividadInscritaId: [], // Array of TCAUA IDs
              hayActividadParaInscribirse: false,
              actividadesDisponiblesId: [],
              hayAusencia: false,
              ausenciaAplicableId: null,
              eleccionSemanarioId: null,
            };

            // Find original TiempoComida for this cell based on dayOfWeekKey and nombreGrupo
            const originalTiempoComida = (residenciaTiemposComida || []).find(
              tc => tc.dia === dayOfWeekKey && tc.nombreGrupo === nombreGrupo
            );
            celda.tiempoComidaId = originalTiempoComida ? originalTiempoComida.id : null;
            celda.nombreTiempoComida = originalTiempoComida ? originalTiempoComida.nombre : "";

            // --- 4.3.1 Apply TiempoComidaMod (TCM) ---
            const relevantTcm = (residenciaTiemposComidaMod || []).find(
              tcm => tcm.dia === dayOfWeekKey && tcm.nombreGrupo === nombreGrupo
            );
            let relevantAtcms: AlternativaTiempoComidaMod[] = [];
            if (relevantTcm) {
              celda.hayAlternativasAlteradas = true;
              celda.tiempoComidaModId = relevantTcm.id;
              if (relevantTcm.nombre) celda.nombreTiempoComida = relevantTcm.nombre;
              if (relevantTcm.tipoAlteracion === 'eliminar') {
                console.log("Por ahora no eliminaré los tiempos de comida eliminados vía TiempoComidaMod");
                //celda.tiempoComidaId = null;
              } else if (relevantTcm.tipoAlteracion === 'agregar') {
                if (originalTiempoComida) { console.error("Error: No debería haber TiempoComida correspondiente a un TCMod de tipo 'agregar'", relevantTcm); }
              } else if (relevantTcm.tipoAlteracion === 'modificar') {
                if (!originalTiempoComida || (relevantTcm.tiempoAfectado !== originalTiempoComida.id)) {
                  console.error("Error: TCMod tipo='modificar' sin referencia a ningún TC (InicializarDatos)", relevantTcm)
                }
              }
              relevantAtcms = (residenciaAlternativasMod || []).filter(
                altm => altm.tiempoComidaModId === relevantTcm.id
              );
              if (relevantAtcms.length > 0) 
                celda.alternativasModId = relevantAtcms.map(altm => altm.id); // Store all relevant ATCM IDs
            } else {
              celda.nombreTiempoComida = "No configurada"; // Default if no TC and no mod
            }

            // --- 4.3.2 AlternativasDisponiblesId (considering AlternativaTiempoComidaMod - ATCM) ---
            let currentAlternativas: AlternativaTiempoComida[] = [];
            if (originalTiempoComida) {
              // Start with alternatives of the original TC if TC is not brand new ('added' by TCM)
              currentAlternativas = (residenciaAlternativas || [])
                    .filter(alt => alt.tiempoComidaId === originalTiempoComida.id)
                    .map(alt => ({ ...alt })); // Clone
            };
            if(relevantAtcms.length > 0) {
              relevantAtcms.forEach(altm => {
                if (altm.tipoAlteracion === 'eliminar') {
                  if (!altm.alternativaAfectada) { console.error("Error: alternativaAfectada is null for 'eliminar' ATCM", altm); return; }
                  currentAlternativas = currentAlternativas.filter(alt => alt.id !== altm.alternativaAfectada);
                } else if (altm.tipoAlteracion === 'agregar') {
                  if (altm.alternativaAfectada) { console.error("Error: alternativaAfectada SHOULD BE null for 'agregar' ATCM", altm); }
                } else if (altm.tipoAlteracion === 'modificar') {
                  if (!altm.alternativaAfectada) { console.error("Error: alternativaAfectada is null for 'modificar' ATCM", altm); return; }
                }
              });
            }
            celda.alternativasDisponiblesId = currentAlternativas.map(alt => alt.id);
            // If effectiveTiempoComida is null (eliminated), alternativasDisponiblesId remains empty.

            // --- 4.3.5 alternativasRestringidasId, hayAlternativasRestringidas ---
            if (selectedUserMealPermissions && selectedUserMealPermissions.restriccionAlternativas === true && selectedUserMealPermissions.alternativasRestringidas) {
              const restrictedForUser = new Set(
                (selectedUserMealPermissions.alternativasRestringidas || [])
                  .map(detail => detail.alternativaRestringida)
              );
              celda.alternativasRestringidasId = celda.alternativasDisponiblesId.filter(
                availId => restrictedForUser.has(availId)
              );
              celda.hayAlternativasRestringidas = celda.alternativasRestringidasId.length > 0;
            }
            // ID for lookups in user data (Elecciones, Semanario, Actividades) should be the *original* TC ID
            // unless the TC was 'added' by a mod, in which case there's no original.
            // If TC was eliminated, originalTiempoComida.id is still used for checking related user data like inscriptions.

            // --- 4.3.6 Actividad Inscrita ---
            for (const inscripcion of (userInscripciones || [])) {
              const actividad = (residenciaActividadesParaResidentes || []).find(a => a.id === inscripcion.actividadId);
              if (actividad) {
                const comparacion = comparacionFechaSinHoraIntervalo(diaStr, actividad.fechaInicio, actividad.fechaFin, residencia.zonaHoraria);
                if (comparacion && comparacion !== 'anterior' && comparacion !== 'posterior') {
                  const relatedTcaua = actividad.planComidas.find(
                    tcaua => tcaua.nombreGrupoTiempoComida === nombreGrupo && comprararFechasSinHora(tcaua.fecha,diaStr,residencia.zonaHoraria) === 'igual'
                  );
                  if (relatedTcaua) {
                    celda.alternativasActividadInscritaId.push(relatedTcaua.id);
                  }
                  if (comparacion === 'dentro') {
                    celda.actividadesInscritasId.push(actividad.id);
                  } else if (comparacion === 'igual inicio') {
                    const ultimoTiempoComidaAntes = (residenciaTiemposComida as TiempoComida[]).find(
                      tc => tc.id === actividad.ultimoTiempoComidaAntes
                    );
                    if (!ultimoTiempoComidaAntes) {
                      console.warn("No se encontró definición del primer tiempo de comida de la actividad (InicializarDatos 4.3.6)");
                    } else {
                      if (grupoInfo.ordenGrupo>=ultimoTiempoComidaAntes.ordenGrupo) {
                        celda.actividadesInscritasId.push(actividad.id);
                      }
                    }
                  } else if (comparacion === 'igual final') {
                    const ultimoTiempoComidaDespues = (residenciaTiemposComida as TiempoComida[]).find(
                      tc => tc.id === actividad.primerTiempoComidaDespues
                    );
                    if (!ultimoTiempoComidaDespues) {
                      console.warn("No se encontró definición del último tiempo de comida de la actividad (InicializarDatos 4.3.6)");
                    } else {
                      if (grupoInfo.ordenGrupo<=ultimoTiempoComidaDespues.ordenGrupo) {
                        celda.actividadesInscritasId.push(actividad.id);
                      }
                    }
                  }
                }
              }
            }
            // Ensure uniqueness if multiple checks add same TCAUA ID (though filter above should handle it per TCAUA)
            celda.alternativasActividadInscritaId = [...new Set(celda.alternativasActividadInscritaId)];
            celda.actividadesInscritasId = [...new Set(celda.actividadesInscritasId)];
            


            // --- 4.3.7 Actividades Disponibles Para Inscribirse ---
            (residenciaActividadesParaResidentes || []).forEach(actividad => {
              const isUserInscribed = (userInscripciones || []).some(ins => ins.actividadId === actividad.id);
              if (!isUserInscribed) {
                const comparacion = comparacionFechaSinHoraIntervalo(diaStr, actividad.fechaInicio, actividad.fechaFin, residencia.zonaHoraria);
                if (comparacion && comparacion !== 'anterior' && comparacion !== 'posterior') {
                  if (comparacion === 'dentro') {
                    celda.actividadesDisponiblesId.push(actividad.id);
                  } else if (comparacion === 'igual inicio') {
                    const ultimoTiempoComidaAntes = (residenciaTiemposComida as TiempoComida[]).find(
                      tc => tc.id === actividad.ultimoTiempoComidaAntes
                    );
                    if (!ultimoTiempoComidaAntes) {
                      console.warn("No se encontró definición del primer tiempo de comida de la actividad (InicializarDatos 4.3.6)");
                    } else {
                      if (grupoInfo.ordenGrupo>=ultimoTiempoComidaAntes.ordenGrupo) {
                        celda.actividadesDisponiblesId.push(actividad.id);
                      }
                    }
                  } else if (comparacion === 'igual final') {
                    const ultimoTiempoComidaDespues = (residenciaTiemposComida as TiempoComida[]).find(
                      tc => tc.id === actividad.primerTiempoComidaDespues
                    );
                    if (!ultimoTiempoComidaDespues) {
                      console.warn("No se encontró definición del último tiempo de comida de la actividad (InicializarDatos 4.3.6)");
                    } else {
                      if (grupoInfo.ordenGrupo<=ultimoTiempoComidaDespues.ordenGrupo) {
                        celda.actividadesDisponiblesId.push(actividad.id);
                      }
                    }
                  }
                }
              }
            });
            if (celda.actividadesDisponiblesId.length > 0) {
              celda.hayActividadParaInscribirse = true;
              celda.actividadesDisponiblesId = [...new Set(celda.actividadesDisponiblesId)]; // Ensure unique
            }

            // --- 4.3.8 Ausencia Aplicable ---
            for (const ausencia of (userAusencias || [])) {
              const comparacion = comparacionFechaSinHoraIntervalo(diaStr, ausencia.fechaInicio, ausencia.fechaFin, residencia.zonaHoraria);
              if (comparacion && comparacion !== 'anterior' && comparacion !== 'posterior') {
                if (comparacion === 'dentro') {
                  celda.ausenciaAplicableId=ausencia.id!;
                } else if (comparacion === 'igual inicio') {
                  const ultimoTiempoComidaAntes = (residenciaTiemposComida as TiempoComida[]).find(
                    tc => tc.id === ausencia.ultimoTiempoComidaId
                  );
                  if (!ultimoTiempoComidaAntes) {
                    console.warn("No se encontró definición del primer tiempo de comida de la actividad (InicializarDatos 4.3.6)");
                  } else {
                    if (grupoInfo.ordenGrupo>=ultimoTiempoComidaAntes.ordenGrupo) {
                      celda.ausenciaAplicableId=ausencia.id!;
                    }
                  }
                } else if (comparacion === 'igual final') {
                  const ultimoTiempoComidaDespues = (residenciaTiemposComida as TiempoComida[]).find(
                    tc => tc.id === ausencia.primerTiempoComidaId
                  );
                  if (!ultimoTiempoComidaDespues) {
                    console.warn("No se encontró definición del último tiempo de comida de la actividad (InicializarDatos 4.3.6)");
                  } else {
                    if (grupoInfo.ordenGrupo<=ultimoTiempoComidaDespues.ordenGrupo) {
                      celda.ausenciaAplicableId=ausencia.id!;
                    }
                  }
                }
              }
            }

            // --- 4.3.9 EleccionSemanarioId ---
            // This refers to the standing weekly choice from the Semanario document.
            // It should be linked to the *original* TiempoComidaId.
            if (originalTiempoComida && userSemanario && userSemanario.elecciones[originalTiempoComida.id]) {
              celda.eleccionSemanarioId = userSemanario.elecciones[originalTiempoComida.id]; // This is an AlternativaTiempoComidaId
            }

            // Store the populated celda in the new table structure
            newSemanarioUI.tabla[nombreGrupo][diaStr] = celda;
          } // end for grupoInfo (nombreGrupo)
        } // end for diaStr

        // 4.4 After successful denormalization
        setSemanarioUI(newSemanarioUI); // Update context with the denormalized structure
        console.log("InicializarDatos: Data denormalization finished. SemanarioUI updated in context.", newSemanarioUI);
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
      console.log("InicializarDatos: useEffect cleanup.");
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
    residenciaTiemposComida,      // Added to re-evaluate if context changes externally
    residenciaAlternativas,       // though this component is the one setting them.
    residenciaHorariosSolicitud,  // More for the needsResidenceFetch logic.
    setResidenciaTiemposComida,
    setResidenciaAlternativas,
    setResidenciaHorariosSolicitud,
    setIsLoadingUserMealData,
    setIsDenormalizingData,
    // residenceDataFetchedForId // Internal state, not a dependency for triggering effect, but for logic within
  ]);

  // Determine if the loading card should be shown
  const showLoadingCard = isLoadingUserMealData || isDenormalizingData;

  if (showLoadingCard) {
    let loadingMessage = "Preparando tu horario...";
    let subMessage = "Un momento, estamos organizando las delicias... 🍳🥘🥗";

    if (isLoadingUserMealData) {
      loadingMessage = "Cargando tu horario de comidas...";
      subMessage = "Buscando los menús y tus elecciones...";
    } else if (isDenormalizingData) {
      loadingMessage = "Organizando la información...";
      subMessage = "Casi listo para mostrarte todo...";
    }

    return (
      <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center z-50 p-4">
        <div className="bg-card p-6 sm:p-8 rounded-lg shadow-xl text-card-foreground flex flex-col items-center max-w-md w-full">
          {/* 
            Replace "/placeholder-logo.svg" with the actual path to your app's logo.
            Adjust size and margin as needed.
          */}
          <img 
            src="https://firebasestorage.googleapis.com/v0/b/comensales-residencia.firebasestorage.app/o/public%2Flogo_web_app_1024x1024.jpg?alt=media&token=3d7a3f7c-71a1-403a-b858-bd0ec567dd10" 
            alt="Logo de la Aplicación" 
            className="h-12 w-12 sm:h-16 sm:w-16 mb-6" 
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; console.warn("Logo no encontrado en /placeholder-logo.svg"); }}
          />
          
          <Loader2 className="h-10 w-10 sm:h-12 sm:w-12 animate-spin text-primary mb-5" />
          
          <h3 className="text-lg sm:text-xl font-semibold text-center mb-2">
            {loadingMessage}
          </h3>
          
          <p className="text-xs sm:text-sm text-muted-foreground text-center">
            {subMessage}
          </p>
          
          {/* "Something cool" - animated dots */}
          <div className="flex space-x-1.5 mt-5">
            <span className="h-2.5 w-2.5 bg-primary rounded-full animate-bounce [animation-delay:-0.3s]"></span>
            <span className="h-2.5 w-2.5 bg-primary rounded-full animate-bounce [animation-delay:-0.15s]"></span>
            <span className="h-2.5 w-2.5 bg-primary rounded-full animate-bounce"></span>
          </div>
        </div>
      </div>
    );
  }

  return null; // This component primarily handles data and context, not direct UI rendering of the schedule itself
};

export default InicializarDatos;
