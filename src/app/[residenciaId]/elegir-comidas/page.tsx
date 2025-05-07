'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';

// UI Components
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card'; // Added CardDescription, CardFooter
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Menu, Sun, Moon, Palette, Home, AlertCircle, ExternalLink } from 'lucide-react'; // Added AlertCircle, ExternalLink
import { Separator } from '@/components/ui/separator';
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarIcon, Trash2, PlusCircle } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from 'lucide-react';
import { format, addDays, startOfWeek, endOfWeek } from "date-fns"; // Added addDays, startOfWeek
import { es } from 'date-fns/locale';

// Firebase and Model Imports
import { 
    Timestamp, 
    doc, 
    getDoc, 
    collection, 
    query, 
    where, 
    getDocs, 
    orderBy,
    limit // <<< ADD THIS
} from 'firebase/firestore';

import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { 
    Residencia, 
    ResidenciaId, 
    UserId, 
    ModoEleccionUsuario, 
    DayOfWeekKey, 
    TiempoComida, 
    AlternativaTiempoComida, 
    Semanario, 
    SemanarioAlternativaSeleccion,
    Ausencia, 
    AusenciaId, 
    TiempoComidaId, 
    AlternativaTiempoComidaId,
    Eleccion, 
    ExcepcionId, 
    UserProfile, 
    UserRole,
    HorarioSolicitudComida,
    Comentario
} from '@/models/firestore';


// Week data for Semanario
const daysOfWeek: DayOfWeekKey[] = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
const dayDisplayMap: Record<DayOfWeekKey, string> = {
  lunes: 'Lunes', martes: 'Martes', miercoles: 'Miércoles', jueves: 'Jueves',
  viernes: 'Viernes', sabado: 'Sábado', domingo: 'Domingo'
};


