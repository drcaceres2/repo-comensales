'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation'; // Added useRouter
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
// Models: Added UserProfile, UserRole
import { Residencia, TiempoComida, AlternativaTiempoComida, Comedor, DayOfWeekKey, DayOfWeekMap, TipoAccesoAlternativa, LogEntry, LogActionType, ResidenciaId, ComedorId, HorarioSolicitudComida, HorarioSolicitudComidaId, UserProfile, UserRole, TipoAlternativa } from '@/models/firestore';
// Firestore: Added writeBatch (just in case, though not used here yet)
import { Timestamp, addDoc, collection, query, where, getDocs, doc, getDoc, updateDoc, deleteDoc, writeBatch, deleteField } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
// Auth Hook: Added useAuthState
import { useAuthState } from 'react-firebase-hooks/auth';
// UI Components: Added missing Badge, Loader2, AlertCircle
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge'; // Added Badge

// AlternativaForm component remains unchanged
interface AlternativaFormProps {
    formData: Partial<AlternativaTiempoComida>;
    onFormChange: (field: keyof AlternativaTiempoComida, value: any) => void;
    onSubmit: () => Promise<void>;
    onCancel: () => void;
    isSaving: boolean;
    availableComedores: Comedor[];
    availableHorarios: HorarioSolicitudComida[];
    formTitle: string;
    submitButtonText: string;
}
function AlternativaForm({
    formData,
    onFormChange,
    onSubmit,
    onCancel,
    isSaving,
    availableComedores,
    availableHorarios,
    formTitle,
    submitButtonText
}: AlternativaFormProps) {
    const tipoAccesoOptions: { value: TipoAccesoAlternativa, label: string }[] = [
        { value: 'abierto', label: 'Abierto (Todos)' },
        { value: 'autorizado', label: 'Autorizado (Específico - Lógica Futura)' },
        { value: 'cerrado', label: 'Cerrado (Nadie)' }
    ];

    // Determine if ayuno type is selected
    const isAyuno = formData.tipo === 'ayuno';

    return (
        <div className="mt-4 p-4 border rounded bg-gray-50 dark:bg-gray-800/30 space-y-4">
            <h4 className="font-semibold text-lg">{formTitle}</h4>

            {/* Tipo (Comedor / Para Llevar / Ayuno) */}
            <div>
                <Label>Tipo *</Label>
                <RadioGroup
                    value={formData.tipo || 'comedor'} // Default to 'comedor' if undefined
                    onValueChange={(value) => onFormChange('tipo', value as TipoAlternativa)}
                    className="flex flex-wrap gap-x-4 gap-y-2 mt-1" // Use flex-wrap for smaller screens
                    disabled={isSaving}
                >
                    <div className="flex items-center space-x-2">
                        <RadioGroupItem value="comedor" id="tipo-comedor" disabled={isSaving}/>
                        <Label htmlFor="tipo-comedor" className="font-normal">Comedor</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                        <RadioGroupItem value="paraLlevar" id="tipo-llevar" disabled={isSaving}/>
                        <Label htmlFor="tipo-llevar" className="font-normal">Para Llevar</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                        <RadioGroupItem value="ayuno" id="tipo-ayuno" disabled={isSaving}/>
                        <Label htmlFor="tipo-ayuno" className="font-normal">Ayuno (No Comer)</Label>
                    </div>
                </RadioGroup>
            </div>

            {/* Nombre */}
            <div>
                <Label htmlFor="alt-nombre">Nombre Alternativa *</Label>
                <Input
                    id="alt-nombre"
                    value={formData.nombre || ''}
                    onChange={(e) => onFormChange('nombre', e.target.value)}
                    placeholder={isAyuno ? "Ej. Ayuno, Descanso Digestivo" : "Ej. Menú Principal, Opción Ligera"}
                    disabled={isSaving}
                />
                 <p className="text-xs text-muted-foreground mt-1">Nombre descriptivo para esta opción.</p>
            </div>

             {/* Comedor (Conditional - NOT shown for ayuno) */}
             {formData.tipo === 'comedor' && !isAyuno && ( // Hide if ayuno
                <div>
                    <Label htmlFor="alt-comedor">Comedor Específico *</Label>
                    <Select
                        value={formData.comedorId || ''}
                        onValueChange={(value) => onFormChange('comedorId', value)}
                        disabled={isSaving || availableComedores.length === 0}
                    >
                        <SelectTrigger id="alt-comedor"><SelectValue placeholder="Seleccione un comedor..." /></SelectTrigger>
                        <SelectContent>
                            {availableComedores.length === 0 ? (<SelectItem value="-" disabled>No hay comedores definidos</SelectItem>) : (availableComedores.map(com => (<SelectItem key={com.id} value={com.id}>{com.nombre}</SelectItem>))) }
                        </SelectContent>
                    </Select>
                    {availableComedores.length === 0 && <p className="text-xs text-red-500 mt-1">Defina comedores en la configuración general.</p>}
                     {!formData.comedorId && <p className="text-xs text-destructive mt-1">Requerido para tipo 'Comedor'.</p>}
                </div>
            )}

            {/* Tipo Acceso (Hidden & Forced for Ayuno) */}
            {!isAyuno && (
                <div>
                    <Label htmlFor="alt-acceso">Acceso Permitido</Label>
                    <Select
                        value={formData.tipoAcceso || 'abierto'}
                        onValueChange={(value) => onFormChange('tipoAcceso', value as TipoAccesoAlternativa)}
                        disabled={isSaving}
                    >
                        <SelectTrigger id="alt-acceso"><SelectValue placeholder="Seleccione acceso..." /></SelectTrigger>
                        <SelectContent> {tipoAccesoOptions.map(opt => (<SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>))} </SelectContent>
                    </Select>
                </div>
            )}

            {/* Ventana Horaria (Hidden & Forced for Ayuno) */}
            {!isAyuno && (
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <Label htmlFor="alt-ventana-inicio">Ventana Inicio (HH:mm)</Label>
                        <Input id="alt-ventana-inicio" type="time" value={formData.ventanaInicio || ''} onChange={(e) => onFormChange('ventanaInicio', e.target.value)} disabled={isSaving}/>
                        <div className="flex items-center space-x-2 mt-1"> <Checkbox id="alt-inicia-dia-anterior" checked={formData.iniciaDiaAnterior || false} onCheckedChange={(checked) => onFormChange('iniciaDiaAnterior', Boolean(checked))} disabled={isSaving}/> <Label htmlFor="alt-inicia-dia-anterior" className="text-xs font-normal">¿Inicia día ant.?</Label> </div>
                    </div>
                    <div>
                        <Label htmlFor="alt-ventana-fin">Ventana Fin (HH:mm)</Label>
                        <Input id="alt-ventana-fin" type="time" value={formData.ventanaFin || ''} onChange={(e) => onFormChange('ventanaFin', e.target.value)} disabled={isSaving}/>
                        <div className="flex items-center space-x-2 mt-1"> <Checkbox id="alt-termina-dia-siguiente" checked={formData.terminaDiaSiguiente || false} onCheckedChange={(checked) => onFormChange('terminaDiaSiguiente', Boolean(checked))} disabled={isSaving}/> <Label htmlFor="alt-termina-dia-siguiente" className="text-xs font-normal">¿Termina día sig.?</Label> </div>
                    </div>
                </div>
            )}

            {/* Horario Solicitud Dropdown (ALWAYS required) */}
            <div>
                <Label htmlFor="alt-horario-solicitud">Regla de Solicitud Asociada *</Label>
                <Select
                    value={formData.horarioSolicitudComidaId || ''}
                    onValueChange={(value) => onFormChange('horarioSolicitudComidaId', value)}
                    // Enable even for ayuno, as it dictates *when* the choice (even ayuno) must be made
                    disabled={isSaving || availableHorarios.length === 0}
                >
                    <SelectTrigger id="alt-horario-solicitud"><SelectValue placeholder="Seleccione una regla..." /></SelectTrigger>
                    <SelectContent>
                        {availableHorarios.length === 0 ? (<SelectItem value="-" disabled>No hay reglas de solicitud</SelectItem>) : (availableHorarios.map(h => (<SelectItem key={h.id} value={h.id}>{h.nombre} ({DayOfWeekMap[h.dia]} {h.horaSolicitud})</SelectItem>)))}
                    </SelectContent>
                </Select>
                {availableHorarios.length === 0 && <p className="text-xs text-red-500 mt-1">Defina (y active) reglas de solicitud en la config. general.</p>}
                {!formData.horarioSolicitudComidaId && <p className="text-xs text-destructive mt-1">Este campo es requerido.</p>}
            </div>

            {/* isActive is only shown during EDIT */}
             {formTitle.startsWith("Editando") && (
                 <div className="flex items-center space-x-2 pt-2">
                     <Checkbox
                         id="alt-isActive"
                         checked={formData.isActive === undefined ? true : formData.isActive}
                         onCheckedChange={(checked) => onFormChange('isActive', Boolean(checked))}
                         disabled={isSaving}
                     />
                     <Label htmlFor="alt-isActive" className="font-normal">Alternativa Activa</Label>
                 </div>
             )}

            {/* Action Buttons */}
            <div className="flex space-x-2 pt-2">
                <Button onClick={onSubmit} disabled={isSaving}> {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} {isSaving ? 'Guardando...' : submitButtonText} </Button>
                <Button variant="outline" onClick={onCancel} disabled={isSaving}> Cancelar </Button>
            </div>
        </div>
    );
}

