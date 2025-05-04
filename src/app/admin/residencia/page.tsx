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
import { Checkbox } from "@/components/ui/checkbox"; // *** NEW: Import Checkbox ***

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
    orderBy, // Keep orderBy
    deleteDoc,
    updateDoc
} from 'firebase/firestore';

// Import ALL necessary types
import {
  Residencia,
  HorarioSolicitudComida, HorarioSolicitudComidaId, // Added ID type
  TiempoComida, TiempoComidaId,                 // Added ID type
  AlternativaTiempoComida,
  Comedor, ComedorId,                           // Added ID type
  Dieta,
  ResidenciaId,
  DayOfWeekKey, DayOfWeekMap,
  TipoAlternativa,
  TipoAccesoAlternativa
} from '@/models/firestore';

const daysOfWeek: { label: string; value: DayOfWeekKey }[] = [
    // ... (definition remains the same)
    { label: 'Monday', value: 'lunes' }, { label: 'Tuesday', value: 'martes' }, { label: 'Wednesday', value: 'miercoles' }, { label: 'Thursday', value: 'jueves' }, { label: 'Friday', value: 'viernes' }, { label: 'Saturday', value: 'sabado' }, { label: 'Sunday', value: 'domingo' },
] as const;
const orderedDaysOfWeek: DayOfWeekKey[] = daysOfWeek.map(d => d.value);

// Helper sort functions
const sortHorarios = (horarios: HorarioSolicitudComida[]): HorarioSolicitudComida[] => {
    // ... (implementation remains the same)
    return [...horarios].sort((a, b) => {
        const dayAIndex = orderedDaysOfWeek.indexOf(a.dia); const dayBIndex = orderedDaysOfWeek.indexOf(b.dia);
        if (dayAIndex !== dayBIndex) { return dayAIndex - dayBIndex; }
        return a.horaSolicitud.localeCompare(b.horaSolicitud);
    });
};
const sortTiempos = (tiempos: TiempoComida[]): TiempoComida[] => {
    return [...tiempos].sort((a, b) => {
        const dayAIndex = orderedDaysOfWeek.indexOf(a.dia);
        const dayBIndex = orderedDaysOfWeek.indexOf(b.dia);
        if (dayAIndex !== dayBIndex) {
            return dayAIndex - dayBIndex; // Sort by day first
        }
        if (a.ordenGrupo !== b.ordenGrupo) {
            return a.ordenGrupo - b.ordenGrupo; // Then by group order
        }
        return a.nombre.localeCompare(b.nombre); // Finally by name
    });
};
const sortComedores = (comedores: Comedor[]): Comedor[] => {
    return [...comedores].sort((a, b) => a.nombre.localeCompare(b.nombre));
};

