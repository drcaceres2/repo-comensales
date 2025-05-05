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
import { X, PlusCircle, Pencil, Trash2 } from 'lucide-react';
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
// Checkbox import removed as it was only used for Alternativas

// Firestore Imports
import { db } from '@/lib/firebase';
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
    FieldValue
} from 'firebase/firestore';

// Import necessary types (Removed TiempoComida, AlternativaTiempoComida related types)
import {
  Residencia,
  HorarioSolicitudComida, HorarioSolicitudComidaId,
  Comedor, ComedorId,
  Dieta,
  ResidenciaId,
  DayOfWeekKey, DayOfWeekMap,
  // Removed TipoAlternativa, TipoAccesoAlternativa
} from '@/models/firestore';

const daysOfWeek: { label: string; value: DayOfWeekKey }[] = [
    { label: 'Monday', value: 'lunes' }, { label: 'Tuesday', value: 'martes' }, { label: 'Wednesday', value: 'miercoles' }, { label: 'Thursday', value: 'jueves' }, { label: 'Friday', value: 'viernes' }, { label: 'Saturday', value: 'sabado' }, { label: 'Sunday', value: 'domingo' },
] as const;
const orderedDaysOfWeek: DayOfWeekKey[] = daysOfWeek.map(d => d.value);

// Helper sort functions
const sortHorarios = (horarios: HorarioSolicitudComida[]): HorarioSolicitudComida[] => {
    return [...horarios].sort((a, b) => {
        const dayAIndex = orderedDaysOfWeek.indexOf(a.dia); const dayBIndex = orderedDaysOfWeek.indexOf(b.dia);
        if (dayAIndex !== dayBIndex) { return dayAIndex - dayBIndex; }
        return a.horaSolicitud.localeCompare(b.horaSolicitud);
    });
};
// Removed sortTiempos
const sortComedores = (comedores: Comedor[]): Comedor[] => {
    return [...comedores].sort((a, b) => a.nombre.localeCompare(b.nombre));
};
// Removed sortAlternativas

// Type definition for props needed by EditHorarioDialog
type EditHorarioDialogProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  horario: HorarioSolicitudComida | null;
  nombre: string;
  setNombre: (value: string) => void;
  dia: DayOfWeekKey | '';
  setDia: (value: DayOfWeekKey | '') => void;
  hora: string;
  setHora: (value: string) => void;
  isPrimary: boolean;
  setIsPrimary: (value: boolean) => void;
  isProcessing: boolean;
  onSubmit: (e: React.FormEvent) => Promise<void>;
};

// Removed EditTiempoDialogProps

// Type definition for props needed by EditComedorDialog
type EditComedorDialogProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  comedor: Comedor | null;
  nombre: string; setNombre: (value: string) => void;
  descripcion: string; setDescripcion: (value: string) => void;
  isProcessing: boolean;
  onSubmit: (e: React.FormEvent) => Promise<void>;
};