// Log Helper Function - Updated to use authUser.uid
async function createLogEntry(
    actionType: LogActionType,
    residenciaId: ResidenciaId,
    userId: string | null, // Accept uid
    details?: string,
    relatedDocPath?: string
) {
    if (!userId) {
        console.warn("Cannot create log entry: User ID is null.");
        return; // Don't log if user is not identified
    }
    try {
        const logEntryData: Omit<LogEntry, 'id'> = {
            timestamp: Timestamp.now(),
            userId: userId, // Use the passed UID
            residenciaId: residenciaId,
            actionType: actionType,
            relatedDocPath: relatedDocPath,
            details: details,
        };
        console.log("Log Entry:", logEntryData);
        // Uncomment to write to Firestore
        // await addDoc(collection(db, "logEntries"), logEntryData);
    } catch (error) {
        console.error("Error creating log entry:", error);
    }
}

export default function HorariosResidenciaPage(): JSX.Element | null { // Allow null return
    const params = useParams();
    const router = useRouter();
    const residenciaId = params.residenciaId as ResidenciaId;
    const { toast } = useToast();

    // --- Auth & Profile State ---
    const [authUser, authFirebaseLoading, authFirebaseError] = useAuthState(auth);
    const [adminUserProfile, setAdminUserProfile] = useState<UserProfile | null>(null);
    const [adminProfileLoading, setAdminProfileLoading] = useState<boolean>(true);
    const [adminProfileError, setAdminProfileError] = useState<string | null>(null);
    const [isAuthorized, setIsAuthorized] = useState<boolean>(false);

    // --- Page Data State ---
    const [residenciaNombre, setResidenciaNombre] = useState<string>('');
    const [isLoadingPageData, setIsLoadingPageData] = useState(true); // Combined loading for page data
    const [errorPageData, setErrorPageData] = useState<string | null>(null); // Combined error for page data
    const [tiemposComida, setTiemposComida] = useState<TiempoComida[]>([]);
    const [alternativas, setAlternativas] = useState<AlternativaTiempoComida[]>([]);
    const [comedores, setComedores] = useState<Comedor[]>([]);
    const [horariosSolicitud, setHorariosSolicitud] = useState<HorarioSolicitudComida[]>([]);

    // --- Form States (remain the same) ---
    // TiempoComida Add/Edit
    const [newTiempoComidaName, setNewTiempoComidaName] = useState('');
    const [newTiempoComidaDia, setNewTiempoComidaDia] = useState<DayOfWeekKey | ''>('');
    const [newTiempoComidaHoraEstimada, setNewTiempoComidaHoraEstimada] = useState('');
    const [newTiempoComidaNombreGrupo, setNewTiempoComidaNombreGrupo] = useState('');
    const [newTiempoComidaOrdenGrupo, setNewTiempoComidaOrdenGrupo] = useState<number | string>('');
    const [isAddingTiempo, setIsAddingTiempo] = useState(false);
    const [editingTiempoComidaId, setEditingTiempoComidaId] = useState<string | null>(null);
    const [editTiempoComidaName, setEditTiempoComidaName] = useState('');
    const [editTiempoComidaDia, setEditTiempoComidaDia] = useState<DayOfWeekKey | ''>('');
    const [editTiempoComidaHoraEstimada, setEditTiempoComidaHoraEstimada] = useState('');
    const [editTiempoComidaNombreGrupo, setEditTiempoComidaNombreGrupo] = useState('');
    const [editTiempoComidaOrdenGrupo, setEditTiempoComidaOrdenGrupo] = useState<number | string>('');
    const [isSavingEditTiempo, setIsSavingEditTiempo] = useState(false);
    const [isAddingTraditionalScheme, setIsAddingTraditionalScheme] = useState(false);

    // Alternativa Add/Edit
    const [showInactiveAlternativas, setShowInactiveAlternativas] = useState(false);
    const [editingAlternativaId, setEditingAlternativaId] = useState<string | null>(null);
    const [addingAlternativaTo, setAddingAlternativaTo] = useState<string | null>(null);
    const [alternativeFormData, setAlternativeFormData] = useState<Partial<AlternativaTiempoComida>>({});
    const [isSavingAlternativa, setIsSavingAlternativa] = useState(false);

    const availableDays: { key: DayOfWeekKey; label: string }[] = Object.entries(DayOfWeekMap).map(([key, label]) => ({ key: key as DayOfWeekKey, label }));
    const traditionalMealGroups: { nombreGrupo: string; ordenGrupo: number; horaEstimada: string }[] = [
        { nombreGrupo: 'Desayuno', ordenGrupo: 1, horaEstimada: '08:00' },
        { nombreGrupo: 'Almuerzo', ordenGrupo: 2, horaEstimada: '13:00' },
        { nombreGrupo: 'Cena', ordenGrupo: 3, horaEstimada: '20:00' },
    ];
    const daysOfWeekForScheme: DayOfWeekKey[] = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];


    // Sort function for TiemposComida (remains the same)
    const sortTiemposComida = (tiempos: TiempoComida[]) => { /* ... same as before ... */
        const dayOrder: { [key in DayOfWeekKey]: number } = { lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6, domingo: 7 };
        return tiempos.sort((a, b) => {
            const groupDiff = a.ordenGrupo - b.ordenGrupo; if (groupDiff !== 0) return groupDiff;
            const dayDiff = dayOrder[a.dia] - dayOrder[b.dia]; if (dayDiff !== 0) return dayDiff;
            const timeA = a.horaEstimada || '00:00'; const timeB = b.horaEstimada || '00:00';
            return timeA.localeCompare(timeB);
        });
    };

    // --- NEW: Check for missing fasting options ---
    const checkAndWarnMissingFastingOptions = useCallback(() => {
        if (!tiemposComida || tiemposComida.length === 0 || !alternativas) {
            return;
        }

        const missingFastingDetails: string[] = [];

        tiemposComida.forEach(tc => {
            const hasActiveFastingOption = alternativas.some(alt =>
                alt.tiempoComidaId === tc.id &&
                alt.tipo === 'ayuno' &&
                alt.isActive
            );

            if (!hasActiveFastingOption) {
                missingFastingDetails.push(`- ${tc.nombreGrupo} (${DayOfWeekMap[tc.dia]}): ${tc.nombre}`);
            }
        });

        if (missingFastingDetails.length > 0) {
            toast({
                title: "Advertencia: Opciones de Ayuno Faltantes",
                description: (
                    <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                        <p className="mb-2">Los siguientes tiempos de comida no tienen una opción de 'ayuno' activa asociada:</p>
                        <ul className="list-disc pl-5">
                            {missingFastingDetails.map((detail, index) => (
                                <li key={index} className="text-xs">{detail}</li>
                            ))}
                        </ul>
                        <p className="mt-2 text-xs">Considere añadir o activar una alternativa de tipo 'ayuno' para cada uno para asegurar que los residentes siempre puedan optar por no comer.</p>
                    </div>
                ),
                variant: "default", // Or your warning variant if you have one
                duration: 15000, // Longer duration for readability
            });
        }
    }, [tiemposComida, alternativas, toast]);

    // --- useEffect: Trigger warning check when data changes ---
    useEffect(() => {
        // Only run the check if page data is loaded to avoid premature warnings
        if (!isLoadingPageData) {
            checkAndWarnMissingFastingOptions();
        }
    }, [tiemposComida, alternativas, isLoadingPageData, checkAndWarnMissingFastingOptions]);

    // --- Fetch Page Data Function (Now includes Residencia name) ---
    const fetchData = useCallback(async () => {
        if (!residenciaId) {
            setErrorPageData("ID de Residencia no encontrado en la URL.");
            setIsLoadingPageData(false);
            return;
        }
        // This function now assumes authorization has been checked before calling it.
        console.log(`Fetching page data for residenciaId: ${residenciaId}`);
        setIsLoadingPageData(true);
        setErrorPageData(null);

        try {
            // Fetch all required data in parallel
            const [residenciaSnap, tiemposSnap, alternativasSnap, comedoresSnap, horariosSnap] = await Promise.all([
                getDoc(doc(db, "residencias", residenciaId)),
                getDocs(query(collection(db, "tiemposComida"), where("residenciaId", "==", residenciaId))),
                getDocs(query(collection(db, "alternativas"), where("residenciaId", "==", residenciaId))),
                getDocs(query(collection(db, "comedores"), where("residenciaId", "==", residenciaId))),
                getDocs(query(collection(db, "horariosSolicitud"), where("residenciaId", "==", residenciaId), where("isActive", "==", true))) // Fetch only active horarios
            ]);

            // Process Residencia
            if (!residenciaSnap.exists()) throw new Error(`No se encontró la residencia con ID: ${residenciaId}`);
            setResidenciaNombre(residenciaSnap.data()?.nombre || `Residencia (${residenciaId})`);

            // Process TiemposComida
            const fetchedTiempos = tiemposSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as TiempoComida));
            setTiemposComida(sortTiemposComida(fetchedTiempos));

            // Process Alternativas
            const fetchedAlternativas = alternativasSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as AlternativaTiempoComida));
            setAlternativas(fetchedAlternativas);

            // Process Comedores
            const fetchedComedores = comedoresSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Comedor));
            setComedores(fetchedComedores);

            // Process HorariosSolicitud
            const fetchedHorarios = horariosSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as HorarioSolicitudComida));
            setHorariosSolicitud(fetchedHorarios);

            console.log(`Fetched Data: ${fetchedTiempos.length} Tiempos, ${fetchedAlternativas.length} Alternativas, ${fetchedComedores.length} Comedores, ${fetchedHorarios.length} Horarios`);

        } catch (err) {
            console.error("Error fetching page data:", err);
            setErrorPageData(err instanceof Error ? err.message : "Ocurrió un error desconocido al cargar los datos.");
            // Clear potentially partial data
            setResidenciaNombre(''); setTiemposComida([]); setAlternativas([]); setComedores([]); setHorariosSolicitud([]);
        } finally {
            setIsLoadingPageData(false);
        }
    }, [residenciaId]); // Removed toast, will be handled by calling context

    // --- useEffect: Handle Firebase Auth State & Fetch Admin's Profile ---
    useEffect(() => {
        // ... (This effect remains exactly the same as in dietas/page.tsx) ...
        if (authFirebaseLoading) { setAdminProfileLoading(true); setIsAuthorized(false); return; }
        if (authFirebaseError) { console.error("Firebase Auth Error:", authFirebaseError); toast({ title: "Error de Autenticación", description: authFirebaseError.message, variant: "destructive" }); setAdminProfileLoading(false); setAdminUserProfile(null); setAdminProfileError(authFirebaseError.message); setIsAuthorized(false); router.replace('/'); return; }
        if (!authUser) { console.log("No Firebase user. Redirecting."); setAdminProfileLoading(false); setAdminUserProfile(null); setAdminProfileError(null); setIsAuthorized(false); router.replace('/'); return; }

        console.log("Admin authenticated (UID:", authUser.uid,"). Fetching profile...");
        setAdminProfileLoading(true); setAdminProfileError(null);
        const adminDocRef = doc(db, "users", authUser.uid);
        getDoc(adminDocRef)
            .then((docSnap) => { if (docSnap.exists()) { setAdminUserProfile(docSnap.data() as UserProfile); console.log("Admin profile fetched."); } else { console.error("Admin profile not found:", authUser.uid); setAdminUserProfile(null); setAdminProfileError("Perfil admin no encontrado."); toast({ title: "Error Perfil", description: "No se encontró tu perfil.", variant: "destructive" }); } })
            .catch((error) => { console.error("Error fetching admin profile:", error); setAdminUserProfile(null); setAdminProfileError(`Error cargando perfil: ${error.message}`); toast({ title: "Error Perfil", description: `No se pudo cargar tu perfil: ${error.message}`, variant: "destructive" }); })
            .finally(() => setAdminProfileLoading(false));
    }, [authUser, authFirebaseLoading, authFirebaseError, router, toast]);

    // --- useEffect: Handle Authorization & Trigger Page Data Fetch ---
    useEffect(() => {
        // Wait for admin profile loading
        if (adminProfileLoading) { setIsAuthorized(false); return; }
        // Ensure admin profile is loaded and no critical errors occurred
        if (adminProfileError || !adminUserProfile) { setIsAuthorized(false); return; }

        // Authorization Check
        const roles = adminUserProfile.roles || [];
        let authorized = false;
        if (roles.includes('master' as UserRole) || roles.includes('admin' as UserRole)) {
            authorized = true;
        } else if (roles.includes('director' as UserRole) && adminUserProfile.residenciaId === residenciaId) {
            authorized = true;
        }

        setIsAuthorized(authorized); // Set authorization status

        if (authorized) {
            console.log("User authorized. Fetching page data...");
            // Only fetch data if authorized and data hasn't been fetched yet (or if residenciaId changes)
             if (isLoadingPageData) { // Use isLoadingPageData to check if initial fetch needed
                fetchData();
             }
        } else {
            console.warn("User not authorized for this page.");
            setErrorPageData("Acceso denegado."); // Set error for render logic
             setIsLoadingPageData(false); // Ensure loading stops if unauthorized
            // Redirect can be handled by render logic
        }
        // This effect depends on the admin's profile and the residenciaId derived from params
    }, [adminUserProfile, adminProfileLoading, adminProfileError, residenciaId, fetchData, isLoadingPageData]); // Added fetchData, isLoadingPageData dependencies

    // --- CRUD Handlers for TiempoComida (Updated to use authUser.uid for logs) ---
    const handleAddTiempoComida = async () => {
        const ordenGrupoNum = Number(newTiempoComidaOrdenGrupo);
        const trimmedNombreGrupo = newTiempoComidaNombreGrupo.trim();
        const trimmedNombreEspecifico = newTiempoComidaName.trim();

        // Basic Validations (as before)
        if (!trimmedNombreEspecifico) { toast({ title: "Error", description: "El Nombre específico es requerido.", variant: "destructive" }); return; }
        if (!newTiempoComidaDia) { toast({ title: "Error", description: "El Día es requerido.", variant: "destructive" }); return; }
        if (!trimmedNombreGrupo) { toast({ title: "Error", description: "El Nombre de Grupo es requerido.", variant: "destructive" }); return; }
        if (!Number.isInteger(ordenGrupoNum) || ordenGrupoNum <= 0) { toast({ title: "Error", description: "El Orden de Grupo debe ser un número entero positivo.", variant: "destructive" }); return; }
        if (newTiempoComidaHoraEstimada && !/^\d{2}:\d{2}$/.test(newTiempoComidaHoraEstimada)) { toast({ title: "Error", description: "La Hora Estimada debe tener el formato HH:MM.", variant: "destructive" }); return; }

        // --- NEW: Uniqueness Validation for nombreGrupo and dia ---
        const existingTiempoComida = tiemposComida.find(
            tc => tc.nombreGrupo.toLowerCase() === trimmedNombreGrupo.toLowerCase() &&
                  tc.dia === newTiempoComidaDia
        );

        if (existingTiempoComida) {
            toast({
                title: "Conflicto de Horario",
                description: `Ya existe un tiempo de comida para el grupo "${trimmedNombreGrupo}" el día ${DayOfWeekMap[newTiempoComidaDia]}. Solo se permite uno.`,
                variant: "destructive",
                duration: 7000,
            });
            return;
        }
        // --- END NEW ---

        setIsAddingTiempo(true);
        const nuevoTiempoData: Omit<TiempoComida, 'id'> = {
            residenciaId: residenciaId,
            nombre: trimmedNombreEspecifico,
            dia: newTiempoComidaDia,
            horaEstimada: newTiempoComidaHoraEstimada || undefined,
            nombreGrupo: trimmedNombreGrupo,
            ordenGrupo: ordenGrupoNum,
        };

        try {
            const docRef = await addDoc(collection(db, "tiemposComida"), nuevoTiempoData);
            const newTiempoWithId: TiempoComida = { id: docRef.id, ...nuevoTiempoData };
            await createLogEntry('tiempo_comida_created', residenciaId, authUser?.uid || null, `Created tiempo: ${nuevoTiempoData.nombre}`, docRef.path);
            setTiemposComida(prev => sortTiemposComida([...prev, newTiempoWithId]));
            
            setNewTiempoComidaName('');
            setNewTiempoComidaDia('');
            setNewTiempoComidaHoraEstimada('');
            setNewTiempoComidaNombreGrupo('');
            setNewTiempoComidaOrdenGrupo('');
            toast({ title: "Éxito", description: `Tiempo "${nuevoTiempoData.nombre}" añadido.` });
        } catch (error) {
            console.error("Error adding TiempoComida: ", error);
            toast({ title: "Error", description: `No se pudo añadir el Tiempo de Comida. ${error instanceof Error ? error.message : ''}`, variant: "destructive" });
        } finally {
            setIsAddingTiempo(false);
        }
    };
    const handleSaveEditTiempoComida = async () => {
        if (!editingTiempoComidaId) return;

        const ordenGrupoNum = Number(editTiempoComidaOrdenGrupo);
        const trimmedEditNombreGrupo = editTiempoComidaNombreGrupo.trim();
        const trimmedEditNombreEspecifico = editTiempoComidaName.trim();

        // Basic Validations (as before)
        if (!trimmedEditNombreEspecifico) { toast({ title: "Error", description: "Nombre específico requerido.", variant: "destructive" }); return; }
        if (!editTiempoComidaDia) { toast({ title: "Error", description: "Día requerido.", variant: "destructive" }); return; }
        if (!trimmedEditNombreGrupo) { toast({ title: "Error", description: "Nombre de Grupo requerido.", variant: "destructive" }); return; }
        if (!Number.isInteger(ordenGrupoNum) || ordenGrupoNum <= 0) { toast({ title: "Error", description: "Orden de Grupo debe ser número entero positivo.", variant: "destructive" }); return; }
        if (editTiempoComidaHoraEstimada && !/^\d{2}:\d{2}$/.test(editTiempoComidaHoraEstimada)) { toast({ title: "Error", description: "Hora Estimada formato HH:MM.", variant: "destructive" }); return; }

        // --- NEW: Uniqueness Validation for nombreGrupo and dia (excluding self) ---
        const conflictingTiempoComida = tiemposComida.find(
            tc => tc.id !== editingTiempoComidaId && // Exclude the current item being edited
                  tc.nombreGrupo.toLowerCase() === trimmedEditNombreGrupo.toLowerCase() &&
                  tc.dia === editTiempoComidaDia
        );

        if (conflictingTiempoComida) {
            toast({
                title: "Conflicto de Horario",
                description: `Ya existe otro tiempo de comida para el grupo "${trimmedEditNombreGrupo}" el día ${DayOfWeekMap[editTiempoComidaDia]}. Solo se permite uno.`,
                variant: "destructive",
                duration: 7000,
            });
            return;
        }
        // --- END NEW ---

        setIsSavingEditTiempo(true);
        const tiempoRef = doc(db, "tiemposComida", editingTiempoComidaId);
        const updatedTiempoData: Partial<TiempoComida> = {
            nombre: trimmedEditNombreEspecifico,
            dia: editTiempoComidaDia,
            horaEstimada: editTiempoComidaHoraEstimada || undefined,
            nombreGrupo: trimmedEditNombreGrupo,
            ordenGrupo: ordenGrupoNum,
        };

        try {
            await updateDoc(tiempoRef, updatedTiempoData);
            await createLogEntry('tiempo_comida_updated', residenciaId, authUser?.uid || null, `Updated tiempo: ${updatedTiempoData.nombre}`, tiempoRef.path);
            
            setTiemposComida(prev =>
                sortTiemposComida(
                    prev.map(t =>
                        t.id === editingTiempoComidaId
                            ? { ...t, ...updatedTiempoData } 
                            : t
                    )
                )
            );
            handleCancelEdit();
            toast({ title: "Éxito", description: `Tiempo "${updatedTiempoData.nombre}" actualizado.` });
        } catch (error) {
            console.error("Error updating TiempoComida: ", error);
            toast({ title: "Error", description: `No se pudo actualizar el Tiempo de Comida. ${error instanceof Error ? error.message : ''}`, variant: "destructive" });
        } finally {
            setIsSavingEditTiempo(false);
        }
    };
    const handleDeleteTiempoComida = async (id: string, nombre: string) => { /* ... */
            // Check for associated alternatives (using current state - assumes state is up-to-date)
            const hasAnyAlternativas = alternativas.some(alt => alt.tiempoComidaId === id);
            if (hasAnyAlternativas) {
                 toast({
                     title: "Error al Eliminar",
                     description: `No se puede eliminar \"${nombre}\" porque tiene alternativas asociadas. Elimine o reasigne esas alternativas primero.`,
                     variant: "destructive",
                     duration: 6000
                 });
                return;
            }
     
            const tiempoRef = doc(db, "tiemposComida", id);
            try {
                console.log(`Attempting delete for TiempoComida ID: ${id}`);
                // <<< Use deleteDoc >>>
                await deleteDoc(tiempoRef);
                console.log(`TiempoComida deleted: ${id}`);
     
                await createLogEntry('tiempo_comida_deleted', residenciaId, authUser?.uid || null, `Deleted tiempo: ${nombre} (ID: ${id})`, tiempoRef.path);     
                // <<< Update state AFTER successful delete >>>
                setTiemposComida(prev => prev.filter(t => t.id !== id));
                toast({ title: "Eliminado", description: `Tiempo "${nombre}" eliminado.`, variant: "destructive" });
     
                if (editingTiempoComidaId === id) {
                    handleCancelEdit();
                }
            } catch (error) {
                console.error("Error deleting TiempoComida: ", error);
                toast({ title: "Error", description: `No se pudo eliminar el Tiempo de Comida. ${error instanceof Error ? error.message : ''}`, variant: "destructive" });
            }
        };
    const handleAddTraditionalScheme = async () => {
        if (tiemposComida.length > 0) {
            toast({ title: "Información", description: "El esquema tradicional solo se puede añadir si no hay tiempos de comida existentes.", variant: "default" });
            return;
        }
        if (!authUser?.uid) {
            toast({ title: "Error", description: "Usuario no autenticado.", variant: "destructive" });
            return;
        }

        setIsAddingTraditionalScheme(true);
        const batch = writeBatch(db);
        const newTiemposComidaBatch: TiempoComida[] = []; // To update local state

        try {
            for (const mealGroup of traditionalMealGroups) {
                for (const dayKey of daysOfWeekForScheme) {
                    const specificName = `${mealGroup.nombreGrupo} ${DayOfWeekMap[dayKey]}`;
                    const nuevoTiempoData: Omit<TiempoComida, 'id'> = {
                        residenciaId: residenciaId,
                        nombre: specificName,
                        dia: dayKey,
                        horaEstimada: mealGroup.horaEstimada,
                        nombreGrupo: mealGroup.nombreGrupo,
                        ordenGrupo: mealGroup.ordenGrupo,
                    };
                    
                    const tiempoDocRef = doc(collection(db, "tiemposComida")); // Create new doc ref for ID
                    batch.set(tiempoDocRef, nuevoTiempoData);
                    newTiemposComidaBatch.push({ id: tiempoDocRef.id, ...nuevoTiempoData });
                    // Log entry for each created item (optional, can be a single summary log)
                    // await createLogEntry('tiempo_comida_created', residenciaId, authUser.uid, `Trad. Scheme: Created ${specificName}`, tiempoDocRef.path);
                }
            }

            await batch.commit();
            //await createLogEntry('tiempo_comida_bulk_created', residenciaId, authUser.uid, `Traditional scheme added (${newTiemposComidaBatch.length} items)`);
            
            setTiemposComida(prev => sortTiemposComida([...prev, ...newTiemposComidaBatch]));
            toast({ title: "Éxito", description: "Esquema tradicional de tiempos de comida añadido." });

        } catch (error) {
            console.error("Error adding traditional scheme: ", error);
            toast({ title: "Error", description: `No se pudo añadir el esquema tradicional. ${error instanceof Error ? error.message : ''}`, variant: "destructive" });
        } finally {
            setIsAddingTraditionalScheme(false);
        }
    };

    // --- CRUD Handlers for Alternativa (Updated to use authUser.uid for logs) ---
    const handleAddAlternativa = async () => {
        if (!addingAlternativaTo) return;

        // Validation
        const tipoSeleccionado = alternativeFormData.tipo;
        if (!tipoSeleccionado) { toast({ title: "Error", description: "Debe seleccionar un Tipo.", variant: "destructive" }); return; }
        if (!alternativeFormData.nombre?.trim()) { toast({ title: "Error", description: "Nombre es requerido.", variant: "destructive" }); return; }
        if (tipoSeleccionado !== 'ayuno' && (!alternativeFormData.ventanaInicio || !/^\\d\\d:\\d\\d$/.test(alternativeFormData.ventanaInicio))) { toast({ title: "Error", description: "Ventana Inicio es requerida (HH:MM).", variant: "destructive" }); return; }
        if (tipoSeleccionado !== 'ayuno' && (!alternativeFormData.ventanaFin || !/^\\d\\d:\\d\\d$/.test(alternativeFormData.ventanaFin))) { toast({ title: "Error", description: "Ventana Fin es requerida (HH:MM).", variant: "destructive" }); return; }
        if (tipoSeleccionado === 'comedor' && !alternativeFormData.comedorId) { toast({ title: "Error", description: "Comedor Específico es requerido para tipo 'Comedor'.", variant: "destructive" }); return; }
        if (!alternativeFormData.horarioSolicitudComidaId) { toast({ title: "Error", description: "Regla de Solicitud es requerida.", variant: "destructive" }); return; }
        // tipoAcceso defaults if not set for non-ayuno, so validation might not be needed unless specific logic required

        setIsSavingAlternativa(true);

        // Prepare data - Enforce ayuno rules
        const isAyuno = tipoSeleccionado === 'ayuno';
        const nuevaAlternativaData: Omit<AlternativaTiempoComida, 'id'> = {
            residenciaId: residenciaId,
            tiempoComidaId: addingAlternativaTo,
            nombre: alternativeFormData.nombre!.trim(),
            tipo: tipoSeleccionado,
            tipoAcceso: isAyuno ? 'abierto' : (alternativeFormData.tipoAcceso || 'abierto'),
            requiereAprobacion: isAyuno ? false : (alternativeFormData.tipoAcceso === 'autorizado'),
            ventanaInicio: isAyuno ? '00:00' : alternativeFormData.ventanaInicio!,
            ventanaFin: isAyuno ? '00:00' : alternativeFormData.ventanaFin!,
            horarioSolicitudComidaId: alternativeFormData.horarioSolicitudComidaId!,
            comedorId: isAyuno ? undefined : (tipoSeleccionado === 'comedor' ? alternativeFormData.comedorId : undefined),
            isActive: true, // Default to active
            iniciaDiaAnterior: isAyuno ? false : (alternativeFormData.iniciaDiaAnterior ?? false),
            terminaDiaSiguiente: isAyuno ? false : (alternativeFormData.terminaDiaSiguiente ?? false),
        };

        try {
            const docRef = await addDoc(collection(db, "alternativas"), nuevaAlternativaData);
            const newAlternativaWithId: AlternativaTiempoComida = { id: docRef.id, ...nuevaAlternativaData };
            await createLogEntry('alternativa_created', residenciaId, authUser?.uid || null, `Created alternativa: ${nuevaAlternativaData.nombre}`, docRef.path);
            // <<< Update state AFTER successful add >>>
            setAlternativas(prev => [...prev, newAlternativaWithId].sort((a,b) => a.nombre.localeCompare(b.nombre))); // Sort here too
            handleCancelAlternativaForm(); // Close form
            toast({ title: "Éxito", description: `Alternativa "${nuevaAlternativaData.nombre}" añadida.` });
        } catch (error) {
             console.error("Error adding Alternativa: ", error);
             toast({ title: "Error", description: `No se pudo añadir la Alternativa. ${error instanceof Error ? error.message : ''}`, variant: "destructive" });
        } finally { 
            setIsSavingAlternativa(false); 
        }
    };
    const handleSaveAlternativa = async () => {
        if (!editingAlternativaId) return;

        // Validation (as before)
        const tipoSeleccionado = alternativeFormData.tipo;
        if (!tipoSeleccionado) { toast({ title: "Error", description: "Debe seleccionar un Tipo.", variant: "destructive" }); return; }
        if (!alternativeFormData.nombre?.trim()) { toast({ title: "Error", description: "Nombre es requerido.", variant: "destructive" }); return; }
        if (tipoSeleccionado !== 'ayuno' && (!alternativeFormData.ventanaInicio || !/^\d{2}:\d{2}$/.test(alternativeFormData.ventanaInicio))) { toast({ title: "Error", description: "Ventana Inicio requerida (HH:MM).", variant: "destructive" }); return; }
        if (tipoSeleccionado !== 'ayuno' && (!alternativeFormData.ventanaFin || !/^\d{2}:\d{2}$/.test(alternativeFormData.ventanaFin))) { toast({ title: "Error", description: "Ventana Fin requerida (HH:MM).", variant: "destructive" }); return; }
        if (tipoSeleccionado === 'comedor' && !alternativeFormData.comedorId) { toast({ title: "Error", description: "Comedor Específico requerido para tipo 'Comedor'.", variant: "destructive" }); return; }
        if (!alternativeFormData.horarioSolicitudComidaId) { toast({ title: "Error", description: "Regla de Solicitud requerida.", variant: "destructive" }); return; }

        setIsSavingAlternativa(true);
        const altRef = doc(db, "alternativas", editingAlternativaId);
        const originalAlt = alternativas.find(a => a.id === editingAlternativaId);

        const isAyuno = tipoSeleccionado === 'ayuno';

        // Prepare data for Firestore (can include deleteField())
        const updatedAlternativaDataForFirestore: any = { // Use 'any' or a more specific type if you create one for Firestore updates
            nombre: alternativeFormData.nombre!.trim(),
            tipo: tipoSeleccionado,
            tipoAcceso: isAyuno ? 'abierto' : (alternativeFormData.tipoAcceso || 'abierto'),
            requiereAprobacion: isAyuno ? false : (alternativeFormData.tipoAcceso === 'autorizado'),
            ventanaInicio: isAyuno ? '00:00' : alternativeFormData.ventanaInicio!,
            ventanaFin: isAyuno ? '00:00' : alternativeFormData.ventanaFin!,
            horarioSolicitudComidaId: alternativeFormData.horarioSolicitudComidaId!,
            isActive: alternativeFormData.isActive === undefined ? originalAlt?.isActive ?? true : alternativeFormData.isActive,
            iniciaDiaAnterior: isAyuno ? false : (alternativeFormData.iniciaDiaAnterior ?? false),
            terminaDiaSiguiente: isAyuno ? false : (alternativeFormData.terminaDiaSiguiente ?? false),
        };

        if (isAyuno) {
            updatedAlternativaDataForFirestore.comedorId = deleteField();
        } else if (tipoSeleccionado === 'comedor') {
            updatedAlternativaDataForFirestore.comedorId = alternativeFormData.comedorId;
        } else { // paraLlevar or other types that don't use comedorId
            updatedAlternativaDataForFirestore.comedorId = deleteField();
        }
        
        // Clean up undefined fields that are not meant to be deleted (e.g. optional fields not being set)
        // This loop should run on a copy that doesn't have deleteField() if you want to be very precise,
        // but Firestore handles `undefined` values by not updating those fields.
        // deleteField() is explicit.
        // For this scenario, directly using updatedAlternativaDataForFirestore is fine.

        try {
            await updateDoc(altRef, updatedAlternativaDataForFirestore);
            await createLogEntry('alternativa_updated', residenciaId, authUser?.uid || null, `Updated alternativa: ${updatedAlternativaDataForFirestore.nombre}`, altRef.path);

            // Prepare data for local state update (ensure comedorId is string | undefined)
            const updatedAlternativaDataForState: Partial<AlternativaTiempoComida> = {
                ...updatedAlternativaDataForFirestore, // Spread the Firestore data first
            };
            
            // If comedorId was set to deleteField(), ensure it's undefined in the local state
            if (updatedAlternativaDataForFirestore.comedorId && typeof updatedAlternativaDataForFirestore.comedorId !== 'string') {
                 // We check if it's not a string because deleteField() is an object.
                 // This means deleteField() was used.
                updatedAlternativaDataForState.comedorId = undefined;
            }


            setAlternativas(prev =>
                prev.map(alt =>
                    alt.id === editingAlternativaId
                        ? { ...alt, ...updatedAlternativaDataForState } // Use the state-compatible data
                        : alt
                ).sort((a, b) => a.nombre.localeCompare(b.nombre))
            );

            handleCancelAlternativaForm();
            toast({ title: "Éxito", description: `Alternativa "${updatedAlternativaDataForFirestore.nombre}" actualizada.` });
        } catch (error) {
            console.error("Error updating Alternativa: ", error);
            toast({ title: "Error", description: `No se pudo actualizar la Alternativa. ${error instanceof Error ? error.message : ''}`, variant: "destructive" });
        } finally {
            setIsSavingAlternativa(false);
        }
    };     
    const handleDeleteAlternativa = async (id: string, nombre: string) => {
        const altRef = doc(db, "alternativas", id);
        try {
            console.log(`Attempting delete for Alternativa ID: ${id}`);
            await deleteDoc(altRef);
            console.log(`Alternativa deleted: ${id}`);

            await createLogEntry('alternativa_deleted', residenciaId, authUser?.uid || null, `Deleted alternativa: ${nombre} (ID: ${id})`, altRef.path);

            setAlternativas(prev => prev.filter(alt => alt.id !== id));
            toast({ title: "Eliminada", description: `Alternativa "${nombre}" eliminada.`, variant: "destructive" });

            // If the deleted item was being edited, cancel edit mode
            if (editingAlternativaId === id) {
                handleCancelAlternativaForm();
            }
            // If the deleted item's parent TiempoComida was the target for adding, cancel add mode
            const deletedAlt = alternativas.find(a => a.id === id);
            if (deletedAlt && addingAlternativaTo === deletedAlt.tiempoComidaId) {
                handleCancelAlternativaForm();
            }

        } catch (error) {
            console.error("Error deleting Alternativa: ", error);
            toast({ title: "Error", description: `No se pudo eliminar la Alternativa. ${error instanceof Error ? error.message : ''}`, variant: "destructive" });
        }
    }; 
    const handleToggleAlternativaActive = async (id: string, newStatus: boolean) => {
        const alternativa = alternativas.find(alt => alt.id === id);
        if (!alternativa) return;

        const altRef = doc(db, "alternativas", id);
        try {
            console.log(`${newStatus ? 'Activating' : 'Deactivating'} alternativa ID: ${id}`);
            await updateDoc(altRef, { isActive: newStatus });

            // Update local state optimistically or after success
            setAlternativas(prev =>
                prev.map(alt =>
                    alt.id === id ? { ...alt, isActive: newStatus } : alt
                )
            );

            await createLogEntry('alternativa_updated', residenciaId, authUser?.uid || null, `${newStatus ? 'Activated' : 'Deactivated'} alternativa: ${alternativa?.nombre || id}`, altRef.path);

            toast({
                title: newStatus ? "Activada" : "Desactivada",
                description: `La alternativa "${alternativa.nombre}" ha sido ${newStatus ? 'activada' : 'desactivada'}.`
            });
        } catch (error) {
            console.error("Error updating alternativa active status:", error);
            toast({ title: "Error", description: `No se pudo ${newStatus ? 'activar' : 'desactivar'} la alternativa. ${error instanceof Error ? error.message : ''}`, variant: "destructive" });
            // Optionally revert local state change here if needed
        }
    };

    // --- Other handlers (remain the same) ---
    const handleOpenAddAlternativaForm = (tiempoComidaId: string) => {
        setAddingAlternativaTo(tiempoComidaId);
        setEditingAlternativaId(null);
        setAlternativeFormData({
            tipo: 'comedor', tipoAcceso: 'abierto', requiereAprobacion: false,
            ventanaInicio: '13:00', ventanaFin: '14:00', comedorId: '',
            isActive: true, iniciaDiaAnterior: false, terminaDiaSiguiente: false,
            // <<< Set default HorarioSolicitud if available >>>
            horarioSolicitudComidaId: horariosSolicitud.length > 0 ? horariosSolicitud[0].id : '',
        });
    };
    const handleCancelAlternativaForm = () => {
        setAddingAlternativaTo(null);
        setEditingAlternativaId(null);
        setAlternativeFormData({});
        console.log("Closing Add/Edit Alternativa form");
    };
    const handleAlternativaFormChange = (field: keyof AlternativaTiempoComida, value: any) => {
        console.log("Form change:", field, value);
        setAlternativeFormData(prev => {
            let updatedData = { ...prev, [field]: value };

            // --- Logic for 'ayuno' type ---
            if (field === 'tipo' && value === 'ayuno') {
                // When 'ayuno' is selected, prefill/force specific fields
                updatedData.nombre = prev.nombre || "Ayuno"; // Prefill name if empty, keep if user typed something
                updatedData.tipoAcceso = 'abierto';
                updatedData.requiereAprobacion = false;
                updatedData.ventanaInicio = '00:00';
                updatedData.ventanaFin = '00:00';
                updatedData.comedorId = undefined; // Ensure comedor is cleared
                updatedData.iniciaDiaAnterior = false;
                updatedData.terminaDiaSiguiente = false;
            } else if (field === 'tipo' && value !== 'ayuno' && prev.tipo === 'ayuno') {
                // If switching *away* from ayuno, clear the forced fields
                // so user can select new values (keep name)
                 updatedData.tipoAcceso = prev.tipoAcceso === 'abierto' ? undefined : prev.tipoAcceso; // Reset if it was forced
                 updatedData.ventanaInicio = prev.ventanaInicio === '00:00' ? undefined : prev.ventanaInicio;
                 updatedData.ventanaFin = prev.ventanaFin === '00:00' ? undefined : prev.ventanaFin;
            }

            // Auto-set requiereAprobacion based on tipoAcceso (unless it's ayuno)
            if (updatedData.tipo !== 'ayuno' && field === 'tipoAcceso') {
                 updatedData.requiereAprobacion = (value === 'autorizado');
            }

            // Clear comedorId if tipo is not 'comedor' (and not ayuno)
            if (updatedData.tipo !== 'comedor' && updatedData.tipo !== 'ayuno') {
                 updatedData.comedorId = undefined;
            }


            return updatedData;
        });
    };
    const handleOpenEditAlternativaForm = (alternativa: AlternativaTiempoComida) => {
        setEditingAlternativaId(alternativa.id);
        setAddingAlternativaTo(null);
        setAlternativeFormData({ ...alternativa });
        console.log("Opening Edit form for Alternativa ID:", alternativa.id);
    };
    const handleEditTiempoComida = (tiempo: TiempoComida) => {
        setEditingTiempoComidaId(tiempo.id);
        setEditTiempoComidaName(tiempo.nombre);
        setEditTiempoComidaDia(tiempo.dia);
        setEditTiempoComidaHoraEstimada(tiempo.horaEstimada || '');
        // <<< Populate group edit state >>>
        setEditTiempoComidaNombreGrupo(tiempo.nombreGrupo);
        setEditTiempoComidaOrdenGrupo(tiempo.ordenGrupo);
    };
    const handleCancelEdit = () => {
        setEditingTiempoComidaId(null);
        setEditTiempoComidaName('');
        setEditTiempoComidaDia('');
        setEditTiempoComidaHoraEstimada('');
        // <<< Clear group edit state >>>
        setEditTiempoComidaNombreGrupo('');
        setEditTiempoComidaOrdenGrupo('');
    };


    // =========================================================================
    // RENDER LOGIC with Auth Flow
    // =========================================================================

    // 1. Auth/Profile Loading
    if (authFirebaseLoading || adminProfileLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
                <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
                <p className="text-lg font-medium text-muted-foreground">
                    {authFirebaseLoading ? 'Verificando sesión...' : "Cargando perfil..."}
                </p>
            </div>
        );
    }

    // 2. Auth/Profile Error
    if (authFirebaseError || adminProfileError) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
                <AlertCircle className="h-12 w-12 text-destructive mb-4" />
                <h1 className="text-2xl font-bold text-destructive mb-2">Error Crítico</h1>
                <p className="mb-4 text-destructive max-w-md">
                    {authFirebaseError?.message || adminProfileError || 'Error cargando información esencial.'}
                </p>
                <Button onClick={() => router.replace('/')}>Volver al Inicio</Button>
            </div>
        );
    }

    // 3. Not Authorized (after profile loaded, no errors)
    // Use errorPageData which is set during authorization check if access denied
     if (!isAuthorized) {
         return (
             <div className="container mx-auto p-4 text-center">
                <AlertCircle className="h-12 w-12 text-destructive mb-4" />
               <h1 className="text-2xl font-bold text-destructive mb-4">Acceso Denegado</h1>
               <p className="text-muted-foreground max-w-md mx-auto">
                   No tienes permiso (admin/master o director de esta residencia) para gestionar los horarios y alternativas de esta residencia.
                </p>
                <Button onClick={() => router.push('/admin/residencia')} className="mt-6">
                   Volver a Residencias
                </Button>
             </div>
           );
     }

    // 4. Page Data Loading (only shown if authorized)
    if (isLoadingPageData) {
         return (
          <div className="container mx-auto p-4 space-y-6">
            <Skeleton className="h-8 w-3/4 mb-4" /> {/* Title */}
            {/* Skeleton for Tiempos Card */}
            <Card>
                <CardHeader>
                    <CardTitle>
                        <Skeleton className="h-6 w-48" />
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <Skeleton className="h-4 w-full mb-4" /> <div className="space-y-3"> <Skeleton className="h-12 w-full rounded-md" /> <Skeleton className="h-12 w-full rounded-md" /> </div> </CardContent>
            </Card>
             {/* Skeleton for Alternativas Card */}
             <Card>
                <CardHeader><CardTitle><Skeleton className="h-6 w-56" /></CardTitle></CardHeader>
                <CardContent> 
                    <Skeleton className="h-4 w-full mb-4" /> 
                    <div className="mb-4 p-3 border rounded"> 
                        <Skeleton className="h-6 w-1/3 mb-3 pb-2 border-b" /> 
                        <div className="space-y-2 mb-3"> 
                            <Skeleton className="h-16 w-full rounded-md" /> 
                        </div> 
                        <div className="mt-3 pt-3 border-t"> 
                            <Skeleton className="h-8 w-48 rounded" /> {/* Add Alt Button */}
                        </div>
                        </div>
                </CardContent>
            </Card>
        </div>
    );
}

