import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  query,
  where,
  Timestamp,
  Query,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  startOfWeek,
  endOfWeek,
  endOfDay,
  startOfDay,
  format,
  addWeeks,
  subDays,
  isBefore,
  isAfter,
  isEqual,
  parseISO,
  eachDayOfInterval,
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
    const { value: tiemposComidaData, loading: tiemposComidaLoading } = useCollectionSubscription<TiempoComida>(tiemposComidaQuery);

    const alternativasQuery = useMemo(() => 
        residenciaId ? query(collection(db, 'residencias', residenciaId, 'alternativasTiempoComida'), where('isActive', '==', true)) : null
    , [residenciaId]);
    const { value: alternativasData, loading: alternativasLoading } = useCollectionSubscription<AlternativaTiempoComida>(alternativasQuery);

    const horariosSolicitudQuery = useMemo(() => 
        residenciaId ? query(collection(db, 'residencias', residenciaId, 'horariosSolicitudComida'), where('isActive', '==', true)) : null
    , [residenciaId]);
    const { value: horariosSolicitudData, loading: horariosSolicitudLoading } = useCollectionSubscription<HorarioSolicitudComida>(horariosSolicitudQuery);

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

                // (The complex date range calculation logic from 'inicializar-datos' goes here)
                // This logic expands the week view if meals need to be chosen far in advance.
                // ... (omitted for brevity, but it's the same as in the original file)

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
                if (semanarioSnap.size === 1) {
                    userSemanarioData = { id: semanarioSnap.docs[0].id, ...semanarioSnap.docs[0].data() } as Semanario;
                } else {
                    // Create new Semanario logic here...
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
                const newSemanarioUI: SemanarioDesnormalizado = {
                    userId: userId,
                    residenciaId: residenciaId,
                    semana: formatoIsoInicioSemanaString({ fecha: finalAffectedPeriod.start, zonaHoraria: residencia.zonaHoraria }) || "",
                    ordenGruposComida: [],
                    tabla: {},
                };

                // Create a complete map of all alternatives by their ID for easy lookup
                const alternativasMap = new Map<AlternativaTiempoComidaId, AlternativaTiempoComida>(localAlternativas.map((alt: AlternativaTiempoComida) => [alt.id, alt]));

                // 3.1 Get unique meal groups and their order
                const mealGroups = new Map<string, number>();
                localTiemposComida.forEach((tc: TiempoComida) => {
                    if (!mealGroups.has(tc.nombreGrupo)) {
                        mealGroups.set(tc.nombreGrupo, tc.ordenGrupo);
                    }
                });
                // Also consider groups from modifications
                tiemposComidaModData.forEach(tcm => {
                    if (tcm.nombreGrupo && tcm.ordenGrupo !== null && tcm.ordenGrupo !== undefined && !mealGroups.has(tcm.nombreGrupo)) {
                        mealGroups.set(tcm.nombreGrupo, tcm.ordenGrupo);
                    }
                });

                newSemanarioUI.ordenGruposComida = Array.from(mealGroups.entries())
                    .map(([nombreGrupo, ordenGrupo]) => ({ nombreGrupo, ordenGrupo }))
                    .sort((a, b) => a.ordenGrupo - b.ordenGrupo);

                // Initialize the table structure
                newSemanarioUI.ordenGruposComida.forEach(group => {
                    newSemanarioUI.tabla[group.nombreGrupo] = {};
                });


                // 3.2 Iterate through each day of the affected period
                const daysInPeriod = eachDayOfInterval(finalAffectedPeriod);

                for (const day of daysInPeriod) {
                    const dayKey = formatToDayOfWeekKey(day);
                    if (!dayKey) continue;

                    const isoDateString = format(day, 'yyyy-MM-dd');

                    // Find if there's an alteration for this day
                    const alteracionDelDia = alteracionesHorarioData.find(ah =>
                       estaDentroFechas(isoDateString, ah.fechaInicio, ah.fechaFin, residencia.zonaHoraria)
                    );

                    let tiemposComidaDelDia: any[] = [];
                    const modsDelDia = alteracionDelDia
                        ? tiemposComidaModData.filter(tcm => tcm.alteracionId === alteracionDelDia.id)
                        : [];

                    if (alteracionDelDia) {
                        // Apply modifications
                        let baseTiempos = localTiemposComida.filter((tc: TiempoComida) => tc.dia === dayKey);

                        // 1. Remove/Modify existing
                        modsDelDia.forEach(mod => {
                            if (mod.tipoAlteracion === 'eliminar') {
                                baseTiempos = baseTiempos.filter((bt: TiempoComida) => bt.id !== mod.tiempoAfectado);
                            } else if (mod.tipoAlteracion === 'modificar') {
                                baseTiempos = baseTiempos.map((bt: any) => {
                                    if (bt.id === mod.tiempoAfectado) {
                                        return { ...bt, ...mod, id: bt.id, tiempoComidaModId: mod.id }; // Keep original ID, add mod info
                                    }
                                    return bt;
                                });
                            }
                        });
                        
                        // 2. Add new ones
                        const nuevosTiempos = modsDelDia
                            .filter(mod => mod.tipoAlteracion === 'agregar')
                            .map(mod => ({ ...mod, id: mod.id, esMod: true, tiempoComidaModId: mod.id })); // Use mod ID as the key

                        tiemposComidaDelDia = [...baseTiempos, ...nuevosTiempos];

                    } else {
                        // Regular day
                        tiemposComidaDelDia = localTiemposComida.filter((tc: TiempoComida) => tc.dia === dayKey);
                    }


                    // 3.3 Populate the UI object for each meal of the day
                    tiemposComidaDelDia.forEach((tc: any) => {
                        if (!tc.nombreGrupo) return;

                        const celda: CeldaSemanarioDesnormalizado = {
                            tiempoComidaId: tc.esMod ? null : tc.id,
                            alternativasDisponiblesId: [],
                            hayAlternativasAlteradas: !!alteracionDelDia,
                            tiempoComidaModId: tc.tiempoComidaModId || null,
                            alternativasModId: [], // Will populate below
                            nombreTiempoComida: tc.nombre,
                            hayAlternativasRestringidas: false,
                            alternativasRestringidasId: [],
                            hayActividadInscrita: false,
                            actividadesInscritasId: [],
                            alternativasActividadInscritaId: [],
                            hayActividadParaInscribirse: false,
                            actividadesDisponiblesId: [],
                            hayAusencia: false,
                            ausenciaAplicableId: null,
                            eleccionSemanarioId: userSemanarioData?.elecciones?.[tc.id] || null,
                        };
                        
                        // Find available alternatives
                        let altsParaEsteTiempo = localAlternativas.filter((alt: AlternativaTiempoComida) => alt.tiempoComidaId === (tc.esMod ? tc.tiempoAfectado : tc.id));
                        
                        // Apply alternative modifications if any
                        if (alteracionDelDia && tc.tiempoComidaModId) {
                            const altMods = alternativasModData.filter(am => am.tiempoComidaModId === tc.tiempoComidaModId);
                            celda.alternativasModId = altMods.map(am => am.id);

                             altMods.forEach(mod => {
                                if (mod.tipoAlteracion === 'eliminar') {
                                    altsParaEsteTiempo = altsParaEsteTiempo.filter((alt: AlternativaTiempoComida) => alt.id !== mod.alternativaAfectada);
                                } else if (mod.tipoAlteracion === 'modificar' && mod.alternativaAfectada) {
                                     altsParaEsteTiempo = altsParaEsteTiempo.map((alt: AlternativaTiempoComida) => {
                                        if (alt.id === mod.alternativaAfectada) {
                                            // A real implementation would merge fields, this is a simplification
                                            return { ...alt, nombre: mod.nombre || alt.nombre };
                                        }
                                        return alt;
                                    });
                                } // 'agregar' is complex and would require creating a new temporary alternative
                            });
                        }
                        celda.alternativasDisponiblesId = altsParaEsteTiempo.map((alt: any) => alt.id);


                        // Check restrictions
                        if (permissions?.restriccionAlternativas && permissions.alternativasRestringidas) {
                            const restrictedSet = new Set(permissions.alternativasRestringidas.map(ar => ar.alternativaRestringida));
                            const restrictedInCell = celda.alternativasDisponiblesId.filter(id => restrictedSet.has(id));
                            if (restrictedInCell.length > 0) {
                                celda.hayAlternativasRestringidas = true;
                                celda.alternativasRestringidasId = restrictedInCell;
                            }
                        }
                        
                        // Check for absences, inscribed activities, and available activities
                        const ausenciaActiva = ausenciasData.find(a => estaDentroFechas(isoDateString, a.fechaInicio, a.fechaFin, residencia.zonaHoraria));
                        if (ausenciaActiva) {
                            // More precise check needed here regarding first/last meal, but for now this is a good approximation
                            celda.hayAusencia = true;
                            celda.ausenciaAplicableId = ausenciaActiva.id;
                        }

                        const inscripcionesActivas = inscripcionesData.filter(i => {
                            const actividad = actividadesData.find(a => a.id === i.actividadId);
                            return actividad && estaDentroFechas(isoDateString, actividad.fechaInicio, actividad.fechaFin, residencia.zonaHoraria);
                        });

                        if (inscripcionesActivas.length > 0) {
                             celda.hayActividadInscrita = true;
                             celda.actividadesInscritasId = inscripcionesActivas.map(i => i.id);
                             // This part is complex: linking activity meal plan to the current `tc`
                             // For now, we just flag that an activity is happening.
                        }

                        const actividadesDisponibles = actividadesData.filter(a => {
                           const isEnrolled = inscripcionesData.some(i => i.actividadId === a.id);
                           const isOpen = a.estado === 'abierta_inscripcion';
                           return !isEnrolled && isOpen && estaDentroFechas(isoDateString, a.fechaInicio, a.fechaFin, residencia.zonaHoraria);
                        });

                        if (actividadesDisponibles.length > 0) {
                            celda.hayActividadParaInscribirse = true;
                            celda.actividadesDisponiblesId = actividadesDisponibles.map(a => a.id);
                        }


                        if (!newSemanarioUI.tabla[tc.nombreGrupo]) {
                            newSemanarioUI.tabla[tc.nombreGrupo] = {};
                        }
                         newSemanarioUI.tabla[tc.nombreGrupo][dayKey] = celda;
                    });
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

