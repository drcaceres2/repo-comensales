'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Timestamp, collection, addDoc, getDocs, doc, getDoc, updateDoc, deleteDoc, query, where, orderBy, serverTimestamp, writeBatch, limit } from 'firebase/firestore'; // Added limit
import { db, auth } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';

// UI Components
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Loader2, AlertCircle, Home, CalendarDays, Info, CheckCircle, XCircle, UserPlus, LogOut, MailCheck, MailWarning, ThumbsUp, ThumbsDown } from 'lucide-react';
import { Badge } from "@/components/ui/badge";

// Types from firestore.ts
import {
    Residencia,
    Actividad,
    InscripcionActividad,
    UserProfile,
    ResidenciaId,
    ActividadId,
    UserId,
    LogActionType,
    EstadoInscripcionActividad,
    UserRole // Ensure UserRole is imported
} from '../../../../shared/models/types';

// Helper to create Log Entries
async function createLogEntry(
    actionType: LogActionType,
    residenciaId: ResidenciaId,
    userId: string | null,
    details?: string,
    relatedDocPath?: string
) {
    if (!userId) return;
    try {
        console.log("Log Entry (Resident Activities):", { actionType, residenciaId, userId, details, relatedDocPath });
        // Placeholder for actual log creation
        // const logEntryData = { timestamp: serverTimestamp(), userId, residenciaId, actionType, relatedDocPath, details };
        // await addDoc(collection(db, "logEntries"), logEntryData);
    } catch (error) {
        console.error("Error creating log entry:", error);
    }
}

const formatActivityDateRange = (fechaInicio: string | Timestamp | undefined, fechaFin: string | Timestamp | undefined): string => {
    if (!fechaInicio || !fechaFin) return 'Fechas no definidas';
    const startDate = (fechaInicio as Timestamp)?.toDate ? (fechaInicio as Timestamp).toDate() : new Date(fechaInicio as any);
    const endDate = (fechaFin as Timestamp)?.toDate ? (fechaFin as Timestamp).toDate() : new Date(fechaFin as any);
    const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long', day: 'numeric' };
    if (startDate.toDateString() === endDate.toDateString()) {
        return startDate.toLocaleDateString(undefined, options);
    }
    return `${startDate.toLocaleDateString(undefined, options)} - ${endDate.toLocaleDateString(undefined, options)}`;
};


