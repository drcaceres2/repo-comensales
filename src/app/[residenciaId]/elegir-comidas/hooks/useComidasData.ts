import { useCollectionSubscription } from '@/hooks/useFirebaseData';
import {
  collection,
  doc,
  addDoc,
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


                // --- Step 3: Denormalization (UI Prep) ---
                const newSemanarioUI: SemanarioDesnormalizado = { /* ... */ };
                // The entire denormalization logic that builds the `SemanarioDesnormalizado` object.
                // This is the big loop over days and meal groups.
                // ... (logic omitted for brevity, it is the same as in `inicializar-datos`)

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

