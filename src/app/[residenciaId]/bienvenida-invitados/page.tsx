'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';

// UI Components
import { Loader2, AlertCircle, Info, Check, Calendar as CalendarIcon, Utensils } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";

// Firebase
import { getDocs, collection, query, where, writeBatch, doc, serverTimestamp, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// Auth & Hooks
import { useAuth } from '@/hooks/useAuth';
import { useToast } from "@/hooks/useToast";
import ProgressBar from './components/ProgressBar';

// Models
import {
    TiempoComida,
    AlternativaTiempoComida,
    ResidenciaId,
    UserProfile,
    UserRole,
    Excepcion
} from '@/../shared/models/types';

// Utils
import { addLogToBatch } from '@/lib/utils';
import { 
    formatoIsoCompletoString, 
    formatToDayOfWeekKey, 
    agregarDias,
    dayOfWeekKeyToDate
} from '@/lib/fechasResidencia';
import { format, differenceInDays, isSameDay, parseISO } from 'date-fns'; // Keeping some light date-fns for UI formatting if needed, but logic uses fechasResidencia
import { es } from 'date-fns/locale';

export default function BienvenidaInvitadosPage(): JSX.Element | null {
    const router = useRouter();
    const params = useParams();
    const { toast } = useToast();
    const residenciaId = params.residenciaId as ResidenciaId;

    // --- Auth & Profile State ---
    const { user: authUser, loading: authFirebaseLoading, error: authFirebaseError } = useAuth();
    const [guestUserProfile, setGuestUserProfile] = useState<UserProfile | null>(null);
    const [guestProfileLoading, setGuestProfileLoading] = useState<boolean>(true);
    const [guestProfileError, setGuestProfileError] = useState<string | null>(null);
    const [isAuthorized, setIsAuthorized] = useState<boolean>(false);

    // --- Wizard State ---
    // Steps: 1. Dates -> 2. Meals -> 3. Comments -> Submit
    const TOTAL_STEPS = 3; 
    const [currentStep, setCurrentStep] = useState(1);
    const [isLoading, setIsLoading] = useState(false);

    // Step 1: Dates
    const [isOneDay, setIsOneDay] = useState(false);
    const [startDate, setStartDate] = useState<Date | undefined>();
    const [endDate, setEndDate] = useState<Date | undefined>();

    // Step 2: Meals
    const [tiemposComida, setTiemposComida] = useState<TiempoComida[]>([]);
    const [principalesAlternativas, setPrincipalesAlternativas] = useState<Map<string, AlternativaTiempoComida>>(new Map()); // Key: tiempoComidaId
    const [dataLoading, setDataLoading] = useState(false);
    const [dataError, setDataError] = useState<string | null>(null);
    
    // Selection State: Set of "YYYY-MM-DD_tiempoComidaId"
    const [selectedMeals, setSelectedMeals] = useState<Set<string>>(new Set());

    // Step 3: Comments
    const [commentText, setCommentText] = useState('');

    // --- Effects ---

    // 1. Auth & Profile
    useEffect(() => {
        if (authFirebaseLoading) { setGuestProfileLoading(true); setIsAuthorized(false); return; }
        if (authFirebaseError) { 
            console.error("Auth Error:", authFirebaseError); 
            setGuestProfileLoading(false); 
            setGuestProfileError(authFirebaseError.message); 
            setIsAuthorized(false); 
            return; 
        }
        if (!authUser) { 
            setGuestProfileLoading(false); 
            setIsAuthorized(false); 
            router.replace('/'); 
            return; 
        }

        setGuestProfileLoading(true); setGuestProfileError(null);
        const guestDocRef = doc(db, "users", authUser.uid);
        getDoc(guestDocRef)
            .then((docSnap) => {
                if (docSnap.exists()) { 
                    setGuestUserProfile(docSnap.data() as UserProfile); 
                } else { 
                    setGuestUserProfile(null); 
                    setGuestProfileError("Perfil de invitado no encontrado."); 
                }
            })
            .catch((error) => { 
                console.error("Error fetching guest profile:", error); 
                setGuestProfileError(`Error cargando perfil: ${error.message}`); 
            })
            .finally(() => setGuestProfileLoading(false));
    }, [authUser, authFirebaseLoading, authFirebaseError, router]);

    // 2. Authorization Check
    useEffect(() => {
        if (guestProfileLoading) return;
        if (guestProfileError || !guestUserProfile) { setIsAuthorized(false); return; }

        const isGuest = guestUserProfile.roles.includes('invitado' as UserRole);
        const belongsToResidencia = guestUserProfile.residenciaId === residenciaId;

        if (isGuest && belongsToResidencia) {
            setIsAuthorized(true);
        } else {
            setGuestProfileError("No autorizado como invitado para esta residencia.");
            setIsAuthorized(false);
        }
    }, [guestUserProfile, guestProfileLoading, guestProfileError, residenciaId]);

    // 3. Fetch Data for Step 2
    useEffect(() => {
        if (currentStep === 2 && residenciaId && isAuthorized) {
            const fetchData = async () => {
                setDataLoading(true); setDataError(null);
                try {
                    // Fetch TiemposComida
                    const tiemposSnap = await getDocs(query(
                        collection(db, `tiemposComida`), 
                        where("residenciaId", "==", residenciaId),
                        where("isActive", "==", true) // Ensure we only get active times
                    ));
                    const tiemposList = tiemposSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as TiempoComida));
                    // Sort by ordenGrupo
                    tiemposList.sort((a, b) => (a.ordenGrupo ?? 99) - (b.ordenGrupo ?? 99));

                    // Fetch Alternativas (Only Principales)
                    const alternativasSnap = await getDocs(query(
                        collection(db, `alternativasTiempoComida`), 
                        where("residenciaId", "==", residenciaId), 
                        where('isActive', '==', true),
                        where('esPrincipal', '==', true)
                    ));
                    
                    const altMap = new Map<string, AlternativaTiempoComida>();
                    alternativasSnap.docs.forEach(doc => {
                        const data = doc.data() as AlternativaTiempoComida;
                        // Avoid duplicate id error by ensuring we don't spread the id from data if it exists
                        const { id: _ignored, ...rest } = data;
                        altMap.set(data.tiempoComidaId, { id: doc.id, ...rest } as AlternativaTiempoComida);
                    });

                    setTiemposComida(tiemposList);
                    setPrincipalesAlternativas(altMap);
                } catch (error) {
                    console.error("Error fetching data:", error);
                    setDataError("Error al cargar los horarios de comida.");
                    toast({ title: "Error", description: "No se pudieron cargar los datos.", variant: "destructive" });
                } finally {
                    setDataLoading(false);
                }
            };
            fetchData();
        }
    }, [currentStep, residenciaId, isAuthorized, toast]);


    // --- Handlers ---

    const handleDateSelect = (date: Date | undefined, type: 'start' | 'end') => {
        if (!date) return;
        if (type === 'start') {
            setStartDate(date);
            if (isOneDay) {
                setEndDate(date);
            } else if (endDate && differenceInDays(endDate, date) < 0) {
                setEndDate(undefined);
            }
        } else {
            setEndDate(date);
        }
    };

    const handleOneDayChange = (checked: boolean) => {
        setIsOneDay(checked);
        if (checked && startDate) {
            setEndDate(startDate);
        } else if (!checked) {
             setEndDate(undefined);
        }
    };

    const handleMealToggle = (dayISO: string, tiempoId: string) => {
        const key = `${dayISO}_${tiempoId}`;
        setSelectedMeals(prev => {
            const newSet = new Set(prev);
            if (newSet.has(key)) newSet.delete(key);
            else newSet.add(key);
            return newSet;
        });
    };

    const handleNext = () => {
        if (currentStep === 1) {
             if (!startDate) { toast({ title: "Faltan datos", description: "Selecciona fecha de inicio.", variant: "destructive" }); return; }
             if (!isOneDay && !endDate) { toast({ title: "Faltan datos", description: "Selecciona fecha de fin.", variant: "destructive" }); return; }
             setCurrentStep(2);
        } else if (currentStep === 2) {
            if (selectedMeals.size === 0) {
                 toast({ title: "Selección vacía", description: "Por favor selecciona al menos una comida.", variant: "destructive" }); 
                 return; 
            }
            setCurrentStep(3);
        }
    };

    const handleBack = () => {
        if (currentStep > 1) setCurrentStep(prev => prev - 1);
    };

    const handleSubmit = async () => {
        if (!authUser || !guestUserProfile) return;
        setIsLoading(true);

        try {
            const batch = writeBatch(db);
            
            // Iterate over selected meals
            selectedMeals.forEach(key => {
                const [dateISO, tiempoId] = key.split('_');
                const principalAlt = principalesAlternativas.get(tiempoId);

                if (!principalAlt) {
                    console.warn(`No principal alternative found for tiempo ${tiempoId}`);
                    return;
                }

                // Create Excepcion (Intention)
                const excepcionRef = doc(collection(db, 'excepciones'));
                const excepcionData: Excepcion = {
                    id: excepcionRef.id,
                    usuarioId: authUser.uid,
                    residenciaId: residenciaId,
                    fecha: dateISO,
                    tiempoComidaId: tiempoId,
                    tipo: 'cambio_alternativa',
                    alternativaTiempoComidaId: principalAlt.id,
                    motivo: 'Solicitud Invitado' + (commentText ? `: ${commentText.substring(0, 50)}...` : ''),
                    origen: 'wizard_invitados',
                    estadoAprobacion: 'no_requiere_aprobacion'
                };

                batch.set(excepcionRef, excepcionData);

                // Log
                addLogToBatch(batch, 'EXCEPCION_CREADA', {
                    residenciaId,
                    targetId: excepcionRef.id,
                    targetCollection: 'excepciones',
                    details: { ...excepcionData, source: 'wizard_invitado' }
                });
            });

            // Save full comment if exists
            if (commentText.trim()) {
                const comentarioDocRef = doc(collection(db, 'comentarios'));
                const newComment = {
                    id: comentarioDocRef.id,
                    residenciaId: residenciaId,
                    autorId: authUser.uid,
                    fechaHoraCreacion: serverTimestamp(),
                    texto: commentText.trim(),
                    categoria: 'comida' as const,
                    estado: 'nuevo' as const,
                };
                batch.set(comentarioDocRef, newComment);

                addLogToBatch(batch, 'COMENTARIO_CREADO', {
                    residenciaId,
                    targetId: comentarioDocRef.id,
                    targetCollection: 'comentarios',
                    details: {
                        autorId: authUser.uid,
                        texto: commentText.trim().substring(0, 100) + '...',
                    }
                });
            }

            await batch.commit();
            toast({ title: "Solicitud Enviada", description: "Tus comidas han sido solicitadas a la administración." });
            
            // Reset
            setCurrentStep(1); setStartDate(undefined); setEndDate(undefined);
            setSelectedMeals(new Set()); setCommentText('');

        } catch (error) {
            console.error("Error submitting:", error);
            toast({ title: "Error", description: "No se pudo enviar la solicitud.", variant: "destructive" });
        } finally {
            setIsLoading(false);
        }
    };

    // --- Render Helpers ---

    const daysInterval = useMemo(() => {
        if (!startDate) return [];
        const end = isOneDay ? startDate : (endDate || startDate);
        if (differenceInDays(end, startDate) < 0) return [];
        
        const days: Date[] = [];
        let current = startDate;
        while (differenceInDays(end, current) >= 0) {
            days.push(current);
            current = new Date(current);
            current.setDate(current.getDate() + 1);
        }
         // Limit to say 30 days to avoid performance issues
        return days.slice(0, 31);
    }, [startDate, endDate, isOneDay]);


    // --- Loading / Error States ---
    if (authFirebaseLoading || guestProfileLoading) {
        return <div className="flex justify-center items-center h-screen"><Loader2 className="animate-spin mr-2" /> Cargando...</div>;
    }
    if (authFirebaseError || guestProfileError || !isAuthorized) {
        return (
            <div className="flex flex-col items-center justify-center p-8 text-center h-screen">
                <AlertCircle className="text-destructive h-12 w-12 mb-4" />
                <h2 className="text-2xl font-bold mb-2">Acceso no disponible</h2>
                <p className="text-muted-foreground">{guestProfileError || "No tienes permisos."}</p>
                <Button className="mt-4" onClick={() => router.replace('/')}>Volver</Button>
            </div>
        );
    }

    return (
        <div className="container mx-auto p-4 flex justify-center min-h-screen items-start pt-10">
            <Card className="w-full max-w-4xl shadow-xl">
                 <CardHeader>
                    <div className="flex justify-between items-center bg-muted/30 p-4 rounded-lg mb-4">
                        <div>
                            <CardTitle className="text-2xl text-primary">Bienvenida, {guestUserProfile?.nombre}!</CardTitle>
                            <CardDescription>Asistente de elección de comidas</CardDescription>
                        </div>
                        <div className="text-sm font-medium text-muted-foreground bg-background px-3 py-1 rounded-full border">
                            Paso {currentStep} de {TOTAL_STEPS}
                        </div>
                    </div>
                    <ProgressBar current={currentStep} total={TOTAL_STEPS} />
                </CardHeader>

                <CardContent className="space-y-6 min-h-[400px]">
                    {/* Step 1: Dates */}
                    {currentStep === 1 && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                             <div className="bg-blue-50 dark:bg-blue-950/20 p-4 rounded-md border border-blue-100 dark:border-blue-900 flex items-start space-x-3">
                                <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                                <p className="text-sm text-blue-800 dark:text-blue-300">
                                    Selecciona el rango de fechas de tu estadía.
                                    Si solo vienes por un día, marca la casilla correspondiente.
                                </p>
                            </div>

                            <div className="flex items-center space-x-2 py-2">
                                <Checkbox id="oneDay" checked={isOneDay} onCheckedChange={handleOneDayChange} />
                                <Label htmlFor="oneDay" className="cursor-pointer text-base">Es solo por un día</Label>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <Label>Fecha de Inicio</Label>
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button variant={"outline"} className={`w-full justify-start text-left font-normal ${!startDate && "text-muted-foreground"}`}>
                                                <CalendarIcon className="mr-2 h-4 w-4" />
                                                {startDate ? format(startDate, 'PPP', { locale: es }) : <span>Selecciona fecha</span>}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0">
                                            <Calendar mode="single" selected={startDate} onSelect={(d) => handleDateSelect(d, 'start')} autoFocus disabled={(date) => date < new Date(new Date().setHours(0,0,0,0))} />
                                        </PopoverContent>
                                    </Popover>
                                </div>
                                {!isOneDay && (
                                    <div className="space-y-2">
                                        <Label>Fecha de Fin</Label>
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <Button variant={"outline"} className={`w-full justify-start text-left font-normal ${!endDate && "text-muted-foreground"}`} disabled={!startDate}>
                                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                                    {endDate ? format(endDate, 'PPP', { locale: es }) : <span>Selecciona fecha</span>}
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-auto p-0">
                                                <Calendar mode="single" selected={endDate} onSelect={(d) => handleDateSelect(d, 'end')} autoFocus disabled={(date) => (startDate && date < startDate) || date < new Date(new Date().setHours(0,0,0,0))} />
                                            </PopoverContent>
                                        </Popover>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Step 2: Meals Selection */}
                    {currentStep === 2 && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <div className="bg-blue-50 dark:bg-blue-950/20 p-4 rounded-md border border-blue-100 dark:border-blue-900 flex items-start space-x-3">
                                <Utensils className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                                <p className="text-sm text-blue-800 dark:text-blue-300">
                                    Marca las casillas de las comidas que realizarás en la residencia. 
                                    Se asignará automáticamente el menú principal.
                                </p>
                            </div>

                            {dataLoading ? (
                                <div className="flex justify-center p-10"><Loader2 className="animate-spin h-8 w-8 text-primary" /></div>
                            ) : dataError ? (
                                <div className="text-destructive text-center p-4">{dataError}</div>
                            ) : (
                                <ScrollArea className="h-[500px] border rounded-md p-4 bg-muted/10">
                                    <div className="space-y-8">
                                        {daysInterval.map((day) => {
                                            const dayISO = format(day, 'yyyy-MM-dd');
                                            const dayName = format(day, 'EEEE d', { locale: es });
                                            const dayKey = formatToDayOfWeekKey(day); // 'lunes', 'martes'... needed for filtering
                                            
                                            // Filter Tiempos available for this day
                                            const availableTiempos = tiemposComida.filter(tc => {
                                                if (tc.dia) {
                                                    return tc.dia === dayKey;
                                                }
                                                // If no day specified, assume it's general or check if it matches via other logic?
                                                // For "Tiempos de comida" of type "aplicacionOrdinaria", they usually have a `dia`. 
                                                // If they don't, they might be generic. But safer to assume most have `dia` in this system.
                                                // Let's include if !tc.dia just in case, or filter strictly.
                                                // The original code used a map by dayKey, so logic was definitely day-based.
                                                return false;
                                            });

                                            if (availableTiempos.length === 0) return null;

                                            return (
                                                <div key={dayISO} className="bg-card border rounded-lg p-4 shadow-sm">
                                                    <h3 className="font-semibold text-lg capitalize text-primary mb-3 border-b pb-2 flex items-center gap-2">
                                                        <CalendarIcon className="h-4 w-4" />
                                                        {dayName}
                                                        <span className="text-sm font-normal text-muted-foreground ml-2 capitalize">
                                                            ({format(day, 'MMMM', { locale: es })})
                                                        </span>
                                                    </h3>
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                                        {availableTiempos.map(tiempo => {
                                                            const isSelected = selectedMeals.has(`${dayISO}_${tiempo.id}`);
                                                            const hasPrincipal = principalesAlternativas.has(tiempo.id);
                                                            
                                                            return (
                                                                <div 
                                                                    key={tiempo.id} 
                                                                    className={`
                                                                        flex items-center space-x-3 p-3 rounded-md border transition-all cursor-pointer bg-background
                                                                        ${isSelected ? 'border-primary shadow-md ring-1 ring-primary/20' : 'hover:border-primary/50 border-border'}
                                                                        ${!hasPrincipal ? 'opacity-50 cursor-not-allowed bg-muted' : ''}
                                                                    `}
                                                                    onClick={() => hasPrincipal && handleMealToggle(dayISO, tiempo.id)}
                                                                >
                                                                    <Checkbox 
                                                                        checked={isSelected} 
                                                                        onCheckedChange={() => hasPrincipal && handleMealToggle(dayISO, tiempo.id)}
                                                                        disabled={!hasPrincipal}
                                                                    />
                                                                    <div className="flex-1">
                                                                        <label className={`text-sm font-medium cursor-pointer block ${!hasPrincipal && 'text-muted-foreground'}`}>
                                                                            {tiempo.nombre}
                                                                        </label>
                                                                        {!hasPrincipal && (
                                                                            <p className="text-[10px] text-destructive font-medium mt-0.5">No disponible</p>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </ScrollArea>
                            )}
                        </div>
                    )}

                    {/* Step 3: Comments */}
                    {currentStep === 3 && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                             <div className="bg-blue-50 dark:bg-blue-950/20 p-4 rounded-md border border-blue-100 dark:border-blue-900 flex items-start space-x-3">
                                <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                                <p className="text-sm text-blue-800 dark:text-blue-300">
                                    Este paso es opcional. Déjanos saber si tienes alguna restricción alimentaria.
                                </p>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="comments" className="text-lg">Comentarios Adicionales</Label>
                                <CardDescription>
                                    Si tienes alguna alergia, restricción alimentaria o nota para la cocina, escríbela aquí.
                                </CardDescription>
                                <Textarea
                                    id="comments"
                                    value={commentText}
                                    onChange={(e) => setCommentText(e.target.value)}
                                    placeholder="Ej: Soy alérgico a las nueces..."
                                    className="min-h-[150px] resize-none text-base"
                                />
                            </div>
                        </div>
                    )}
                </CardContent>

                <CardFooter className="flex justify-between border-t p-6 bg-muted/10 rounded-b-lg">
                    <Button 
                        variant="ghost" 
                        onClick={handleBack} 
                        disabled={currentStep === 1 || isLoading}
                        className="w-24"
                    >
                        Atrás
                    </Button>

                    <div className="flex gap-2">
                        {currentStep < TOTAL_STEPS ? (
                             <Button onClick={handleNext} disabled={dataLoading} className="w-32">
                                Siguiente
                            </Button>
                        ) : (
                            <Button onClick={handleSubmit} disabled={isLoading} className="w-32">
                                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                                Finalizar
                            </Button>
                        )}
                    </div>
                </CardFooter>
            </Card>
        </div>
    );
}
