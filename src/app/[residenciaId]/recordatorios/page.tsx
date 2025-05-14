'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { db, auth } from '@/lib/firebase'; // Assuming your firebase init is here
import {
    collection,
    query,
    where,
    orderBy,
    onSnapshot,
    doc,
    setDoc,
    updateDoc,
    deleteDoc,
    writeBatch,
    Timestamp,
    serverTimestamp
} from 'firebase/firestore';
import { formatTimestampForInput } from '@/lib/utils'

// --- Auth Hook Import ---
import { useAuthState } from 'react-firebase-hooks/auth';
import { Recordatorio, RecordatorioId, ResidenciaId, UserId, TipoRecurrente, AsistentePermisos, UserProfile, UserRole } from '@/../../shared/models/types'; // Adjusted imports

// UI Components (assuming paths, add actual imports as needed)
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from '@/components/ui/calendar'; // For date picking in form
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast'; // Or your preferred toast mechanism
import { Loader2, PlusCircle, Edit, Trash2, CalendarIcon, Palette } from 'lucide-react';
// import FullCalendar from '@fullcalendar/react'; // We will add this later
// import dayGridPlugin from '@fullcalendar/daygrid'; // and other plugins

const DEFAULT_REMINDER_COLOR = '#3B82F6'; // A nice blue

interface RecordatorioFormData {
    id?: RecordatorioId;
    titulo: string;
    descripcion: string;
    fechaInicio: Date | undefined;
    fechaFin: Date | undefined;
    isSingleDay: boolean;
    isRecurrente: boolean;
    tipoRecurrente?: TipoRecurrente;
    color: string;
}

