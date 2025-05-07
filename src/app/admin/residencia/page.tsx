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

    // --- State: Existing Residences List ---
    const [residences, setResidences] = useState<Residencia[]>([]);
    const [isLoadingResidences, setIsLoadingResidences] = useState(true);
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


    // --- useEffect: Handle Auth State & Fetch Profile ---
    useEffect(() => {
        if (authFirebaseLoading) {
            setProfileLoading(true);
            setIsAuthorized(false);
            return;
        }
        if (authFirebaseError) {
            console.error("Firebase Auth Error:", authFirebaseError);
            toast({ title: "Error de Autenticación", description: authFirebaseError.message, variant: "destructive" });
            setProfileLoading(false); setIsAuthorized(false); setUserProfile(null); setProfileError(authFirebaseError.message);
            router.replace('/');
            return;
        }
        if (!authUser) {
            console.log("User not logged in. Redirecting...");
            setProfileLoading(false); setIsAuthorized(false); setUserProfile(null); setProfileError(null);
            router.replace('/');
            return;
        }

        // User logged in, fetch profile
        console.log("Auth state confirmed (User:", authUser.uid,"), fetching profile...");
        setProfileLoading(true); setProfileError(null);
        const userDocRef = doc(db, "users", authUser.uid);
        getDoc(userDocRef)
            .then((docSnap) => {
                if (docSnap.exists()) {
                    setUserProfile(docSnap.data() as UserProfile);
                    console.log("Profile fetched:", docSnap.data());
                } else {
                    console.error("Profile not found for UID:", authUser.uid);
                    setUserProfile(null); setProfileError("User profile document not found in Firestore.");
                    toast({ title: "Error de Perfil", description: "No se encontró tu perfil de usuario.", variant: "destructive" });
                }
            })
            .catch((error) => {
                console.error("Error fetching profile:", error);
                setUserProfile(null); setProfileError(`Failed to fetch profile: ${error.message}`);
                toast({ title: "Error al Cargar Perfil", description: `No se pudo cargar tu perfil: ${error.message}`, variant: "destructive" });
            })
            .finally(() => {
                setProfileLoading(false);
                console.log("Profile fetch attempt finished.");
            });
    }, [authUser, authFirebaseLoading, authFirebaseError, router, toast]);


    // --- useEffect: Handle Authorization & Fetch Page Data ---
    useEffect(() => {
        // Wait until profile loading is complete and auth check is done (authUser exists or is null)
        if (profileLoading || authFirebaseLoading) {
            setIsAuthorized(false);
            return;
        }
        // If there was an error fetching profile, user can't be authorized
        if (profileError || !userProfile) {
            console.log("Authorization check failed: Profile error or profile missing.");
            setIsAuthorized(false);
            // Redirect if needed, handled by render logic based on profileError
            return;
        }

        // Check roles
        const roles = userProfile.roles || [];
        const userIsAuthorized = roles.includes('admin') || roles.includes('master');

        if (userIsAuthorized) {
            // Inside the if (userIsAuthorized) block:
            console.log("Authorization check passed. User has required roles.");
            setIsAuthorized(true);

            // Fetch residences if authorized, not yet attempted, and not currently loading
if (!hasAttemptedFetchResidences) {
                console.log("User authorized, initiating fetchResidences...");
                fetchResidences();
            } else if (isLoadingResidences) {
                console.log("User authorized, but residences are currently loading.");
            } else if (hasAttemptedFetchResidences && residences.length === 0) {
                console.log("User authorized, fetch previously attempted, no residences found.");
            } else if (hasAttemptedFetchResidences && residences.length > 0) {
                console.log("User authorized, residences already fetched.");
            }
        } else {
            console.warn("Authorization check failed: User lacks admin/master role.");
            setIsAuthorized(false);
            toast({ title: "Acceso Denegado", description: "No tienes permiso para ver esta página.", variant: "destructive" });
            router.replace('/'); // Redirect if not authorized
        }
    }, [
        userProfile,
        profileLoading,
        profileError,
        authFirebaseLoading,
        router,
        toast,
        fetchResidences,
        // residences.length, // <<< REMOVE THIS
        isLoadingResidences,   // <<< ENSURE THIS IS PRESENT
        hasAttemptedFetchResidences, // <<< ADD THIS
        isAuthorized           // <<< ENSURE THIS IS PRESENT
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

    const handleManageSettings = (residencia: Residencia) => {
        setManagingResidenciaId(residencia.id); setManagingResidenciaNombre(residencia.nombre);
        fetchModalData(residencia.id);
        setIsModalOpen(true);
    };
    const handleModalOpenChange = (open: boolean) => {
        setIsModalOpen(open);
        if (!open) { // Reset state on modal close
            setManagingResidenciaId(null); setManagingResidenciaNombre(''); setIsLoadingModalData(false); setErrorModalData(null);
            setModalHorarios([]); setModalComedores([]);
            setNewHorarioNombre(''); setNewHorarioDia(''); setNewHorarioHora(''); setNewHorarioIsPrimary(false); setNewHorarioIsActive(true); setIsProcessingNewHorario(false);
            setNewComedorNombre(''); setNewComedorDescripcion(''); setIsProcessingNewComedor(false);
            setEditingHorario(null); setIsEditHorarioDialogOpen(false); setIsProcessingEditHorario(false);
            setEditingComedor(null); setIsEditComedorDialogOpen(false); setIsProcessingEditComedor(false);
        }
    };

    // --- Handlers: Horarios Tab ---
    const handleEditHorario = (horario: HorarioSolicitudComida) => {
        setEditingHorario(horario); setEditHorarioNombre(horario.nombre); setEditHorarioDia(horario.dia); setEditHorarioHora(horario.horaSolicitud); setEditHorarioIsPrimary(horario.isPrimary);
        setIsProcessingEditHorario(false); setIsEditHorarioDialogOpen(true);
    };
    const handleDeleteHorario = async (horarioId: string, horarioNombre: string) => {
        if (!managingResidenciaId || !confirm(`¿Seguro que quieres eliminar el horario "${horarioNombre}"?`)) return;
        try {
            await deleteDoc(doc(db, 'horariosSolicitudComida', horarioId));
            toast({ title: "Éxito", description: `Horario "${horarioNombre}" eliminado.` });
            setModalHorarios(prev => prev.filter(h => h.id !== horarioId));
        } catch (error) {
            const errorMessage = `Error al eliminar horario. ${error instanceof Error ? error.message : 'Error desconocido'}`;
            console.error("Error deleting horario: ", error); toast({ title: "Error", description: errorMessage, variant: "destructive" });
        }
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
        e.preventDefault(); if (!managingResidenciaId) return;
        if (!newComedorNombre.trim()) { toast({ title: "Error Validación", description: "El nombre del comedor no puede estar vacío.", variant: "destructive" }); return; }
        if (modalComedores.some(c => c.nombre.toLowerCase() === newComedorNombre.trim().toLowerCase())) { toast({ title: "Error Validación", description: `Ya existe un comedor llamado "${newComedorNombre.trim()}".`, variant: "destructive" }); return; }
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
        e.preventDefault(); if (!editingComedor || !managingResidenciaId) { toast({ title: "Error", description: "Ningún comedor seleccionado para editar.", variant: "destructive" }); return; }
        if (!editingComedor || !managingResidenciaId) {
            toast({ title: "Error", description: "Ningún comedor seleccionado para editar.", variant: "destructive" });
            return; // Early return is implicitly void
        }
        const trimmedName = editComedorNombre.trim();
        if (!trimmedName) {
             toast({ title: "Error Validación", description: "El nombre del comedor no puede estar vacío.", variant: "destructive" });
             return; // Early return is implicitly void
        }
        if (!trimmedName) { toast({ title: "Error Validación", description: "El nombre del comedor no puede estar vacío.", variant: "destructive" });
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
        } finally { setIsProcessingEditComedor(false); }
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
        // authUser and userProfile are guaranteed non-null if isAuthorized is true.
        return (
        <Dialog open={isModalOpen} onOpenChange={handleModalOpenChange}>
            <div className="container mx-auto p-4 space-y-6">
                <h1 className="text-2xl font-bold">Administrar Residencias</h1>

                {/* --- Main Tabs: Create / List --- */}
                <Tabs defaultValue="list" className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="create">Crear Nueva Residencia</TabsTrigger>
                        <TabsTrigger value="list">Residencias Existentes</TabsTrigger>
                    </TabsList>

                    {/* --- Create Tab --- */}
                    <TabsContent value="create">
                        <Card>
                            <CardHeader>
                                <CardTitle>Crear Nueva Residencia</CardTitle>
                                <CardDescription>Ingresa los detalles básicos y configuración inicial.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="space-y-2">
                                    <Label htmlFor="residence-name">Nombre de la Residencia</Label>
                                    <Input id="residence-name" placeholder="Ej: Residencia Central" value={newResidenceName} onChange={(e) => setNewResidenceName(e.target.value)} disabled={isProcessingCreate} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Horarios de Solicitud de Comida Principal</Label>
                                    <CardDescription>Define la hora límite (HH:MM) para las solicitudes principales de cada día.</CardDescription>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
                                        {daysOfWeek.map(day => (
                                            <div key={day.value} className="grid gap-2">
                                                <Label htmlFor={`time-${day.value}`}>{day.label} ({DayOfWeekMap[day.value]})</Label>
                                                <Input id={`time-${day.value}`} type="time" value={newSubmissionTimes[day.value] || ''} onChange={(e) => handleTimeChange(day.value, e.target.value)} disabled={isProcessingCreate} step="900" />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    <Label>Comedores Iniciales</Label>
                                    <CardDescription>Añade los nombres de los comedores disponibles.</CardDescription>
                                    <div className="flex items-center space-x-2">
                                        <div className="grid flex-1 gap-2">
                                            <Label htmlFor="new-comedor-name" className="sr-only">Nombre Nuevo Comedor</Label>
                                            <Input id="new-comedor-name" placeholder="Ej: Comedor Principal" value={currentComedorName} onChange={(e) => setCurrentComedorName(e.target.value)} disabled={isProcessingCreate} />
                                        </div>
                                        <Button type="button" size="sm" onClick={handleAddComedor} disabled={isProcessingCreate || !currentComedorName.trim()}>
                                            <PlusCircle className="mr-2 h-4 w-4" /> Añadir Comedor
                                        </Button>
                                    </div>
                                    {newComedores.length > 0 && (
                                        <div className="space-y-2 pt-2">
                                            <Label className="text-xs font-medium text-muted-foreground">Comedores Añadidos:</Label>
                                            <ul className="space-y-1">
                                                {newComedores.map((name) => (
                                                    <li key={name} className="flex items-center justify-between p-1.5 border rounded-md bg-secondary/30 text-sm">
                                                        <span>{name}</span>
                                                        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => handleRemoveComedor(name)} disabled={isProcessingCreate} aria-label={`Eliminar ${name}`}>
                                                            <X className="h-3 w-3" />
                                                        </Button>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                                <div className="pt-4">
                                    <Button onClick={handleCreateResidence} disabled={isProcessingCreate}>
                                        {isProcessingCreate ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creando...</> : 'Crear Residencia'}
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* --- List Tab --- */}
                    <TabsContent value="list">
                        <Card>
                            <CardHeader>
                                <CardTitle>Residencias Existentes</CardTitle>
                                <CardDescription>Ver residencias existentes y administrar su configuración.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                {isLoadingResidences ? (
                                    <div className="space-y-2"> <Skeleton className="h-16 w-full" /> <Skeleton className="h-16 w-full" /> </div>
                                ) : errorResidences ? (
                                    <p className="text-destructive">{errorResidences}</p>
                                ) : !residences || residences.length === 0 ? (
                                    <p>No se encontraron residencias. Crea una usando la pestaña 'Crear Nueva Residencia'.</p>
                                ) : (
                                    <ul className="space-y-3">
                                        {residences.map((res) => (
                                            <li key={res.id} className="border p-4 rounded-md shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                                                <div className='flex-grow'>
                                                    <p className="font-semibold text-lg">{res.nombre}</p>
                                                    <p className="text-sm text-muted-foreground">ID: {res.id}</p>
                                                </div>
                                                <DialogTrigger asChild>
                                                    <Button variant="secondary" size="sm" onClick={() => handleManageSettings(res)}>
                                                        Administrar Configuración
                                                    </Button>
                                                </DialogTrigger>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>

            </div> {/* End Container Div */}

            {/* ========================= MODAL CONTENT ========================= */}
            <DialogContent className="sm:max-w-[600px] md:max-w-[800px] lg:max-w-[900px] max-h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Configuración de: {managingResidenciaNombre || '...'}</DialogTitle>
                    <DialogDescription>Configura horarios de solicitud y comedores para esta residencia.</DialogDescription>
                </DialogHeader>

                {/* Modal Tabs Container */}
                <div className="py-4 flex-grow overflow-y-auto">
                    <Tabs defaultValue="horarios" className="w-full">
                        <TabsList className="mb-4 grid w-full grid-cols-2">
                            <TabsTrigger value="horarios">Horarios de Solicitud</TabsTrigger>
                            <TabsTrigger value="comedores">Comedores</TabsTrigger>
                        </TabsList>

                        {/* --- Horarios Tab Content --- */}
                        <TabsContent value="horarios">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Horarios de Solicitud de Comidas</CardTitle>
                                    <CardDescription>Define cuándo los usuarios pueden enviar o cambiar sus solicitudes.</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    {/* Accordion for Creating New Schedule */}
                                    <Accordion type="single" collapsible className="w-full">
                                        <AccordionItem value="new-horario">
                                            <AccordionTrigger className="text-sm font-medium hover:underline [&[data-state=open]>svg]:rotate-180">
                                                <PlusCircle className="mr-2 h-4 w-4 inline" /> Añadir Nuevo Horario
                                            </AccordionTrigger>
                                            <AccordionContent>
                                                <form onSubmit={handleCreateHorario} className="border p-4 rounded-md mt-2 space-y-4 bg-muted/30">
                                                    <h3 className="font-medium">Detalles del Nuevo Horario</h3>
                                                    <div className="space-y-1.5">
                                                        <Label htmlFor="new-horario-nombre">Nombre del Horario</Label>
                                                        <Input id="new-horario-nombre" placeholder="Ej: Cambio Almuerzo, Solicitud Finde" value={newHorarioNombre} onChange={(e) => setNewHorarioNombre(e.target.value)} disabled={isProcessingNewHorario} />
                                                    </div>
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                        <div className="space-y-1.5">
                                                            <Label htmlFor="new-horario-dia">Día de la Semana</Label>
                                                            <Select value={newHorarioDia} onValueChange={(value) => setNewHorarioDia(value as DayOfWeekKey)} disabled={isProcessingNewHorario}>
                                                                <SelectTrigger id="new-horario-dia"><SelectValue placeholder="Selecciona día..." /></SelectTrigger>
                                                                <SelectContent>{daysOfWeek.map(day => (<SelectItem key={day.value} value={day.value}>{day.label} ({DayOfWeekMap[day.value]})</SelectItem>))}</SelectContent>
                                                            </Select>
                                                        </div>
                                                        <div className="space-y-1.5">
                                                            <Label htmlFor="new-horario-hora">Hora Límite (HH:MM)</Label>
                                                            <Input id="new-horario-hora" type="time" value={newHorarioHora} onChange={(e) => setNewHorarioHora(e.target.value)} disabled={isProcessingNewHorario} step="900" />
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                                                        <div className="flex items-center space-x-2">
                                                            <Switch id="new-horario-primary" checked={newHorarioIsPrimary} onCheckedChange={setNewHorarioIsPrimary} disabled={isProcessingNewHorario} />
                                                            <Label htmlFor="new-horario-primary">¿Horario Principal?</Label>
                                                        </div>
                                                        <div className="flex items-center space-x-2">
                                                            <Switch id="new-horario-active" checked={newHorarioIsActive} onCheckedChange={setNewHorarioIsActive} disabled={isProcessingNewHorario} />
                                                            <Label htmlFor="new-horario-active">¿Activo?</Label>
                                                        </div>
                                                    </div>
                                                    <Button type="submit" size="sm" disabled={isProcessingNewHorario}>
                                                        {isProcessingNewHorario ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Guardando...</> : 'Guardar Nuevo Horario'}
                                                    </Button>
                                                </form>
                                            </AccordionContent>
                                        </AccordionItem>
                                    </Accordion>

                                    {/* Existing Schedules List */}
                                    <div className='pt-4'>
                                        <h4 className="font-medium mb-2 text-sm text-muted-foreground">Horarios Existentes</h4>
                                        {isLoadingModalData ? (
                                            <Skeleton className="h-20 w-full" />
                                        ) : errorModalData ? (
                                            <p className="text-destructive">{errorModalData}</p>
                                        ) : modalHorarios.length === 0 ? (
                                            <p>No se encontraron horarios para esta residencia. Añade uno arriba.</p>
                                        ) : (
                                            <ul className="space-y-3">
                                                {modalHorarios.map((horario) => (
                                                    <li key={horario.id} className="border p-3 rounded-md flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                                                        <div className="flex-grow space-y-1">
                                                            <p className="font-medium">{horario.nombre}</p>
                                                            <p className="text-sm text-muted-foreground">
                                                                Aplica a: <span className="font-semibold">{DayOfWeekMap[horario.dia]}</span> |
                                                                Límite: <span className="font-semibold">{horario.horaSolicitud}</span>
                                                            </p>
                                                            <div className='flex gap-2 items-center'>
                                                                <Badge variant={horario.isPrimary ? "default" : "secondary"}>
                                                                    {horario.isPrimary ? 'Primario' : 'Secundario'}
                                                                </Badge>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-2 flex-shrink-0 mt-2 sm:mt-0">
                                                            <div className="flex items-center space-x-2">
                                                                <Switch id={`active-switch-${horario.id}`} checked={horario.isActive} onCheckedChange={() => handleToggleHorarioActive(horario)} aria-label={horario.isActive ? "Desactivar Horario" : "Activar Horario"} />
                                                                <Label htmlFor={`active-switch-${horario.id}`} className="text-xs">{horario.isActive ? 'Activo' : 'Inactivo'}</Label>
                                                            </div>
                                                            <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => handleEditHorario(horario)}>
                                                                <Pencil className="h-4 w-4" /> <span className="sr-only">Editar</span>
                                                            </Button>
                                                            <Button variant="destructive" size="icon" className="h-7 w-7" onClick={() => handleDeleteHorario(horario.id, horario.nombre)}>
                                                                <Trash2 className="h-4 w-4" /> <span className="sr-only">Eliminar</span>
                                                            </Button>
                                                        </div>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        {/* --- Comedores Tab Content --- */}
                        <TabsContent value="comedores">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Comedores</CardTitle>
                                    <CardDescription>Administra los comedores disponibles en la residencia.</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    {/* Accordion for Creating New Comedor */}
                                    <Accordion type="single" collapsible className="w-full">
                                        <AccordionItem value="new-comedor">
                                            <AccordionTrigger className="text-sm font-medium hover:underline [&[data-state=open]>svg]:rotate-180">
                                                <PlusCircle className="mr-2 h-4 w-4 inline" /> Añadir Nuevo Comedor
                                            </AccordionTrigger>
                                            <AccordionContent>
                                                <form onSubmit={handleCreateComedor} className="border p-4 rounded-md mt-2 space-y-4 bg-muted/30">
                                                    <h3 className="font-medium">Detalles del Nuevo Comedor</h3>
                                                    <div className="space-y-1.5">
                                                        <Label htmlFor="new-comedor-nombre">Nombre del Comedor</Label>
                                                        <Input id="new-comedor-nombre" placeholder="Ej: Comedor Principal, Salón Anexo" value={newComedorNombre} onChange={(e) => setNewComedorNombre(e.target.value)} disabled={isProcessingNewComedor} />
                                                    </div>
                                                    <div className="space-y-1.5">
                                                        <Label htmlFor="new-comedor-descripcion">Descripción (Opcional)</Label>
                                                        <Textarea id="new-comedor-descripcion" placeholder="Ingresa detalles relevantes..." value={newComedorDescripcion} onChange={(e) => setNewComedorDescripcion(e.target.value)} disabled={isProcessingNewComedor} rows={3} />
                                                    </div>
                                                    <Button type="submit" size="sm" disabled={isProcessingNewComedor}>
                                                        {isProcessingNewComedor ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Guardando...</> : 'Guardar Nuevo Comedor'}
                                                    </Button>
                                                </form>
                                            </AccordionContent>
                                        </AccordionItem>
                                    </Accordion>

                                    {/* Existing Comedores List */}
                                    <div className='pt-4'>
                                        <h4 className="font-medium mb-2 text-sm text-muted-foreground">Comedores Existentes</h4>
                                        {isLoadingModalData ? (
                                            <Skeleton className="h-20 w-full" />
                                        ) : errorModalData ? (
                                            <p className="text-destructive">{errorModalData}</p>
                                        ) : modalComedores.length === 0 ? (
                                            <p>No se encontraron comedores. Añade uno arriba.</p>
                                        ) : (
                                            <ul className="space-y-3">
                                                {modalComedores.map((comedor) => (
                                                    <li key={comedor.id} className="border p-3 rounded-md flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                                                        <div className="flex-grow space-y-1">
                                                            <p className="font-medium">{comedor.nombre}</p>
                                                            {comedor.descripcion && <p className="text-sm text-muted-foreground">{comedor.descripcion}</p>}
                                                        </div>
                                                        <div className="flex items-center gap-2 flex-shrink-0 mt-2 sm:mt-0">
                                                            <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => handleEditComedor(comedor)}>
                                                                <Pencil className="h-4 w-4" /> <span className="sr-only">Editar</span>
                                                            </Button>
                                                            <Button variant="destructive" size="icon" className="h-7 w-7" onClick={() => handleDeleteComedor(comedor.id, comedor.nombre)}>
                                                                <Trash2 className="h-4 w-4" /> <span className="sr-only">Eliminar</span>
                                                            </Button>
                                                        </div>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </Tabs> {/* End Tabs component inside Dialog */}
                </div> {/* End flex-grow div */}

                <DialogFooter className="flex-shrink-0 border-t pt-4">
                    <DialogClose asChild><Button type="button" variant="outline">Cerrar</Button></DialogClose>
                </DialogFooter>
            </DialogContent> {/* End DialogContent */}

            {/* ========================= EDIT DIALOGS ========================= */}
            <EditHorarioDialog
                isOpen={isEditHorarioDialogOpen}
                onOpenChange={(open) => { setIsEditHorarioDialogOpen(open); if (!open) setEditingHorario(null); }}
                horario={editingHorario}
                nombre={editHorarioNombre} setNombre={setEditHorarioNombre}
                dia={editHorarioDia} setDia={setEditHorarioDia}
                hora={editHorarioHora} setHora={setEditHorarioHora}
                isPrimary={editHorarioIsPrimary} setIsPrimary={setEditHorarioIsPrimary}
                isProcessing={isProcessingEditHorario}
                onSubmit={handleUpdateHorario}
            />
            <EditComedorDialog
                isOpen={isEditComedorDialogOpen}
                onOpenChange={(open) => { setIsEditComedorDialogOpen(open); if (!open) setEditingComedor(null); }}
                comedor={editingComedor}
                nombre={editComedorNombre} setNombre={setEditComedorNombre}
                descripcion={editComedorDescripcion} setDescripcion={setEditComedorDescripcion}
                isProcessing={isProcessingEditComedor}
                onSubmit={async (e: React.FormEvent) => {
                    // Call your original handler
                    await handleUpdateComedor(e);
                    // This wrapper function implicitly returns Promise<void>
                    // because it awaits an async operation and has no 'return <value>;' statement.
                }}
            />
        </Dialog> // End Main Dialog component wrapping the page
        );

        } // End ResidenciaAdminPage Component


        // =========================================================================
        // Separate Dialog Components (Defined outside the main component)
        // =========================================================================

        const EditHorarioDialog: React.FC<EditHorarioDialogProps> = ({
        isOpen, onOpenChange, horario, nombre, setNombre, dia, setDia, hora, setHora, isPrimary, setIsPrimary, isProcessing, onSubmit
        }) => {
        return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Editar Horario: {horario?.nombre}</DialogTitle>
                    <DialogDescription>Modifica los detalles de este horario de solicitud.</DialogDescription>
                </DialogHeader>
                {horario ? (
                    <form onSubmit={onSubmit} className="space-y-4 py-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="edit-horario-nombre">Nombre del Horario</Label>
                            <Input id="edit-horario-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} disabled={isProcessing} />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label htmlFor="edit-horario-dia">Día de la Semana</Label>
                                <Select value={dia} onValueChange={(value) => setDia(value as DayOfWeekKey)} disabled={isProcessing}>
                                    <SelectTrigger id="edit-horario-dia"><SelectValue placeholder="Selecciona día..." /></SelectTrigger>
                                    <SelectContent>{daysOfWeek.map(day => (<SelectItem key={day.value} value={day.value}>{day.label} ({DayOfWeekMap[day.value]})</SelectItem>))}</SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="edit-horario-hora">Hora Límite (HH:MM)</Label>
                                <Input id="edit-horario-hora" type="time" value={hora} onChange={(e) => setHora(e.target.value)} disabled={isProcessing} step="900" />
                            </div>
                        </div>
                        <div className="flex items-center space-x-2 pt-2">
                            <Switch id="edit-horario-primary" checked={isPrimary} onCheckedChange={setIsPrimary} disabled={isProcessing} />
                            <Label htmlFor="edit-horario-primary">¿Horario Principal?</Label>
                        </div>
                        <DialogFooter>
                            <DialogClose asChild><Button type="button" variant="outline" disabled={isProcessing}>Cancelar</Button></DialogClose>
                            <Button type="submit" disabled={isProcessing}>{isProcessing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Guardando...</> : 'Guardar Cambios'}</Button>
                        </DialogFooter>
                    </form>
                ) : ( <p>Cargando datos del horario...</p> )}
            </DialogContent>
        </Dialog>
        );
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
}
