'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
// Added Loader2, AlertCircle, Info
import { Calendar as CalendarIcon, Loader2, AlertCircle, Info } from "lucide-react";
import { format, addDays, eachDayOfInterval, isSameDay, parseISO, differenceInDays, getDay, Day } from 'date-fns';
import { es } from 'date-fns/locale';
// Added doc, getDoc
import { getDocs, collection, query, where, writeBatch, doc, serverTimestamp, Timestamp, getDoc } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
// Added UserProfile, UserRole
import {
    TiempoComida,
    AlternativaTiempoComida,
    DayOfWeekKey,
    Eleccion,
    OrigenEleccion,
    EstadoAprobacion,
    HorarioSolicitudComida,
    HorarioSolicitudComidaId,
    TiempoComidaId,
    DayOfWeekMap,
    UserProfile,
    UserRole,
    ResidenciaId
} from '@/models/firestore';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    DialogClose
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";

// --- Firebase Auth Hook Import ---
import { useAuthState } from 'react-firebase-hooks/auth'; // New Auth Hook

// Define allowed roles (though check is more specific now)
// const ALLOWED_ROLES: UserRole[] = ['invitado']; // Keep for reference if needed

// --- MealSelectionModal component (no changes needed here) ---
interface MealSelectionModalProps {
    isOpen: boolean;
    onClose: () => void;
    selectedDate: Date;
    tiempos: TiempoComida[]; // Already filtered for the selected day's DayOfWeekKey
    alternativas: AlternativaTiempoComida[]; // All active alternatives for the residencia
    currentSelections: Record<TiempoComidaId, string>; // Selections for *this* day {tiempoId: alternativaId | 'pendiente'}
    onSave: (daySelections: Record<TiempoComidaId, string>) => void;
    horariosSolicitud: Map<HorarioSolicitudComidaId, HorarioSolicitudComida>;
}
function MealSelectionModal({     
    isOpen,
    onClose,
    selectedDate,
    tiempos,
    alternativas,
    currentSelections,
    onSave,
    horariosSolicitud 
}: MealSelectionModalProps) {
    // ... (Implementation remains the same)
    // Local state to manage selections within the modal before saving
    const [daySelections, setDaySelections] = useState<Record<TiempoComidaId, string>>(currentSelections);

    // Update local state if the initial currentSelections change (e.g., reopening modal)
    useEffect(() => {
        setDaySelections(currentSelections);
    }, [currentSelections, isOpen]); // Reset when modal opens with new/old selections

    const handleSelectionChange = (tiempoId: TiempoComidaId, alternativaIdOrPendiente: string) => {
        setDaySelections(prev => ({
            ...prev,
            [tiempoId]: alternativaIdOrPendiente
        }));
    };

    const handleSave = () => {
        onSave(daySelections);
        // onClose(); // The onSave handler in the parent component should call onClose
    };

     const formattedDate = format(selectedDate, 'EEEE d \'de\' MMMM \'de\' yyyy', { locale: es });

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
             <TooltipProvider delayDuration={200}>
                <DialogContent className="sm:max-w-[480px]"> {/* Adjust width as needed */}
                    <DialogHeader>
                        <DialogTitle>Seleccionar Comidas</DialogTitle>
                        <DialogDescription>
                            Elige tus preferencias para el <span className="font-semibold">{formattedDate}</span>.
                            La opción "Pendiente" indica que no harás una elección ahora.
                        </DialogDescription>
                    </DialogHeader>

                    {/* Use ScrollArea in case of many meal times */}
                    <ScrollArea className="max-h-[60vh] p-4 border rounded-md"> {/* Adjust max height */}
                        <div className="space-y-6">
                            {tiempos.length > 0 ? tiempos.map((tiempo, index) => {
                                // Filter alternatives relevant to this specific TiempoComida
                                const relevantAlternativas = alternativas.filter(alt => alt.tiempoComidaId === tiempo.id);
                                const currentChoice = daySelections[tiempo.id];

                                return (
                                    <div key={tiempo.id}>
                                        <Label className="text-lg font-medium mb-3 block">{tiempo.nombre}</Label>
                                        {relevantAlternativas.length > 0 ? (
                                            <RadioGroup
                                                value={currentChoice}
                                                onValueChange={(value) => handleSelectionChange(tiempo.id, value)}
                                                className="space-y-2"
                                            >
                                                {relevantAlternativas.map((alt) => {
                                                     // Find the associated HorarioSolicitud
                                                     const horario = horariosSolicitud.get(alt.horarioSolicitudComidaId);
                                                     let tooltipContent = `Tipo: ${alt.tipo === 'comedor' ? 'Comedor' : 'Para LLevar'}.`;
                                                     if (alt.requiereAprobacion) {
                                                         tooltipContent += " Requiere aprobación.";
                                                     }
                                                     if (horario) {
                                                         // Format deadline day using DayOfWeekMap
                                                         const deadlineDayName = DayOfWeekMap[horario.dia] || horario.dia;
                                                          tooltipContent += ` Solicitud: ${horario.nombre} (antes de ${deadlineDayName} ${horario.horaSolicitud}hs).`;
                                                     } else {
                                                        tooltipContent += " Horario de solicitud no encontrado.";
                                                     }

                                                     return (
                                                        <div key={alt.id} className="flex items-center space-x-2">
                                                            <RadioGroupItem value={alt.id} id={`${tiempo.id}-${alt.id}`} />
                                                            <Label htmlFor={`${tiempo.id}-${alt.id}`} className="cursor-pointer font-normal flex items-center gap-1.5">
                                                                <span>{alt.nombre}</span>
                                                                 {/* Add Tooltip Trigger */}
                                                                 <Tooltip>
                                                                     <TooltipTrigger asChild>
                                                                         <Info className="h-4 w-4 text-muted-foreground hover:text-primary cursor-help" />
                                                                     </TooltipTrigger>
                                                                     <TooltipContent side="top" className="max-w-xs text-center">
                                                                         <p>{tooltipContent}</p>
                                                                         {/* Optionally add ventanaInicio/Fin here too */}
                                                                         {/* <p className="text-xs">Ventana: {alt.ventanaInicio} - {alt.ventanaFin}</p> */}
                                                                     </TooltipContent>
                                                                 </Tooltip>
                                                            </Label>
                                                        </div>
                                                     );
                                                })}
                                                {/* "Pendiente" option */}
                                                <div className="flex items-center space-x-2 pt-2">
                                                    <RadioGroupItem value="pendiente" id={`${tiempo.id}-pendiente`} />
                                                    <Label htmlFor={`${tiempo.id}-pendiente`} className="cursor-pointer font-normal text-muted-foreground">
                                                        Pendiente (No elegir ahora)
                                                    </Label>
                                                </div>
                                            </RadioGroup>
                                        ) : (
                                            <p className="text-sm text-muted-foreground">No hay alternativas disponibles para este horario.</p>
                                        )}
                                        {/* Add separator between meal times, except for the last one */}
                                        {index < tiempos.length - 1 && <Separator className="mt-6" />}
                                    </div>
                                );
                            }) : (
                                <p className="text-center text-muted-foreground">No hay horarios de comida definidos para este día de la semana.</p>
                            )}
                        </div>
                    </ScrollArea>

                    <DialogFooter className="mt-4">
                        <Button type="button" variant="outline" onClick={onClose}>
                            Cancelar
                        </Button>
                        <Button type="button" onClick={handleSave}>
                            Guardar para este Día
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </TooltipProvider>
        </Dialog>
    );
}

