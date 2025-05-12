// src/app/admin/residencia/page.tsx
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } //, useSearchParams // Potentially for master user to get residenciaId
from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import {
  UserProfile,
  Residencia,
  Comedor,
  HorarioSolicitudComida,
  UserRole,
  DayOfWeekKey,
  DayOfWeekMap,
  CentroCosto // Ensure CentroCosto is here
} from '@/models/firestore';
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


export default function ResidenciaHorariosComedoresPage() {
  const router = useRouter();
  // const searchParams = useSearchParams(); // For master to potentially get residenciaId from query
  const { toast } = useToast();
  const [authUser, authFirebaseLoading, authFirebaseError] = useAuthState(auth);

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

  // ADDED: CentroCosto States for the current Residencia
  const [centrosCostoResidencia, setCentrosCostoResidencia] = useState<CentroCosto[]>([]);
  const [isLoadingCentrosCostoResidencia, setIsLoadingCentrosCostoResidencia] = useState<boolean>(false);

    // ... (isLoadingCentrosCostoResidencia state) ...

  // ADDED: Form Data State for Residencia Details
  const [residenciaFormData, setResidenciaFormData] = useState<Partial<Residencia>>({
    nombre: '',
    direccion: '',
    logoUrl: '',
    nombreEtiquetaCentroCosto: '',
    modoDeCosteo: undefined, // Or a default like 'por-usuario'
    antelacionActividadesDefault: 0,
    textProfile: '',
    tipoResidentes: 'estudiantes', // Default value
    esquemaAdministracion: 'flexible', // Default value
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
                // toast({ title: "Seleccionar Residencia", description: "Como master, necesitas especificar una residencia.", variant: "default"});
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

  useEffect(() => {
    if (targetResidenciaId && isAuthorizedForPage) {
        fetchComedores();
        fetchHorarios();
        fetchCentrosCostoForCurrentResidencia(); // ADDED CALL
    } else {
        setComedores([]);
        setHorarios([]);
        setCentrosCostoResidencia([]); // ADDED: Clear state if no targetResidenciaId
    }
  }, [targetResidenciaId, isAuthorizedForPage, fetchComedores, fetchHorarios, fetchCentrosCostoForCurrentResidencia]); // ADDED fetchCentrosCostoForCurrentResidencia to dependencies

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
    if (!canEdit) {
        toast({ title: "Acción no permitida", description: "No tienes permisos para eliminar.", variant: "destructive"});
        return;
    }
    /* 
      TODO: Consider implications of deleting a comedor.
      Are there AlternativaTiempoComida items referencing this comedorId?
      They would need to be handled (e.g., disassociated or deleted, or prevent comedor deletion if in use).
      For now, direct deletion.
    */
    setFormLoadingComedor(true); // Use this loading state for delete op as well
    try {
      await deleteDoc(doc(db, 'comedores', comedorId));
      toast({ title: "Comedor Eliminado", description: `Comedor '${comedorName}' eliminado.` });
      fetchComedores(); // Refresh list
      if (currentComedor.id === comedorId) { // If the deleted one was in the form
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
      toast({ title: "Error", description: "Nombre, día y hora son obligatorios para el horario.", variant: "destructive" });
      return;
    }
     if (!canEdit) {
        toast({ title: "Acción no permitida", description: "No tienes permisos para esta acción.", variant: "destructive"});
        return;
    }

    // Validate horaSolicitud format (HH:MM)
    if (!/^\d{2}:\d{2}$/.test(currentHorario.horaSolicitud)) {
        toast({ title: "Formato Incorrecto", description: "La hora debe estar en formato HH:MM (ej. 13:30).", variant: "destructive" });
        return;
    }

    setFormLoadingHorario(true);
    try {
      const dataPayload = {
        ...currentHorario,
        residenciaId: targetResidenciaId,
        // Ensure boolean values are correctly set, even if not touched in form for some reason
        isActive: currentHorario.isActive === undefined ? true : currentHorario.isActive,
        isPrimary: currentHorario.isPrimary === undefined ? false : currentHorario.isPrimary,
      };

      if (isEditingHorario && currentHorario.id) {
        const horarioRef = doc(db, 'horariosSolicitudComida', currentHorario.id);
        const { id, ...dataToUpdate } = dataPayload;
        await updateDoc(horarioRef, dataToUpdate);
        toast({ title: "Horario Actualizado", description: `Horario '${currentHorario.nombre}' actualizado.` });
      } else {
        const { id, ...dataToCreate } = dataPayload; // ensure no id on create
        await addDoc(collection(db, 'horariosSolicitudComida'), dataToCreate);
        toast({ title: "Horario Creado", description: `Horario '${currentHorario.nombre}' creado.` });
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
     if (!canEdit) {
        toast({ title: "Acción no permitida", description: "No tienes permisos para eliminar.", variant: "destructive"});
        return;
    }
    /*
      TODO: Consider implications of deleting a horario.
      Are there AlternativaTiempoComida items referencing this horarioSolicitudComidaId?
      They might need to be handled. For now, direct deletion.
    */
    setFormLoadingHorario(true);
    try {
      await deleteDoc(doc(db, 'horariosSolicitudComida', horarioId));
      toast({ title: "Horario Eliminado", description: `Horario '${horarioName}' eliminado.` });
      fetchHorarios(); // Refresh list
      if (currentHorario.id === horarioId) { // If the deleted one was in the form
        setShowHorarioForm(false);
      }
    } catch (error) {
      console.error("Error deleting horario:", error);
      toast({ title: "Error", description: `No se pudo eliminar el horario. ${error instanceof Error ? error.message : ''}`, variant: "destructive" });
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
              <form onSubmit={handleSubmitComedorForm}>
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
                      disabled={formLoadingComedor}
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
                      disabled={formLoadingComedor}
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
                      disabled={formLoadingComedor}
                      min="0"
                    />
                  </div>
                  <div>
                    <Label htmlFor="comedorCentroCostoDefault">
                        {(residenciaDetails?.nombreEtiquetaCentroCosto || 'Centro de Costo')} por Defecto (Opcional)
                    </Label>
                    <Select
                        value={currentComedor.centroCostoPorDefectoId || ''}
                        onValueChange={(value) => setCurrentComedor(prev => ({ ...prev, centroCostoPorDefectoId: value }))}
                        disabled={formLoadingComedor || isLoadingCentrosCostoResidencia}
                    >
                        <SelectTrigger id="comedorCentroCostoDefault">
                            <SelectValue placeholder={
                                isLoadingCentrosCostoResidencia ? "Cargando..." :
                                `Seleccione ${(residenciaDetails?.nombreEtiquetaCentroCosto || 'CC').toLowerCase()} de defecto...`
                            } />
                        </SelectTrigger>
                        <SelectContent>
                            {isLoadingCentrosCostoResidencia ? (
                                <SelectItem value="loading" disabled>Cargando...</SelectItem>
                            ) : centrosCostoResidencia.length === 0 ? (
                                <SelectItem value="no-options" disabled>
                                    No hay {(residenciaDetails?.nombreEtiquetaCentroCosto || 'centros de costo').toLowerCase()} activos en la residencia.
                                </SelectItem>
                            ) : (
                                <>
                                    <SelectItem value="">Ninguno</SelectItem> 
                                    {centrosCostoResidencia.map((cc) => (
                                        <SelectItem key={cc.id} value={cc.id}>
                                            {cc.nombre}
                                        </SelectItem>
                                    ))}
                                </>
                            )}
                        </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1">
                        {(residenciaDetails?.nombreEtiquetaCentroCosto || 'Centro de costo')} que se asignará por defecto a las elecciones hechas en este comedor.
                    </p>
                  </div>
                </CardContent>
                <CardFooter className="flex justify-end space-x-2">
                  <Button type="button" variant="outline" onClick={() => setShowComedorForm(false)} disabled={formLoadingComedor}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={formLoadingComedor}>
                    {formLoadingComedor && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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
             {canEdit ? "Define cuándo los usuarios pueden solicitar comidas." : "Visualiza los horarios de solicitud de comida."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* TODO: Horario Form (conditional on showHorarioForm) */}
          {showHorarioForm && canEdit && (
            <Card className="mb-6 shadow-md">
              <form onSubmit={handleSubmitHorarioForm}>
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
                      disabled={formLoadingHorario}
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
                        disabled={formLoadingHorario}
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
                        disabled={formLoadingHorario}
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
                        onCheckedChange={(checked) => setCurrentHorario(prev => ({...prev, isPrimary: Boolean(checked)}))}
                        disabled={formLoadingHorario}
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
                  <Button type="button" variant="outline" onClick={() => setShowHorarioForm(false)} disabled={formLoadingHorario}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={formLoadingHorario}>
                    {formLoadingHorario && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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

