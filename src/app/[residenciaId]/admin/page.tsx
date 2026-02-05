"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { auth, db } from '@/lib/firebase';
import {
  UserProfile,
  Residencia,
  Comedor,
  HorarioSolicitudComida,
  AlternativaTiempoComida,
  UserRole,
  DayOfWeekKey,
  DayOfWeekMap,
  CentroCosto,
  LogActionType,
  ClientLogWrite, 
  UserId,
  ResidenciaId
} from '../../../../shared/models/types';
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  orderBy,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  Timestamp,
  writeBatch
} from 'firebase/firestore';

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Loader2, AlertCircle, PlusCircle, Edit, Trash2, Building, Clock, Eye } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { writeClientLog, checkAndDisplayTimezoneWarning } from "@/lib/utils";
import { useActionState } from 'react';
import { comedorServerAction } from './comedorAction';
import { horarioServerAction } from './horarioAction';

// Helper for new Comedor
const getNewComedorDefaults = (residenciaId: string): Omit<Comedor, 'id'> => ({
    nombre: '',
    residenciaId: residenciaId,
    descripcion: '',
    capacidad: 0,
    centroCostoPorDefectoId: '',
});

// Helper for new HorarioSolicitudComida
const getNewHorarioDefaults = (residenciaId: string): Omit<HorarioSolicitudComida, 'id'> => ({
    nombre: '',
    residenciaId: residenciaId,
    dia: 'lunes',
    horaSolicitud: '12:00',
    isPrimary: false,
    isActive: true,
});


