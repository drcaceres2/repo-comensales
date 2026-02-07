import {
  collection,
  doc, addDoc, getDoc, getDocs,
  query, where,
  Timestamp
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  startOfWeek, endOfWeek, 
  startOfDay, endOfDay,
  addWeeks, subDays,
  isBefore, isAfter, isEqual,
  format, parseISO, eachDayOfInterval,
} from 'date-fns';
import { es } from 'date-fns/locale';
import {
  formatToDayOfWeekKey,
  formatoIsoCompletoDate,
  formatoIsoInicioSemanaString,
  formatoIsoFinalSemanaString,
  fechaNormalizadaADate,
  estaDentroFechas,
  dayOfWeekKeyToDate
} from '@/lib/fechasResidencia';
import {
  Residencia,
  TiempoComida,
  TiempoComidaId,
  AlternativaTiempoComida,
  AlternativaTiempoComidaId,
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
  CeldaSemanarioDesnormalizado,
  SemanarioDesnormalizado,
  UserProfile,
  PermisosComidaPorGrupo
} from '../../../../../shared/models/types';
import { useMemo, useState, useEffect } from 'react';
import { useCollectionSubscription, useDocumentSubscription } from '@/hooks/useDataSubscription';

interface ComidasData {
    semanarioUI: SemanarioDesnormalizado | null;
    userMealPermissions: PermisosComidaPorGrupo | null;
    loading: boolean;
    error: Error | null;
}