export default function ElegirComidasPage() {
  const params = useParams();
  const router = useRouter();
  const residenciaId = params.residenciaId as ResidenciaId;

  // --- Auth & Profile State ---
  const [authUser, isLoadingAuth, authError] = useAuthState(auth);
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);

  // --- Target User State ---
  const [targetUser, setTargetUser] = useState<UserProfile | null>(null);
  const [isAuthorizedToViewPage, setIsAuthorizedToViewPage] = useState(false);

  // --- Core Data State ---
  const [residenciaData, setResidenciaData] = useState<Residencia | null>(null);
  const [tiemposComidaList, setTiemposComidaList] = useState<TiempoComida[]>([]);
  const [alternativasList, setAlternativasList] = useState<AlternativaTiempoComida[]>([]);
  const [horariosSolicitudList, setHorariosSolicitudList] = useState<HorarioSolicitudComida[]>([]);
  const [isLoadingCoreData, setIsLoadingCoreData] = useState(true);
  const [coreDataError, setCoreDataError] = useState<string | null>(null);
  
  // --- Semanario, Elecciones, Ausencias, Comentarios State ---
  const [currentSemanario, setCurrentSemanario] = useState<Semanario | null>(null); // Renamed for clarity
  const [currentExcepciones, setCurrentExcepciones] = useState<Eleccion[]>([]); // Renamed for clarity
  const [currentAusencias, setCurrentAusencias] = useState<Ausencia[]>([]); // Renamed for clarity
  const [comentariosList, setComentariosList] = useState<Comentario[]>([]);
  const [isLoadingTargetSpecificData, setIsLoadingTargetSpecificData] = useState(false); // New loading state
  const [targetSpecificDataError, setTargetSpecificDataError] = useState<string | null>(null); // New error state


  // --- UI State ---
  const [isLoadingPage, setIsLoadingPage] = useState(true);
  const [pageAccessError, setPageAccessError] = useState<string | null>(null);
  const [editingSemanarioSlot, setEditingSemanarioSlot] = useState<{ day: DayOfWeekKey; tiempoComidaId: TiempoComidaId } | null>(null);
  const [selectedAlternativaForSlot, setSelectedAlternativaForSlot] = useState<AlternativaTiempoComidaId | null>(null);
  const [showAddExcepcionModal, setShowAddExcepcionModal] = useState(false);
  const [newExcepcionData, setNewExcepcionData] = useState<Partial<Eleccion>>({});
  const [showAddAusenciaModal, setShowAddAusenciaModal] = useState(false);
  const [newAusenciaData, setNewAusenciaData] = useState<Partial<Ausencia>>({});
  const [nuevoComentario, setNuevoComentario] = useState('');
  
  // --- Date Range for Semanario/Elecciones display ---
  const [currentDisplayWeekStart, setCurrentDisplayWeekStart] = useState<Date>(() => {
    const today = new Date();
    // By default, show next week. If today is Sun/Mon, "next week" starts on the upcoming Monday.
    // If it's later in the week, "next week" is the Monday after the upcoming Sunday.
    const currentDayOfWeek = today.getDay(); // 0 (Sun) to 6 (Sat)
    const daysUntilNextMonday = (currentDayOfWeek === 0 ? 1 : 8 - currentDayOfWeek);
    return startOfWeek(addDays(today, daysUntilNextMonday), { weekStartsOn: 1, locale: es });
  });


  // Effect to fetch UserProfile
  useEffect(() => {
    if (isLoadingAuth) { setIsLoadingProfile(true); return; }
    if (authError) { setProfileError(`Error de autenticación: ${authError.message}`); setIsLoadingProfile(false); setPageAccessError("Error de autenticación."); return; }
    if (!authUser) { setIsLoadingProfile(false); setPageAccessError("Por favor, inicia sesión para continuar."); return; }

    setIsLoadingProfile(true);
    const userDocRef = doc(db, "users", authUser.uid);
    getDoc(userDocRef)
      .then((docSnap) => {
        if (docSnap.exists()) {
          const profile = { id: docSnap.id, ...docSnap.data() } as UserProfile;
          setCurrentUserProfile(profile);
          if (profile.roles.includes('residente') && profile.residenciaId === residenciaId) {
            setTargetUser(profile);
            setIsAuthorizedToViewPage(true);
          } else if ((profile.roles.includes('director') || profile.roles.includes('admin') || profile.roles.includes('master')) && profile.residenciaId === residenciaId) {
            setIsAuthorizedToViewPage(true); // Target user will be selected via dropdown later
          } else if (profile.roles.includes('asistente') && profile.residenciaId === residenciaId && profile.asistentePermisos?.elecc_uids && profile.asistentePermisos.elecc_uids.length > 0) {
            setIsAuthorizedToViewPage(true); // Target user will be selected via dropdown later
          } else {
            setPageAccessError("No tienes permiso para acceder a esta página o gestionar comidas para esta residencia.");
            setIsAuthorizedToViewPage(false);
          }
        } else { setProfileError("Perfil de usuario no encontrado."); setPageAccessError("Perfil de usuario no encontrado."); }
      })
      .catch((error) => { console.error("Error fetching user profile:", error); setProfileError(`Error cargando tu perfil: ${error.message}`); setPageAccessError("Error cargando tu perfil."); })
      .finally(() => setIsLoadingProfile(false));
  }, [authUser, isLoadingAuth, authError, residenciaId, router]);

    // --- NEW: Effect to fetch Target User Specific Data (Semanario, Elecciones, Ausencias, Comentarios) ---