function ResidenciaHorariosComedoresPage() {
  const router = useRouter();
  // const searchParams = useSearchParams(); // For master to potentially get residenciaId from query
  const { toast } = useToast();
  const { user: authUser, loading: authFirebaseLoading, error: authFirebaseError } = useAuth();

  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState<boolean>(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  
  const [isAuthorizedForPage, setIsAuthorizedForPage] = useState<boolean>(false);
  const [canEdit, setCanEdit] = useState<boolean>(false); // True if admin of this residencia

  const [targetResidenciaId, setTargetResidenciaId] = useState<string | null>(null);
  const [residenciaDetails, setResidenciaDetails] = useState<Residencia | null>(null);
  const [loadingResidenciaDetails, setLoadingResidenciaDetails] = useState<boolean>(false);

  // Comedor States
  const [comedores, setComedores] = useState<Comedor[]>([]);
  const [isLoadingComedores, setIsLoadingComedores] = useState<boolean>(false);
  const [showComedorForm, setShowComedorForm] = useState<boolean>(false);
  const [currentComedor, setCurrentComedor] = useState<Partial<Comedor>>({});
  const [isEditingComedor, setIsEditingComedor] = useState<boolean>(false);
  const [formLoadingComedor, setFormLoadingComedor] = useState<boolean>(false);

  // HorarioSolicitudComida States
  const [horarios, setHorarios] = useState<HorarioSolicitudComida[]>([]);
  const [isLoadingHorarios, setIsLoadingHorarios] = useState<boolean>(false);
  const [showHorarioForm, setShowHorarioForm] = useState<boolean>(false);
  const [currentHorario, setCurrentHorario] = useState<Partial<HorarioSolicitudComida>>({});
  const [isEditingHorario, setIsEditingHorario] = useState<boolean>(false);
  const [formLoadingHorario, setFormLoadingHorario] = useState<boolean>(false);

  // ADDED: State for AlternativasTiempoComida for validation purposes
  const [alternativasParaValidacion, setAlternativasParaValidacion] = useState<AlternativaTiempoComida[]>([]);
  const [isLoadingAlternativas, setIsLoadingAlternativas] = useState<boolean>(false);

  // CentroCosto States for the current Residencia
  const [centrosCostoResidencia, setCentrosCostoResidencia] = useState<CentroCosto[]>([]);
  const [isLoadingCentrosCostoResidencia, setIsLoadingCentrosCostoResidencia] = useState<boolean>(false);

  // Server Action state for comedor form
  const [comedorState, comedorFormAction, isComedorFormPending] = useActionState(comedorServerAction, { result: null, error: null, isPending: false });

  // Server Action state for horario form
  const [horarioState, horarioFormAction, isHorarioFormPending] = useActionState(horarioServerAction, { result: null, error: null, isPending: false });

  useEffect(() => {
    if (horarioState.error) {
      console.error('Error from horarioAction:', horarioState.error);
      toast({ title: 'Error', description: (horarioState.error as Error).message || String(horarioState.error), variant: 'destructive' });
    }
    if (horarioState.result) {
      toast({ title: 'Éxito', description: horarioState.result.action === 'created' ? 'Horario creado' : 'Horario actualizado' });
      setShowHorarioForm(false);
      fetchHorarios();
    }
  }, [horarioState]);

  useEffect(() => {
    if (comedorState.error) {
      console.error('Error from comedorAction:', comedorState.error);
      toast({ title: 'Error', description: (comedorState.error as Error).message || String(comedorState.error), variant: 'destructive' });
    }
    if (comedorState.result) {
      // On success, close form and refresh list
      toast({ title: 'Éxito', description: comedorState.result.action === 'created' ? 'Comedor creado' : 'Comedor actualizado' });
      setShowComedorForm(false);
      fetchComedores();
    }
  }, [comedorState]);

  // ...
  const [timezoneWarningShown, setTimezoneWarningShown] = useState<boolean>(false); // To show warning only once

    // ... (isLoadingCentrosCostoResidencia state) ...

  // ADDED: Form Data State for Residencia Details
  const [residenciaFormData, setResidenciaFormData] = useState<Partial<Residencia>>({
    nombre: '',
    direccion: '',
    logoUrl: '',
    antelacionActividadesDefault: 0,
    textProfile: '',
    tipoResidencia: 'estudiantes', // Default value
    esquemaAdministracion: 'estricto', // Default value
    nombreTradicionalDesayuno: '',
    nombreTradicionalAlmuerzo: '',
    nombreTradicionalCena: '',
    nombreTradicionalLunes: '',
    nombreTradicionalMartes: '',
    nombreTradicionalMiercoles: '',
    nombreTradicionalJueves: '',
    nombreTradicionalViernes: '',
    nombreTradicionalSabado: '',
    nombreTradicionalDomingo: '',
    campoPersonalizado1_etiqueta: '',
    campoPersonalizado1_isActive: false,
    campoPersonalizado1_necesitaValidacion: false,
    campoPersonalizado1_regexValidacion: '',
    campoPersonalizado1_tamanoTexto: 'text',
    campoPersonalizado2_etiqueta: '',
    campoPersonalizado2_isActive: false,
    campoPersonalizado2_necesitaValidacion: false,
    campoPersonalizado2_regexValidacion: '',
    campoPersonalizado2_tamanoTexto: 'text',
    campoPersonalizado3_etiqueta: '',
    campoPersonalizado3_isActive: false,
    campoPersonalizado3_necesitaValidacion: false,
    campoPersonalizado3_regexValidacion: '',
    campoPersonalizado3_tamanoTexto: 'text',
    configuracionContabilidad: null,
    // centroCostoPorDefectoId will be handled as a separate field for now,
    // as it's part of Comedor, not directly Residencia in your current model.
    // If Residencia should have a *default* CentroCostoId, it needs to be added to Residencia interface first.
    // For now, we are adding the input to pick a default CC for the Residencia *itself*.
    // Let's assume you will add `defaultCentroCostoId?: CentroCostoId;` to your Residencia interface.
    // If so, add it here:
    // defaultCentroCostoId: '', 
  });
  const [isSavingResidencia, setIsSavingResidencia] = useState<boolean>(false);


  // --- useEffect: Handle Auth State & Fetch Profile ---
  useEffect(() => {
    if (authFirebaseLoading) {
      setProfileLoading(true);
      return;
    }
    if (authFirebaseError) {
      toast({ title: "Error de Autenticación", description: authFirebaseError.message, variant: "destructive" });
      setProfileLoading(false); setUserProfile(null); setProfileError(authFirebaseError.message);
      setIsAuthorizedForPage(false);
      return;
    }
    if (!authUser) {
      setProfileLoading(false); setUserProfile(null); setProfileError(null);
      setIsAuthorizedForPage(false);
      // Redirection handled by render logic or another effect
      return;
    }

    const userDocRef = doc(db, "users", authUser.uid);
    getDoc(userDocRef)
      .then((docSnap) => {
        if (docSnap.exists()) {
          const profile = docSnap.data() as UserProfile;
          setUserProfile(profile);
          setProfileError(null);
          
          const roles = profile.roles || [];
          const canAccess = roles.includes('master') || roles.includes('admin') || roles.includes('director');
          setIsAuthorizedForPage(canAccess);

          if (!canAccess) {
            toast({ title: "Acceso Denegado", description: "No tienes permisos (master, admin, o director).", variant: "destructive" });
            return;
          }

          // Determine targetResidenciaId and edit permissions
          if (roles.includes('admin')) {
            if (profile.residenciaId) {
              setTargetResidenciaId(profile.residenciaId);
              setCanEdit(true);
            } else {
              toast({ title: "Admin sin Residencia", description: "Tu perfil de admin no está asignado a una residencia.", variant: "default" });
              setIsAuthorizedForPage(false); // Or handle differently, e.g. show a message
            }
          } else if (roles.includes('director')) {
             if (profile.residenciaId) {
              setTargetResidenciaId(profile.residenciaId);
              setCanEdit(false); // Directors have read-only access here
            } else {
              toast({ title: "Director sin Residencia", description: "Tu perfil de director no está asignado a una residencia.", variant: "default" });
              setIsAuthorizedForPage(false);
            }
          } else if (roles.includes('master')) {
            setCanEdit(false); // Master users have read-only access on this specific page.
            // For master users, targetResidenciaId would ideally come from query params or a selection.
            // const residenciaQueryParam = searchParams.get('residenciaId');
            // if (residenciaQueryParam) {
            //   setTargetResidenciaId(residenciaQueryParam);
            // } else {
            //   // No specific residenciaId for master, they might need to select one.
            //   // For now, they won't see data unless it's provided.
            //   toast({title: "Master User", description: "Selecciona una residencia para ver sus detalles.", variant: "default"})
            // }
            // For this iteration, if a master has a residenciaId in their profile (unusual), use it.
            if (profile.residenciaId) {
                setTargetResidenciaId(profile.residenciaId);
            } else {
                toast({ title: "Seleccionar Residencia", description: "Como master, necesitas especificar una residencia.", variant: "default"});
                // setIsAuthorizedForPage(false); // Or rather, show a selector or message
            }
          }
        } else {
          setUserProfile(null); setProfileError("Perfil de usuario no encontrado.");
          toast({ title: "Error de Perfil", description: "No se encontró tu perfil de usuario.", variant: "destructive" });
          setIsAuthorizedForPage(false);
        }
      })
      .catch((error) => {
        setUserProfile(null); setProfileError(`Error al cargar el perfil: ${error.message}`);
        toast({ title: "Error al Cargar Perfil", description: `No se pudo cargar tu perfil: ${error.message}`, variant: "destructive" });
        setIsAuthorizedForPage(false);
      })
      .finally(() => {
        setProfileLoading(false);
      });
  }, [authUser, authFirebaseLoading, authFirebaseError, toast]); // removed: router, searchParams

  // --- Redirect if not authenticated after loading ---
  useEffect(() => {
      if (!authFirebaseLoading && !profileLoading && !authUser) {
          router.replace('/');
      }
  }, [authFirebaseLoading, profileLoading, authUser, router]);

  // --- Fetch Residencia Details ---
  useEffect(() => {
    if (targetResidenciaId) {
      setLoadingResidenciaDetails(true);
      const residenciaRef = doc(db, 'residencias', targetResidenciaId);
      getDoc(residenciaRef).then(docSnap => {
        if (docSnap.exists()) {
          setResidenciaDetails({ id: docSnap.id, ...docSnap.data() } as Residencia);
        } else {
          setResidenciaDetails(null);
          toast({ title: "Error", description: `No se encontró la residencia con ID: ${targetResidenciaId}`, variant: "destructive" });
          // Potentially clear targetResidenciaId or redirect if critical
        }
      }).catch(error => {
        console.error("Error fetching residencia details:", error);
        toast({ title: "Error", description: "No se pudieron cargar los detalles de la residencia.", variant: "destructive" });
        setResidenciaDetails(null);
      }).finally(() => {
        setLoadingResidenciaDetails(false);
      });
    } else {
      setResidenciaDetails(null); // Clear if no target ID
    }
  }, [targetResidenciaId, toast]);

  // --- Fetch Comedores ---
  const fetchComedores = useCallback(async () => {
    if (!targetResidenciaId) {
        setComedores([]);
        return;
    }
    setIsLoadingComedores(true);
    try {
        const q = query(collection(db, 'comedores'), where('residenciaId', '==', targetResidenciaId), orderBy('nombre'));
        const snapshot = await getDocs(q);
        setComedores(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Comedor)));
    } catch (error) {
        console.error("Error fetching comedores:", error);
        toast({ title: "Error", description: "No se pudieron cargar los comedores.", variant: "destructive"});
    } finally {
        setIsLoadingComedores(false);
    }
  }, [targetResidenciaId, toast]);

  // --- Fetch Horarios ---
  const fetchHorarios = useCallback(async () => {
    if (!targetResidenciaId) {
        setHorarios([]);
        return;
    }
    setIsLoadingHorarios(true);
    try {
        const q = query(collection(db, 'horariosSolicitudComida'), where('residenciaId', '==', targetResidenciaId), orderBy('dia'), orderBy('horaSolicitud'));
        const snapshot = await getDocs(q);
        setHorarios(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as HorarioSolicitudComida)));
    } catch (error) {
        console.error("Error fetching horarios:", error);
        toast({ title: "Error", description: "No se pudieron cargar los horarios.", variant: "destructive"});
    } finally {
        setIsLoadingHorarios(false);
    }
  }, [targetResidenciaId, toast]);

  // ADDED: Fetch Centros de Costo for the current Residencia
  const fetchCentrosCostoForCurrentResidencia = useCallback(async () => {
    if (!targetResidenciaId) {
        setCentrosCostoResidencia([]);
        return;
    }
    setIsLoadingCentrosCostoResidencia(true);
    try {
        const q = query(
            collection(db, 'centrosCosto'), 
            where('residenciaId', '==', targetResidenciaId), 
            where('isActive', '==', true), // Typically, you'd only want active ones for selection
            orderBy('nombre')
        );
        const snapshot = await getDocs(q);
        setCentrosCostoResidencia(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as CentroCosto)));
        console.log("Fetched Centros de Costo for Residencia:", snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (error) {
        console.error("Error fetching Centros de Costo for Residencia:", error);
        toast({ title: "Error", description: "No se pudieron cargar los centros de costo de la residencia.", variant: "destructive"});
        setCentrosCostoResidencia([]);
    } finally {
        setIsLoadingCentrosCostoResidencia(false);
    }
  }, [targetResidenciaId, toast]);

  // --- Fetch AlternativasTiempoComida for Validation ---
  const fetchAlternativasParaValidacion = useCallback(async () => {
    if (!targetResidenciaId) {
        setAlternativasParaValidacion([]);
        return;
    }
    setIsLoadingAlternativas(true);
    try {
        const q = query(
            collection(db, 'alternativasTiempoComida'), // Assuming this is your collection name
            where('residenciaId', '==', targetResidenciaId)
        );
        const snapshot = await getDocs(q);
        setAlternativasParaValidacion(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as AlternativaTiempoComida)));
    } catch (error) {
        console.error("Error fetching alternativasTiempoComida for validation:", error);
        toast({ title: "Error de Carga", description: "No se pudieron cargar datos necesarios para validaciones (alternativas).", variant: "destructive" });
        setAlternativasParaValidacion([]);
    } finally {
        setIsLoadingAlternativas(false);
    }
  }, [targetResidenciaId, toast]);

  useEffect(() => {
    if (targetResidenciaId && isAuthorizedForPage) {
      fetchComedores();
      fetchHorarios();
      fetchCentrosCostoForCurrentResidencia();
      fetchAlternativasParaValidacion();
    } else {
      setComedores([]);
      setHorarios([]);
      setCentrosCostoResidencia([]);
      setAlternativasParaValidacion([]); 
    }
  }, [
    targetResidenciaId, 
    isAuthorizedForPage, 
    fetchComedores, 
    fetchHorarios, 
    fetchCentrosCostoForCurrentResidencia, 
    fetchAlternativasParaValidacion // <--- ADD TO DEPENDENCY ARRAY
  ]);

  // --- useEffect: Check for Timezone Differences ---
  useEffect(() => {
    if (residenciaDetails?.zonaHoraria && !timezoneWarningShown) {
      const warningWasDisplayed = checkAndDisplayTimezoneWarning(
        residenciaDetails.zonaHoraria,
        toast // Pass the toast function from useToast()
      );
      if (warningWasDisplayed) {
        setTimezoneWarningShown(true); // Update state to prevent showing warning again
      }
    }
  }, [residenciaDetails, timezoneWarningShown, toast]); // Keep toast in dependencies

    // --- Comedor Form Handlers ---
  const handleInputChangeComedor = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setCurrentComedor(prev => ({
      ...prev,
      [name]: type === 'number' ? parseInt(value, 10) || 0 : value,
    }));
  };

  const handleCreateNewComedor = () => {
    if (!targetResidenciaId) return;
    setCurrentComedor(getNewComedorDefaults(targetResidenciaId));
    setIsEditingComedor(false);
    setShowComedorForm(true);
  };

  const handleEditComedor = (comedor: Comedor) => {
    setCurrentComedor(comedor);
    setIsEditingComedor(true);
    setShowComedorForm(true);
  };

  const handleSubmitComedorForm = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!targetResidenciaId || !currentComedor.nombre) {
      toast({ title: "Error", description: "El nombre del comedor es obligatorio.", variant: "destructive" });
      return;
    }
    if (!canEdit) {
        toast({ title: "Acción no permitida", description: "No tienes permisos para esta acción.", variant: "destructive"});
        return;
    }

    setFormLoadingComedor(true);
    try {
      if (isEditingComedor && currentComedor.id) {
        const comedorDocRef = doc(db, 'comedores', currentComedor.id); // CORRECTED: comedorDocRef
        const { id, residenciaId, ...dataFromState } = currentComedor; // Exclude residenciaId if it's in currentComedor but not needed for update directly
        const dataToUpdate = {
            ...dataFromState,
            nombre: currentComedor.nombre!.trim(), // Ensure nombre is trimmed
            // Ensure residenciaId is the correct targetResidenciaId, though it shouldn't change for an existing comedor
            residenciaId: targetResidenciaId, 
            centroCostoPorDefectoId: currentComedor.centroCostoPorDefectoId || null,
        };
        await updateDoc(comedorDocRef, dataToUpdate); // CORRECTED: comedorDocRef
        toast({ title: "Comedor Actualizado", description: `Comedor '${currentComedor.nombre}' actualizado.` });
      } else {
        // Logic for creating a new comedor
        const dataToCreate = { 
            nombre: currentComedor.nombre!.trim(),
            residenciaId: targetResidenciaId, // Ensure this is set
            descripcion: currentComedor.descripcion || '',
            capacidad: currentComedor.capacidad || 0,
            centroCostoPorDefectoId: currentComedor.centroCostoPorDefectoId || null,
        };
        // delete dataToCreate.id; // Not needed if currentComedor for new doesn't have id
        await addDoc(collection(db, 'comedores'), dataToCreate);
        toast({ title: "Comedor Creado", description: `Comedor '${currentComedor.nombre}' creado.` });
      }
      setShowComedorForm(false);
      fetchComedores(); // Refresh list
    } catch (error) {
      console.error("Error saving comedor:", error);
      toast({ title: "Error", description: `No se pudo guardar el comedor. ${error instanceof Error ? error.message : ''}`, variant: "destructive" });
    } finally {
      setFormLoadingComedor(false);
    }
  };

  const handleDeleteComedor = async (comedorId: string, comedorName: string) => {
    if (!canEdit || !targetResidenciaId) {
        toast({ title: "Acción no permitida", description: "No tienes permisos para eliminar o falta información de la residencia.", variant: "destructive"});
        return;
    }

    setFormLoadingComedor(true);
    try {
      // Validation: Check if Comedor is used in any active AlternativaTiempoComida
      const alternativasQuery = query(
        collection(db, 'alternativasTiempoComida'), // Assuming this is your collection name
        where('residenciaId', '==', targetResidenciaId),
        where('comedorId', '==', comedorId),
        where('isActive', '==', true)
      );

      const alternativasSnapshot = await getDocs(alternativasQuery);

      if (!alternativasSnapshot.empty) {
        toast({
          title: "Eliminación Bloqueada",
          description: `El comedor '${comedorName}' no puede ser eliminado porque está siendo utilizado en ${alternativasSnapshot.size} alternativa(s) de comida activa(s). Por favor, desactiva o reasigna estas alternativas primero.`,
          variant: "destructive",
          duration: 7000,
        });
        setFormLoadingComedor(false);
        return;
      }

      // Proceed with deletion if not used
      await deleteDoc(doc(db, 'comedores', comedorId));
      toast({ title: "Comedor Eliminado", description: `Comedor '${comedorName}' eliminado.` });
      fetchComedores(); 
      if (currentComedor.id === comedorId) {
        setShowComedorForm(false);
      }
    } catch (error) {
      console.error("Error deleting comedor:", error);
      toast({ title: "Error", description: `No se pudo eliminar el comedor. ${error instanceof Error ? error.message : ''}`, variant: "destructive" });
    } finally {
      setFormLoadingComedor(false);
    }
  };

  // --- HorarioSolicitudComida Form Handlers ---
  const handleInputChangeHorario = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
        setCurrentHorario(prev => ({ ...prev, [name]: (e.target as HTMLInputElement).checked }));
    } else {
        setCurrentHorario(prev => ({ ...prev, [name]: value }));
    }
  };

  // Specific handler for Select component (for DayOfWeekKey)
  const handleHorarioDiaChange = (value: DayOfWeekKey) => {
    setCurrentHorario(prev => ({ ...prev, dia: value }));
  };

  const handleCreateNewHorario = () => {
    if (!targetResidenciaId) return;
    setCurrentHorario(getNewHorarioDefaults(targetResidenciaId));
    setIsEditingHorario(false);
    setShowHorarioForm(true);
  };

  const handleEditHorario = (horario: HorarioSolicitudComida) => {
    setCurrentHorario(horario);
    setIsEditingHorario(true);
    setShowHorarioForm(true);
  };

  const handleSubmitHorarioForm = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!targetResidenciaId || !currentHorario.nombre || !currentHorario.dia || !currentHorario.horaSolicitud) {
      toast({ title: "Campos Obligatorios", description: "Nombre, día y hora son obligatorios para el horario.", variant: "destructive" });
      return;
    }
    if (!canEdit || !authUser) { // Ensure authUser is available for logging
        toast({ title: "Acción no permitida", description: "No tienes permisos o no estás autenticado.", variant: "destructive"});
        return;
    }

    if (!/^\d{2}:\d{2}$/.test(currentHorario.horaSolicitud)) {
        toast({ title: "Formato Incorrecto", description: "La hora debe estar en formato HH:MM (ej. 13:30).", variant: "destructive" });
        return;
    }

    setFormLoadingHorario(true);

    const batch = writeBatch(db);
    let newPrimaryHorarioId = currentHorario.id; // Will be the ID of the one being set to primary
    let previousPrimaryHorarioIdToUpdate: string | null = null;

    try {
      // Primary Horario Logic
      if (currentHorario.isPrimary) {
        const existingPrimaryForDay = horarios.find(
          h => h.dia === currentHorario.dia && h.isPrimary && h.id !== currentHorario.id && h.isActive // only consider active ones
        );
        if (existingPrimaryForDay) {
          // Demote the existing primary
          const existingPrimaryRef = doc(db, 'horariosSolicitudComida', existingPrimaryForDay.id);
          batch.update(existingPrimaryRef, { isPrimary: false });
          previousPrimaryHorarioIdToUpdate = existingPrimaryForDay.id;
          toast({
            title: "Cambio de Primario",
            description: `El horario '${existingPrimaryForDay.nombre}' ya no es primario para ${DayOfWeekMap[currentHorario.dia]}.`,
            variant: "default",
            duration: 4000
          });
        }
      }

      const dataPayload = {
        ...currentHorario,
        residenciaId: targetResidenciaId,
        isActive: currentHorario.isActive === undefined ? true : currentHorario.isActive,
        isPrimary: currentHorario.isPrimary === undefined ? false : currentHorario.isPrimary,
      };

      let actionType: LogActionType = 'horario_solicitud';
      let docIdForLog = currentHorario.id;

      if (isEditingHorario && currentHorario.id) {
        const horarioRef = doc(db, 'horariosSolicitudComida', currentHorario.id);
        const { id, ...dataToUpdate } = dataPayload;
        batch.update(horarioRef, dataToUpdate);
        // newPrimaryHorarioId is already currentHorario.id
      } else {
        actionType = 'horario_solicitud';
        // For new horario, Firestore will generate ID. We add it to batch and get ref.
        // To get the ID for logging and for newPrimaryHorarioId if it's primary,
        // we must commit the batch partially or create this one doc outside the batch first if it's primary
        // and needs to be immediately referenced.
        // For simplicity here, if it's a new primary, we'll log after commit.
        // If not primary, ID is not critical immediately for primary logic.
        const newHorarioRef = doc(collection(db, 'horariosSolicitudComida')); // Create ref with new ID
        batch.set(newHorarioRef, dataPayload);
        newPrimaryHorarioId = newHorarioRef.id; // Capture the new ID
        docIdForLog = newHorarioRef.id;
      }
      
      // Weekday check warning (Request 3c)
      // This check should be done *before* committing the batch
      const tempHorariosAfterSave = isEditingHorario
        ? horarios.map(h => h.id === currentHorario.id ? { ...h, ...dataPayload } : h)
        : [...horarios, { ...dataPayload, id: newPrimaryHorarioId! }]; // Simulate adding new

      if (currentHorario.isPrimary || actionType === 'horario_solicitud' || previousPrimaryHorarioIdToUpdate) {
          // Re-evaluate primaries after this potential change
          let finalHorariosToCheck = tempHorariosAfterSave;
          if(previousPrimaryHorarioIdToUpdate){ // if an old primary was demoted
            finalHorariosToCheck = finalHorariosToCheck.map(h => h.id === previousPrimaryHorarioIdToUpdate ? {...h, isPrimary: false} : h);
          }
          if(currentHorario.isPrimary && newPrimaryHorarioId){ // if current one is becoming primary
            finalHorariosToCheck = finalHorariosToCheck.map(h => {
                if(h.id === newPrimaryHorarioId) return {...h, isPrimary: true};
                if(h.dia === currentHorario.dia && h.id !== newPrimaryHorarioId) return {...h, isPrimary: false}; // demote others on same day
                return h;
            });
          }

          const activeHorarios = finalHorariosToCheck.filter(h => h.isActive);
          const weekdaysWithPrimary = new Set(activeHorarios.filter(h => h.isPrimary).map(h => h.dia));
          const allWeekdays = Object.keys(DayOfWeekMap) as Array<DayOfWeekKey>;
          const weekdaysWithoutPrimary = allWeekdays.filter(day => !weekdaysWithPrimary.has(day));

          if (weekdaysWithoutPrimary.length > 0) {
            const confirmation = await new Promise<boolean>((resolve) => {
                 // Use AlertDialog for confirmation
                 // This is a placeholder for triggering an AlertDialog. 
                 // You'll need to manage AlertDialog state (open/close) and its onConfirm/onCancel.
                 // For now, we'll simulate with a window.confirm for simplicity of this step.
                 const confirmed = window.confirm(
                    `Advertencia: Los siguientes días no tendrán un horario primario activo: ${weekdaysWithoutPrimary.map(d => DayOfWeekMap[d]).join(', ')}. ` +
                    `Esto podría afectar la creación automática de comidas. ¿Deseas continuar?`
                 );
                 resolve(confirmed);
            });
            if (!confirmation) {
                setFormLoadingHorario(false);
                toast({ title: "Operación Cancelada", description: "No se guardaron los cambios en el horario.", variant: "default"});
                return; // User cancelled
            }
          }
      }

      await batch.commit();

      toast({
        title: actionType === 'horario_solicitud' ? "Horario Creado" : "Horario Actualizado",
        description: `Horario '${currentHorario.nombre}' ${actionType === 'horario_solicitud' ? 'creado' : 'actualizado'} con éxito.`,
      });

      // Logging
      await writeClientLog(
        authUser.uid,
        actionType,
        {
          residenciaId: targetResidenciaId,
          details: `Horario '${currentHorario.nombre}' (ID: ${docIdForLog}) ${actionType === 'horario_solicitud' ? 'creado' : 'actualizado'} por ${authUser.email}. Día: ${DayOfWeekMap[currentHorario.dia]}, Hora: ${currentHorario.horaSolicitud}, Primario: ${currentHorario.isPrimary ? 'Sí':'No'}.` +
                   (previousPrimaryHorarioIdToUpdate ? ` Horario anterior primario (ID: ${previousPrimaryHorarioIdToUpdate}) fue desmarcado.` : '')
        }
      );
      if (previousPrimaryHorarioIdToUpdate) { // Log demotion of old primary if it happened
          const oldPrimaryDetails = horarios.find(h=>h.id === previousPrimaryHorarioIdToUpdate);
          await writeClientLog(
            authUser.uid,
            'horario_solicitud', // Still an update
            {
              residenciaId: targetResidenciaId,
              details: `Horario '${oldPrimaryDetails?.nombre || 'N/A'}' (ID: ${previousPrimaryHorarioIdToUpdate}) desmarcado como primario automáticamente debido a nuevo primario para ${DayOfWeekMap[currentHorario.dia]}. Acción por ${authUser.email}.`
            }
          );
      }

      setShowHorarioForm(false);
      fetchHorarios(); // Refresh list
    } catch (error) {
      console.error("Error saving horario:", error);
      toast({ title: "Error", description: `No se pudo guardar el horario. ${error instanceof Error ? error.message : ''}`, variant: "destructive" });
    } finally {
      setFormLoadingHorario(false);
    }
  };

  const handleDeleteHorario = async (horarioId: string, horarioName: string) => {
    if (!canEdit || !targetResidenciaId) {
        toast({ title: "Acción no permitida", description: "No tienes permisos para eliminar o falta información.", variant: "destructive"});
        return;
    }

    setFormLoadingHorario(true);
    try {
      const asociadasAlternativas = alternativasParaValidacion.filter(
        alt => alt.horarioSolicitudComidaId === horarioId
      );
      const asociadasActivasAlternativas = asociadasAlternativas.filter(alt => alt.isActive);

      if (asociadasActivasAlternativas.length > 0) {
        toast({
          title: "Eliminación Bloqueada",
          description: `El horario '${horarioName}' no puede ser eliminado porque ${asociadasActivasAlternativas.length} alternativa(s) de comida activa(s) dependen de él. Por favor, desactívalas o reasígnalas primero.`,
          variant: "destructive",
          duration: 7000,
        });
        setFormLoadingHorario(false);
        return;
      }

      if (asociadasAlternativas.length > 0 && asociadasActivasAlternativas.length === 0) {
        // Soft delete: Mark as inactive
        const horarioRef = doc(db, 'horariosSolicitudComida', horarioId);
        await updateDoc(horarioRef, { isActive: false, isPrimary: false }); // Also ensure isPrimary is false on soft delete
        toast({
          title: "Horario Desactivado (Soft Delete)",
          description: `El horario '${horarioName}' ha sido desactivado porque tiene alternativas inactivas asociadas.`,
          variant: "default"
        });
        await writeClientLog(
            authUser!.uid, // Assumes authUser is not null here due to canEdit check
            'horario_solicitud', // Or a more specific 'horario_solicitud_deactivated' if you add it
            {
                residenciaId: targetResidenciaId,
                details: `Horario '${horarioName}' (ID: ${horarioId}) desactivado (soft delete) por ${authUser!.email}. Alternativas inactivas asociadas: ${asociadasAlternativas.length}.`
            }
        );
      } else {
        // Complete deletion
        await deleteDoc(doc(db, 'horariosSolicitudComida', horarioId));
        toast({ title: "Horario Eliminado", description: `Horario '${horarioName}' eliminado permanentemente.` });
        await writeClientLog(
            authUser!.uid,
            'horario_solicitud',
            {
                residenciaId: targetResidenciaId,
                details: `Horario '${horarioName}' (ID: ${horarioId}) eliminado permanentemente por ${authUser!.email}. No tenía alternativas asociadas.`
            }
        );
      }

      fetchHorarios(); // Refresh list
      if (currentHorario.id === horarioId) {
        setShowHorarioForm(false);
      }
    } catch (error) {
      console.error("Error deleting/deactivating horario:", error);
      toast({ title: "Error", description: `No se pudo procesar la eliminación del horario. ${error instanceof Error ? error.message : ''}`, variant: "destructive" });
    } finally {
      setFormLoadingHorario(false);
    }
  };

  // --- Render Logic ---
  if (authFirebaseLoading || (profileLoading && authUser)) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2">{authFirebaseLoading ? 'Cargando autenticación...' : 'Cargando perfil...'}</span>
      </div>
    );
  }

  if (!authUser && !authFirebaseLoading && !profileLoading) {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
            <AlertCircle className="h-12 w-12 text-destructive mb-4" />
            <h1 className="text-2xl font-bold text-destructive mb-2">No Autenticado</h1>
            <p className="mb-4 text-muted-foreground">Debes iniciar sesión para acceder a esta página.</p>
            <Button onClick={() => router.push('/')}>Ir al Inicio</Button>
        </div>
    );
  }
  
  if (profileError) { /* Similar error display as in crear-residencia */ }

  if (!isAuthorizedForPage && userProfile) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h1 className="text-2xl font-bold text-destructive mb-2">Acceso Denegado</h1>
        <p className="mb-4 text-muted-foreground max-w-md">
          Tu perfil (<span className="font-medium">{userProfile.email}</span>) no tiene los roles necesarios (master, admin, o director) para esta sección.
          {userProfile.roles?.includes('admin') && !userProfile.residenciaId && " (Tu perfil de admin no tiene una residencia asignada)"}
        </p>
        <Button onClick={() => router.push('/')}>Volver al Inicio</Button>
        <Button onClick={() => auth.signOut().then(()=>router.push('/'))} variant="outline" className="mt-2">Cerrar Sesión</Button>
      </div>
    );
  }
  
  if (userProfile?.roles?.includes('master') && !targetResidenciaId && isAuthorizedForPage) {
    return (
         <div className="container mx-auto p-4 space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold">Gestión de Comedores y Horarios</h1>
                <Button onClick={() => auth.signOut().then(()=>router.push('/'))} variant="outline">Cerrar Sesión</Button>
            </div>
            <Card>
                <CardHeader><CardTitle>Seleccionar Residencia</CardTitle></CardHeader>
                <CardContent>
                    <p>Como usuario 'master', por favor navega a la <Button variant="link" onClick={() => router.push('/admin/crear-residencia')} className="p-0 h-auto">página de gestión de residencias</Button> para seleccionar una residencia y administrar sus comedores y horarios desde allí.</p>
                    {/* Placeholder for a Residencia selector component if this page were to be used directly by master */}
                </CardContent>
            </Card>
        </div>
    );
  }

  if (!targetResidenciaId && isAuthorizedForPage) { // For admin/director if somehow targetResidenciaId is not set but they are authorized
      return (
          <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
              <AlertCircle className="h-12 w-12 text-yellow-500 mb-4" />
              <h1 className="text-2xl font-bold mb-2">Residencia No Especificada</h1>
              <p className="mb-4 text-muted-foreground">No se ha especificado una residencia para administrar.</p>
              <Button onClick={() => router.push('/')}>Volver al Inicio</Button>
          </div>
      );
  }

  // --- Main Page Content when targetResidenciaId IS set ---
  return (
    <div className="container mx-auto p-4 space-y-8">
      <div className="flex justify-between items-center">
        <div>
            <h1 className="text-3xl font-bold">
                Gestión para Residencia: {loadingResidenciaDetails ? <Loader2 className="inline h-6 w-6 animate-spin" /> : residenciaDetails?.nombre || 'Desconocida'}
            </h1>
            {userProfile && <p className="text-muted-foreground">Usuario: {userProfile.email} (Rol: {userProfile.roles?.join(', ')})</p>}
            {residenciaDetails && <p className="text-sm text-muted-foreground">ID Residencia: {residenciaDetails.id}</p>}
        </div>
        <Button onClick={() => auth.signOut().then(()=>router.push('/'))} variant="outline">Cerrar Sesión</Button>
      </div>

      {/* Section for Comedores */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle><Building className="inline mr-2"/>Comedores</CardTitle>
            {canEdit && !showComedorForm && (
              <Button onClick={handleCreateNewComedor} disabled={showComedorForm || formLoadingComedor}>
                <PlusCircle className="mr-2 h-4 w-4" /> Añadir Comedor
              </Button>
            )}
          </div>
          <CardDescription>
            {canEdit ? "Administra los comedores de la residencia." : "Visualiza los comedores de la residencia."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* TODO: Comedor Form (conditional on showComedorForm) */}
          {showComedorForm && canEdit && (
            <Card className="mb-6 shadow-md" >
              <form action={comedorFormAction}>
                <CardHeader>
                  <CardTitle>{isEditingComedor ? 'Editar Comedor' : 'Nuevo Comedor'}</CardTitle>
                  <CardDescription>
                    {isEditingComedor ? `Modifica los detalles del comedor: ${currentComedor.nombre || ''}` : 'Añade un nuevo comedor a la residencia.'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="comedorNombre">Nombre <span className="text-destructive">*</span></Label>
                    <Input
                      id="comedorNombre"
                      name="nombre"
                      value={currentComedor.nombre || ''}
                      onChange={handleInputChangeComedor}
                      required
                      disabled={formLoadingComedor || isComedorFormPending}
                      maxLength={100}
                    />
                  </div>
                  <div>
                    <Label htmlFor="comedorDescripcion">Descripción</Label>
                    <Textarea
                      id="comedorDescripcion"
                      name="descripcion"
                      value={currentComedor.descripcion || ''}
                      onChange={handleInputChangeComedor}
                      disabled={formLoadingComedor || isComedorFormPending}
                      maxLength={500}
                    />
                  </div>
                  <div>
                    <Label htmlFor="comedorCapacidad">Capacidad (opcional)</Label>
                    <Input
                      id="comedorCapacidad"
                      name="capacidad"
                      type="number"
                      value={currentComedor.capacidad || 0}
                      onChange={handleInputChangeComedor}
                      onFocus={(event) => event.target.select()}
                      disabled={formLoadingComedor || isComedorFormPending}
                      min="0"
                    />
                  </div>
                  <div>
                    <Label htmlFor="comedorCentroCostoDefault">
                        {(residenciaDetails?.configuracionContabilidad?.nombreEtiquetaCentroCosto || 'Centro de Costo')} por Defecto (Opcional)
                    </Label>
                    <Select
                      value={currentComedor.centroCostoPorDefectoId || ''}
                      onValueChange={(value) => setCurrentComedor(prev => ({ ...prev, centroCostoPorDefectoId: value }))}
                      disabled={formLoadingComedor || isLoadingCentrosCostoResidencia || isComedorFormPending}
                    >
                        <SelectTrigger id="comedorCentroCostoDefault">
                            <SelectValue placeholder={
                                isLoadingCentrosCostoResidencia ? "Cargando..." :
                                `Seleccione ${(residenciaDetails?.configuracionContabilidad?.nombreEtiquetaCentroCosto || 'CC').toLowerCase()} de defecto...`
                            } />
                        </SelectTrigger>
                        <SelectContent>
                            {/* ... options ... */}
                            {isLoadingCentrosCostoResidencia ? (
                                <SelectItem value="loading" disabled>Cargando...</SelectItem>
                            ) : centrosCostoResidencia.length === 0 ? (
                                <SelectItem value="no-options" disabled>
                                    No hay {(residenciaDetails?.configuracionContabilidad?.nombreEtiquetaCentroCosto || 'centros de costo').toLowerCase()} activos en la residencia.
                                </SelectItem>
                            ) : (
                                <>
                                    <SelectItem value="">Ninguno</SelectItem> 
                                    {centrosCostoResidencia.map((cc) => (
                                        <SelectItem key={cc.id} value={cc.id}>
                                            {cc.nombre}
                                        </SelectItem>
                                    ))}</>
                            )}
                        </SelectContent>
                    </Select>
                      {/* Hidden input so native form submits the selected value */}
                      <input type="hidden" name="centroCostoPorDefectoId" value={currentComedor.centroCostoPorDefectoId || ''} />
                    <p className="text-xs text-muted-foreground mt-1">
                        {(residenciaDetails?.configuracionContabilidad?.nombreEtiquetaCentroCosto || 'Centro de costo')} que se asignará por defecto a las elecciones hechas en este comedor.
                    </p>
                  </div>
                </CardContent>
                <CardFooter className="flex justify-end space-x-2">
                    <Button type="button" variant="outline" onClick={() => setShowComedorForm(false)} disabled={formLoadingComedor || isComedorFormPending}>
                    Cancelar
                  </Button>
                    <input type="hidden" name="isEditing" value={isEditingComedor ? 'true' : 'false'} />
                    <input type="hidden" name="id" value={currentComedor.id || ''} />
                    <input type="hidden" name="residenciaId" value={targetResidenciaId || ''} />
                    <Button type="submit" disabled={formLoadingComedor || isComedorFormPending}>
                      {isComedorFormPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {isEditingComedor ? 'Guardar Cambios' : 'Crear Comedor'}
                    </Button>
                </CardFooter>
              </form>
            </Card>
          )}

          {isLoadingComedores && <div className="flex items-center"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cargando comedores...</div>}
          {/* TODO: Display list of comedores */}
          {!isLoadingComedores && comedores.length === 0 && <p>No hay comedores definidos para esta residencia.</p>}
          {!isLoadingComedores && comedores.length > 0 && (
            <div className="space-y-2">
                {comedores.map(comedor => (
                    <div key={comedor.id} className="p-3 border rounded-md flex justify-between items-center">
                        <div>
                            <p className="font-medium">{comedor.nombre}</p>
                            <p className="text-sm text-muted-foreground">{comedor.descripcion || 'Sin descripción'}{comedor.capacidad ? ` - Capacidad: ${comedor.capacidad}` : ''}</p>
                        </div>
                        {canEdit && (
                            <div className="space-x-2">
                                <Button variant="outline" size="sm" onClick={() => handleEditComedor(comedor)} disabled={formLoadingComedor || showComedorForm}>
                                    <Edit className="mr-1 h-3 w-3"/> Editar
                                </Button>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button variant="destructive" size="sm" disabled={formLoadingComedor || showComedorForm}>
                                      <Trash2 className="mr-1 h-3 w-3"/> Eliminar
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Esta acción no se puede deshacer. Esto eliminará permanentemente el comedor '{comedor.nombre}'.
                                        Considera si este comedor está siendo utilizado en alguna configuración de comidas.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                      <AlertDialogAction onClick={() => handleDeleteComedor(comedor.id, comedor.nombre)}>
                                        Eliminar
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                            </div>
                        )}
                         {!canEdit && (
                             <Button variant="outline" size="sm" disabled><Eye className="mr-1 h-3 w-3"/> Ver</Button>
                         )}
                    </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section for HorariosSolicitudComida */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle><Clock className="inline mr-2"/>Horarios de Solicitud de Comida</CardTitle>
            {canEdit && !showHorarioForm && (
              <Button onClick={handleCreateNewHorario} disabled={showHorarioForm || formLoadingHorario}>
                <PlusCircle className="mr-2 h-4 w-4" /> Añadir Horario
              </Button>
            )}
          </div>
           <CardDescription>
             {canEdit ? "Define cuándo los directores pueden solicitar comidas." : "Visualiza los horarios de solicitud de comida."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* TODO: Horario Form (conditional on showHorarioForm) */}
          {showHorarioForm && canEdit && (
            <Card className="mb-6 shadow-md">
              <form action={horarioFormAction}>
                <CardHeader>
                  <CardTitle>{isEditingHorario ? 'Editar Horario de Solicitud' : 'Nuevo Horario de Solicitud'}</CardTitle>
                  <CardDescription>
                    {isEditingHorario ? `Modifica los detalles del horario: ${currentHorario.nombre || ''}` : 'Define un nuevo horario para la solicitud de comidas.'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="horarioNombre">Nombre Descriptivo <span className="text-destructive">*</span></Label>
                    <Input
                      id="horarioNombre"
                      name="nombre"
                      value={currentHorario.nombre || ''}
                      onChange={handleInputChangeHorario}
                      required
                      disabled={formLoadingHorario || isHorarioFormPending}
                      maxLength={100}
                      placeholder="Ej: Límite Almuerzo entre semana"
                    />
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="horarioDia">Día de la Semana <span className="text-destructive">*</span></Label>
                      <Select
                        name="dia"
                        value={currentHorario.dia || 'lunes'}
                        onValueChange={(value: DayOfWeekKey) => handleHorarioDiaChange(value)}
                        disabled={formLoadingHorario || isHorarioFormPending}
                      >
                        <SelectTrigger id="horarioDia">
                          <SelectValue placeholder="Selecciona un día" />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(DayOfWeekMap) as Array<DayOfWeekKey>).map(key => (
                            <SelectItem key={key} value={key}>{DayOfWeekMap[key]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="horarioHoraSolicitud">Hora Límite (HH:MM) <span className="text-destructive">*</span></Label>
                      <Input
                        id="horarioHoraSolicitud"
                        name="horaSolicitud"
                        type="time" // Using type="time" for better UX on supported browsers
                        value={currentHorario.horaSolicitud || '12:00'}
                        onChange={handleInputChangeHorario}
                        required
                        disabled={formLoadingHorario || isHorarioFormPending}
                        pattern="[0-2][0-9]:[0-5][0-9]" // Basic pattern, full validation in handler
                      />
                    </div>
                  </div>

                  <div className="flex items-center space-x-3 pt-2">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="horarioIsPrimary"
                        name="isPrimary"
                        checked={currentHorario.isPrimary || false}
                        onCheckedChange={(checked) => {
                            const isCurrentlyPrimaryBeingEdited = isEditingHorario && currentHorario.isPrimary;
                            
                            if (isCurrentlyPrimaryBeingEdited && !Boolean(checked)) {
                                // If user tries to uncheck an existing primary horario being edited
                                toast({
                                    title: "Acción no permitida directamente",
                                    description: "Un horario primario no puede ser desmarcado directamente. Para cambiar el horario primario, active esta opción en otro horario para el mismo día. Esto desmarcará automáticamente el actual.",
                                    variant: "default",
                                    duration: 7000
                                });
                                return; // Prevent unchecking by not updating state
                            }
                            setCurrentHorario(prev => ({...prev, isPrimary: Boolean(checked)}));
                        }}
                          // The main disabling factor is formLoadingHorario.
                          // The onCheckedChange above handles the specific UX for an active primary.
                          disabled={formLoadingHorario || isHorarioFormPending}
                      />
                      <Label htmlFor="horarioIsPrimary" className="font-normal">¿Es Horario Primario?</Label>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="horarioIsActive"
                        name="isActive"
                        checked={currentHorario.isActive === undefined ? true : currentHorario.isActive} // Default to true
                        onCheckedChange={(checked) => setCurrentHorario(prev => ({...prev, isActive: Boolean(checked)}))}
                        disabled={formLoadingHorario}
                      />
                      <Label htmlFor="horarioIsActive" className="font-normal">Activo</Label>
                    </div>
                  </div>
                  <CardDescription className="text-xs">
                    El horario primario para un día puede ser usado como referencia principal. Solo un horario por día debería ser primario.
                  </CardDescription>

                </CardContent>
                  <CardFooter className="flex justify-end space-x-2">
                  <Button type="button" variant="outline" onClick={() => setShowHorarioForm(false)} disabled={formLoadingHorario || isHorarioFormPending}>
                    Cancelar
                  </Button>
                  <input type="hidden" name="isEditing" value={isEditingHorario ? 'true' : 'false'} />
                  <input type="hidden" name="id" value={currentHorario.id || ''} />
                  <input type="hidden" name="residenciaId" value={targetResidenciaId || ''} />
                  <input type="hidden" name="actorUserId" value={authUser?.uid || ''} />
                  <Button type="submit" disabled={formLoadingHorario || isHorarioFormPending}>
                    {isHorarioFormPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {isEditingHorario ? 'Guardar Cambios' : 'Crear Horario'}
                  </Button>
                </CardFooter>
              </form>
            </Card>
          )}
          {isLoadingHorarios && <div className="flex items-center"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cargando horarios...</div>}
          {/* TODO: Display list of horarios */}
          {!isLoadingHorarios && horarios.length === 0 && <p>No hay horarios de solicitud definidos para esta residencia.</p>}
           {!isLoadingHorarios && horarios.length > 0 && (
            <div className="space-y-2">
                {horarios.map(horario => (
                    <div key={horario.id} className="p-3 border rounded-md flex justify-between items-center">
                        <div>
                            <p className="font-medium">{horario.nombre} ({DayOfWeekMap[horario.dia]} a las {horario.horaSolicitud})</p>
                            <p className="text-sm text-muted-foreground">
                                Primario: {horario.isPrimary ? 'Sí' : 'No'} - Activo: {horario.isActive ? 'Sí' : 'No'}
                            </p>
                        </div>
                        {canEdit && (
                            <div className="space-x-2">
                                <Button variant="outline" size="sm" onClick={() => handleEditHorario(horario)} disabled={formLoadingHorario || showHorarioForm}>
                                    <Edit className="mr-1 h-3 w-3"/> Editar
                                </Button>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button variant="destructive" size="sm" disabled={formLoadingHorario || showHorarioForm}>
                                      <Trash2 className="mr-1 h-3 w-3"/> Eliminar
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Esta acción no se puede deshacer. Esto eliminará permanentemente el horario '{horario.nombre}'.
                                        Asegúrate de que no haya alternativas de comida configuradas que dependan críticamente de este horario.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                      <AlertDialogAction onClick={() => handleDeleteHorario(horario.id, horario.nombre)}>
                                        Eliminar
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                            </div>
                        )}
                        {!canEdit && (
                             <Button variant="outline" size="sm" disabled><Eye className="mr-1 h-3 w-3"/> Ver</Button>
                         )}
                    </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Fallback if user is authenticated, authorized, but no targetResidenciaId somehow (should be rare) */}
      {isAuthorizedForPage && !targetResidenciaId && userProfile && !userProfile.roles?.includes('master') && (
         <Card>
            <CardHeader><CardTitle>Error Inesperado</CardTitle></CardHeader>
            <CardContent>
                <p>No se ha podido determinar la residencia para administrar. Por favor, contacta con el soporte.</p>
            </CardContent>
        </Card>
      )}

    </div> // End of container mx-auto
  );
}

export default ResidenciaHorariosComedoresPage;
