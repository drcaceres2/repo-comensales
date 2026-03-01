'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  doc,
  collection,
  getDoc,
  getDocs,
  query,
  orderBy
} from 'firebase/firestore';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'next/navigation';

import { auth, db } from '@/lib/firebase';
import { useToast } from '@/hooks/useToast';
import { type Ubicacion } from 'shared/schemas/common';
import { Residencia, ResidenciaConVersion, CampoPersonalizado } from 'shared/schemas/residencia';
import { Usuario } from 'shared/schemas/usuarios';
import { RolUsuario, HORARIOS_QUERY_KEY } from 'shared/models/types';
import countriesData from 'shared/data/countries.json';


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
import {useInfoUsuario} from "@/components/layout/AppProviders";

const getNewResidenciaDefaults = (): Partial<ResidenciaConVersion> => ({
  id: '',
  nombre: '',
  direccion: '',
  logoUrl: '',
  contextoTraduccion: 'es',
  tipo: {
    tipoResidentes: 'estudiantes',
    modalidadResidencia: 'hombres',
  },
  ubicacion: {
    pais: 'HN',
    ciudad: 'Tegucigalpa',
    zonaHoraria: 'America/Tegucigalpa',
    direccion: ''
  },
  camposPersonalizadosResidencia: {},
  camposPersonalizadosPorUsuario: [],
  estadoContrato: 'activo',
  estado: 'aprovisionado',
  version: 0
});

function CrearResidenciaAdminPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { toast } = useToast();
  const { usuarioId: authUser, email: userEmail, roles: userRoles } = useInfoUsuario();
  const functionsInstance = getFunctions(auth.app);
  const createResidenciaCallable = httpsCallable(functionsInstance, 'createResidencia');
  const updateResidenciaCallable = httpsCallable(functionsInstance, 'updateResidencia');
  const deleteResidenciaCallable = httpsCallable(functionsInstance, 'deleteResidencia');
  const queryClient = useQueryClient();
  const [isAuthorized, setIsAuthorized] = useState<boolean>(false);
  const [isMasterUser, setIsMasterUser] = useState<boolean>(false);

  const [residences, setResidences] = useState<Residencia[]>([]);
  const [isLoadingResidences, setIsLoadingResidences] = useState<boolean>(false);
  const [errorResidences, setErrorResidences] = useState<string | null>(null);

  const [showCreateForm, setShowCreateForm] = useState<boolean>(false);
  const [currentResidencia, setCurrentResidencia] = useState<Partial<ResidenciaConVersion>>(getNewResidenciaDefaults());
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [formLoading, setFormLoading] = useState<boolean>(false);
  const [residenciaIdError, setResidenciaIdError] = useState<string | null>(null);

  const [residenciaFields, setResidenciaFields] = useState<{ id: number; key: string; value: string }[]>([]);

  const rolesAutorizados: RolUsuario[] = ['admin', 'master'];

  useEffect(() => {
    if (!authUser || !userRoles || !rolesAutorizados.some(r => userRoles.includes(r))) {
      setIsAuthorized(false);
    } else {
      setIsAuthorized(true);
    }
    if (userRoles.includes('master')) setIsMasterUser(true);
  }, [authUser, userRoles, isAuthorized] );

  useEffect(() => {
    // Sync UI state from form state when editing
    const fields = currentResidencia.camposPersonalizadosResidencia || {};
    // A simple Object.entries is enough if you don't need a stable ID
    setResidenciaFields(
      Object.entries(fields).map(([key, value], index) => ({ id: Date.now() + index, key, value }))
    );
  }, [isEditing, currentResidencia.id]); 

  useEffect(() => {
    // Sync form state from UI state
    const newCampos = residenciaFields.reduce((acc, field) => {
      if (field.key) { // Only add fields that have a key
        acc[field.key] = field.value;
      }
      return acc;
    }, {} as Record<string, string>);

    // Avoid triggering an infinite loop of updates
    if (JSON.stringify(newCampos) !== JSON.stringify(currentResidencia.camposPersonalizadosResidencia)) {
        setCurrentResidencia(prev => ({
          ...prev,
          camposPersonalizadosResidencia: newCampos
        }));
    }
  }, [residenciaFields]);

  const handleResidenciaFieldChange = (id: number, field: 'key' | 'value', value: string) => {
    setResidenciaFields(prevFields =>
      prevFields.map(f => (f.id === id ? { ...f, [field]: value } : f))
    );
  };

  const addResidenciaField = () => {
    setResidenciaFields(prev => [...prev, { id: Date.now(), key: '', value: '' }]);
  };

  const removeResidenciaField = (id: number) => {
    setResidenciaFields(prev => prev.filter(f => f.id !== id));
  };

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

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // --- Redirect if not authenticated after loading ---
  if (!authUser) {
    router.replace('/');
  }

  // --- Fetch Residences Function ---
  const fetchResidences = useCallback(async () => {
    if (!authUser || !isAuthorized) {
      setResidences([]);
      return;
    }

    setIsLoadingResidences(true);
    setErrorResidences(null);
    try {
      let residencesQuery;
      if (isMasterUser) {
        residencesQuery = query(collection(db, 'residencias'), orderBy("nombre"));
      } else {
        setResidences([]);
        setIsLoadingResidences(false);
        toast({ title: t('gestionResidencias.informacion'), description: t('gestionResidencias.soloMaster'), variant: "default" });
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
      toast({ title: t('gestionResidencias.error'), description: t('gestionResidencias.noSePudieronCargarLasResidencias'), variant: "destructive" });
    } finally {
      setIsLoadingResidences(false);
    }
  }, [authUser, isAuthorized, isMasterUser, toast, t]);

  // --- useEffect: Fetch residences when authorization changes ---
  useEffect(() => {
    if (isAuthorized && authUser) {
      fetchResidences();
    } else {
      setResidences([]); // Clear residences if not authorized
    }
  }, [isAuthorized, authUser, fetchResidences]);

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
      toast({ title: t('gestionResidencias.accionNoPermitida'), description: t('gestionResidencias.soloMasterPuedeCrear'), variant: "destructive" });
      return;
    }
    setCurrentResidencia(getNewResidenciaDefaults());
    setIsEditing(false);
    setShowCreateForm(true);
  };

  const handleEdit = async (residencia: Residencia) => {
    if (!isMasterUser) {
         toast({ title: t('gestionResidencias.accionNoPermitida'), description: t('gestionResidencias.sinPermisoParaEditar'), variant: "destructive" });
        return;
    }
    
    setFormLoading(true); // Show loader while we fetch config
    
    // Ensure the object to be edited conforms to the latest structure, merging defaults for missing top-level properties.
    const residenciaToEdit = { ...getNewResidenciaDefaults(), ...residencia };

    // Handle legacy data: if `ubicacion` is missing, create it
    if (!residenciaToEdit.ubicacion) {
        residenciaToEdit.ubicacion = {
            pais: 'HN',
            ciudad: 'Tegucigalpa',
            zonaHoraria: 'America/Tegucigalpa',
            direccion: residencia.direccion
        };
    }

    try {
        const configDocRef = doc(db, `residencias/${residencia.id}/configuracion/general`);
        const configSnap = await getDoc(configDocRef);
        
        if (configSnap.exists()) {
            const configData = configSnap.data();
            residenciaToEdit.version = configData.version;
        } else {
            // If config doesn't exist, we can assume version 0 or handle as an error.
            // For robustness, let's warn the user and default to 0.
            toast({ title: "Advertencia", description: "No se encontró el documento de configuración. Se asumirá la versión 0.", variant: "default" });
            residenciaToEdit.version = 0;
        }

        setCurrentResidencia(residenciaToEdit);
        setIsEditing(true);
        setShowCreateForm(true);
    } catch (error: any) {
        toast({ title: "Error", description: `No se pudo cargar la configuración de la residencia: ${error.message}`, variant: "destructive" });
    } finally {
        setFormLoading(false);
    }
  };

  const handleCancelForm = () => {
    setShowCreateForm(false);
    setIsEditing(false);
    setCurrentResidencia(getNewResidenciaDefaults());
    // The TimezoneSelector will automatically pick up the zonaHoraria from currentResidencia
  };

  const handleSubmitForm = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!authUser || !isMasterUser) {
      toast({ title: t('gestionResidencias.accionNoPermitida'), description: t('gestionResidencias.sinPermisos'), variant: "destructive" });
      return;
    }

    // Basic client-side validations
    if (typeof currentResidencia.nombre !== 'string' || !currentResidencia.nombre.trim()) {
        toast({ title: t('gestionResidencias.campoRequerido'), description: t('gestionResidencias.nombreResidenciaObligatorio'), variant: "default"});
        return;
    }

    if (!currentResidencia.ubicacion?.zonaHoraria || !currentResidencia.ubicacion.zonaHoraria.includes('/')) {
        toast({ title: t('gestionResidencias.campoRequerido'), description: t('gestionResidencias.zonaHorariaObligatoria'), variant: "default"});
        return;
    }

    if (!currentResidencia.ubicacion?.pais) {
         toast({ title: t('gestionResidencias.campoRequerido'), description: t('gestionResidencias.paisObligatorio'), variant: "default"});
         return;
    }

    if (!currentResidencia.ubicacion?.ciudad) {
         toast({ title: t('gestionResidencias.campoRequerido'), description: t('gestionResidencias.ciudadObligatoria'), variant: "default"});
         return;
    }

    setFormLoading(true);
    try {
      // Prepare the data to save
      const residenciaData: Omit<Residencia, 'id'> = {
        nombre: currentResidencia.nombre || '',
        direccion: currentResidencia.direccion || '',
        logoUrl: currentResidencia.logoUrl || '',
        contextoTraduccion: currentResidencia.contextoTraduccion || 'es-HN',
        tipo: {
            tipoResidentes: currentResidencia.tipo?.tipoResidentes || 'estudiantes',
            modalidadResidencia: currentResidencia.tipo?.modalidadResidencia || 'hombres',
        },
        ubicacion: {
            pais: currentResidencia.ubicacion!.pais,
            region: currentResidencia.ubicacion!.region || '',
            ciudad: currentResidencia.ubicacion!.ciudad,
            direccion: currentResidencia.ubicacion!.direccion || currentResidencia.direccion || '', // Sync or fallback
            zonaHoraria: currentResidencia.ubicacion!.zonaHoraria,
        },
        camposPersonalizadosResidencia: currentResidencia.camposPersonalizadosResidencia || {},
        camposPersonalizadosPorUsuario: currentResidencia.camposPersonalizadosPorUsuario || [],
        estadoContrato: currentResidencia.estadoContrato || 'activo',
        estado: currentResidencia.estado || 'aprovisionado',
      };

      if (isEditing && currentResidencia.id) {
        // UPDATE: Use Cloud Function
        const existingResidenciaId = currentResidencia.id;
        if (!isMasterUser) {
          toast({ title: t('gestionResidencias.accionNoPermitida'), description: t('gestionResidencias.sinPermisoParaEditar'), variant: "destructive" });
          setFormLoading(false);
          return;
        }
        const result = await updateResidenciaCallable({
          residenciaIdToUpdate: existingResidenciaId,
          profileData: residenciaData,
          version: currentResidencia.version
        }) as any;
        toast({ title: t('gestionResidencias.residenciaActualizada'), description: t('gestionResidencias.residenciaActualizadaExito') });
        queryClient.invalidateQueries({ queryKey: [HORARIOS_QUERY_KEY, existingResidenciaId] });
      } else if (!isEditing && isMasterUser) {
        // CREATE: Use Cloud Function
        const customId = currentResidencia.id?.trim();
        if (!customId) {
          toast({ title: t('gestionResidencias.errorValidacion'), description: t('gestionResidencias.idResidenciaObligatorio'), variant: "destructive" });
          setFormLoading(false);
          setResidenciaIdError(t('gestionResidencias.idResidenciaObligatorio'));
          return;
        }
        setResidenciaIdError(null);
        const result = await createResidenciaCallable({ 
          residenciaId: customId,
          profileData: residenciaData
        }) as any;
        toast({ title: t('gestionResidencias.residenciaCreada'), description: t('gestionResidencias.residenciaCreadaExito', { nombre: residenciaData.nombre, id: customId }) });
      } else {
        toast({ title: t('gestionResidencias.accionNoValida'), description: t('gestionResidencias.noSePudoDeterminarAccion'), variant: "destructive" });
        setFormLoading(false);
        return;
      }
      setShowCreateForm(false);
      setIsEditing(false);
      const result = await fetchResidences(); // Refresh the list
    } catch (error: any) {
      console.error("Error saving residencia:", error);
      
      const rawMessage = error.message || t('gestionResidencias.errorDesconocido');
      let displayMessage = rawMessage;
      
      // Parse detailed validation errors if they exist
      if (rawMessage.includes("Validation failed: ")) {
          const detailedErrors = rawMessage.split("Validation failed: ")[1];
          const errorMap: Record<string, string> = {};
          
          detailedErrors.split("; ").forEach((errPart: string) => {
              const [field, msg] = errPart.split(": ");
              if (field && msg) {
                  const fieldKey = field.trim();
                  errorMap[fieldKey] = msg.trim();
                  
                  // Link specific backend fields to frontend states
                  if (fieldKey === 'id') setResidenciaIdError(msg.trim());
              }
          });
          setFormErrors(errorMap);
          displayMessage = t('gestionResidencias.revisarCamposFormulario');
      }

      const errorMessage = t('gestionResidencias.errorGuardandoResidencia', { error: displayMessage });
      toast({ title: t('gestionResidencias.error'), description: errorMessage, variant: "destructive" });
    } finally {
      setFormLoading(false);
    }
  };

  const handleDeleteResidencia = async (residenciaId: string, residenciaNombre: string) => {
    if (!isMasterUser) {
      toast({ title: t('gestionResidencias.accionNoPermitida'), description: t('gestionResidencias.soloMasterPuedeEliminar'), variant: "destructive" });
      return;
    }
    setFormLoading(true);
    try {
      const result = await deleteResidenciaCallable({ 
        residenciaIdToDelete: residenciaId
      }) as any;
      toast({ title: t('gestionResidencias.residenciaEliminada'), description: t('gestionResidencias.residenciaEliminadaExito', { nombre: residenciaNombre }) });
      queryClient.invalidateQueries({ queryKey: [HORARIOS_QUERY_KEY, residenciaId] });
      const result2 = await fetchResidences();
    } catch (error: any) {
      const errorMessage = error.message || 'Error desconocido';
      toast({ title: t('gestionResidencias.errorEliminacion'), description: errorMessage, variant: "destructive" });
    } finally {
      setFormLoading(false);
    }
  };

  const handleCampoPersonalizadoPorUsuarioChange = (index: number, path: string, value: any) => {
    setCurrentResidencia(prev => {
        const updatedCampos = (prev.camposPersonalizadosPorUsuario || []).map((campo, i) => {
            if (i === index) {
                // Deep copy the field to avoid direct mutation
                const newCampo = JSON.parse(JSON.stringify(campo));
                const pathParts = path.split('.');
                let current: any = newCampo;
                for (let j = 0; j < pathParts.length - 1; j++) {
                    current = current[pathParts[j]];
                }
                current[pathParts[pathParts.length - 1]] = value;
                return newCampo;
            }
            return campo;
        });
        return { ...prev, camposPersonalizadosPorUsuario: updatedCampos };
    });
  };

  const addCampoPersonalizadoPorUsuario = () => {
    const newCampo: CampoPersonalizado = {
      activo: true,
      configuracionVisual: {
        etiqueta: 'Nuevo Campo',
        tipoControl: 'text',
        placeholder: undefined,
      },
      validacion: {
        esObligatorio: false,
        necesitaValidacion: false,
        regex: undefined,
        mensajeError: undefined,
      },
      permisos: {
        modificablePorDirector: true,
        modificablePorInteresado: true,
      },
    };
    setCurrentResidencia(prev => ({
      ...prev,
      camposPersonalizadosPorUsuario: [...(prev.camposPersonalizadosPorUsuario || []), newCampo],
    }));
  };

  const removeCampoPersonalizadoPorUsuario = (index: number) => {
    setCurrentResidencia(prev => ({
      ...prev,
      camposPersonalizadosPorUsuario: (prev.camposPersonalizadosPorUsuario || []).filter((_, i) => i !== index),
    }));
  };

  const handleTipoChange = (field: keyof Residencia['tipo'], value: string) => {
    setCurrentResidencia(prev => ({
      ...prev,
      tipo: {
        ...prev.tipo!,
        [field]: value
      }
    }));
  };

  // Add this handler function
  const handleTimezoneChange = useCallback((newTimezone: string) => {
    setCurrentResidencia(prev => ({
      ...prev,
      ubicacion: {
        ...prev.ubicacion!,
        zonaHoraria: newTimezone
      }
    }));
  }, []);


  // --- Render Logic ---
  if (!authUser) {
    // User is not logged in, and all loading is complete.
    // The useEffect for redirection should have already handled it, but this is a fallback.
    return (
        <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
            <AlertCircle className="h-12 w-12 text-destructive mb-4" />
            <h1 className="text-2xl font-bold text-destructive mb-2">{t('gestionResidencias.noAutenticado')}</h1>
            <p className="mb-4 text-muted-foreground">{t('gestionResidencias.debesIniciarSesion')}</p>
            <Button onClick={() => router.push('/')}>{t('gestionResidencias.irAlInicio')}</Button>
        </div>
    );
  }

  if (!isAuthorized && authUser) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h1 className="text-2xl font-bold text-destructive mb-2">{t('gestionResidencias.accesoDenegado')}</h1>
        <p className="mb-4 text-muted-foreground max-w-md">
          {t('gestionResidencias.perfilSinRoles', { email: userEmail })}
        </p>
        <Button onClick={() => router.push('/')}>{t('gestionResidencias.volverAlInicio')}</Button>
        <Button onClick={() => auth.signOut().then(() => router.push('/'))} variant="outline" className="mt-2">{t('gestionResidencias.cerrarSesion')}</Button>
      </div>
    );
  }

  // --- Main Page Content ---
  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex justify-between items-center">
        <div>
            <h1 className="text-3xl font-bold">{t('gestionResidencias.titulo')}</h1>
            {authUser && <p className="text-muted-foreground">{t('gestionResidencias.usuario', { email: userEmail, roles: userRoles?.join(', ') || 'N/A' })}</p>}
        </div>
        <Button onClick={() => auth.signOut().then(() => router.push('/'))} variant="outline">{t('gestionResidencias.cerrarSesion')}</Button>
      </div>

      {isMasterUser && !showCreateForm && (
        <Button onClick={handleCreateNew} className="mb-4">
          <PlusCircle className="mr-2 h-4 w-4" /> {t('gestionResidencias.crearNueva')}
        </Button>
      )}

      {showCreateForm && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{isEditing ? t('gestionResidencias.tituloEditar') : t('gestionResidencias.tituloCrear')}</CardTitle>
            {!isEditing && isMasterUser && <CardDescription>{t('gestionResidencias.descripcionCrear')}</CardDescription>}
            {isEditing && <CardDescription>{t('gestionResidencias.descripcionEditar', { name: currentResidencia.nombre })}</CardDescription>}
          </CardHeader>
          <form onSubmit={handleSubmitForm}>
            <CardContent className="space-y-4">
              {/* Custom Residencia ID Input - Only for Creation */}
              {!isEditing && isMasterUser && (
                <div>
                  <Label htmlFor="id">
                    {t('gestionResidencias.idResidencia')} <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="id"
                    name="id"
                    value={currentResidencia.id || ''}
                    onChange={handleInputChange} // We might refine this later for formatting
                    placeholder={t('gestionResidencias.idResidenciaPlaceholder')}
                    disabled={formLoading}
                    required
                    aria-invalid={residenciaIdError ? "true" : "false"}
                    aria-describedby={residenciaIdError ? "residencia-id-error-message" : "residencia-id-description"}
                  />
                  <p id="residencia-id-description" className="text-xs text-muted-foreground mt-1">
                    {t('gestionResidencias.idResidenciaDescripcion')}
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
                  <Label htmlFor="id_display">{t('gestionResidencias.idResidenciaDisplay')}</Label>
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
                <Label htmlFor="nombre">{t('gestionResidencias.nombreResidencia')} <span className="text-destructive">*</span></Label>
                <Input 
                  id="nombre" 
                  name="nombre" 
                  value={currentResidencia.nombre || ''} 
                  onChange={handleInputChange} 
                  required 
                  disabled={formLoading || !isMasterUser}
                  className={formErrors.nombre ? "border-destructive" : ""}
                />
                {formErrors.nombre && <p className="text-xs text-destructive mt-1">{formErrors.nombre}</p>}
              </div>
              <div>
                <Label htmlFor="direccion">{t('gestionResidencias.direccion')}</Label>
                <Textarea id="direccion" name="direccion" value={currentResidencia.direccion || ''} onChange={handleInputChange} disabled={formLoading || !isMasterUser}/>
              </div>
              <div>
                <Label htmlFor="logoUrl">{t('gestionResidencias.logoUrl')}</Label>
                <Input id="logoUrl" name="logoUrl" type="url" value={currentResidencia.logoUrl || ''} onChange={handleInputChange} disabled={formLoading || !isMasterUser}/>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="pais">{t('gestionResidencias.pais')} <span className="text-destructive">*</span></Label>
                    <Select
                      value={currentResidencia.ubicacion?.pais || 'HN'}
                      onValueChange={(val) => handleUbicacionChange('pais', val)}
                      disabled={formLoading || !isMasterUser}
                    >
                      <SelectTrigger id="pais">
                        <SelectValue placeholder={t('gestionResidencias.seleccionarPais')} />
                      </SelectTrigger>
                      <SelectContent>
                          {countriesData.map((c: {code: string, name: string}) => (
                              <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="region">{t('gestionResidencias.region')}</Label>
                    <Input
                        id="region"
                        value={currentResidencia.ubicacion?.region || ''}
                        onChange={(e) => handleUbicacionChange('region', e.target.value)}
                        placeholder={t('gestionResidencias.regionPlaceholder')}
                        disabled={formLoading || !isMasterUser}
                    />
                  </div>
              </div>

               <div>
                <Label htmlFor="ciudad">{t('gestionResidencias.ciudad')} <span className="text-destructive">*</span></Label>
                <Input
                    id="ciudad"
                    value={currentResidencia.ubicacion?.ciudad || ''}
                    onChange={(e) => handleUbicacionChange('ciudad', e.target.value)}
                    placeholder={t('gestionResidencias.ciudadPlaceholder')}
                    required
                    disabled={formLoading || !isMasterUser}
                    className={formErrors.ubicacion ? "border-destructive" : ""}
                />
                {formErrors.ubicacion && <p className="text-xs text-destructive mt-1">{formErrors.ubicacion}</p>}
              </div>

              {/* Timezone Selection using TimezoneSelector Component */}
              <div>
                <TimezoneSelector
                  label={t('gestionResidencias.zonaHoraria')}
                  initialTimezone={currentResidencia.ubicacion?.zonaHoraria || 'America/Tegucigalpa'}
                  onTimezoneChange={handleTimezoneChange}
                  disabled={formLoading || !isMasterUser}
                  allowManualEntry={true}
                />
              </div>
              {/* End of Timezone Selection */}

              <div>
                <Label htmlFor="locale" className="text-sm font-medium">
                  {t('gestionResidencias.perfilDeTextos')}
                </Label>
                <Input
                  id="contextoTraduccion"
                  name="contextoTraduccion"
                  type="text"
                  placeholder={t('gestionResidencias.perfilDeTextosPlaceholder')}
                  value={currentResidencia.contextoTraduccion || ''}
                  onChange={handleInputChange}
                  className="mt-1"
                  aria-describedby="textprofile-description"
                />
                <p id="textprofile-description" className="text-xs text-muted-foreground mt-1">
                  {t('gestionResidencias.perfilDeTextosDescripcion')}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="tipoResidentes">{t('gestionResidencias.tipoResidentes')}</Label>
                  <Select
                    value={currentResidencia.tipo?.tipoResidentes || 'estudiantes'}
                    onValueChange={(value) => handleTipoChange('tipoResidentes', value)}
                    disabled={formLoading || !isMasterUser}
                  >
                    <SelectTrigger id="tipoResidentes">
                      <SelectValue placeholder={t('gestionResidencias.tipoResidentesPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="estudiantes">{t('gestionResidencias.estudiantes')}</SelectItem>
                      <SelectItem value="profesionales">{t('gestionResidencias.profesionales')}</SelectItem>
                      <SelectItem value="gente_mayor">{t('gestionResidencias.genteMayor')}</SelectItem>
                      <SelectItem value="otro">{t('gestionResidencias.otro')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="modalidadResidencia">{t('gestionResidencias.modalidadResidencia')}</Label>
                  <Select
                    value={currentResidencia.tipo?.modalidadResidencia || 'hombres'}
                    onValueChange={(value) => handleTipoChange('modalidadResidencia', value)}
                    disabled={formLoading || !isMasterUser}
                  >
                    <SelectTrigger id="modalidadResidencia">
                      <SelectValue placeholder={t('gestionResidencias.modalidadResidenciaPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hombres">{t('gestionResidencias.hombres')}</SelectItem>
                      <SelectItem value="mujeres">{t('gestionResidencias.mujeres')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">{t('gestionResidencias.camposPersonalizadosResidencia')}</CardTitle>
                  <CardDescription>
                    {t('gestionResidencias.camposPersonalizadosResidenciaDescripcion')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {residenciaFields.map((field) => (
                    <div key={field.id} className="flex items-center gap-2">
                      <Input
                        placeholder={t('gestionResidencias.nombreCampo')}
                        value={field.key}
                        onChange={(e) => handleResidenciaFieldChange(field.id, 'key', e.target.value)}
                        className="w-1/3"
                        disabled={formLoading || !isMasterUser}
                      />
                      <Input
                        placeholder={t('gestionResidencias.valorCampo')}
                        value={field.value}
                        onChange={(e) => handleResidenciaFieldChange(field.id, 'value', e.target.value)}
                        className="w-2/3"
                        disabled={formLoading || !isMasterUser}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeResidenciaField(field.id)}
                        disabled={formLoading || !isMasterUser}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={addResidenciaField}
                    disabled={formLoading || !isMasterUser}
                  >
                    <PlusCircle className="mr-2 h-4 w-4" />
                    {t('gestionResidencias.anadirCampo')}
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">{t('gestionResidencias.camposPersonalizadosPorUsuario')}</CardTitle>
                  <CardDescription>
                    {t('gestionResidencias.camposPersonalizadosPorUsuarioDescripcion')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {(currentResidencia.camposPersonalizadosPorUsuario || []).map((campo, index) => {
                    return (
                      <Card key={index} className="p-4">
                        <div className="flex justify-between items-center mb-2">
                          <p className="font-semibold">{campo.configuracionVisual.etiqueta || t('gestionResidencias.campo', { index: index + 1 })}</p>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeCampoPersonalizadoPorUsuario(index)}
                            disabled={formLoading || !isMasterUser}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="space-y-3">
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id={`${index}-activo`}
                              checked={campo.activo}
                              onCheckedChange={(checked) => handleCampoPersonalizadoPorUsuarioChange(index, 'activo', !!checked)}
                              disabled={formLoading || !isMasterUser}
                            />
                            <Label htmlFor={`${index}-activo`}>{t('gestionResidencias.activo')}</Label>
                          </div>
                          {campo.activo && (
                            <>
                              <div>
                                <Label htmlFor={`${index}-etiqueta`}>{t('gestionResidencias.etiqueta')}</Label>
                                <Input
                                  id={`${index}-etiqueta`}
                                  value={campo.configuracionVisual.etiqueta || ''}
                                  onChange={(e) => handleCampoPersonalizadoPorUsuarioChange(index, 'configuracionVisual.etiqueta', e.target.value)}
                                  disabled={formLoading || !isMasterUser}
                                />
                              </div>
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id={`${index}-esObligatorio`}
                                  checked={campo.validacion.esObligatorio || false}
                                  onCheckedChange={(checked) => handleCampoPersonalizadoPorUsuarioChange(index, 'validacion.esObligatorio', !!checked)}
                                  disabled={formLoading || !isMasterUser}
                                />
                                <Label htmlFor={`${index}-esObligatorio`}>{t('gestionResidencias.esObligatorio')}</Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id={`${index}-necesitaValidacion`}
                                  checked={campo.validacion.necesitaValidacion || false}
                                  onCheckedChange={(checked) => handleCampoPersonalizadoPorUsuarioChange(index, 'validacion.necesitaValidacion', !!checked)}
                                  disabled={formLoading || !isMasterUser}
                                />
                                <Label htmlFor={`${index}-necesitaValidacion`}>{t('gestionResidencias.necesitaValidacion')}</Label>
                              </div>
                              {campo.validacion.necesitaValidacion && (
                                <div>
                                  <Label htmlFor={`${index}-regex`}>{t('gestionResidencias.regexValidacion')}</Label>
                                  <Input
                                    id={`${index}-regex`}
                                    value={campo.validacion.regex || ''}
                                    onChange={(e) => handleCampoPersonalizadoPorUsuarioChange(index, 'validacion.regex', e.target.value)}
                                    disabled={formLoading || !isMasterUser}
                                  />
                                </div>
                              )}
                              <div>
                                <Label htmlFor={`${index}-tipoControl`}>{t('gestionResidencias.tipoControl')}</Label>
                                <Select
                                  value={campo.configuracionVisual.tipoControl || 'text'}
                                  onValueChange={(value) => handleCampoPersonalizadoPorUsuarioChange(index, 'configuracionVisual.tipoControl', value)}
                                  disabled={formLoading || !isMasterUser}
                                >
                                  <SelectTrigger id={`${index}-tipoControl`}>
                                    <SelectValue placeholder={t('gestionResidencias.tipoControlPlaceholder')} />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="text">{t('gestionResidencias.unaLinea')}</SelectItem>
                                    <SelectItem value="textArea">{t('gestionResidencias.multiplesLineas')}</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="flex items-center space-x-2 pt-2">
                                <Checkbox
                                  id={`${index}-modificablePorDirector`}
                                  checked={campo.permisos.modificablePorDirector || false}
                                  onCheckedChange={(checked) => handleCampoPersonalizadoPorUsuarioChange(index, 'permisos.modificablePorDirector', !!checked)}
                                  disabled={formLoading || !isMasterUser}
                                />
                                <Label htmlFor={`${index}-modificablePorDirector`}>{t('gestionResidencias.modificablePorDirector')}</Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id={`${index}-modificablePorInteresado`}
                                  checked={campo.permisos.modificablePorInteresado || false}
                                  onCheckedChange={(checked) => handleCampoPersonalizadoPorUsuarioChange(index, 'permisos.modificablePorInteresado', !!checked)}
                                  disabled={formLoading || !isMasterUser}
                                />
                                <Label htmlFor={`${index}-modificablePorInteresado`}>{t('gestionResidencias.modificablePorInteresado')}</Label>
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
                    onClick={addCampoPersonalizadoPorUsuario}
                    disabled={formLoading || !isMasterUser}
                  >
                    <PlusCircle className="mr-2 h-4 w-4" />
                    {t('gestionResidencias.anadirCampoPersonalizado')}
                  </Button>
                  {formErrors.camposPersonalizadosPorUsuario && (
                    <div className="p-3 mb-4 rounded-md bg-destructive/10 border border-destructive/20">
                      <p className="text-sm text-destructive flex items-center">
                        <AlertCircle className="h-4 w-4 mr-2" />
                        {formErrors.camposPersonalizadosPorUsuario}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

            </CardContent>
            <CardFooter className="flex justify-end space-x-2">
              <Button type="button" variant="outline" onClick={handleCancelForm} disabled={formLoading}>{t('gestionResidencias.cancelar')}</Button>
              <Button type="submit" disabled={formLoading || !isMasterUser}>
                {formLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : (isEditing ? t('gestionResidencias.guardarCambios') : t('gestionResidencias.crearResidencia'))}
              </Button>
            </CardFooter>
          </form>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t('gestionResidencias.listaResidencias')}</CardTitle>
          <CardDescription>
            {isMasterUser ? t('gestionResidencias.listaResidenciasDescripcionMaster') : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingResidences ? (
            <div className="flex items-center justify-center p-6">
              <Loader2 className="mr-2 h-6 w-6 animate-spin" /> 
              <span className="text-muted-foreground">{t('gestionResidencias.cargandoResidencias')}</span>
            </div>
          ) : errorResidences ? (
            <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 text-center">
                <AlertCircle className="mx-auto h-10 w-10 text-destructive" />
                <h3 className="mt-2 text-lg font-semibold text-destructive">{t('gestionResidencias.errorCargandoResidencias')}</h3>
                <p className="mt-1 text-sm text-destructive/80">
                    {t('gestionResidencias.noSePudoRecuperarLista')}
                </p>
                <p className="mt-3 text-xs text-muted-foreground">
                    <span className="font-semibold">{t('gestionResidencias.detalleTecnico', { error: errorResidences })}</span>
                </p>
            </div>
          ) : residences.length === 0 ? (
            <div className="text-center p-8 border-2 border-dashed rounded-lg">
              <h3 className="text-xl font-semibold">{t('gestionResidencias.noHayResidenciasCreadas')}</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {t('gestionResidencias.noHayResidenciasDescripcion')}
              </p>
              {isMasterUser && (
                  <Button onClick={handleCreateNew} className="mt-4">
                      <PlusCircle className="mr-2 h-4 w-4" /> {t('gestionResidencias.crearPrimeraResidencia')}
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
                    {isMasterUser && (
                       <Button variant="outline" size="sm" onClick={() => handleEdit(res)} disabled={formLoading}>
                         <Edit className="mr-1 h-3 w-3" /> {t('gestionResidencias.editar')}
                       </Button>
                    )}
                    {isMasterUser && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive" size="sm" disabled={formLoading}>
                            <Trash2 className="mr-1 h-3 w-3" /> {t('gestionResidencias.eliminar')}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{t('gestionResidencias.confirmarEliminarTitulo')}</AlertDialogTitle>
                            <AlertDialogDescription>
                              {t('gestionResidencias.confirmarEliminarDescripcion', { name: res.nombre })}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel disabled={formLoading}>{t('gestionResidencias.cancelar')}</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDeleteResidencia(res.id, res.nombre)} disabled={formLoading}>
                              {formLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                              {t('gestionResidencias.eliminar')}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                     {!isMasterUser && (
                         <Button variant="outline" size="sm" onClick={() => handleEdit(res)} disabled={true} title={t('gestionResidencias.verSoloLectura')}>
                             <Eye className="mr-1 h-3 w-3" /> {t('gestionResidencias.verSoloLectura')}
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