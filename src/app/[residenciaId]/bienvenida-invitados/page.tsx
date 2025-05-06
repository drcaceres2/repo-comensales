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
import { Calendar as CalendarIcon, Loader2 } from "lucide-react";
import { format, addDays, eachDayOfInterval, isSameDay, parseISO, differenceInDays } from 'date-fns';
import { es } from 'date-fns/locale'; // Spanish locale for date formatting
import { getDocs, collection, query, where, writeBatch, doc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
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
import { getDay, Day } from 'date-fns'; // To get day of week number
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    DialogClose // Added for explicit close button if needed, or use onOpenChange
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area"; // Useful if many meal times exist
import { Textarea } from "@/components/ui/textarea"; // For Step 5
import { Input } from "@/components/ui/input";
// Tooltip imports
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { Info } from 'lucide-react'; // Import Info icon

// --- Firebase Imports ---
import { useAuth } from '@/hooks/useAuth'; // Assuming you have a custom hook for auth state and profile

// Define allowed roles
const ALLOWED_ROLES: UserRole[] = ['invitado'];

// --- Define the MealSelectionModal component (can be inside or outside BienvenidaInvitadosPage) ---
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

export default function BienvenidaInvitadosPage() {
    const router = useRouter();
    const params = useParams();
    const { toast } = useToast();
    const { user, profile, loading: authLoading } = useAuth(); // Use your auth hook

    const residenciaId = params.residenciaId as ResidenciaId;
    
    // --- Wizard State ---
    const TOTAL_STEPS = 5; // Now 0 to 5
    const [currentStep, setCurrentStep] = useState(1);
    const [isLoading, setIsLoading] = useState(false);
    const [isInitialized, setIsInitialized] = useState(false); // Keep for initial auth check

    // --- Step 1 State: Dates ---
    const [isOneDay, setIsOneDay] = useState(false);
    const [startDate, setStartDate] = useState<Date | undefined>();
    const [endDate, setEndDate] = useState<Date | undefined>();

    // --- Step 2 State: Day Selection ---
    // Store selected days as ISO date strings (YYYY-MM-DD) for easier comparison and storage
    const [selectedDays, setSelectedDays] = useState<Set<string>>(new Set());

    // --- Step 3 State: Detail Preference ---
    const [detailPreference, setDetailPreference] = useState<'si' | 'horarios' | 'no_ahora' | undefined>();

    // --- Step 4 State: Meal Data & Selections
    const [tiemposComida, setTiemposComida] = useState<Map<DayOfWeekKey, TiempoComida[]>>(new Map());
    const [alternativas, setAlternativas] = useState<AlternativaTiempoComida[]>([]);
    const [dataLoading, setDataLoading] = useState(false);
    const [dataError, setDataError] = useState<string | null>(null);
    const [selectedDayForModal, setSelectedDayForModal] = useState<Date | null>(null);
    const [mealSelections, setMealSelections] = useState<Record<string, Record<TiempoComidaId, string>>>({});
    const [horariosSolicitud, setHorariosSolicitud] = useState<Map<HorarioSolicitudComidaId, HorarioSolicitudComida>>(new Map());

    // --- Step 5 State: Comments ---
    const [commentText, setCommentText] = useState('');

    // Map date-fns day index (0=Sun, 1=Mon...) to DayOfWeekKey
    const dayIndexToKey: Record<number, DayOfWeekKey> = {
        0: 'domingo', 1: 'lunes', 2: 'martes', 3: 'miercoles', 4: 'jueves', 5: 'viernes', 6: 'sabado'
    };

    // --- Authorization Check ---
    const isAuthorized = useMemo(() => {
        if (authLoading || !profile || !user) return false;
        // Check if user IS an 'invitado' AND belongs to the current residencia
        return profile.residenciaId === residenciaId &&
               profile.roles.includes('invitado' as UserRole);
    }, [profile, user, authLoading, residenciaId]);

    // useEffect for fetching Step 4 data
    useEffect(() => {
        if (currentStep === 4 && residenciaId && isAuthorized) {
            const fetchData = async () => {
                setDataLoading(true);
                setDataError(null);
                console.log("Fetching data for Step 4...");
                try {
                    // Fetch active TiemposComida for the residencia
                    const tiemposQuery = query(
                        collection(db, `residencias/${residenciaId}/tiemposComida`)
                        // Add isActive filter if needed, depends on your data model
                    );
                    const tiemposSnapshot = await getDocs(tiemposQuery);
                    const fetchedTiempos = tiemposSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TiempoComida));

                     // Group tiempos by DayOfWeekKey
                    const tiemposMap = new Map<DayOfWeekKey, TiempoComida[]>();
                    fetchedTiempos.forEach(tc => {
                        const key = tc.dia; // Assuming 'dia' is already DayOfWeekKey
                        const list = tiemposMap.get(key) || [];
                        list.push(tc);
                        // Optional: Sort by ordenGrupo if needed
                        list.sort((a, b) => (a.ordenGrupo ?? 0) - (b.ordenGrupo ?? 0));
                        tiemposMap.set(key, list);
                    });
                    setTiemposComida(tiemposMap);
                    console.log("Fetched TiemposComida:", tiemposMap);

                    // Fetch active AlternativaTiempoComida for the residencia
                    const alternativasQuery = query(
                        collection(db, `residencias/${residenciaId}/alternativasTiempoComida`),
                        where('isActive', '==', true) // Assuming you have an isActive flag
                    );
                    const alternativasSnapshot = await getDocs(alternativasQuery);
                    const fetchedAlternativas = alternativasSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AlternativaTiempoComida));
                    setAlternativas(fetchedAlternativas);
                    console.log("Fetched Alternativas:", fetchedAlternativas);

                    // --- Fetch HorarioSolicitudComida (NEW) ---
                    const horariosQuery = query(
                        collection(db, `residencias/${residenciaId}/horariosSolicitudComida`),
                        where('isActive', '==', true) // Fetch only active schedules
                    );
                    const horariosSnapshot = await getDocs(horariosQuery);
                    const horariosMap = new Map<HorarioSolicitudComidaId, HorarioSolicitudComida>();
                    horariosSnapshot.docs.forEach(doc => {
                        horariosMap.set(doc.id, { id: doc.id, ...doc.data() } as HorarioSolicitudComida);
                    });
                    setHorariosSolicitud(horariosMap);
                    console.log("Fetched HorariosSolicitud:", horariosMap);

                } catch (error) {
                    console.error("Error fetching step 4 data:", error);
                    setDataError("No se pudieron cargar los horarios o alternativas. Intenta recargar la página.");
                    toast({ title: "Error de Carga", description: "No se pudieron cargar los datos necesarios.", variant: "destructive" });
                } finally {
                    setDataLoading(false);
                }
            };
            fetchData();
        }
    }, [currentStep, residenciaId, toast, isAuthorized]);

    // Effect to initialize selected days when dates are set
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

    // --- Event Handlers ---
    const handleNextStep = () => {
        // Add validation per step if needed
        if (currentStep === 1) {
            if (!startDate) {
                toast({ title: "Falta información", description: "Por favor, selecciona la fecha de inicio.", variant: "destructive" });
                return;
            }
            if (!isOneDay && !endDate) {
                toast({ title: "Falta información", description: "Por favor, selecciona la fecha de fin.", variant: "destructive" });
                return;
            }
             if (!isOneDay && endDate && startDate && differenceInDays(endDate, startDate) < 0) {
                toast({ title: "Error en fechas", description: "La fecha de fin no puede ser anterior a la fecha de inicio.", variant: "destructive" });
                return;
            }
        }
        if (currentStep === 2) {
             if (selectedDays.size === 0) {
                toast({ title: "Falta información", description: "Debes seleccionar al menos un día.", variant: "destructive" });
                return;
            }
            // Automatically populate selection if "only one day" was chosen in step 1
            if (isOneDay && startDate && selectedDays.size === 0) {
                setSelectedDays(new Set([format(startDate, 'yyyy-MM-dd')]));
            }
        }
         if (currentStep === 3) {
             if (!detailPreference) {
                 toast({ title: "Falta información", description: "Por favor, selecciona una opción sobre los detalles.", variant: "destructive" });
                 return;
             }
             // If 'no_ahora', maybe finish here or go to a summary step?
             if (detailPreference === 'no_ahora') {
                 // TODO: Implement final submission logic or redirect
                 console.log("User chose not to provide details now. Saving basic info...");
                 handleSubmitWizard(); // Example: Trigger save
                 return; // Skip step 4
             }
              if (detailPreference === 'horarios') {
                 // TODO: Show horarios then proceed to step 4 or allow proceeding
                 console.log("User wants to see schedules first...");
                 // For now, just proceed to step 4, display logic TBD
             }
         }
         if (currentStep < TOTAL_STEPS) { // Go up to Step 5 (Comments)
            // Skip logic from Step 3 remains
            if (currentStep === 3 && detailPreference === 'no_ahora') {
                console.log("Skipping meal details, going to comments step.");
                setCurrentStep(5); // Go directly to Comments
                return;
            }
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

    // AQUI

    const handleSubmitWizard = async () => {
        // --- Validation ---
        if (!user || !profile || !isAuthorized) { // Check isAuthorized again
            toast({ title: "Error", description: "Usuario no autorizado o no identificado.", variant: "destructive" });
            return;
        }
        if (!startDate) {
            toast({ title: "Faltan Datos", description: "Falta la fecha de inicio.", variant: "destructive" });
            return; // Should have been caught earlier, but good safeguard
        }
        // Ensure endDate is set if not a one-day stay
        const finalEndDate = isOneDay ? startDate : endDate;
        if (!finalEndDate) {
            toast({ title: "Faltan Datos", description: "Falta la fecha de fin.", variant: "destructive" });
            return;
        }
    
        setIsLoading(true);
        console.log("Submitting FINAL wizard data for guest:", user.uid);
        console.log("Dates:", startDate, endDate);
        console.log("Selected Days:", Array.from(selectedDays));
        console.log("Detail Preference:", detailPreference);
        console.log("Meal Selections:", mealSelections); // Include meal selections
        console.log("Comment Text:", commentText);

         // --- Define needed variables HERE ---
         const batch = writeBatch(db); // Create a Firestore batch
         const nowServer = serverTimestamp(); // <<< DEFINE nowServer HERE
         const guestDietaId = profile.dietaId; // <<< DEFINE guestDietaId HERE (using logged-in guest's profile)
         console.log("Using Dieta ID for guest:", guestDietaId || "Not set in profile");
         // --- End variable definitions ---

        try {
            // --- Step 1: (Optional) Save overall stay info ---
            // Decide where/if to store this. Perhaps a new 'invitadoStays' collection?
            // Or maybe link elecciones using a common 'stayId'?
            // For now, we focus on creating the Eleccion documents directly.
            // Example: If saving stay info
            /*
            const stayDocRef = doc(collection(db, `residencias/${residenciaId}/invitadoStays`)); // Auto-generate ID
            batch.set(stayDocRef, {
                usuarioId: user.uid, // The logged-in user (invitado, asistente, director?)
                residenciaId: residenciaId,
                fechaInicio: Timestamp.fromDate(startDate),
                fechaFin: Timestamp.fromDate(finalEndDate),
                diasSeleccionados: Array.from(selectedDays), // Store ISO strings
                fechaCreacion: now,
                creadoPor: user.uid, // User who filled the form
            });
            const stayId = stayDocRef.id; // Can use this to link elecciones if needed
            */


            // --- Step 2: Create Eleccion documents from mealSelections ---
            if (detailPreference !== 'no_ahora') {
                for (const dayISO of Object.keys(mealSelections)) {
                    const daySelections = mealSelections[dayISO];
                    const fecha = Timestamp.fromDate(parseISO(dayISO)); // Convert ISO string to Date, then Timestamp

                    for (const tiempoId of Object.keys(daySelections)) {
                        const alternativaIdOrPendiente = daySelections[tiempoId];

                        // --- Skip 'pendiente' selections ---
                        // Decision: Do not create Eleccion documents for meals marked 'pendiente'.
                        // They can be added later by an asistente or director if needed.
                        if (alternativaIdOrPendiente === 'pendiente') {
                            console.log(`Skipping 'pendiente' for ${dayISO}, tiempo ${tiempoId}`);
                            continue;
                        }

                        const alternativaId = alternativaIdOrPendiente;

                        // Find the corresponding AlternativaTiempoComida object to check 'requiereAprobacion'
                        const selectedAlternativa = alternativas.find(alt => alt.id === alternativaId);
                        if (!selectedAlternativa) {
                            console.warn(`Alternativa ${alternativaId} not found for ${dayISO}, tiempo ${tiempoId}. Skipping.`);
                            continue; // Should not happen if data is consistent
                        }

                        // Determine initial approval status
                        const estadoAprobacion: EstadoAprobacion = selectedAlternativa.requiereAprobacion
                            ? 'pendiente'
                            : 'no_requerido';

                        // Define the Eleccion document data
                        const eleccionData: Omit<Eleccion, 'id'> = {
                            usuarioId: user.uid, // <<< Use logged-in user's ID
                            residenciaId: residenciaId,
                            fecha: fecha,
                            tiempoComidaId: tiempoId,
                            alternativaTiempoComidaId: alternativaId,
                            dietaId: guestDietaId || undefined, // <<< Use logged-in user's profile diet
                            solicitado: true,
                            fechaSolicitud: nowServer as Timestamp,
                            estadoAprobacion: estadoAprobacion,
                            origen: 'invitado_wizard' as OrigenEleccion,
                        };

                        // Create a new document reference in the 'elecciones' subcollection
                        // Using residenciaId in the path for easier top-level queries if needed
                        const eleccionDocRef = doc(collection(db, `residencias/${residenciaId}/elecciones`));

                        // Add the set operation to the batch
                        batch.set(eleccionDocRef, eleccionData);
                        console.log(`Adding Eleccion to batch: ${dayISO}, Tiempo: ${tiempoId}, Alt: ${alternativaId}`);
                    }
                }
            } else {
                console.log("Skipping Eleccion creation as 'no_ahora' was selected.");
            }
             // --- Create Comentario document ---
             if (commentText.trim()) {
                console.log("Adding comment to batch for guest:", user.uid);
                const comentarioDocRef = doc(collection(db, `residencias/${residenciaId}/comentarios`));
                batch.set(comentarioDocRef, {
                    usuarioId: user.uid, // Guest is writing the comment about themselves
                    destinatarioId: null, // For directors to see
                    residenciaId: residenciaId,
                    texto: commentText.trim(),
                    fechaEnvio: nowServer,
                    leido: false,
                    archivado: false,
                    relacionadoA: {
                        coleccion: 'usuario',
                        documentoId: user.uid // Link comment to the guest user writing it
                    }
                });
            }
            // --- Commit the batch ---
            console.log("Committing batch...");
            await batch.commit();
            console.log("Batch commit successful!");

            toast({ title: "Estancia Registrada", description: "Los detalles de la estadía y las comidas seleccionadas han sido guardados correctamente." });

            // --- Reset state and potentially redirect ---
            setCurrentStep(1);
            setStartDate(undefined); setEndDate(undefined); setIsOneDay(false); setSelectedDays(new Set());
            setDetailPreference(undefined); setMealSelections({}); // Reset selections
            setCommentText('');
            // Consider redirecting to a confirmation page or back to a relevant dashboard
            // router.push(`/${residenciaId}/invitado-confirmacion`); // Example redirect

        } catch (error) {
            console.error("Error committing wizard data batch:", error);
            toast({
                title: "Error al Guardar",
                description: `No se pudo guardar toda la información (${error instanceof Error ? error.message : 'Error desconocido'}). Revisa las selecciones e intenta de nuevo.`,
                variant: "destructive",
                duration: 7000
            });
        } finally {
            setIsLoading(false);
        }
    };

    // --- Render Logic ---
    if (authLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span className="ml-2">Verificando autorización...</span>
            </div>
        );
    }

    if (!user) {
        // Should not happen if redirected correctly, but good fallback
        router.push('/'); // Redirect to login if not authenticated
        return null; // Render nothing while redirecting
    }

    if (!isInitialized || !isAuthorized) { // Check after initialization completes
        // Show Access Denied only if initialization is done and still not authorized
        if (isInitialized) {
            return (
                <div className="container mx-auto p-4 text-center">
                    <h1 className="text-2xl font-bold mb-4 text-destructive">Acceso Denegado</h1>
                    <p>Debes ser un invitado registrado en esta residencia ({residenciaId}) para acceder a esta página.</p>
                    <Button onClick={() => router.push('/')} className="mt-4">Ir al Inicio</Button>
                </div>
            );
        }
        // Otherwise, still loading auth or initializing, show loader or null
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span className="ml-2">Verificando autorización...</span>
            </div>
        );
    }

    // Calculate days for Step 2 calendar display
    const daysInRange = useMemo(() => {
        if (!startDate || (!endDate && !isOneDay)) return [];
        const end = isOneDay ? startDate : endDate!;
         // Ensure end date is not before start date before generating interval
        if (differenceInDays(end, startDate!) < 0) return [];
        return eachDayOfInterval({ start: startDate!, end: end });
    }, [startDate, endDate, isOneDay]);

    return (
        <div className="container mx-auto p-4 flex justify-center">
            <Card className="w-full max-w-2xl">
                <CardHeader>
                <CardTitle>Bienvenida de Invitado - {profile?.nombre} {profile?.apellido}</CardTitle>
                    <CardDescription>Paso {currentStep} de {TOTAL_STEPS}: Indica los detalles de tu estancia.</CardDescription>
                    {/* TODO: Add a progress bar/indicator here */}
                </CardHeader>
                <CardContent>
                    {/* --- Step 1: Select Dates --- */}
                    {currentStep === 1 && (
                        <div className="space-y-6">
                             <div className="flex items-center space-x-2">
                                 <Checkbox
                                     id="oneDay"
                                     checked={isOneDay}
                                     onCheckedChange={handleOneDayChange}
                                 />
                                 <Label htmlFor="oneDay" className="cursor-pointer">Es solo por un día</Label>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="startDate">Fecha de {isOneDay ? 'la visita' : 'Inicio'}</Label>
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button
                                                variant={"outline"}
                                                className={`w-full justify-start text-left font-normal ${!startDate && "text-muted-foreground"}`}
                                            >
                                                <CalendarIcon className="mr-2 h-4 w-4" />
                                                {startDate ? format(startDate, 'PPP', { locale: es }) : <span>Selecciona fecha</span>}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0">
                                            <Calendar
                                                mode="single"
                                                selected={startDate}
                                                onSelect={(date) => handleDateSelect(date, 'start')}
                                                initialFocus
                                                disabled={(date) => date < new Date(new Date().setHours(0,0,0,0)) } // Disable past dates
                                            />
                                        </PopoverContent>
                                    </Popover>
                                </div>
                                {!isOneDay && (
                                    <div className="space-y-2">
                                        <Label htmlFor="endDate">Fecha de Fin</Label>
                                         <Popover>
                                            <PopoverTrigger asChild>
                                                <Button
                                                    variant={"outline"}
                                                    className={`w-full justify-start text-left font-normal ${!endDate && "text-muted-foreground"}`}
                                                    disabled={!startDate} // Disable if start date is not set
                                                >
                                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                                    {endDate ? format(endDate, 'PPP', { locale: es }) : <span>Selecciona fecha</span>}
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-auto p-0">
                                                <Calendar
                                                    mode="single"
                                                    selected={endDate}
                                                    onSelect={(date) => handleDateSelect(date, 'end')}
                                                    initialFocus
                                                    disabled={(date) => // Disable dates before start date or past dates
                                                        (startDate && date < startDate) ||
                                                        date < new Date(new Date().setHours(0,0,0,0))
                                                    }
                                                />
                                            </PopoverContent>
                                        </Popover>
                                    </div>
                                )}
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
                </CardContent>

                <CardFooter className="flex justify-between">
                        <Button variant="outline" onClick={handlePreviousStep} disabled={currentStep === 1 || isLoading}>
                            Anterior
                        </Button>

                        {/* Case 1: On Step 3 and 'no_ahora' is selected -> Show "Continue", calls handleNextStep */}
                        {currentStep === 3 && detailPreference === 'no_ahora' ? (
                            <Button onClick={handleNextStep} disabled={isLoading || dataLoading}>
                                {/* Changed Label slightly */}
                                Continuar a Comentarios
                            </Button>
                        ) : /* Case 2: On any step BEFORE the last step (and NOT the special Step 3 case) -> Show "Siguiente", calls handleNextStep */
                          currentStep < TOTAL_STEPS ? (
                            <Button onClick={handleNextStep} disabled={isLoading || dataLoading}>
                                Siguiente
                            </Button>
                        ) : /* Case 3: On the LAST step (Step 5) -> Show "Finalize", calls handleSubmitWizard */
                          currentStep === TOTAL_STEPS ? (
                            <Button onClick={handleSubmitWizard} disabled={isLoading || dataLoading}>
                                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                {/* Consistent label */}
                                Finalizar y Guardar Todo
                            </Button>
                        ) : null /* Should not happen */}
                    </CardFooter>
            </Card>
        </div>
    );
}

