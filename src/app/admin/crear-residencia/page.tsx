// src/app/admin/crear-residencia/page.tsx
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { UserProfile, Residencia, UserRole, Dieta, LogEntry, LogEntryId, LogActionType } from '@/../../shared/models/types';
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
  writeBatch,
  serverTimestamp,
  FieldValue
} from 'firebase/firestore';

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea"; // For multi-line fields like direccion
import { Checkbox } from "@/components/ui/checkbox"; // For boolean fields
import { Label } from "@/components/ui/label";
import TimezoneSelector, { TimezonesData } from "@/components/ui/TimezoneSelector";
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
import { Loader2, AlertCircle, PlusCircle, Edit, Trash2, Eye } from 'lucide-react';

import { writeClientLog } from '@/lib/utils';

// Helper to create a new Residencia object with defaults
const getNewResidenciaDefaults = (): Partial<Residencia> => ({ // Changed return type
  id: '', // Added id field
  nombre: '',
  direccion: '',
  logoUrl: '',
  configuracionContabilidad: null,
  antelacionActividadesDefault: 7,
  tipoResidencia: 'estudiantes',
  esquemaAdministracion: 'estricto',
  zonaHoraria: 'America/Tegucigalpa',
  nombreTradicionalDesayuno: "Desayuno",
  nombreTradicionalAlmuerzo: "Almuerzo",
  nombreTradicionalCena: "Cena",
  nombreTradicionalLunes: "Lunes",
  nombreTradicionalMartes: "Martes",
  nombreTradicionalMiercoles: "Miércoles",
  nombreTradicionalJueves: "Jueves",
  nombreTradicionalViernes: "Viernes",
  nombreTradicionalSabado: "Sábado",
  nombreTradicionalDomingo: "Domingo",
  campoPersonalizado1_etiqueta: '',
  campoPersonalizado1_isActive: false,
  campoPersonalizado1_necesitaValidacion: false,
  campoPersonalizado1_regexValidacion: '',
  campoPersonalizado1_tamanoTexto: 'text',
  campoPersonalizado1_puedeModDirector: true,
  campoPersonalizado1_puedeModInteresado: true,
  campoPersonalizado2_etiqueta: '',
  campoPersonalizado2_isActive: false,
  campoPersonalizado2_necesitaValidacion: false,
  campoPersonalizado2_regexValidacion: '',
  campoPersonalizado2_tamanoTexto: 'text',
  campoPersonalizado2_puedeModDirector: true,
  campoPersonalizado2_puedeModInteresado: true,
  campoPersonalizado3_etiqueta: '',
  campoPersonalizado3_isActive: false,
  campoPersonalizado3_necesitaValidacion: false,
  campoPersonalizado3_regexValidacion: '',
  campoPersonalizado3_tamanoTexto: 'text',
  campoPersonalizado3_puedeModDirector: true,
  campoPersonalizado3_puedeModInteresado: true,
  textProfile: 'espanol-honduras',
});