const fetchTargetSpecificData = useCallback(async () => {
    if (!targetUser || !isAuthorizedToViewPage) {
        // Clear data if no target user or not authorized
        setCurrentSemanario(null);
        setCurrentExcepciones([]);
        setCurrentAusencias([]);
        setComentariosList([]);
        setIsLoadingTargetSpecificData(false); // Ensure loading is reset
        return;
    }

    console.log(`Fetching specific data for target user: ${targetUser.id} for week starting: ${currentDisplayWeekStart.toISOString()}`);
    setIsLoadingTargetSpecificData(true);
    setTargetSpecificDataError(null);

    // Define the start and end of the week for queries
    const weekStartTimestamp = Timestamp.fromDate(startOfWeek(currentDisplayWeekStart, { weekStartsOn: 1, locale: es }));
    const weekEndTimestamp = Timestamp.fromDate(endOfWeek(currentDisplayWeekStart, { weekStartsOn: 1, locale: es }));

    try {
        // Assuming Semanario ID is the same as UserId
        const semanarioDocRef = doc(db, "semanarios", targetUser.id); 
        
        const eleccionesQuery = query(
        collection(db, "elecciones"), 
        where("usuarioId", "==", targetUser.id),
        where("residenciaId", "==", residenciaId), // Ensure you filter by residenciaId
        where("fecha", ">=", weekStartTimestamp),
        where("fecha", "<=", weekEndTimestamp),
        orderBy("fecha", "asc")
        );
        
        const ausenciasQuery = query(
        collection(db, "ausencias"), 
        where("userId", "==", targetUser.id),
        where("residenciaId", "==", residenciaId), // Ensure you filter by residenciaId
        // For ausencias, fetch those that *overlap* with the current week.
        // Firestore doesn't support direct overlap queries easily.
        // A common strategy: fetch where an absence ENDS after the week starts
        // AND where an absence STARTS before the week ends. Then filter client-side.
        // Simpler for now: fetch all active/recent and filter. Or use a broader date range.
        // For this example, let's fetch all and filter, or you can refine the query.
        orderBy("fechaInicio", "asc") 
        );

        const comentariosQuery = query(
        collection(db, "comentarios"),
        where("usuarioId", "==", targetUser.id), // Comments made by the target user
        where("residenciaId", "==", residenciaId), // In this residence
        orderBy("fechaEnvio", "desc"),
        limit(15) // Example limit
        );

        const [semanarioSnap, eleccionesSnap, ausenciasSnap, comentariosSnap] = await Promise.all([
        getDoc(semanarioDocRef),
        getDocs(eleccionesQuery),
        getDocs(ausenciasQuery),
        getDocs(comentariosQuery)
        ]);

        if (semanarioSnap.exists()) {
        setCurrentSemanario({ id: semanarioSnap.id, ...semanarioSnap.data() } as Semanario);
        } else {
        // If no semanario doc, create a default empty one for the UI to work with
        setCurrentSemanario({ 
            userId: targetUser.id, 
            residenciaId: residenciaId, 
            elecciones: {}, 
            ultimaActualizacion: Timestamp.now() // Or null/undefined if preferred for "never saved"
        });
        }
        
        setCurrentExcepciones(eleccionesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Eleccion)));
        
        const fetchedAusencias = ausenciasSnap.docs.map(d => ({ id: d.id, ...d.data() } as Ausencia));
        // Client-side filter for ausencias overlapping the current week
        setCurrentAusencias(
        fetchedAusencias.filter(aus => 
            (aus.fechaInicio as Timestamp).toMillis() <= weekEndTimestamp.toMillis() && 
            (aus.fechaFin as Timestamp).toMillis() >= weekStartTimestamp.toMillis()
        )
        );

        setComentariosList(comentariosSnap.docs.map(d => ({ id: d.id, ...d.data() } as Comentario)));

    } catch (error) {
        console.error("Error fetching target user specific data:", error);
        setTargetSpecificDataError(error instanceof Error ? error.message : "Error cargando datos del plan del usuario.");
    } finally {
        setIsLoadingTargetSpecificData(false);
    }
}, [targetUser, isAuthorizedToViewPage, residenciaId, currentDisplayWeekStart]); // Key dependencies


  // Effect to fetch core data
  const fetchCoreData = useCallback(async () => {
    if (!residenciaId || !isAuthorizedToViewPage) { setIsLoadingCoreData(false); return; }
    setIsLoadingCoreData(true);
    setCoreDataError(null);
    try {
      const residenciaDocRef = doc(db, "residencias", residenciaId);
      const tiemposQuery = query(collection(db, "tiemposComida"), where("residenciaId", "==", residenciaId), orderBy("ordenGrupo"));
      const alternativasQuery = query(collection(db, "alternativas"), where("residenciaId", "==", residenciaId), where("isActive", "==", true), orderBy("nombre"));
      const horariosQuery = query(collection(db, "horariosSolicitud"), where("residenciaId", "==", residenciaId), where("isActive", "==", true));

      const [residenciaSnap, tiemposSnap, alternativasSnap, horariosSnap] = await Promise.all([
        getDoc(residenciaDocRef), getDocs(tiemposQuery), getDocs(alternativasQuery), getDocs(horariosQuery),
      ]);

      if (residenciaSnap.exists()) { setResidenciaData({ id: residenciaSnap.id, ...residenciaSnap.data() } as Residencia); } 
      else { throw new Error("Residencia no encontrada."); }
      setTiemposComidaList(tiemposSnap.docs.map(d => ({ id: d.id, ...d.data() } as TiempoComida)));
      setAlternativasList(alternativasSnap.docs.map(d => ({ id: d.id, ...d.data() } as AlternativaTiempoComida)));
      setHorariosSolicitudList(horariosSnap.docs.map(d => ({ id: d.id, ...d.data() } as HorarioSolicitudComida)));
    } catch (error) { console.error("Error fetching core data:", error); setCoreDataError(error instanceof Error ? error.message : "Error desconocido cargando datos base."); setPageAccessError("Error cargando datos esenciales para la página."); } 
    finally { setIsLoadingCoreData(false); }
  }, [residenciaId, isAuthorizedToViewPage]);

  useEffect(() => { if(isAuthorizedToViewPage) { fetchCoreData(); } }, [isAuthorizedToViewPage, fetchCoreData]);

    // Update overall page loading state
    useEffect(() => {
    const isTargetDataRelevantAndLoading = !!targetUser && isAuthorizedToViewPage && isLoadingTargetSpecificData;
    setIsLoadingPage(isLoadingAuth || isLoadingProfile || (isAuthorizedToViewPage && isLoadingCoreData) || isTargetDataRelevantAndLoading);
    }, [isLoadingAuth, isLoadingProfile, isAuthorizedToViewPage, isLoadingCoreData, targetUser, isLoadingTargetSpecificData]);

    useEffect(() => {
    if (targetUser && isAuthorizedToViewPage) {
        fetchTargetSpecificData();
    } else { 
        // Clear data if no targetUser or not authorized for them
        setCurrentSemanario(null);
        setCurrentExcepciones([]);
        setCurrentAusencias([]);
        setComentariosList([]); // <<< CORRECTED: Set to empty array

        setIsLoadingTargetSpecificData(false); // Reset loading state
    }
    }, [targetUser, isAuthorizedToViewPage, fetchTargetSpecificData]); // fetchTargetSpecificData is a dependency


  // --- Handlers (Placeholders - to be fully implemented) ---
  const handleSemanarioCellClick = (day: DayOfWeekKey, tiempoComidaId: TiempoComidaId) => { /* ... */ };
  const handleSaveSemanarioSelection = () => { /* ... */ };
  const handleAddExcepcion = () => { /* ... */ };
  const handleDeleteExcepcion = (excepcionId: string) => { /* ... */ };
  const handleAddAusencia = () => { /* ... */ };
  const handleDeleteAusencia = (ausenciaId: AusenciaId) => { /* ... */ };
  const handleEnviarComentario = () => { /* ... */ };

  // --- Loading and Error Handling for Page View ---
  if (isLoadingPage) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg">Cargando página de comidas...</p>
      </div>
    );
  }

  if (pageAccessError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h1 className="text-2xl font-bold text-destructive mb-2">Acceso Restringido</h1>
        <p className="mb-4 text-muted-foreground max-w-md">{pageAccessError}</p>
        <Button onClick={() => router.push('/')}>Volver al Inicio</Button>
      </div>
    );
  }
  
  if (coreDataError && isAuthorizedToViewPage) { // If core data failed but basic page access was granted
     return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h1 className="text-2xl font-bold text-destructive mb-2">Error Cargando Datos Esenciales</h1>
        <p className="mb-4 text-muted-foreground max-w-md">{coreDataError}</p>
        <Button onClick={fetchCoreData} disabled={isLoadingCoreData}>
            {isLoadingCoreData && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Reintentar Carga
        </Button>
      </div>
    );
  }

  // ... (after coreDataError check) ...

