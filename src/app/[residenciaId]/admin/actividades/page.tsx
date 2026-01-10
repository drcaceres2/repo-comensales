'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { 
    Timestamp, collection, 
    doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc, 
    query, where, orderBy, 
    writeBatch 
} from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';

// UI Components
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"; // Added CardFooter
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogTrigger,
    AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
    AlertDialogContent, AlertDialogDescription 
} from "@/components/ui/alert-dialog";
import { Loader2, PlusCircle, Trash2, Edit, AlertCircle, CalendarIcon, XIcon } from 'lucide-react';

// Types from firestore.ts
import {
    Residencia,
    Actividad,
    ActividadId,
    TiempoComidaAlternativaUnicaActividad as ActividadMealDefinition,
    TiempoComidaAlternativaUnicaActividadId as ActividadMealDefinitionId,
    ActividadEstado,
    TipoAccesoActividad,
    CentroCosto,
    TiempoComida,
    UserProfile,
    UserRole,
    ResidenciaId,
    CentroCostoId,
    TiempoComidaId,
    DayOfWeekMap, 
    LogActionType,
    LogEntry, 
    UserId 
} from '@/../../shared/models/types';

// Helper to create Log Entries
async function createLogEntry(
    actionType: LogActionType,
    residenciaId: ResidenciaId,
    userId: string | null, 
    details?: string,
    relatedDocPath?: string
) {
    if (!userId) {
        console.warn("Cannot create log entry: User ID is null.");
        return;
    }
    try {
        const logEntryData: Omit<LogEntry, 'id'> = { 
            timestamp: new Date().getTime(),
            userId: userId,
            residenciaId: residenciaId,
            actionType: actionType,
            relatedDocPath: relatedDocPath,
            details: details,
        };
        console.log("Log Entry (mock):", logEntryData);
        // await addDoc(collection(db, "logEntries"), logEntryData);
    } catch (error) {
        console.error("Error creating log entry:", error);
    }
}

const getDefaultMealDefinition = (): ActividadMealDefinition => ({
    id: crypto.randomUUID(), 
    nombreTiempoComida_AlternativaUnica: '',
    nombreGrupoTiempoComida: '',
    ordenGrupoTiempoComida: 0,
    fecha: new Date().toISOString(),
    horaEstimadaMeal: '', 
});

const getDefaultActividad = (residenciaId: ResidenciaId, organizadorUserId: UserId, antelacionDefault?: number): Partial<Actividad> => ({
    residenciaId,
    nombre: '',
    descripcionGeneral: '',
    fechaInicio: new Date().toISOString(),
    fechaFin: new Date().toISOString(),
    ultimoTiempoComidaAntes: undefined,
    primerTiempoComidaDespues: undefined,
    planComidas: [getDefaultMealDefinition()], 
    requiereInscripcion: true,
    tipoAccesoActividad: 'abierta',
    maxParticipantes: undefined,
    diasAntelacionCierreInscripcion: antelacionDefault ?? 7, 
    defaultCentroCostoId: undefined,
    estado: 'borrador',
    organizadorUserId
});

// Helper to convert Firestore Timestamps to yyyy-MM-ddTHH:mm string for datetime-local input
const formatTimestampForInput = (timestamp: string | Date | undefined): string => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    // Format: YYYY-MM-DDTHH:mm
    const pad = (num: number) => num.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};