export default function ResidenteActividadesPage() {
    const params = useParams();
    const router = useRouter();
    const residenciaId = params.residenciaId as ResidenciaId;
    const { toast } = useToast();

    const { user: currentUser, loading: authLoading, error: authError } = useAuth();
    const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
    const [profileLoading, setProfileLoading] = useState(true);
    const [profileError, setProfileError] = useState<string | null>(null);
    // Renamed for clarity
    const [isAuthorizedToParticipate, setIsAuthorizedToParticipate] = useState(false);

    const [residencia, setResidencia] = useState<Residencia | null>(null);
    const [displayedActivities, setDisplayedActivities] = useState<Actividad[]>([]);
    const [userInscriptionsMap, setUserInscriptionsMap] = useState<Map<ActividadId, InscripcionActividad>>(new Map());
    
    const [isLoadingPageData, setIsLoadingPageData] = useState(true);
    const [pageError, setPageError] = useState<string | null>(null);
    const [noActivitiesMessage, setNoActivitiesMessage] = useState<string | null>(null);

    const [selectedActivity, setSelectedActivity] = useState<Actividad | null>(null);
    const [showDetailModal, setShowDetailModal] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);

    // --- Authorization ---
    useEffect(() => {
        if (authLoading) { setProfileLoading(true); return; }
        if (authError) { setProfileError(`Error de autenticación: ${authError.message}`); setProfileLoading(false); return; }
        if (!currentUser) { setProfileError("No has iniciado sesión."); setProfileLoading(false); router.replace(`/auth/login?redirect=/r/${residenciaId}/actividades`); return;}

        setProfileLoading(true);
        const userDocRef = doc(db, "users", currentUser.uid);
        getDoc(userDocRef)
            .then((docSnap) => {
                if (docSnap.exists()) {
                    const profile = docSnap.data() as UserProfile;
                    setUserProfile(profile);

                    // <<< UPDATED AUTHORIZATION LOGIC >>>
                    const allowedRoles: UserRole[] = ['residente', 'director', 'asistente', 'auditor' as UserRole];
                    const userRoles = profile.roles || [];
                    const hasRequiredRole = userRoles.some(role => allowedRoles.includes(role));

                    if (profile.isActive && hasRequiredRole && profile.residenciaId === residenciaId) {
                        setIsAuthorizedToParticipate(true);
                    } else {
                        setProfileError("No tienes permiso para ver o participar en actividades en esta residencia, tu perfil no está activo, o no tienes un rol asignado apropiado.");
                        setIsAuthorizedToParticipate(false);
                    }
                } else { setProfileError("Perfil de usuario no encontrado."); }
            })
            .catch((error) => { console.error("Error fetching user profile:", error); setProfileError(`Error cargando tu perfil: ${error.message}`); })
            .finally(() => setProfileLoading(false));
    }, [currentUser, authLoading, authError, residenciaId, router]);

    // --- Initial Data Fetching ---
    const fetchData = useCallback(async () => {
        if (!isAuthorizedToParticipate || !residenciaId || !currentUser) { setIsLoadingPageData(false); return; }
        
        setIsLoadingPageData(true);
        setPageError(null);
        setNoActivitiesMessage(null);

        try {
            const residenciaRef = doc(db, "residencias", residenciaId);
            const residenciaSnap = await getDoc(residenciaRef);
            if (!residenciaSnap.exists()) throw new Error("Residencia no encontrada.");
            setResidencia(residenciaSnap.data() as Residencia);

            const inscriptionsQuery = query(
                collection(db, "inscripcionesActividad"),
                where("residenciaId", "==", residenciaId),
                where("userId", "==", currentUser.uid)
            );
            const inscriptionsSnap = await getDocs(inscriptionsQuery);
            const inscriptionsMap = new Map<ActividadId, InscripcionActividad>();
            inscriptionsSnap.docs.forEach(d => {
                const inscription = { id: d.id, ...d.data() } as InscripcionActividad;
                inscriptionsMap.set(inscription.actividadId, inscription);
            });
            setUserInscriptionsMap(inscriptionsMap);

            const openActivitiesQuery = query(
                collection(db, "actividades"),
                where("residenciaId", "==", residenciaId),
                where("estado", "==", "abierta_inscripcion"),
                orderBy("fechaInicio", "asc")
            );
            const openActivitiesSnap = await getDocs(openActivitiesQuery);
            let activitiesToShow = openActivitiesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Actividad));

            activitiesToShow = activitiesToShow.filter(act => {
                const inscription = inscriptionsMap.get(act.id);
                if (inscription?.estadoInscripcion === 'invitado_pendiente') return true; 
                if (act.tipoAccesoActividad === 'abierta' || act.tipoAccesoActividad === 'opcion_unica') return true; 
                return false; 
            });
            
            // Add activities user is already definitively inscribed in (even if inscription window closed for others)
            // Iterate over a copy of map values if modifying map during iteration or use for...of
            for (const inscription of Array.from(inscriptionsMap.values())) {
                 if (inscription.estadoInscripcion === 'inscrito_directo' || inscription.estadoInscripcion === 'invitado_aceptado') {
                    if (!activitiesToShow.find(act => act.id === inscription.actividadId)) {
                        const actDoc = await getDoc(doc(db, "actividades", inscription.actividadId));
                        if (actDoc.exists()) {
                           activitiesToShow.push({ id: actDoc.id, ...actDoc.data() } as Actividad);
                        }
                    }
                }
            }
             activitiesToShow = Array.from(new Map(activitiesToShow.map(item => [item.id, item])).values())
                                   .sort((a,b) => new Date(a.fechaInicio).getTime() - new Date(b.fechaFin).getTime());


            if (activitiesToShow.length === 0) {
                const pastActivitiesQuery = query(
                    collection(db, "actividades"),
                    where("residenciaId", "==", residenciaId),
                    where("estado", "in", ["confirmada_finalizada", "cancelada"]),
                    where("fechaFin", "<", Timestamp.now()), 
                    orderBy("fechaFin", "desc"),
                    limit(3) 
                );
                const pastActivitiesSnap = await getDocs(pastActivitiesQuery);
                const pastActivities = pastActivitiesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Actividad));
                
                setDisplayedActivities(pastActivities); // Show past activities
                if (pastActivities.length > 0) {
                    setNoActivitiesMessage("No hay actividades nuevas o pendientes. Estas son algunas actividades recientes:");
                } else {
                    setNoActivitiesMessage("No hay actividades programadas en este momento. ¡Vuelve a consultar más tarde!");
                }
            } else {
                setDisplayedActivities(activitiesToShow);
            }

        } catch (err) {
            console.error("Error fetching resident activities data:", err);
            setPageError(err instanceof Error ? err.message : "Error desconocido al cargar datos.");
        } finally {
            setIsLoadingPageData(false);
        }
    }, [isAuthorizedToParticipate, residenciaId, currentUser]);

    useEffect(() => {
        if (isAuthorizedToParticipate && residenciaId && currentUser) {
            fetchData();
        }
    }, [isAuthorizedToParticipate, residenciaId, currentUser, fetchData]);

    // --- ACTION HANDLERS (handleViewDetails, handleSignUpDirectly, handleRespondToInvitation, handleCancelInscription as before) ---
    const handleViewDetails = (actividad: Actividad) => {
        setSelectedActivity(actividad);
        setShowDetailModal(true);
        // Optionally, you could trigger a fetch here for the specific activity's inscription count
        // if you want to display it in the modal before the user clicks sign-up.
    };

    const handleSignUpDirectly = async () => {
        if (!selectedActivity || !currentUser || !residenciaId) return;
        
        setIsProcessing(true);
        try {
            // <<< NEW: Check for maxParticipants before signing up >>>
            if (selectedActivity.maxParticipantes && selectedActivity.maxParticipantes > 0) {
                const inscriptionsForActivityQuery = query(
                    collection(db, "inscripcionesActividad"),
                    where("actividadId", "==", selectedActivity.id),
                    where("estadoInscripcion", "in", ['inscrito_directo', 'inscrito_aceptado', 'invitado_pendiente']) // Count active/pending states
                );
                const inscriptionsSnap = await getDocs(inscriptionsForActivityQuery);
                if (inscriptionsSnap.size >= selectedActivity.maxParticipantes) {
                    toast({ title: "Plazas Completas", description: `Lo sentimos, "${selectedActivity.nombre}" ya no tiene plazas disponibles.`, variant: "destructive" });
                    setIsProcessing(false);
                    // Optionally, refresh the main activity list here if a background update might have occurred
                    // fetchData(); 
                    setShowDetailModal(false); // Close modal as action is blocked
                    return;
                }
            }
            // <<< END NEW >>>

            const newInscriptionData: Omit<InscripcionActividad, 'id'> = {
                actividadId: selectedActivity.id,
                userId: currentUser.uid,
                residenciaId: residenciaId,
                estadoInscripcion: 'inscrito_directo',
                fechaEstado: serverTimestamp() as any,
            };
            const docRef = await addDoc(collection(db, "inscripcionesActividad"), newInscriptionData);
            const newInscription = { ...newInscriptionData, id: docRef.id, fechaEstado: Timestamp.now().toMillis() } as InscripcionActividad;
            setUserInscriptionsMap(prev => new Map(prev).set(selectedActivity.id, newInscription));
            
            toast({ title: "¡Inscripción Exitosa!", description: `Te has apuntado a "${selectedActivity.nombre}".`});
            await createLogEntry('actividad', residenciaId, currentUser.uid, `Inscrito (directo) a actividad: ${selectedActivity.nombre}`, docRef.path);
            setShowDetailModal(false);
        } catch (error) {
            console.error("Error signing up:", error);
            toast({ title: "Error en Inscripción", description: `No se pudo completar la inscripción. ${error instanceof Error ? error.message : ''}`, variant: "destructive" });
        } finally { setIsProcessing(false); }
    };

    const handleRespondToInvitation = async (accept: boolean) => {
        if (!selectedActivity || !currentUser || !residenciaId) return;
        const currentInscription = userInscriptionsMap.get(selectedActivity.id);
        if (!currentInscription || currentInscription.estadoInscripcion !== 'invitado_pendiente') {
            toast({ title: "Acción no válida", description: "No hay una invitación pendiente para esta actividad.", variant: "destructive" });
            return;
        }
        
        setIsProcessing(true);
        try {
            // <<< NEW: Check for maxParticipants before accepting invitation >>>
            if (accept && selectedActivity.maxParticipantes && selectedActivity.maxParticipantes > 0) {
                const inscriptionsForActivityQuery = query(
                    collection(db, "inscripcionesActividad"),
                    where("actividadId", "==", selectedActivity.id),
                    where("estadoInscripcion", "in", ['inscrito_directo', 'inscrito_aceptado', 'invitado_pendiente']) 
                );
                const inscriptionsSnap = await getDocs(inscriptionsForActivityQuery);
                // If the user accepting is already in 'invitado_pendiente', their acceptance doesn't take a *new* slot if others filled up.
                // However, if many accept simultaneously, this client-side check isn't perfectly race-condition proof without transactions.
                // For simplicity, we check if *excluding the current user's pending invitation* the limit is reached.
                // A more robust check would be: (snap.size - (pending_invitations_for_this_user > 0 ? 1 : 0) ) >= maxParticipants
                // But an even simpler check is just current count against max.
                if (inscriptionsSnap.size >= selectedActivity.maxParticipantes && 
                    !inscriptionsSnap.docs.find(doc => doc.id === currentInscription.id)) { // Check if current user's slot is what makes it full
                    toast({ title: "Plazas Completas", description: `Lo sentimos, "${selectedActivity.nombre}" se llenó mientras considerabas la invitación.`, variant: "default" });
                    setIsProcessing(false);
                    fetchData(); // Refresh data as the state might have changed
                    setShowDetailModal(false);
                    return;
                }
            }
            // <<< END NEW >>>

            const inscriptionRef = doc(db, "inscripcionesActividad", currentInscription.id);
            const newEstado: EstadoInscripcionActividad = accept ? 'invitado_aceptado' : 'invitado_rechazado';
            await updateDoc(inscriptionRef, {
                estadoInscripcion: newEstado,
                fechaEstado: serverTimestamp() as Timestamp
            });
            const updatedInscription = { ...currentInscription, estadoInscripcion: newEstado, fechaEstado: Timestamp.now().toMillis() }; 
            setUserInscriptionsMap(prev => new Map(prev).set(selectedActivity.id, updatedInscription));

            toast({ title: accept ? "Invitación Aceptada" : "Invitación Rechazada", description: `Has ${accept ? 'aceptado' : 'rechazado'} la invitación para "${selectedActivity.nombre}".` });
            await createLogEntry(accept ? 'inscripcion_invitacion' : 'inscripcion_invitacion', residenciaId, currentUser.uid, `Invitación ${accept ? 'aceptada' : 'rechazada'} para: ${selectedActivity.nombre}`, inscriptionRef.path);
            setShowDetailModal(false);
        } catch (error) {
            console.error("Error responding to invitation:", error);
            toast({ title: "Error al Responder", description: `No se pudo procesar tu respuesta. ${error instanceof Error ? error.message : ''}`, variant: "destructive" });
        } finally { setIsProcessing(false); }
    };
    
    const handleCancelInscription = async (actividadId: ActividadId) => {
        if (!currentUser || !residenciaId || !selectedActivity) return; 
        const inscriptionToCancel = userInscriptionsMap.get(actividadId);
        if (!inscriptionToCancel || !['inscrito_directo', 'inscrito_aceptado'].includes(inscriptionToCancel.estadoInscripcion) ) {
            toast({ title: "Acción no válida", description: "No estás inscrito activamente en esta actividad para cancelar.", variant: "destructive" });
            return;
        }
        setIsProcessing(true);
        try {
            const inscriptionRef = doc(db, "inscripcionesActividad", inscriptionToCancel.id);
            const newEstado: EstadoInscripcionActividad = 'cancelado_usuario';
            await updateDoc(inscriptionRef, {
                estadoInscripcion: newEstado,
                fechaEstado: serverTimestamp() as Timestamp
            });
            const updatedInscription = { ...inscriptionToCancel, estadoInscripcion: newEstado, fechaEstado: Timestamp.now().toMillis() };
            setUserInscriptionsMap(prev => new Map(prev).set(actividadId, updatedInscription));

            toast({ title: "Inscripción Cancelada", description: `Has cancelado tu participación en "${selectedActivity.nombre}".` });
            await createLogEntry('actividad', residenciaId, currentUser.uid, `Inscripción cancelada para: ${selectedActivity.nombre}`, inscriptionRef.path);
            setShowDetailModal(false); 
        } catch (error) {
            console.error("Error cancelling inscription:", error);
            toast({ title: "Error al Cancelar", variant: "destructive" });
        } finally { setIsProcessing(false); }
    };

    // --- Render Logic ---
    if (authLoading || profileLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
                <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                <p className="text-lg font-medium text-muted-foreground">Cargando tu información...</p>
            </div>
        );
    }

    if (profileError || !isAuthorizedToParticipate) { 
        return (
            <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
                <AlertCircle className="h-12 w-12 text-destructive mb-4" />
                <h1 className="text-2xl font-bold text-destructive mb-2">Acceso Denegado</h1>
                <p className="mb-4 text-muted-foreground max-w-md">
                    {profileError || "No tienes permiso para acceder a esta sección o necesitas completar tu perfil."}
                </p>
                <Button onClick={() => router.replace('/')}>Ir al Inicio</Button>
            </div>
        );
    }

    if (isLoadingPageData && displayedActivities.length === 0) {
         return (
            <div className="flex flex-col items-center justify-center min-h-[calc(100vh-200px)] p-4 text-center">
                <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                <p className="text-lg font-medium text-muted-foreground">Buscando actividades...</p>
            </div>
        );
    }
    
    if (pageError) {
         return (
            <div className="container mx-auto p-4 text-center">
                <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
                <h1 className="text-2xl font-bold text-destructive mb-2">Error al Cargar Actividades</h1>
                <p className="text-muted-foreground mb-4">{pageError}</p>
                <Button onClick={fetchData} disabled={isLoadingPageData}>
                    {isLoadingPageData && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Reintentar
                </Button>
            </div>
        );
    }
    
    const renderActivityCardActions = (activity: Actividad) => {
        const inscription = userInscriptionsMap.get(activity.id);
        const isActivityOpenForInscriptions = activity.estado === 'abierta_inscripcion';

        if (inscription) {
            switch (inscription.estadoInscripcion) {
                case 'invitado_pendiente':
                    return isActivityOpenForInscriptions ? (
                        <Button className="w-full" onClick={() => handleViewDetails(activity)}>
                            <MailCheck className="mr-2 h-4 w-4" /> Ver Invitación y Responder
                        </Button>
                    ) : <Badge variant="outline">Invitación Pendiente (Inscripción cerrada)</Badge>;
                case 'inscrito_directo':
                case 'invitado_aceptado':
                    return (
                        <div className="flex flex-col items-center space-y-2">
                            <Badge variant="default" className="bg-green-600 hover:bg-green-700 text-white"><CheckCircle className="mr-2 h-4 w-4" />Inscrito</Badge>
                            <Button variant="outline" size="sm" onClick={() => handleViewDetails(activity)}>Ver Detalles</Button>
                            {isActivityOpenForInscriptions && // Only allow cancellation if activity is still open for inscriptions
                                <Button variant="link" size="sm" className="text-red-500 hover:text-red-600" onClick={() => {setSelectedActivity(activity); handleCancelInscription(activity.id);}}>Cancelar Inscripción</Button>
                            }
                        </div>
                    );
                case 'invitado_rechazado':
                    return <Badge variant="destructive">Invitación Rechazada</Badge>;
                case 'cancelado_usuario':
                case 'cancelado_admin':
                    return <Badge variant="secondary">Inscripción Cancelada</Badge>;
                default:
                    return <Button className="w-full" onClick={() => handleViewDetails(activity)} disabled={!isActivityOpenForInscriptions}>Ver Detalles</Button>;
            }
        } else { 
            if (!isActivityOpenForInscriptions) return <Badge variant="outline">Inscripción Cerrada</Badge>;

            // TODO: Add a more robust check for maxParticipants if critical for card display
            // const isFull = activity.maxParticipantes && (SOME_COUNT_HERE >= activity.maxParticipantes);
            // if (isFull) return <Button className="w-full" disabled>Plazas Completas</Button>;

            if (activity.tipoAccesoActividad === 'abierta' || activity.tipoAccesoActividad === 'opcion_unica') {
                return <Button className="w-full bg-primary hover:bg-primary/90" onClick={() => handleViewDetails(activity)}>Ver y Apuntarme <Info className="ml-2 h-4 w-4"/></Button>;
            }
            if (activity.tipoAccesoActividad === 'invitacion_requerida') {
                return <Badge variant="outline">Requiere Invitación Específica</Badge>; 
            }
        }
        return null;
    };
    
    const renderModalActions = (activity: Actividad) => {
        const inscription = userInscriptionsMap.get(activity.id);
        const isActivityOpenForInscriptions = activity.estado === 'abierta_inscripcion';
        // Note: canStillAct (deadline logic) is simplified to isActivityOpenForInscriptions for now

        if (inscription) {
            switch (inscription.estadoInscripcion) {
                case 'invitado_pendiente':
                    return isActivityOpenForInscriptions ? (
                        <div className="flex space-x-3">
                            <Button onClick={() => handleRespondToInvitation(false)} variant="outline" disabled={isProcessing}>
                                {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <ThumbsDown className="mr-2 h-4 w-4"/>} Rechazar
                            </Button>
                            <Button onClick={() => handleRespondToInvitation(true)} className="bg-green-600 hover:bg-green-700 text-white" disabled={isProcessing}>
                                {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <ThumbsUp className="mr-2 h-4 w-4"/>} Aceptar Invitación
                            </Button>
                        </div>
                    ) : null;
                case 'inscrito_directo':
                case 'invitado_aceptado':
                     return <p className="text-sm text-green-600 dark:text-green-400 flex items-center"><CheckCircle className="mr-2 h-5 w-5"/> Ya estás inscrito.</p>;
                default: return null;
            }
        } else { 
             if (!isActivityOpenForInscriptions) return <p className="text-sm text-muted-foreground">La inscripción para esta actividad está cerrada.</p>;
            
            // The actual disabling/toast due to being full will happen in handleSignUpDirectly.
            // Here, we just render the button if the activity is open.
            if (activity.tipoAccesoActividad === 'abierta' || activity.tipoAccesoActividad === 'opcion_unica') {
                return (
                    <Button onClick={handleSignUpDirectly} className="bg-green-600 hover:bg-green-700 text-white" disabled={isProcessing}>
                        {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
                        Confirmar Participación
                    </Button>
                );
            }
        }
        return null;
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
            <header className="bg-white dark:bg-slate-800 shadow-sm sticky top-0 z-30">
                 <div className="container mx-auto px-4 py-3 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        {residencia?.logoUrl ? (
                            <img src={residencia.logoUrl} alt={`${residencia.nombre} Logo`} className="h-8 w-auto" />
                        ) : (
                            <Home className="h-7 w-7 text-primary" />
                        )}
                        <div>
                            <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Actividades</h1>
                            <p className="text-xs text-muted-foreground">{residencia?.nombre}</p>
                        </div>
                    </div>
                     <Button variant="ghost" size="sm" onClick={() => auth.signOut().then(() => router.push('/auth/login'))}><LogOut className="mr-2 h-4 w-4"/>Salir</Button>
                </div>
            </header>

            <main className="container mx-auto p-4 md:p-6 space-y-6">
                {(noActivitiesMessage && displayedActivities.length === 0 && !isLoadingPageData) && (
                    <Card className="text-center py-12 bg-white dark:bg-slate-800">
                        <CardHeader>
                            <CalendarDays className="mx-auto h-16 w-16 text-muted-foreground mb-4" />
                            <CardTitle className="text-slate-700 dark:text-slate-200">{noActivitiesMessage.includes("recientes") ? "Actividades Recientes" : "No hay actividades disponibles"}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-muted-foreground">{noActivitiesMessage}</p>
                        </CardContent>
                    </Card>
                )}
                 {(displayedActivities.length === 0 && !noActivitiesMessage && !isLoadingPageData) && (
                     <Card className="text-center py-12 bg-white dark:bg-slate-800"><CardContent><CalendarDays className="mx-auto h-12 w-12 text-muted-foreground mb-2" /><p className="text-muted-foreground">No hay actividades programadas por el momento.</p></CardContent></Card>
                 )}

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {displayedActivities.map(act => (
                        <Card key={act.id} className="flex flex-col shadow-lg hover:shadow-xl transition-shadow duration-300 bg-white dark:bg-slate-800">
                            <CardHeader>
                                <CardTitle className="text-lg font-semibold text-primary">{act.nombre}</CardTitle>
                                <CardDescription className="text-sm text-muted-foreground">
                                    {formatActivityDateRange(act.fechaInicio, act.fechaFin)}
                                </CardDescription>
                                { (act.estado !== 'abierta_inscripcion' && act.estado !== 'borrador' && !noActivitiesMessage?.includes("recientes")) &&
                                  <Badge variant="outline" className={`mt-1 ${act.estado === 'cancelada' ? 'border-red-500 text-red-500 bg-red-50 dark:bg-red-900/30' : 'border-slate-400 text-slate-500 dark:border-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-700/30'}`}>
                                    {act.estado === 'confirmada_finalizada' ? 'Finalizada' : act.estado.replace(/_/g, ' ').toUpperCase()}
                                  </Badge>
                                }
                                { (noActivitiesMessage?.includes("recientes") && (act.estado === 'confirmada_finalizada' || act.estado === 'cancelada') ) && 
                                    <Badge variant="outline" className={`mt-1 ${act.estado === 'cancelada' ? 'border-red-500 text-red-500 bg-red-50 dark:bg-red-900/30' : 'border-slate-400 text-slate-500 dark:border-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-700/30'}`}>
                                        {act.estado === 'confirmada_finalizada' ? 'Finalizada' : 'Cancelada'}
                                    </Badge>
                                }
                            </CardHeader>
                            <CardContent className="flex-grow space-y-2">
                                <p className="text-sm text-slate-700 dark:text-slate-300 line-clamp-3">
                                    {act.descripcionGeneral || "No hay descripción detallada."}
                                </p>
                            </CardContent>
                            <CardFooter className="border-t pt-4 min-h-[70px] flex items-center justify-center bg-slate-50 dark:bg-slate-800/30">
                                {renderActivityCardActions(act)}
                            </CardFooter>
                        </Card>
                    ))}
                </div>
            </main>

            {/* Activity Detail Modal */}
            {showDetailModal && selectedActivity && (
                <>
                    <div className="fixed inset-0 bg-black/60 z-40" onClick={() => {setSelectedActivity(null); setShowDetailModal(false);}}></div>
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <Card className="w-full max-w-lg bg-white dark:bg-slate-800 shadow-xl max-h-[90vh] flex flex-col">
                            <CardHeader className="border-b dark:border-slate-700">
                                <CardTitle className="text-xl text-primary">{selectedActivity.nombre}</CardTitle>
                                <CardDescription>{formatActivityDateRange(selectedActivity.fechaInicio, selectedActivity.fechaFin)}</CardDescription>
                                 <Button variant="ghost" size="icon" className="absolute top-3 right-3 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200" onClick={() => {setSelectedActivity(null); setShowDetailModal(false);}}>
                                    <XCircle className="h-6 w-6" />
                                </Button>
                            </CardHeader>
                            <CardContent className="py-6 px-6 space-y-4 overflow-y-auto flex-grow">
                                <p className="text-sm text-slate-600 dark:text-slate-300">{selectedActivity.descripcionGeneral || "Sin descripción detallada."}</p>
                                
                                {selectedActivity.planComidas && selectedActivity.planComidas.length > 0 && (
                                    <div>
                                        <h4 className="font-semibold text-md mb-2 text-slate-700 dark:text-slate-200">Plan de Comidas Incluido:</h4>
                                        <ul className="space-y-2 text-sm list-disc list-inside pl-1">
                                            {(selectedActivity.planComidas as any[]).map((meal: any) => (
                                                <li key={meal.id} className="text-slate-600 dark:text-slate-400">
                                                    <strong>{meal.nombreGrupoTiempoComida} - {meal.nombreTiempoComida_AlternativaUnica}:</strong>
                                                    <span className="ml-1">{meal.descripcionMeal || "Detalles no especificados."}</span>
                                                    {meal.horaEstimadaMeal && <span className="text-xs text-muted-foreground"> (aprox. {meal.horaEstimadaMeal})</span>}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                                {(!selectedActivity.planComidas || selectedActivity.planComidas.length === 0) && (
                                    <p className="text-sm text-muted-foreground">Esta actividad no tiene un plan de comidas específico detallado.</p>
                                )}
                                 <p className="text-xs text-muted-foreground mt-3">
                                    Acceso: {selectedActivity.tipoAccesoActividad === 'abierta' ? 'Abierta a todos los participantes elegibles.' : 
                                             selectedActivity.tipoAccesoActividad === 'opcion_unica' ? 'Opción única (participación gestionada).' :
                                             'Requiere invitación.'}
                                    {selectedActivity.maxParticipantes && ` Plazas limitadas a ${selectedActivity.maxParticipantes} participantes.`}
                                </p>

                            </CardContent>
                            <CardFooter className="border-t dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 py-4 flex justify-end space-x-3">
                               {renderModalActions(selectedActivity)}
                               <Button variant="outline" onClick={() => {setSelectedActivity(null); setShowDetailModal(false);}}>Cerrar</Button>
                            </CardFooter>
                        </Card>
                    </div>
                </>
            )}
        </div>
    );
}