// Specific error for target user data, if core data loaded fine
if (targetSpecificDataError && targetUser && isAuthorizedToViewPage) {
  return (
    <div className="container mx-auto p-4">
      <header> {/* Basic header even on error */}
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
              Plan de Comidas de {targetUser.nombre} {targetUser.apellido}
          </h1>
          {residenciaData && <p className="text-muted-foreground">{residenciaData.nombre}</p>}
      </header>
      <div className="flex flex-col items-center justify-center py-10 text-center">
          <AlertCircle className="h-12 w-12 text-destructive mb-4" />
          <h2 className="text-xl font-bold text-destructive mb-2">Error Cargando Detalles del Usuario</h2>
          <p className="mb-4 text-muted-foreground max-w-md">{targetSpecificDataError}</p>
          <Button onClick={fetchTargetSpecificData} disabled={isLoadingTargetSpecificData}>
              {isLoadingTargetSpecificData && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Reintentar
          </Button>
      </div>
    </div>
  );
}

// --- Render Logic ---
const getAlternativaName = (altId: AlternativaTiempoComidaId | undefined): string => {
    if (!altId) return 'No seleccionado';
    const alternativa = alternativasList.find(a => a.id === altId);
    return alternativa ? alternativa.nombre : 'Alternativa Desconocida';
  };
  
  const getTiempoComidaName = (tcId: TiempoComidaId | undefined): string => {
    if (!tcId) return 'Comida Desconocida';
    const tiempo = tiemposComidaList.find(t => t.id === tcId);
    return tiempo ? `${tiempo.nombreGrupo} - ${tiempo.nombre}` : 'Comida Desconocida';
  };

  // Determine if targetUser specific data is still loading (Semanario, Elecciones etc. would have their own loaders later)
  
  const isLoadingTargetUserData = !targetUser && (currentUserProfile?.roles.includes('director') || currentUserProfile?.roles.includes('admin') || currentUserProfile?.roles.includes('asistente'));

  const modoEleccionDelTarget = targetUser?.modoEleccion || 'normal'; // Default to 'normal' if undefined

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-8">
      <header className="flex flex-col md:flex-row justify-between md:items-center gap-4 border-b pb-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
            {targetUser ? `Plan de Comidas de ${targetUser.nombre} ${targetUser.apellido}` : 'Plan de Comidas'}
          </h1>
          {residenciaData && <p className="text-muted-foreground">{residenciaData.nombre}</p>}
           {targetUser && (
            <Badge 
                variant={modoEleccionDelTarget === 'suspendido' ? 'destructive' : modoEleccionDelTarget === 'diario' ? 'outline' : 'secondary'} 
                className="mt-1 text-sm"
            >
              Modo Elección: <span className="font-semibold ml-1">{modoEleccionDelTarget.charAt(0).toUpperCase() + modoEleccionDelTarget.slice(1)}</span>
            </Badge>
          )}
        </div>
        {(currentUserProfile?.roles.includes('director') || currentUserProfile?.roles.includes('admin') || currentUserProfile?.roles.includes('asistente')) && (
            <div className="w-full md:w-72">
                <Label htmlFor="user-selector" className="text-sm font-medium">Gestionar para Residente:</Label>
                <Select disabled> 
                    <SelectTrigger id="user-selector">
                        <SelectValue placeholder={targetUser ? `${targetUser.nombre} ${targetUser.apellido}` : "Seleccionar residente..."} />
                    </SelectTrigger>
                    <SelectContent><SelectItem value="placeholder_no_user_selected" disabled={!!targetUser}>
                        {targetUser ? `${targetUser.nombre} ${targetUser.apellido}` : "Seleccionar..."}
                    </SelectItem></SelectContent>
                </Select>
                {!targetUser && <p className="text-xs text-muted-foreground mt-1">Seleccione un residente para ver/gestionar su plan.</p>}
            </div>
        )}
      </header>
{/* Conditional rendering if no target user is selected by an admin/director */}
      {isLoadingTargetUserData && (
        <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin mb-2" />
            <p>Cargando datos del residente...</p>
        </div>
      )}

      {!targetUser && (currentUserProfile?.roles.includes('director') || currentUserProfile?.roles.includes('admin') || currentUserProfile?.roles.includes('asistente')) && !isLoadingTargetUserData && (
        <Card className="text-center py-10">
            <CardHeader>
                <CardTitle>Seleccionar Residente</CardTitle>
            </CardHeader>
            <CardContent>
                <p className="text-muted-foreground">Por favor, selecciona un residente de la lista de arriba para ver o gestionar su plan de comidas.</p>
            </CardContent>
        </Card>
      )}

      {/* Show meal sections only if a targetUser is selected and authorized */}
      {targetUser && isAuthorizedToViewPage && (
        <>
          {/* <<< NEW LOADING INDICATOR FOR USER-SPECIFIC DATA >>> */}
            {isLoadingTargetSpecificData && (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin mr-3" /> Cargando plan de {targetUser.nombre}...
            </div>
            )}
            {/* Render sections only if NOT loading target specific data */}

            {!isLoadingTargetSpecificData && (
      <>

            {/* Section 1: Semanario */}
          <Card className={modoEleccionDelTarget === 'diario' ? 'opacity-60 bg-slate-50 dark:bg-slate-800/30' : ''}>
            <CardHeader>
              <CardTitle>Plan Semanal (Semanario)</CardTitle>
              {modoEleccionDelTarget === 'normal' && 
                <CardDescription>
                  Define tus elecciones base para la semana del {format(currentDisplayWeekStart, "dd 'de' MMMM", { locale: es })} al {format(addDays(currentDisplayWeekStart, 6), "dd 'de' MMMM 'de' yyyy", { locale: es })}.
                </CardDescription>
              }
              {modoEleccionDelTarget === 'diario' && 
                <CardDescription className="text-amber-700 dark:text-amber-500">
                  Modo de elección diario activado. Las comidas se seleccionan día a día en la sección "Elecciones Diarias / Comidas Día a Día". El semanario se muestra como referencia (si existe) pero no se utiliza para las elecciones actuales.
                </CardDescription>
              }
              {modoEleccionDelTarget === 'suspendido' && 
                <CardDescription className="text-red-700 dark:text-red-500">
                  El plan de comidas para {targetUser.nombre} está actualmente suspendido. No se pueden realizar ni modificar elecciones en el semanario.
                </CardDescription>
              }
            </CardHeader>
            { (modoEleccionDelTarget === 'normal' || modoEleccionDelTarget === 'diario') && /* Show read-only for diario */ (
                <CardContent>
                    {(!currentSemanario || Object.keys(currentSemanario.elecciones).length === 0) && !isLoadingCoreData && (
                        <p className="text-muted-foreground">El semanario para {targetUser.nombre} aún no ha sido configurado o está vacío.</p>
                    )}
                    {currentSemanario && tiemposComidaList.length > 0 && (
                        <div className="overflow-x-auto">
                        <Table className="min-w-[800px]">
                            <TableHeader><TableRow>
                                <TableHead className="w-[100px] md:w-[120px] sticky left-0 bg-card z-10">Día</TableHead>
                                {tiemposComidaList.map(tc => <TableHead key={tc.id} className="text-center">{tc.nombre} <span className="block text-xs text-muted-foreground">({tc.nombreGrupo})</span></TableHead>)}
                            </TableRow></TableHeader>
                            <TableBody>
                            {daysOfWeek.map(day => (
                                <TableRow key={day} className={modoEleccionDelTarget === 'diario' ? 'opacity-70' : ''}>
                                <TableCell className="font-medium sticky left-0 bg-card z-10">{dayDisplayMap[day]}</TableCell>
                                {tiemposComidaList.map(tc => {
                                    const seleccionSemanario = currentSemanario?.elecciones?.[day]?.[tc.id];
                                    const isEditable = modoEleccionDelTarget === 'normal';
                                    return (
                                    <TableCell 
                                        key={tc.id} 
                                        onClick={() => isEditable && handleSemanarioCellClick(day, tc.id)} 
                                        className={`min-w-[150px] text-center ${isEditable ? "cursor-pointer hover:bg-muted/50" : "text-muted-foreground"}`}
                                    >
                                        {editingSemanarioSlot?.day === day && editingSemanarioSlot?.tiempoComidaId === tc.id && isEditable ? (
                                        <div className="flex flex-col space-y-1 mx-auto max-w-xs">
                                            <Select 
                                            value={selectedAlternativaForSlot || ''}
                                            onValueChange={(value) => setSelectedAlternativaForSlot(value as AlternativaTiempoComidaId)}
                                            >
                                            <SelectTrigger><SelectValue placeholder="Elegir..." /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value=""><em>-- Sin selección --</em></SelectItem>
                                                {alternativasList.filter(a => a.tiempoComidaId === tc.id || (a.tipo === 'ayuno' && tc.nombreGrupo !== 'Desayuno')).map(alt => (
                                                <SelectItem key={alt.id} value={alt.id}>{alt.nombre}</SelectItem>
                                                ))}
                                            </SelectContent>
                                            </Select>
                                            <div className="flex gap-2 justify-center">
                                                <Button size="sm" onClick={handleSaveSemanarioSelection}>Guardar</Button>
                                                <Button size="sm" variant="ghost" onClick={() => setEditingSemanarioSlot(null)}>Cancelar</Button>
                                            </div>
                                        </div>
                                        ) : (
                                        <div className="min-h-[40px] flex flex-col justify-center items-center">
                                            {seleccionSemanario ? (
                                            <>
                                                <span>{getAlternativaName(seleccionSemanario.alternativaId)}</span>
                                                {seleccionSemanario.requiereAprobacion && <Badge variant="outline" className="mt-1 text-xs border-amber-500 text-amber-600">Req. Aprob.</Badge>}
                                            </>
                                            ) : <span className="text-xs italic">-- Sin elección --</span>}
                                        </div>
                                        )}
                                    </TableCell>
                                    );
                                })}
                                </TableRow>
                            ))}
                            </TableBody>
                        </Table>
                        </div>
                    )}
                     {modoEleccionDelTarget === 'normal' && <Button className="mt-4" disabled>Guardar Cambios del Semanario</Button> /* TODO */}
                </CardContent>
            )}
          </Card>

          {/* Section 2: Excepciones / Elecciones Diarias */}
          <Card className={modoEleccionDelTarget === 'suspendido' ? 'opacity-60 bg-slate-50 dark:bg-slate-800/30' : ''}>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>
                  {modoEleccionDelTarget === 'diario' ? 'Elecciones Diarias / Comidas Día a Día' : 'Excepciones Individuales'}
                </CardTitle>
                {modoEleccionDelTarget === 'normal' && <CardDescription>Cambios específicos a tu plan semanal para fechas concretas.</CardDescription>}
                {modoEleccionDelTarget === 'diario' && <CardDescription>Selecciona aquí tus comidas para cada día. Las elecciones aquí anulan cualquier configuración del semanario.</CardDescription>}
                {modoEleccionDelTarget === 'suspendido' && <CardDescription className="text-red-700 dark:text-red-500">La gestión de excepciones/elecciones diarias está suspendida.</CardDescription>}
              </div>
              <Button variant="outline" size="sm" onClick={() => setShowAddExcepcionModal(true)} disabled={modoEleccionDelTarget === 'suspendido'}>
                <PlusCircle className="mr-2 h-4 w-4"/>Añadir {modoEleccionDelTarget === 'diario' ? 'Elección Diaria' : 'Excepción'}
              </Button>
            </CardHeader>
            <CardContent>
                {modoEleccionDelTarget === 'suspendido' ? (
                    // Line 554 corrected:
                    <p className="text-muted-foreground">La gestión de comidas está deshabilitada en este modo.</p>
                ) : currentExcepciones.length === 0 ? (
                    <p className="text-muted-foreground">No hay {modoEleccionDelTarget === 'diario' ? 'elecciones diarias' : 'excepciones'} registradas para las fechas visibles.</p>
                ) : (
                    <ul className="space-y-2">
                    {currentExcepciones.map(ex => (
                        <li key={ex.id || `ex-${ex.fecha.seconds}`} className="flex justify-between items-center p-3 border rounded-md hover:bg-muted/30">
                        <div>
                            <span className="font-medium">{format((ex.fecha as Timestamp).toDate(), "EEEE dd 'de' MMMM 'de' yyyy", { locale: es })} - {getTiempoComidaName(ex.tiempoComidaId)}:</span>
                            <span className="ml-2">{getAlternativaName(ex.alternativaTiempoComidaId)}</span>
                            {ex.estadoAprobacion === 'pendiente' && <Badge variant="outline" className="ml-2 text-xs border-amber-500 text-amber-600">Pendiente Aprob.</Badge>}
                            {ex.estadoAprobacion === 'rechazado' && <Badge variant="destructive" className="ml-2 text-xs">Rechazado</Badge>}
                        </div>
                        {/* Delete button - no 'disabled' prop needed here as this block means mode is not 'suspendido' */}
                        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDeleteExcepcion(ex.id!)}>
                            <Trash2 className="h-4 w-4"/>
                        </Button>
                        </li>
                    ))}
                    </ul>
                )}
            </CardContent>
          </Card>

          {/* Section 3: Ausencias Programadas */}
          <Card className={modoEleccionDelTarget === 'suspendido' ? 'opacity-60 bg-slate-50 dark:bg-slate-800/30' : ''}>
            <CardHeader className="flex flex-row items-center justify-between">
                <div>
                    <CardTitle>Ausencias Programadas</CardTitle>
                    {modoEleccionDelTarget !== 'suspendido' && <CardDescription>Periodos en los que no estarás en la residencia.</CardDescription>}
                    {modoEleccionDelTarget === 'suspendido' && <CardDescription className="text-red-700 dark:text-red-500">La gestión de ausencias está deshabilitada.</CardDescription>}
                </div>
                 <Button variant="outline" size="sm" onClick={() => setShowAddAusenciaModal(true)} disabled={modoEleccionDelTarget === 'suspendido'}><PlusCircle className="mr-2 h-4 w-4"/>Añadir Ausencia</Button>
            </CardHeader>
                <CardContent>
                    {modoEleccionDelTarget === 'suspendido' ? (
                        <p className="text-muted-foreground">La gestión de ausencias está deshabilitada.</p>
                    ) : currentAusencias.length === 0 ? (
                        <p className="text-muted-foreground">No hay ausencias registradas.</p>
                    ) : (
                        <ul className="space-y-2">
                        {currentAusencias.map(aus => (
                            <li key={aus.id || `aus-${aus.fechaInicio.seconds}`} className="flex justify-between items-center p-3 border rounded-md hover:bg-muted/30">
                            <div>
                                <span className="font-medium">Del {format((aus.fechaInicio as Timestamp).toDate(), "dd/MM/yyyy", { locale: es })} al {format((aus.fechaFin as Timestamp).toDate(), "dd/MM/yyyy", { locale: es })}</span>
                                {aus.motivo && <span className="text-sm text-muted-foreground ml-2">- {aus.motivo}</span>}
                            </div>
                            {/* Delete button - no 'disabled' prop needed here */}
                            <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDeleteAusencia(aus.id!)}>
                                <Trash2 className="h-4 w-4"/>
                            </Button>
                            </li>
                        ))}
                        </ul>
                    )}
                </CardContent>
          </Card>
          
          {/* Section 4: Comentarios para Cocina/Dirección */}
          <Card>
            <CardHeader>
              <CardTitle>Comentarios para Cocina/Dirección</CardTitle>
              <CardDescription>Avisos generales, alergias persistentes, o feedback.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <Textarea 
                    placeholder={modoEleccionDelTarget === 'suspendido' ? "Envío de comentarios deshabilitado." : "Escribe tu comentario aquí..." }
                    value={nuevoComentario}
                    onChange={(e) => setNuevoComentario(e.target.value)}
                    rows={3}
                    disabled={modoEleccionDelTarget === 'suspendido'}
                />
                <Button onClick={handleEnviarComentario} disabled={!nuevoComentario.trim() || modoEleccionDelTarget === 'suspendido'}>Enviar Comentario</Button>
                <Separator />
                <h3 className="text-sm font-medium text-muted-foreground">Comentarios Recientes:</h3>
                <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
                    {comentariosList.length === 0 && <p className="text-sm text-muted-foreground">No hay comentarios.</p>}
                    {comentariosList.map(com => (
                    <div key={com.id} className="p-3 border rounded-md text-sm bg-muted/20 dark:bg-slate-700/30">
                        {/* You'll need to fetch user profiles to get names based on com.usuarioId */}
                        <p className="font-semibold text-slate-700 dark:text-slate-200">
                            Usuario: {com.usuarioId.substring(0,6)}... {/* Placeholder for author name */}
                            <span className="text-xs text-muted-foreground ml-1">
                                ({format((com.fechaEnvio as Timestamp).toDate(), "dd/MM/yy HH:mm", { locale: es })})
                            </span>:
                        </p>
                        <p className="text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{com.texto}</p>
                    </div>
                    ))}
                </div>
            </CardContent>
          </Card>

          {/* Section 5: Link to Actividades */}
          <Card className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border-primary/30 dark:from-primary/20 dark:via-primary/10">
            <CardHeader>
                <CardTitle className="text-primary flex items-center"><CalendarIcon className="mr-3 h-6 w-6"/>Actividades Especiales</CardTitle>
            </CardHeader>
            <CardContent>
                <p className="text-muted-foreground mb-4">Consulta y apúntate a las actividades y eventos especiales organizados por la residencia que pueden afectar tu plan de comidas.</p>
                <Button variant="default" onClick={() => router.push(`/r/${residenciaId}/actividades`)} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                    Ver Actividades Disponibles <ExternalLink className="ml-2 h-4 w-4"/>
                </Button>
            </CardContent>
          </Card>
          </>
    )}
        </>
      )}
    </div>
  );
}