// 5. Page Data Fetch Error (display after loading done and authorized)
if (errorPageData && errorPageData !== "Acceso denegado.") {
    return (
        <div className="container mx-auto p-4 text-center">
            <AlertCircle className="h-12 w-12 text-destructive mb-4 mx-auto" />
            <h1 className="text-2xl font-bold text-destructive mb-2">Error al Cargar Datos</h1>
            <p className="mb-4 text-muted-foreground max-w-md mx-auto">{errorPageData}</p>
            <Button onClick={fetchData}>Reintentar Carga</Button> {/* Allow retry */}
        </div>
    );
}

// --- RENDER MAIN CONTENT (Authorized and Data Loaded) ---
const isTiempoFormActive = isAddingTiempo || !!editingTiempoComidaId;
const isAlternativaFormActive = !!addingAlternativaTo || !!editingAlternativaId;

return (
<div className="container mx-auto p-4 space-y-8"> {/* Increased spacing */}
<h1 className="text-3xl font-bold tracking-tight">
Gestionar Tiempos y Alternativas para <span className="text-primary">{residenciaNombre}</span>
</h1>

{/* ================== Section for TiemposComida ================== */}
<Card>
<CardHeader>
<CardTitle>Tiempos de Comida</CardTitle>
<p className="text-sm text-muted-foreground pt-1">
Define los momentos específicos (ej. Almuerzo Lunes), agrupándolos (ej. Almuerzo) y ordenándolos para la vista del residente.
</p>
</CardHeader>
<CardContent>
<div className="space-y-4"> {/* Increased spacing */}
{tiemposComida.map(tiempo => (
    <div key={tiempo.id} className={`p-4 border rounded-lg shadow-sm ${editingTiempoComidaId === tiempo.id ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700' : 'bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}>
       {editingTiempoComidaId === tiempo.id ? (
           // --- EDIT FORM for TiempoComida ---
           <div className="space-y-4">
                <h4 className="font-semibold text-lg border-b pb-2">Editando: {tiempo.nombreGrupo} - {tiempo.nombre}</h4>
                {/* Row 1: Nombre, Dia, Hora */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                   <div>
                       <Label htmlFor={`edit-tiempo-nombre-${tiempo.id}`}>Nombre Específico *</Label>
                       <Input id={`edit-tiempo-nombre-${tiempo.id}`} value={editTiempoComidaName} onChange={(e) => setEditTiempoComidaName(e.target.value)} placeholder="Ej. Almuerzo Lunes" disabled={isSavingEditTiempo}/>
                   </div>
                   <div>
                       <Label htmlFor={`edit-tiempo-dia-${tiempo.id}`}>Día *</Label>
                       <Select value={editTiempoComidaDia} onValueChange={(value) => setEditTiempoComidaDia(value as DayOfWeekKey)} disabled={isSavingEditTiempo}>
                           <SelectTrigger id={`edit-tiempo-dia-${tiempo.id}`}><SelectValue placeholder="Seleccione..." /></SelectTrigger>
                           <SelectContent>{availableDays.map(({ key, label }) => (<SelectItem key={key} value={key}>{label}</SelectItem>))}</SelectContent>
                       </Select>
                   </div>
                   <div>
                       <Label htmlFor={`edit-tiempo-hora-${tiempo.id}`}>Hora Estimada (Opcional)</Label>
                       <Input id={`edit-tiempo-hora-${tiempo.id}`} type="time" value={editTiempoComidaHoraEstimada} onChange={(e) => setEditTiempoComidaHoraEstimada(e.target.value)} placeholder="HH:MM" disabled={isSavingEditTiempo} step="900" />
                   </div>
                </div>
                {/* Row 2: Grupo, Orden */}
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <Label htmlFor={`edit-tiempo-grupo-${tiempo.id}`}>Nombre de Grupo *</Label>
                        <Input id={`edit-tiempo-grupo-${tiempo.id}`} value={editTiempoComidaNombreGrupo} onChange={(e) => setEditTiempoComidaNombreGrupo(e.target.value)} placeholder="Ej. Almuerzo, Cena" disabled={isSavingEditTiempo}/>
                        <p className="text-xs text-muted-foreground mt-1">Para agrupar en UI.</p>
                    </div>
                     <div>
                        <Label htmlFor={`edit-tiempo-orden-${tiempo.id}`}>Orden de Grupo *</Label>
                        <Input id={`edit-tiempo-orden-${tiempo.id}`} type="number" min="1" step="1" value={editTiempoComidaOrdenGrupo} onChange={(e) => setEditTiempoComidaOrdenGrupo(e.target.value)} placeholder="Ej. 1, 2, 3" disabled={isSavingEditTiempo}/>
                         <p className="text-xs text-muted-foreground mt-1">Orden numérico (1=primero).</p>
                    </div>
                    <div></div> {/* Spacer */}
                 </div>
               {/* Action Buttons */}
               <div className="flex space-x-2 pt-2">
                    <Button onClick={handleSaveEditTiempoComida} disabled={isSavingEditTiempo}>{isSavingEditTiempo ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}{isSavingEditTiempo ? 'Guardando...' : 'Guardar Cambios'}</Button>
                   <Button variant="outline" onClick={handleCancelEdit} disabled={isSavingEditTiempo}>Cancelar</Button>
               </div>
           </div>
        ) : (
           // --- DISPLAY ROW for TiempoComida ---
           <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
               <div className='flex-grow'>
                   <span className="font-semibold text-lg">{tiempo.nombre}</span>
                   <span className="block text-sm text-muted-foreground">
                       Grupo: {tiempo.nombreGrupo} (Orden: {tiempo.ordenGrupo}) | Día: {DayOfWeekMap[tiempo.dia]} {tiempo.horaEstimada && `| Hora: ~${tiempo.horaEstimada}`}
                   </span>
               </div>
               {/* Action Buttons */}
               <div className="space-x-2 flex-shrink-0 mt-2 sm:mt-0">
                   <Button variant="outline" size="sm" onClick={() => handleEditTiempoComida(tiempo)} disabled={isTiempoFormActive || isAlternativaFormActive}>Editar</Button>
                   <AlertDialog>
                       <AlertDialogTrigger asChild>
                            <Button variant="destructive" size="sm" disabled={isTiempoFormActive || isAlternativaFormActive || alternativas.some(alt => alt.tiempoComidaId === tiempo.id)}>Eliminar</Button>
                       </AlertDialogTrigger>
                       <AlertDialogContent>
                           <AlertDialogHeader>
                               <AlertDialogTitle>¿Confirmar Eliminación?</AlertDialogTitle>
                               <AlertDialogDescription>
                                   Se eliminará "{tiempo.nombre}". Esta acción no se puede deshacer.
                                   {alternativas.some(alt => alt.tiempoComidaId === tiempo.id) && <span className="font-semibold text-destructive block mt-2">Primero debe eliminar las alternativas asociadas.</span>}
                               </AlertDialogDescription>
                           </AlertDialogHeader>
                           <AlertDialogFooter>
                               <AlertDialogCancel>Cancelar</AlertDialogCancel>
                               <AlertDialogAction onClick={() => handleDeleteTiempoComida(tiempo.id, tiempo.nombre)} className={buttonVariants({ variant: "destructive" })} disabled={alternativas.some(alt => alt.tiempoComidaId === tiempo.id)}>Sí, Eliminar</AlertDialogAction>
                           </AlertDialogFooter>
                       </AlertDialogContent>
                   </AlertDialog>
                </div>
            </div>
        )}
    </div>
))}
</div>
{/* --- BEGIN: Traditional Scheme Button --- */}
{tiemposComida.length === 0 && !isLoadingPageData && !isAddingTiempo && !editingTiempoComidaId && (
    <div className="text-center py-6 border-b mb-6">
        <p className="text-muted-foreground mb-4">
            No hay Tiempos de Comida definidos para esta residencia.
        </p>
        <Button
            onClick={handleAddTraditionalScheme}
            disabled={isAddingTraditionalScheme || isAddingTiempo || !!editingTiempoComidaId}
            size="lg"
            variant="outline"
        >
            {isAddingTraditionalScheme ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            {isAddingTraditionalScheme ? 'Añadiendo Esquema...' : 'Añadir Esquema Tradicional (Desayuno, Almuerzo, Cena x7 días)'}
        </Button>
        <p className="text-xs text-muted-foreground mt-2">
            Esto creará automáticamente 21 tiempos de comida (Ej: Desayuno Lunes, Almuerzo Lunes, etc.).
        </p>
    </div>
)}
{/* --- END: Traditional Scheme Button --- */}

{/* --- ADD FORM for TiempoComida --- */}
{!editingTiempoComidaId && (
<div className={`mt-6 pt-6 border-t ${isAlternativaFormActive ? 'opacity-50 pointer-events-none' : ''}`}>
   <h3 className="font-semibold mb-3 text-xl">Añadir Nuevo Tiempo de Comida</h3>
   <div className="space-y-4 p-4 border rounded bg-slate-50 dark:bg-slate-800/30">
       {/* Row 1: Nombre, Dia, Hora */}
       <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
           <div>
               <Label htmlFor="tiempo-nombre">Nombre Específico *</Label>
               <Input id="tiempo-nombre" value={newTiempoComidaName} onChange={(e) => setNewTiempoComidaName(e.target.value)} placeholder="Ej. Almuerzo Lunes" disabled={isAddingTiempo}/>
           </div>
           <div>
               <Label htmlFor="new-tiempo-dia">Día *</Label>
               <Select value={newTiempoComidaDia} onValueChange={(value) => setNewTiempoComidaDia(value as DayOfWeekKey)} disabled={isAddingTiempo}>
                   <SelectTrigger id="new-tiempo-dia"><SelectValue placeholder="Seleccione..." /></SelectTrigger>
                   <SelectContent>{availableDays.map(({ key, label }) => (<SelectItem key={key} value={key}>{label}</SelectItem>))}</SelectContent>
               </Select>
           </div>
           <div>
               <Label htmlFor="new-tiempo-hora">Hora Estimada (Opcional)</Label>
               <Input id="new-tiempo-hora" type="time" value={newTiempoComidaHoraEstimada} onChange={(e) => setNewTiempoComidaHoraEstimada(e.target.value)} placeholder="HH:MM" disabled={isAddingTiempo} step="900"/>
           </div>
       </div>
       {/* Row 2: Grupo, Orden */}
       <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
                <Label htmlFor="new-tiempo-grupo">Nombre de Grupo *</Label>
                <Input id="new-tiempo-grupo" value={newTiempoComidaNombreGrupo} onChange={(e) => setNewTiempoComidaNombreGrupo(e.target.value)} placeholder="Ej. Desayuno, Almuerzo" disabled={isAddingTiempo}/>
            </div>
             <div>
                <Label htmlFor="new-tiempo-orden">Orden de Grupo *</Label>
                <Input id="new-tiempo-orden" type="number" min="1" step="1" value={newTiempoComidaOrdenGrupo} onChange={(e) => setNewTiempoComidaOrdenGrupo(e.target.value)} placeholder="Ej. 1" disabled={isAddingTiempo}/>
            </div>
             <div></div> {/* Spacer */}
         </div>
       <Button onClick={handleAddTiempoComida} disabled={isAddingTiempo} size="lg">
           {isAddingTiempo ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
           {isAddingTiempo ? 'Añadiendo...' : '+ Añadir Tiempo'}
       </Button>
   </div>
</div>
)}
</CardContent>
</Card>

{/* ================== Section for Alternativas ================== */}
<Card>
<CardHeader>
<CardTitle>Alternativas de Comida</CardTitle>
<p className="text-sm text-muted-foreground pt-1">Define las opciones específicas (Comedor, Para Llevar) disponibles para cada Tiempo de Comida.</p>
</CardHeader>
<CardContent>
{/* Toggle Inactive */}
<div className="flex items-center space-x-2 mb-4">
<Checkbox id="show-inactive-alternativas" checked={showInactiveAlternativas} onCheckedChange={(checked) => setShowInactiveAlternativas(Boolean(checked))} disabled={isTiempoFormActive || isAlternativaFormActive} />
<Label htmlFor="show-inactive-alternativas" className="text-sm">Mostrar alternativas inactivas</Label>
</div>

{/* Loop through TiemposComida to group Alternativas */}
{tiemposComida.length === 0 && !isLoadingPageData && (
<p className="text-muted-foreground text-center py-6">Defina primero un Tiempo de Comida para poder añadir alternativas.</p>
)}
{tiemposComida.map(tiempo => {
const alternativasParaEsteTiempo = alternativas.filter(alt => alt.tiempoComidaId === tiempo.id);
const alternativasVisibles = alternativasParaEsteTiempo.filter(alt => showInactiveAlternativas || alt.isActive);
return (
   <div key={tiempo.id} className={`mb-6 p-4 border rounded-lg bg-white dark:bg-gray-800 shadow-sm ${isTiempoFormActive ? 'opacity-50 pointer-events-none' : ''}`}>
        <h4 className="font-semibold text-xl mb-4 border-b pb-2 text-primary">{tiempo.nombre} <span className="text-sm font-normal text-muted-foreground">({DayOfWeekMap[tiempo.dia]})</span></h4>
        <ul className="space-y-3 mb-4"> {/* Increased spacing */}
        {alternativasVisibles.map(alt => (
               <li key={alt.id} className={`p-3 rounded-md border ${alt.isActive ? '' : 'bg-slate-100 dark:bg-slate-800/50 opacity-70'} ${editingAlternativaId === alt.id ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700' : 'hover:bg-slate-50 dark:hover:bg-slate-700/30'}`}>
                   {editingAlternativaId === alt.id ? (
                       // EDIT FORM for Alternativa
                       <AlternativaForm
                           formData={alternativeFormData}
                           onFormChange={handleAlternativaFormChange}
                           onSubmit={handleSaveAlternativa}
                           onCancel={handleCancelAlternativaForm}
                           isSaving={isSavingAlternativa}
                           availableComedores={comedores}
                           availableHorarios={horariosSolicitud}
                           formTitle={`Editando Alternativa`}
                           submitButtonText="Guardar Cambios"
                       />
                   ) : (
                       // DISPLAY ROW for Alternativa
                       <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                           {/* Details */}
                           <div className="flex-grow">
                               <span className="font-medium text-lg">{alt.nombre}</span>
                               <span className={`text-xs ml-2 font-semibold ${alt.isActive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{alt.isActive ? '(Activo)' : '(Inactivo)'}</span>
                               <div className="mt-1 space-x-1">
                                   <Badge variant={alt.tipo === 'comedor' ? 'default' : 'secondary'} className="capitalize">{alt.tipo === 'comedor' ? 'Comedor' : 'P/Llevar'}</Badge>
                                   <Badge variant="outline" className="capitalize">{alt.tipoAcceso}</Badge>
                               </div>
                               <p className="text-sm text-muted-foreground mt-1">
                                   Ventana: {alt.ventanaInicio}{alt.iniciaDiaAnterior ? ' (d. ant.)' : ''} - {alt.ventanaFin}{alt.terminaDiaSiguiente ? ' (d. sig.)' : ''}
                                   {alt.comedorId && ` | ${comedores.find(c => c.id === alt.comedorId)?.nombre || '?'}`} | Regla:
                                   <span className="italic"> {horariosSolicitud.find(h => h.id === alt.horarioSolicitudComidaId)?.nombre || 'N/A'}</span>
                               </p>
                           </div>
                           {/* Actions */}
                           <div className="space-x-1 flex-shrink-0 mt-2 sm:mt-0">
                               <Button variant="outline" size="sm" onClick={() => handleOpenEditAlternativaForm(alt)} disabled={isAlternativaFormActive || isTiempoFormActive}>Editar</Button>
                               <Button variant={alt.isActive ? "ghost" : "secondary"} size="sm" onClick={() => handleToggleAlternativaActive(alt.id, !alt.isActive)} disabled={isAlternativaFormActive || isTiempoFormActive}>{alt.isActive ? 'Desac.' : 'Activar'}</Button>
                               <AlertDialog>
                                   <AlertDialogTrigger asChild>
                                       <Button variant="destructive" size="sm" disabled={isAlternativaFormActive || isTiempoFormActive}>Eliminar</Button>
                                   </AlertDialogTrigger>
                                   <AlertDialogContent>
                                       <AlertDialogHeader>
                                           <AlertDialogTitle>¿Eliminar Alternativa?</AlertDialogTitle>
                                           <AlertDialogDescription>Se eliminará "{alt.nombre}". Esta acción no se puede deshacer.</AlertDialogDescription>
                                       </AlertDialogHeader>
                                       <AlertDialogFooter>
                                           <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                           <AlertDialogAction onClick={() => handleDeleteAlternativa(alt.id, alt.nombre)} className={buttonVariants({ variant: "destructive" })}>Sí, Eliminar</AlertDialogAction>
                                       </AlertDialogFooter>
                                   </AlertDialogContent>
                               </AlertDialog>
                           </div>
                       </div>
                   )}
               </li>
           ))}
           {alternativasVisibles.length === 0 && <p className="text-sm text-muted-foreground px-2 py-1 text-center">{showInactiveAlternativas ? 'No hay alternativas inactivas para este tiempo.' : 'No hay alternativas activas para este tiempo.'}</p>}
        </ul>
        {/* Add Alternativa Button/Form */}
        <div className="mt-3 pt-3 border-t">
            {!isAlternativaFormActive && ( <Button variant="outline" size="sm" onClick={() => handleOpenAddAlternativaForm(tiempo.id)} disabled={isTiempoFormActive}>+ Añadir Alternativa a este Tiempo</Button> )}
            {addingAlternativaTo === tiempo.id && (
                <AlternativaForm
                    formData={alternativeFormData}
                    onFormChange={handleAlternativaFormChange}
                    onSubmit={handleAddAlternativa}
                    onCancel={handleCancelAlternativaForm}
                    isSaving={isSavingAlternativa}
                    availableComedores={comedores}
                    availableHorarios={horariosSolicitud}
                    formTitle={`Añadir Alternativa a ${tiempo.nombre}`}
                    submitButtonText="Añadir Alternativa"
                />
            )}
        </div>
   </div>
);
})}

{/* Section for Orphaned alternatives - requires loading finished */}
{!isLoadingPageData && alternativas.filter(alt => !tiemposComida.find(tc => tc.id === alt.tiempoComidaId)).length > 0 && (
<div className="mt-6 p-4 border rounded border-orange-300 bg-orange-50 dark:bg-orange-900/30">
    <h4 className="font-semibold text-orange-700 dark:text-orange-300">Alternativas Huérfanas</h4>
    <p className="text-xs text-orange-600 dark:text-orange-400">Edite o elimine estas alternativas, ya que su Tiempo de Comida asociado ya no existe.</p>
    <ul className="list-disc list-inside mt-2 space-y-1">
       {alternativas
           .filter(alt => !tiemposComida.find(tc => tc.id === alt.tiempoComidaId))
           .map(alt => (
               <li key={alt.id} className="text-sm text-orange-700 dark:text-orange-300 flex justify-between items-center">
                   <span>{alt.nombre} <span className="text-xs">({alt.isActive ? 'Activa':'Inactiva'})</span></span>
                    <div className="space-x-2">
                       <Button variant="link" size="sm" className="text-orange-700 dark:text-orange-300 h-auto p-0 underline" onClick={() => handleOpenEditAlternativaForm(alt)} disabled={isTiempoFormActive || isAlternativaFormActive}>Editar</Button>
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="link" size="sm" className="text-red-600 dark:text-red-400 h-auto p-0 underline" disabled={isTiempoFormActive || isAlternativaFormActive}>Eliminar</Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader> <AlertDialogTitle>¿Eliminar Alternativa Huérfana?</AlertDialogTitle> <AlertDialogDescription>Se eliminará "{alt.nombre}".</AlertDialogDescription> </AlertDialogHeader>
                                <AlertDialogFooter> <AlertDialogCancel>Cancelar</AlertDialogCancel> <AlertDialogAction onClick={() => handleDeleteAlternativa(alt.id, alt.nombre)} className={buttonVariants({ variant: "destructive" })}>Sí, Eliminar</AlertDialogAction> </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </div>
                </li>
           ))
       }
    </ul>
</div>
)}
</CardContent>
</Card>
</div>
);
}