export default function BienvenidaInvitadosPage(): JSX.Element | null { // Allow null return
    const router = useRouter();
    const params = useParams();
    const { toast } = useToast();
    const residenciaId = params.residenciaId as ResidenciaId;

    // --- New Auth & Profile State ---
    const [authUser, authFirebaseLoading, authFirebaseError] = useAuthState(auth);
    const [guestUserProfile, setGuestUserProfile] = useState<UserProfile | null>(null);
    const [guestProfileLoading, setGuestProfileLoading] = useState<boolean>(true);
    const [guestProfileError, setGuestProfileError] = useState<string | null>(null);
    const [isAuthorized, setIsAuthorized] = useState<boolean>(false); // Authorization status

    // --- Wizard State ---
    const TOTAL_STEPS = 5;
    const [currentStep, setCurrentStep] = useState(1);
    const [isLoading, setIsLoading] = useState(false); // For final submission

    // --- Step States (remain the same) ---
    // Step 1: Dates
    const [isOneDay, setIsOneDay] = useState(false);
    const [startDate, setStartDate] = useState<Date | undefined>();
    const [endDate, setEndDate] = useState<Date | undefined>();
    // Step 2: Day Selection
    const [selectedDays, setSelectedDays] = useState<Set<string>>(new Set());
    // Step 3: Detail Preference
    const [detailPreference, setDetailPreference] = useState<'si' | 'horarios' | 'no_ahora' | undefined>();
    // Step 4: Meal Data & Selections
    const [tiemposComida, setTiemposComida] = useState<Map<DayOfWeekKey, TiempoComida[]>>(new Map());
    const [alternativas, setAlternativas] = useState<AlternativaTiempoComida[]>([]);
    const [dataLoading, setDataLoading] = useState(false); // For Step 4 data
    const [dataError, setDataError] = useState<string | null>(null);
    const [selectedDayForModal, setSelectedDayForModal] = useState<Date | null>(null);
    const [mealSelections, setMealSelections] = useState<Record<string, Record<TiempoComidaId, string>>>({});
    const [horariosSolicitud, setHorariosSolicitud] = useState<Map<HorarioSolicitudComidaId, HorarioSolicitudComida>>(new Map());
    // Step 5: Comments
    const [commentText, setCommentText] = useState('');

    const dayIndexToKey: Record<number, DayOfWeekKey> = { 0: 'domingo', 1: 'lunes', 2: 'martes', 3: 'miercoles', 4: 'jueves', 5: 'viernes', 6: 'sabado' };

    // --- useEffect: Handle Auth State & Fetch Guest's Profile ---
    useEffect(() => {
        if (authFirebaseLoading) { setGuestProfileLoading(true); setIsAuthorized(false); return; }
        if (authFirebaseError) { console.error("Auth Error:", authFirebaseError); toast({ title: "Error Autenticación", description: authFirebaseError.message, variant: "destructive" }); setGuestProfileLoading(false); setGuestUserProfile(null); setGuestProfileError(authFirebaseError.message); setIsAuthorized(false); router.replace('/'); return; }
        if (!authUser) { console.log("No user, redirecting."); setGuestProfileLoading(false); setGuestUserProfile(null); setGuestProfileError(null); setIsAuthorized(false); router.replace('/'); return; }

        console.log("User authenticated (UID:", authUser.uid,"). Fetching profile...");
        setGuestProfileLoading(true); setGuestProfileError(null);
        const guestDocRef = doc(db, "users", authUser.uid);
        getDoc(guestDocRef)
            .then((docSnap) => {
                if (docSnap.exists()) { setGuestUserProfile(docSnap.data() as UserProfile); console.log("Guest profile fetched."); }
                else { console.error("Guest profile not found:", authUser.uid); setGuestUserProfile(null); setGuestProfileError("Perfil de invitado no encontrado."); toast({ title: "Error Perfil", description: "No se encontró tu perfil.", variant: "destructive" }); }
            })
            .catch((error) => { console.error("Error fetching guest profile:", error); setGuestUserProfile(null); setGuestProfileError(`Error cargando perfil: ${error.message}`); toast({ title: "Error Perfil", description: `No se pudo cargar tu perfil: ${error.message}`, variant: "destructive" }); })
            .finally(() => setGuestProfileLoading(false));
    }, [authUser, authFirebaseLoading, authFirebaseError, router, toast]);

    // --- useEffect: Handle Authorization ---
    useEffect(() => {
        if (guestProfileLoading) { setIsAuthorized(false); return; } // Wait for profile
        if (guestProfileError || !guestUserProfile) { setIsAuthorized(false); return; } // No profile or error fetching

        // Authorization Check: Must be 'invitado' AND belong to the current residencia
        const isGuest = guestUserProfile.roles.includes('invitado' as UserRole);
        const belongsToResidencia = guestUserProfile.residenciaId === residenciaId;

        if (isGuest && belongsToResidencia) {
            console.log("User authorized as guest for this residencia.");
            setIsAuthorized(true);
        } else {
            console.warn("User is not an authorized guest for this residencia.", { isGuest, belongsToResidencia, profileResId: guestUserProfile.residenciaId, urlResId: residenciaId });
            setIsAuthorized(false);
            // Set error or rely on render logic to show Access Denied
            setGuestProfileError("No autorizado como invitado para esta residencia.");
        }
    }, [guestUserProfile, guestProfileLoading, guestProfileError, residenciaId]);


    // useEffect for fetching Step 4 data (Now depends on isAuthorized)
    useEffect(() => {
        if (currentStep === 4 && residenciaId && isAuthorized) { // Only fetch if authorized
            const fetchData = async () => {
                setDataLoading(true); setDataError(null);
                console.log("Fetching data for Step 4...");
                try {
                    const [tiemposSnap, alternativasSnap, horariosSnap] = await Promise.all([
                        getDocs(query(collection(db, `tiemposComida`), where("residenciaId", "==", residenciaId))), // Query top-level
                        getDocs(query(collection(db, `alternativas`), where("residenciaId", "==", residenciaId), where('isActive', '==', true))), // Query top-level
                        getDocs(query(collection(db, `horariosSolicitud`), where("residenciaId", "==", residenciaId), where('isActive', '==', true))) // Query top-level
                    ]);

                    const fetchedTiempos = tiemposSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as TiempoComida));
                    const tiemposMap = new Map<DayOfWeekKey, TiempoComida[]>();
                    fetchedTiempos.forEach(tc => { const key = tc.dia; const list = tiemposMap.get(key) || []; list.push(tc); list.sort((a, b) => (a.ordenGrupo ?? 0) - (b.ordenGrupo ?? 0)); tiemposMap.set(key, list); });
                    setTiemposComida(tiemposMap);

                    const fetchedAlternativas = alternativasSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as AlternativaTiempoComida));
                    setAlternativas(fetchedAlternativas);

                    const horariosMap = new Map<HorarioSolicitudComidaId, HorarioSolicitudComida>();
                    horariosSnap.docs.forEach(doc => { horariosMap.set(doc.id, { id: doc.id, ...doc.data() } as HorarioSolicitudComida); });
                    setHorariosSolicitud(horariosMap);

                    console.log("Step 4 data fetched.");
                } catch (error) {
                    console.error("Error fetching step 4 data:", error);
                    setDataError("No se pudieron cargar los horarios o alternativas.");
                    toast({ title: "Error Carga", description: "No se pudieron cargar datos necesarios.", variant: "destructive" });
                } finally { setDataLoading(false); }
            };
            fetchData();
        }
    }, [currentStep, residenciaId, toast, isAuthorized]); // Added isAuthorized dependency

    // Effect to initialize selected days (remains the same)
    useEffect(() => {
        if (startDate && endDate && !isOneDay) {
            const intervalDays = eachDayOfInterval({ start: startDate, end: endDate });
            setSelectedDays(new Set(intervalDays.map(day => format(day, 'yyyy-MM-dd'))));
        } else if (startDate && isOneDay) {
            setSelectedDays(new Set([format(startDate, 'yyyy-MM-dd')]));
        } else {
            setSelectedDays(new Set()); // Clear if dates are invalid
        }
    }, [startDate, endDate, isOneDay]);


    // --- Event Handlers (remain largely the same, validation/submit updated) ---
    const handleNextStep = () => { /* ... (same validation, step logic) ... */
        if (currentStep === 1) { 
            if (!startDate) { 
                toast({ title: "Info", description: "Selecciona fecha inicio.", variant: "destructive" }); 
                return; 
            } 
            if (!isOneDay && !endDate) { 
                toast({ title: "Info", description: "Selecciona fecha fin.", variant: "destructive" }); 
                return; 
            } 
            if (!isOneDay && endDate && startDate && differenceInDays(endDate, startDate) < 0) { 
                toast({ title: "Error", description: "Fecha fin anterior a inicio.", variant: "destructive" }); 
                return; 
            } 
        }
        if (currentStep === 2) { 
            if (selectedDays.size === 0) { 
                toast({ title: "Info", description: "Selecciona al menos un día.", variant: "destructive" }); 
                return; 
            } 
            if (isOneDay && startDate && selectedDays.size === 0) { 
                setSelectedDays(new Set([format(startDate, 'yyyy-MM-dd')])); 
            } 
        }
        if (currentStep === 3) { 
            if (!detailPreference) { 
                toast({ title: "Info", description: "Selecciona una opción sobre detalles.", variant: "destructive" }); 
                return; 
            } 
            if (detailPreference === 'no_ahora') { 
                setCurrentStep(5); 
                return; 
            } 
        } // Go direct to comments
        if (currentStep < TOTAL_STEPS) { 
            setCurrentStep(prev => prev + 1); 
        }
    };
    const handlePreviousStep = () => {
        if (currentStep > 1) { // Can go back down to Step 1
            // Skip logic when going back from Step 5 remains
            if (currentStep === 5 && detailPreference === 'no_ahora') {
                setCurrentStep(3);
                return;
            }
           setCurrentStep(prev => prev - 1);
        }
   };

    const handleDateSelect = (date: Date | undefined, type: 'start' | 'end') => {
        if (!date) return;
        if (type === 'start') {
            setStartDate(date);
            if (isOneDay) {
                setEndDate(date); // Keep start and end the same for one day
            } else if (endDate && differenceInDays(endDate, date) < 0) {
                setEndDate(undefined); // Reset end date if it's before new start date
            }
        } else { // type === 'end'
            setEndDate(date);
        }
    };

    const handleOneDayChange = (checked: boolean) => {
        setIsOneDay(checked);
        if (checked && startDate) {
            setEndDate(startDate); // Set end date same as start date
        } else {
             setEndDate(undefined); // Clear end date when switching back to range
        }
    };

    const handleDayToggle = (dayISO: string) => {
         if (isOneDay) return; // Don't allow toggling if only one day option is selected
        setSelectedDays(prev => {
            const newSet = new Set(prev);
            if (newSet.has(dayISO)) {
                newSet.delete(dayISO);
            } else {
                newSet.add(dayISO);
            }
            return newSet;
        });
    };

    // Final Submit - UPDATED to use new auth state
    const handleSubmitWizard = async () => {
        if (!authUser || !guestUserProfile || !isAuthorized) { // Use new state
            toast({ title: "Error", description: "Usuario no autorizado o no identificado.", variant: "destructive" }); return;
        }
        if (!startDate) { toast({ title: "Faltan Datos", description: "Falta fecha inicio.", variant: "destructive" }); return; }
        const finalEndDate = isOneDay ? startDate : endDate;
        if (!finalEndDate) { toast({ title: "Faltan Datos", description: "Falta fecha fin.", variant: "destructive" }); return; }

        setIsLoading(true);
        console.log("Submitting FINAL wizard data for guest:", authUser.uid);
        const batch = writeBatch(db);
        const nowServer = serverTimestamp();
        const guestDietaId = guestUserProfile.dietaId; // Get from fetched profile
        console.log("Using Dieta ID:", guestDietaId || "Not set");

        try {
            // Save Elecciones (only if details were provided)
            if (detailPreference !== 'no_ahora') {
                for (const dayISO of Object.keys(mealSelections)) {
                    const daySelections = mealSelections[dayISO]; const fecha = Timestamp.fromDate(parseISO(dayISO));
                    for (const tiempoId of Object.keys(daySelections)) {
                        const alternativaIdOrPendiente = daySelections[tiempoId];
                        if (alternativaIdOrPendiente === 'pendiente') continue;
                        const alternativaId = alternativaIdOrPendiente;
                        const selectedAlternativa = alternativas.find(alt => alt.id === alternativaId);
                        if (!selectedAlternativa) continue;
                        const estadoAprobacion: EstadoAprobacion = selectedAlternativa.requiereAprobacion ? 'pendiente' : 'no_requerido';
                        const eleccionData: Omit<Eleccion, 'id'> = {
                            usuarioId: authUser.uid, // Use authUser UID
                            residenciaId: residenciaId, fecha: fecha, tiempoComidaId: tiempoId, alternativaTiempoComidaId: alternativaId,
                            dietaId: guestDietaId || undefined, solicitado: true, fechaSolicitud: nowServer as Timestamp, estadoAprobacion: estadoAprobacion,
                            origen: 'invitado_wizard' as OrigenEleccion,
                        };
                        // Use top-level elecciones collection
                        const eleccionDocRef = doc(collection(db, `elecciones`));
                        batch.set(eleccionDocRef, eleccionData);
                    }
                }
            }

            // Save Comment
            if (commentText.trim()) {
                 // Use top-level comentarios collection
                const comentarioDocRef = doc(collection(db, `comentarios`));
                batch.set(comentarioDocRef, {
                    usuarioId: authUser.uid, destinatarioId: null, residenciaId: residenciaId, texto: commentText.trim(),
                    fechaEnvio: nowServer, leido: false, archivado: false,
                    relacionadoA: { coleccion: 'usuario', documentoId: authUser.uid }
                });
            }

            await batch.commit();
            toast({ title: "Estancia Registrada", description: "Detalles guardados correctamente." });
            // Reset state and redirect
            setCurrentStep(1); setStartDate(undefined); setEndDate(undefined); setIsOneDay(false); setSelectedDays(new Set());
            setDetailPreference(undefined); setMealSelections({}); setCommentText('');
            // Redirect to a confirmation or dashboard page if needed
            // router.push(...);
        } catch (error) {
            console.error("Error committing wizard data batch:", error);
            toast({ title: "Error al Guardar", description: `No se pudo guardar (${error instanceof Error ? error.message : 'Error desconocido'}).`, variant: "destructive", duration: 7000 });
        } finally {
            setIsLoading(false);
        }
    };


    // --- Render Logic ---

    // 1. Auth/Profile Loading
    if (authFirebaseLoading || guestProfileLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
                <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
                <p className="text-lg font-medium text-muted-foreground">
                    {authFirebaseLoading ? 'Verificando sesión...' : "Cargando tu perfil..."}
                </p>
            </div>
        );
    }

    // 2. Auth/Profile Error
    if (authFirebaseError || guestProfileError) {
         // Handle specific profile error for unauthorized guest
        const message = guestProfileError === "No autorizado como invitado para esta residencia."
                        ? "No estás autorizado como invitado para esta residencia."
                        : (authFirebaseError?.message || guestProfileError || 'Ocurrió un error crítico.');
         return (
            <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
                <AlertCircle className="h-12 w-12 text-destructive mb-4" />
                <h1 className="text-2xl font-bold text-destructive mb-2">Error</h1>
                <p className="mb-4 text-destructive max-w-md">{message}</p>
                <Button onClick={() => router.replace('/')}>Ir al Inicio</Button>
            </div>
        );
    }

    // 3. Not Authorized (Profile loaded, no errors, but role/residencia mismatch)
    // This should technically be caught by guestProfileError check above now, but keep as fallback
    if (!isAuthorized) {
         return (
             <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
                <AlertCircle className="h-12 w-12 text-destructive mb-4" />
               <h1 className="text-2xl font-bold text-destructive mb-2">Acceso Denegado</h1>
               <p className="mb-4 text-muted-foreground max-w-md">
                   Debes ser un invitado registrado y asignado a esta residencia ({residenciaId}) para usar esta función.
                </p>
                <Button onClick={() => router.replace('/')}>Ir al Inicio</Button>
             </div>
           );
     }

     // --- User is Authorized: Render Wizard ---
     const daysInRange = useMemo(() => {
        if (!startDate || (!endDate && !isOneDay)) return [];
        const end = isOneDay ? startDate : endDate!;
         // Ensure end date is not before start date before generating interval
        if (differenceInDays(end, startDate!) < 0) return [];
        return eachDayOfInterval({ start: startDate!, end: end });
    }, [startDate, endDate, isOneDay]);

    return (
        <div className="container mx-auto p-4 sm:p-6 md:p-8 flex justify-center">
            <Card className="w-full max-w-3xl shadow-lg"> {/* Increased max-width */}
                <CardHeader>
                    <CardTitle className="text-2xl sm:text-3xl">Bienvenida, {guestUserProfile?.nombre || 'Invitado'}!</CardTitle> {/* Use profile name */}
                    <CardDescription>Paso {currentStep} de {TOTAL_STEPS}: Completa los detalles de tu estancia.</CardDescription>
                    {/* Progress Bar */}
                    <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700 mt-2">
                        <div className="bg-primary h-2.5 rounded-full" style={{ width: `${(currentStep / TOTAL_STEPS) * 100}%` }}></div>
                    </div>
                </CardHeader>
                <CardContent className="min-h-[300px]"> {/* Set min-height */}
                    {/* --- Step 1: Select Dates --- */}
                    {currentStep === 1 && ( /* ... Step 1 JSX remains the same ... */
                         <div className="space-y-6"> 
                            <div className="flex items-center space-x-2"> 
                                <Checkbox id="oneDay" checked={isOneDay} onCheckedChange={handleOneDayChange} /> 
                                <Label htmlFor="oneDay" className="cursor-pointer">Es solo por un día</Label> 
                            </div> 
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4"> 
                                <div className="space-y-2"> 
                                    <Label htmlFor="startDate">Fecha de {isOneDay ? 'la visita' : 'Inicio'}</Label> 
                                    <Popover> 
                                        <PopoverTrigger asChild> 
                                            <Button variant={"outline"} className={`w-full justify-start text-left font-nnoteormal ${!startDate && "text-muted-foreground"}`}> 
                                                <CalendarIcon className="mr-2 h-4 w-4" /> {startDate ? format(startDate, 'PPP', { locale: es }) : <span>Selecciona fecha</span>} 
                                            </Button> 
                                        </PopoverTrigger> 
                                        <PopoverContent className="w-auto p-0"> 
                                            <Calendar mode="single" selected={startDate} onSelect={(date) => handleDateSelect(date, 'start')} initialFocus disabled={(date) => date < new Date(new Date().setHours(0,0,0,0)) } /> 
                                        </PopoverContent> 
                                    </Popover> 
                                </div> 
                                {!isOneDay && ( 
                                    <div className="space-y-2"> 
                                        <Label htmlFor="endDate">Fecha de Fin</Label> 
                                        <Popover> 
                                            <PopoverTrigger asChild> 
                                                <Button variant={"outline"} className={`w-full justify-start text-left font-normal ${!endDate && "text-muted-foreground"}`} disabled={!startDate} > <CalendarIcon className="mr-2 h-4 w-4" /> 
                                                    {endDate ? format(endDate, 'PPP', { locale: es }) : <span>Selecciona fecha</span>} 
                                                </Button> 
                                            </PopoverTrigger> 
                                            <PopoverContent className="w-auto p-0"> 
                                                <Calendar mode="single" selected={endDate} onSelect={(date) => handleDateSelect(date, 'end')} initialFocus disabled={(date) => (startDate && date < startDate) || date < new Date(new Date().setHours(0,0,0,0))} /> 
                                            </PopoverContent> 
                                        </Popover> 
                                    </div> )} 
                                </div> 
                            </div>
                        )}

                    {/* --- Step 2: Select Days of Stay --- */}
                    {currentStep === 2 && (
                        <div className="space-y-4">
                             <Label>{isOneDay ? 'Confirma el día de tu visita' : '¿Estarás todos estos días? (Desmarca los días que NO estarás)'}</Label>
                             {daysInRange.length > 0 ? (
                                 <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 gap-2">
                                     {daysInRange.map((day) => {
                                         const dayISO = format(day, 'yyyy-MM-dd');
                                         const isSelected = selectedDays.has(dayISO);
                                         return (
                                             <Button
                                                 key={dayISO}
                                                 variant={isSelected ? 'default' : 'outline'}
                                                 onClick={() => handleDayToggle(dayISO)}
                                                 disabled={isOneDay} // Disable toggling if only one day
                                                 className={`h-16 flex flex-col items-center justify-center text-center p-1 ${isOneDay && 'cursor-not-allowed'}`}
                                             >
                                                 <span className="text-xs capitalize">{format(day, 'EEE', { locale: es })}</span>
                                                 <span className="text-lg font-semibold">{format(day, 'd')}</span>
                                                 <span className="text-xs capitalize">{format(day, 'MMM', { locale: es })}</span>
                                             </Button>
                                         );
                                     })}
                                 </div>
                             ) : (
                                 <p className="text-muted-foreground text-center">Por favor, selecciona las fechas en el paso anterior.</p>
                             )}
                         </div>
                     )}

                    {/* --- Step 3: Detail Preference --- */}
                    {currentStep === 3 && (
                        <div className="space-y-4">
                            <Label>¿Quisieras dar detalles de cada comida?</Label>
                            <RadioGroup value={detailPreference} onValueChange={(value: 'si' | 'horarios' | 'no_ahora') => setDetailPreference(value)}>
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="si" id="pref-si" />
                                    <Label htmlFor="pref-si" className="cursor-pointer">Sí, quiero elegir mis comidas ahora</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="horarios" id="pref-horarios" />
                                    <Label htmlFor="pref-horarios" className="cursor-pointer">Quisiera primero conocer los horarios de las comidas</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="no_ahora" id="pref-no_ahora" />
                                    <Label htmlFor="pref-no_ahora" className="cursor-pointer">No, no tengo estos detalles ahora (se asignará la opción por defecto o 'pendiente')</Label>
                                </div>
                            </RadioGroup>
                        </div>
                    )}

                    {/* --- Step 4: Meal Selection --- */}
                    {currentStep === 4 && (
                        <div className="space-y-4">
                            <Label>Haz clic en un día de tu estancia para seleccionar las comidas</Label>
                            {dataLoading ? (
                                <div className="flex justify-center items-center p-10">
                                    <Loader2 className="h-8 w-8 animate-spin text-primary mr-2" /> Cargando horarios...
                                </div>
                            ) : dataError ? (
                                <p className="text-destructive text-center">{dataError}</p>
                            ) : (
                                <> {/* Use Fragment */}
                                <div className="flex justify-center">
                                    <Calendar
                                            mode="multiple" // Allows visual selection styling, but we control interaction
                                            selected={daysInRange} // Show the full range visually (optional)
                                            modifiers={{
                                                selected: Array.from(selectedDays).map(dayISO => parseISO(dayISO)),
                                                hasSelections: Object.keys(mealSelections)
                                                                .filter(dayISO => Object.keys(mealSelections[dayISO]).length > 0)
                                                                .map(dayISO => parseISO(dayISO)),
                                            }}
                                            modifiersClassNames={{
                                                selected: 'bg-primary text-primary-foreground hover:bg-primary/90 focus:bg-primary',
                                                // Refined style using primary color border (Tailwind variable for --primary isn't directly usable here)
                                                // Using a specific blue that matches #084886 visually
                                                hasSelections: '!border !border-blue-800 rounded-md', // Adjusted style
                                            }}
                                            // Disable clicking on days outside the selected range from Step 2
                                            onDayClick={(day, modifiers, e) => {
                                                const dayISO = format(day, 'yyyy-MM-dd');
                                                if (selectedDays.has(dayISO)) {
                                                    console.log("Opening modal for:", dayISO);
                                                    setSelectedDayForModal(day);
                                                } else {
                                                    console.log("Clicked day not part of stay:", dayISO);
                                                    toast({ title: "Día no incluido", description: "Solo puedes seleccionar comidas para los días de tu estancia.", variant: "default"});
                                                }
                                        }}
                                        locale={es} // Use Spanish locale
                                        showOutsideDays={false} // Don't show days from prev/next month in main grid
                                        // Optionally set month based on startDate
                                        month={startDate}
                                        // Disable navigation if needed, or limit range
                                        // disabled={(date) => !selectedDays.has(format(date, 'yyyy-MM-dd'))} // Alternative: disable non-stay days completely
                                    />
                                </div>
                                {/* --- Render the Modal --- */}
                                {selectedDayForModal && (() => { // Use IIFE to calculate props inline cleanly
                                    const dayKey = dayIndexToKey[getDay(selectedDayForModal)];
                                    const dayISO = format(selectedDayForModal, 'yyyy-MM-dd');
                                    const tiemposForDay = tiemposComida.get(dayKey) || [];
                                    const selectionsForDay = mealSelections[dayISO] || {};

                                    return (
                                        <MealSelectionModal
                                            isOpen={selectedDayForModal !== null}
                                            onClose={() => setSelectedDayForModal(null)}
                                            selectedDate={selectedDayForModal}
                                            tiempos={tiemposForDay}
                                            alternativas={alternativas} // Pass all active alternatives
                                            currentSelections={selectionsForDay}
                                            horariosSolicitud={horariosSolicitud} // Pass the fetched horarios map
                                            onSave={(daySelections) => {
                                                console.log("Saving selections for", dayISO, daySelections);
                                                setMealSelections(prev => ({
                                                    ...prev,
                                                    [dayISO]: daySelections
                                                }));
                                                setSelectedDayForModal(null); // Close modal after save
                                                toast({ title: "Guardado Temporal", description: `Preferencias para ${format(selectedDayForModal, 'PPP', {locale: es})} actualizadas. No olvides finalizar.`});
                                                }}
                                                />
                                            );
                                        })()}
                                </>
                            )}
                        </div>
                    )}
                    {/* --- Step 5: Comments --- */}
                    {currentStep === 5 && (
                        <div className="space-y-2">
                            <Label htmlFor="comments" className="text-lg">¿Algún comentario adicional?</Label>
                            <CardDescription>
                                Si tienes alguna restricción alimentaria adicional, alergia, u otra información relevante
                                que el personal de cocina deba conocer, por favor indícalo aquí.
                            </CardDescription>
                            <Textarea
                                id="comments"
                                value={commentText}
                                onChange={(e) => setCommentText(e.target.value)}
                                placeholder="Escribe tus comentarios aquí..."
                                rows={5}
                                disabled={isLoading}
                            />
                        </div>
                    )}
                </CardContent>

                <CardFooter className="flex justify-between border-t pt-6">
                    {/* Previous Button */}
                    <Button
                        variant="outline"
                        onClick={handlePreviousStep}
                        disabled={currentStep === 1 || isLoading}
                    >
                        Anterior
                    </Button>

                    {/* Next/Submit Button Logic */}
                    {/* Case 1: On Step 3 and 'no_ahora' is selected -> Show "Continue", calls handleNextStep which goes to Step 5 */}
                    {currentStep === 3 && detailPreference === 'no_ahora' ? (
                        <Button onClick={handleNextStep} disabled={isLoading || dataLoading}>
                            Continuar a Comentarios
                        </Button>
                    ) : /* Case 2: On any step BEFORE the last step (and NOT the special Step 3 case) -> Show "Siguiente", calls handleNextStep */
                      currentStep < TOTAL_STEPS ? (
                        <Button onClick={handleNextStep} disabled={isLoading || (currentStep === 4 && dataLoading)}> {/* Disable next on Step 4 if data is loading */}
                            Siguiente
                        </Button>
                    ) : /* Case 3: On the LAST step (Step 5) -> Show "Finalize", calls handleSubmitWizard */
                      currentStep === TOTAL_STEPS ? (
                        <Button onClick={handleSubmitWizard} disabled={isLoading || dataLoading}>
                            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Finalizar y Guardar Todo
                        </Button>
                    ) : null /* Should not happen */}
                </CardFooter>
            </Card>
        </div>
    ); // This should be the end of the main return

} // End of BienvenidaInvitadosPage component