// *** NEW: Helper function to sort Alternativas (example: by TiempoComida, then name) ***
const sortAlternativas = (alternativas: AlternativaTiempoComida[], tiempos: TiempoComida[]): AlternativaTiempoComida[] => {
     // Create a map for quick TiempoComida lookup and sorting info
    const tiempoSortMap = new Map(tiempos.map((t, index) => [t.id, { diaIndex: orderedDaysOfWeek.indexOf(t.dia), grupoOrden: t.ordenGrupo, nombre: t.nombre }]));

    return [...alternativas].sort((a, b) => {
        const tiempoA = tiempoSortMap.get(a.tiempoComidaId);
        const tiempoB = tiempoSortMap.get(b.tiempoComidaId);

        // Handle cases where tiempo might not be found (shouldn't happen ideally)
        if (!tiempoA && !tiempoB) return 0;
        if (!tiempoA) return 1;
        if (!tiempoB) return -1;

        // Sort by day index
        if (tiempoA.diaIndex !== tiempoB.diaIndex) {
            return tiempoA.diaIndex - tiempoB.diaIndex;
        }
        // Sort by group order
        if (tiempoA.grupoOrden !== tiempoB.grupoOrden) {
            return tiempoA.grupoOrden - tiempoB.grupoOrden;
        }
         // Sort by tiempo name
        if (tiempoA.nombre !== tiempoB.nombre) {
            return tiempoA.nombre.localeCompare(tiempoB.nombre);
        }
        // Finally, sort by alternativa name
        return a.nombre.localeCompare(b.nombre);
    });
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

  // --- State: Modal - TiemposComida ---
  const [modalTiempos, setModalTiempos] = useState<TiempoComida[]>([]);
  const [newTiempoNombre, setNewTiempoNombre] = useState('');
  const [newTiempoDia, setNewTiempoDia] = useState<DayOfWeekKey | ''>('');
  const [newTiempoGrupoNombre, setNewTiempoGrupoNombre] = useState('');
  const [newTiempoGrupoOrden, setNewTiempoGrupoOrden] = useState<number>(1); // Default order
  const [newTiempoHoraEstimada, setNewTiempoHoraEstimada] = useState(''); // Optional, HH:MM
  const [isProcessingNewTiempo, setIsProcessingNewTiempo] = useState(false);

  // --- State: Modal - Comedores ---
  const [modalComedores, setModalComedores] = useState<Comedor[]>([]);
  const [newComedorNombre, setNewComedorNombre] = useState('');
  const [newComedorDescripcion, setNewComedorDescripcion] = useState(''); // Optional
  const [isProcessingNewComedor, setIsProcessingNewComedor] = useState(false);


  // *** NEW: State: Modal - Alternativas ***
  const [modalAlternativas, setModalAlternativas] = useState<AlternativaTiempoComida[]>([]);
  const [newAlternativaNombre, setNewAlternativaNombre] = useState('');
  const [newAlternativaTipo, setNewAlternativaTipo] = useState<TipoAlternativa | ''>('');
  const [newAlternativaTiempoId, setNewAlternativaTiempoId] = useState<TiempoComidaId | ''>('');
  const [newAlternativaHorarioId, setNewAlternativaHorarioId] = useState<HorarioSolicitudComidaId | ''>('');
  const [newAlternativaComedorId, setNewAlternativaComedorId] = useState<ComedorId | ''>(''); // Only if tipo === 'comedor'
  const [newAlternativaTipoAcceso, setNewAlternativaTipoAcceso] = useState<TipoAccesoAlternativa>('abierto');
  const [newAlternativaRequiereAprobacion, setNewAlternativaRequiereAprobacion] = useState(false);
  const [newAlternativaVentanaInicio, setNewAlternativaVentanaInicio] = useState(''); // HH:MM
  const [newAlternativaVentanaFin, setNewAlternativaVentanaFin] = useState(''); // HH:MM
  const [newAlternativaIsActive, setNewAlternativaIsActive] = useState(true);
  const [isProcessingNewAlternativa, setIsProcessingNewAlternativa] = useState(false);
  // Note: iniciaDiaAnterior, terminaDiaSiguiente are omitted for simplicity, add if needed

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
        toast({ title: "Success", description: `Residence "${newResidenceName}" and initial settings created successfully.` });

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

  // *** UPDATED: fetchModalData to include Alternativas ***
  const fetchModalData = useCallback(async (residenciaId: ResidenciaId) => {
    if (!residenciaId) {
        console.log("fetchModalData: No residenciaId provided."); // Log if ID is missing
        return;
    }
    console.log(`fetchModalData: Starting for residenceId: ${residenciaId}`); // Log start
    setIsLoadingModalData(true);
    setErrorModalData(null);
    // Clear all modal data
    setModalHorarios([]); setModalTiempos([]); setModalComedores([]); setModalAlternativas([]);

    let fetchedTiempos: TiempoComida[] = [];

    try {
        console.log("fetchModalData: Fetching Horarios..."); // Log before fetch
        // Fetch Horarios
        const horariosQuery = query(collection(db, 'horariosSolicitudComida'), where("residenciaId", "==", residenciaId));
        const horariosSnapshot = await getDocs(horariosQuery);
        let fetchedHorarios: HorarioSolicitudComida[] = horariosSnapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as Omit<HorarioSolicitudComida, 'id'>) }));
        console.log(`fetchModalData: Fetched ${fetchedHorarios.length} Horarios.`); // Log count
        setModalHorarios(sortHorarios(fetchedHorarios));

        console.log("fetchModalData: Fetching TiemposComida..."); // Log before fetch
        // Fetch TiemposComida
        const tiemposQuery = query(collection(db, 'tiemposComida'), where("residenciaId", "==", residenciaId));
        const tiemposSnapshot = await getDocs(tiemposQuery);
        fetchedTiempos = tiemposSnapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as Omit<TiempoComida, 'id'>) }));
        console.log(`fetchModalData: Fetched ${fetchedTiempos.length} TiemposComida.`); // Log count
        setModalTiempos(sortTiempos(fetchedTiempos));

        console.log("fetchModalData: Fetching Comedores..."); // Log before fetch
        // Fetch Comedores
        const comedoresQuery = query(collection(db, 'comedores'), where("residenciaId", "==", residenciaId));
        const comedoresSnapshot = await getDocs(comedoresQuery);
        let fetchedComedores: Comedor[] = comedoresSnapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as Omit<Comedor, 'id'>) }));
        console.log(`fetchModalData: Fetched ${fetchedComedores.length} Comedores.`); // Log count
        setModalComedores(sortComedores(fetchedComedores));

        console.log("fetchModalData: Fetching Alternativas..."); // Log before fetch
        // Fetch Alternativas
        const alternativasQuery = query(collection(db, 'alternativasTiempoComida'), where("residenciaId", "==", residenciaId));
        const alternativasSnapshot = await getDocs(alternativasQuery);
        let fetchedAlternativas: AlternativaTiempoComida[] = alternativasSnapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as Omit<AlternativaTiempoComida, 'id'>) }));
        console.log(`fetchModalData: Fetched ${fetchedAlternativas.length} Alternativas.`); // Log count
        setModalAlternativas(sortAlternativas(fetchedAlternativas, fetchedTiempos));

        console.log("fetchModalData: Successfully fetched all data."); // Log success end of try

    } catch (error) {
        const errorMessage = `Failed to load settings data. ${error instanceof Error ? error.message : 'Unknown error'}`;
        console.error("Error fetching modal data: ", error); // Log the actual error
        setErrorModalData(errorMessage); // Set error state
        console.log("fetchModalData: Error occurred, setErrorModalData called."); // Log error handling
    } finally {
        setIsLoadingModalData(false); // Ensure loading is set to false
        console.log("fetchModalData: Finished, setIsLoadingModalData(false) called."); // Log finally block
    }
}, [toast]); // Keep dependency array minimal unless other state is needed



  const handleManageSettings = (residencia: Residencia) => {/*...*/};


  // *** UPDATED: handleModalOpenChange to reset Alternativa form state ***
   const handleModalOpenChange = (open: boolean) => {
        setIsModalOpen(open);
        if (!open) {
            // Reset common state
            setManagingResidenciaId(null); setManagingResidenciaNombre('');
            setIsLoadingModalData(false); setErrorModalData(null);
            // Reset data arrays
            setModalHorarios([]); setModalTiempos([]); setModalComedores([]); setModalAlternativas([]);
            // Reset forms
            setNewHorarioNombre(''); setNewHorarioDia(''); setNewHorarioHora(''); setNewHorarioIsPrimary(false); setNewHorarioIsActive(true); setIsProcessingNewHorario(false);
            setNewTiempoNombre(''); setNewTiempoDia(''); setNewTiempoGrupoNombre(''); setNewTiempoGrupoOrden(1); setNewTiempoHoraEstimada(''); setIsProcessingNewTiempo(false);
            setNewComedorNombre(''); setNewComedorDescripcion(''); setIsProcessingNewComedor(false);
            // Reset Alternativa form
            setNewAlternativaNombre(''); setNewAlternativaTipo(''); setNewAlternativaTiempoId(''); setNewAlternativaHorarioId(''); setNewAlternativaComedorId(''); setNewAlternativaTipoAcceso('abierto'); setNewAlternativaRequiereAprobacion(false); setNewAlternativaVentanaInicio(''); setNewAlternativaVentanaFin(''); setNewAlternativaIsActive(true); setIsProcessingNewAlternativa(false);

            console.log("Modal closed, state reset.");
        }
    };

    // --- Handlers for Horarios Tab ---
    const handleEditHorario = (horario: HorarioSolicitudComida) => {
        console.log("TODO: Edit Horario", horario);
        toast({ title: "TODO", description: `Implement edit for ${horario.nombre}` });
    };
    const handleDeleteHorario = async (horarioId: string, horarioNombre: string) => {
        if (!managingResidenciaId || !confirm(`Are you sure you want to delete the schedule "${horarioNombre}"?`)) return;
        try {
            await deleteDoc(doc(db, 'horariosSolicitudComida', horarioId));
            toast({ title: "Success", description: `Schedule "${horarioNombre}" deleted.` });
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
            toast({ title: "Success", description: `Schedule "${horario.nombre}" ${newStatus ? 'activated' : 'deactivated'}.` });
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
            toast({ title: "Success", description: `Schedule "${newHorarioNombre}" created.` });
            setNewHorarioNombre(''); setNewHorarioDia(''); setNewHorarioHora(''); setNewHorarioIsPrimary(false); setNewHorarioIsActive(true);
        } catch (error) {
            const errorMessage = `Failed to create schedule. ${error instanceof Error ? error.message : 'Unknown error'}`;
            console.error("Error creating horario: ", error);
            toast({ title: "Error", description: errorMessage, variant: "destructive" });
        } finally {
            setIsProcessingNewHorario(false);
        }
    };

    // --- Handlers for Tiempos Tab ---
    const handleCreateTiempo = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!managingResidenciaId) return;

        // Validation
        if (!newTiempoNombre.trim() || !newTiempoDia || !newTiempoGrupoNombre.trim() || newTiempoGrupoOrden <= 0) {
             toast({ title: "Validation Error", description: "Please fill in Meal Time Name, Day, Group Name, and a valid Group Order (> 0).", variant: "destructive" });
             return;
        }
        if (newTiempoHoraEstimada && !/^\d{2}:\d{2}$/.test(newTiempoHoraEstimada)) {
            toast({ title: "Validation Error", description: "Estimated Time must be in HH:MM format or left empty.", variant: "destructive" });
            return;
        }

        setIsProcessingNewTiempo(true);
        try {
            const newTiempoData: Omit<TiempoComida, 'id'> = {
                residenciaId: managingResidenciaId,
                nombre: newTiempoNombre.trim(),
                dia: newTiempoDia,
                nombreGrupo: newTiempoGrupoNombre.trim(),
                ordenGrupo: newTiempoGrupoOrden,
                horaEstimada: newTiempoHoraEstimada || undefined, // Store as undefined if empty
            };

            const tiempoRef = await addDoc(collection(db, 'tiemposComida'), newTiempoData);
            console.log("New TiempoComida created with ID:", tiempoRef.id);

            const newTiempoForState: TiempoComida = { id: tiempoRef.id, ...newTiempoData };

            // Add to local state and re-sort
            setModalTiempos(prev => sortTiempos([...prev, newTiempoForState]));

            toast({ title: "Success", description: `Meal Time "${newTiempoNombre}" created.` });

            // Reset form
            setNewTiempoNombre(''); setNewTiempoDia(''); setNewTiempoGrupoNombre(''); setNewTiempoGrupoOrden(1); setNewTiempoHoraEstimada('');

        } catch (error) {
             const errorMessage = `Failed to create Meal Time. ${error instanceof Error ? error.message : 'Unknown error'}`;
            console.error("Error creating TiempoComida: ", error);
            toast({ title: "Error", description: errorMessage, variant: "destructive" });
        } finally {
            setIsProcessingNewTiempo(false);
        }
    };

    const handleEditTiempo = (tiempo: TiempoComida) => {
        // TODO: Implement edit logic
        console.log("TODO: Edit TiempoComida", tiempo);
        toast({ title: "TODO", description: `Implement edit for ${tiempo.nombre}` });
    };

    const handleDeleteTiempo = async (tiempoId: string, tiempoNombre: string) => {
        // Placeholder - check dependencies (Alternativas) before deleting in real implementation
        if (!managingResidenciaId) return;
        if (!confirm(`Are you sure you want to delete the Meal Time "${tiempoNombre}"? Make sure no Meal Alternatives depend on it first.`)) {
            return;
        }
        console.log("Deleting TiempoComida", tiempoId);
        try {
            await deleteDoc(doc(db, 'tiemposComida', tiempoId));
            toast({ title: "Success", description: `Meal Time "${tiempoNombre}" deleted.` });
            // Update UI
            setModalTiempos(prev => prev.filter(t => t.id !== tiempoId));
        } catch (error) {
            const errorMessage = `Failed to delete Meal Time. ${error instanceof Error ? error.message : 'Unknown error'}`;
            console.error("Error deleting TiempoComida: ", error);
            toast({ title: "Error", description: errorMessage, variant: "destructive" });
        }
    };
    // --- Handlers for Comedores Tab ---
    const handleCreateComedor = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!managingResidenciaId) return;

        if (!newComedorNombre.trim()) {
             toast({ title: "Validation Error", description: "Dining Hall Name cannot be empty.", variant: "destructive" });
             return;
        }

        // Check for duplicate name (case-insensitive)
        if (modalComedores.some(c => c.nombre.toLowerCase() === newComedorNombre.trim().toLowerCase())) {
            toast({ title: "Validation Error", description: `A dining hall named "${newComedorNombre.trim()}" already exists.`, variant: "destructive" });
            return;
        }


        setIsProcessingNewComedor(true);
        try {
            const newComedorData: Omit<Comedor, 'id'> = {
                residenciaId: managingResidenciaId,
                nombre: newComedorNombre.trim(),
                descripcion: newComedorDescripcion.trim() || undefined, // Store as undefined if empty
            };

            const comedorRef = await addDoc(collection(db, 'comedores'), newComedorData);
            console.log("New Comedor created with ID:", comedorRef.id);

            const newComedorForState: Comedor = { id: comedorRef.id, ...newComedorData };

            // Add to local state and re-sort
            setModalComedores(prev => sortComedores([...prev, newComedorForState]));

            toast({ title: "Success", description: `Dining Hall "${newComedorNombre}" created.` });

            // Reset form
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
        // TODO: Implement edit logic
        console.log("TODO: Edit Comedor", comedor);
        toast({ title: "TODO", description: `Implement edit for ${comedor.nombre}` });
    };

    const handleDeleteComedor = async (comedorId: string, comedorNombre: string) => {
        // Placeholder - check dependencies (Alternativas) before deleting in real implementation
        if (!managingResidenciaId) return;
         if (!confirm(`Are you sure you want to delete the Dining Hall "${comedorNombre}"? Make sure no Meal Alternatives depend on it first.`)) {
            return;
        }
        console.log("Deleting Comedor", comedorId);
        try {
            await deleteDoc(doc(db, 'comedores', comedorId));
            toast({ title: "Success", description: `Dining Hall "${comedorNombre}" deleted.` });
            // Update UI
            setModalComedores(prev => prev.filter(c => c.id !== comedorId));
        } catch (error) {
            const errorMessage = `Failed to delete Dining Hall. ${error instanceof Error ? error.message : 'Unknown error'}`;
            console.error("Error deleting Comedor: ", error);
            toast({ title: "Error", description: errorMessage, variant: "destructive" });
        }
    };

    // *** NEW: Handlers for Alternativas Tab ***
    const handleCreateAlternativa = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!managingResidenciaId) return;

        // --- Validation ---
        if (!newAlternativaNombre.trim() || !newAlternativaTipo || !newAlternativaTiempoId || !newAlternativaHorarioId || !newAlternativaVentanaInicio || !newAlternativaVentanaFin) {
             toast({ title: "Validation Error", description: "Please fill in Name, Type, Meal Time, Request Schedule, Start Window, and End Window.", variant: "destructive" }); return;
        }
        if (newAlternativaTipo === 'comedor' && !newAlternativaComedorId) {
             toast({ title: "Validation Error", description: "Please select a Dining Hall for 'comedor' type alternatives.", variant: "destructive" }); return;
        }
         if (!/^\d{2}:\d{2}$/.test(newAlternativaVentanaInicio) || !/^\d{2}:\d{2}$/.test(newAlternativaVentanaFin)) {
             toast({ title: "Validation Error", description: "Window Start and End times must be in HH:MM format.", variant: "destructive" }); return;
         }
        // Add more validation if needed (e.g., window start < end)

        setIsProcessingNewAlternativa(true);
        try {
            const newAlternativaData: Omit<AlternativaTiempoComida, 'id'> = {
                residenciaId: managingResidenciaId,
                nombre: newAlternativaNombre.trim(),
                tipo: newAlternativaTipo,
                tiempoComidaId: newAlternativaTiempoId,
                horarioSolicitudComidaId: newAlternativaHorarioId,
                comedorId: newAlternativaTipo === 'comedor' ? newAlternativaComedorId : undefined,
                tipoAcceso: newAlternativaTipoAcceso,
                requiereAprobacion: newAlternativaRequiereAprobacion,
                ventanaInicio: newAlternativaVentanaInicio,
                ventanaFin: newAlternativaVentanaFin,
                isActive: newAlternativaIsActive,
                // Add other fields like isContingencia if implementing that logic
            };

            const alternativaRef = await addDoc(collection(db, 'alternativasTiempoComida'), newAlternativaData);
            console.log("New Alternativa created with ID:", alternativaRef.id);

            const newAlternativaForState: AlternativaTiempoComida = { id: alternativaRef.id, ...newAlternativaData };

            // Add to local state and re-sort (pass modalTiempos for sorting context)
            setModalAlternativas(prev => sortAlternativas([...prev, newAlternativaForState], modalTiempos));

            toast({ title: "Success", description: `Meal Alternative "${newAlternativaNombre}" created.` });

            // Reset form (partially, keep maybe tiempo/horario if user adds multiple?) - Simple reset for now:
             setNewAlternativaNombre(''); setNewAlternativaTipo(''); setNewAlternativaTiempoId(''); setNewAlternativaHorarioId(''); setNewAlternativaComedorId(''); setNewAlternativaTipoAcceso('abierto'); setNewAlternativaRequiereAprobacion(false); setNewAlternativaVentanaInicio(''); setNewAlternativaVentanaFin(''); setNewAlternativaIsActive(true);

        } catch (error) {
             const errorMessage = `Failed to create Meal Alternative. ${error instanceof Error ? error.message : 'Unknown error'}`;
            console.error("Error creating Alternativa: ", error);
            toast({ title: "Error", description: errorMessage, variant: "destructive" });
        } finally {
            setIsProcessingNewAlternativa(false);
        }
    };

    const handleEditAlternativa = (alternativa: AlternativaTiempoComida) => {
        // TODO: Implement edit logic
        console.log("TODO: Edit Alternativa", alternativa);
        toast({ title: "TODO", description: `Implement edit for ${alternativa.nombre}` });
    };

    const handleDeleteAlternativa = async (alternativaId: string, alternativaNombre: string) => {
        // Placeholder - check dependencies (Elecciones, Semanario) before deleting in real implementation
        if (!managingResidenciaId) return;
         if (!confirm(`Are you sure you want to delete the Meal Alternative "${alternativaNombre}"? This cannot be undone and might affect existing choices.`)) {
            return;
        }
        console.log("Deleting Alternativa", alternativaId);
        try {
            await deleteDoc(doc(db, 'alternativasTiempoComida', alternativaId));
            toast({ title: "Success", description: `Meal Alternative "${alternativaNombre}" deleted.` });
            // Update UI
            setModalAlternativas(prev => prev.filter(a => a.id !== alternativaId));
        } catch (error) {
            const errorMessage = `Failed to delete Meal Alternative. ${error instanceof Error ? error.message : 'Unknown error'}`;
            console.error("Error deleting Alternativa: ", error);
            toast({ title: "Error", description: errorMessage, variant: "destructive" });
        }
    };

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
                                      <div className="space-y-2"> <Label>Primary Meal Request Submission Times</Label> <CardDescription>Set the main deadline time (HH:MM) for each day's meal requests.</CardDescription> <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"> {daysOfWeek.map(day => (<div key={day.value} className="grid gap-2"> <Label htmlFor={`time-${day.value}`}>{day.label}</Label> <Input id={`time-${day.value}`} type="time" value={newSubmissionTimes[day.value] || ''} onChange={(e) => handleTimeChange(day.value, e.target.value)} disabled={isProcessingCreate} step="900" /> </div>))} </div> </div>
                                      <div className="space-y-4"> <Label>Initial Dining Halls (Comedores)</Label> <CardDescription>Add the names of the dining halls available at this residence.</CardDescription> <div className="flex items-center space-x-2"> <div className="grid flex-1 gap-2"> <Label htmlFor="new-comedor-name" className="sr-only">New Dining Hall Name</Label> <Input id="new-comedor-name" placeholder="e.g., Comedor Principal" value={currentComedorName} onChange={(e) => setCurrentComedorName(e.target.value)} disabled={isProcessingCreate} /> </div> <Button type="button" size="sm" onClick={handleAddComedor} disabled={isProcessingCreate || !currentComedorName.trim()}> <PlusCircle className="mr-2 h-4 w-4" /> Add Hall </Button> </div> {newComedores.length > 0 && (<div className="space-y-2 pt-2"> <Label className="text-xs font-medium text-muted-foreground">Added Halls:</Label> <ul className="space-y-1"> {newComedores.map((name) => (<li key={name} className="flex items-center justify-between p-1.5 border rounded-md bg-secondary/30 text-sm"> <span>{name}</span> <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => handleRemoveComedor(name)} disabled={isProcessingCreate} aria-label={`Remove ${name}`}> <X className="h-3 w-3" /> </Button> </li>))} </ul> </div>)} </div>
                                     <div className="pt-4"> <Button onClick={handleCreateResidence} disabled={isProcessingCreate}> {isProcessingCreate ? 'Creating...' : 'Create Residence'} </Button> </div>
                                 </>
                             )}
                         </CardContent>
                     </Card>
                 </TabsContent>
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
             </Tabs>
         </div>

         {/* --- MODAL CONTENT --- */}
         <DialogContent className="sm:max-w-[600px] md:max-w-[800px] lg:max-w-[1000px] max-h-[90vh] flex flex-col">
            <DialogHeader>
                <DialogTitle>Manage Settings for: {managingResidenciaNombre || '...'}</DialogTitle>
                <DialogDescription> Configure meal settings... </DialogDescription>
            </DialogHeader>

            {/* Modal Tabs Container */}
            <div className="py-4 flex-grow overflow-y-auto">
                <Tabs defaultValue="horarios" className="w-full">
                   <TabsList className="mb-4">
                       {/* ... Tab Triggers ... */}
                       <TabsTrigger value="horarios">Request Schedules</TabsTrigger>
                       <TabsTrigger value="tiempos">Meal Times</TabsTrigger>
                       <TabsTrigger value="comedores">Dining Halls</TabsTrigger>
                       <TabsTrigger value="alternativas">Meal Alternatives</TabsTrigger>
                   </TabsList>

                   {/* --- Horarios Tab Content --- */}
                   <TabsContent value="comedores">
                        <Card>
                            <CardHeader>
                                <CardTitle>Dining Halls</CardTitle>
                                <CardDescription>Manage the dining halls available at the residence.</CardDescription>
                            </CardHeader>
                            <CardContent>
                               <p className='text-muted-foreground'>TODO: Fetch and display Comedor data here.</p>
                               {/* Add form for creating/editing Comedor */}
                            </CardContent>
                       </Card>
                   </TabsContent>

                   {/* --- Tiempos Tab Content --- */}
                   <TabsContent value="tiempos">
                       <Card>
                            <CardHeader>
                                <CardTitle>Meal Times</CardTitle>
                                <CardDescription>Define the different meal times offered each day (e.g., Lunch Monday, Dinner Friday).</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {/* Accordion for Creating New Tiempo */}
                                <Accordion type="single" collapsible className="w-full">
                                    <AccordionItem value="new-tiempo">
                                        <AccordionTrigger>
                                            <Button variant="outline" size="sm">
                                                <PlusCircle className="mr-2 h-4 w-4" /> Add New Meal Time
                                            </Button>
                                        </AccordionTrigger>
                                        <AccordionContent>
                                            <form onSubmit={handleCreateTiempo} className="border p-4 rounded-md mt-2 space-y-4 bg-muted/30">
                                                 <h3 className="font-medium">New Meal Time Details</h3>
                                                 {/* Name */}
                                                 <div className="space-y-1.5">
                                                      <Label htmlFor="new-tiempo-nombre">Meal Time Name</Label>
                                                      <Input id="new-tiempo-nombre" placeholder="e.g., Almuerzo, Cena, Desayuno" value={newTiempoNombre} onChange={(e) => setNewTiempoNombre(e.target.value)} disabled={isProcessingNewTiempo} />
                                                 </div>
                                                 {/* Day and Estimated Time */}
                                                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                     <div className="space-y-1.5">
                                                          <Label htmlFor="new-tiempo-dia">Day of Week</Label>
                                                          <Select value={newTiempoDia} onValueChange={(value) => setNewTiempoDia(value as DayOfWeekKey)} disabled={isProcessingNewTiempo}>
                                                               <SelectTrigger id="new-tiempo-dia"><SelectValue placeholder="Select day..." /></SelectTrigger>
                                                               <SelectContent>{daysOfWeek.map(day => (<SelectItem key={day.value} value={day.value}>{day.label} ({DayOfWeekMap[day.value]})</SelectItem>))}</SelectContent>
                                                          </Select>
                                                     </div>
                                                     <div className="space-y-1.5">
                                                         <Label htmlFor="new-tiempo-hora">Estimated Time (Optional, HH:MM)</Label>
                                                         <Input id="new-tiempo-hora" type="time" value={newTiempoHoraEstimada} onChange={(e) => setNewTiempoHoraEstimada(e.target.value)} disabled={isProcessingNewTiempo} step="900" />
                                                     </div>
                                                 </div>
                                                 {/* Group Name and Order */}
                                                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                      <div className="space-y-1.5">
                                                           <Label htmlFor="new-tiempo-grupo-nombre">Group Name</Label>
                                                           <Input id="new-tiempo-grupo-nombre" placeholder="e.g., Comidas Principales, Desayunos" value={newTiempoGrupoNombre} onChange={(e) => setNewTiempoGrupoNombre(e.target.value)} disabled={isProcessingNewTiempo} />
                                                      </div>
                                                      <div className="space-y-1.5">
                                                          <Label htmlFor="new-tiempo-grupo-orden">Group Order</Label>
                                                          <Input id="new-tiempo-grupo-orden" type="number" min="1" step="1" value={newTiempoGrupoOrden} onChange={(e) => setNewTiempoGrupoOrden(parseInt(e.target.value, 10) || 1)} disabled={isProcessingNewTiempo} />
                                                      </div>
                                                 </div>
                                                 <Button type="submit" size="sm" disabled={isProcessingNewTiempo}>
                                                      {isProcessingNewTiempo ? 'Saving...' : 'Save New Meal Time'}
                                                 </Button>
                                            </form>
                                        </AccordionContent>
                                    </AccordionItem>
                                </Accordion>

                                {/* Existing Tiempos List */}
                                <div className='pt-4'>
                                    <h4 className="font-medium mb-2 text-sm text-muted-foreground">Existing Meal Times</h4>
                                    {isLoadingModalData ? (
                                        <Skeleton className="h-20 w-full" />
                                    ) : errorModalData ? ( // Check shared error state
                                        <p className="text-destructive">{errorModalData}</p>
                                    ) : modalTiempos.length === 0 ? (
                                        <p>No meal times found for this residence. Add one above.</p>
                                    ) : (
                                        <ul className="space-y-3">
                                            {modalTiempos.map((tiempo) => (
                                                <li key={tiempo.id} className="border p-3 rounded-md flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                                                    <div className="flex-grow space-y-1">
                                                        <p className="font-medium">{tiempo.nombre} ({DayOfWeekMap[tiempo.dia]})</p>
                                                        <p className="text-sm text-muted-foreground">
                                                            Group: <span className="font-semibold">{tiempo.nombreGrupo}</span> (Order: {tiempo.ordenGrupo})
                                                            {tiempo.horaEstimada && ` | Est. Time: ${tiempo.horaEstimada}`}
                                                        </p>
                                                    </div>
                                                    <div className="flex items-center gap-2 flex-shrink-0 mt-2 sm:mt-0">
                                                        <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => handleEditTiempo(tiempo)}>
                                                            <Pencil className="h-4 w-4" /> <span className="sr-only">Edit</span>
                                                        </Button>
                                                        <Button variant="destructive" size="icon" className="h-7 w-7" onClick={() => handleDeleteTiempo(tiempo.id, tiempo.nombre)}>
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
                                        <AccordionTrigger>
                                            <Button variant="outline" size="sm">
                                                <PlusCircle className="mr-2 h-4 w-4" /> Add New Dining Hall
                                            </Button>
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

                   {/* --- Alternativas Tab --- */}
                   <TabsContent value="alternativas">
                       <Card>
                            <CardHeader>
                                <CardTitle>Meal Alternatives</CardTitle>
                                <CardDescription>Define the specific meal options available for each Meal Time.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {/* Accordion for Creating New Alternativa */}
                                <Accordion type="single" collapsible className="w-full">
                                    <AccordionItem value="new-alternativa">
                                        <AccordionTrigger>
                                            <Button variant="outline" size="sm" disabled={modalTiempos.length === 0 || modalHorarios.length === 0}>
                                                <PlusCircle className="mr-2 h-4 w-4" /> Add New Meal Alternative
                                            </Button>
                                             {(modalTiempos.length === 0 || modalHorarios.length === 0) && (
                                                <p className="text-xs text-destructive pl-2">Requires at least one Meal Time and Request Schedule to exist.</p>
                                            )}
                                        </AccordionTrigger>
                                        <AccordionContent>
                                            <form onSubmit={handleCreateAlternativa} className="border p-4 rounded-md mt-2 space-y-4 bg-muted/30">
                                                <h3 className="font-medium">New Meal Alternative Details</h3>

                                                {/* Name */}
                                                <div className="space-y-1.5">
                                                    <Label htmlFor="new-alt-nombre">Alternative Name</Label>
                                                    <Input id="new-alt-nombre" placeholder="e.g., Menú Normal, Vegetariano, Para Llevar" value={newAlternativaNombre} onChange={(e) => setNewAlternativaNombre(e.target.value)} disabled={isProcessingNewAlternativa} />
                                                </div>

                                                {/* Type and Comedor (Conditional) */}
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                    <div className="space-y-1.5">
                                                        <Label htmlFor="new-alt-tipo">Type</Label>
                                                        <Select value={newAlternativaTipo} onValueChange={(value) => { setNewAlternativaTipo(value as TipoAlternativa); if (value !== 'comedor') setNewAlternativaComedorId(''); }} disabled={isProcessingNewAlternativa}>
                                                              <SelectTrigger id="new-alt-tipo"><SelectValue placeholder="Select type..." /></SelectTrigger>
                                                              <SelectContent>
                                                                  <SelectItem value="comedor">Comedor (Dining Hall)</SelectItem>
                                                                  <SelectItem value="paraLlevar">Para Llevar (Takeaway)</SelectItem>
                                                              </SelectContent>
                                                        </Select>
                                                    </div>
                                                    {/* Show Comedor select only if type is 'comedor' */}
                                                    {newAlternativaTipo === 'comedor' && (
                                                        <div className="space-y-1.5">
                                                            <Label htmlFor="new-alt-comedor">Dining Hall</Label>
                                                            <Select value={newAlternativaComedorId} onValueChange={(value) => setNewAlternativaComedorId(value as ComedorId)} disabled={isProcessingNewAlternativa || modalComedores.length === 0}>
                                                                  <SelectTrigger id="new-alt-comedor"><SelectValue placeholder="Select dining hall..." /></SelectTrigger>
                                                                  <SelectContent>
                                                                      {modalComedores.length === 0 && <SelectItem value="" disabled>No dining halls available</SelectItem>}
                                                                      {modalComedores.map(com => (<SelectItem key={com.id} value={com.id}>{com.nombre}</SelectItem>))}
                                                                  </SelectContent>
                                                            </Select>
                                                            {modalComedores.length === 0 && <p className="text-xs text-destructive">No dining halls defined for this residence.</p>}
                                                        </div>
                                                    )}
                                                </div>

                                                {/* TiempoComida and HorarioSolicitud */}
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                    <div className="space-y-1.5">
                                                          <Label htmlFor="new-alt-tiempo">Meal Time (Defines Day/Group)</Label>
                                                          <Select value={newAlternativaTiempoId} onValueChange={(value) => setNewAlternativaTiempoId(value as TiempoComidaId)} disabled={isProcessingNewAlternativa || modalTiempos.length === 0}>
                                                              <SelectTrigger id="new-alt-tiempo"><SelectValue placeholder="Select meal time..." /></SelectTrigger>
                                                              <SelectContent>
                                                                  {modalTiempos.length === 0 && <SelectItem value="" disabled>No meal times available</SelectItem>}
                                                                  {modalTiempos.map(t => (<SelectItem key={t.id} value={t.id}>{t.nombre} ({DayOfWeekMap[t.dia]})</SelectItem>))}
                                                              </SelectContent>
                                                          </Select>
                                                    </div>
                                                    <div className="space-y-1.5">
                                                        <Label htmlFor="new-alt-horario">Request Schedule (Defines Deadline)</Label>
                                                        <Select value={newAlternativaHorarioId} onValueChange={(value) => setNewAlternativaHorarioId(value as HorarioSolicitudComidaId)} disabled={isProcessingNewAlternativa || modalHorarios.length === 0}>
                                                              <SelectTrigger id="new-alt-horario"><SelectValue placeholder="Select request schedule..." /></SelectTrigger>
                                                              <SelectContent>
                                                                  {modalHorarios.length === 0 && <SelectItem value="" disabled>No schedules available</SelectItem>}
                                                                  {/* Only show active schedules */}
                                                                  {modalHorarios.filter(h => h.isActive).map(h => (<SelectItem key={h.id} value={h.id}>{h.nombre} ({DayOfWeekMap[h.dia]} {h.horaSolicitud})</SelectItem>))}
                                                              </SelectContent>
                                                        </Select>
                                                    </div>
                                                </div>

                                                {/* Access Type and Requires Approval */}
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                    <div className="space-y-1.5">
                                                        <Label htmlFor="new-alt-acceso">Access Type</Label>
                                                        <Select value={newAlternativaTipoAcceso} onValueChange={(value) => setNewAlternativaTipoAcceso(value as TipoAccesoAlternativa)} disabled={isProcessingNewAlternativa}>
                                                              <SelectTrigger id="new-alt-acceso"><SelectValue placeholder="Select access type..." /></SelectTrigger>
                                                              <SelectContent>
                                                                  <SelectItem value="abierto">Abierto (Open)</SelectItem>
                                                                  <SelectItem value="autorizado">Autorizado (Requires Approval)</SelectItem>
                                                                  <SelectItem value="cerrado">Cerrado (Closed)</SelectItem>
                                                              </SelectContent>
                                                        </Select>
                                                    </div>
                                                    <div className="flex items-center space-x-2 pt-6"> {/* Adjust padding for alignment */}
                                                        <Checkbox id="new-alt-aprobacion" checked={newAlternativaRequiereAprobacion} onCheckedChange={(checked) => setNewAlternativaRequiereAprobacion(Boolean(checked))} disabled={isProcessingNewAlternativa} />
                                                        <Label htmlFor="new-alt-aprobacion">Requires Director Approval?</Label>
                                                    </div>
                                                </div>

                                                {/* Window Start/End */}
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                    <div className="space-y-1.5">
                                                        <Label htmlFor="new-alt-ventana-inicio">Window Start (HH:MM)</Label>
                                                        <Input id="new-alt-ventana-inicio" type="time" value={newAlternativaVentanaInicio} onChange={(e) => setNewAlternativaVentanaInicio(e.target.value)} disabled={isProcessingNewAlternativa} step="900" />
                                                    </div>
                                                    <div className="space-y-1.5">
                                                        <Label htmlFor="new-alt-ventana-fin">Window End (HH:MM)</Label>
                                                        <Input id="new-alt-ventana-fin" type="time" value={newAlternativaVentanaFin} onChange={(e) => setNewAlternativaVentanaFin(e.target.value)} disabled={isProcessingNewAlternativa} step="900" />
                                                    </div>
                                                </div>

                                                {/* Active Switch */}
                                                <div className="flex items-center space-x-2">
                                                  <Switch id="new-alt-active" checked={newAlternativaIsActive} onCheckedChange={setNewAlternativaIsActive} disabled={isProcessingNewAlternativa} />
                                                  <Label htmlFor="new-alt-active">Active?</Label>
                                                </div>

                                                <Button type="submit" size="sm" disabled={isProcessingNewAlternativa}>
                                                    {isProcessingNewAlternativa ? 'Saving...' : 'Save New Alternative'}
                                                </Button>
                                            </form>
                                            </AccordionContent>

                                    </AccordionItem>
                                </Accordion>

                                {/* Existing Alternativas List */}
                                <div className='pt-4'>
                                    <h4 className="font-medium mb-2 text-sm text-muted-foreground">Existing Meal Alternatives</h4>
                                    {isLoadingModalData ? (
                                        <Skeleton className="h-20 w-full" />
                                    ) : errorModalData ? (
                                        <p className="text-destructive">{errorModalData}</p>
                                    ) : modalAlternativas.length === 0 ? (
                                        <p>No meal alternatives found for this residence. Add one above.</p>
                                    ) : (
                                        // Group alternatives by Meal Time (TiempoComida)
                                        Array.from(modalTiempos).sort((a, b) => { // Sort the meal times themselves first
                                            const dayAIndex = orderedDaysOfWeek.indexOf(a.dia); const dayBIndex = orderedDaysOfWeek.indexOf(b.dia);
                                            if (dayAIndex !== dayBIndex) return dayAIndex - dayBIndex;
                                            if (a.ordenGrupo !== b.ordenGrupo) return a.ordenGrupo - b.ordenGrupo;
                                            return a.nombre.localeCompare(b.nombre);
                                        }).map(tiempo => {
                                            // Filter alternatives for the current meal time
                                            const alternativasForTiempo = modalAlternativas.filter(alt => alt.tiempoComidaId === tiempo.id);
                                            if (alternativasForTiempo.length === 0) return null; // Don't render header if no alternatives for this time

                                            return (
                                                <div key={tiempo.id} className="mb-4">
                                                    <h5 className="font-semibold text-base mb-2 border-b pb-1">{tiempo.nombre} ({DayOfWeekMap[tiempo.dia]})</h5>
                                                    <ul className="space-y-3 pl-2">
                                                        {alternativasForTiempo.map((alt) => {
                                                            // Find associated data for display
                                                            const horario = modalHorarios.find(h => h.id === alt.horarioSolicitudComidaId);
                                                            const comedor = alt.comedorId ? modalComedores.find(c => c.id === alt.comedorId) : null;

                                                            return (
                                                                <li key={alt.id} className="border p-3 rounded-md flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 bg-background">
                                                                    <div className="flex-grow space-y-1">
                                                                        <p className="font-medium flex items-center gap-2">
                                                                            {alt.nombre}
                                                                            <Badge variant={alt.isActive ? "default" : "outline"}>{alt.isActive ? 'Active' : 'Inactive'}</Badge>
                                                                        </p>
                                                                        <p className="text-sm text-muted-foreground">
                                                                            Type: <span className="font-semibold">{alt.tipo === 'comedor' ? 'Comedor' : 'Takeaway'}</span>
                                                                            {comedor && ` @ ${comedor.nombre}`} |
                                                                            Access: <span className="font-semibold">{alt.tipoAcceso}</span> {alt.requiereAprobacion ? '(Approval Req.)' : ''}
                                                                        </p>
                                                                        <p className="text-sm text-muted-foreground">
                                                                            Window: <span className="font-semibold">{alt.ventanaInicio} - {alt.ventanaFin}</span> |
                                                                            Schedule: <span className="font-semibold">{horario?.nombre ?? 'N/A'}</span>
                                                                        </p>
                                                                    </div>
                                                                    <div className="flex items-center gap-2 flex-shrink-0 mt-2 sm:mt-0">
                                                                        {/* TODO: Add Toggle Active Button here if needed */}
                                                                        <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => handleEditAlternativa(alt)}>
                                                                            <Pencil className="h-4 w-4" /> <span className="sr-only">Edit</span>
                                                                        </Button>
                                                                        <Button variant="destructive" size="icon" className="h-7 w-7" onClick={() => handleDeleteAlternativa(alt.id, alt.nombre)}>
                                                                            <Trash2 className="h-4 w-4" /> <span className="sr-only">Delete</span>
                                                                        </Button>
                                                                    </div>
                                                                </li>
                                                            );
                                                        })}
                                                    </ul>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </CardContent>
                       </Card>
                   </TabsContent>

                </Tabs> {/* End Tabs component inside Dialog */}
            </div> {/* End flex-grow div */}

            <DialogFooter className="flex-shrink-0">
                {/* ... Close Button ... */}
                 <DialogClose asChild><Button type="button" variant="outline">Close</Button></DialogClose>
            </DialogFooter>
         </DialogContent> {/* End DialogContent */}
     </Dialog> // End Dialog component
   );
}