export default function ResidenciaAdminPage() {
    const router = useRouter();
    const [isClient, setIsClient] = useState(false);
    const { toast } = useToast();

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

  // --- State: Modal - TiemposComida (REMOVED) ---

  // --- State: Modal - Comedores ---
  const [modalComedores, setModalComedores] = useState<Comedor[]>([]);
  const [newComedorNombre, setNewComedorNombre] = useState('');
  const [newComedorDescripcion, setNewComedorDescripcion] = useState(''); // Optional
  const [isProcessingNewComedor, setIsProcessingNewComedor] = useState(false);

  // --- State: Modal - Alternativas (REMOVED) ---

    // *** State for Editing Horario ***
    const [editingHorario, setEditingHorario] = useState<HorarioSolicitudComida | null>(null);
    const [isEditHorarioDialogOpen, setIsEditHorarioDialogOpen] = useState(false);
    const [editHorarioNombre, setEditHorarioNombre] = useState('');
    const [editHorarioDia, setEditHorarioDia] = useState<DayOfWeekKey | ''>('');
    const [editHorarioHora, setEditHorarioHora] = useState('');
    const [editHorarioIsPrimary, setEditHorarioIsPrimary] = useState(false);
    const [isProcessingEditHorario, setIsProcessingEditHorario] = useState(false);

    // *** State for Editing TiempoComida (REMOVED) ***

    // *** State for Editing Comedor ***
  const [editingComedor, setEditingComedor] = useState<Comedor | null>(null);
  const [isEditComedorDialogOpen, setIsEditComedorDialogOpen] = useState(false);
  const [editComedorNombre, setEditComedorNombre] = useState('');
  const [editComedorDescripcion, setEditComedorDescripcion] = useState('');
  const [isProcessingEditComedor, setIsProcessingEditComedor] = useState(false);


  useEffect(() => {
    setIsClient(true);
    fetchResidences();
  }, []);

  const fetchResidences = useCallback(async () => {
    setIsLoadingResidences(true);
    setErrorResidences(null);
    try {
        const residencesCol = collection(db, 'residencias');
        const residenceSnapshot = await getDocs(residencesCol);
        const fetchedResidences: Residencia[] = residenceSnapshot.docs.map(doc => ({
            id: doc.id,
            ...(doc.data() as Omit<Residencia, 'id'>)
        }));
        fetchedResidences.sort((a, b) => a.nombre.localeCompare(b.nombre));
        setResidences(fetchedResidences);
    } catch (error) {
        const errorMessage = `Failed to fetch residences. ${error instanceof Error ? error.message : 'Unknown error'}`;
        console.error("Error fetching residences: ", error);
        setErrorResidences(errorMessage);
        toast({ title: "Error", description: "Could not fetch residences from Firestore.", variant: "destructive" });
    } finally {
        setIsLoadingResidences(false);
    }
  }, [toast]);


  const handleTimeChange = (day: DayOfWeekKey, value: string) => {
    setNewSubmissionTimes(prev => ({ ...prev, [day]: value }));
  };
  const handleAddComedor = () => {
    const trimmedName = currentComedorName.trim();
    if (!trimmedName) return;
    if (newComedores.some(name => name.toLowerCase() === trimmedName.toLowerCase())) {
        toast({ title: "Warning", description: `Dining hall \"${trimmedName}\" already added.`, variant: "destructive"});
        return;
    }
    setNewComedores(prev => [...prev, trimmedName]);
    setCurrentComedorName('');
    toast({ title: "Success", description: `Added dining hall: \"${trimmedName}\"`});
  };
  const handleRemoveComedor = (nameToRemove: string) => {
    setNewComedores(prev => prev.filter(name => name !== nameToRemove));
    toast({ title: "Removed", description: `Removed dining hall: \"${nameToRemove}\"`});
  };


  const handleCreateResidence = async () => {
     if (!newResidenceName.trim()) { toast({ title: "Error", description: "Residence name cannot be empty.", variant: "destructive" }); return; }
    const validTimes = Object.entries(newSubmissionTimes).filter(([_, time]) => time && /^\d{2}:\d{2}$/.test(time));
    if (validTimes.length === 0) { toast({ title: "Error", description: "Please set at least one valid primary meal request submission time (HH:MM).", variant: "destructive" }); return; }
    if (newComedores.length === 0) { toast({ title: "Error", description: "Please add at least one dining hall.", variant: "destructive" }); return; }

    setIsProcessingCreate(true);
    let newResidenciaId: ResidenciaId | null = null;

    try {
        const residenciaData: Omit<Residencia, 'id'> = { nombre: newResidenceName.trim() };
        const residenciaRef = await addDoc(collection(db, 'residencias'), residenciaData);
        newResidenciaId = residenciaRef.id;

        const batch = writeBatch(db);

        // Still create the default Dieta
        const defaultDietaRef = doc(db, 'dietas', `N_${newResidenciaId}`);
        const defaultDietaData: Omit<Dieta, 'id'> = { residenciaId: newResidenciaId, nombre: "Dieta Normal", descripcion: "Dieta normal (por defecto).", isDefault: true, isActive: true };
        batch.set(defaultDietaRef, defaultDietaData);

        newComedores.forEach((nombreComedor) => {
            const comedorRef = doc(collection(db, 'comedores'));
            const comedorData: Omit<Comedor, 'id'> = { nombre: nombreComedor, residenciaId: newResidenciaId! };
            batch.set(comedorRef, comedorData);
        });

        for (const day in newSubmissionTimes) {
            const timeString = newSubmissionTimes[day as DayOfWeekKey];
            if (timeString && /^\d{2}:\d{2}$/.test(timeString)) {
                const horarioRef = doc(collection(db, 'horariosSolicitudComida'));
                const horarioData: Omit<HorarioSolicitudComida, 'id'> = {
                    residenciaId: newResidenciaId!,
                    nombre: `Solicitud Principal ${DayOfWeekMap[day as DayOfWeekKey]}`,
                    dia: day as DayOfWeekKey,
                    horaSolicitud: timeString,
                    isPrimary: true,
                    isActive: true,
                };
                batch.set(horarioRef, horarioData);
            }
        }

        await batch.commit();
        toast({ title: "Success", description: `Residence \"${newResidenceName}\" and initial settings created successfully.` });

        const newResidenceForState: Residencia = { id: newResidenciaId!, nombre: newResidenceName.trim() };
        setResidences(prev => [...prev, newResidenceForState].sort((a, b) => a.nombre.localeCompare(b.nombre)));

        setNewResidenceName('');
        setNewSubmissionTimes({});
        setNewComedores([]);
        setCurrentComedorName('');

    } catch (error) {
        const errorMessage = `Failed to create residence. ${error instanceof Error ? error.message : 'Unknown error'}`;
        console.error("Error creating residence: ", error);
        toast({ title: "Error", description: errorMessage, variant: "destructive" });
    } finally {
        setIsProcessingCreate(false);
    }
  };

  // *** UPDATED: fetchModalData (Removed Tiempos and Alternativas fetch) ***
  const fetchModalData = useCallback(async (residenciaId: ResidenciaId) => {
    if (!residenciaId) {
        console.log("fetchModalData: No residenciaId provided.");
        return;
    }
    console.log(`fetchModalData: Starting for residenceId: ${residenciaId}`);
    setIsLoadingModalData(true);
    setErrorModalData(null);
    // Clear remaining modal data
    setModalHorarios([]); setModalComedores([]);

    try {
        console.log("fetchModalData: Fetching Horarios...");
        // Fetch Horarios
        const horariosQuery = query(collection(db, 'horariosSolicitudComida'), where("residenciaId", "==", residenciaId));
        const horariosSnapshot = await getDocs(horariosQuery);
        let fetchedHorarios: HorarioSolicitudComida[] = horariosSnapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as Omit<HorarioSolicitudComida, 'id'>) }));
        console.log(`fetchModalData: Fetched ${fetchedHorarios.length} Horarios.`);
        setModalHorarios(sortHorarios(fetchedHorarios));

        // Fetch TiemposComida (REMOVED)

        console.log("fetchModalData: Fetching Comedores...");
        // Fetch Comedores
        const comedoresQuery = query(collection(db, 'comedores'), where("residenciaId", "==", residenciaId));
        const comedoresSnapshot = await getDocs(comedoresQuery);
        let fetchedComedores: Comedor[] = comedoresSnapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as Omit<Comedor, 'id'>) }));
        console.log(`fetchModalData: Fetched ${fetchedComedores.length} Comedores.`);
        setModalComedores(sortComedores(fetchedComedores));

        // Fetch Alternativas (REMOVED)

        console.log("fetchModalData: Successfully fetched remaining data.");

    } catch (error) {
        const errorMessage = `Failed to load settings data. ${error instanceof Error ? error.message : 'Unknown error'}`;
        console.error("Error fetching modal data: ", error);
        setErrorModalData(errorMessage);
        console.log("fetchModalData: Error occurred, setErrorModalData called.");
    } finally {
        setIsLoadingModalData(false);
        console.log("fetchModalData: Finished, setIsLoadingModalData(false) called.");
    }
}, [toast]); // Keep dependency array minimal


  const handleManageSettings = (residencia: Residencia) => {
    console.log(`handleManageSettings triggered for ${residencia.id}`);
    setManagingResidenciaId(residencia.id);
    setManagingResidenciaNombre(residencia.nombre);
    console.log(`handleManageSettings: Calling fetchModalData for ${residencia.id}`);
    fetchModalData(residencia.id);
    setIsModalOpen(true);
  }

  // *** UPDATED: handleModalOpenChange (Removed Tiempo and Alternativa resets) ***
   const handleModalOpenChange = (open: boolean) => {
        setIsModalOpen(open);
        if (!open) {
            // Reset common state
            setManagingResidenciaId(null); setManagingResidenciaNombre('');
            setIsLoadingModalData(false); setErrorModalData(null);
            // Reset remaining data arrays
            setModalHorarios([]); setModalComedores([]);
            // Reset Horario form
            setNewHorarioNombre(''); setNewHorarioDia(''); setNewHorarioHora(''); setNewHorarioIsPrimary(false); setNewHorarioIsActive(true); setIsProcessingNewHorario(false);
            // Reset Tiempo form (REMOVED)
            // Reset Comedor form
            setNewComedorNombre(''); setNewComedorDescripcion(''); setIsProcessingNewComedor(false);
            // Reset Alternativa form (REMOVED)
            // Reset Edit Horario state
            setEditingHorario(null);
            setIsEditHorarioDialogOpen(false); // Ensure edit dialog is closed if main closes
            setIsProcessingEditHorario(false);
            // Reset Edit Tiempo state (REMOVED)
            // Reset Edit Comedor state
            setEditingComedor(null);
            setIsEditComedorDialogOpen(false);
            setIsProcessingEditComedor(false);

            console.log("Modal closed, relevant state reset.");
        }
    };

    // --- Handlers for Horarios Tab ---
    const handleEditHorario = (horario: HorarioSolicitudComida) => {
        if (!horario) return;
        console.log("Opening edit dialog for Horario:", horario);
        setEditingHorario(horario);
        setEditHorarioNombre(horario.nombre);
        setEditHorarioDia(horario.dia);
        setEditHorarioHora(horario.horaSolicitud);
        setEditHorarioIsPrimary(horario.isPrimary);
        setIsProcessingEditHorario(false);
        setIsEditHorarioDialogOpen(true);
    };

    const handleDeleteHorario = async (horarioId: string, horarioNombre: string) => {
        if (!managingResidenciaId || !confirm(`Are you sure you want to delete the schedule \"${horarioNombre}\"? This might affect Meal Alternatives defined elsewhere.`)) return;
        // Reminder: Check dependencies in the Horarios page before allowing deletion there.
        try {
            await deleteDoc(doc(db, 'horariosSolicitudComida', horarioId));
            toast({ title: "Success", description: `Schedule \"${horarioNombre}\" deleted.` });
            setModalHorarios(prev => prev.filter(h => h.id !== horarioId));
        } catch (error) {
            const errorMessage = `Failed to delete schedule. ${error instanceof Error ? error.message : 'Unknown error'}`;
            console.error("Error deleting horario: ", error);
            toast({ title: "Error", description: errorMessage, variant: "destructive" });
        }
    };
    const handleToggleHorarioActive = async (horario: HorarioSolicitudComida) => {
        if (!managingResidenciaId) return;
        const newStatus = !horario.isActive;
        try {
            const horarioRef = doc(db, 'horariosSolicitudComida', horario.id);
            await updateDoc(horarioRef, { isActive: newStatus });
            toast({ title: "Success", description: `Schedule \"${horario.nombre}\" ${newStatus ? 'activated' : 'deactivated'}.` });
            setModalHorarios(prev => sortHorarios(prev.map(h => h.id === horario.id ? {...h, isActive: newStatus } : h)));
        } catch (error) {
            const errorMessage = `Failed to update schedule status. ${error instanceof Error ? error.message : 'Unknown error'}`;
            console.error("Error toggling horario active: ", error);
            toast({ title: "Error", description: errorMessage, variant: "destructive" });
        }
    };
    const handleCreateHorario = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!managingResidenciaId) return;
        if (!newHorarioNombre.trim() || !newHorarioDia || !newHorarioHora || !/^\d{2}:\d{2}$/.test(newHorarioHora)) {
            toast({ title: "Validation Error", description: "Please fill in all schedule fields correctly.", variant: "destructive" }); return;
        }
        if (newHorarioIsPrimary && modalHorarios.some(h => h.dia === newHorarioDia && h.isPrimary)) {
            if (!confirm(`There is already a primary schedule for ${DayOfWeekMap[newHorarioDia]}. Add another?`)) return;
        }
        setIsProcessingNewHorario(true);
        try {
            const newHorarioData: Omit<HorarioSolicitudComida, 'id'> = {
                residenciaId: managingResidenciaId, nombre: newHorarioNombre.trim(), dia: newHorarioDia,
                horaSolicitud: newHorarioHora, isPrimary: newHorarioIsPrimary, isActive: newHorarioIsActive,
            };
            const horarioRef = await addDoc(collection(db, 'horariosSolicitudComida'), newHorarioData);
            const newHorarioForState: HorarioSolicitudComida = { id: horarioRef.id, ...newHorarioData };
            setModalHorarios(prev => sortHorarios([...prev, newHorarioForState]));
            toast({ title: "Success", description: `Schedule \"${newHorarioNombre}\" created.` });
            setNewHorarioNombre(''); setNewHorarioDia(''); setNewHorarioHora(''); setNewHorarioIsPrimary(false); setNewHorarioIsActive(true);
        } catch (error) {
            const errorMessage = `Failed to create schedule. ${error instanceof Error ? error.message : 'Unknown error'}`;
            console.error("Error creating horario: ", error);
            toast({ title: "Error", description: errorMessage, variant: "destructive" });
        } finally {
            setIsProcessingNewHorario(false);
        }
    };
    // Handler for Updating a Horario
    const handleUpdateHorario = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingHorario || !managingResidenciaId) {
            toast({ title: "Error", description: "No schedule selected for editing.", variant: "destructive" });
            return;
        }
        if (!editHorarioNombre.trim() || !editHorarioDia || !editHorarioHora || !/^\d{2}:\d{2}$/.test(editHorarioHora)) {
            toast({ title: "Validation Error", description: "Please fill in all schedule fields correctly.", variant: "destructive" });
            return;
        }
        if (editHorarioIsPrimary && modalHorarios.some(h => h.id !== editingHorario.id && h.dia === editHorarioDia && h.isPrimary)) {
            if (!confirm(`There is already another primary schedule for ${DayOfWeekMap[editHorarioDia]}. Are you sure you want to make this one primary too?`)) {
                return;
            }
        }

        setIsProcessingEditHorario(true);
        try {
            const horarioRef = doc(db, 'horariosSolicitudComida', editingHorario.id);
            const updatedData: Partial<HorarioSolicitudComida> = {
                nombre: editHorarioNombre.trim(),
                dia: editHorarioDia,
                horaSolicitud: editHorarioHora,
                isPrimary: editHorarioIsPrimary,
            };
            await updateDoc(horarioRef, updatedData);
            console.log("Horario updated successfully:", editingHorario.id);
            const updatedHorarioForState: HorarioSolicitudComida = {
                ...editingHorario, ...updatedData
            };
            setModalHorarios(prev => sortHorarios(
                prev.map(h => h.id === editingHorario.id ? updatedHorarioForState : h)
            ));
            toast({ title: "Success", description: `Schedule \"${editHorarioNombre}\" updated.` });
            setIsEditHorarioDialogOpen(false);
        } catch (error) {
            const errorMessage = `Failed to update schedule. ${error instanceof Error ? error.message : 'Unknown error'}`;
            console.error("Error updating horario: ", error);
            toast({ title: "Error", description: errorMessage, variant: "destructive" });
        } finally {
            setIsProcessingEditHorario(false);
        }
    };

    // --- Edit Horario Dialog Component (Defined at the bottom) ---

    // --- Handlers for Tiempos Tab (REMOVED) ---
    // Removed handleCreateTiempo, handleEditTiempo, handleDeleteTiempo, handleUpdateTiempo

    // --- Edit TiempoComida Dialog Component (REMOVED) ---


    // --- Handlers for Comedores Tab ---
    const handleCreateComedor = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!managingResidenciaId) return;

        if (!newComedorNombre.trim()) {
             toast({ title: "Validation Error", description: "Dining Hall Name cannot be empty.", variant: "destructive" });
             return;
        }
        if (modalComedores.some(c => c.nombre.toLowerCase() === newComedorNombre.trim().toLowerCase())) {
            toast({ title: "Validation Error", description: `A dining hall named \"${newComedorNombre.trim()}\" already exists.`, variant: "destructive" });
            return;
        }

        setIsProcessingNewComedor(true);
        try {
            const newComedorData: Omit<Comedor, 'id'> = {
                residenciaId: managingResidenciaId,
                nombre: newComedorNombre.trim(),
                descripcion: newComedorDescripcion.trim() || '',
            };
            const comedorRef = await addDoc(collection(db, 'comedores'), newComedorData);
            console.log("New Comedor created with ID:", comedorRef.id);
            const newComedorForState: Comedor = { id: comedorRef.id, ...newComedorData };
            setModalComedores(prev => sortComedores([...prev, newComedorForState]));
            toast({ title: "Success", description: `Dining Hall \"${newComedorNombre}\" created.` });
            setNewComedorNombre(''); setNewComedorDescripcion('');
        } catch (error) {
             const errorMessage = `Failed to create Dining Hall. ${error instanceof Error ? error.message : 'Unknown error'}`;
            console.error("Error creating Comedor: ", error);
            toast({ title: "Error", description: errorMessage, variant: "destructive" });
        } finally {
            setIsProcessingNewComedor(false);
        }
    };

    const handleEditComedor = (comedor: Comedor) => {
        if (!comedor) return;
        console.log("Opening edit dialog for Comedor:", comedor);
        setEditingComedor(comedor);
        setEditComedorNombre(comedor.nombre);
        setEditComedorDescripcion(comedor.descripcion || '');
        setIsProcessingEditComedor(false);
        setIsEditComedorDialogOpen(true);
    };

    const handleDeleteComedor = async (comedorId: string, comedorNombre: string) => {
        if (!managingResidenciaId) return;
         if (!confirm(`Are you sure you want to delete the Dining Hall \"${comedorNombre}\"? Make sure no Meal Alternatives (managed in the Horarios section) depend on it first.`)) {
            return;
        }
        console.log("Deleting Comedor", comedorId);
        // Reminder: Check dependencies in the Horarios page before allowing deletion there.
        try {
            await deleteDoc(doc(db, 'comedores', comedorId));
            toast({ title: "Success", description: `Dining Hall \"${comedorNombre}\" deleted.` });
            setModalComedores(prev => prev.filter(c => c.id !== comedorId));
        } catch (error) {
            const errorMessage = `Failed to delete Dining Hall. ${error instanceof Error ? error.message : 'Unknown error'}`;
            console.error("Error deleting Comedor: ", error);
            toast({ title: "Error", description: errorMessage, variant: "destructive" });
        }
    };

    // Handler for Updating a Comedor
    const handleUpdateComedor = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingComedor || !managingResidenciaId) {
            toast({ title: "Error", description: "No Dining Hall selected for editing.", variant: "destructive" });
            return;
        }
        const trimmedName = editComedorNombre.trim();
        if (!trimmedName) {
             toast({ title: "Validation Error", description: "Dining Hall Name cannot be empty.", variant: "destructive" }); return;
        }
        if (modalComedores.some(c => c.id !== editingComedor.id && c.nombre.toLowerCase() === trimmedName.toLowerCase())) {
            toast({ title: "Validation Error", description: `Another dining hall named \"${trimmedName}\" already exists.`, variant: "destructive" });
            return;
        }

        setIsProcessingEditComedor(true);
        try {
            const comedorRef = doc(db, 'comedores', editingComedor.id);
            const dataForFirestore: { [key: string]: string | FieldValue } = {
                 nombre: trimmedName,
                 descripcion: editComedorDescripcion.trim() ? editComedorDescripcion.trim() : deleteField(),
            };
            await updateDoc(comedorRef, dataForFirestore);
            console.log("Comedor updated successfully:", editingComedor.id);
            const updatedComedorForState: Comedor = {
                ...editingComedor,
                nombre: trimmedName,
                descripcion: editComedorDescripcion.trim() || undefined,
            };
            setModalComedores(prev => sortComedores(
                prev.map(c => c.id === editingComedor.id ? updatedComedorForState : c)
            ));
            toast({ title: "Success", description: `Dining Hall \"${trimmedName}\" updated.` });
            setIsEditComedorDialogOpen(false);
        } catch (error) {
             const errorMessage = `Failed to update Dining Hall. ${error instanceof Error ? error.message : 'Unknown error'}`;
            console.error("Error updating Comedor: ", error);
            toast({ title: "Error", description: errorMessage, variant: "destructive" });
        } finally {
            setIsProcessingEditComedor(false);
        }
    };

    // --- Edit Comedor Dialog Component (Defined at the bottom) ---

    // --- Handlers for Alternativas Tab (REMOVED) ---
    // Removed handleCreateAlternativa, handleEditAlternativa, handleDeleteAlternativa


    // --- Render Logic ---
  return (
     <Dialog open={isModalOpen} onOpenChange={handleModalOpenChange}>
    <div className="container mx-auto p-4 space-y-6">
        <h1 className="text-2xl font-bold">Manage Residences</h1>
            <Tabs defaultValue="list" className="w-full">
                <TabsList>
                    <TabsTrigger value="create">Create New Residence</TabsTrigger>
                    <TabsTrigger value="list">Existing Residences</TabsTrigger>
                </TabsList>
                <TabsContent value="create">
                    <Card>
                        <CardHeader>
                            <CardTitle>Create New Residence</CardTitle>
                            <CardDescription>Enter the basic details and initial settings for the new residence.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {!isClient ? (<Skeleton className="h-80 w-full" />) : (
                                <>
                                    <div className="space-y-2"> <Label htmlFor="residence-name">Residence Name</Label> <Input id="residence-name" placeholder="e.g., Residencia Central" value={newResidenceName} onChange={(e) => setNewResidenceName(e.target.value)} disabled={isProcessingCreate} /> </div>
                                    <div className="space-y-2"> <Label>Primary Meal Request Submission Times</Label> <CardDescription>Set the main deadline time (HH:MM) for each day's meal requests.</CardDescription> <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"> {daysOfWeek.map(day => (<div key={day.value} className="grid gap-2"> <Label htmlFor={`time-${day.value}`}>{day.label}</Label> <Input id={`time-${day.value}`} type="time" value={newSubmissionTimes[day.value] || ''} onChange={(e) =>
                                            handleTimeChange(day.value, e.target.value)} disabled={isProcessingCreate} step="900" /> </div>))} </div> </div>
                                        {/* Initial Dining Halls Section */}
                                        <div className="space-y-4"> <Label>Initial Dining Halls (Comedores)</Label> <CardDescription>Add the names of the dining halls available at this residence.</CardDescription> <div className="flex items-center space-x-2"> <div className="grid flex-1 gap-2"> <Label htmlFor="new-comedor-name" className="sr-only">New Dining Hall Name</Label> <Input id="new-comedor-name" placeholder="e.g., Comedor Principal" value={currentComedorName} onChange={(e) => setCurrentComedorName(e.target.value)} disabled={isProcessingCreate} /> </div> <Button type="button" size="sm" onClick={handleAddComedor} disabled={isProcessingCreate || !currentComedorName.trim()}> <PlusCircle className="mr-2 h-4 w-4" /> Add Hall </Button> </div> {newComedores.length > 0 && (<div className="space-y-2 pt-2"> <Label className="text-xs font-medium text-muted-foreground">Added Halls:</Label> <ul className="space-y-1"> {newComedores.map((name) => (<li key={name} className="flex items-center justify-between p-1.5 border rounded-md bg-secondary/30 text-sm"> <span>{name}</span> <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => handleRemoveComedor(name)} disabled={isProcessingCreate} aria-label={`Remove ${name}`}> <X className="h-3 w-3" /> </Button> </li>))} </ul> </div>)} </div>
                                        {/* Create Button */}
                                        <div className="pt-4"> <Button onClick={handleCreateResidence} disabled={isProcessingCreate}> {isProcessingCreate ? 'Creating...' : 'Create Residence'} </Button> </div>
                                        </>
                                        )}
                            </CardContent>
                    </Card>
                </TabsContent>
                {/* Existing Residences Tab */}
                <TabsContent value="list">
                    <Card>
                        <CardHeader> <CardTitle>Existing Residences</CardTitle> <CardDescription>View existing residences and manage their settings.</CardDescription> </CardHeader>
                        <CardContent>
                            {isLoadingResidences ? (
                            <div className="space-y-2">
                                <Skeleton className="h-16 w-full" />
                                <Skeleton className="h-16 w-full" />
                            </div>
                            ) : errorResidences ? (
                            <p className="text-destructive">{errorResidences}</p>
                            ) : !residences || residences.length === 0 ? (
                            <p>No residences found. Create one using the 'Create New Residence' tab.</p>
                            ) : (
                            <ul className="space-y-3"> {residences.map((res) => (
                                <li key={res.id} className="border p-4 rounded-md shadow-sm flex justify-between items-center">
                                    <div>
                                        <p className="font-semibold text-lg">{res.nombre}</p>
                                        <p className="text-sm text-muted-foreground">ID: {res.id}</p>
                                    </div>
                                    {/* Trigger for Modal */}
                                    <DialogTrigger asChild>
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            onClick={() => handleManageSettings(res)}
                                        >
                                            Manage Settings
                                        </Button>
                                    </DialogTrigger>
                                </li>))}
                            </ul>)}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs> {/* End Main Tabs */}
        </div> {/* End Container Div */}

            {/* --- MODAL CONTENT --- */}
            <DialogContent className="sm:max-w-[600px] md:max-w-[800px] lg:max-w-[900px] max-h-[90vh] flex flex-col"> {/* Adjusted max-width */}
            <DialogHeader>
            <DialogTitle>Manage Settings for: {managingResidenciaNombre || '...'}</DialogTitle>
            <DialogDescription> Configure request schedules and dining halls for this residence. Meal times and alternatives are managed elsewhere.</DialogDescription>
            </DialogHeader>

            {/* Modal Tabs Container */}
            <div className="py-4 flex-grow overflow-y-auto"> {/* Added overflow-y-auto */}
            <Tabs defaultValue="horarios" className="w-full">
            <TabsList className="mb-4 grid w-full grid-cols-2"> {/* Adjusted grid-cols */}
            <TabsTrigger value="horarios">Request Schedules</TabsTrigger>
            {/* Removed Tiempos Trigger */}
            <TabsTrigger value="comedores">Dining Halls</TabsTrigger>
            {/* Removed Alternativas Trigger */}
            </TabsList>

            {/* --- Horarios Tab Content --- */}
            <TabsContent value="horarios">
            <Card>
            <CardHeader>
            <CardTitle>Meal Request Schedules</CardTitle>
            <CardDescription>Define when users can submit or change their meal requests.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
            {/* Accordion for Creating New Schedule */}
            <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="new-horario">
            <AccordionTrigger className="text-sm font-medium hover:underline [&[data-state=open]>svg]:rotate-180">
                <PlusCircle className="mr-2 h-4 w-4 inline" /> Add New Schedule
            </AccordionTrigger>
            <AccordionContent>
                <form onSubmit={handleCreateHorario} className="border p-4 rounded-md mt-2 space-y-4 bg-muted/30">
                    <h3 className="font-medium">New Schedule Details</h3>
                    <div className="space-y-1.5">
                            <Label htmlFor="new-horario-nombre">Schedule Name</Label>
                            <Input id="new-horario-nombre" placeholder="e.g., Cambio Almuerzo, Solicitud Finde" value={newHorarioNombre} onChange={(e) => setNewHorarioNombre(e.target.value)} disabled={isProcessingNewHorario} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label htmlFor="new-horario-dia">Day of Week</Label>
                                <Select value={newHorarioDia} onValueChange={(value) => setNewHorarioDia(value as DayOfWeekKey)} disabled={isProcessingNewHorario}>
                                    <SelectTrigger id="new-horario-dia"><SelectValue placeholder="Select day..." /></SelectTrigger>
                                    <SelectContent>{daysOfWeek.map(day => (<SelectItem key={day.value} value={day.value}>{day.label} ({DayOfWeekMap[day.value]})</SelectItem>))}</SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="new-horario-hora">Deadline Time (HH:MM)</Label>
                                <Input id="new-horario-hora" type="time" value={newHorarioHora} onChange={(e) => setNewHorarioHora(e.target.value)} disabled={isProcessingNewHorario} step="900" />
                            </div>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div className="flex items-center space-x-2">
                            <Switch id="new-horario-primary" checked={newHorarioIsPrimary} onCheckedChange={setNewHorarioIsPrimary} disabled={isProcessingNewHorario} />
                            <Label htmlFor="new-horario-primary">Primary Schedule?</Label>
                        </div>
                            <div className="flex items-center space-x-2">
                            <Switch id="new-horario-active" checked={newHorarioIsActive} onCheckedChange={setNewHorarioIsActive} disabled={isProcessingNewHorario} />
                            <Label htmlFor="new-horario-active">Active?</Label>
                        </div>
                    </div>
                    <Button type="submit" size="sm" disabled={isProcessingNewHorario}>
                            {isProcessingNewHorario ? 'Saving...' : 'Save New Schedule'}
                    </Button>
                </form>
            </AccordionContent>
            </AccordionItem>
            </Accordion>

            {/* Existing Schedules List */}
            <div className='pt-4'>
            <h4 className="font-medium mb-2 text-sm text-muted-foreground">Existing Schedules</h4>
            {isLoadingModalData ? (
            <Skeleton className="h-20 w-full" />
            ) : errorModalData ? (
            <p className="text-destructive">{errorModalData}</p>
            ) : modalHorarios.length === 0 ? (
            <p>No request schedules found for this residence. Add one above.</p>
            ) : (
            <ul className="space-y-3">
                {modalHorarios.map((horario) => (
                    <li key={horario.id} className="border p-3 rounded-md flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                        <div className="flex-grow space-y-1">
                            <p className="font-medium">{horario.nombre}</p>
                            <p className="text-sm text-muted-foreground">
                                Applies to: <span className="font-semibold">{DayOfWeekMap[horario.dia]}</span> |
                                Deadline: <span className="font-semibold">{horario.horaSolicitud}</span>
                            </p>
                            <div className='flex gap-2 items-center'>
                                <Badge variant={horario.isPrimary ? "default" : "secondary"}>
                                    {horario.isPrimary ? 'Primary' : 'Secondary'}
                                </Badge>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 mt-2 sm:mt-0">
                            <div className="flex items-center space-x-2">
                                <Switch
                                    id={`active-switch-${horario.id}`}
                                    checked={horario.isActive}
                                    onCheckedChange={() => handleToggleHorarioActive(horario)}
                                    aria-label={horario.isActive ? "Deactivate Schedule" : "Activate Schedule"}
                                />
                                <Label htmlFor={`active-switch-${horario.id}`} className="text-xs">{horario.isActive ? 'Active' : 'Inactive'}</Label>
                            </div>
                            <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => handleEditHorario(horario)}>
                                <Pencil className="h-4 w-4" /> <span className="sr-only">Edit</span>
                            </Button>
                            <Button variant="destructive" size="icon" className="h-7 w-7" onClick={() => handleDeleteHorario(horario.id, horario.nombre)}>
                                <Trash2 className="h-4 w-4" /> <span className="sr-only">Delete</span>
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


            {/* --- Tiempos Tab Content (REMOVED) --- */}


            {/* --- Comedores Tab Content --- */}
            <TabsContent value="comedores">
            <Card>
            <CardHeader>
            <CardTitle>Dining Halls</CardTitle>
            <CardDescription>Manage the dining halls available at the residence.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
            {/* Accordion for Creating New Comedor */}
            <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="new-comedor">
            <AccordionTrigger className="text-sm font-medium hover:underline [&[data-state=open]>svg]:rotate-180">
                <PlusCircle className="mr-2 h-4 w-4 inline" /> Add New Dining Hall
            </AccordionTrigger>
            <AccordionContent>
                <form onSubmit={handleCreateComedor} className="border p-4 rounded-md mt-2 space-y-4 bg-muted/30">
                    <h3 className="font-medium">New Dining Hall Details</h3>
                    {/* Name */}
                    <div className="space-y-1.5">
                            <Label htmlFor="new-comedor-nombre">Dining Hall Name</Label>
                            <Input id="new-comedor-nombre" placeholder="e.g., Comedor Principal, Salón Anexo" value={newComedorNombre} onChange={(e) => setNewComedorNombre(e.target.value)} disabled={isProcessingNewComedor} />
                    </div>
                    {/* Description (Optional) */}
                    <div className="space-y-1.5">
                            <Label htmlFor="new-comedor-descripcion">Description (Optional)</Label>
                            <Textarea
                                id="new-comedor-descripcion"
                                placeholder="Enter any relevant details about this dining hall..."
                                value={newComedorDescripcion}
                                onChange={(e) => setNewComedorDescripcion(e.target.value)}
                                disabled={isProcessingNewComedor}
                                rows={3}
                            />
                    </div>
                    <Button type="submit" size="sm" disabled={isProcessingNewComedor}>
                            {isProcessingNewComedor ? 'Saving...' : 'Save New Dining Hall'}
                    </Button>
                </form>
            </AccordionContent>
            </AccordionItem>
            </Accordion>

            {/* Existing Comedores List */}
            <div className='pt-4'>
            <h4 className="font-medium mb-2 text-sm text-muted-foreground">Existing Dining Halls</h4>
            {isLoadingModalData ? (
            <Skeleton className="h-20 w-full" />
            ) : errorModalData ? (
            <p className="text-destructive">{errorModalData}</p>
            ) : modalComedores.length === 0 ? (
            <p>No dining halls found for this residence. Add one above.</p>
            ) : (
            <ul className="space-y-3">
                {modalComedores.map((comedor) => (
                    <li key={comedor.id} className="border p-3 rounded-md flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                        <div className="flex-grow space-y-1">
                            <p className="font-medium">{comedor.nombre}</p>
                            {comedor.descripcion && (
                                <p className="text-sm text-muted-foreground">
                                    {comedor.descripcion}
                                </p>
                            )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 mt-2 sm:mt-0">
                            <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => handleEditComedor(comedor)}>
                                <Pencil className="h-4 w-4" /> <span className="sr-only">Edit</span>
                            </Button>
                            <Button variant="destructive" size="icon" className="h-7 w-7" onClick={() => handleDeleteComedor(comedor.id, comedor.nombre)}>
                                <Trash2 className="h-4 w-4" /> <span className="sr-only">Delete</span>
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

            {/* --- Alternativas Tab Content (REMOVED) --- */}

            </Tabs> {/* End Tabs component inside Dialog */}
            </div> {/* End flex-grow div */}

            <DialogFooter className="flex-shrink-0 border-t pt-4"> {/* Added border and padding */}
            <DialogClose asChild><Button type="button" variant="outline">Close</Button></DialogClose>
            </DialogFooter>
            </DialogContent> {/* End DialogContent */}

            {/* --- Render the Edit Dialogs (they will be controlled by their respective isOpen state) --- */}
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
            {/* Removed EditTiempoDialog render */}
            <EditComedorDialog
            isOpen={isEditComedorDialogOpen}
            onOpenChange={(open) => { setIsEditComedorDialogOpen(open); if (!open) setEditingComedor(null); }}
            comedor={editingComedor}
            nombre={editComedorNombre} setNombre={setEditComedorNombre}
            descripcion={editComedorDescripcion} setDescripcion={setEditComedorDescripcion}
            isProcessing={isProcessingEditComedor}
            onSubmit={handleUpdateComedor}
            />
        </Dialog> // End Main Dialog component
    );
} // End ResidenciaAdminPage Component

// ==========================================================================
// Separate Dialog Components (Moved outside the main component)
// ==========================================================================

const EditHorarioDialog: React.FC<EditHorarioDialogProps> = ({
isOpen, onOpenChange, horario, nombre, setNombre, dia, setDia, hora, setHora, isPrimary, setIsPrimary, isProcessing, onSubmit
}) => {
return (
<Dialog open={isOpen} onOpenChange={onOpenChange}>
<DialogContent className="sm:max-w-[500px]">
<DialogHeader>
<DialogTitle>Edit Schedule: {horario?.nombre}</DialogTitle>
<DialogDescription>Modify the details for this request schedule.</DialogDescription>
</DialogHeader>
{horario ? (
<form onSubmit={onSubmit} className="space-y-4 py-4">
{/* Name Input */}
<div className="space-y-1.5">
<Label htmlFor="edit-horario-nombre">Schedule Name</Label>
<Input id="edit-horario-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} disabled={isProcessing} />
</div>
{/* Day and Time */}
<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
<div className="space-y-1.5">
<Label htmlFor="edit-horario-dia">Day of Week</Label>
<Select value={dia} onValueChange={(value) => setDia(value as DayOfWeekKey)} disabled={isProcessing}>
<SelectTrigger id="edit-horario-dia"><SelectValue placeholder="Select day..." /></SelectTrigger>
<SelectContent>{daysOfWeek.map(day => (<SelectItem key={day.value} value={day.value}>{day.label} ({DayOfWeekMap[day.value]})</SelectItem>))}</SelectContent>
</Select>
</div>
<div className="space-y-1.5">
<Label htmlFor="edit-horario-hora">Deadline Time (HH:MM)</Label>
<Input id="edit-horario-hora" type="time" value={hora} onChange={(e) => setHora(e.target.value)} disabled={isProcessing} step="900" />
</div>
</div>
{/* Primary Switch */}
<div className="flex items-center space-x-2 pt-2">
<Switch id="edit-horario-primary" checked={isPrimary} onCheckedChange={setIsPrimary} disabled={isProcessing} />
<Label htmlFor="edit-horario-primary">Primary Schedule?</Label>
</div>
<DialogFooter>
<DialogClose asChild><Button type="button" variant="outline" disabled={isProcessing}>Cancel</Button></DialogClose>
<Button type="submit" disabled={isProcessing}>{isProcessing ? 'Saving...' : 'Save Changes'}</Button>
</DialogFooter>
</form>
) : ( <p>Loading schedule data...</p> )}
</DialogContent>
</Dialog>
);
};

// Removed EditTiempoDialog Component

const EditComedorDialog: React.FC<EditComedorDialogProps> = ({
isOpen, onOpenChange, comedor, nombre, setNombre, descripcion, setDescripcion, isProcessing, onSubmit
}) => {
return (
<Dialog open={isOpen} onOpenChange={onOpenChange}>
<DialogContent className="sm:max-w-[500px]">
<DialogHeader>
<DialogTitle>Edit Dining Hall: {comedor?.nombre}</DialogTitle>
<DialogDescription>Modify the details for this dining hall.</DialogDescription>
</DialogHeader>
{comedor ? (
<form onSubmit={onSubmit} className="space-y-4 py-4">
{/* Name Input */}
<div className="space-y-1.5">
<Label htmlFor="edit-comedor-nombre">Dining Hall Name</Label>
<Input id="edit-comedor-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} disabled={isProcessing}/>
</div>
{/* Description (Optional) */}
<div className="space-y-1.5">
<Label htmlFor="edit-comedor-descripcion">Description (Optional)</Label>
<Textarea id="edit-comedor-descripcion" placeholder="Enter any relevant details..." value={descripcion} onChange={(e) => setDescripcion(e.target.value)} disabled={isProcessing} rows={3} />
</div>
<DialogFooter>
<DialogClose asChild><Button type="button" variant="outline" disabled={isProcessing}>Cancel</Button></DialogClose>
<Button type="submit" disabled={isProcessing}>{isProcessing ? 'Saving...' : 'Save Changes'}</Button>
</DialogFooter>
</form>
) : ( <p>Loading dining hall data...</p> )}
</DialogContent>
</Dialog>
);
};
