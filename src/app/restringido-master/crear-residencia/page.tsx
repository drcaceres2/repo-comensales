'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/useToast';
import { useAuth } from '@/hooks/useAuth';
import { auth, db } from '@/lib/firebase';
import { UserProfile, Residencia, Ubicacion, ConfiguracionCampo } from '../../../../shared/models/types';
import countriesData from '../../../../shared/data/countries.json';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  doc,
  collection,
  getDoc,
  getDocs,
  query,
  where,
  orderBy
} from 'firebase/firestore';

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea"; // For multi-line fields like direccion
import { Checkbox } from "@/components/ui/checkbox"; // For boolean fields
import { Label } from "@/components/ui/label";
import TimezoneSelector from "@/components/ui/TimezoneSelector";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, AlertCircle, PlusCircle, Edit, Trash2, Eye } from 'lucide-react';

const getNewResidenciaDefaults = (): Partial<Residencia> => ({ // Changed return type
  id: '', // Added id field
  nombre: '',
  direccion: '',
  logoUrl: '',
  configuracionContabilidad: null,
  antelacionActividadesDefault: 7,
  tipoResidencia: 'estudiantes',
  esquemaAdministracion: 'estricto',
  ubicacion: {
    pais: 'HN',
    ciudad: 'Tegucigalpa',
    timezone: 'America/Tegucigalpa',
    direccion: ''
  },
  camposPersonalizados: {},
  textProfile: 'espanol-honduras',
});

function CrearResidenciaAdminPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { user: authUser, loading: authFirebaseLoading, error: authFirebaseError } = useAuth();
  const functionsInstance = getFunctions(auth.app);
  const createResidenciaCallable = httpsCallable(functionsInstance, 'createResidencia');
  const updateResidenciaCallable = httpsCallable(functionsInstance, 'updateResidencia');
  const deleteResidenciaCallable = httpsCallable(functionsInstance, 'deleteResidencia');

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

  // Helper for ubicacion change
  const handleUbicacionChange = (field: keyof Ubicacion, value: string) => {
    setCurrentResidencia(prev => ({
      ...prev,
      ubicacion: {
        ...prev.ubicacion!, // Assume initialized in defaults or loaded
        [field]: value
      }
    }));
  };

  const [formData, setFormData] = useState<Partial<Omit<Residencia, 'id'>>>(getNewResidenciaDefaults());
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

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

  const handleSelectChange = (name: keyof Partial<Residencia>) => (value: string) => {
    setCurrentResidencia(prev => ({
      ...prev,
      [name]: value
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
    // Ensure ubicacion exists if editing legacy data
    const residenciaToEdit = { ...getNewResidenciaDefaults(), ...residencia };
    if (!residenciaToEdit.ubicacion) {
        // Fallback migration for old data if needed
         residenciaToEdit.ubicacion = {
            pais: 'HN', // Default or try to guess?
            ciudad: 'Tegucigalpa',
            timezone: (residencia as any).zonaHoraria || 'America/Tegucigalpa',
            direccion: residencia.direccion
        };
    }
    setCurrentResidencia(residenciaToEdit);
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
    setAntelacionError(null);

    if (!userProfile || (!isMasterUser && !isEditing)) {
      toast({ title: "Acción no permitida", description: "No tienes permisos para esta acción.", variant: "destructive" });
      return;
    }

    // Basic client-side validations
    if (typeof currentResidencia.nombre !== 'string' || !currentResidencia.nombre.trim()) {
        toast({ title: "Campo requerido", description: "El nombre de la residencia es obligatorio.", variant: "default"});
        return;
    }

    if (!currentResidencia.ubicacion?.timezone || !currentResidencia.ubicacion.timezone.includes('/')) {
        toast({ title: "Campo requerido", description: "La zona horaria es obligatoria y debe tener un formato válido (Ej: Region/Ciudad).", variant: "default"});
        return;
    }

    if (!currentResidencia.ubicacion?.pais) {
         toast({ title: "Campo requerido", description: "El país es obligatorio.", variant: "default"});
         return;
    }

    if (!currentResidencia.ubicacion?.ciudad) {
         toast({ title: "Campo requerido", description: "La ciudad es obligatoria.", variant: "default"});
         return;
    }

    setFormLoading(true);
    try {
      // Prepare the data to save
      const residenciaData: Omit<Residencia, 'id'> = {
        nombre: currentResidencia.nombre || '',
        direccion: currentResidencia.direccion || '',
        logoUrl: currentResidencia.logoUrl || '',
        configuracionContabilidad: null,
        antelacionActividadesDefault: currentResidencia.antelacionActividadesDefault || 7,
        tipoResidencia: currentResidencia.tipoResidencia || 'estudiantes',
        esquemaAdministracion: currentResidencia.esquemaAdministracion || 'estricto',
        ubicacion: {
            pais: currentResidencia.ubicacion!.pais,
            region: currentResidencia.ubicacion!.region || '',
            ciudad: currentResidencia.ubicacion!.ciudad,
            direccion: currentResidencia.ubicacion!.direccion || currentResidencia.direccion || '', // Sync or fallback
            timezone: currentResidencia.ubicacion!.timezone,
        },
        camposPersonalizados: currentResidencia.camposPersonalizados || {},
        textProfile: currentResidencia.textProfile || 'espanol-honduras',
        estadoContrato: 'activo',
      };

      if (isEditing && currentResidencia.id) {
        // UPDATE: Use Cloud Function
        const existingResidenciaId = currentResidencia.id;
        if (!isMasterUser && !(isAdminUser && userProfile?.residenciaId === existingResidenciaId)) {
          toast({ title: "Acción no permitida", description: "No tienes permisos para editar esta residencia.", variant: "destructive" });
          setFormLoading(false);
          return;
        }
        const result = await updateResidenciaCallable({ 
          residenciaIdToUpdate: existingResidenciaId,
          profileData: residenciaData
        }) as any;
        toast({ title: "Residencia Actualizada", description: `Residencia actualizada con éxito.` });
      } else if (!isEditing && isMasterUser) {
        // CREATE: Use Cloud Function
        const customId = currentResidencia.id?.trim();
        if (!customId) {
          toast({ title: "Error de Validación", description: "El ID de la Residencia (Slug) es obligatorio.", variant: "destructive" });
          setFormLoading(false);
          setResidenciaIdError("El ID de la Residencia (Slug) es obligatorio.");
          return;
        }
        setResidenciaIdError(null);
        const result = await createResidenciaCallable({ 
          residenciaId: customId,
          profileData: residenciaData
        }) as any;
        toast({ title: "Residencia Creada", description: `Residencia '${residenciaData.nombre}' (ID: ${customId}) creada con éxito.` });
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
    setFormLoading(true);
    try {
      const result = await deleteResidenciaCallable({ 
        residenciaIdToDelete: residenciaId
      }) as any;
      toast({ title: "Residencia Eliminada", description: `Residencia '${residenciaNombre}' eliminada con éxito.` });
      fetchResidences();
    } catch (error: any) {
      const errorMessage = error.message || 'Error desconocido';
      toast({ title: "Error de Eliminación", description: errorMessage, variant: "destructive" });
    } finally {
      setFormLoading(false);
    }
  };

  const handleCampoPersonalizadoChange = (key: string, field: keyof ConfiguracionCampo, value: any) => {
    setCurrentResidencia(prev => {
      const newCamposPersonalizados = { ...prev.camposPersonalizados };
      if (newCamposPersonalizados[key]) {
        (newCamposPersonalizados[key] as any)[field] = value;
      }
      return { ...prev, camposPersonalizados: newCamposPersonalizados };
    });
  };

  const addCampoPersonalizado = () => {
    setCurrentResidencia(prev => {
      const newCamposPersonalizados = { ...prev.camposPersonalizados };
      const newKey = `campo${Date.now()}`;
      newCamposPersonalizados[newKey] = {
        etiqueta: 'Nuevo Campo',
        isActive: true,
        esObligatorio: false,
        necesitaValidacion: false,
        regexValidacion: '',
        tamanoTexto: 'text',
        puedeModDirector: true,
        puedeModInteresado: true,
      };
      return { ...prev, camposPersonalizados: newCamposPersonalizados };
    });
  };

  const removeCampoPersonalizado = (key: string) => {
    setCurrentResidencia(prev => {
      const newCamposPersonalizados = { ...prev.camposPersonalizados };
      delete newCamposPersonalizados[key];
      return { ...prev, camposPersonalizados: newCamposPersonalizados };
    });
  };

  // Add this handler function
  const handleTimezoneChange = useCallback((newTimezone: string) => {
    setCurrentResidencia(prev => ({
      ...prev,
      ubicacion: {
        ...prev.ubicacion!,
        timezone: newTimezone
      }
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
                    ID de Residencia <span className="text-destructive">*</span>
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="pais">País <span className="text-destructive">*</span></Label>
                    <Select
                      value={currentResidencia.ubicacion?.pais || 'HN'}
                      onValueChange={(val) => handleUbicacionChange('pais', val)}
                      disabled={formLoading || (!isMasterUser && isEditing && !isAdminUser && userProfile?.residenciaId !== currentResidencia.id)}
                    >
                      <SelectTrigger id="pais">
                        <SelectValue placeholder="Seleccionar País" />
                      </SelectTrigger>
                      <SelectContent>
                          {countriesData.map((c: {code: string, name: string}) => (
                              <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="region">Región / Estado / Provincia</Label>
                    <Input
                        id="region"
                        value={currentResidencia.ubicacion?.region || ''}
                        onChange={(e) => handleUbicacionChange('region', e.target.value)}
                        placeholder="Ej. Francisco Morazán"
                        disabled={formLoading || (!isMasterUser && isEditing && !isAdminUser && userProfile?.residenciaId !== currentResidencia.id)}
                    />
                  </div>
              </div>

               <div>
                <Label htmlFor="ciudad">Ciudad <span className="text-destructive">*</span></Label>
                <Input
                    id="ciudad"
                    value={currentResidencia.ubicacion?.ciudad || ''}
                    onChange={(e) => handleUbicacionChange('ciudad', e.target.value)}
                    placeholder="Ej. Tegucigalpa"
                    required
                    disabled={formLoading || (!isMasterUser && isEditing && !isAdminUser && userProfile?.residenciaId !== currentResidencia.id)}
                />
              </div>

              {/* Timezone Selection using TimezoneSelector Component */}
              <div>
                <TimezoneSelector
                  label="Zona Horaria"
                  initialTimezone={currentResidencia.ubicacion?.timezone || 'America/Tegucigalpa'}
                  onTimezoneChange={handleTimezoneChange}
                  disabled={formLoading || (!isMasterUser && isEditing && !isAdminUser && userProfile?.residenciaId !== currentResidencia.id)}
                  allowManualEntry={true}
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
                <Select
                  value={currentResidencia.tipoResidencia || 'estudiantes'}
                  onValueChange={handleSelectChange('tipoResidencia')}
                  disabled={formLoading || (!isMasterUser && isEditing && !isAdminUser && userProfile?.residenciaId !== currentResidencia.id)}
                >
                  <SelectTrigger id="tipoResidencia">
                    <SelectValue placeholder="Tipo de Residencia" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="estudiantes">Estudiantes</SelectItem>
                    <SelectItem value="profesionales">Profesionales</SelectItem>
                    <SelectItem value="gente_mayor">Gente Mayor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="esquemaAdministracion">Esquema de Administración</Label>
                <Select
                  value={currentResidencia.esquemaAdministracion || 'estricto'}
                  onValueChange={handleSelectChange('esquemaAdministracion')}
                  disabled={formLoading || (!isMasterUser && isEditing && !isAdminUser && userProfile?.residenciaId !== currentResidencia.id)}
                >
                  <SelectTrigger id="esquemaAdministracion">
                    <SelectValue placeholder="Esquema de Administración" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="estricto">Estricto</SelectItem>
                    <SelectItem value="flexible">Flexible</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Campos Personalizados</CardTitle>
                  <CardDescription>
                    Define campos adicionales para los perfiles de usuario.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {Object.keys(currentResidencia.camposPersonalizados || {}).map((key) => {
                    const campo = (currentResidencia.camposPersonalizados || {})[key];
                    return (
                      <Card key={key} className="p-4">
                        <div className="flex justify-between items-center mb-2">
                          <p className="font-semibold">{campo.etiqueta || `Campo ${key}`}</p>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeCampoPersonalizado(key)}
                            disabled={formLoading || (!isMasterUser && isEditing && !isAdminUser && userProfile?.residenciaId !== currentResidencia.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="space-y-3">
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id={`${key}-isActive`}
                              checked={campo.isActive}
                              onCheckedChange={(checked) => handleCampoPersonalizadoChange(key, 'isActive', !!checked)}
                              disabled={formLoading || (!isMasterUser && isEditing && !isAdminUser && userProfile?.residenciaId !== currentResidencia.id)}
                            />
                            <Label htmlFor={`${key}-isActive`}>Activo</Label>
                          </div>
                          {campo.isActive && (
                            <>
                              <div>
                                <Label htmlFor={`${key}-etiqueta`}>Etiqueta</Label>
                                <Input
                                  id={`${key}-etiqueta`}
                                  value={campo.etiqueta || ''}
                                  onChange={(e) => handleCampoPersonalizadoChange(key, 'etiqueta', e.target.value)}
                                  disabled={formLoading || (!isMasterUser && isEditing && !isAdminUser && userProfile?.residenciaId !== currentResidencia.id)}
                                />
                              </div>
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id={`${key}-esObligatorio`}
                                  checked={campo.esObligatorio || false}
                                  onCheckedChange={(checked) => handleCampoPersonalizadoChange(key, 'esObligatorio', !!checked)}
                                  disabled={formLoading || (!isMasterUser && isEditing && !isAdminUser && userProfile?.residenciaId !== currentResidencia.id)}
                                />
                                <Label htmlFor={`${key}-esObligatorio`}>Es Obligatorio</Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id={`${key}-necesitaValidacion`}
                                  checked={campo.necesitaValidacion || false}
                                  onCheckedChange={(checked) => handleCampoPersonalizadoChange(key, 'necesitaValidacion', !!checked)}
                                  disabled={formLoading || (!isMasterUser && isEditing && !isAdminUser && userProfile?.residenciaId !== currentResidencia.id)}
                                />
                                <Label htmlFor={`${key}-necesitaValidacion`}>Necesita Validación (Regex)</Label>
                              </div>
                              {campo.necesitaValidacion && (
                                <div>
                                  <Label htmlFor={`${key}-regexValidacion`}>Regex de Validación</Label>
                                  <Input
                                    id={`${key}-regexValidacion`}
                                    value={campo.regexValidacion || ''}
                                    onChange={(e) => handleCampoPersonalizadoChange(key, 'regexValidacion', e.target.value)}
                                    disabled={formLoading || (!isMasterUser && isEditing && !isAdminUser && userProfile?.residenciaId !== currentResidencia.id)}
                                  />
                                </div>
                              )}
                              <div>
                                <Label htmlFor={`${key}-tamanoTexto`}>Tamaño del Texto</Label>
                                <Select
                                  value={campo.tamanoTexto || 'text'}
                                  onValueChange={(value) => handleCampoPersonalizadoChange(key, 'tamanoTexto', value)}
                                  disabled={formLoading || (!isMasterUser && isEditing && !isAdminUser && userProfile?.residenciaId !== currentResidencia.id)}
                                >
                                  <SelectTrigger id={`${key}-tamanoTexto`}>
                                    <SelectValue placeholder="Tamaño del Texto" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="text">Una línea (Text)</SelectItem>
                                    <SelectItem value="textArea">Múltiples líneas (Textarea)</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="flex items-center space-x-2 pt-2">
                                <Checkbox
                                  id={`${key}-puedeModDirector`}
                                  checked={campo.puedeModDirector || false}
                                  onCheckedChange={(checked) => handleCampoPersonalizadoChange(key, 'puedeModDirector', !!checked)}
                                  disabled={formLoading || (!isMasterUser && isEditing && !isAdminUser && userProfile?.residenciaId !== currentResidencia.id)}
                                />
                                <Label htmlFor={`${key}-puedeModDirector`}>Puede ser modificado por Director</Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id={`${key}-puedeModInteresado`}
                                  checked={campo.puedeModInteresado || false}
                                  onCheckedChange={(checked) => handleCampoPersonalizadoChange(key, 'puedeModInteresado', !!checked)}
                                  disabled={formLoading || (!isMasterUser && isEditing && !isAdminUser && userProfile?.residenciaId !== currentResidencia.id)}
                                />
                                <Label htmlFor={`${key}-puedeModInteresado`}>Puede ser modificado por Interesado</Label>
                              </div>
                            </>
                          )}
                        </div>
                      </Card>
                    );
                  })}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={addCampoPersonalizado}
                    disabled={formLoading || (!isMasterUser && isEditing && !isAdminUser && userProfile?.residenciaId !== currentResidencia.id)}
                  >
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Añadir Campo Personalizado
                  </Button>
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
          {isLoadingResidences ? (
            <div className="flex items-center justify-center p-6">
              <Loader2 className="mr-2 h-6 w-6 animate-spin" /> 
              <span className="text-muted-foreground">Cargando residencias...</span>
            </div>
          ) : errorResidences ? (
            <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 text-center">
                <AlertCircle className="mx-auto h-10 w-10 text-destructive" />
                <h3 className="mt-2 text-lg font-semibold text-destructive">Error al Cargar Residencias</h3>
                <p className="mt-1 text-sm text-destructive/80">
                    No pudimos recuperar la lista de residencias. Por favor, revisa tu conexión o intenta más tarde.
                </p>
                <p className="mt-3 text-xs text-muted-foreground">
                    <span className="font-semibold">Detalle técnico:</span> {errorResidences}
                </p>
            </div>
          ) : residences.length === 0 ? (
            <div className="text-center p-8 border-2 border-dashed rounded-lg">
              <h3 className="text-xl font-semibold">No hay residencias creadas</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Parece que aún no se ha configurado ninguna residencia.
              </p>
              {isMasterUser && (
                  <Button onClick={handleCreateNew} className="mt-4">
                      <PlusCircle className="mr-2 h-4 w-4" /> Crear la primera residencia
                  </Button>
              )}
            </div>
          ) : (
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

export default CrearResidenciaAdminPage;