function AdminActividadesPage() {
    const params = useParams();
    const router = useRouter();
    const residenciaId = params.residenciaId as ResidenciaId;
    const { toast } = useToast();

    const { user: authUser, loading: authLoading, error: authError } = useAuth();
    const [adminUserProfile, setAdminUserProfile] = useState<UserProfile | null>(null);
    const [adminProfileLoading, setAdminProfileLoading] = useState(true);
    const [adminProfileError, setAdminProfileError] = useState<string | null>(null);
    const [isAuthorized, setIsAuthorized] = useState(false);

    const [residencia, setResidencia] = useState<Residencia | null>(null);
    const [actividades, setActividades] = useState<Actividad[]>([]);
    const [centroCostosList, setCentroCostosList] = useState<CentroCosto[]>([]);
    const [tiemposComidaList, setTiemposComidaList] = useState<TiempoComida[]>([]);

    const [isLoadingPageData, setIsLoadingPageData] = useState(true);
    const [pageError, setPageError] = useState<string | null>(null);

    const [showActivityForm, setShowActivityForm] = useState(false);
    const [editingActividad, setEditingActividad] = useState<Actividad | null>(null);
    const [currentActividadFormData, setCurrentActividadFormData] = useState<Partial<Actividad>>(
        {} // Will be initialized by open form handlers
    );
    const [isSavingActividad, setIsSavingActividad] = useState(false);

    // --- Authorization (useEffect hooks as before) ---
    useEffect(() => {
        // ... authUser, authLoading, authError handling ...
        if (authLoading) {
            setAdminProfileLoading(true);
            return;
        }
        if (authError) {
            toast({ title: "Error de Autenticación", description: authError.message, variant: "destructive" });
            setAdminProfileLoading(false);
            router.replace('/'); 
            return;
        }
        if (!authUser) {
            setAdminProfileLoading(false);
            router.replace('/'); 
            return;
        }

        setAdminProfileLoading(true);
        const adminDocRef = doc(db, "users", authUser.uid);
        getDoc(adminDocRef)
            .then((docSnap) => {
                if (docSnap.exists()) {
                    setAdminUserProfile(docSnap.data() as UserProfile);
                } else {
                    setAdminProfileError("Perfil de administrador no encontrado.");
                }
            })
            .catch((error) => {
                console.error("Error fetching admin profile:", error);
                setAdminProfileError(`Error cargando perfil: ${error.message}`);
            })
            .finally(() => setAdminProfileLoading(false));
    }, [authUser, authLoading, authError, router, toast]);

    useEffect(() => {
        // ... isAuthorized logic based on adminUserProfile ...
        if (adminProfileLoading || !adminUserProfile) {
            setIsAuthorized(false);
            return;
        }
        const userRoles = adminUserProfile.roles || [];
        const canManage = userRoles.includes('master') || userRoles.includes('admin') ||
                         (userRoles.includes('director') && adminUserProfile.residenciaId === residenciaId) ||
                         (userRoles.includes('asistente') /* && check for specific 'manage_activities' permission if you have granular perms */);
        
        setIsAuthorized(canManage);
        if (!canManage) {
            setPageError("No tienes permiso para gestionar actividades en esta residencia.");
            setIsLoadingPageData(false); 
        }
    }, [adminUserProfile, adminProfileLoading, residenciaId]);

    // --- Initial Data Fetching (fetchData and its useEffect as before) ---
    const fetchData = useCallback(async () => {
        // ... fetchData logic as before ...
        if (!isAuthorized || !residenciaId) {
            setIsLoadingPageData(false);
            return;
        }
        setIsLoadingPageData(true);
        setPageError(null);
        try {
            const residenciaRef = doc(db, "residencias", residenciaId);
            const residenciaSnap = await getDoc(residenciaRef);
            if (!residenciaSnap.exists()) throw new Error("Residencia no encontrada.");
            const residenciaData = residenciaSnap.data() as Residencia;
            setResidencia(residenciaData);

            const [actividadesSnap, centroCostosSnap, tiemposComidaSnap] = await Promise.all([
                getDocs(query(collection(db, "actividades"), where("residenciaId", "==", residenciaId), orderBy("fechaInicio", "desc"))),
                getDocs(query(collection(db, "centroCostos"), where("residenciaId", "==", residenciaId), where("isActive", "==", true), orderBy("nombre"))),
                getDocs(query(collection(db, "tiemposComida"), where("residenciaId", "==", residenciaId), orderBy("ordenGrupo"), orderBy("nombre"))), 
            ]);
            setActividades(actividadesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Actividad)));
            setCentroCostosList(centroCostosSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as CentroCosto)));
            setTiemposComidaList(tiemposComidaSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as TiempoComida)));
        } catch (err) {
            console.error("Error fetching admin activities data:", err);
            setPageError(err instanceof Error ? err.message : "Error desconocido al cargar datos.");
        } finally {
            setIsLoadingPageData(false);
        }
    }, [isAuthorized, residenciaId, authUser?.uid]);

    useEffect(() => {
        if (isAuthorized && residenciaId) {
            fetchData();
        }
    }, [isAuthorized, residenciaId, fetchData]);

    // --- FORM MANAGEMENT ---
    const handleOpenAddForm = () => {
        setEditingActividad(null);
        setCurrentActividadFormData(getDefaultActividad(residenciaId, authUser!.uid, residencia?.antelacionActividadesDefault));
        setShowActivityForm(true);
    };

    const handleOpenEditForm = (actividad: Actividad) => {
        setEditingActividad(actividad);
        // Ensure Timestamps are correctly handled for form display if they are complex objects
        setCurrentActividadFormData({
            ...actividad,
            // fechaInicio and fechaFin will be formatted for input type="datetime-local" in the form component itself
        });
        setShowActivityForm(true);
    };

    const handleCloseForm = () => {
        setShowActivityForm(false);
        setEditingActividad(null);
        // No need to reset currentActividadFormData here, it will be reset on next open
    };

    const handleFormInputChange = (field: keyof Actividad, value: any) => {
        setCurrentActividadFormData(prev => ({ ...prev, [field]: value }));
    };
    
    // Specific handler for date/time inputs if needed, but often direct value from event.target.value works for datetime-local
    // For example, if using a custom date picker component:
    // const handleDateChange = (field: 'fechaInicio' | 'fechaFin', date: Date | null) => {
    //    setCurrentActividadFormData(prev => ({ ...prev, [field]: date ? date.toISOString() : undefined }));
    // };


    const handleMealPlanChange = (index: number, field: keyof ActividadMealDefinition, value: any) => {
        setCurrentActividadFormData(prev => {
            const newPlanComidas = [...(prev.planComidas || [])];
            newPlanComidas[index] = { ...newPlanComidas[index], [field]: value };
            return { ...prev, planComidas: newPlanComidas };
        });
    };

    const handleAddMealToPlan = () => {
        setCurrentActividadFormData(prev => ({
            ...prev,
            planComidas: [...(prev.planComidas || []), getDefaultMealDefinition()]
        }));
    };

    const handleRemoveMealFromPlan = (index: number) => {
        setCurrentActividadFormData(prev => ({
            ...prev,
            planComidas: (prev.planComidas || []).filter((_, i) => i !== index)
        }));
    };

    // --- CRUD Operations ---
    const handleSubmitActividad = async () => {
        if (!currentActividadFormData.nombre?.trim()) {
            toast({ title: "Error de Validación", description: "El nombre de la actividad es obligatorio.", variant: "destructive" });
            return;
        }
        if (!currentActividadFormData.fechaInicio || !currentActividadFormData.fechaFin) {
            toast({ title: "Error de Validación", description: "Las fechas de inicio y fin son obligatorias.", variant: "destructive" });
            return;
        }
        
        let fechaInicio: string;
        let fechaFin: string;

        try {
            fechaInicio = new Date(currentActividadFormData.fechaInicio).toISOString();
            fechaFin = new Date(currentActividadFormData.fechaFin).toISOString();

            if (new Date(fechaFin).getTime() < new Date(fechaInicio).getTime()) {
                 toast({ title: "Error de Validación", description: "La fecha de fin no puede ser anterior a la fecha de inicio.", variant: "destructive" });
                 return;
            }
        } catch (e) {
            toast({ title: "Error de Fecha", description: "Formato de fecha inválido. Use el selector.", variant: "destructive" });
            return;
        }


        setIsSavingActividad(true);
        const dataToSave: Partial<Actividad> = {
            ...currentActividadFormData,
            fechaInicio: fechaInicio,
            fechaFin: fechaFin,
            residenciaId: residenciaId, // Ensure residenciaId is set
            organizadorUserId: currentActividadFormData.organizadorUserId || authUser!.uid, // Ensure organizer is set
            // Ensure planComidas IDs are strings (they are by default with crypto.randomUUID)
            planComidas: currentActividadFormData.planComidas?.map(meal => ({...meal, id: meal.id || crypto.randomUUID()}))
        };

        try {
            if (editingActividad) { // Update
                const actividadRef = doc(db, "actividades", editingActividad.id);
                await updateDoc(actividadRef, dataToSave);
                setActividades(prev => prev.map(act => act.id === editingActividad.id ? { ...act, ...dataToSave } as Actividad : act).sort((a,b) => new Date(b.fechaInicio).getTime() - new Date(a.fechaInicio).getTime()));
                toast({ title: "Actividad Actualizada", description: `"${dataToSave.nombre}" ha sido actualizada.` });
                await createLogEntry('actividad', residenciaId, authUser!.uid, `Actividad actualizada: ${dataToSave.nombre}`, actividadRef.path);
            } else { // Create
                const docRef = await addDoc(collection(db, "actividades"), { ...dataToSave });
                const newActividad = { id: docRef.id, ...dataToSave } as Actividad;
                setActividades(prev => [newActividad, ...prev].sort((a,b) => new Date(b.fechaInicio).getTime() - new Date(a.fechaInicio).getTime()));
                toast({ title: "Actividad Creada", description: `"${dataToSave.nombre}" ha sido creada.` });
                await createLogEntry('actividad', residenciaId, authUser!.uid, `Actividad creada: ${dataToSave.nombre}`, docRef.path);
            }
            handleCloseForm();
        } catch (error) {
            console.error("Error saving actividad:", error);
            toast({ title: "Error al Guardar", description: `No se pudo guardar la actividad. ${error instanceof Error ? error.message : ''}`, variant: "destructive" });
        } finally {
            setIsSavingActividad(false);
        }
    };

    const handleDeleteActividad = async (actividadId: ActividadId, actividadNombre: string) => {
        // TODO: Check for inscriptions before deleting, or handle cascading deletes (complex)
        // For now, direct delete:
        setIsLoadingPageData(true); // Use a general loading indicator or specific one
        try {
            const actividadRef = doc(db, "actividades", actividadId);
            await deleteDoc(actividadRef);
            setActividades(prev => prev.filter(act => act.id !== actividadId));
            toast({ title: "Actividad Eliminada", description: `"${actividadNombre}" ha sido eliminada.`, variant: "destructive" });
            await createLogEntry('actividad', residenciaId, authUser!.uid, `Actividad eliminada: ${actividadNombre} (ID: ${actividadId})`, actividadRef.path);
        } catch (error) {
            console.error("Error deleting actividad:", error);
            toast({ title: "Error al Eliminar", description: `No se pudo eliminar la actividad. ${error instanceof Error ? error.message : ''}`, variant: "destructive" });
        } finally {
            setIsLoadingPageData(false);
        }
    };

    // --- Render Logic (authLoading, !isAuthorized, isLoadingPageData, pageError as before) ---
    if (authLoading || adminProfileLoading) { /* ... */ }
    if (!isAuthorized || adminProfileError) { /* ... */ }
    if (isLoadingPageData && !actividades.length) { /* ... */ }
    if (pageError) { /* ... */ }


    return (
        <div className="container mx-auto p-4 space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold tracking-tight">
                    Gestionar Actividades para {residencia ? <span className="text-primary">{residencia.nombre}</span> : <Loader2 className="h-6 w-6 animate-spin inline-block" />}
                </h1>
                <Button onClick={handleOpenAddForm}>
                    <PlusCircle className="mr-2 h-5 w-5" /> Añadir Nueva Actividad
                </Button>
            </div>
            
            {/* LIST OF ACTIVITIES - (Card rendering as before, but wire up edit/delete) */}
            <Card>
                <CardHeader>
                    <CardTitle>Lista de Actividades</CardTitle>
                    <CardDescription>Aquí puedes ver y gestionar todas las actividades programadas para la residencia.</CardDescription>
                </CardHeader>
                <CardContent>
                    {/* ... loading/empty states for list ... */}
                    {actividades.length > 0 && (
                        <div className="space-y-4">
                            {actividades.map(act => (
                                <Card key={act.id} className="shadow-md">
                                    <CardHeader>
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <CardTitle className="text-xl">{act.nombre}</CardTitle>
                                                <CardDescription>
                                                    {act.fechaInicio && act.fechaFin ? 
                                                        `${new Date(act.fechaInicio).toLocaleDateString()} - ${new Date(act.fechaFin).toLocaleDateString()}`
                                                        : 'Fechas no definidas'}
                                                </CardDescription>
                                            </div>
                                            <div className="flex space-x-2">
                                                <Button variant="outline" size="sm" onClick={() => handleOpenEditForm(act)}>
                                                    <Edit className="mr-1 h-4 w-4" /> Editar
                                                </Button>
                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild>
                                                        <Button variant="destructive" size="sm">
                                                            <Trash2 className="mr-1 h-4 w-4" /> Eliminar
                                                        </Button>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader>
                                                            <AlertDialogTitle>¿Confirmar eliminación?</AlertDialogTitle>
                                                            <AlertDialogDescription>Se eliminará la actividad "{act.nombre}". Esta acción no se puede deshacer.</AlertDialogDescription>
                                                        </AlertDialogHeader>
                                                        <AlertDialogFooter>
                                                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => handleDeleteActividad(act.id, act.nombre)}>
                                                                Sí, Eliminar
                                                            </AlertDialogAction>
                                                        </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
                                            </div>
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                        <p className="text-sm text-muted-foreground mb-2">{act.descripcionGeneral || "Sin descripción general."}</p>
                                        <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
                                            <span><strong>Estado:</strong> <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${act.estado === 'abierta_inscripcion' ? 'bg-green-100 text-green-700' : act.estado === 'borrador' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-700'}`}>{act.estado}</span></span>
                                            <span><strong>Acceso:</strong> {act.tipoAccesoActividad}</span>
                                            {act.maxParticipantes && <span><strong>Plazas:</strong> {act.maxParticipantes}</span>}
                                            {/* More details can be added here */}
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* FORM MODAL */}
            {showActivityForm && (
                 <>
                    <div className="fixed inset-0 bg-black/50 z-40" onClick={handleCloseForm}></div>
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <Card className="w-full max-w-3xl max-h-[90vh] overflow-y-auto flex flex-col"> {/* Flex column for sticky footer */}
                            <CardHeader className="flex-shrink-0">
                                <CardTitle>{editingActividad ? "Editar Actividad" : "Crear Nueva Actividad"}</CardTitle>
                                <Button variant="ghost" size="icon" className="absolute top-4 right-4" onClick={handleCloseForm}>
                                    <XIcon className="h-5 w-5" />
                                </Button>
                            </CardHeader>
                            <CardContent className="space-y-6 py-4 flex-grow overflow-y-auto"> {/* Added more spacing and py-4 */}
                                {/* Basic Information */}
                                <div className="space-y-2">
                                    <Label htmlFor="act-nombre" className="text-base font-semibold">Información Básica</Label>
                                    <div className="pl-2 space-y-3">
                                        <div>
                                            <Label htmlFor="act-nombre">Nombre de la Actividad *</Label>
                                            <Input 
                                                id="act-nombre" 
                                                value={currentActividadFormData.nombre || ''} 
                                                onChange={(e) => handleFormInputChange('nombre', e.target.value)} 
                                            />
                                        </div>
                                        <div>
                                            <Label htmlFor="act-descripcion">Descripción General</Label>
                                            <Textarea 
                                                id="act-descripcion" 
                                                value={currentActividadFormData.descripcionGeneral || ''} 
                                                onChange={(e) => handleFormInputChange('descripcionGeneral', e.target.value)}
                                                placeholder="Detalles sobre la actividad, qué esperar, etc."
                                            />
                                        </div>
                                    </div>
                                </div>
                                
                                {/* Fechas y Horas */}
                                <div className="space-y-2">
                                     <Label className="text-base font-semibold">Fechas y Horas</Label>
                                     <div className="pl-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <Label htmlFor="act-fechaInicio">Fecha y Hora de Inicio *</Label>
                                            <Input 
                                                id="act-fechaInicio" 
                                                type="datetime-local"
                                                value={formatTimestampForInput(currentActividadFormData.fechaInicio)}
                                                onChange={(e) => handleFormInputChange('fechaInicio', e.target.value)}
                                            />
                                        </div>
                                        <div>
                                            <Label htmlFor="act-fechaFin">Fecha y Hora de Fin *</Label>
                                            <Input 
                                                id="act-fechaFin" 
                                                type="datetime-local"
                                                value={formatTimestampForInput(currentActividadFormData.fechaFin)}
                                                onChange={(e) => handleFormInputChange('fechaFin', e.target.value)}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Configuración de Inscripción */}
                                <div className="space-y-2">
                                    <Label className="text-base font-semibold">Configuración de Inscripción</Label>
                                    <div className="pl-2 space-y-3">
                                        <div className="flex items-center space-x-2">
                                            <Checkbox
                                                id="act-requiereInscripcion"
                                                checked={currentActividadFormData.requiereInscripcion || false}
                                                onCheckedChange={(checked) => handleFormInputChange('requiereInscripcion', Boolean(checked))}
                                            />
                                            <Label htmlFor="act-requiereInscripcion" className="font-normal">Requiere Inscripción</Label>
                                        </div>
                                        <div>
                                            <Label htmlFor="act-tipoAcceso">Tipo de Acceso</Label>
                                            <Select
                                                value={currentActividadFormData.tipoAccesoActividad || 'abierta'}
                                                onValueChange={(value: TipoAccesoActividad) => handleFormInputChange('tipoAccesoActividad', value)}
                                            >
                                                <SelectTrigger id="act-tipoAcceso"><SelectValue placeholder="Seleccionar tipo..." /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="abierta">Abierta a Todos</SelectItem>
                                                    <SelectItem value="invitacion_requerida">Por Invitación</SelectItem>
                                                    <SelectItem value="opcion_unica">Opción Única (Participación gestionada por admin)</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div>
                                                <Label htmlFor="act-maxParticipantes">Máximo de Participantes</Label>
                                                <Input 
                                                    id="act-maxParticipantes" 
                                                    type="number"
                                                    min="0" 
                                                    value={currentActividadFormData.maxParticipantes === undefined ? '' : currentActividadFormData.maxParticipantes}
                                                    onChange={(e) => handleFormInputChange('maxParticipantes', e.target.value === '' ? undefined : parseInt(e.target.value, 10))}
                                                    placeholder="Opcional"
                                                />
                                            </div>
                                            <div>
                                                <Label htmlFor="act-diasAntelacion">Días Antelación Cierre Inscrip.</Label>
                                                <Input 
                                                    id="act-diasAntelacion" 
                                                    type="number" 
                                                    min="0"
                                                    value={currentActividadFormData.diasAntelacionCierreInscripcion === undefined ? '' : currentActividadFormData.diasAntelacionCierreInscripcion}
                                                    onChange={(e) => handleFormInputChange('diasAntelacionCierreInscripcion', e.target.value === '' ? undefined : parseInt(e.target.value, 10))}
                                                    placeholder={`Defecto: ${residencia?.antelacionActividadesDefault ?? 'N/A'}`}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                
                                {/* Configuración de Comidas y Contabilidad */}
                                <div className="space-y-2">
                                    <Label className="text-base font-semibold">Comidas y Contabilidad</Label>
                                     <div className="pl-2 space-y-3">
                                        <div>
                                            <Label htmlFor="act-defaultCentroCosto">Centro de Costo por Defecto</Label>
                                            <Select
                                                value={currentActividadFormData.defaultCentroCostoId || ''}
                                                onValueChange={(value: CentroCostoId) => handleFormInputChange('defaultCentroCostoId', value || undefined)}
                                            >
                                                <SelectTrigger id="act-defaultCentroCosto"><SelectValue placeholder="Seleccionar centro de costo..." /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="">Ninguno</SelectItem>
                                                    {centroCostosList.map(cc => (
                                                        <SelectItem key={cc.id} value={cc.id}>{cc.nombre}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div>
                                            <Label htmlFor="act-ultimoAntes">Última Comida Estándar ANTES de la Actividad</Label>
                                            <Select
                                                value={currentActividadFormData.ultimoTiempoComidaAntes || ''}
                                                onValueChange={(value: TiempoComidaId) => handleFormInputChange('ultimoTiempoComidaAntes', value || undefined)}
                                            >
                                                <SelectTrigger id="act-ultimoAntes"><SelectValue placeholder="Opcional: Seleccionar tiempo..." /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="">Ninguno / No aplica</SelectItem>
                                                    {tiemposComidaList.map(tc => (
                                                        <SelectItem key={tc.id} value={tc.id}>{tc.nombreGrupo} - {tc.nombre} ({tc.dia ? DayOfWeekMap[tc.dia] : ''})</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <p className="text-xs text-muted-foreground mt-1">Define el límite para el plan de comidas de la actividad.</p>
                                        </div>
                                        <div>
                                            <Label htmlFor="act-primeroDespues">Primera Comida Estándar DESPUÉS de la Actividad</Label>
                                            <Select
                                                value={currentActividadFormData.primerTiempoComidaDespues || ''}
                                                onValueChange={(value: TiempoComidaId) => handleFormInputChange('primerTiempoComidaDespues', value || undefined)}
                                            >
                                                <SelectTrigger id="act-primeroDespues"><SelectValue placeholder="Opcional: Seleccionar tiempo..." /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="">Ninguno / No aplica</SelectItem>
                                                    {tiemposComidaList.map(tc => (
                                                        <SelectItem key={tc.id} value={tc.id}>{tc.nombreGrupo} - {tc.nombre} ({tc.dia ? DayOfWeekMap[tc.dia] : ''})</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                </div>

                                {/* Plan de Comidas de la Actividad */}
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center">
                                        <Label className="text-base font-semibold">Plan de Comidas de la Actividad</Label>
                                        <Button variant="outline" size="sm" onClick={handleAddMealToPlan}>
                                            <PlusCircle className="mr-2 h-4 w-4" />Añadir Comida al Plan
                                        </Button>
                                    </div>
                                    {currentActividadFormData.planComidas && currentActividadFormData.planComidas.length > 0 ? (
                                        <div className="pl-2 space-y-4">
                                            {currentActividadFormData.planComidas.map((meal, index) => (
                                                <Card key={meal.id || index} className="p-4 bg-slate-50 dark:bg-slate-800/50">
                                                    <div className="flex justify-between items-start mb-2">
                                                        <p className="font-medium text-sm">Comida #{index + 1}</p>
                                                        <Button 
                                                            variant="ghost" 
                                                            size="icon" 
                                                            className="text-destructive hover:text-destructive/90 h-7 w-7"
                                                            onClick={() => handleRemoveMealFromPlan(index)}
                                                            disabled={(currentActividadFormData.planComidas?.length || 0) <= 1} // Prevent deleting last meal
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                    <div className="space-y-2">
                                                        <div>
                                                            <Label htmlFor={`meal-grupo-${index}`}>Grupo de Comida (Ej: Almuerzo Día 1)</Label>
                                                            <Input 
                                                                id={`meal-grupo-${index}`} 
                                                                value={meal.nombreGrupoTiempoComida}
                                                                onChange={(e) => handleMealPlanChange(index, 'nombreGrupoTiempoComida', e.target.value)}
                                                                placeholder="Ej: Almuerzo Día 1, Cena Especial"
                                                            />
                                                        </div>
                                                        <div>
                                                            <Label htmlFor={`meal-nombre-${index}`}>Nombre Específico (Ej: Menú Excursión)</Label>
                                                            <Input 
                                                                id={`meal-nombre-${index}`} 
                                                                value={meal.nombreTiempoComida_AlternativaUnica}
                                                                onChange={(e) => handleMealPlanChange(index, 'nombreTiempoComida_AlternativaUnica', e.target.value)}
                                                                placeholder="Ej: Picnic en el campo"
                                                            />
                                                        </div>
                                                        <div>
                                                            <Label htmlFor={`meal-descripcion-${index}`}>Descripción (Opcional)</Label>
                                                            <Textarea 
                                                                id={`meal-descripcion-${index}`} 
                                                                value={meal.horaEstimadaMeal || ''}
                                                                onChange={(e) => handleMealPlanChange(index, 'horaEstimadaMeal', e.target.value)}
                                                                placeholder="Detalles del menú, ingredientes, etc."
                                                                rows={2}
                                                            />
                                                        </div>
                                                        <div>
                                                            <Label htmlFor={`meal-hora-${index}`}>Hora Estimada (Opcional)</Label>
                                                            <Input 
                                                                id={`meal-hora-${index}`} 
                                                                type="time"
                                                                value={meal.horaEstimadaMeal || ''}
                                                                onChange={(e) => handleMealPlanChange(index, 'horaEstimadaMeal', e.target.value)}
                                                            />
                                                        </div>
                                                    </div>
                                                </Card>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-sm text-muted-foreground pl-2">No hay comidas definidas para esta actividad.</p>
                                    )}
                                </div>

                                {/* Estado de la Actividad */}
                                <div className="space-y-2">
                                    <Label className="text-base font-semibold">Estado</Label>
                                    <div className="pl-2">
                                        <Label htmlFor="act-estado">Estado de la Actividad</Label>
                                        <Select
                                            value={currentActividadFormData.estado || 'borrador'}
                                            onValueChange={(value: ActividadEstado) => handleFormInputChange('estado', value)}
                                        >
                                            <SelectTrigger id="act-estado"><SelectValue placeholder="Seleccionar estado..." /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="borrador">Borrador</SelectItem>
                                                <SelectItem value="abierta_inscripcion">Abierta para Inscripción</SelectItem>
                                                <SelectItem value="cerrada_inscripcion">Inscripción Cerrada</SelectItem>
                                                <SelectItem value="confirmada_finalizada">Confirmada / Finalizada</SelectItem>
                                                <SelectItem value="cancelada">Cancelada</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            </CardContent>
                            <CardFooter className="flex-shrink-0 flex justify-end space-x-2 sticky bottom-0 bg-background py-4 border-t">
                                <Button variant="outline" onClick={handleCloseForm} disabled={isSavingActividad}>Cancelar</Button>
                                <Button onClick={handleSubmitActividad} disabled={isSavingActividad}>
                                    {isSavingActividad && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    {editingActividad ? "Guardar Cambios" : "Crear Actividad"}
                                </Button>
                            </CardFooter>
                        </Card>
                    </div>
                </>
            )}
        </div>
    );
}

export default AdminActividadesPage;