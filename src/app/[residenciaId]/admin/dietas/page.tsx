'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';

// --- UI/UX imports ---
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/useToast";
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from "@/components/ui/textarea";
import { Loader2, AlertCircle } from 'lucide-react';

// --- Firebase Imports ---
import { addDoc, collection, doc, getDoc, query, where, getDocs, updateDoc, deleteDoc, writeBatch, deleteField } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';

import { useTranslation } from 'react-i18next';

// --- This app types ---
import { 
    Residencia, 
    ResidenciaId, 
    LogActionType, 
    Usuario, 
    RolUsuario,
    ConfiguracionResidencia,
    DietaData,
    DietaId,
} from '../../../../../shared/models/types';
import { logClientAction } from '@/lib/utils';

// Local type for managing dietas in the component's state
type DietaConId = DietaData & { id: DietaId };


// --- Helper Functions ---
const slugify = (text: string): string => {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')           // Replace spaces with -
    .replace(/[^\w\-]+/g, '')       // Remove all non-word chars
    .replace(/\-\-+/g, '-')         // Replace multiple - with single -
    .replace(/^-+/, '')             // Trim - from start of text
    .replace(/-+$/, '');            // Trim - from end of text
};

function DietasResidenciaPage(): React.ReactElement | null {
    const params = useParams();
    const router = useRouter();
    const residenciaId = params.residenciaId as ResidenciaId;
    const { toast } = useToast();

    // --- Auth & Profile State ---
    const { user: authUser, loading: authFirebaseLoading, error: authFirebaseError } = useAuth();
    const [adminUsuario, setAdminUsuario] = useState<Usuario | null>(null);
    const [adminProfileLoading, setAdminProfileLoading] = useState<boolean>(true);
    const [adminProfileError, setAdminProfileError] = useState<string | null>(null);
    const [isAuthorized, setIsAuthorized] = useState<boolean>(false);

    const { t } = useTranslation('dietas');

    // --- Page Data State ---
    const [residencia, setResidencia] = useState<Residencia | null>(null);
    const [isLoadingResidencia, setIsLoadingResidencia] = useState<boolean>(true);
    const [dietas, setDietas] = useState<DietaConId[]>([]);
    const [isLoadingDietas, setIsLoadingDietas] = useState(true); // Specific loading for dietas
    const [errorDietas, setErrorDietas] = useState<string | null>(null); // Specific error for dietas

    // --- Form State ---
    const [isAdding, setIsAdding] = useState(false);
    const [editingDietaId, setEditingDietaId] = useState<string | null>(null);
    const [formData, setFormData] = useState<Partial<DietaData>>({});
    const [isSaving, setIsSaving] = useState(false);


    // --- useEffect: Handle Firebase Auth State & Fetch Admin's Profile ---
    useEffect(() => {
        if (authFirebaseLoading) {
            setAdminProfileLoading(true);
            setIsAuthorized(false);
            return;
        }
        if (authFirebaseError) {
            console.error("Firebase Auth Error:", authFirebaseError);
            // Using a generic key or direct text as t() might not be ready
            toast({ title: "Error de Autenticación", description: authFirebaseError.message, variant: "destructive" });
            setAdminProfileLoading(false); setAdminUsuario(null); setAdminProfileError(authFirebaseError.message); setIsAuthorized(false);
            router.replace('/');
            return;
        }
        if (!authUser) {
            // console.log("No Firebase user. Redirecting to login.");
            setAdminProfileLoading(false); setAdminUsuario(null); setAdminProfileError(null); setIsAuthorized(false);
            router.replace('/');
            return;
        }

        // console.log("Admin user authenticated (UID:", authUser.uid,"). Fetching admin's profile...");
        setAdminProfileLoading(true); setAdminProfileError(null);
        const adminDocRef = doc(db, "users", authUser.uid);
        getDoc(adminDocRef)
            .then((docSnap) => {
                if (docSnap.exists()) {
                    setAdminUsuario(docSnap.data() as Usuario);
                    // console.log("Admin's profile fetched:", docSnap.data());
                } else {
                    console.error("Admin's profile not found for UID:", authUser.uid);
                    setAdminUsuario(null); 
                    // Using a generic key or direct text as t() might not be ready
                    const errorMsg = "Perfil de administrador no encontrado.";
                    setAdminProfileError(errorMsg);
                    toast({ title: "Error de Perfil", description: "No se encontró tu perfil de administrador.", variant: "destructive" });
                }
            })
            .catch((error) => {
                console.error("Error fetching admin's profile:", error);
                setAdminUsuario(null); 
                const errorMsg = `Error al cargar tu perfil: ${error.message}`;
                setAdminProfileError(errorMsg);
                toast({ title: "Error Cargando Perfil", description: errorMsg, variant: "destructive" });
            })
            .finally(() => setAdminProfileLoading(false));
    }, [authUser, authFirebaseLoading, authFirebaseError, router, toast]);

    // --- useEffect: Fetch Residencia Data (to get locale and name) ---
    useEffect(() => {
        if (!residenciaId || !authUser) return; // Wait for authUser as well

        setIsLoadingResidencia(true);
        const residenciaDocRef = doc(db, "residencias", residenciaId);
        getDoc(residenciaDocRef)
            .then((docSnap) => {
                if (docSnap.exists()) {
                    const residenciaData = docSnap.data() as Residencia;
                    setResidencia(residenciaData);
                    // console.log("Residencia data fetched:", residenciaData);
                } else {
                    console.error(`Residencia con ID: ${residenciaId} no encontrada.`);
                    const errorMsg = t('toastResidenciaNotFound', { residenciaId });
                    setErrorDietas(errorMsg); // Set main dietas error as residencia is crucial
                    setResidencia(null);
                }
            })
            .catch((err) => {
                console.error("Error fetching residencia data:", err);
                 // Use t() here if available, otherwise direct text
                const errorMsg = t('toastErrorLoadingResidenciaName');
                setErrorDietas(errorMsg);
                setResidencia(null);
            })
            .finally(() => {
                setIsLoadingResidencia(false);
            });
    }, [residenciaId, authUser, t]); // Added t to dependencies, though it might be stable initially

    // --- useEffect: Handle Authorization & Fetch Page Data (Dietas) ---
    const fetchResidenciaAndDietas = useCallback(async () => {
        if (!residenciaId || !adminUsuario ) { // Ensure localeResidencia is set and texts are not loading
            setIsAuthorized(false);
            if (!adminUsuario) setIsLoadingDietas(false); // Stop dietas loading if no admin profile
            return;
        }

        // Authorization Check
        const roles = adminUsuario.roles || [];
        let authorized = false;
        if (roles.includes('master' as RolUsuario) || roles.includes('admin' as RolUsuario)) {
            authorized = true;
        } else if (roles.includes('director' as RolUsuario) && adminUsuario.residenciaId === residenciaId) {
            authorized = true;
        }

        if (!authorized) {
            console.warn("User not authorized for this residencia's dietas.");
            setIsAuthorized(false);
            toast({ title: t('toastAccessDeniedTitle'), description: t('toastAccessDeniedDescription'), variant: "destructive" });
            setErrorDietas(t('accesoDenegadoTitle')); 
            setIsLoadingDietas(false);
            return;
        }

        setIsAuthorized(true);
        // console.log(`User authorized. Fetching dietas for residenciaId: ${residenciaId}`);

        // Fetch Dietas for the Residencia from the configuration document
        setIsLoadingDietas(true);
        setErrorDietas(null);
        try {
            const configDocRef = doc(db, "residencias", residenciaId, "configuracion", "general");
            const configSnap = await getDoc(configDocRef);

            if (configSnap.exists()) {
                const configData = configSnap.data() as ConfiguracionResidencia;
                const dietasMap = configData.dietas || {};
                
                const fetchedDietas: DietaConId[] = Object.entries(dietasMap).map(([id, data]) => ({
                    id,
                    ...data
                }));

                fetchedDietas.sort((a, b) => a.nombre.localeCompare(b.nombre));
                setDietas(fetchedDietas);
            } else {
                // If the config doc doesn't exist, there are no dietas.
                setDietas([]);
                console.warn(`Configuration document not found for residencia ${residenciaId}. No dietas loaded.`);
            }
        } catch (err) {
            console.error("Error fetching dietas:", err);
            setErrorDietas(t('toastErrorLoadingDietas'));
            setDietas([]);
        } finally {
            setIsLoadingDietas(false);
        }
    }, [residenciaId, adminUsuario, toast, t]);

    useEffect(() => {
        // Trigger fetch when adminUsuario is loaded, and residenciaId is available
        if (!adminProfileLoading && adminUsuario && residenciaId) {
            fetchResidenciaAndDietas();
        } else if (!adminProfileLoading && !adminUsuario) {
            setIsAuthorized(false);
            setIsLoadingDietas(false);
        }
    }, [adminProfileLoading, adminUsuario, residenciaId, fetchResidenciaAndDietas]);


    // --- Event Handlers (CRUD for Dietas) ---
    const handleOpenAddDietaForm = () => {
        setIsAdding(true); setEditingDietaId(null); setFormData({});
    };
    const handleCancelDietaForm = () => {
        setIsAdding(false); setEditingDietaId(null); setFormData({});
    };
    const handleDietaFormChange = (field: keyof DietaData, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleAddDieta = async () => {
        if (!formData.nombre?.trim()) {
            toast({ title: t('dietasPage.toastErrorNombreRequeridoTitle'), description: t('dietasPage.toastErrorNombreRequeridoDescription'), variant: "destructive" }); return;
        }
        const newDietaId = slugify(formData.nombre.trim());
        if (dietas.some(d => d.id.toLowerCase() === newDietaId.toLowerCase())) {
            toast({ title: t('dietasPage.toastErrorNombreRequeridoTitle'), description: t('dietasPage.toastErrorNombreExistenteDescription'), variant: "destructive" }); return;
        }
        setIsSaving(true);

        const newDietaData: DietaData = {
            nombre: formData.nombre!.trim(),
            descripcion: formData.descripcion?.trim() || '',
            esPredeterminada: false,
            estaActiva: formData.estaActiva === undefined ? true : formData.estaActiva,
            identificadorAdministracion: '',
            estado: 'aprobada_director',
            avisoAdministracion: 'no_comunicado',
        };

        try {
            const configDocRef = doc(db, "residencias", residenciaId, "configuracion", "general");
            await updateDoc(configDocRef, {
                [`dietas.${newDietaId}`]: newDietaData
            });

            const newDietaWithId: DietaConId = { ...newDietaData, id: newDietaId };
            setDietas(prev => [...prev, newDietaWithId].sort((a, b) => a.nombre.localeCompare(b.nombre)));

            await logClientAction(
                'DIETA_CREADA',
                {
                    targetId: newDietaWithId.id,
                    targetCollection: 'configuracion/general', // More accurate collection
                    residenciaId: residenciaId,
                    details: { message: `Created dieta: ${newDietaWithId.nombre}` }
                }
            );
            toast({ title: t('toastExitoTitle'), description: t('toastDietaAnadidaDescription', { dietaNombre: newDietaWithId.nombre }) });
            handleCancelDietaForm();
        } catch (error) {
            console.error("Error adding dieta: ", error);
            toast({ title: t('dietasPage.toastErrorNombreRequeridoTitle'), description: t('dietasPage.toastErrorAnadirDietaDescription'), variant: "destructive" });
        } finally { setIsSaving(false); }
    };

    const handleEditDieta = (dieta: DietaConId) => {
        setEditingDietaId(dieta.id); setIsAdding(false);
        setFormData({ nombre: dieta.nombre, descripcion: dieta.descripcion, estaActiva: dieta.estaActiva, esPredeterminada: dieta.esPredeterminada });
    };

    const handleSaveDieta = async () => {
        if (!editingDietaId) return;
        
        setIsSaving(true);
        const originalDieta = dietas.find(d => d.id === editingDietaId);
        if (!originalDieta) {
            toast({ title: t('dietasPage.toastErrorNombreRequeridoTitle'), description: t('dietasPage.toastErrorDietaOriginalNoEncontrada'), variant: "destructive" });
            setIsSaving(false); return;
        }

        // According to the new spec, DietaId is immutable, so the name cannot be changed.
        // The form should prevent this, but we ensure it here.
        if (formData.nombre && formData.nombre.trim() !== originalDieta.nombre) {
             toast({ title: "Información", description: "No se puede cambiar el nombre de una dieta existente.", variant: "default" });
             // We can either return or just ignore the name change. Let's ignore it for now.
        }

        const updatedDietaData: DietaData = {
            ...originalDieta, // a DietaConId has an id, but DietaData doesn't, so we need to build it properly
            nombre: originalDieta.nombre, // Keep original name
            descripcion: formData.descripcion?.trim() || '',
            estaActiva: formData.estaActiva === undefined ? originalDieta.estaActiva : formData.estaActiva,
            // esPredeterminada is handled by its own function
        };
        
        // Let's create a clean object without the `id` for Firestore
        const { id, ...dietaToSave } = { ...updatedDietaData, id: editingDietaId };


        try {
            const configDocRef = doc(db, "residencias", residenciaId, "configuracion", "general");
            await updateDoc(configDocRef, {
                [`dietas.${editingDietaId}`]: dietaToSave
            });

            const updatedDietaInState: DietaConId = { ...dietaToSave, id: editingDietaId };
            setDietas(prev => prev.map(d => d.id === editingDietaId ? updatedDietaInState : d).sort((a, b) => a.nombre.localeCompare(b.nombre)));
            
            await logClientAction(
                'DIETA_ACTUALIZADA',
                {
                    targetId: editingDietaId,
                    targetCollection: 'configuracion/general',
                    residenciaId: residenciaId,
                    details: { message: `Updated dieta: ${updatedDietaInState.nombre}` }
                }
            );
            toast({ title: t('toastExitoTitle'), description: t('toastDietaActualizadaDescription', { dietaNombre: updatedDietaInState.nombre }) });
            handleCancelDietaForm();
        } catch (error) {
            console.error("Error saving dieta: ", error);
            toast({ title: t('dietasPage.toastErrorNombreRequeridoTitle'), description: t('dietasPage.toastErrorGuardarDietaDescription'), variant: "destructive" });
        } finally { setIsSaving(false); }
    };

    const handleToggleActive = async (dietaToToggle: DietaConId) => {
        if (dietaToToggle.esPredeterminada && dietaToToggle.estaActiva) {
            toast({ title: t('dietasPage.toastAccionNoPermitidaTitle'), description: t('dietasPage.toastErrorDesactivarDefaultDescription'), variant: "destructive" }); return;
        }
        const newStatus = !dietaToToggle.estaActiva;
        setIsSaving(true);
        try {
            const configDocRef = doc(db, "residencias", residenciaId, "configuracion", "general");
            await updateDoc(configDocRef, {
                [`dietas.${dietaToToggle.id}.estaActiva`]: newStatus
            });

            setDietas(prev => prev.map(d => d.id === dietaToToggle.id ? { ...d, estaActiva: newStatus } : d).sort((a,b)=>a.nombre.localeCompare(b.nombre)));
            
            await logClientAction(
                'DIETA_ACTUALIZADA',
                {
                    targetId: dietaToToggle.id,
                    targetCollection: 'configuracion/general',
                    residenciaId: residenciaId,
                    details: { message: `${newStatus ? 'Activated' : 'Deactivated'} dieta: ${dietaToToggle.nombre}` }
                }
            );

            const statusText = newStatus ? t('toastDietaActivadaTitle') : t('toastDietaDesactivadaTitle');
            toast({ 
                title: statusText, 
                description: t('toastDietaActivadaDesactivadaDescription', { dietaNombre: dietaToToggle.nombre, status: statusText.toLowerCase() })
            });
        } catch (error) {
            console.error("Error toggling active status: ", error);
            toast({ title: t('dietasPage.toastErrorNombreRequeridoTitle'), description: t('dietasPage.toastErrorCambiarEstadoDescription'), variant: "destructive" });
        } finally { setIsSaving(false); }
    };

    const handleSetDefault = async (dietaToSetDefault: DietaConId) => {
        if (dietaToSetDefault.esPredeterminada) { 
            toast({ title: t('dietasPage.toastInformacionTitle'), description: t('dietasPage.toastDietaYaDefaultDescription') }); return; 
        }
        if (!dietaToSetDefault.estaActiva) { 
            toast({ title: t('dietasPage.toastErrorNombreRequeridoTitle'), description: t('dietasPage.toastErrorMarcarInactivaDefaultDescription'), variant: "destructive" }); return; 
        }
        setIsSaving(true);
        
        const configDocRef = doc(db, "residencias", residenciaId, "configuracion", "general");
        const batch = writeBatch(db);

        const updates: { [key: string]: boolean } = {};
        
        dietas.forEach(d => {
            if (d.id === dietaToSetDefault.id) {
                updates[`dietas.${d.id}.esPredeterminada`] = true;
            } else if (d.esPredeterminada) {
                updates[`dietas.${d.id}.esPredeterminada`] = false;
            }
        });

        batch.update(configDocRef, updates);

        try {
            await batch.commit();
            setDietas(prevDietas =>
                prevDietas.map(d => ({
                    ...d,
                    esPredeterminada: d.id === dietaToSetDefault.id
                })).sort((a, b) => a.nombre.localeCompare(b.nombre))
            );
            await logClientAction(
                'DIETA_ACTUALIZADA',
                {
                    targetId: dietaToSetDefault.id,
                    targetCollection: 'configuracion/general',
                    residenciaId: residenciaId,
                    details: { message: `Set default dieta: ${dietaToSetDefault.nombre}` }
                }
            );
            toast({ title: t('toastExitoTitle'), description: t('toastDietaMarcadaDefaultDescription', { dietaNombre: dietaToSetDefault.nombre }) });
        } catch (error) {
            console.error("Error setting default dieta: ", error);
            toast({ title: t('dietasPage.toastErrorNombreRequeridoTitle'), description: t('dietasPage.toastErrorMarcarDefaultDescription'), variant: "destructive" });
        } finally { setIsSaving(false); }
    };

    const handleDeleteDieta = async (dietaToDelete: DietaConId) => {
        if (dietaToDelete.esPredeterminada) {
            toast({ title: t('dietasPage.toastAccionNoPermitidaTitle'), description: t('dietasPage.toastErrorEliminarDefaultDescription'), variant: "destructive" }); return;
        }
        if (dietas.length <= 1) {
            toast({ title: t('dietasPage.toastAccionNoPermitidaTitle'), description: t('dietasPage.toastErrorEliminarUltimaDietaDescription', 'No se puede eliminar la última dieta. Una residencia debe tener al menos una dieta.'), variant: "destructive" }); return;
        }
        setIsSaving(true);
        try {
            const configDocRef = doc(db, "residencias", residenciaId, "configuracion", "general");
            await updateDoc(configDocRef, {
                [`dietas.${dietaToDelete.id}`]: deleteField()
            });

            setDietas(prevDietas => prevDietas.filter(d => d.id !== dietaToDelete.id));
            await logClientAction(
                'DIETA_ELIMINADA',
                {
                    targetId: dietaToDelete.id,
                    targetCollection: 'configuracion/general',
                    residenciaId: residenciaId,
                    details: { message: `Deleted dieta: ${dietaToDelete.nombre} (ID: ${dietaToDelete.id})` }
                }
            );
            toast({ title: t('toastExitoTitle'), description: t('toastDietaEliminadaDescription', { dietaNombre: dietaToDelete.nombre }) });
        } catch (error) {
            console.error("Error deleting dieta: ", error);
            toast({ title: t('dietasPage.toastErrorNombreRequeridoTitle'), description: t('dietasPage.toastErrorEliminarDietaDescription'), variant: "destructive" });
        } finally { setIsSaving(false); }
    };



    // =========================================================================
    // Render Logic with Translations & New Auth Flow
    // =========================================================================

    // 1. Handle Initial Loading States
    if (authFirebaseLoading || adminProfileLoading || isLoadingResidencia) {
        let loadingMessage = t('loadingPreparando');
        if (authFirebaseLoading) loadingMessage = t('loadingVerificandoSesion');
        else if (adminProfileLoading) loadingMessage = t('loadingCargandoPerfilAdmin');
        else if (isLoadingResidencia) loadingMessage = t('loadingCargandoDatosResidencia');
        
        return (
            <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
                <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
                <p className="text-lg font-medium text-muted-foreground">
                    {loadingMessage}
                </p>
            </div>
        );
    }

    // 2. Handle Critical Errors (Firebase Auth, Admin Profile)
    const criticalErrorMessage = authFirebaseError?.message || adminProfileError;
    if (criticalErrorMessage) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
                <AlertCircle className="h-12 w-12 text-destructive mb-4" />
                <h1 className="text-2xl font-bold text-destructive mb-2">{t('errorCriticoTitle')}</h1>
                <p className="mb-4 text-destructive max-w-md">
                    {criticalErrorMessage}
                </p>
                <Button onClick={() => router.replace('/')}>{t('errorCriticoButtonVolver')}</Button>
            </div>
        );
    }

    // 3. Handle Not Authorized (after auth, profile, and residencia are loaded)
    if (!isAuthorized) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
                <AlertCircle className="h-12 w-12 text-destructive mb-4" />
                <h1 className="text-2xl font-bold text-destructive mb-2">{t('accesoDenegadoTitle')}</h1>
                <p className="mb-4 text-muted-foreground max-w-md">
                    {errorDietas === t('accesoDenegadoTitle') 
                        ? t('accesoDenegadoDescriptionNoPermiso') 
                        : t('accesoDenegadoDescriptionNoVerificado')}
                </p>
                <Button onClick={() => router.replace('/admin/residencia')}>{t('accesoDenegadoButtonSeleccionarResidencia')}</Button>
            </div>
        );
    }
    
    // Fallback for residencia name if residencia object is not loaded but we passed authorization (should be rare)
    const currentResidenciaNombre = residencia?.nombre || t('residenciaNameLoading') + ` (${residenciaId})`;

    // 4. Handle Error Fetching Dietas (after authorization is confirmed)
    if (errorDietas && errorDietas !== t('accesoDenegadoTitle')) {
        return (
             <div className="container mx-auto p-4">
                <h1 className="text-2xl font-bold mb-4">{t('title')} {currentResidenciaNombre}</h1>
                <Card>
                    <CardHeader>
                        <CardTitle className="text-destructive">{t('errorCargarDietasTitle')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-destructive">{errorDietas}</p>
                        <Button onClick={fetchResidenciaAndDietas} className="mt-4">{t('errorReintentarButton')}</Button>
                    </CardContent>
                </Card>
            </div>
        );
    }
    
    // 5. Render Main Page Content (Authorized and no critical errors)
    const formTitleText = isAdding 
        ? t('formAddTitle') 
        : t('formEditTitle', { dietaNombre: dietas.find(d=>d.id===editingDietaId)?.nombre || '' });

    return (
        <div className="container mx-auto p-4 space-y-6">
            <h1 className="text-3xl font-bold tracking-tight">
                {t('title')} <span className="text-primary">{currentResidenciaNombre}</span>
            </h1>

            <Card>
                <CardHeader>
                    <CardTitle>{t('cardTitle')}</CardTitle>
                    <CardDescription>
                        {t('cardDescription', { residenciaNombre: residencia?.nombre || t('cardDescriptionFallback') })}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoadingDietas ? (
                        <div className="space-y-3">
                            <Skeleton className="h-12 w-full" />
                            <Skeleton className="h-12 w-full" />
                            <Skeleton className="h-10 w-1/3" />
                        </div>
                    ) : dietas.length === 0 && !isAdding && !editingDietaId ? (
                         <div className="text-center py-8">
                            <p className="text-muted-foreground mb-4">{t('noDietasDefined')}</p>
                            <Button onClick={handleOpenAddDietaForm} disabled={isAdding || !!editingDietaId || isSaving}>
                                {t('addFirstDietaButton')}
                            </Button>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {dietas.map(dieta => (
                                <div key={dieta.id} className={`p-3 border rounded-lg flex flex-col md:flex-row justify-between items-start md:items-center gap-3 ${!dieta.estaActiva ? 'bg-slate-100 dark:bg-slate-800/50 opacity-70' : 'hover:bg-slate-50 dark:hover:bg-slate-800/30'}`}>
                                    <div className="flex-grow">
                                        <span className="font-semibold text-lg">{dieta.nombre}</span>
                                        {dieta.esPredeterminada && <Badge variant="default" className="ml-2 bg-green-600 hover:bg-green-700 text-white">{t('defaultBadge')}</Badge>}
                                        {!dieta.estaActiva && <Badge variant="outline" className="ml-2 text-red-600 border-red-500">{t('inactiveBadge')}</Badge>}
                                        {dieta.descripcion && <p className="text-sm text-muted-foreground mt-1">{dieta.descripcion}</p>}
                                    </div>
                                    <div className="space-x-2 flex-shrink-0 mt-2 md:mt-0">
                                        <Button variant="outline" size="sm" onClick={() => handleEditDieta(dieta)} disabled={isAdding || !!editingDietaId || isSaving}>
                                            {t('editButton')}
                                        </Button>
                                        <Button
                                            variant={dieta.estaActiva ? "ghost" : "secondary"}
                                            size="sm"
                                            onClick={() => handleToggleActive(dieta)}
                                            disabled={isAdding || !!editingDietaId || isSaving || (dieta.estaActiva && !!dieta.esPredeterminada)}
                                            className={dieta.estaActiva && dieta.esPredeterminada ? "text-muted-foreground hover:text-destructive" : dieta.estaActiva ? "hover:text-destructive" : ""}
                                        >
                                            {dieta.estaActiva ? t('deactivateButton') : t('activateButton')}
                                        </Button>
                                        {!dieta.esPredeterminada && (
                                            <Button variant="ghost" size="sm" onClick={() => handleSetDefault(dieta)} disabled={isAdding || !!editingDietaId || isSaving || !dieta.estaActiva}>
                                                {t('setDefaultButton')}
                                            </Button>
                                        )}
                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button variant="destructive" size="sm" disabled={isAdding || !!editingDietaId || isSaving || dieta.esPredeterminada}>
                                                    {t('deleteButton')}
                                                </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>{t('deleteDialogTitle')}</AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        {t('deleteDialogDescription', { dietaNombre: dieta.nombre })}
                                                        {dieta.esPredeterminada ? <span className="font-semibold text-destructive block mt-2">{t('deleteDialogWarningDefault')}</span> : ""}
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>{t('deleteDialogCancel')}</AlertDialogCancel>
                                                    <AlertDialogAction
                                                        onClick={() => handleDeleteDieta(dieta)}
                                                        className={buttonVariants({ variant: "destructive" })}
                                                        disabled={dieta.esPredeterminada}
                                                    >
                                                        {t('deleteDialogConfirm')}
                                                    </AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {(!isAdding && !editingDietaId && dietas.length > 0) && (
                        <div className="mt-6 pt-6 border-t">
                            <Button onClick={handleOpenAddDietaForm} disabled={isAdding || !!editingDietaId || isSaving}>
                                {t('addNewDietaButton')}
                            </Button>
                        </div>
                    )}

                    {(isAdding || !!editingDietaId) && (
                        <DietaForm
                            formData={formData}
                            onFormChange={handleDietaFormChange}
                            onSubmit={isAdding ? handleAddDieta : handleSaveDieta}
                            onCancel={handleCancelDietaForm}
                            isSaving={isSaving}
                            formTitle={formTitleText} // Already translated
                            submitButtonText={isAdding ? t('formSubmitAdd') : t('formSubmitSave')}
                            t={t} // Pass t function to DietaForm
                        />
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

// Interface for DietaFormProps, include t function
interface DietaFormProps {
    formData: Partial<DietaData>;
    onFormChange: (field: keyof DietaData, value: any) => void;
    onSubmit: () => Promise<void>;
    onCancel: () => void;
    isSaving: boolean;
    formTitle: string; // This will be passed already translated
    submitButtonText: string; // This will be passed already translated
    t: (key: string, options?: any) => string; // Add t function prop
}

function DietaForm({
    formData,
    onFormChange,
    onSubmit,
    onCancel,
    isSaving,
    formTitle,
    submitButtonText,
    t // Destructure t from props
}: DietaFormProps) {
    const isEditing = !formTitle.includes(t('formAddTitle'));
    return (
        <div className="mt-6 pt-6 border-t space-y-6">
            <h3 className="font-semibold text-xl">{formTitle}</h3>
            <div>
                <Label htmlFor="dieta-nombre" className="text-base">{t('formNombreLabel')}</Label>
                <Input
                    id="dieta-nombre"
                    value={formData.nombre || ''}
                    onChange={(e) => onFormChange('nombre', e.target.value)}
                    placeholder={t('formNombrePlaceholder')}
                    disabled={isSaving || isEditing}
                    maxLength={50}
                    className="mt-1 text-base"
                />
                 <p className="text-sm text-muted-foreground mt-1">{t('formNombreDescription')}</p>
            </div>

            <div>
                <Label htmlFor="dieta-descripcion" className="text-base">{t('formDescripcionLabel')}</Label>
                <Textarea
                    id="dieta-descripcion"
                    value={formData.descripcion || ''}
                    onChange={(e) => onFormChange('descripcion', e.target.value)}
                    placeholder={t('formDescripcionPlaceholder')}
                    disabled={isSaving}
                    rows={3}
                    maxLength={250}
                    className="mt-1 text-base"
                />
                <p className="text-sm text-muted-foreground mt-1">{t('formDescripcionDescription')}</p>
            </div>

            {isEditing && (
                 <div className="flex items-center space-x-2 pt-2">
                    <Checkbox
                        id="dieta-isActive"
                        checked={formData.estaActiva === undefined ? true : formData.estaActiva}
                        onCheckedChange={(checked) => onFormChange('estaActiva', !!checked)}
                        disabled={isSaving || formData.esPredeterminada}
                    />
                    <Label htmlFor="dieta-isActive" className="text-base">{t('formIsActiveLabel')}</Label>
                    {formData.esPredeterminada && <p className="text-xs text-amber-600 ml-2">{t('formIsActiveWarningDefault')}</p>}
                </div>
            )}

            <div className="flex space-x-3 pt-3">
                <Button onClick={onSubmit} disabled={isSaving} size="lg">
                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
                    {isSaving ? t('formSavingButton') : submitButtonText}
                </Button>
                <Button variant="outline" onClick={onCancel} disabled={isSaving} size="lg">
                    {t('formCancelButton')}
                </Button>
            </div>
        </div>
    );
}

export default DietasResidenciaPage;