export function useComidasData(
    residencia: Residencia | null, 
    residenciaId: string, 
    selectedUser: UserProfile | null
): ComidasData {
    const [semanarioUI, setSemanarioUI] = useState<SemanarioDesnormalizado | null>(null);
    const [userMealPermissions, setUserMealPermissions] = useState<PermisosComidaPorGrupo | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);
    
    // --- Step 1: Residence Data Hooks ---
    const tiemposComidaQuery = useMemo(() => 
        residenciaId ? query(collection(db, 'residencias', residenciaId, 'tiemposComida'), where('activa', '==', true)) : null
    , [residenciaId]);
    const { data: tiemposComidaData, loading: tiemposComidaLoading } = useCollectionSubscription<TiempoComida>(tiemposComidaQuery);

    const alternativasQuery = useMemo(() => 
        residenciaId ? query(collection(db, 'residencias', residenciaId, 'alternativasTiempoComida'), where('isActive', '==', true)) : null
    , [residenciaId]);
    const { data: alternativasData, loading: alternativasLoading } = useCollectionSubscription<AlternativaTiempoComida>(alternativasQuery);

    const horariosSolicitudQuery = useMemo(() => 
        residenciaId ? query(collection(db, 'residencias', residenciaId, 'horariosSolicitudComida'), where('isActive', '==', true)) : null
    , [residenciaId]);
    const { data: horariosSolicitudData, loading: horariosSolicitudLoading } = useCollectionSubscription<HorarioSolicitudComida>(horariosSolicitudQuery);

    useEffect(() => {
        // Don't run if hooks are loading or essential data is missing
        if (!residencia || !residenciaId || !selectedUser || tiemposComidaLoading || alternativasLoading || horariosSolicitudLoading) {
            setLoading(true);
            return;
        }

        const fetchAndProcessData = async () => {
            setLoading(true);
            setError(null);
            
            try {
                // --- Step 0: Get User Meal Permissions ---
                const q1 = query(
                    collection(db, "usuariosGrupos"), 
                    where("residenciaId", "==", residenciaId), 
                    where('userId', '==', selectedUser.id)
                );
                const usuariosGruposSnapshot = await getDocs(q1);
                const gruposUsuarioIds: string[] = usuariosGruposSnapshot.docs.map(doc => doc.data().grupoUsuarioId);
                
                let permissions: PermisosComidaPorGrupo | null = null;
                if (gruposUsuarioIds.length > 0) {
                     const q2 = query(
                        collection(db, "gruposUsuarios"), 
                        where("residenciaId", "==", residenciaId), 
                        where('tipoGrupo', '==', 'eleccion-comidas'),
                        where('id', 'in', gruposUsuarioIds)
                    );
                    const gruposUsuarioSnapshot = await getDocs(q2);
                    const gruposUsuario = gruposUsuarioSnapshot.docs.map(doc => doc.data());

                    if (gruposUsuario.length === 1 && gruposUsuario[0].permisosComidaPorGrupoId) {
                        const permisosRef = doc(db, 'permisosComidaPorGrupo', gruposUsuario[0].permisosComidaPorGrupoId);
                        const docSnap = await getDoc(permisosRef);
                        if(docSnap.exists()) permissions = docSnap.data() as PermisosComidaPorGrupo;
                    }
                }
                setUserMealPermissions(permissions);


                // --- Step 1: Prepare Residence-Wide Data (Calculations) ---
                let localTiemposComida = tiemposComidaData || [];
                let localAlternativas = alternativasData || [];
                let localHorariosSolicitud = horariosSolicitudData || [];
                
                const today = formatoIsoCompletoDate({fecha: new Date(), zonaHoraria: residencia.zonaHoraria});
                if(!today) throw new Error("Could not determine today's date for the residence timezone.");

                let currentAffectedPeriodStart = startOfWeek(today, { locale: es, weekStartsOn: 1 });
                let currentAffectedPeriodEnd = endOfWeek(today, { locale: es, weekStartsOn: 1 });

                // 1.2.1 Extend affected period based on HorarioSolicitudComida and AlternativaTiempoComida
                localHorariosSolicitud.forEach(hsc => {
                  const hscTimeParts = hsc.horaSolicitud.split(':').map(Number);
                  const hscBaseDateCurrentWeek = dayOfWeekKeyToDate(hsc.dia, currentAffectedPeriodStart);
                  const hscDateTimeCurrentWeek = new Date(hscBaseDateCurrentWeek.getFullYear(), hscBaseDateCurrentWeek.getMonth(), hscBaseDateCurrentWeek.getDate(), hscTimeParts[0], hscTimeParts[1]);
                  const alternativasAfectadas = localAlternativas.filter(alt => alt.horarioSolicitudComidaId === hsc.id)

                  alternativasAfectadas.forEach(altId => {
                    const tiempoComida = localTiemposComida.find(tc => tc.id === altId.tiempoComidaId);
                    if (!tiempoComida || !tiempoComida.dia) return;

                    const altVentanaParts = altId.ventanaInicio.split(':').map(Number);
                    let tcDate = dayOfWeekKeyToDate(tiempoComida.dia, currentAffectedPeriodStart);
                    let tcDateTime = new Date(tcDate.getFullYear(), tcDate.getMonth(), tcDate.getDate(), altVentanaParts[0], altVentanaParts[1]);

                    if (altId.iniciaDiaAnterior) {
                      tcDateTime = subDays(tcDateTime, 1);
                    }

                    if (isBefore(tcDateTime, hscDateTimeCurrentWeek) || (isEqual(startOfDay(tcDateTime), startOfDay(hscDateTimeCurrentWeek)) && altId.ventanaInicio < hsc.horaSolicitud )) {
                        const tcDateNextWeek = dayOfWeekKeyToDate(tiempoComida.dia, addWeeks(currentAffectedPeriodStart,1));
                        let tcDateTimeNextWeek = new Date(tcDateNextWeek.getFullYear(), tcDateNextWeek.getMonth(), tcDateNextWeek.getDate(), altVentanaParts[0], altVentanaParts[1]);
                         if (altId.iniciaDiaAnterior) {
                            tcDateTimeNextWeek = subDays(tcDateTimeNextWeek, 1);
                        }
                        tcDateTime = tcDateTimeNextWeek;
                    }
                    
                    const actualMealDay = dayOfWeekKeyToDate(tiempoComida.dia, startOfWeek(tcDateTime, {locale: es, weekStartsOn: 1}));

                    if (isAfter(endOfDay(actualMealDay), currentAffectedPeriodEnd)) {
                      currentAffectedPeriodEnd = endOfDay(actualMealDay);
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
                      }
                    }
                  }
                });
                
                if(isAfter(currentAffectedPeriodStart, currentAffectedPeriodEnd)) {
                    currentAffectedPeriodEnd = endOfWeek(today, { locale: es, weekStartsOn: 1 });
                     if(isAfter(currentAffectedPeriodStart, currentAffectedPeriodEnd)) {
                        currentAffectedPeriodStart = startOfWeek(today, { locale: es, weekStartsOn: 1 });
                        currentAffectedPeriodEnd = endOfWeek(today, { locale: es, weekStartsOn:1 });
                     }
                }

                const finalAffectedPeriod = { start: currentAffectedPeriodStart, end: currentAffectedPeriodEnd };

                // 1.3 Fetch *Mod and AlteracionHorario data manually
                const tcmQuery = query(collection(db, 'residencias', residenciaId, 'tiemposComidaMod'));
                const altcmQuery = query(collection(db, 'residencias', residenciaId, 'alternativasTiempoComidaMod'));
                const ahQuery = query(collection(db, 'residencias', residenciaId, 'alteracionesHorario'));

                const [tcmSnap, altcmSnap, ahSnap] = await Promise.all([
                    getDocs(tcmQuery), getDocs(altcmQuery), getDocs(ahQuery)
                ]);

                // Filter them based on the calculated affected period
                // ... (filtering logic omitted for brevity)
                const tiemposComidaModData = tcmSnap.docs.map(d => ({ id: d.id, ...d.data() } as TiempoComidaMod));
                const alternativasModData = altcmSnap.docs.map(d => ({ id: d.id, ...d.data() } as AlternativaTiempoComidaMod));
                const alteracionesHorarioData = ahSnap.docs.map(d => ({ id: d.id, ...d.data() } as AlteracionHorario));


                // 1.4 Fetch Actividad[] & TiempoComidaAlternativaUnicaActividad[]
                // ... (fetching logic omitted for brevity)
                 const actividadesSnap = await getDocs(query(
                    collection(db, 'residencias', residenciaId, 'actividades'),
                    where('aceptaResidentes', '==', true),
                    where('fechaFin', '>=', Timestamp.fromDate(finalAffectedPeriod.start)),
                    where('fechaInicio', '<=', Timestamp.fromDate(finalAffectedPeriod.end))
                ));
                const actividadesData = actividadesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Actividad));
                const tcauaSnap = await getDocs(query(collection(db, 'residencias', residenciaId, 'tiemposComidaAlternativaUnicaActividad')));
                const tcauaData = tcauaSnap.docs.map(d => ({ id: d.id, ...d.data() } as TiempoComidaAlternativaUnicaActividad));


                // --- Step 2: Fetch User-Specific Data ---
                const userId = selectedUser.id;
                // ... (fetching for Semanario, Elecciones, Ausencias, Inscripciones, Comentarios)
                // This includes creating a new Semanario if one doesn't exist.
                // ... (logic omitted for brevity)
                let userSemanarioData: Semanario | null = null;
                const semanarioSnap = await getDocs(query(collection(db, 'users', userId, 'semanarios'), where('residenciaId', '==', residenciaId)));
                if (semanarioSnap.size > 1) {
                    console.error(`Error de integridad de datos: Múltiples semanarios para ${userId}`);
                     userSemanarioData = { id: semanarioSnap.docs[0].id, ...semanarioSnap.docs[0].data() } as Semanario;
                } else if (semanarioSnap.size === 1) {
                    userSemanarioData = { id: semanarioSnap.docs[0].id, ...semanarioSnap.docs[0].data() } as Semanario;
                } else {
                    // Create new Semanario
                    const nuevasElecciones: { [key: TiempoComidaId]: AlternativaTiempoComidaId | null } = {};
                    const tiemposComidaOrdinariosActivos = (localTiemposComida || []).filter(
                        tc => tc.aplicacionOrdinaria === true && tc.activa === true
                    );
                    for (const tc of tiemposComidaOrdinariosActivos) {
                        const principalAltActiva = (localAlternativas || []).find(
                            alt => alt.tiempoComidaId === tc.id && alt.esPrincipal === true && alt.isActive === true
                        );
                        if (principalAltActiva) {
                            nuevasElecciones[tc.id] = principalAltActiva.id;
                        }
                    }
                    const nuevoSemanario: Omit<Semanario, 'id'> = {
                        userId: userId,
                        residenciaId: residenciaId,
                        elecciones: nuevasElecciones,
                        ultimaActualizacion: Date.now(),
                    };
                    const newDocRef = await addDoc(collection(db, 'users', userId, 'semanarios'), nuevoSemanario);
                    userSemanarioData = { id: newDocRef.id, ...nuevoSemanario };
                }

                // Fetch Ausencias intersecting with the period
                const ausenciasQuery = query(
                    collection(db, 'users', userId, 'ausencias'),
                    where('residenciaId', '==', residenciaId),
                    where('fechaFin', '>=', format(finalAffectedPeriod.start, 'yyyy-MM-dd')),
                    where('fechaInicio', '<=', format(finalAffectedPeriod.end, 'yyyy-MM-dd'))
                );
                const ausenciasSnap = await getDocs(ausenciasQuery);
                const ausenciasData = ausenciasSnap.docs.map(d => ({ id: d.id, ...d.data() } as Ausencia));

                // Fetch Inscripciones
                const inscripcionesQuery = query(
                    collection(db, 'users', userId, 'inscripcionesActividad'),
                    where('residenciaId', '==', residenciaId)
                );
                const inscripcionesSnap = await getDocs(inscripcionesQuery);
                const inscripcionesData = inscripcionesSnap.docs.map(d => ({ id: d.id, ...d.data() } as InscripcionActividad));



                // --- Step 3: Denormalization (UI Prep) ---
                // --- Step 3: Denormalization (UI Prep) ---
                const affectedPeriodDays = eachDayOfInterval(finalAffectedPeriod).map(date => format(date, 'yyyy-MM-dd'));
                const newSemanarioUI: SemanarioDesnormalizado = {
                  userId: selectedUser.id,
                  residenciaId: residenciaId,
                  semana: format(today, 'YYYY-Ww'),
                  ordenGruposComida: [],
                  tabla: {},
                };

                const mealGroupsMap = new Map<string, { nombreGrupo: string; ordenGrupo: number }>();
                (localTiemposComida || []).forEach(tc => {
                        mealGroupsMap.set(tc.nombreGrupo, { nombreGrupo: tc.nombreGrupo, ordenGrupo: tc.ordenGrupo });
                });
                (tiemposComidaModData || []).forEach(tcm => {
                    if (tcm.nombreGrupo && tcm.ordenGrupo) {
                        mealGroupsMap.set(tcm.nombreGrupo, { nombreGrupo: tcm.nombreGrupo, ordenGrupo: tcm.ordenGrupo });
                    }
                });

                newSemanarioUI.ordenGruposComida = Array.from(mealGroupsMap.values()).sort((a, b) => {
                    if (a.ordenGrupo < b.ordenGrupo) return -1;
                    if (a.ordenGrupo > b.ordenGrupo) return 1;
                    return a.nombreGrupo.localeCompare(b.nombreGrupo);
                });

                for (const grupoInfo of newSemanarioUI.ordenGruposComida) {
                  newSemanarioUI.tabla[grupoInfo.nombreGrupo] = {};
                }

                for (const diaStr of affectedPeriodDays) { 
                  const dayOfWeekKey = formatToDayOfWeekKey(parseISO(diaStr)); 

                  for (const grupoInfo of newSemanarioUI.ordenGruposComida) {
                    const nombreGrupo = grupoInfo.nombreGrupo;
                    let celda: CeldaSemanarioDesnormalizado = {
                      tiempoComidaId: null,
                      alternativasDisponiblesId: [],
                      hayAlternativasAlteradas: false,
                      tiempoComidaModId: null,
                      alternativasModId: [],
                      nombreTiempoComida: "", 
                      hayAlternativasRestringidas: false,
                      alternativasRestringidasId: [],
                      hayActividadInscrita: false,
                      actividadesInscritasId: [],
                      alternativasActividadInscritaId: [], 
                      hayActividadParaInscribirse: false,
                      actividadesDisponiblesId: [],
                      hayAusencia: false,
                      ausenciaAplicableId: null,
                      eleccionSemanarioId: null,
                    };

                    const originalTiempoComida = (localTiemposComida || []).find(
                      tc => tc.dia === dayOfWeekKey && tc.nombreGrupo === nombreGrupo
                    );
                    celda.tiempoComidaId = originalTiempoComida ? originalTiempoComida.id : null;
                    celda.nombreTiempoComida = originalTiempoComida ? originalTiempoComida.nombre : "";

                    const relevantTcm = (tiemposComidaModData || []).find(
                      tcm => tcm.dia === dayOfWeekKey && tcm.nombreGrupo === nombreGrupo
                    );
                    let relevantAtcms: AlternativaTiempoComidaMod[] = [];
                    if (relevantTcm) {
                      celda.hayAlternativasAlteradas = true;
                      celda.tiempoComidaModId = relevantTcm.id;
                      if (relevantTcm.nombre) celda.nombreTiempoComida = relevantTcm.nombre;
                      relevantAtcms = (alternativasModData || []).filter(
                        altm => altm.tiempoComidaModId === relevantTcm.id
                      );
                      if (relevantAtcms.length > 0) 
                        celda.alternativasModId = relevantAtcms.map(altm => altm.id); 
                    } else {
                      if(!originalTiempoComida) celda.nombreTiempoComida = "No configurada"; 
                    }

                    let currentAlternativas: AlternativaTiempoComida[] = [];
                    if (originalTiempoComida) {
                      currentAlternativas = (localAlternativas || [])
                            .filter(alt => alt.tiempoComidaId === originalTiempoComida.id)
                            .map(alt => ({ ...alt })); 
                    };
                    if(relevantAtcms.length > 0) {
                      relevantAtcms.forEach(altm => {
                        if (altm.tipoAlteracion === 'eliminar') {
                          currentAlternativas = currentAlternativas.filter(alt => alt.id !== altm.alternativaAfectada);
                        }
                      });
                    }
                    celda.alternativasDisponiblesId = currentAlternativas.map(alt => alt.id);

                    if (permissions && permissions.restriccionAlternativas === true && permissions.alternativasRestringidas) {
                      const restrictedForUser = new Set(
                        (permissions.alternativasRestringidas || [])
                          .map(detail => detail.alternativaRestringida)
                      );
                      celda.alternativasRestringidasId = celda.alternativasDisponiblesId.filter(
                        availId => restrictedForUser.has(availId)
                      );
                      celda.hayAlternativasRestringidas = celda.alternativasRestringidasId.length > 0;
                    }

                    const ausenciaActiva = ausenciasData.find(a => estaDentroFechas(diaStr, a.fechaInicio, a.fechaFin, residencia.zonaHoraria));
                    if (ausenciaActiva) {
                        celda.hayAusencia = true;
                        celda.ausenciaAplicableId = ausenciaActiva.id;
                    }

                    const inscripcionesActivas = inscripcionesData.filter(i => {
                        const actividad = actividadesData.find(a => a.id === i.actividadId);
                        return actividad && estaDentroFechas(diaStr, actividad.fechaInicio, actividad.fechaFin, residencia.zonaHoraria);
                    });

                    if (inscripcionesActivas.length > 0) {
                         celda.hayActividadInscrita = true;
                         celda.actividadesInscritasId = inscripcionesActivas.map(i => i.id);
                    }

                    const actividadesDisponibles = actividadesData.filter(a => {
                       const isEnrolled = inscripcionesData.some(i => i.actividadId === a.id);
                       const isOpen = a.estado === 'abierta_inscripcion';
                       return !isEnrolled && isOpen && estaDentroFechas(diaStr, a.fechaInicio, a.fechaFin, residencia.zonaHoraria);
                    });

                    if (actividadesDisponibles.length > 0) {
                        celda.hayActividadParaInscribirse = true;
                        celda.actividadesDisponiblesId = actividadesDisponibles.map(a => a.id);
                    }

                    if (originalTiempoComida && userSemanarioData && userSemanarioData.elecciones[originalTiempoComida.id]) {
                      celda.eleccionSemanarioId = userSemanarioData.elecciones[originalTiempoComida.id]; 
                    }

                    newSemanarioUI.tabla[nombreGrupo][diaStr] = celda;
                  } 
                } 

                setSemanarioUI(newSemanarioUI);

            } catch (e: any) {
                console.error("Error in useComidasData:", e);
                setError(e);
            } finally {
                setLoading(false);
            }
        };

        fetchAndProcessData();

    }, [residencia, residenciaId, selectedUser, tiemposComidaData, alternativasData, horariosSolicitudData]);
    
    return { semanarioUI, userMealPermissions, loading, error };
}