export default function CrearResidenciaAdminPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [authUser, authFirebaseLoading, authFirebaseError] = useAuthState(auth);

  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState<boolean>(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [isAuthorized, setIsAuthorized] = useState<boolean>(false);
  const [isMasterUser, setIsMasterUser] = useState<boolean>(false);
  const [isAdminUser, setIsAdminUser] = useState<boolean>(false);

  const [residences, setResidences] = useState<Residencia[]>([]);
  const [isLoadingResidences, setIsLoadingResidences] = useState<boolean>(false);
  const [errorResidences, setErrorResidences] = useState<string | null>(null);

  const [showCreateForm, setShowCreateForm] = useState<boolean>(false);
  const [currentResidencia, setCurrentResidencia] = useState<Partial<Residencia>>(getNewResidenciaDefaults());
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [formLoading, setFormLoading] = useState<boolean>(false);
  const [antelacionError, setAntelacionError] = useState<string | null>(null);

  const [residenciaIdError, setResidenciaIdError] = useState<string | null>(null);

  const [formData, setFormData] = useState<Partial<Omit<Residencia, 'id'>>>(getNewResidenciaDefaults());
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // State for timezones
  const [timezones, setTimezones] = useState<TimezonesData>({});

  // --- useEffect: Handle Auth State & Fetch Profile ---
  useEffect(() => {
    if (authFirebaseLoading) {
      setProfileLoading(true);
      return;
    }
    if (authFirebaseError) {
      toast({ title: "Error de Autenticación", description: authFirebaseError.message, variant: "destructive" });
      setProfileLoading(false); setUserProfile(null); setProfileError(authFirebaseError.message);
      setIsAuthorized(false);
      return;
    }
    if (!authUser) {
      setProfileLoading(false); setUserProfile(null); setProfileError(null);
      setIsAuthorized(false);
      // Redirection handled by render logic
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
          const canAccessPage = roles.includes('master') || roles.includes('admin');
          setIsAuthorized(canAccessPage);
          setIsMasterUser(roles.includes('master'));
          setIsAdminUser(roles.includes('admin'));

          if (!canAccessPage) {
            toast({ title: "Acceso Denegado", description: "No tienes permisos para acceder (master o admin).", variant: "destructive" });
          }
        } else {
          setUserProfile(null); setProfileError("Perfil de usuario no encontrado.");
          toast({ title: "Error de Perfil", description: "No se encontró tu perfil de usuario.", variant: "destructive" });
          setIsAuthorized(false);
        }
      })
      .catch((error) => {
        setUserProfile(null); setProfileError(`Error al cargar el perfil: ${error.message}`);
        toast({ title: "Error al Cargar Perfil", description: `No se pudo cargar tu perfil: ${error.message}`, variant: "destructive" });
        setIsAuthorized(false);
      })
      .finally(() => {
        setProfileLoading(false);
      });
  }, [authUser, authFirebaseLoading, authFirebaseError, toast]);

  // --- Redirect if not authenticated after loading ---
  useEffect(() => {
    if (!authFirebaseLoading && !profileLoading && !authUser) {
        router.replace('/');
    }
  }, [authFirebaseLoading, profileLoading, authUser, router]);

  // --- Fetch Residences Function ---
  const fetchResidences = useCallback(async () => {
    if (!userProfile || !isAuthorized) {
      setResidences([]);
      return;
    }

    setIsLoadingResidences(true);
    setErrorResidences(null);
    try {
      let residencesQuery;
      if (isMasterUser) {
        residencesQuery = query(collection(db, 'residencias'), orderBy("nombre"));
      } else if (isAdminUser && userProfile.residenciaId) {
        residencesQuery = query(collection(db, 'residencias'), where("id", "==", userProfile.residenciaId));
      } else {
        setResidences([]);
        setIsLoadingResidences(false);
        if (isAdminUser && !userProfile.residenciaId) {
          toast({ title: "Información", description: "Como admin, no tienes una residencia asignada para ver.", variant: "default" });
        }
        return;
      }

      const residenceSnapshot = await getDocs(residencesQuery);
      const fetchedResidences: Residencia[] = residenceSnapshot.docs.map(doc => ({
        id: doc.id,
        ...(doc.data() as Omit<Residencia, 'id'>)
      }));
      setResidences(fetchedResidences);
    } catch (error) {
      const errorMessage = `Error al cargar residencias. ${error instanceof Error ? error.message : 'Error desconocido'}`;
      setErrorResidences(errorMessage);
      toast({ title: "Error", description: "No se pudieron cargar las residencias.", variant: "destructive" });
    } finally {
      setIsLoadingResidences(false);
    }
  }, [userProfile, isAuthorized, isMasterUser, isAdminUser, toast]);

  // --- useEffect: Fetch residences when authorization changes ---
  useEffect(() => {
    if (isAuthorized && userProfile) {
      fetchResidences();
    } else {
      setResidences([]); // Clear residences if not authorized
    }
  }, [isAuthorized, userProfile, fetchResidences]);

  // --- Form Handling ---
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    // Define val with a type that can be assigned to fields in Residencia
    // Let's assume Residencia fields are string, number, or boolean (not undefined for form purposes)
    let processedValue: string | number | boolean | undefined;

    if (type === 'checkbox') {
      processedValue = (e.target as HTMLInputElement).checked;
    } else if (type === 'number') {
      if (value.trim() === '') {
        processedValue = undefined; // Use empty string for visual clearing
      } else {
        const parsed = parseFloat(value);
        processedValue = isNaN(parsed) ? undefined : parsed; // If not a valid number, treat as empty string for now
      }
    } else if (name === 'id') { // Specific handling for custom ID
      processedValue = value
          .toLowerCase()
          .replace(/\s+/g, '-') // Replace spaces with hyphens
          .replace(/[^a-z0-9-]/g, ''); // Remove disallowed characters
    } else { // For text, textarea, select (not type='number')
      processedValue = value;
    }
    
    setCurrentResidencia(prev => ({ 
      ...prev, 
      [name]: processedValue 
    }));
  };

  const handleCreateNew = () => {
    if (!isMasterUser) {
      toast({ title: "Acción no permitida", description: "Solo usuarios 'master' pueden crear residencias.", variant: "destructive" });
      return;
    }
    setCurrentResidencia(getNewResidenciaDefaults());
    setIsEditing(false);
    setShowCreateForm(true);
  };

  const handleEdit = (residencia: Residencia) => {
    if (!isMasterUser && !(isAdminUser && userProfile?.residenciaId === residencia.id)) {
         toast({ title: "Acción no permitida", description: "No tienes permisos para editar esta residencia.", variant: "destructive" });
        return;
    }
    setCurrentResidencia({ ...getNewResidenciaDefaults(), ...residencia });
    setIsEditing(true);
    setShowCreateForm(true);
  };

  const handleCancelForm = () => {
    setShowCreateForm(false);
    setIsEditing(false);
    setCurrentResidencia(getNewResidenciaDefaults());
    setAntelacionError(null);
    // The TimezoneSelector will automatically pick up the zonaHoraria from currentResidencia
  };

  const handleSubmitForm = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setAntelacionError(null); // Clear previous antelacion error

    if (!userProfile || (!isMasterUser && !isEditing)) {
      toast({ title: "Acción no permitida", description: "No tienes permisos para esta acción.", variant: "destructive" });
      return;
    }

    // Validate Nombre
    if (typeof currentResidencia.nombre !== 'string' || !currentResidencia.nombre.trim()) {
        toast({ title: "Campo requerido", description: "El nombre de la residencia es obligatorio.", variant: "default"});
        return;
    }

    // Validate Zona Horaria
    if (!currentResidencia.zonaHoraria || !currentResidencia.zonaHoraria.includes('/')) {
        toast({ title: "Campo requerido", description: "La zona horaria es obligatoria y debe tener un formato válido (Ej: Region/Ciudad).", variant: "default"});
        return;
    }

    // Validate Antelacion Actividades Default
    const antelacionValueInput = currentResidencia.antelacionActividadesDefault;
    let antelacionNum: number;

    if (antelacionValueInput === undefined || antelacionValueInput === null || String(antelacionValueInput).trim() === '') {
      const errorMsg = "Antelación de actividades es requerida y debe ser un número.";
      setAntelacionError(errorMsg);
      toast({ title: "Error de Validación", description: errorMsg, variant: "destructive" });
      return;
    } else {
      antelacionNum = Number(antelacionValueInput);
      if (isNaN(antelacionNum)) {
        const errorMsg = "Antelación de actividades debe ser un número válido.";
        setAntelacionError(errorMsg);
        toast({ title: "Error de Validación", description: errorMsg, variant: "destructive" });
        return;
      }
    }

    if (antelacionNum < 0) {
      const errorMsg = "Antelación de actividades no puede ser un número negativo.";
      setAntelacionError(errorMsg);
      toast({ title: "Error de Validación", description: errorMsg, variant: "destructive" });
      return;
    }

    setFormLoading(true);
    try {
      // Prepare the data to save, reflecting all schema changes
      const residenciaDataForSubmit: Partial<Residencia> = {
        ...currentResidencia,
        // Ensure new/renamed fields are correctly sourced from currentResidencia (which should be up-to-date)
        // or explicitly set:
        nombre: currentResidencia.nombre || '',
        direccion: currentResidencia.direccion || '',
        logoUrl: currentResidencia.logoUrl || '',
        
        configuracionContabilidad: null, // Set to null as per requirements

        antelacionActividadesDefault: antelacionNum,
        
        tipoResidencia: currentResidencia.tipoResidencia || 'estudiantes', // Renamed field
        esquemaAdministracion: currentResidencia.esquemaAdministracion || 'estricto',
        
        zonaHoraria: currentResidencia.zonaHoraria || getNewResidenciaDefaults().zonaHoraria,

        nombreTradicionalDesayuno: currentResidencia.nombreTradicionalDesayuno || "Desayuno",
        nombreTradicionalAlmuerzo: currentResidencia.nombreTradicionalAlmuerzo || "Almuerzo",
        nombreTradicionalCena: currentResidencia.nombreTradicionalCena || "Cena",
        nombreTradicionalLunes: currentResidencia.nombreTradicionalLunes || "Lunes",
        nombreTradicionalMartes: currentResidencia.nombreTradicionalMartes || "Martes",
        nombreTradicionalMiercoles: currentResidencia.nombreTradicionalMiercoles || "Miércoles",
        nombreTradicionalJueves: currentResidencia.nombreTradicionalJueves || "Jueves",
        nombreTradicionalViernes: currentResidencia.nombreTradicionalViernes || "Viernes",
        nombreTradicionalSabado: currentResidencia.nombreTradicionalSabado || "Sábado",
        nombreTradicionalDomingo: currentResidencia.nombreTradicionalDomingo || "Domingo",

        campoPersonalizado1_etiqueta: currentResidencia.campoPersonalizado1_etiqueta || '',
        campoPersonalizado1_isActive: !!currentResidencia.campoPersonalizado1_isActive,
        campoPersonalizado1_necesitaValidacion: !!currentResidencia.campoPersonalizado1_necesitaValidacion,
        campoPersonalizado1_regexValidacion: currentResidencia.campoPersonalizado1_regexValidacion || '',
        campoPersonalizado1_tamanoTexto: currentResidencia.campoPersonalizado1_tamanoTexto || 'text',
        campoPersonalizado1_puedeModDirector: !!currentResidencia.campoPersonalizado1_puedeModDirector,
        campoPersonalizado1_puedeModInteresado: !!currentResidencia.campoPersonalizado1_puedeModInteresado,

        campoPersonalizado2_etiqueta: currentResidencia.campoPersonalizado2_etiqueta || '',
        campoPersonalizado2_isActive: !!currentResidencia.campoPersonalizado2_isActive,
        campoPersonalizado2_necesitaValidacion: !!currentResidencia.campoPersonalizado2_necesitaValidacion,
        campoPersonalizado2_regexValidacion: currentResidencia.campoPersonalizado2_regexValidacion || '',
        campoPersonalizado2_tamanoTexto: currentResidencia.campoPersonalizado2_tamanoTexto || 'text',
        campoPersonalizado2_puedeModDirector: !!currentResidencia.campoPersonalizado2_puedeModDirector,
        campoPersonalizado2_puedeModInteresado: !!currentResidencia.campoPersonalizado2_puedeModInteresado,

        campoPersonalizado3_etiqueta: currentResidencia.campoPersonalizado3_etiqueta || '',
        campoPersonalizado3_isActive: !!currentResidencia.campoPersonalizado3_isActive,
        campoPersonalizado3_necesitaValidacion: !!currentResidencia.campoPersonalizado3_necesitaValidacion,
        campoPersonalizado3_regexValidacion: currentResidencia.campoPersonalizado3_regexValidacion || '',
        campoPersonalizado3_tamanoTexto: currentResidencia.campoPersonalizado3_tamanoTexto || 'text',
        campoPersonalizado3_puedeModDirector: !!currentResidencia.campoPersonalizado3_puedeModDirector,
        campoPersonalizado3_puedeModInteresado: !!currentResidencia.campoPersonalizado3_puedeModInteresado,
        
        textProfile: currentResidencia.textProfile || 'espanol-honduras',

        // REMOVED FIELDS (should not be in currentResidencia if getNewResidenciaDefaults was updated, but good to be explicit)
        // nombreEtiquetaCentroCosto: undefined, 
        // modoDeCosteo: undefined,
        // tipoResidentes: undefined, // old field name
      };

      // Explicitly remove fields that should not be saved, if they somehow ended up on currentResidencia
      delete (residenciaDataForSubmit as any).nombreEtiquetaCentroCosto;
      delete (residenciaDataForSubmit as any).modoDeCosteo;
      delete (residenciaDataForSubmit as any).tipoResidentes;


      if (isEditing && currentResidencia.id) {
        // UPDATE
        const existingResidenciaId = currentResidencia.id;
        if (!isMasterUser && !(isAdminUser && userProfile?.residenciaId === existingResidenciaId)) {
          toast({ title: "Acción no permitida", description: "No tienes permisos para editar esta residencia.", variant: "destructive" });
          setFormLoading(false);
          return;
        }
        const residenciaRef = doc(db, 'residencias', currentResidencia.id);
        const { id, ...dataToUpdate } = residenciaDataForSubmit; // Ensure 'id' is not part of the data payload
        await updateDoc(residenciaRef, dataToUpdate);
        toast({ title: "Residencia Actualizada", description: `Residencia '${dataToUpdate.nombre}' actualizada con éxito.` });
        if (userProfile?.id && currentResidencia.id) { 
          await writeClientLog(
            userProfile.id, // actorUserId (ensure this is type UserId or string)
            'residencia_updated', // actionType
            { // logDetails
              residenciaId: currentResidencia.id, // (ensure this is type ResidenciaId or string)
              details: `Residencia '${dataToUpdate.nombre || ''}' (ID: ${currentResidencia.id}) actualizada por ${userProfile.email}.` 
              // residenciaNombre is now part of the details string.
              // relatedDocPath: `residencias/${currentResidencia.id}` // Optional
            }
          );
        }
      } else if (!isEditing && isMasterUser) {
        // CREATE
        const { id, ...newResidenciaData } = residenciaDataForSubmit; // Ensure 'id' is not part of the data payload
        const docRef = await addDoc(collection(db, 'residencias'), newResidenciaData);
        
        // Creating a Default Dieta (assuming this logic remains)
        try {
          const defaultDieta: Omit<Dieta, 'id'> = {
            nombre: "Normal",
            descripcion: "Ningún régimen especial",
            isDefault: true,
            isActive: true,
            residenciaId: docRef.id,
          };
          await addDoc(collection(db, 'dietas'), defaultDieta);
          toast({
            title: "Éxito Parcial",
            description: `Residencia '${newResidenciaData.nombre}' (ID: ${docRef.id}) y Dieta 'Normal' por defecto creadas.`,
          });
        } catch (dietaError) {
          console.error("Error creating default dieta:", dietaError);
          toast({
            title: "Advertencia: Dieta por Defecto Falló",
            description: `Residencia '${newResidenciaData.nombre}' (ID: ${docRef.id}) creada, pero falló la creación de la dieta por defecto. Error: ${dietaError instanceof Error ? dietaError.message : String(dietaError)}`,
            variant: "destructive",
            duration: 10000,
          });
        }
        toast({ title: "Residencia Creada", description: `Residencia '${newResidenciaData.nombre}' creada con ID: ${docRef.id}.` });
        if (userProfile?.id) { 
          await writeClientLog(
            userProfile.id, // actorUserId
            'residencia_created', // actionType
            { // logDetails
              residenciaId: docRef.id,
              details: `Residencia '${newResidenciaData.nombre || ''}' (ID: ${docRef.id}) creada por ${userProfile.email}.`
              // relatedDocPath: `residencias/${docRef.id}` // Optional
            }
          );
        }
      } else {
        toast({ title: "Acción no válida", description: "No se pudo determinar la acción a realizar.", variant: "destructive" });
        setFormLoading(false);
        return;
      }
      setShowCreateForm(false);
      setIsEditing(false);
      setAntelacionError(null);
      fetchResidences(); // Refresh the list
    } catch (error) {
      const errorMessage = `Error al guardar la residencia. ${error instanceof Error ? error.message : 'Error desconocido'}`;
      toast({ title: "Error", description: errorMessage, variant: "destructive" });
    } finally {
      setFormLoading(false);
    }
  };

  const handleDeleteResidencia = async (residenciaId: string, residenciaNombre: string) => {
    if (!isMasterUser) {
      toast({ title: "Acción no permitida", description: "Solo usuarios 'master' pueden eliminar residencias.", variant: "destructive" });
      return;
    }
    /* SECURITY NOTE: Server-side validation is CRUCIAL.
       Deletion should only be possible by 'master' users and should ideally
       trigger a process that handles associated data (e.g., users, comedores)
       gracefully, or warns the master user about orphaned data.
    */
    setFormLoading(true); // Use formLoading to indicate any CUD operation
    try {
      // Consider what happens to users, comedores, horarios, etc., linked to this residenciaId.
      // For now, direct deletion. A more robust solution might involve a Firebase Function
      // to clean up related data or mark the residencia as inactive.
      await deleteDoc(doc(db, 'residencias', residenciaId));
      fetchResidences(); 
      if (userProfile?.id) { 
        await writeClientLog(
          userProfile.id, // actorUserId
          'residencia_deleted', // actionType
          { // logDetails
            residenciaId: residenciaId,
            details: `Residencia '${residenciaNombre}' (ID: ${residenciaId}) eliminada por ${userProfile.email}.`
            // relatedDocPath: `residencias/${residenciaId}` // Optional
          }
        );
      }
      fetchResidences(); // Refresh the list
    } catch (error) {
      const errorMessage = `Error al eliminar la residencia. ${error instanceof Error ? error.message : 'Error desconocido'}`;
      toast({ title: "Error de Eliminación", description: errorMessage, variant: "destructive" });
    } finally {
      setFormLoading(false);
    }
  };

  // Add this handler function
  const handleTimezoneChange = useCallback((newTimezone: string) => {
    setCurrentResidencia(prev => ({
      ...prev,
      zonaHoraria: newTimezone,
    }));
  }, []);

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
    // User is not logged in, and all loading is complete.
    // The useEffect for redirection should have already handled it, but this is a fallback.
    return (
        <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
            <AlertCircle className="h-12 w-12 text-destructive mb-4" />
            <h1 className="text-2xl font-bold text-destructive mb-2">No Autenticado</h1>
            <p className="mb-4 text-muted-foreground">Debes iniciar sesión para acceder a esta página.</p>
            <Button onClick={() => router.push('/')}>Ir al Inicio</Button>
        </div>
    );
  }
  
  if (profileError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h1 className="text-2xl font-bold text-destructive mb-2">Error de Perfil</h1>
        <p className="mb-4 text-muted-foreground max-w-md">{profileError}</p>
        <Button onClick={() => router.push('/')}>Volver al Inicio</Button>
        <Button onClick={() => auth.signOut().then(() => router.push('/'))} variant="outline" className="mt-2">Cerrar Sesión</Button>
      </div>
    );
  }

  if (!isAuthorized && userProfile) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h1 className="text-2xl font-bold text-destructive mb-2">Acceso Denegado</h1>
        <p className="mb-4 text-muted-foreground max-w-md">
          Tu perfil (<span className="font-medium">{userProfile.email}</span>) no tiene los roles necesarios ('master' o 'admin') para acceder a esta sección.
        </p>
        <Button onClick={() => router.push('/')}>Volver al Inicio</Button>
        <Button onClick={() => auth.signOut().then(() => router.push('/'))} variant="outline" className="mt-2">Cerrar Sesión</Button>
      </div>
    );
  }

  // --- Main Page Content ---
  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex justify-between items-center">
        <div>
            <h1 className="text-3xl font-bold">Gestión de Residencias</h1>
            {userProfile && <p className="text-muted-foreground">Usuario: {userProfile.email} (Roles: {userProfile.roles?.join(', ') || 'N/A'})</p>}
        </div>
        <Button onClick={() => auth.signOut().then(() => router.push('/'))} variant="outline">Cerrar Sesión</Button>
      </div>

      {isMasterUser && !showCreateForm && (
        <Button onClick={handleCreateNew} className="mb-4">
          <PlusCircle className="mr-2 h-4 w-4" /> Crear Nueva Residencia
        </Button>
      )}

      {showCreateForm && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{isEditing ? 'Editar Residencia' : 'Crear Nueva Residencia'}</CardTitle>
            {!isEditing && isMasterUser && <CardDescription>Complete los detalles para la nueva residencia.</CardDescription>}
            {isEditing && <CardDescription>Modifique los detalles de la residencia: {currentResidencia.nombre}</CardDescription>}
          </CardHeader>
          <form onSubmit={handleSubmitForm}>
            <CardContent className="space-y-4">
              {/* Custom Residencia ID Input - Only for Creation */}
              {!isEditing && isMasterUser && (
                <div>
                  <Label htmlFor="id">
                    ID de Residencia (Slug) <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="id"
                    name="id"
                    value={currentResidencia.id || ''}
                    onChange={handleInputChange} // We might refine this later for formatting
                    placeholder="Ej: mi-residencia-favorita (solo minúsculas, números y guiones)"
                    disabled={formLoading}
                    required
                    aria-invalid={residenciaIdError ? "true" : "false"}
                    aria-describedby={residenciaIdError ? "residencia-id-error-message" : "residencia-id-description"}
                  />
                  <p id="residencia-id-description" className="text-xs text-muted-foreground mt-1">
                    Este ID se usará en la URL. Debe ser único. Use minúsculas, números y guiones.
                  </p>
                  {residenciaIdError && (
                    <p id="residencia-id-error-message" className="text-xs text-destructive mt-1">
                      {residenciaIdError}
                    </p>
                  )}
                </div>
              )}

              {/* Display Residencia ID when Editing (Read-only) */}
              {isEditing && (
                <div>
                  <Label htmlFor="id_display">ID de Residencia (Slug)</Label>
                  <Input
                    id="id_display"
                    name="id_display"
                    value={currentResidencia.id || ''}
                    readOnly
                    disabled
                    className="bg-muted/50"
                  />
                </div>
              )}              
              <div>
                <Label htmlFor="nombre">Nombre de la Residencia <span className="text-destructive">*</span></Label>
                <Input id="nombre" name="nombre" value={currentResidencia.nombre || ''} onChange={handleInputChange} required disabled={formLoading || (!isMasterUser && isEditing && !isAdminUser)}/>
              </div>
              <div>
                <Label htmlFor="direccion">Dirección</Label>
                <Textarea id="direccion" name="direccion" value={currentResidencia.direccion || ''} onChange={handleInputChange} disabled={formLoading || (!isMasterUser && isEditing && !isAdminUser && userProfile?.residenciaId !== currentResidencia.id )}/>
              </div>
              <div>
                <Label htmlFor="logoUrl">URL del Logo</Label>
                <Input id="logoUrl" name="logoUrl" type="url" value={currentResidencia.logoUrl || ''} onChange={handleInputChange} disabled={formLoading || (!isMasterUser && isEditing && !isAdminUser && userProfile?.residenciaId !== currentResidencia.id )}/>
              </div>
              {/* Timezone Selection using TimezoneSelector Component */}
              <div>
                <TimezoneSelector
                  label="Zona Horaria"
                  initialTimezone={currentResidencia.zonaHoraria || getNewResidenciaDefaults().zonaHoraria}
                  onTimezoneChange={handleTimezoneChange}
                  disabled={formLoading || Object.keys(timezones).length === 0 || (!isMasterUser && isEditing && !isAdminUser && userProfile?.residenciaId !== currentResidencia.id)}
                  // You can pass custom classNames if needed, e.g.:
                  // selectClassName="w-full p-2 border rounded mt-1 bg-background text-foreground"
                  // containerClassName="mb-4"
                  // labelClassName="block text-sm font-medium"
                />
              </div>
              {/* End of Timezone Selection */}

              <div>
                <Label htmlFor="antelacionActividadesDefault">Antelación Actividades Default (días)</Label>
                <Input 
                    id="antelacionActividadesDefault" 
                    name="antelacionActividadesDefault" 
                    type="number" 
                    value={currentResidencia.antelacionActividadesDefault ?? ''} 
                    onChange={handleInputChange} 
                    placeholder="Ej: 7" 
                    disabled={formLoading || (!isMasterUser && isEditing && !isAdminUser && userProfile?.residenciaId !== currentResidencia.id )}
                    aria-invalid={antelacionError ? "true" : "false"}
                    aria-describedby={antelacionError ? "antelacion-error-message" : undefined}
                  />
                  {antelacionError && (
                    <p id="antelacion-error-message" className="text-xs text-destructive mt-1">
                      {antelacionError}
                    </p>
                  )}
              </div>
              <div>
                <Label htmlFor="textProfile" className="text-sm font-medium">
                  Perfil de Textos (Opcional)
                </Label>
                <Input
                  id="textProfile"
                  name="textProfile"
                  type="text"
                  placeholder="Ej. espanol-alternativo, ingles-FL"
                  value={currentResidencia.textProfile || ''}
                  onChange={handleInputChange}
                  className="mt-1"
                  aria-describedby="textprofile-description"
                />
                <p id="textprofile-description" className="text-xs text-muted-foreground mt-1">
                  Nombre del archivo JSON (sin la extensión .json) que se usará para los textos de esta residencia.
                  Debe estar ubicado en /src/app/textos/. Si se deja vacío, se usará el comportamiento por defecto.
                </p>
              </div>
              <div>
                <Label htmlFor="tipoResidencia">Tipo de Residencia</Label>
                <select
                  id="tipoResidencia"
                  name="tipoResidencia"
                  value={currentResidencia.tipoResidencia || 'estudiantes'}
                  onChange={handleInputChange}
                  disabled={formLoading || (!isMasterUser && isEditing && !isAdminUser && userProfile?.residenciaId !== currentResidencia.id)}
                  className="w-full p-2 border rounded mt-1 bg-background text-foreground"
                >
                  <option value="estudiantes">Estudiantes</option>
                  <option value="profesionales">Profesionales</option>
                  <option value="gente_mayor">Gente Mayor</option>
                  {/* Add other options if TiposResidencia expands in the future */}
                </select>
              </div>
              <div>
                <Label htmlFor="esquemaAdministracion">Esquema de Administración</Label>
                <select
                  id="esquemaAdministracion"
                  name="esquemaAdministracion"
                  value={currentResidencia.esquemaAdministracion || 'estricto'}
                  onChange={handleInputChange}
                  disabled={formLoading || (!isMasterUser && isEditing && !isAdminUser && userProfile?.residenciaId !== currentResidencia.id)}
                  className="w-full p-2 border rounded mt-1 bg-background text-foreground"
                >
                  <option value="estricto">Estricto</option>
                  <option value="flexible">Flexible</option>
                </select>
              </div>
              {/* Nombre Tradicional Desayuno */}
              <div>
                <Label htmlFor="nombreTradicionalDesayuno">Nombre Tradicional Desayuno</Label>
                <Input
                  id="nombreTradicionalDesayuno"
                  name="nombreTradicionalDesayuno"
                  value={currentResidencia.nombreTradicionalDesayuno || ''}
                  onChange={handleInputChange}
                  disabled={formLoading || (!isMasterUser && isEditing && !isAdminUser && userProfile?.residenciaId !== currentResidencia.id)}
                  className="mt-1"
                  placeholder="Ej: Desayuno"
                />
              </div>

              {/* Nombre Tradicional Almuerzo */}
              <div>
                <Label htmlFor="nombreTradicionalAlmuerzo">Nombre Tradicional Almuerzo</Label>
                <Input
                  id="nombreTradicionalAlmuerzo"
                  name="nombreTradicionalAlmuerzo"
                  value={currentResidencia.nombreTradicionalAlmuerzo || ''}
                  onChange={handleInputChange}
                  disabled={formLoading || (!isMasterUser && isEditing && !isAdminUser && userProfile?.residenciaId !== currentResidencia.id)}
                  className="mt-1"
                  placeholder="Ej: Almuerzo"
                />
              </div>

              {/* Nombre Tradicional Cena */}
              <div>
                <Label htmlFor="nombreTradicionalCena">Nombre Tradicional Cena</Label>
                <Input
                  id="nombreTradicionalCena"
                  name="nombreTradicionalCena"
                  value={currentResidencia.nombreTradicionalCena || ''}
                  onChange={handleInputChange}
                  disabled={formLoading || (!isMasterUser && isEditing && !isAdminUser && userProfile?.residenciaId !== currentResidencia.id)}
                  className="mt-1"
                  placeholder="Ej: Cena"
                />
              </div>

              {/* Nombre Tradicional Lunes */}
              <div>
                <Label htmlFor="nombreTradicionalLunes">Nombre Tradicional Lunes</Label>
                <Input
                  id="nombreTradicionalLunes"
                  name="nombreTradicionalLunes"
                  value={currentResidencia.nombreTradicionalLunes || ''}
                  onChange={handleInputChange}
                  disabled={formLoading || (!isMasterUser && isEditing && !isAdminUser && userProfile?.residenciaId !== currentResidencia.id)}
                  className="mt-1"
                  placeholder="Ej: Lunes"
                />
              </div>

              {/* Nombre Tradicional Martes */}
              <div>
                <Label htmlFor="nombreTradicionalMartes">Nombre Tradicional Martes</Label>
                <Input
                  id="nombreTradicionalMartes"
                  name="nombreTradicionalMartes"
                  value={currentResidencia.nombreTradicionalMartes || ''}
                  onChange={handleInputChange}
                  disabled={formLoading || (!isMasterUser && isEditing && !isAdminUser && userProfile?.residenciaId !== currentResidencia.id)}
                  className="mt-1"
                  placeholder="Ej: Martes"
                />
              </div>

              {/* Nombre Tradicional Miercoles */}
              <div>
                <Label htmlFor="nombreTradicionalMiercoles">Nombre Tradicional Miércoles</Label>
                <Input
                  id="nombreTradicionalMiercoles"
                  name="nombreTradicionalMiercoles"
                  value={currentResidencia.nombreTradicionalMiercoles || ''}
                  onChange={handleInputChange}
                  disabled={formLoading || (!isMasterUser && isEditing && !isAdminUser && userProfile?.residenciaId !== currentResidencia.id)}
                  className="mt-1"
                  placeholder="Ej: Miércoles"
                />
              </div>

              {/* Nombre Tradicional Jueves */}
              <div>
                <Label htmlFor="nombreTradicionalJueves">Nombre Tradicional Jueves</Label>
                <Input
                  id="nombreTradicionalJueves"
                  name="nombreTradicionalJueves"
                  value={currentResidencia.nombreTradicionalJueves || ''}
                  onChange={handleInputChange}
                  disabled={formLoading || (!isMasterUser && isEditing && !isAdminUser && userProfile?.residenciaId !== currentResidencia.id)}
                  className="mt-1"
                  placeholder="Ej: Jueves"
                />
              </div>

              {/* Nombre Tradicional Viernes */}
              <div>
                <Label htmlFor="nombreTradicionalViernes">Nombre Tradicional Viernes</Label>
                <Input
                  id="nombreTradicionalViernes"
                  name="nombreTradicionalViernes"
                  value={currentResidencia.nombreTradicionalViernes || ''}
                  onChange={handleInputChange}
                  disabled={formLoading || (!isMasterUser && isEditing && !isAdminUser && userProfile?.residenciaId !== currentResidencia.id)}
                  className="mt-1"
                  placeholder="Ej: Viernes"
                />
              </div>

              {/* Nombre Tradicional Sabado */}
              <div>
                <Label htmlFor="nombreTradicionalSabado">Nombre Tradicional Sábado</Label>
                <Input
                  id="nombreTradicionalSabado"
                  name="nombreTradicionalSabado"
                  value={currentResidencia.nombreTradicionalSabado || ''}
                  onChange={handleInputChange}
                  disabled={formLoading || (!isMasterUser && isEditing && !isAdminUser && userProfile?.residenciaId !== currentResidencia.id)}
                  className="mt-1"
                  placeholder="Ej: Sábado"
                />
              </div>

              {/* Nombre Tradicional Domingo */}
              <div>
                <Label htmlFor="nombreTradicionalDomingo">Nombre Tradicional Domingo</Label>
                <Input
                  id="nombreTradicionalDomingo"
                  name="nombreTradicionalDomingo"
                  value={currentResidencia.nombreTradicionalDomingo || ''}
                  onChange={handleInputChange}
                  disabled={formLoading || (!isMasterUser && isEditing && !isAdminUser && userProfile?.residenciaId !== currentResidencia.id)}
                  className="mt-1"
                  placeholder="Ej: Domingo"
                />
              </div>

              {/* Campos Personalizados - Ejemplo con el 1, replicar para 2 y 3 si es necesario */}
              <Card>
                <CardHeader><CardTitle className="text-lg">Campo Personalizado 1</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                    <div className="flex items-center space-x-2">
                        <Checkbox id="campoPersonalizado1_isActive" name="campoPersonalizado1_isActive" checked={currentResidencia.campoPersonalizado1_isActive || false} onCheckedChange={(checked) => setCurrentResidencia(prev => ({...prev, campoPersonalizado1_isActive: Boolean(checked)}))} disabled={formLoading || (!isMasterUser && isEditing && !isAdminUser && userProfile?.residenciaId !== currentResidencia.id )}/>
                        <Label htmlFor="campoPersonalizado1_isActive">Activo</Label>
                    </div>
                    {currentResidencia.campoPersonalizado1_isActive && (
                        <>
                            <div>
                                <Label htmlFor="campoPersonalizado1_etiqueta">Etiqueta Campo Personalizado 1</Label>
                                <Input id="campoPersonalizado1_etiqueta" name="campoPersonalizado1_etiqueta" value={currentResidencia.campoPersonalizado1_etiqueta || ''} onChange={handleInputChange} disabled={formLoading || (!isMasterUser && isEditing && !isAdminUser && userProfile?.residenciaId !== currentResidencia.id )}/>
                            </div>
                             <div className="flex items-center space-x-2">
                                <Checkbox id="campoPersonalizado1_necesitaValidacion" name="campoPersonalizado1_necesitaValidacion" checked={currentResidencia.campoPersonalizado1_necesitaValidacion || false} onCheckedChange={(checked) => setCurrentResidencia(prev => ({...prev, campoPersonalizado1_necesitaValidacion: Boolean(checked)}))} disabled={formLoading || (!isMasterUser && isEditing && !isAdminUser && userProfile?.residenciaId !== currentResidencia.id )}/>
                                <Label htmlFor="campoPersonalizado1_necesitaValidacion">Necesita Validación (Regex)</Label>
                            </div>
                            {currentResidencia.campoPersonalizado1_necesitaValidacion && (
                                <div>
                                    <Label htmlFor="campoPersonalizado1_regexValidacion">Regex de Validación</Label>
                                    <Input id="campoPersonalizado1_regexValidacion" name="campoPersonalizado1_regexValidacion" value={currentResidencia.campoPersonalizado1_regexValidacion || ''} onChange={handleInputChange} disabled={formLoading || (!isMasterUser && isEditing && !isAdminUser && userProfile?.residenciaId !== currentResidencia.id )}/>
                                </div>
                            )}
                            <div>
                                <Label htmlFor="campoPersonalizado1_tamanoTexto">Tamaño del Texto</Label>
                                 <select
                                    id="campoPersonalizado1_tamanoTexto"
                                    name="campoPersonalizado1_tamanoTexto"
                                    value={currentResidencia.campoPersonalizado1_tamanoTexto || 'text'}
                                    onChange={handleInputChange}
                                    disabled={formLoading || (!isMasterUser && isEditing && !isAdminUser && userProfile?.residenciaId !== currentResidencia.id)}
                                    className="w-full p-2 border rounded"
                                >
                                    <option value="text">Una línea (Text)</option>
                                    <option value="textArea">Múltiples líneas (Textarea)</option>
                                </select>
                            </div>
                            <div className="flex items-center space-x-2 pt-2">
                              <Checkbox
                                  id="campoPersonalizado1_puedeModDirector"
                                  name="campoPersonalizado1_puedeModDirector"
                                  checked={currentResidencia.campoPersonalizado1_puedeModDirector || false}
                                  onCheckedChange={(checked) => setCurrentResidencia(prev => ({...prev, campoPersonalizado1_puedeModDirector: Boolean(checked)}))}
                                  disabled={formLoading || (!isMasterUser && isEditing && !isAdminUser && userProfile?.residenciaId !== currentResidencia.id)}
                              />
                              <Label htmlFor="campoPersonalizado1_puedeModDirector">Puede ser modificado por Director</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                              <Checkbox
                                  id="campoPersonalizado1_puedeModInteresado"
                                  name="campoPersonalizado1_puedeModInteresado"
                                  checked={currentResidencia.campoPersonalizado1_puedeModInteresado || false}
                                  onCheckedChange={(checked) => setCurrentResidencia(prev => ({...prev, campoPersonalizado1_puedeModInteresado: Boolean(checked)}))}
                                  disabled={formLoading || (!isMasterUser && isEditing && !isAdminUser && userProfile?.residenciaId !== currentResidencia.id)}
                              />
                              <Label htmlFor="campoPersonalizado1_puedeModInteresado">Puede ser modificado por Interesado</Label>
                          </div>
                        </>
                    )}
                </CardContent>
              </Card>

              {/* Card for Campo Personalizado 2 */}
              <Card>
                <CardHeader><CardTitle className="text-lg">Campo Personalizado 2</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                    <div className="flex items-center space-x-2">
                        <Checkbox id="campoPersonalizado2_isActive" name="campoPersonalizado2_isActive" checked={currentResidencia.campoPersonalizado2_isActive || false} onCheckedChange={(checked) => setCurrentResidencia(prev => ({...prev, campoPersonalizado2_isActive: Boolean(checked)}))} disabled={formLoading || (!isMasterUser && isEditing && !isAdminUser && userProfile?.residenciaId !== currentResidencia.id )}/>
                        <Label htmlFor="campoPersonalizado2_isActive">Activo</Label>
                    </div>
                    {currentResidencia.campoPersonalizado2_isActive && (
                        <>
                            <div>
                                <Label htmlFor="campoPersonalizado2_etiqueta">Etiqueta Campo Personalizado 2</Label>
                                <Input id="campoPersonalizado2_etiqueta" name="campoPersonalizado2_etiqueta" value={currentResidencia.campoPersonalizado2_etiqueta || ''} onChange={handleInputChange} disabled={formLoading || (!isMasterUser && isEditing && !isAdminUser && userProfile?.residenciaId !== currentResidencia.id )}/>
                            </div>
                             <div className="flex items-center space-x-2">
                                <Checkbox id="campoPersonalizado2_necesitaValidacion" name="campoPersonalizado2_necesitaValidacion" checked={currentResidencia.campoPersonalizado2_necesitaValidacion || false} onCheckedChange={(checked) => setCurrentResidencia(prev => ({...prev, campoPersonalizado2_necesitaValidacion: Boolean(checked)}))} disabled={formLoading || (!isMasterUser && isEditing && !isAdminUser && userProfile?.residenciaId !== currentResidencia.id )}/>
                                <Label htmlFor="campoPersonalizado2_necesitaValidacion">Necesita Validación (Regex)</Label>
                            </div>
                            {currentResidencia.campoPersonalizado2_necesitaValidacion && (
                                <div>
                                    <Label htmlFor="campoPersonalizado2_regexValidacion">Regex de Validación</Label>
                                    <Input id="campoPersonalizado2_regexValidacion" name="campoPersonalizado2_regexValidacion" value={currentResidencia.campoPersonalizado2_regexValidacion || ''} onChange={handleInputChange} disabled={formLoading || (!isMasterUser && isEditing && !isAdminUser && userProfile?.residenciaId !== currentResidencia.id )}/>
                                </div>
                            )}
                            <div>
                                <Label htmlFor="campoPersonalizado2_tamanoTexto">Tamaño del Texto</Label>
                                 <select
                                    id="campoPersonalizado2_tamanoTexto"
                                    name="campoPersonalizado2_tamanoTexto"
                                    value={currentResidencia.campoPersonalizado2_tamanoTexto || 'text'}
                                    onChange={handleInputChange}
                                    disabled={formLoading || (!isMasterUser && isEditing && !isAdminUser && userProfile?.residenciaId !== currentResidencia.id)}
                                    className="w-full p-2 border rounded"
                                >
                                    <option value="text">Una línea (Text)</option>
                                    <option value="textArea">Múltiples líneas (Textarea)</option>
                                </select>
                            </div>
                            <div className="flex items-center space-x-2 pt-2">
                                <Checkbox
                                    id="campoPersonalizado2_puedeModDirector"
                                    name="campoPersonalizado2_puedeModDirector"
                                    checked={currentResidencia.campoPersonalizado2_puedeModDirector || false}
                                    onCheckedChange={(checked) => setCurrentResidencia(prev => ({...prev, campoPersonalizado2_puedeModDirector: Boolean(checked)}))}
                                    disabled={formLoading || (!isMasterUser && isEditing && !isAdminUser && userProfile?.residenciaId !== currentResidencia.id)}
                                />
                                <Label htmlFor="campoPersonalizado2_puedeModDirector">Puede ser modificado por Director</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    id="campoPersonalizado2_puedeModInteresado"
                                    name="campoPersonalizado2_puedeModInteresado"
                                    checked={currentResidencia.campoPersonalizado2_puedeModInteresado || false}
                                    onCheckedChange={(checked) => setCurrentResidencia(prev => ({...prev, campoPersonalizado2_puedeModInteresado: Boolean(checked)}))}
                                    disabled={formLoading || (!isMasterUser && isEditing && !isAdminUser && userProfile?.residenciaId !== currentResidencia.id)}
                                />
                                <Label htmlFor="campoPersonalizado2_puedeModInteresado">Puede ser modificado por Interesado</Label>
                            </div>
                        </>
                    )}
                </CardContent>
              </Card>

              {/* Card for Campo Personalizado 3 */}
              <Card>
                <CardHeader><CardTitle className="text-lg">Campo Personalizado 3</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                    <div className="flex items-center space-x-2">
                        <Checkbox id="campoPersonalizado3_isActive" name="campoPersonalizado3_isActive" checked={currentResidencia.campoPersonalizado3_isActive || false} onCheckedChange={(checked) => setCurrentResidencia(prev => ({...prev, campoPersonalizado3_isActive: Boolean(checked)}))} disabled={formLoading || (!isMasterUser && isEditing && !isAdminUser && userProfile?.residenciaId !== currentResidencia.id )}/>
                        <Label htmlFor="campoPersonalizado3_isActive">Activo</Label>
                    </div>
                    {currentResidencia.campoPersonalizado3_isActive && (
                        <>
                            <div>
                                <Label htmlFor="campoPersonalizado3_etiqueta">Etiqueta Campo Personalizado 3</Label>
                                <Input id="campoPersonalizado3_etiqueta" name="campoPersonalizado3_etiqueta" value={currentResidencia.campoPersonalizado3_etiqueta || ''} onChange={handleInputChange} disabled={formLoading || (!isMasterUser && isEditing && !isAdminUser && userProfile?.residenciaId !== currentResidencia.id )}/>
                            </div>
                             <div className="flex items-center space-x-2">
                                <Checkbox id="campoPersonalizado3_necesitaValidacion" name="campoPersonalizado3_necesitaValidacion" checked={currentResidencia.campoPersonalizado3_necesitaValidacion || false} onCheckedChange={(checked) => setCurrentResidencia(prev => ({...prev, campoPersonalizado3_necesitaValidacion: Boolean(checked)}))} disabled={formLoading || (!isMasterUser && isEditing && !isAdminUser && userProfile?.residenciaId !== currentResidencia.id )}/>
                                <Label htmlFor="campoPersonalizado3_necesitaValidacion">Necesita Validación (Regex)</Label>
                            </div>
                            {currentResidencia.campoPersonalizado3_necesitaValidacion && (
                                <div>
                                    <Label htmlFor="campoPersonalizado3_regexValidacion">Regex de Validación</Label>
                                    <Input id="campoPersonalizado3_regexValidacion" name="campoPersonalizado3_regexValidacion" value={currentResidencia.campoPersonalizado3_regexValidacion || ''} onChange={handleInputChange} disabled={formLoading || (!isMasterUser && isEditing && !isAdminUser && userProfile?.residenciaId !== currentResidencia.id )}/>
                                </div>
                            )}
                            <div>
                                <Label htmlFor="campoPersonalizado3_tamanoTexto">Tamaño del Texto</Label>
                                 <select
                                    id="campoPersonalizado3_tamanoTexto"
                                    name="campoPersonalizado3_tamanoTexto"
                                    value={currentResidencia.campoPersonalizado3_tamanoTexto || 'text'}
                                    onChange={handleInputChange}
                                    disabled={formLoading || (!isMasterUser && isEditing && !isAdminUser && userProfile?.residenciaId !== currentResidencia.id)}
                                    className="w-full p-2 border rounded"
                                >
                                    <option value="text">Una línea (Text)</option>
                                    <option value="textArea">Múltiples líneas (Textarea)</option>
                                </select>
                            </div>
                        </>
                    )}
                </CardContent>
              </Card>
            </CardContent>
            <CardFooter className="flex justify-end space-x-2">
              <Button type="button" variant="outline" onClick={handleCancelForm} disabled={formLoading}>Cancelar</Button>
              <Button type="submit" disabled={formLoading || (!isMasterUser && !isAdminUser && userProfile?.residenciaId !== currentResidencia.id)}>
                {formLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : (isEditing ? 'Guardar Cambios' : 'Crear Residencia')}
              </Button>
            </CardFooter>
          </form>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Lista de Residencias</CardTitle>
          <CardDescription>
            {isMasterUser ? "Puedes ver, editar y eliminar todas las residencias." : 
             isAdminUser && userProfile?.residenciaId ? "Puedes ver y editar tu residencia asignada." :
             isAdminUser ? "No tienes una residencia asignada para administrar." : ""
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingResidences && <div className="flex items-center"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cargando...</div>}
          {errorResidences && <p className="text-destructive">Error: {errorResidences}</p>}
          {!isLoadingResidences && !errorResidences && residences.length === 0 && (
            <p>No hay residencias para mostrar.</p>
          )}
          {!isLoadingResidences && !errorResidences && residences.length > 0 && (
            <div className="space-y-2">
              {residences.map(res => (
                <Card key={res.id} className="flex flex-col md:flex-row justify-between items-start md:items-center p-3">
                  <div className="mb-2 md:mb-0">
                    <p className="font-semibold">{res.nombre} <span className="text-xs text-muted-foreground">(ID: {res.id})</span></p>
                    <p className="text-sm text-muted-foreground">{res.direccion}</p>
                  </div>
                  <div className="flex space-x-2">
                    {(isMasterUser || (isAdminUser && userProfile?.residenciaId === res.id)) && (
                       <Button variant="outline" size="sm" onClick={() => handleEdit(res)} disabled={formLoading}>
                         <Edit className="mr-1 h-3 w-3" /> Editar
                       </Button>
                    )}
                    {isMasterUser && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive" size="sm" disabled={formLoading}>
                            <Trash2 className="mr-1 h-3 w-3" /> Eliminar
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Esta acción no se puede deshacer. Esto eliminará permanentemente la residencia '{res.nombre}'.
                              Asegúrate de entender las consecuencias (ej. datos asociados).
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel disabled={formLoading}>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDeleteResidencia(res.id, res.nombre)} disabled={formLoading}>
                              {formLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                              Eliminar
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                     {!isMasterUser && !(isAdminUser && userProfile?.residenciaId === res.id) && (
                         <Button variant="outline" size="sm" onClick={() => handleEdit(res)} disabled={true} title="Solo lectura para tu rol">
                             <Eye className="mr-1 h-3 w-3" /> Ver (Solo Lectura)
                         </Button>
                     )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
