// src/app/admin/residencia/page.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { X, PlusCircle, Pencil, Trash2, Loader2, AlertCircle } from 'lucide-react'; // Added Loader2, AlertCircle
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";

import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogClose,
} from "@/components/ui/dialog";

import { Textarea } from "@/components/ui/textarea";

// --- Firebase & Auth Hook Imports ---
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase'; // Import auth and db instances
import {
    collection,
    getDocs,
    addDoc,
    doc,
    writeBatch,
    setDoc,
    query,
    where,
    orderBy,
    deleteDoc,
    updateDoc,
    deleteField,
    getDoc, // Added getDoc
    FieldValue // Ensure FieldValue is imported if deleteField is used
} from 'firebase/firestore';

// --- Model Imports ---
import {
  Residencia,
  HorarioSolicitudComida, HorarioSolicitudComidaId,
  Comedor, ComedorId,
  Dieta,
  ResidenciaId,
  DayOfWeekKey, DayOfWeekMap,
  UserProfile, // Keep UserProfile
  UserRole,    // Keep UserRole
} from '@/models/firestore';


// --- Constants ---
const daysOfWeek: { label: string; value: DayOfWeekKey }[] = [
    { label: 'Monday', value: 'lunes' }, { label: 'Tuesday', value: 'martes' }, { label: 'Wednesday', value: 'miercoles' }, { label: 'Thursday', value: 'jueves' }, { label: 'Friday', value: 'viernes' }, { label: 'Saturday', value: 'sabado' }, { label: 'Sunday', value: 'domingo' },
] as const;
const orderedDaysOfWeek: DayOfWeekKey[] = daysOfWeek.map(d => d.value);

// --- Helper Sort Functions ---
const sortHorarios = (horarios: HorarioSolicitudComida[]): HorarioSolicitudComida[] => {
    return [...horarios].sort((a, b) => {
        const dayAIndex = orderedDaysOfWeek.indexOf(a.dia); const dayBIndex = orderedDaysOfWeek.indexOf(b.dia);
        if (dayAIndex !== dayBIndex) { return dayAIndex - dayBIndex; }
        return a.horaSolicitud.localeCompare(b.horaSolicitud);
    });
};
const sortComedores = (comedores: Comedor[]): Comedor[] => {
    return [...comedores].sort((a, b) => a.nombre.localeCompare(b.nombre));
};

// --- Type Definitions for Dialog Props ---
type EditHorarioDialogProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  horario: HorarioSolicitudComida | null;
  nombre: string; setNombre: (value: string) => void;
  dia: DayOfWeekKey | ''; setDia: (value: DayOfWeekKey | '') => void;
  hora: string; setHora: (value: string) => void;
  isPrimary: boolean; setIsPrimary: (value: boolean) => void;
  isProcessing: boolean;
  onSubmit: (e: React.FormEvent) => Promise<void>;
};
type EditComedorDialogProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  comedor: Comedor | null;
  nombre: string; setNombre: (value: string) => void;
  descripcion: string; setDescripcion: (value: string) => void;
  isProcessing: boolean;
  onSubmit: (e: React.FormEvent) => Promise<void>;
};