export default function RecordatoriosPage() {
    const [authUser, authFirebaseLoading, authFirebaseError] = useAuthState(auth);
    const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null); // Renamed state
    const [userProfileLoading, setUserProfileLoading] = useState(true);
    const [userProfileError, setUserProfileError] = useState<string | null>(null);

    // ... other states like [recordatorios, setRecordatorios] ...
    const [canManageAll, setCanManageAll] = useState(false);
    const [canManageOwn, setCanManageOwn] = useState(false);
    const [isReadOnly, setIsReadOnly] = useState(true); 
    
    const router = useRouter();
    const params = useParams();
    const residenciaId = params.residenciaId as ResidenciaId;
    // const { user, loading: authLoading, userProfile } = useAuth(); // Assuming useAuth provides userProfile

    // --- Mocked Auth Data (Replace with actual useAuth) ---
    const authLoading = false;
    const user = { uid: 'mockUserId' as UserId };
    const userProfile: UserProfile | null = {
        id: 'mockUserId' as UserId,
        // email: 'director@example.com',
        // displayName: 'Director Mock',
        // role: UserRole.DIRECTOR, // Or UserRole.ASISTENTE, UserRole.RESIDENTE
        // residenciaId: residenciaId,
        // // Example for asistente:
        // permisosAsistente: {
        //   recor_gest_propias: true,
        //   recor_gest_todas: false,
        // }
    } as UserProfile;
    // --- End Mocked Auth Data ---


    const [recordatorios, setRecordatorios] = useState<Recordatorio[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingRecordatorio, setEditingRecordatorio] = useState<Recordatorio | null>(null);
    const [formData, setFormData] = useState<RecordatorioFormData>({
        titulo: '',
        descripcion: '',
        fechaInicio: undefined,
        fechaFin: undefined,
        isSingleDay: false,
        isRecurrente: false,
        color: DEFAULT_REMINDER_COLOR,
    });
    const [showPastRecordatorios, setShowPastRecordatorios] = useState(false);

    // You'll also need a useEffect to fetch userProfile based on authUser:
    useEffect(() => {
        if (authFirebaseLoading) {
            setUserProfileLoading(true);
            return;
        }
        if (authFirebaseError) {
            console.error("Auth Error:", authFirebaseError);
            toast({ title: "Error de Autenticación", description: authFirebaseError.message, variant: "destructive" });
            setUserProfileLoading(false);
            setCurrentUserProfile(null); // Use the new state setter
            setUserProfileError(authFirebaseError.message);
            return;
        }
        if (!authUser) {
            setUserProfileLoading(false);
            setCurrentUserProfile(null); // Use the new state setter
            // Consider redirecting to login: router.push('/login');
            return;
        }
    
        setUserProfileLoading(true);
        const userProfileRef = doc(db, "userProfiles", authUser.uid); // Assuming "userProfiles" is your collection name
        const unsubscribe = onSnapshot(userProfileRef, (docSnap) => {
            if (docSnap.exists()) {
                setCurrentUserProfile(docSnap.data() as UserProfile); // Use the new state setter
                setUserProfileError(null);
            } else {
                setCurrentUserProfile(null); // Use the new state setter
                setUserProfileError("Perfil de usuario no encontrado.");
                toast({ title: "Error de Perfil", description: "Perfil de usuario no encontrado.", variant: "destructive" });
            }
            setUserProfileLoading(false);
        }, (error) => {
            console.error("Error fetching user profile:", error);
            toast({ title: "Error de Perfil", description: "No se pudo cargar el perfil de usuario.", variant: "destructive" });
            setCurrentUserProfile(null); // Use the new state setter
            setUserProfileError(error.message);
            setUserProfileLoading(false);
        });
    
        return () => unsubscribe();
    }, [authUser, authFirebaseLoading, authFirebaseError]); // Removed router from deps, add if you use it inside for redirect

    useEffect(() => {
        if (userProfileLoading) {
            setIsReadOnly(true);
            setCanManageAll(false);
            setCanManageOwn(false);
            return;
        }

        if (!currentUserProfile) { // Use the new state variable
            setIsReadOnly(true);
            setCanManageAll(false);
            setCanManageOwn(false);
            // console.warn("User profile not available for permission setting."); // Optional: keep for debugging
            return;
        }

        let newCanManageAll = false;
        let newCanManageOwn = false;
        let newIsReadOnly = true;

        // Use string literals for role checking
        if (currentUserProfile.roles?.includes('director')) {
            newCanManageAll = true;
            newCanManageOwn = true;
            newIsReadOnly = false;
        } else if (currentUserProfile.roles?.includes('asistente')) {
            // Use corrected property name: asistentePermisos
            const asistentePerms = currentUserProfile.asistentePermisos;
            if (asistentePerms?.gestionRecordatorios === 'Todos') {
                newCanManageAll = true;
                newCanManageOwn = true;
                newIsReadOnly = false;
            } else if (asistentePerms?.gestionRecordatorios === 'Propios') {
                newCanManageOwn = true;
                newCanManageAll = false; // Explicitly set to false
                newIsReadOnly = false;
            } else { // This covers 'Ninguno' or if gestionRecordatorios is undefined
                newCanManageOwn = false;
                newCanManageAll = false;
                newIsReadOnly = true;
            }

            // If an assistant has no specific recor_ permissions, they remain read-only for this feature.
            if (!newCanManageAll && !newCanManageOwn) {
                newIsReadOnly = true;
            }
        } else if (currentUserProfile.roles?.includes('residente')) {
            newIsReadOnly = true;
            newCanManageAll = false;
            newCanManageOwn = false;
        }
        // If none of the primary roles (director, asistente with perms, residente) are matched,
        // or if roles array is empty/undefined, it defaults to read-only.

        setCanManageAll(newCanManageAll);
        setCanManageOwn(newCanManageOwn);
        setIsReadOnly(newIsReadOnly);

    }, [currentUserProfile, userProfileLoading]); // Depend on the new state variable

    // Fetch Recordatorios
    useEffect(() => {
        // Ensure residenciaId is available and user is authenticated (authUser is enough to gate this)
        if (!residenciaId || !authUser) {
            setRecordatorios([]); // Clear any existing data if no longer authorized or no residenciaId
            setIsLoadingData(false); // No longer loading if we can't fetch
            return;
        }

        setIsLoadingData(true);

        const recordatoriosCollectionRef = collection(db, "recordatorios");
        const q = query(
            recordatoriosCollectionRef,
            where("residenciaId", "==", residenciaId),
            orderBy("fechaInicio", "asc") // Order by start date
        );

        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const fetchedRecordatorios: Recordatorio[] = [];
            querySnapshot.forEach((doc) => {
                // Make sure to cast to Recordatorio and handle Timestamp conversion if necessary
                // The id is already part of the Recordatorio interface, so doc.id is correct
                fetchedRecordatorios.push({ ...doc.data(), id: doc.id } as Recordatorio);
            });
            setRecordatorios(fetchedRecordatorios);
            setIsLoadingData(false);
        }, (error) => {
            console.error("Error fetching recordatorios: ", error);
            toast({
                title: "Error al Cargar Recordatorios",
                description: "No se pudieron obtener los recordatorios. Inténtalo de nuevo.",
                variant: "destructive",
            });
            setRecordatorios([]); // Clear data on error
            setIsLoadingData(false);
        });

        // Cleanup listener on component unmount or when dependencies change
        return () => unsubscribe();

    }, [residenciaId, authUser]); // Dependencies: fetch if residenciaId or user changes

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target;
        if (type === 'checkbox') {
            const checked = (e.target as HTMLInputElement).checked;
            setFormData(prev => {
                const newState = { ...prev, [name]: checked };
                // Interaction (1) & (3) logic
                if (name === 'isSingleDay' && checked) {
                    newState.fechaFin = newState.fechaInicio;
                    if (newState.isRecurrente) { // If recurrent is already true, don't set isSingleDay to false
                        // isSingleDay remains true, fechaFin is separate for recurrence end
                    }
                } else if (name === 'isSingleDay' && !checked && newState.isRecurrente) {
                    // If unchecking single day BUT it's recurrent, force single day back to true
                    newState.isSingleDay = true;
                }

                if (name === 'isRecurrente' && checked) {
                    newState.isSingleDay = true;
                    // fechaFin can now be different from fechaInicio, representing the end of recurrence
                } else if (name === 'isRecurrente' && !checked) {
                    newState.tipoRecurrente = undefined;
                    if (newState.isSingleDay) { // If it was single day (due to recurrence or explicitly)
                        newState.fechaFin = newState.fechaInicio;
                    }
                }
                return newState;
            });
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleDateChange = (date: Date | undefined, fieldName: 'fechaInicio' | 'fechaFin') => {
        setFormData(prev => {
            const newState = { ...prev, [fieldName]: date };
            if (prev.isSingleDay && fieldName === 'fechaInicio') {
                newState.fechaFin = date;
            }
            // If changing fechaInicio while recurrent and singleDay, ensure fechaFin might also need update
            // if it was tied, but generally for recurrence, fechaFin is independent recurrence end.
            return newState;
        });
    };

    const handleColorChange = (color: string) => {
        setFormData(prev => ({ ...prev, color }));
    };

    const handleSelectChange = (value: string, fieldName: 'tipoRecurrente') => {
        setFormData(prev => ({ ...prev, [fieldName]: value as TipoRecurrente }));
    };

    const resetForm = () => {
        setFormData({
            titulo: '',
            descripcion: '',
            fechaInicio: undefined,
            fechaFin: undefined,
            isSingleDay: false,
            isRecurrente: false,
            color: DEFAULT_REMINDER_COLOR,
            tipoRecurrente: undefined,
        });
        setEditingRecordatorio(null);
    };

    const openFormForCreate = () => {
        resetForm();
        setIsFormOpen(true);
    };

    const openFormForEdit = (recordatorio: Recordatorio) => {
        setEditingRecordatorio(recordatorio);
        setFormData({
            id: recordatorio.id,
            titulo: recordatorio.titulo,
            descripcion: recordatorio.descripcion || '',
            fechaInicio: new Date(recordatorio.fechaInicio),
            fechaFin: new Date(recordatorio.fechaFin),
            isSingleDay: recordatorio.isSingleDay,
            isRecurrente: recordatorio.isRecurrente,
            tipoRecurrente: recordatorio.tipoRecurrente,
            color: recordatorio.color || DEFAULT_REMINDER_COLOR,
        });
        setIsFormOpen(true);
    };

    const handleFormSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!authUser || !residenciaId || !currentUserProfile) {
            toast({ title: "Error", description: "Usuario, perfil o residencia no identificados para realizar la acción.", variant: "destructive" });
            return;
        }

        // Permissions check for submit
        if (editingRecordatorio) { // Editing existing
            if (!canManageAll && !(canManageOwn && editingRecordatorio.userId === authUser.uid)) {
                toast({ title: "Acceso Denegado", description: "No tienes permisos para editar este recordatorio.", variant: "destructive" });
                return;
            }
        } else { // Creating new
            if (!canManageAll && !canManageOwn) { // User needs at least own-management rights to create
                 toast({ title: "Acceso Denegado", description: "No tienes permisos para crear recordatorios.", variant: "destructive" });
                return;
            }
        }


        if (!formData.titulo.trim()) {
            toast({ title: "Error de Validación", description: "El título es obligatorio.", variant: "destructive" });
            return;
        }
        if (!formData.fechaInicio) {
            toast({ title: "Error de Validación", description: "La fecha de inicio es obligatoria.", variant: "destructive" });
            return;
        }

        let finalFechaFin = formData.fechaFin;

        if (formData.isSingleDay && !formData.isRecurrente) {
            // For a non-recurrent single day event, fechaFin is the same as fechaInicio
            finalFechaFin = formData.fechaInicio;
        } else if (!finalFechaFin) {
            // If it's a range (not singleDay and not recurrent) or if it IS recurrent, fechaFin is mandatory
            toast({ title: "Error de Validación", description: "La fecha de fin es obligatoria para rangos o recordatorios recurrentes.", variant: "destructive" });
            return;
        }

        // Ensure finalFechaFin is not before fechaInicio
        if (finalFechaFin && formData.fechaInicio && finalFechaFin < formData.fechaInicio) {
            toast({ title: "Error de Validación", description: "La fecha de fin no puede ser anterior a la fecha de inicio.", variant: "destructive" });
            return;
        }

        if (formData.isRecurrente && !formData.tipoRecurrente) {
            toast({ title: "Error de Validación", description: "Debe seleccionar un tipo de recurrencia si el recordatorio es recurrente.", variant: "destructive" });
            return;
        }

        setIsSubmitting(true);

        const recordatorioPayload: Omit<Recordatorio, 'id'> = { // Omit 'id' as Firestore handles it or it's from editingRecordatorio
            userId: editingRecordatorio ? editingRecordatorio.userId : authUser.uid, // Preserve original userId on edit
            residenciaId: residenciaId,
            titulo: formData.titulo.trim(),
            descripcion: formData.descripcion.trim() || '', // Ensure empty string if undefined
            fechaInicio: formData.fechaInicio.toISOString().slice(0,10),
            fechaFin: finalFechaFin.toISOString().slice(0,10), // finalFechaFin is already validated and is a Date
            isSingleDay: formData.isSingleDay,
            isRecurrente: formData.isRecurrente,
            tipoRecurrente: formData.isRecurrente ? formData.tipoRecurrente : undefined, // Set only if recurrent
            color: formData.color || DEFAULT_REMINDER_COLOR,
        };

        try {
            if (editingRecordatorio && editingRecordatorio.id) {
                // Update existing recordatorio
                const recordatorioRef = doc(db, 'recordatorios', editingRecordatorio.id);
                await updateDoc(recordatorioRef, recordatorioPayload);
                toast({ title: "Recordatorio Actualizado", description: "El recordatorio ha sido actualizado correctamente." });
            } else {
                // Create new recordatorio
                // We'll let Firestore generate the ID by using addDoc or by creating a doc ref first
                const newRecordatorioRef = doc(collection(db, 'recordatorios'));
                await setDoc(newRecordatorioRef, { ...recordatorioPayload, id: newRecordatorioRef.id }); // Add the generated ID to the payload
                toast({ title: "Recordatorio Creado", description: "El nuevo recordatorio ha sido creado." });
            }
            setIsFormOpen(false);
            resetForm(); // Reset form fields and editing state
        } catch (error) {
            console.error("Error saving recordatorio: ", error);
            const errorMessage = error instanceof Error ? error.message : "Ocurrió un error desconocido.";
            toast({
                title: "Error al Guardar",
                description: `No se pudo guardar el recordatorio. ${errorMessage}`,
                variant: "destructive"
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteRecordatorio = async (recordatorioId: RecordatorioId) => {
        if (!authUser || !currentUserProfile) {
            toast({ title: "Error", description: "Usuario o perfil no identificados.", variant: "destructive" });
            return;
        }

        const recordatorioToDelete = recordatorios.find(r => r.id === recordatorioId);
        if (!recordatorioToDelete) {
            toast({ title: "Error", description: "Recordatorio no encontrado para eliminar.", variant: "destructive" });
            return;
        }

        // Permissions check for delete
        if (!canManageAll && !(canManageOwn && recordatorioToDelete.userId === authUser.uid)) {
            toast({ title: "Acceso Denegado", description: "No tienes permisos para eliminar este recordatorio.", variant: "destructive" });
            return;
        }
        
        // Past event check (as per initial requirements, past non-recurrent events are not modifiable)
        const isPastNonRecurrent = new Date(recordatorioToDelete.fechaFin) < new Date() && !recordatorioToDelete.isRecurrente;
        if (isPastNonRecurrent) {
            toast({ title: "Operación no permitida", description: "Los recordatorios pasados (no recurrentes) no pueden ser eliminados.", variant: "destructive" });
            return;
        }


        if (!confirm(`¿Estás seguro de que quieres eliminar el recordatorio "${recordatorioToDelete.titulo}"?`)) {
            return;
        }

        setIsSubmitting(true); // Can reuse isSubmitting or have a specific deleting state
        try {
            await deleteDoc(doc(db, "recordatorios", recordatorioId));
            toast({ title: "Recordatorio Eliminado", description: "El recordatorio ha sido eliminado correctamente." });
            // No need to manually update state if onSnapshot is working correctly for deletions
        } catch (error) {
            console.error("Error deleting recordatorio: ", error);
            const errorMessage = error instanceof Error ? error.message : "Ocurrió un error desconocido.";
            toast({
                title: "Error al Eliminar",
                description: `No se pudo eliminar el recordatorio. ${errorMessage}`,
                variant: "destructive"
            });
        } finally {
            setIsSubmitting(false);
        }
    };


    // Filtered and Sorted Recordatorios
    const displayedRecordatorios = useMemo(() => {
        const now = new Date();
        // Ensure date strings are valid before parsing. Add error handling if necessary.
        return recordatorios
            .filter(rec => {
                const fechaFinDate = new Date(rec.fechaFin); // Parse string to Date
                return showPastRecordatorios || fechaFinDate >= now || rec.isRecurrente;
            })
            .sort((a, b) => {
                const dateA = new Date(a.fechaInicio); // Parse string to Date
                const dateB = new Date(b.fechaInicio); // Parse string to Date
                return dateA.getTime() - dateB.getTime();
            });

    }, [recordatorios, showPastRecordatorios]);


    if (authLoading) {
        return <div className="flex justify-center items-center h-screen"><Loader2 className="h-8 w-8 animate-spin" /></div>;
    }

    if (!user) {
        // router.push('/login'); // Or your login page
        return <p className="text-center mt-10">Por favor, inicia sesión para ver esta página.</p>;
    }
    
    // --- Actual form and display ---
    // This will be expanded in the next steps.
    return (
        <div className="container mx-auto p-4">
            <Card>
                <CardHeader>
                    <div className="flex justify-between items-center">
                        <CardTitle>Gestión de Recordatorios</CardTitle>
                        {(!isReadOnly || canManageOwn || canManageAll) && (
                             <Button onClick={openFormForCreate} disabled={isReadOnly && !canManageOwn && !canManageAll}>
                                <PlusCircle className="mr-2 h-4 w-4" /> Añadir Recordatorio
                            </Button>
                        )}
                    </div>
                    <CardDescription>Crea, visualiza, edita y elimina recordatorios y fechas especiales.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="mb-4 flex items-center space-x-2">
                        <Checkbox
                            id="showPast"
                            checked={showPastRecordatorios}
                            onCheckedChange={(checked) => setShowPastRecordatorios(Boolean(checked))}
                        />
                        <label htmlFor="showPast" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                            Mostrar recordatorios pasados
                        </label>
                    </div>

                    {/* Placeholder for FullCalendar or list view */}
                    <div className="mt-6">
                        <h3 className="text-lg font-semibold mb-2">Lista de Recordatorios</h3>
                        {isLoadingData && <Loader2 className="animate-spin my-4" />}
                        {!isLoadingData && displayedRecordatorios.length === 0 && (
                            <p>No hay recordatorios para mostrar.</p>
                        )}
                        {!isLoadingData && displayedRecordatorios.length > 0 && (
                            <ul className="space-y-3">
                                {displayedRecordatorios.map(rec => {
                                    const isPast = new Date(rec.fechaFin) < new Date() && !rec.isRecurrente; // Simple past check for UI
                                    const canEditDeleteThis = canManageAll || (canManageOwn && rec.userId === user.uid);
                                    return (
                                        <li key={rec.id} className={`p-3 rounded-md border flex justify-between items-center ${isPast ? 'bg-gray-100 opacity-70' : 'bg-white'}`} style={{ borderLeft: `4px solid ${rec.color}`}}>
                                            <div>
                                                <h4 className="font-semibold">{rec.titulo}</h4>
                                                <p className="text-sm text-gray-600">{rec.descripcion}</p>
                                                <p className="text-xs text-gray-500">
                                                    {new Date(rec.fechaInicio).toLocaleDateString()}
                                                    {!rec.isSingleDay && ` - ${new Date(rec.fechaFin).toLocaleDateString()}`}
                                                    {rec.isRecurrente && ` (${rec.tipoRecurrente})`}
                                                </p>
                                            </div>
                                            {(!isReadOnly && canEditDeleteThis && (!isPast || showPastRecordatorios)) && (
                                                <div className="space-x-2">
                                                    <Button variant="outline" size="sm" onClick={() => openFormForEdit(rec)} disabled={isPast && !rec.isRecurrente /* Allow editing recurrent past events for their pattern */}>
                                                        <Edit className="h-4 w-4" />
                                                    </Button>
                                                    <Button variant="destructive" size="sm" onClick={() => handleDeleteRecordatorio(rec.id)} disabled={isPast && !rec.isRecurrente}>
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            )}
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Form Dialog */}
            <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
                <DialogContent className="sm:max-w-[525px]">
                    <DialogHeader>
                        <DialogTitle>{editingRecordatorio ? 'Editar' : 'Crear'} Recordatorio</DialogTitle>
                        <DialogDescription>
                            {editingRecordatorio ? 'Modifica los detalles' : 'Añade un nuevo'} recordatorio o fecha especial.
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleFormSubmit}>
                        <div className="grid gap-4 py-4">
                            <div className="grid grid-cols-4 items-center gap-4">
                                <label htmlFor="titulo" className="text-right">Título</label>
                                <Input id="titulo" name="titulo" value={formData.titulo} onChange={handleInputChange} className="col-span-3" required />
                            </div>
                            <div className="grid grid-cols-4 items-center gap-4">
                                <label htmlFor="descripcion" className="text-right">Descripción</label>
                                <Textarea id="descripcion" name="descripcion" value={formData.descripcion} onChange={handleInputChange} className="col-span-3" />
                            </div>

                            {/* Dates */}
                            <div className="grid grid-cols-4 items-center gap-4">
                                <label htmlFor="fechaInicio" className="text-right">Fecha Inicio</label>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button variant={"outline"} className={`col-span-3 justify-start text-left font-normal ${!formData.fechaInicio && "text-muted-foreground"}`}>
                                            <CalendarIcon className="mr-2 h-4 w-4" />
                                            {formData.fechaInicio ? formData.fechaInicio.toLocaleDateString() : <span>Selecciona fecha</span>}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0">
                                        <Calendar mode="single" selected={formData.fechaInicio} onSelect={(d) => handleDateChange(d, 'fechaInicio')} initialFocus />
                                    </PopoverContent>
                                </Popover>
                            </div>

                            {(!formData.isSingleDay || formData.isRecurrente) && ( // Show Fecha Fin if not single day OR if recurrent (recurrent needs an end for the recurrence period)
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <label htmlFor="fechaFin" className="text-right">
                                        {formData.isRecurrente ? 'Finaliza Recurrencia' : 'Fecha Fin'}
                                    </label>
                                    <Popover>
                                        <PopoverTrigger asChild>
                                             <Button variant={"outline"} className={`col-span-3 justify-start text-left font-normal ${!formData.fechaFin && "text-muted-foreground"}`}>
                                                <CalendarIcon className="mr-2 h-4 w-4" />
                                                {formData.fechaFin ? formData.fechaFin.toLocaleDateString() : <span>Selecciona fecha</span>}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0">
                                            <Calendar mode="single" selected={formData.fechaFin} onSelect={(d) => handleDateChange(d, 'fechaFin')} initialFocus disabled={formData.fechaInicio ? { before: formData.fechaInicio } : undefined} />
                                        </PopoverContent>
                                    </Popover>
                                </div>
                            )}

                            {/* Checkboxes */}
                             <div className="col-span-4 flex items-center space-x-2">
                                <Checkbox id="isRecurrente" name="isRecurrente" checked={formData.isRecurrente} onCheckedChange={(checked) => handleInputChange({ target: { name: 'isRecurrente', checked, type: 'checkbox' } } as any)} />
                                <label htmlFor="isRecurrente">Es Recurrente</label>
                            </div>

                           {/* Only show isSingleDay if NOT recurrent. If recurrent, it's implicitly a single day pattern that repeats. */}
                            {!formData.isRecurrente && (
                                <div className="col-span-4 flex items-center space-x-2">
                                    <Checkbox id="isSingleDay" name="isSingleDay" checked={formData.isSingleDay} onCheckedChange={(checked) => handleInputChange({ target: { name: 'isSingleDay', checked, type: 'checkbox' } } as any)} />
                                    <label htmlFor="isSingleDay">Es un solo día</label>
                                </div>
                            )}


                            {/* Tipo Recurrente */}
                            {formData.isRecurrente && (
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <label htmlFor="tipoRecurrente" className="text-right">Tipo Recurrencia</label>
                                    <Select name="tipoRecurrente" value={formData.tipoRecurrente} onValueChange={(value) => handleSelectChange(value, 'tipoRecurrente')}>
                                        <SelectTrigger className="col-span-3">
                                            <SelectValue placeholder="Selecciona tipo" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="semanal">Semanal</SelectItem>
                                            <SelectItem value="quincenal">Quincenal</SelectItem>
                                            <SelectItem value="mensual-diasemana">Mensual (por día de semana)</SelectItem>
                                            <SelectItem value="mensual-diames">Mensual (por día del mes)</SelectItem>
                                            <SelectItem value="anual">Anual</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}

                            {/* Color Picker */}
                            <div className="grid grid-cols-4 items-center gap-4">
                                <label htmlFor="color" className="text-right">Color</label>
                                <div className="col-span-3 flex items-center space-x-2">
                                    <input type="color" id="color" name="color" value={formData.color} onChange={(e) => handleColorChange(e.target.value)} className="h-8 w-10 p-0 border-none cursor-pointer" />
                                    <span className="text-sm opacity-70">{formData.color}</span>
                                </div>
                            </div>
                        </div>
                        <DialogFooter>
                            <DialogClose asChild>
                                <Button type="button" variant="outline">Cancelar</Button>
                            </DialogClose>
                            <Button type="submit" disabled={isSubmitting}>
                                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Guardar Cambios
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

        </div>
    );
}