// =========================================================================
// Main Page Component
// =========================================================================
export default function ResidenciaAdminPage() {
    const router = useRouter();
    const { toast } = useToast();

    // --- New Auth and Profile State ---
    const [authUser, authFirebaseLoading, authFirebaseError] = useAuthState(auth); // Firebase Auth state
    const [userProfile, setUserProfile] = useState<UserProfile | null>(null); // Firestore profile
    const [profileLoading, setProfileLoading] = useState<boolean>(true); // Loading state for profile fetch
    const [profileError, setProfileError] = useState<string | null>(null); // Error state for profile fetch
    const [isAuthorized, setIsAuthorized] = useState<boolean>(false); // Authorization status

    // --- State: New Residence Form ---
    const [newResidenceName, setNewResidenceName] = useState('');
    const [newSubmissionTimes, setNewSubmissionTimes] = useState<Partial<Record<DayOfWeekKey, string>>>({});
    const [newComedores, setNewComedores] = useState<string[]>([]);
    const [currentComedorName, setCurrentComedorName] = useState('');
    const [isProcessingCreate, setIsProcessingCreate] = useState(false);
    const [editingResidenciaFullData, setEditingResidenciaFullData] = useState<Partial<Residencia> | null>(null);
    const [isProcessingGeneralConfig, setIsProcessingGeneralConfig] = useState(false);
    const [activeCustomFieldAccordions, setActiveCustomFieldAccordions] = useState<string[]>(['custom-field-1']); // Por defecto, abre el primer acordeón

    // --- State: Existing Residences List ---
    const [residences, setResidences] = useState<Residencia[]>([]);
    const [isLoadingResidences, setIsLoadingResidences] = useState(false);
    const [errorResidences, setErrorResidences] = useState<string | null>(null);

    // --- State: Management Modal ---
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [managingResidenciaId, setManagingResidenciaId] = useState<ResidenciaId | null>(null);
    const [managingResidenciaNombre, setManagingResidenciaNombre] = useState<string>('');
    const [isLoadingModalData, setIsLoadingModalData] = useState(false);
    const [errorModalData, setErrorModalData] = useState<string | null>(null);

    // --- State: Modal - Horarios ---
    const [modalHorarios, setModalHorarios] = useState<HorarioSolicitudComida[]>([]);
    const [newHorarioNombre, setNewHorarioNombre] = useState('');
    const [newHorarioDia, setNewHorarioDia] = useState<DayOfWeekKey | ''>('');
    const [newHorarioHora, setNewHorarioHora] = useState('');
    const [newHorarioIsPrimary, setNewHorarioIsPrimary] = useState(false);
    const [newHorarioIsActive, setNewHorarioIsActive] = useState(true);
    const [isProcessingNewHorario, setIsProcessingNewHorario] = useState(false);

    // --- State: Modal - Comedores ---
    const [modalComedores, setModalComedores] = useState<Comedor[]>([]);
    const [newComedorNombre, setNewComedorNombre] = useState('');
    const [newComedorDescripcion, setNewComedorDescripcion] = useState('');
    const [isProcessingNewComedor, setIsProcessingNewComedor] = useState(false);

    // --- State: Editing Horario ---
    const [editingHorario, setEditingHorario] = useState<HorarioSolicitudComida | null>(null);
    const [isEditHorarioDialogOpen, setIsEditHorarioDialogOpen] = useState(false);
    const [editHorarioNombre, setEditHorarioNombre] = useState('');
    const [editHorarioDia, setEditHorarioDia] = useState<DayOfWeekKey | ''>('');
    const [editHorarioHora, setEditHorarioHora] = useState('');
    const [editHorarioIsPrimary, setEditHorarioIsPrimary] = useState(false);
    const [isProcessingEditHorario, setIsProcessingEditHorario] = useState(false);

    // --- State: Editing Comedor ---
    const [editingComedor, setEditingComedor] = useState<Comedor | null>(null);
    const [isEditComedorDialogOpen, setIsEditComedorDialogOpen] = useState(false);
    const [editComedorNombre, setEditComedorNombre] = useState('');
    const [editComedorDescripcion, setEditComedorDescripcion] = useState('');
    const [isProcessingEditComedor, setIsProcessingEditComedor] = useState(false);
    const [hasAttemptedFetchResidences, setHasAttemptedFetchResidences] = useState(false);

        // --- Estados para el Nuevo Formulario Plano ---
    const [selectedResidenciaId, setSelectedResidenciaId] = useState<string | null>(null);
    const [isEditing, setIsEditing] = useState<boolean>(false); // true si se selecciona una residencia, false si se limpia para crear
    const [residenciaFormData, setResidenciaFormData] = useState<Partial<Residencia>>({});
    const [currentHorarios, setCurrentHorarios] = useState<HorarioSolicitudComida[]>([]);
    const [isLoadingHorarios, setIsLoadingHorarios] = useState<boolean>(false);
    const [newHorarioData, setNewHorarioData] = useState<Partial<Omit<HorarioSolicitudComida, 'id' | 'residenciaId'>>>({
        nombre: '', dia: undefined, horaSolicitud: '', isPrimary: false, isActive: true
    });
    const [isProcessingSave, setIsProcessingSave] = useState<boolean>(false); // Para el botón principal de guardar
    const [isProcessingHorario, setIsProcessingHorario] = useState<boolean>(false); // Para añadir/eliminar horarios

    // --- Fetch Residencia Details and Horarios ---
    const loadResidenciaDataForEditing = useCallback(async (residenciaId: string | null) => {
        if (!residenciaId) {
            // Limpiar formulario si no hay ID seleccionado (aunque el botón "Nueva" también hace esto)
            setSelectedResidenciaId(null);
            setResidenciaFormData({});
            setCurrentHorarios([]);
            setIsEditing(false);
            return;
        }

        console.log(`Cargando datos para residencia ID: ${residenciaId}`);
        setSelectedResidenciaId(residenciaId);
        setIsEditing(true);
        setIsLoadingHorarios(true); // Indicar carga
        setResidenciaFormData({}); // Limpiar datos previos mientras carga
        setCurrentHorarios([]);

        try {
            // Cargar datos de la Residencia
            const residenciaDocRef = doc(db, "residencias", residenciaId);
            const residenciaDocSnap = await getDoc(residenciaDocRef);

            if (residenciaDocSnap.exists()) {
                const data = residenciaDocSnap.data() as Residencia;
                // Establecer formulario con valores por defecto si no existen
                setResidenciaFormData({
                    id: residenciaDocSnap.id,
                    nombre: data.nombre || '',
                    direccion: data.direccion || '', // Añadir si tienes el campo
                    logoUrl: data.logoUrl || '',   // Añadir si tienes el campo
                    nombreEtiquetaCentroCosto: data.nombreEtiquetaCentroCosto || '',
                    antelacionActividadesDefault: data.antelacionActividadesDefault === undefined ? 0 : data.antelacionActividadesDefault, // Default 0 si undefined
                    // Campos Personalizados 1
                    campoPersonalizado1_etiqueta: data.campoPersonalizado1_etiqueta || '',
                    campoPersonalizado1_isActive: data.campoPersonalizado1_isActive === undefined ? false : data.campoPersonalizado1_isActive,
                    campoPersonalizado1_necesitaValidacion: data.campoPersonalizado1_necesitaValidacion === undefined ? false : data.campoPersonalizado1_necesitaValidacion,
                    campoPersonalizado1_regexValidacion: data.campoPersonalizado1_regexValidacion || '',
                    campoPersonalizado1_tamanoTexto: data.campoPersonalizado1_tamanoTexto || 'text',
                    // Campos Personalizados 2
                    campoPersonalizado2_etiqueta: data.campoPersonalizado2_etiqueta || '',
                    campoPersonalizado2_isActive: data.campoPersonalizado2_isActive === undefined ? false : data.campoPersonalizado2_isActive,
                    campoPersonalizado2_necesitaValidacion: data.campoPersonalizado2_necesitaValidacion === undefined ? false : data.campoPersonalizado2_necesitaValidacion,
                    campoPersonalizado2_regexValidacion: data.campoPersonalizado2_regexValidacion || '',
                    campoPersonalizado2_tamanoTexto: data.campoPersonalizado2_tamanoTexto || 'text',
                    // Campos Personalizados 3
                    campoPersonalizado3_etiqueta: data.campoPersonalizado3_etiqueta || '',
                    campoPersonalizado3_isActive: data.campoPersonalizado3_isActive === undefined ? false : data.campoPersonalizado3_isActive,
                    campoPersonalizado3_necesitaValidacion: data.campoPersonalizado3_necesitaValidacion === undefined ? false : data.campoPersonalizado3_necesitaValidacion,
                    campoPersonalizado3_regexValidacion: data.campoPersonalizado3_regexValidacion || '',
                    campoPersonalizado3_tamanoTexto: data.campoPersonalizado3_tamanoTexto || 'text',
                });
            } else {
                toast({ title: "Error", description: "No se encontró la residencia seleccionada.", variant: "destructive" });
                setSelectedResidenciaId(null);
                setIsEditing(false);
                return; // Salir si no se encuentra la residencia
            }

            // Cargar Horarios de Solicitud asociados
            const horariosQuery = query(collection(db, 'horariosSolicitudComida'), where("residenciaId", "==", residenciaId));
            const horariosSnapshot = await getDocs(horariosQuery);
            const fetchedHorarios: HorarioSolicitudComida[] = horariosSnapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as Omit<HorarioSolicitudComida, 'id'>) }));
            setCurrentHorarios(sortHorarios(fetchedHorarios)); // Usar tu función de ordenación

        } catch (err) {
            console.error("Error cargando datos de residencia y/o horarios:", err);
            const message = err instanceof Error ? err.message : "Error desconocido";
            toast({ title: "Error de Carga", description: message, variant: "destructive" });
            // Resetear estado en caso de error
            setSelectedResidenciaId(null);
            setResidenciaFormData({});
            setCurrentHorarios([]);
            setIsEditing(false);
        } finally {
            setIsLoadingHorarios(false);
        }
    }, [toast]); // Añadir otras dependencias si son necesarias (db, etc.) - db es global así que no haría falta


    // --- Fetch Residences Function ---
    const fetchResidences = useCallback(async () => {
        setIsLoadingResidences(true);
        setErrorResidences(null);
        try {
            const residencesCol = collection(db, 'residencias');
            const residenceSnapshot = await getDocs(query(residencesCol, orderBy("nombre"))); // Add ordering
            const fetchedResidences: Residencia[] = residenceSnapshot.docs.map(doc => ({
                id: doc.id,
                ...(doc.data() as Omit<Residencia, 'id'>)
            }));
            // fetchedResidences.sort((a, b) => a.nombre.localeCompare(b.nombre)); // Already ordered by Firestore
            setResidences(fetchedResidences);
        } catch (error) {
            const errorMessage = `Failed to fetch residences. ${error instanceof Error ? error.message : 'Unknown error'}`;
            console.error("Error fetching residences: ", error);
            setErrorResidences(errorMessage);
            toast({ title: "Error", description: "Could not fetch residences from Firestore.", variant: "destructive" });
        } finally {
            setIsLoadingResidences(false);
            setHasAttemptedFetchResidences(true); // <<< ADD THIS LINE
        }
    }, [toast, setHasAttemptedFetchResidences]); // <<< ADD setHasAttemptedFetchResidences


    // --- useEffect: Handle Authorization & Fetch Page Data ---
    useEffect(() => {
        // Wait until profile loading is complete and auth check is done
        if (profileLoading || authFirebaseLoading) {
            setIsAuthorized(false); // Not authorized while critical info is loading
            return;
        }

        // If there was an error fetching profile, or no profile, user can't be authorized
        if (profileError || !userProfile) {
            console.log("Authorization check failed: Profile error or profile missing.");
            setIsAuthorized(false);
            // The main render logic will show an error page or redirect based on profileError or !isAuthorized
            return;
        }

        // Check roles from the successfully fetched userProfile
        const roles = userProfile.roles || [];
        const userCanViewPage = roles.includes('master') || roles.includes('admin');

        if (userCanViewPage) {
            setIsAuthorized(true); // Authorize if roles permit viewing

            // Proceed to fetch residences data only if authorized and not already fetched/fetching
            if (!isLoadingResidences && !hasAttemptedFetchResidences) {
                console.log("FETCH_LOGIC: User is Authorized. Not loading residences AND not attempted fetch yet. Initiating fetch.");
                fetchResidences(); // This will set isLoadingResidences = true internally
            } else if (isLoadingResidences) {
                console.log("FETCH_LOGIC: User is Authorized. Residence fetch is currently in progress.");
            } else if (hasAttemptedFetchResidences) {
                // This means fetchResidences was called and completed (successfully or not)
                console.log(`FETCH_LOGIC: User is Authorized. Residence fetch attempt completed. Residences found: ${residences.length}`);
                 if (residences.length === 0) {
                    // You might want to inform the user if they are authorized but no residences were found/loaded
                    // For example, if an admin has no assigned residenciaId, or master sees an empty list.
                    // toast({ title: "Información", description: "No se encontraron residencias." });
                }
            }
        } else {
            // User's roles do not grant access to this page
            console.warn("Authorization check failed: User lacks 'master' or 'admin' role for this page.");
            setIsAuthorized(false);
            toast({
                title: "Acceso Denegado",
                description: "No tienes los permisos (master o admin) para acceder a esta página.",
                variant: "destructive"
            });
            // The main render logic (further down) will display an "Acceso Denegado" view
            // based on isAuthorized === false. A router.replace('/') here could be too abrupt.
        }
    }, [
        userProfile,
        profileLoading,
        profileError,
        authFirebaseLoading,
        toast, // Stable dependency from useToast
        fetchResidences, // useCallback wrapped function
        isLoadingResidences,
        hasAttemptedFetchResidences,
        residences.length // Added to re-evaluate if residences list changes (e.g. after creation)
        // DO NOT include 'isAuthorized' in dependencies if it's set within this effect.
        // 'router' is not strictly needed here if redirects are handled by render logic.
    ]);

    // --- Form Handlers: Create Residence ---
    const handleTimeChange = (day: DayOfWeekKey, value: string) => {
        setNewSubmissionTimes(prev => ({ ...prev, [day]: value }));
    };
    const handleAddComedor = () => {
        const trimmedName = currentComedorName.trim();
        if (!trimmedName) return;
        if (newComedores.some(name => name.toLowerCase() === trimmedName.toLowerCase())) {
            toast({ title: "Advertencia", description: `El comedor "${trimmedName}" ya fue agregado.`, variant: "default" }); return; // Changed to default variant
        }
        setNewComedores(prev => [...prev, trimmedName]); setCurrentComedorName('');
        toast({ title: "Éxito", description: `Comedor agregado: "${trimmedName}"` });
    };
    const handleRemoveComedor = (nameToRemove: string) => {
        setNewComedores(prev => prev.filter(name => name !== nameToRemove));
        toast({ title: "Eliminado", description: `Comedor eliminado: "${nameToRemove}"` });
    };
    const handleCreateResidence = async () => {
        if (!newResidenceName.trim()) { toast({ title: "Error", description: "El nombre de la residencia no puede estar vacío.", variant: "destructive" }); return; }
        const validTimes = Object.entries(newSubmissionTimes).filter(([_, time]) => time && /^\d{2}:\d{2}$/.test(time));
        if (validTimes.length === 0) { toast({ title: "Error", description: "Define al menos un horario de solicitud de comida principal (HH:MM).", variant: "destructive" }); return; }
        if (newComedores.length === 0) { toast({ title: "Error", description: "Agrega al menos un comedor.", variant: "destructive" }); return; }

        setIsProcessingCreate(true);
        let newResidenciaId: ResidenciaId | null = null;
        try {
            const residenciaData: Omit<Residencia, 'id'> = { nombre: newResidenceName.trim() };
            const residenciaRef = await addDoc(collection(db, 'residencias'), residenciaData);
            newResidenciaId = residenciaRef.id;
            const batch = writeBatch(db);
            // Default Dieta
            const defaultDietaRef = doc(db, 'dietas', `N_${newResidenciaId}`);
            const defaultDietaData: Omit<Dieta, 'id'> = { residenciaId: newResidenciaId, nombre: "Dieta Normal", descripcion: "Dieta normal (por defecto).", isDefault: true, isActive: true };
            batch.set(defaultDietaRef, defaultDietaData);
            // Comedores
            newComedores.forEach((nombreComedor) => {
                const comedorRef = doc(collection(db, 'comedores')); // Auto-generate ID
                const comedorData: Omit<Comedor, 'id'> = { nombre: nombreComedor, residenciaId: newResidenciaId! };
                batch.set(comedorRef, comedorData);
            });
            // Horarios (Primary only)
            for (const day in newSubmissionTimes) {
                const timeString = newSubmissionTimes[day as DayOfWeekKey];
                if (timeString && /^\d{2}:\d{2}$/.test(timeString)) {
                    const horarioRef = doc(collection(db, 'horariosSolicitudComida')); // Auto-generate ID
                    const horarioData: Omit<HorarioSolicitudComida, 'id'> = {
                        residenciaId: newResidenciaId!, nombre: `Solicitud Principal ${DayOfWeekMap[day as DayOfWeekKey]}`,
                        dia: day as DayOfWeekKey, horaSolicitud: timeString, isPrimary: true, isActive: true,
                    };
                    batch.set(horarioRef, horarioData);
                }
            }
            await batch.commit();
            toast({ title: "Éxito", description: `Residencia "${newResidenceName}" y configuración inicial creada.` });
            const newResidenceForState: Residencia = { id: newResidenciaId!, nombre: newResidenceName.trim() };
            setResidences(prev => [...prev, newResidenceForState].sort((a, b) => a.nombre.localeCompare(b.nombre)));
            setNewResidenceName(''); setNewSubmissionTimes({}); setNewComedores([]); setCurrentComedorName('');
        } catch (error) {
            const errorMessage = `Error al crear la residencia. ${error instanceof Error ? error.message : 'Error desconocido'}`;
            console.error("Error creating residence: ", error); toast({ title: "Error", description: errorMessage, variant: "destructive" });
        } finally { setIsProcessingCreate(false); }
    };

    // --- Handlers: Modal - General Configuration Tab ---
    const handleResidenciaDataChange = (
        field: keyof Pick<Residencia, 'nombreEtiquetaCentroCosto' | 'antelacionActividadesDefault'>,
        value: string | number | null // value desde el input puede ser string ('' si está vacío) o null como lo pasamos
    ) => {
        setEditingResidenciaFullData(prev => {
            if (!prev) return null;

            if (field === 'antelacionActividadesDefault') {
                if (value === null || value === '') { // Si el input se vacía
                    return { ...prev, [field]: undefined }; // Guardar undefined
                }
                const numValue = parseInt(String(value), 10);
                return { ...prev, [field]: isNaN(numValue) ? undefined : numValue }; // Si no es número, undefined
            }
            if (typeof value === 'string' && value.trim() !== '') {
                return { ...prev, [field]: value }; // Asignar el string si no está vacío
            } else {
                // Si es null, '', o teóricamente un número (aunque no debería)
                return { ...prev, [field]: undefined }; // Asignar undefined
            }
        });
    };

    // REEMPLAZA la definición existente de handleCustomFieldChange con esta:
    const handleCustomFieldChange = (
        fieldNumber: 1 | 2 | 3,
        // Define explícitamente los posibles sufijos de los campos personalizados
        subField: 'etiqueta' | 'isActive' | 'necesitaValidacion' | 'regexValidacion' | 'tamanoTexto', 
        value: string | boolean // El valor puede ser string (inputs, textarea, select) o boolean (switch)
    ) => {
        setEditingResidenciaFullData(prev => {
            if (!prev) return null;
            // Construye la clave completa para acceder al estado
            const key = `campoPersonalizado${fieldNumber}_${subField}` as keyof Residencia;

            // Asegurar el tipo correcto antes de asignar al estado
            // Nota: El valor de 'tamanoTexto' viene del Select como string ('text' o 'textArea')
            //       El valor de 'isActive' y 'necesitaValidacion' viene del Switch como boolean
            //       El valor de 'etiqueta' y 'regexValidacion' viene de Input/Textarea como string
            
            // No es estrictamente necesario validar el tipo aquí si los componentes onChange
            // ya pasan el tipo correcto, pero no hace daño ser explícito.
            if ((subField === 'isActive' || subField === 'necesitaValidacion') && typeof value === 'boolean') {
                return { ...prev, [key]: value };
            } else if ((subField === 'etiqueta' || subField === 'regexValidacion' || subField === 'tamanoTexto') && typeof value === 'string') {
                // Para tamanoTexto, aseguramos que sea 'text' o 'textArea' aunque venga del Select
                if (subField === 'tamanoTexto' && (value === 'text' || value === 'textArea')) {
                    return { ...prev, [key]: value };
                } else if (subField !== 'tamanoTexto') {
                    return { ...prev, [key]: value };
                }
            }
            // Si el tipo no coincide (no debería pasar con los componentes actuales), no actualiza
            console.warn(`Tipo inesperado para ${key}:`, value);
            return prev; 
        });
    };


    // Esqueleto de la función para guardar - la implementaremos en la Fase 3
    const handleSaveGeneralConfig = async () => {
        if (!managingResidenciaId || !editingResidenciaFullData) {
            toast({ title: "Error", description: "No hay datos de residencia para guardar.", variant: "destructive" });
            return;
        }
        if (!userProfile?.roles?.includes('master') && !userProfile?.roles?.includes('admin')) {
            toast({ title: "Acceso Denegado", description: "No tienes permisos para guardar esta configuración.", variant: "destructive" });
            return;
        }

        setIsProcessingGeneralConfig(true);

        try {
            const docRef = doc(db, "residencias", managingResidenciaId);
            
            // Crear un payload solo con los campos que queremos actualizar.
            // Esto evita sobrescribir accidentalmente otros campos de la residencia.
            const updatePayload: { [K in keyof Residencia]?: Residencia[K] | FieldValue } = {};

            // Campos generales
            updatePayload.nombreEtiquetaCentroCosto = editingResidenciaFullData.nombreEtiquetaCentroCosto?.trim() || deleteField();
            updatePayload.antelacionActividadesDefault = (typeof editingResidenciaFullData.antelacionActividadesDefault === 'number' && !isNaN(editingResidenciaFullData.antelacionActividadesDefault)) 
                                                    ? editingResidenciaFullData.antelacionActividadesDefault 
                                                    : deleteField();

            // Campos Personalizados (N=1, 2, 3)
            // --- Inicio: Reestructuración Bucle for ---
            for (let i = 1; i <= 3; i++) {
                const num = i as 1 | 2 | 3;
                // Claves específicas como constantes literales para mejor inferencia de tipos
                const etiquetaKey = `campoPersonalizado${num}_etiqueta` as const;
                const isActiveKey = `campoPersonalizado${num}_isActive` as const;
                const necesitaValidacionKey = `campoPersonalizado${num}_necesitaValidacion` as const;
                const regexValidacionKey = `campoPersonalizado${num}_regexValidacion` as const;
                const tamanoTextoKey = `campoPersonalizado${num}_tamanoTexto` as const;

                // Obtener y validar la etiqueta primero
                const etiquetaValueSource = editingResidenciaFullData[etiquetaKey];
                const etiquetaValue = typeof etiquetaValueSource === 'string' ? etiquetaValueSource.trim() : undefined;

                if (etiquetaValue) {
                    // Si hay etiqueta, el campo está configurado. Guardarla.
                    updatePayload[etiquetaKey] = etiquetaValue; // Asignación directa de string a string | undefined

                    // Procesar isActive
                    const isActiveValueSource = editingResidenciaFullData[isActiveKey];
                    const isActiveValue = typeof isActiveValueSource === 'boolean' ? isActiveValueSource : false;
                    updatePayload[isActiveKey] = isActiveValue; // Asignación directa de boolean a boolean | undefined

                    if (isActiveValue) {
                        // --- Campo Activo: Procesar sub-propiedades ---

                        // Procesar necesitaValidacion
                        const necesitaValidacionValueSource = editingResidenciaFullData[necesitaValidacionKey];
                        const necesitaValidacionValue = typeof necesitaValidacionValueSource === 'boolean' ? necesitaValidacionValueSource : false;
                        updatePayload[necesitaValidacionKey] = necesitaValidacionValue; // Asignación directa de boolean a boolean | undefined

                        // Procesar regexValidacion (con permiso de master)
                        if (necesitaValidacionValue) {
                            if (userProfile?.roles?.includes('master')) {
                                const regexValidacionValueSource = editingResidenciaFullData[regexValidacionKey];
                                const regexValidacionValue = typeof regexValidacionValueSource === 'string' ? regexValidacionValueSource.trim() : undefined;
                                if (regexValidacionValue) {
                                    updatePayload[regexValidacionKey] = regexValidacionValue; // Asignación directa string a string | undefined
                                } else {
                                    // Si es master y está vacío, borrar de DB
                                    updatePayload[regexValidacionKey] = deleteField();
                                }
                            }
                            // Si no es master, no se toca updatePayload[regexValidacionKey], manteniendo el valor de DB
                        } else {
                            // Si no necesita validación, borrar de DB
                            updatePayload[regexValidacionKey] = deleteField();
                        }

                        // Procesar tamanoTexto
                        const tamanoTextoValueSource = editingResidenciaFullData[tamanoTextoKey];
                        const tamanoTextoValue = (tamanoTextoValueSource === 'text' || tamanoTextoValueSource === 'textArea') ? tamanoTextoValueSource : 'text';
                        updatePayload[tamanoTextoKey] = tamanoTextoValue; // Asignación directa 'text'|'textArea' a 'text'|'textArea'|undefined

                    } else {
                        // --- Campo Inactivo: Borrar sub-propiedades de DB ---
                        updatePayload[necesitaValidacionKey] = deleteField();
                        updatePayload[regexValidacionKey] = deleteField();
                        updatePayload[tamanoTextoKey] = deleteField();
                    }

                } else {
                    // --- Sin Etiqueta: Borrar toda la configuración del campo de DB ---
                    updatePayload[etiquetaKey] = deleteField();
                    updatePayload[isActiveKey] = deleteField();
                    updatePayload[necesitaValidacionKey] = deleteField();
                    updatePayload[regexValidacionKey] = deleteField();
                    updatePayload[tamanoTextoKey] = deleteField();
                }
            }
            // --- Fin: Reestructuración Bucle for ---


            
            // Filtrar campos undefined que podrían haber quedado si no se usó deleteField() para todos los casos
            const finalUpdatePayload = Object.entries(updatePayload).reduce((acc, [key, value]) => {
                // No necesitamos realmente filtrar undefined aquí si updatePayload está bien construido,
                // pero no hace daño y asegura que solo pasamos valores definidos o FieldValue.
                if (value !== undefined) { // Firestore ignora claves con valor undefined de todas formas
                    (acc as any)[key] = value;
                }
                return acc;
            }, {} as { [K in keyof Residencia]?: Residencia[K] | FieldValue }); // Mismo tipo que updatePayload


            if (Object.keys(finalUpdatePayload).length > 0) {
                await updateDoc(docRef, finalUpdatePayload);
                toast({ title: "Éxito", description: "Configuración general guardada correctamente." });

                setResidences(prevRes => {
                    return prevRes.map(r => {
                        if (r.id === managingResidenciaId) {
                            // Crear una nueva versión del objeto 'r' aplicando los cambios
                            const updatedResidencia: Residencia = { ...r }; // Copia inicial

                            // Aplicar los cambios desde editingResidenciaFullData primero (UI state)
                            for (const key in editingResidenciaFullData) {
                                if (Object.prototype.hasOwnProperty.call(editingResidenciaFullData, key) && key !== 'id') {
                                    // Asegurarse que el tipo sea asignable a Residencia[keyof Residencia]
                                    // Esto podría necesitar casteo si editingResidenciaFullData es Partial
                                    (updatedResidencia as any)[key] = (editingResidenciaFullData as any)[key];
                                }
                            }

                            // Luego, aplicar los cambios reales de Firestore (payload)
                            for (const key in finalUpdatePayload) {
                                if (Object.prototype.hasOwnProperty.call(finalUpdatePayload, key)) {
                                    const payloadValue = (finalUpdatePayload as any)[key];
                                    if (payloadValue?.type === 'deleteField') { // Comprobar si es deleteField()
                                        // Si se eliminó el campo, ponerlo como undefined en el estado
                                        (updatedResidencia as any)[key] = undefined;
                                    } else {
                                        // Si no, actualizar con el valor del payload
                                        (updatedResidencia as any)[key] = payloadValue;
                                    }
                                }
                            }
                            return updatedResidencia; // Devolver el objeto que sí cumple con Residencia
                        }
                        return r; // Devolver las otras residencias sin cambios
                    });
                });

                // Opcional: Volver a cargar los datos en editingResidenciaFullData desde Firestore para asegurar consistencia
                // si deleteField() tiene comportamientos complejos o hay triggers.
                // const updatedDocSnap = await getDoc(docRef);
                // if (updatedDocSnap.exists()) { setEditingResidenciaFullData(updatedDocSnap.data() as Residencia); }

            } else {
                toast({ title: "Información", description: "No se detectaron cambios para guardar." });
            }

        } catch (err) {
            console.error("Error guardando configuración general:", err);
            const errorMessage = err instanceof Error ? err.message : "Error desconocido al guardar.";
            toast({ title: "Error al Guardar", description: errorMessage, variant: "destructive" });
        } finally {
            setIsProcessingGeneralConfig(false);
        }
    };

    // --- Handlers: Modal & Data Fetching ---
    const fetchModalData = useCallback(async (residenciaId: ResidenciaId) => {
        if (!residenciaId) return;
        console.log(`Fetching modal data for ${residenciaId}`);
        setIsLoadingModalData(true); setErrorModalData(null); setModalHorarios([]); setModalComedores([]);
        try {
            const horariosQuery = query(collection(db, 'horariosSolicitudComida'), where("residenciaId", "==", residenciaId));
            const horariosSnapshot = await getDocs(horariosQuery);
            let fetchedHorarios: HorarioSolicitudComida[] = horariosSnapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as Omit<HorarioSolicitudComida, 'id'>) }));
            setModalHorarios(sortHorarios(fetchedHorarios));

            const comedoresQuery = query(collection(db, 'comedores'), where("residenciaId", "==", residenciaId));
            const comedoresSnapshot = await getDocs(comedoresQuery);
            let fetchedComedores: Comedor[] = comedoresSnapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as Omit<Comedor, 'id'>) }));
            setModalComedores(sortComedores(fetchedComedores));
        } catch (error) {
            const errorMessage = `Error cargando datos de configuración. ${error instanceof Error ? error.message : 'Error desconocido'}`;
            console.error("Error fetching modal data: ", error); setErrorModalData(errorMessage);
        } finally { setIsLoadingModalData(false); }
    }, []); // Removed toast dependency as it's stable

    const handleManageSettings = async (residencia: Residencia) => {
        if (!residencia || !residencia.id) {
            toast({ title: "Error", description: "No se pudo seleccionar la residencia.", variant: "destructive" });
            return;
        }

        setIsLoadingModalData(true); // Usar el loader general del modal mientras se carga todo
        setManagingResidenciaId(residencia.id);
        setManagingResidenciaNombre(residencia.nombre);
        setEditingResidenciaFullData(null); // Limpiar datos anteriores
        setErrorModalData(null); // Limpiar errores anteriores

        try {
            // 1. Cargar datos específicos del modal (Horarios, Comedores) - tu lógica actual
            await fetchModalData(residencia.id); // Asegúrate que fetchModalData sea async si no lo es ya

            // 2. Cargar los datos completos de la Residencia
            const residenciaDocRef = doc(db, "residencias", residencia.id);
            const residenciaDocSnap = await getDoc(residenciaDocRef);

            if (residenciaDocSnap.exists()) {
                const data = residenciaDocSnap.data() as Residencia;
                // Establecer valores por defecto para los campos nuevos si no existen en Firestore
                setEditingResidenciaFullData({
                    id: residenciaDocSnap.id, // Asegurarse que el ID esté
                    nombre: data.nombre || '',
                    // Campos existentes que ya podrías estar manejando
                    // ...

                    // Nuevos campos generales
                    nombreEtiquetaCentroCosto: data.nombreEtiquetaCentroCosto || '',
                    antelacionActividadesDefault: data.antelacionActividadesDefault || 0,

                    // Campos Personalizados 1
                    campoPersonalizado1_etiqueta: data.campoPersonalizado1_etiqueta || '',
                    campoPersonalizado1_isActive: data.campoPersonalizado1_isActive === undefined ? false : data.campoPersonalizado1_isActive,
                    campoPersonalizado1_necesitaValidacion: data.campoPersonalizado1_necesitaValidacion === undefined ? false : data.campoPersonalizado1_necesitaValidacion,
                    campoPersonalizado1_regexValidacion: data.campoPersonalizado1_regexValidacion || '',
                    campoPersonalizado1_tamanoTexto: data.campoPersonalizado1_tamanoTexto || 'text',

                    // Campos Personalizados 2
                    campoPersonalizado2_etiqueta: data.campoPersonalizado2_etiqueta || '',
                    campoPersonalizado2_isActive: data.campoPersonalizado2_isActive === undefined ? false : data.campoPersonalizado2_isActive,
                    campoPersonalizado2_necesitaValidacion: data.campoPersonalizado2_necesitaValidacion === undefined ? false : data.campoPersonalizado2_necesitaValidacion,
                    campoPersonalizado2_regexValidacion: data.campoPersonalizado2_regexValidacion || '',
                    campoPersonalizado2_tamanoTexto: data.campoPersonalizado2_tamanoTexto || 'text',

                    // Campos Personalizados 3
                    campoPersonalizado3_etiqueta: data.campoPersonalizado3_etiqueta || '',
                    campoPersonalizado3_isActive: data.campoPersonalizado3_isActive === undefined ? false : data.campoPersonalizado3_isActive,
                    campoPersonalizado3_necesitaValidacion: data.campoPersonalizado3_necesitaValidacion === undefined ? false : data.campoPersonalizado3_necesitaValidacion,
                    campoPersonalizado3_regexValidacion: data.campoPersonalizado3_regexValidacion || '',
                    campoPersonalizado3_tamanoTexto: data.campoPersonalizado3_tamanoTexto || 'text',
                });
                setActiveCustomFieldAccordions(['custom-field-1']); // Abrir el primer acordeón por defecto
            } else {
                setErrorModalData("No se encontró el documento de la residencia.");
                toast({ title: "Error", description: "No se pudieron cargar los datos de la residencia.", variant: "destructive" });
                setEditingResidenciaFullData(null);
            }
            setIsModalOpen(true);
        } catch (err) {
            console.error("Error en handleManageSettings o fetchModalData:", err);
            const errorMessage = err instanceof Error ? err.message : "Error desconocido al cargar datos.";
            setErrorModalData(errorMessage);
            toast({ title: "Error de Carga", description: errorMessage, variant: "destructive" });
            setEditingResidenciaFullData(null);
            setIsModalOpen(false); // No abrir el modal si hay un error crítico
        } finally {
            setIsLoadingModalData(false);
        }
    };

    const handleModalOpenChange = (open: boolean) => {
        setIsModalOpen(open);
        if (!open) { // Reset state on modal close
            setManagingResidenciaId(null);
            setManagingResidenciaNombre('');
            setIsLoadingModalData(false);
            setErrorModalData(null);
            
            // Resets de datos del modal
            setModalHorarios([]);
            setModalComedores([]);
            setEditingResidenciaFullData(null); // <--- AÑADIR ESTA LÍNEA
            setActiveCustomFieldAccordions(['custom-field-1']); // <--- AÑADIR ESTA LÍNEA (o a un array vacío si prefieres)

            // Resets de formularios de creación dentro del modal
            setNewHorarioNombre(''); setNewHorarioDia(''); setNewHorarioHora(''); setNewHorarioIsPrimary(false); setNewHorarioIsActive(true); setIsProcessingNewHorario(false);
            setNewComedorNombre(''); setNewComedorDescripcion(''); setIsProcessingNewComedor(false);
            
            // Resets de diálogos de edición individuales (si los mantienes separados)
            setEditingHorario(null); setIsEditHorarioDialogOpen(false); setIsProcessingEditHorario(false);
            setEditingComedor(null); setIsEditComedorDialogOpen(false); setIsProcessingEditComedor(false);
            
            setIsProcessingGeneralConfig(false); // <--- AÑADIR ESTA LÍNEA (si no estaba ya)
        }
    };


    // --- Handlers: Horarios Tab ---
    const handleEditHorario = (horario: HorarioSolicitudComida) => {
        setEditingHorario(horario); setEditHorarioNombre(horario.nombre); setEditHorarioDia(horario.dia); setEditHorarioHora(horario.horaSolicitud); setEditHorarioIsPrimary(horario.isPrimary);
        setIsProcessingEditHorario(false); setIsEditHorarioDialogOpen(true);
    };
    const handleToggleHorarioActive = async (horario: HorarioSolicitudComida) => {
        if (!managingResidenciaId) return;
        const newStatus = !horario.isActive;
        try {
            const horarioRef = doc(db, 'horariosSolicitudComida', horario.id);
            await updateDoc(horarioRef, { isActive: newStatus });
            toast({ title: "Éxito", description: `Horario "${horario.nombre}" ${newStatus ? 'activado' : 'desactivado'}.` });
            setModalHorarios(prev => sortHorarios(prev.map(h => h.id === horario.id ? {...h, isActive: newStatus } : h)));
        } catch (error) {
            const errorMessage = `Error al actualizar estado del horario. ${error instanceof Error ? error.message : 'Error desconocido'}`;
            console.error("Error toggling horario active: ", error); toast({ title: "Error", description: errorMessage, variant: "destructive" });
        }
    };
    const handleCreateHorario = async (e: React.FormEvent) => {
        e.preventDefault(); if (!managingResidenciaId) return;
        if (!newHorarioNombre.trim() || !newHorarioDia || !newHorarioHora || !/^\d{2}:\d{2}$/.test(newHorarioHora)) { toast({ title: "Error Validación", description: "Completa todos los campos del horario correctamente.", variant: "destructive" }); return; }
        if (newHorarioIsPrimary && modalHorarios.some(h => h.dia === newHorarioDia && h.isPrimary)) { if (!confirm(`Ya existe un horario primario para ${DayOfWeekMap[newHorarioDia]}. ¿Añadir otro?`)) return; }
        setIsProcessingNewHorario(true);
        try {
            const newHorarioData: Omit<HorarioSolicitudComida, 'id'> = { residenciaId: managingResidenciaId, nombre: newHorarioNombre.trim(), dia: newHorarioDia, horaSolicitud: newHorarioHora, isPrimary: newHorarioIsPrimary, isActive: newHorarioIsActive, };
            const horarioRef = await addDoc(collection(db, 'horariosSolicitudComida'), newHorarioData);
            const newHorarioForState: HorarioSolicitudComida = { id: horarioRef.id, ...newHorarioData };
            setModalHorarios(prev => sortHorarios([...prev, newHorarioForState]));
            toast({ title: "Éxito", description: `Horario "${newHorarioNombre}" creado.` });
            setNewHorarioNombre(''); setNewHorarioDia(''); setNewHorarioHora(''); setNewHorarioIsPrimary(false); setNewHorarioIsActive(true);
        } catch (error) {
            const errorMessage = `Error al crear horario. ${error instanceof Error ? error.message : 'Error desconocido'}`;
            console.error("Error creating horario: ", error); toast({ title: "Error", description: errorMessage, variant: "destructive" });
        } finally { setIsProcessingNewHorario(false); }
    };
    const handleUpdateHorario = async (e: React.FormEvent) => {
        e.preventDefault(); if (!editingHorario || !managingResidenciaId) { toast({ title: "Error", description: "Ningún horario seleccionado para editar.", variant: "destructive" }); return; }
        if (!editHorarioNombre.trim() || !editHorarioDia || !editHorarioHora || !/^\d{2}:\d{2}$/.test(editHorarioHora)) { toast({ title: "Error Validación", description: "Completa todos los campos del horario correctamente.", variant: "destructive" }); return; }
        if (editHorarioIsPrimary && modalHorarios.some(h => h.id !== editingHorario.id && h.dia === editHorarioDia && h.isPrimary)) { if (!confirm(`Ya existe otro horario primario para ${DayOfWeekMap[editHorarioDia]}. ¿Seguro que quieres marcar este como primario también?`)) return; }
        setIsProcessingEditHorario(true);
        try {
            const horarioRef = doc(db, 'horariosSolicitudComida', editingHorario.id);
            const updatedData: Partial<HorarioSolicitudComida> = { nombre: editHorarioNombre.trim(), dia: editHorarioDia, horaSolicitud: editHorarioHora, isPrimary: editHorarioIsPrimary, };
            await updateDoc(horarioRef, updatedData);
            const updatedHorarioForState: HorarioSolicitudComida = { ...editingHorario, ...updatedData };
            setModalHorarios(prev => sortHorarios( prev.map(h => h.id === editingHorario.id ? updatedHorarioForState : h) ));
            toast({ title: "Éxito", description: `Horario "${editHorarioNombre}" actualizado.` });
            setIsEditHorarioDialogOpen(false);
        } catch (error) {
            const errorMessage = `Error al actualizar horario. ${error instanceof Error ? error.message : 'Error desconocido'}`;
            console.error("Error updating horario: ", error); toast({ title: "Error", description: errorMessage, variant: "destructive" });
        } finally { setIsProcessingEditHorario(false); }
    };

    // --- Handlers: Comedores Tab ---
    const handleCreateComedor = async (e: React.FormEvent) => {
        e.preventDefault(); 
        if (!managingResidenciaId) return;
        if (!newComedorNombre.trim()) { 
            toast({ title: "Error Validación", description: "El nombre del comedor no puede estar vacío.", variant: "destructive" }); 
            return; 
        }
        if (modalComedores.some(c => c.nombre.toLowerCase() === newComedorNombre.trim().toLowerCase())) { 
            toast({ title: "Error Validación", description: `Ya existe un comedor llamado "${newComedorNombre.trim()}".`, variant: "destructive" }); 
            return; 
        }
        setIsProcessingNewComedor(true);
        try {
            const newComedorData: Omit<Comedor, 'id'> = { residenciaId: managingResidenciaId, nombre: newComedorNombre.trim(), descripcion: newComedorDescripcion.trim() || undefined, };
            const comedorRef = await addDoc(collection(db, 'comedores'), newComedorData);
            const newComedorForState: Comedor = { id: comedorRef.id, ...newComedorData };
            setModalComedores(prev => sortComedores([...prev, newComedorForState]));
            toast({ title: "Éxito", description: `Comedor "${newComedorNombre}" creado.` });
            setNewComedorNombre(''); setNewComedorDescripcion('');
        } catch (error) {
            const errorMessage = `Error al crear comedor. ${error instanceof Error ? error.message : 'Error desconocido'}`;
            console.error("Error creating Comedor: ", error); toast({ title: "Error", description: errorMessage, variant: "destructive" });
        } finally { setIsProcessingNewComedor(false); }
    };

    const handleEditComedor = (comedor: Comedor) => {
        setEditingComedor(comedor); setEditComedorNombre(comedor.nombre); setEditComedorDescripcion(comedor.descripcion || '');
        setIsProcessingEditComedor(false); setIsEditComedorDialogOpen(true);
    };
    const handleDeleteComedor = async (comedorId: string, comedorNombre: string) => {
        if (!managingResidenciaId || !confirm(`¿Seguro que quieres eliminar el comedor "${comedorNombre}"?`)) return;
        try {
            await deleteDoc(doc(db, 'comedores', comedorId));
            toast({ title: "Éxito", description: `Comedor "${comedorNombre}" eliminado.` });
            setModalComedores(prev => prev.filter(c => c.id !== comedorId));
        } catch (error) {
            const errorMessage = `Error al eliminar comedor. ${error instanceof Error ? error.message : 'Error desconocido'}`;
            console.error("Error deleting Comedor: ", error); toast({ title: "Error", description: errorMessage, variant: "destructive" });
        }
    };
    const handleUpdateComedor = async (e: React.FormEvent) => {
        e.preventDefault(); if (!editingComedor || !managingResidenciaId) { 
            toast({ title: "Error", description: "Ningún comedor seleccionado para editar.", variant: "destructive" }); 
            return; 
        }
        if (!editingComedor || !managingResidenciaId) {
            toast({ title: "Error", description: "Ningún comedor seleccionado para editar.", variant: "destructive" });
            return; // Early return is implicitly void
        }
        const trimmedName = editComedorNombre.trim();
        if (!trimmedName) {
             toast({ title: "Error Validación", description: "El nombre del comedor no puede estar vacío.", variant: "destructive" });
             return; // Early return is implicitly void
        }
        if (modalComedores.some(c => c.id !== editingComedor.id && c.nombre.toLowerCase() === trimmedName.toLowerCase())) {
            toast({ title: "Error Validación", description: `Ya existe otro comedor llamado "${trimmedName}".`, variant: "destructive" });
            return;
        }
        setIsProcessingEditComedor(true);
        try {
            const comedorRef = doc(db, 'comedores', editingComedor.id);
            // Use deleteField for optional fields if they are empty after trimming
            const dataForFirestore: { [key: string]: string | FieldValue } = {
                nombre: trimmedName,
                descripcion: editComedorDescripcion.trim() ? editComedorDescripcion.trim() : deleteField(),
            };
            await updateDoc(comedorRef, dataForFirestore);
            const updatedComedorForState: Comedor = {
                ...editingComedor,
                nombre: trimmedName,
                descripcion: editComedorDescripcion.trim() || undefined, // Reflect potential deletion in state
            };
            setModalComedores(prev => sortComedores(
                prev.map(c => c.id === editingComedor.id ? updatedComedorForState : c)
            ));
            toast({ title: "Éxito", description: `Comedor "${trimmedName}" actualizado.` });
            setIsEditComedorDialogOpen(false);
        } catch (error) {
            const errorMessage = `Error al actualizar comedor. ${error instanceof Error ? error.message : 'Error desconocido'}`;
            console.error("Error updating Comedor: ", error); toast({ title: "Error", description: errorMessage, variant: "destructive" });
        } finally { 
            setIsProcessingEditComedor(false); 
        }
    };

    const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setResidenciaFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSwitchChange = (name: keyof Residencia, checked: boolean) => {
        setResidenciaFormData(prev => ({ ...prev, [name]: checked }));
    };

    const handleSelectChange = (name: keyof Residencia, value: string) => {
        setResidenciaFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleNumericInputChange = (name: keyof Residencia, value: string) => {
        setResidenciaFormData(prev => ({
            ...prev,
            [name]: value === '' ? undefined : parseInt(value, 10) || undefined
        }));
    };
    
    // Handler para el formulario de Nuevo Horario
    const handleNewHorarioChange = (field: keyof typeof newHorarioData, value: string | boolean) => {
        setNewHorarioData(prev => ({ ...prev, [field]: value }));
    };

    const handleSaveResidencia = async () => {
        const dataToSave = { ...residenciaFormData };

        // Validación básica (ej. nombre)
        if (!dataToSave.nombre || dataToSave.nombre.trim() === '') {
            toast({ title: "Error Validación", description: "El nombre de la residencia es obligatorio.", variant: "destructive" });
            return;
        }
        dataToSave.nombre = dataToSave.nombre.trim(); // Limpiar nombre

        setIsProcessingSave(true);

        try {
            let savedResidenciaId = selectedResidenciaId; // Usar el ID existente si estamos editando

            if (isEditing && selectedResidenciaId) {
                // --- ACTUALIZAR RESIDENCIA EXISTENTE ---
                console.log("Actualizando residencia:", selectedResidenciaId);
                const docRef = doc(db, "residencias", selectedResidenciaId);

                // Preparar payload para updateDoc (similar a handleSaveGeneralConfig)
                const updatePayload: { [K in keyof Residencia]?: Residencia[K] | FieldValue } = {};

                // Iterar sobre las claves que maneja el formulario (¡Cuidado con 'id'!)
                // --- Inicio: Refactorización con switch ---
                (Object.keys(dataToSave) as Array<keyof Residencia>).forEach(key => {
                    if (key === 'id') return; // No intentar guardar el ID

                    const value = dataToSave[key];

                    switch (key) {
                        // --- Campos Directos Simples ---
                        case 'nombre':
                            // El nombre ya se validó y limpió antes
                            if (typeof value === 'string') {
                                updatePayload.nombre = value;
                            }
                            break;
                        case 'direccion':
                        case 'logoUrl':
                        case 'nombreEtiquetaCentroCosto':
                            updatePayload[key] = (typeof value === 'string' && value.trim()) ? value.trim() : deleteField();
                            break;
                        case 'antelacionActividadesDefault':
                            updatePayload.antelacionActividadesDefault = (typeof value === 'number' && !isNaN(value) && value >= 0) ? value : deleteField();
                            break;

                        // --- Campos Personalizados (Manejo individual) ---
                        case 'campoPersonalizado1_etiqueta':
                        case 'campoPersonalizado2_etiqueta':
                        case 'campoPersonalizado3_etiqueta':
                            const numEti = parseInt(key[18], 10) as 1 | 2 | 3;
                            const etiquetaValue = (typeof value === 'string' && value.trim()) ? value.trim() : undefined;
                            if (etiquetaValue) {
                                updatePayload[key] = etiquetaValue;
                            } else {
                                // Si etiqueta se borra, borrar todos los asociados a ese número
                                updatePayload[key] = deleteField(); // Borra la etiqueta
                                updatePayload[`campoPersonalizado${numEti}_isActive`] = deleteField();
                                updatePayload[`campoPersonalizado${numEti}_necesitaValidacion`] = deleteField();
                                updatePayload[`campoPersonalizado${numEti}_regexValidacion`] = deleteField();
                                updatePayload[`campoPersonalizado${numEti}_tamanoTexto`] = deleteField();
                            }
                            break;

                        case 'campoPersonalizado1_isActive':
                        case 'campoPersonalizado2_isActive':
                        case 'campoPersonalizado3_isActive':
                            const numAct = parseInt(key[18], 10) as 1 | 2 | 3;
                            // Solo procesar si la etiqueta correspondiente existe
                            if (dataToSave[`campoPersonalizado${numAct}_etiqueta`]) {
                                const isActiveValue = typeof value === 'boolean' ? value : false; // Default false
                                updatePayload[key] = isActiveValue;
                                // Si se desactiva, borrar subcampos
                                if (!isActiveValue) {
                                    updatePayload[`campoPersonalizado${numAct}_necesitaValidacion`] = deleteField();
                                    updatePayload[`campoPersonalizado${numAct}_regexValidacion`] = deleteField();
                                    updatePayload[`campoPersonalizado${numAct}_tamanoTexto`] = deleteField();
                                }
                            } else {
                                // Si no hay etiqueta, asegurar que este campo también se borre
                                updatePayload[key] = deleteField();
                            }
                            break;

                        case 'campoPersonalizado1_necesitaValidacion':
                        case 'campoPersonalizado2_necesitaValidacion':
                        case 'campoPersonalizado3_necesitaValidacion':
                            const numVal = parseInt(key[18], 10) as 1 | 2 | 3;
                            // Solo procesar si etiqueta existe y está activo
                            if (dataToSave[`campoPersonalizado${numVal}_etiqueta`] && dataToSave[`campoPersonalizado${numVal}_isActive`]) {
                                const necesitaValidacionValue = typeof value === 'boolean' ? value : false; // Default false
                                updatePayload[key] = necesitaValidacionValue;
                                // Si no necesita validación, borrar regex
                                if (!necesitaValidacionValue) {
                                    updatePayload[`campoPersonalizado${numVal}_regexValidacion`] = deleteField();
                                }
                            } else {
                                // Si no aplica, borrar
                                updatePayload[key] = deleteField();
                            }
                            break;

                        case 'campoPersonalizado1_regexValidacion':
                        case 'campoPersonalizado2_regexValidacion':
                        case 'campoPersonalizado3_regexValidacion':
                            const numRegex = parseInt(key[18], 10) as 1 | 2 | 3;
                            // Solo procesar si etiqueta existe, está activo, necesita validación y es master
                            if (dataToSave[`campoPersonalizado${numRegex}_etiqueta`] &&
                                dataToSave[`campoPersonalizado${numRegex}_isActive`] &&
                                dataToSave[`campoPersonalizado${numRegex}_necesitaValidacion`] &&
                                userProfile?.roles?.includes('master'))
                            {
                                updatePayload[key] = (typeof value === 'string' && value.trim()) ? value.trim() : deleteField();
                            } else if (userProfile?.roles?.includes('master')) {
                                // Si es master pero no se cumplen las otras condiciones, borrar
                                updatePayload[key] = deleteField();
                            }
                            // Si no es master, no se incluye la clave en el payload
                            break;

                        case 'campoPersonalizado1_tamanoTexto':
                        case 'campoPersonalizado2_tamanoTexto':
                        case 'campoPersonalizado3_tamanoTexto':
                            const numSize = parseInt(key[18], 10) as 1 | 2 | 3;
                            // Solo procesar si etiqueta existe y está activo
                            if (dataToSave[`campoPersonalizado${numSize}_etiqueta`] && dataToSave[`campoPersonalizado${numSize}_isActive`]) {
                                updatePayload[key] = (value === 'text' || value === 'textArea') ? value : 'text'; // Default 'text'
                            } else {
                                updatePayload[key] = deleteField();
                            }
                            break;

                        // Puedes añadir 'default:' o manejar otros campos si los hubiera
                        default:
                            // Ignorar otras claves o hacer log si es inesperado
                            // console.log("Clave ignorada en payload:", key);
                            break;
                    }
                });
                // --- Fin: Refactorización con switch ---

                // Limpiar el payload final (eliminar undefined, aunque Firestore los ignora)
                const finalUpdatePayload = Object.entries(updatePayload).reduce((acc, [k, v]) => {
                    if (v !== undefined) { (acc as any)[k] = v; }
                    return acc;
                }, {} as { [K in keyof Residencia]?: Residencia[K] | FieldValue });

                if (Object.keys(finalUpdatePayload).length > 0) {
                    await updateDoc(docRef, finalUpdatePayload);
                    toast({ title: "Éxito", description: `Residencia "${dataToSave.nombre}" actualizada.` });
                     // Actualizar estado local
                     // Actualizar estado local
                     setResidences(prev => {
                         return prev.map(r => {
                             if (r.id === selectedResidenciaId) {
                                 // 1. Empezar con los datos del formulario (lo que ve el usuario)
                                 // Asegurarse de que 'id' esté presente y sea string
                                 const newResidenciaState: Residencia = { ...dataToSave, id: selectedResidenciaId } as Residencia;
 
                                 // 2. Aplicar el resultado de la operación de Firestore
                                 for (const key in finalUpdatePayload) {
                                     if (Object.prototype.hasOwnProperty.call(finalUpdatePayload, key)) {
                                         const firestoreValue = (finalUpdatePayload as any)[key];
 
                                         // Necesitamos una forma fiable de detectar deleteField()
                                         // Comparar con la instancia importada es lo más seguro
                                         const isDeleteOp = firestoreValue === deleteField(); // Compara con la función importada
 
                                         if (isDeleteOp) {
                                             // Si se borró en Firestore, debe ser undefined en el estado
                                             (newResidenciaState as any)[key] = undefined;
                                         } else {
                                             // Si no se borró, usar el valor que se envió a Firestore
                                             // (Podría ser diferente de dataToSave si hubo limpieza/trimming)
                                             (newResidenciaState as any)[key] = firestoreValue;
                                         }
                                     }
                                 }
                                 // Asegurarnos que los tipos finales sean correctos (ej. default para campos opcionales)
                                 // Esto es opcional si confías en los pasos anteriores
                                 newResidenciaState.antelacionActividadesDefault = newResidenciaState.antelacionActividadesDefault ?? undefined; // Asegurar number | undefined
                                 // Podrías añadir más validaciones/defaults aquí si fuera necesario
 
                                 return newResidenciaState; // Devolver el objeto que SÍ es Residencia
                             }
                             return r; // Devolver las otras residencias sin cambios
                         });
                     });
                     // Podríamos recargar los datos por si deleteField afectó algo
                     // loadResidenciaDataForEditing(selectedResidenciaId);
                } else {
                     toast({ title: "Información", description: "No se detectaron cambios para guardar." });
                }

            } else {
                // --- CREAR NUEVA RESIDENCIA ---
                console.log("Creando nueva residencia:", dataToSave.nombre);
                 // Validaciones adicionales para creación (ej. horarios, comedores iniciales si se requieren)
                 // const validTimes = Object.entries(newSubmissionTimes)...
                 // if (newComedores.length === 0)...

                // Quitar campos vacíos opcionales o con valores por defecto antes de crear
                const createPayload: Partial<Residencia> = { nombre: dataToSave.nombre };
                 if (dataToSave.direccion?.trim()) createPayload.direccion = dataToSave.direccion.trim();
                 if (dataToSave.logoUrl?.trim()) createPayload.logoUrl = dataToSave.logoUrl.trim();
                 if (dataToSave.nombreEtiquetaCentroCosto?.trim()) createPayload.nombreEtiquetaCentroCosto = dataToSave.nombreEtiquetaCentroCosto.trim();
                 if (typeof dataToSave.antelacionActividadesDefault === 'number' && dataToSave.antelacionActividadesDefault >= 0) {
                    createPayload.antelacionActividadesDefault = dataToSave.antelacionActividadesDefault;
                 }
                 // Añadir campos personalizados solo si tienen etiqueta
                 for (let i = 1; i <= 3; i++) {
                     const n = i as 1 | 2 | 3;
                     const etiqueta = dataToSave[`campoPersonalizado${n}_etiqueta`]?.trim();
                     if(etiqueta) {
                         createPayload[`campoPersonalizado${n}_etiqueta`] = etiqueta;
                         createPayload[`campoPersonalizado${n}_isActive`] = !!dataToSave[`campoPersonalizado${n}_isActive`];
                         if(createPayload[`campoPersonalizado${n}_isActive`]) {
                            createPayload[`campoPersonalizado${n}_necesitaValidacion`] = !!dataToSave[`campoPersonalizado${n}_necesitaValidacion`];
                            if(createPayload[`campoPersonalizado${n}_necesitaValidacion`] && userProfile?.roles?.includes('master')) {
                                const regex = dataToSave[`campoPersonalizado${n}_regexValidacion`]?.trim();
                                if (regex) createPayload[`campoPersonalizado${n}_regexValidacion`] = regex;
                            }
                            createPayload[`campoPersonalizado${n}_tamanoTexto`] = dataToSave[`campoPersonalizado${n}_tamanoTexto`] === 'textArea' ? 'textArea' : 'text';
                         }
                     }
                 }

                const docRef = await addDoc(collection(db, "residencias"), createPayload);
                savedResidenciaId = docRef.id;
                toast({ title: "Éxito", description: `Residencia "${dataToSave.nombre}" creada.` });

                // Crear elementos asociados (Dieta, Horarios/Comedores por defecto si aplica)
                // Adaptar la lógica que tenías en handleCreateResidence original
                const batch = writeBatch(db);
                 // Default Dieta
                 const defaultDietaRef = doc(db, 'dietas', `N_${savedResidenciaId}`);
                 const defaultDietaData: Omit<Dieta, 'id'> = { residenciaId: savedResidenciaId, nombre: "Dieta Normal", descripcion: "Dieta normal (por defecto).", isDefault: true, isActive: true };
                 batch.set(defaultDietaRef, defaultDietaData);
                 // TODO: Crear horarios y comedores iniciales si se definen en el formulario simplificado (actualmente no están)
                 await batch.commit();


                 // Actualizar estado local
                 const newResidenciaInState: Residencia = { ...createPayload, id: savedResidenciaId } as Residencia; // Castear porque createPayload es Partial
                 setResidences(prev => [...prev, newResidenciaInState].sort((a,b)=> a.nombre.localeCompare(b.nombre)));
                 // Seleccionar la nueva residencia creada
                 loadResidenciaDataForEditing(savedResidenciaId);
            }

        } catch (err) {
            console.error("Error guardando residencia:", err);
            const message = err instanceof Error ? err.message : "Error desconocido";
            toast({ title: "Error al Guardar", description: message, variant: "destructive" });
        } finally {
            setIsProcessingSave(false);
        }
    };

    const handleAddHorario = async () => {
        // Validar datos del formulario de nuevo horario
        if (!selectedResidenciaId) {
             toast({ title: "Error", description: "Selecciona una residencia primero.", variant: "destructive" });
             return;
        }
        if (!newHorarioData.nombre?.trim() || !newHorarioData.dia || !newHorarioData.horaSolicitud || !/^\d{2}:\d{2}$/.test(newHorarioData.horaSolicitud)) {
            toast({ title: "Error Validación", description: "Completa Nombre, Día y Hora (HH:MM) para el nuevo horario.", variant: "destructive" });
            return;
        }

        // Opcional: Advertir si se añade un segundo horario primario para el mismo día
        if (newHorarioData.isPrimary && currentHorarios.some(h => h.dia === newHorarioData.dia && h.isPrimary)) {
             if (!confirm(`Ya existe un horario primario para ${DayOfWeekMap[newHorarioData.dia as DayOfWeekKey]}. ¿Añadir este como otro primario?`)) {
                 return;
             }
        }

        setIsProcessingHorario(true);

        try {
            const horarioPayload: Omit<HorarioSolicitudComida, 'id'> = {
                residenciaId: selectedResidenciaId, // ID de la residencia seleccionada
                nombre: newHorarioData.nombre.trim(),
                dia: newHorarioData.dia as DayOfWeekKey, // Asegurar el tipo
                horaSolicitud: newHorarioData.horaSolicitud,
                isPrimary: !!newHorarioData.isPrimary,
                isActive: newHorarioData.isActive === undefined ? true : !!newHorarioData.isActive, // Default a true
            };

            const docRef = await addDoc(collection(db, 'horariosSolicitudComida'), horarioPayload);

            // Actualizar estado local inmediatamente
            const newHorarioInState: HorarioSolicitudComida = { ...horarioPayload, id: docRef.id };
            setCurrentHorarios(prev => sortHorarios([...prev, newHorarioInState])); // Añadir y reordenar

            toast({ title: "Éxito", description: `Horario "${horarioPayload.nombre}" añadido.` });

            // Resetear formulario de nuevo horario
            setNewHorarioData({ nombre: '', dia: undefined, horaSolicitud: '', isPrimary: false, isActive: true }); // Resetear también form de horario

        } catch (err) {
            console.error("Error añadiendo horario:", err);
            const message = err instanceof Error ? err.message : "Error desconocido";
            toast({ title: "Error al Añadir Horario", description: message, variant: "destructive" });
        } finally {
            setIsProcessingHorario(false);
        }
    };

    const handleDeleteHorario = async (horarioId: string, horarioNombre: string) => {
        if (!horarioId) return;

        // Confirmación
        if (!confirm(`¿Seguro que quieres eliminar el horario "${horarioNombre}"?`)) {
            return;
        }

        // Podríamos poner un estado de carga específico para esta fila, pero por ahora usamos el general
        setIsProcessingHorario(true); 

        try {
            const docRef = doc(db, 'horariosSolicitudComida', horarioId);
            await deleteDoc(docRef);

            // Actualizar estado local
            setCurrentHorarios(prev => prev.filter(h => h.id !== horarioId));

            toast({ title: "Éxito", description: `Horario "${horarioNombre}" eliminado.` });

        } catch (err) {
             console.error("Error eliminando horario:", err);
             const message = err instanceof Error ? err.message : "Error desconocido";
             toast({ title: "Error al Eliminar Horario", description: message, variant: "destructive" });
        } finally {
            // Resetear el estado de carga general si se usó
            setIsProcessingHorario(false); 
        }
    };

    const handleCancelEdit = () => {
        console.log("Cancelando edición...");
        if (isEditing && selectedResidenciaId) {
            // Si estábamos editando, recargar los datos originales de esa residencia
            console.log(`Recargando datos para ${selectedResidenciaId}`);
            toast({ title: "Cancelado", description: "Cambios descartados. Recargando datos originales." });
            loadResidenciaDataForEditing(selectedResidenciaId); // Llama a la función que ya carga todo
        } else {
            // Si estábamos creando una nueva (formulario limpio), simplemente limpiar de nuevo
            console.log("Limpiando formulario de nueva residencia.");
             toast({ title: "Cancelado", description: "Formulario limpiado." });
            setSelectedResidenciaId(null);
            setResidenciaFormData({});
            setCurrentHorarios([]);
            setIsEditing(false);
            setNewHorarioData({ nombre: '', dia: undefined, horaSolicitud: '', isPrimary: false, isActive: true }); // Resetear también form de horario
        }
        // Resetear estados de procesamiento por si acaso
        setIsProcessingSave(false);
        setIsProcessingHorario(false);
    };

    // =========================================================================
    // Render Logic
    // =========================================================================

    // 1. Combined Loading State (Auth check or Profile fetch)
    if (authFirebaseLoading || (authUser && profileLoading)) {
    return (
        <div className="flex items-center justify-center min-h-screen">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2">{authFirebaseLoading ? 'Verificando sesión...' : 'Cargando perfil...'}</span>
        </div>
    );
    }

    // 2. Handle Auth or Profile Errors (after loading is complete)
    if (authFirebaseError || profileError) {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen text-center p-4">
            <AlertCircle className="h-12 w-12 text-destructive mb-4" />
            <h1 className="text-2xl font-bold text-destructive mb-2">Error</h1>
            <p className="mb-4 text-destructive max-w-md">{authFirebaseError?.message || profileError || 'Ocurrió un error al cargar la información necesaria.'}</p>
            <Button onClick={() => router.push('/')}>Volver al Inicio</Button>
        </div>
    );
    }

    // 3. Handle Unauthorized Access (after loading and error checks)
    // NOTE: useEffect also redirects, this is a fallback UI just in case.
    if (!isAuthorized) {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen text-center p-4">
            <AlertCircle className="h-12 w-12 text-destructive mb-4" />
            <h1 className="text-2xl font-bold text-destructive mb-2">Acceso Denegado</h1>
            <p className="mb-4 max-w-md">No tienes los permisos necesarios (administrador o master) para ver esta página.</p>
            <Button onClick={() => router.push('/')}>Volver al Inicio</Button>
        </div>
    );
    }

    // 4. Render Page Content (If execution reaches here, user IS authorized)
    // Línea ~940: Inicio del return principal
    return (
        <> {/* Mantén el fragmento si estaba */}
            <div className="container mx-auto p-4 space-y-6">
                <h1 className="text-3xl font-bold">CRUD de Residencia y Horarios</h1>

                {/* --- Selector de Residencia --- */}
                <Card>
                    <CardHeader>
                        <CardTitle>Seleccionar Residencia</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col sm:flex-row gap-4 items-center">
                        <div className="flex-grow w-full sm:w-auto">
                            <Label htmlFor="residencia-select">Editar Residencia Existente:</Label>
                            <Select
                                value={selectedResidenciaId ?? ''}
                                onValueChange={loadResidenciaDataForEditing}
                                disabled={isLoadingResidences}
                            >
                                <SelectTrigger id="residencia-select">
                                    <SelectValue placeholder={isLoadingResidences ? "Cargando..." : "Selecciona una residencia..."} />
                                </SelectTrigger>
                                <SelectContent>
                                    {residences.map((res) => (
                                        <SelectItem key={res.id} value={res.id}>
                                            {res.nombre} ({res.id})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <Button
                            variant="outline"
                            onClick={() => {
                                // --- Lógica para limpiar formulario (se implementará) ---
                                console.log("Limpiando formulario para nueva residencia");
                                setSelectedResidenciaId(null);
                                setResidenciaFormData({});
                                setCurrentHorarios([]);
                                setIsEditing(false);
                            }}
                        >
                           <PlusCircle className="mr-2 h-4 w-4" /> Nueva Residencia / Limpiar
                        </Button>
                    </CardContent>
                </Card>

                {/* --- Formulario de Datos de la Residencia --- */}
                <Card>
                    <CardHeader>
                        <CardTitle>{isEditing ? `Editando: ${residenciaFormData.nombre || '...'}` : 'Creando Nueva Residencia'}</CardTitle>
                        <CardDescription>
                           {isEditing ? `ID: ${selectedResidenciaId}` : 'Completa los datos para la nueva residencia.'}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {/* --- Campos Básicos --- */}
                        <div className="space-y-1">
                            <Label htmlFor="nombre">Nombre Residencia</Label>
                            <Input id="nombre" name="nombre" value={residenciaFormData.nombre || ''} onChange={handleFormChange} disabled={isProcessingSave} />
                        </div>
                         {/* Puedes añadir 'direccion' y 'logoUrl' si los necesitas aquí */}
                         {/* <div className="space-y-1"> <Label htmlFor="direccion">Dirección</Label> <Input id="direccion" name="direccion" ... /> </div> */}
                         {/* <div className="space-y-1"> <Label htmlFor="logoUrl">URL del Logo</Label> <Input id="logoUrl" name="logoUrl" ... /> </div> */}

                        {/* --- Configuración General --- */}
                         <h3 className="text-lg font-medium pt-4 border-t mt-4">Configuración General</h3>
                        <div className="space-y-1">
                             <Label htmlFor="nombreEtiquetaCentroCosto">Etiqueta Centro de Costo</Label>
                            <Input id="nombreEtiquetaCentroCosto" name="nombreEtiquetaCentroCosto" value={residenciaFormData.nombreEtiquetaCentroCosto || ''} onChange={handleFormChange} disabled={isProcessingSave} placeholder="Ej: Departamento"/>
                        </div>
                        <div className="space-y-1">
                             <Label htmlFor="antelacionActividadesDefault">Antelación Actividades (días)</Label>
                             <Input id="antelacionActividadesDefault" name="antelacionActividadesDefault" type="number" value={residenciaFormData.antelacionActividadesDefault ?? ''} onChange={(e) => handleNumericInputChange('antelacionActividadesDefault', e.target.value)} disabled={isProcessingSave} placeholder="Ej: 2" min="0"/>
                        </div>

                        {/* --- Campos Personalizados (Simplificado) --- */}
                         <h3 className="text-lg font-medium pt-4 border-t mt-4">Campos Personalizados (Configuración)</h3>
                        {[1, 2, 3].map(num => {
                            const n = num as 1 | 2 | 3;
                            const isMaster = userProfile?.roles?.includes('master');
                            return (
                                <Card key={n} className="p-4 bg-muted/30">
                                    <h4 className="font-semibold mb-2">Campo Personalizado {n}</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-1">
                                            <Label htmlFor={`cp${n}_etiqueta`}>Etiqueta Campo {n}</Label>
                                            <Input id={`cp${n}_etiqueta`} name={`campoPersonalizado${n}_etiqueta`} value={residenciaFormData[`campoPersonalizado${n}_etiqueta`] || ''} onChange={handleFormChange} placeholder="Ej: Talla Camiseta" disabled={isProcessingSave}/>
                                        </div>
                                        <div className="space-y-1">
                                            <Label htmlFor={`cp${n}_tamanoTexto`}>Tipo Campo {n}</Label>
                                            <Select value={residenciaFormData[`campoPersonalizado${n}_tamanoTexto`] || 'text'} onValueChange={(value) => handleSelectChange(`campoPersonalizado${n}_tamanoTexto`, value as 'text' | 'textArea')} disabled={isProcessingSave}>
                                                <SelectTrigger id={`cp${n}_tamanoTexto`}><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="text">Texto Corto (Input)</SelectItem>
                                                    <SelectItem value="textArea">Texto Largo (Textarea)</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="flex items-center space-x-2 pt-2">
                                            <Switch id={`cp${n}_isActive`} checked={!!residenciaFormData[`campoPersonalizado${n}_isActive`]} onCheckedChange={(checked) => handleSwitchChange(`campoPersonalizado${n}_isActive`, checked)} disabled={isProcessingSave}/>
                                            <Label htmlFor={`cp${n}_isActive`}>Activo?</Label>
                                        </div>
                                        <div className="flex items-center space-x-2 pt-2">
                                            <Switch id={`cp${n}_necesitaValidacion`} checked={!!residenciaFormData[`campoPersonalizado${n}_necesitaValidacion`]} onCheckedChange={(checked) => handleSwitchChange(`campoPersonalizado${n}_necesitaValidacion`, checked)} disabled={isProcessingSave}/>
                                            <Label htmlFor={`cp${n}_necesitaValidacion`}>Validación Regex?</Label>
                                        </div>
                                        <div className="space-y-1 col-span-1 md:col-span-2">
                                            <Label htmlFor={`cp${n}_regexValidacion`}>Expresión Regular (Regex) Campo {n}</Label>
                                            <Textarea id={`cp${n}_regexValidacion`} name={`campoPersonalizado${n}_regexValidacion`} value={residenciaFormData[`campoPersonalizado${n}_regexValidacion`] || ''} onChange={handleFormChange} disabled={isProcessingSave || !isMaster} rows={2} placeholder={isMaster ? "Solo editable por rol Master" : "No editable"} className={!isMaster ? "bg-gray-100" : ""}/>
                                             {!isMaster && <p className="text-xs text-destructive">Solo rol 'master' puede editar.</p>}
                                        </div>
                                    </div>
                                </Card>
                            )
                        })}
                    </CardContent>
                </Card>

                {/* --- Sección de Horarios de Solicitud (Solo si se está editando) --- */}
                {isEditing && selectedResidenciaId && (
                    <Card>
                        <CardHeader>
                            <CardTitle>Horarios de Solicitud para {residenciaFormData.nombre || 'esta residencia'}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {/* Tabla de Horarios Existentes */}
                            <h4 className="font-medium">Horarios Actuales</h4>
                            {isLoadingHorarios ? <p>Cargando horarios...</p> : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b">
                                                <th className="text-left p-2">Nombre</th>
                                                <th className="text-left p-2">Día</th>
                                                <th className="text-left p-2">Hora</th>
                                                <th className="text-center p-2">Primario?</th>
                                                <th className="text-center p-2">Activo?</th>
                                                <th className="text-right p-2">Acciones</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {currentHorarios.length === 0 ? (
                                                <tr><td colSpan={6} className="text-center p-4 text-muted-foreground">No hay horarios definidos.</td></tr>
                                            ) : (
                                                currentHorarios.map(h => (
                                                    <tr key={h.id} className="border-b">
                                                        <td className="p-2">{h.nombre}</td>
                                                        <td className="p-2">{DayOfWeekMap[h.dia]}</td>
                                                        <td className="p-2">{h.horaSolicitud}</td>
                                                        <td className="text-center p-2">{h.isPrimary ? 'Sí' : 'No'}</td>
                                                        <td className="text-center p-2">{h.isActive ? 'Sí' : 'No'}</td>
                                                        <td className="text-right p-2">
                                                            <Button variant="destructive" size="sm" onClick={() => handleDeleteHorario(h.id, h.nombre)} disabled={isProcessingHorario}>
                                                                <Trash2 className="h-4 w-4"/>
                                                            </Button>
                                                            {/* Podríamos añadir Edit aquí si fuera necesario */}
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* Formulario para Añadir Nuevo Horario */}
                            <div className="pt-6 border-t">
                                <h4 className="font-medium mb-2">Añadir Nuevo Horario</h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
                                    <div className="space-y-1">
                                        <Label htmlFor="new_h_nombre">Nombre</Label>
                                        <Input id="new_h_nombre" value={newHorarioData.nombre || ''} onChange={(e) => handleNewHorarioChange('nombre', e.target.value)} disabled={isProcessingHorario} />
                                    </div>
                                    <div className="space-y-1">
                                        <Label htmlFor="new_h_dia">Día</Label>
                                         <Select value={newHorarioData.dia || ''} onValueChange={(value) => handleNewHorarioChange('dia', value as DayOfWeekKey)} disabled={isProcessingHorario}>
                                             <SelectTrigger id="new_h_dia"><SelectValue placeholder="Selecciona..." /></SelectTrigger>
                                             <SelectContent>{daysOfWeek.map(day => (<SelectItem key={day.value} value={day.value}>{day.label} ({DayOfWeekMap[day.value]})</SelectItem>))}</SelectContent>
                                         </Select>
                                    </div>
                                    <div className="space-y-1">
                                        <Label htmlFor="new_h_hora">Hora Límite</Label>
                                        <Input id="new_h_hora" type="time" value={newHorarioData.horaSolicitud || ''} onChange={(e) => handleNewHorarioChange('horaSolicitud', e.target.value)} disabled={isProcessingHorario} step="900"/>
                                    </div>
                                    <div className="flex items-center space-x-2 pt-2">
                                        <Switch id="new_h_primary" checked={!!newHorarioData.isPrimary} onCheckedChange={(checked) => handleNewHorarioChange('isPrimary', checked)} disabled={isProcessingHorario}/>
                                        <Label htmlFor="new_h_primary">¿Primario?</Label>
                                    </div>
                                     <div className="flex items-center space-x-2 pt-2">
                                         <Switch id="new_h_active" checked={!!newHorarioData.isActive} onCheckedChange={(checked) => handleNewHorarioChange('isActive', checked)} disabled={isProcessingHorario}/>
                                         <Label htmlFor="new_h_active">¿Activo?</Label>
                                     </div>
                                    <div>
                                        <Button onClick={handleAddHorario} disabled={isProcessingHorario || !newHorarioData.nombre || !newHorarioData.dia || !newHorarioData.horaSolicitud}>
                                            <PlusCircle className="mr-2 h-4 w-4"/> Añadir Horario
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* --- Botones de Acción Principales --- */}
                <div className="flex justify-end gap-4 pt-6 border-t">
                    <Button variant="outline" onClick={handleCancelEdit}>
                        Cancelar
                    </Button>
                     {isEditing && selectedResidenciaId && (
                        <Button variant="destructive" onClick={() => {/* TODO: handleDeleteResidencia(selectedResidenciaId) */ console.log("TODO: Delete Residencia", selectedResidenciaId)}}>
                            Eliminar Residencia
                        </Button>
                     )}
                    <Button onClick={handleSaveResidencia} disabled={isProcessingSave || !residenciaFormData.nombre}>
                         {isProcessingSave ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                         {isEditing ? 'Guardar Cambios Residencia' : 'Crear Nueva Residencia'}
                    </Button>
                </div>

            </div> {/* Fin del container */}

             {/* Toast para notificaciones (Asegúrate que Toaster está en tu layout principal) */}

        </> // Fin del fragmento
    );
    // Fin del return principal

};

const EditComedorDialog: React.FC<EditComedorDialogProps> = ({
isOpen, onOpenChange, comedor, nombre, setNombre, descripcion, setDescripcion, isProcessing, onSubmit
}) => {
    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Editar Comedor: {comedor?.nombre}</DialogTitle>
                    <DialogDescription>Modifica los detalles de este comedor.</DialogDescription>
                </DialogHeader>
                {comedor ? (
                    <form onSubmit={onSubmit} className="space-y-4 py-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="edit-comedor-nombre">Nombre del Comedor</Label>
                            <Input id="edit-comedor-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} disabled={isProcessing}/>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="edit-comedor-descripcion">Descripción (Opcional)</Label>
                            <Textarea id="edit-comedor-descripcion" placeholder="Ingresa detalles relevantes..." value={descripcion} onChange={(e) => setDescripcion(e.target.value)} disabled={isProcessing} rows={3} />
                        </div>
                        <DialogFooter>
                            <DialogClose asChild><Button type="button" variant="outline" disabled={isProcessing}>Cancelar</Button></DialogClose>
                            <Button type="submit" disabled={isProcessing}>{isProcessing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Guardando...</> : 'Guardar Cambios'}</Button>
                        </DialogFooter>
                    </form>
                ) : ( <p>Cargando datos del comedor...</p> )}
            </DialogContent>
        </Dialog>
    );
};
