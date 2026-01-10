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
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from "@/components/ui/textarea";
import { Loader2, AlertCircle } from 'lucide-react';

// --- Firebase Imports ---
import { Timestamp, addDoc, collection, doc, getDoc, query, where, getDocs, setDoc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import withAuth from '@/components/withAuth'

import { useTranslations } from '@/lib/translations'; // Path to your translations hook

// --- This app types ---
import { Dieta, Residencia, ResidenciaId, LogEntry, LogActionType, UserProfile, UserRole } from '../../../../../shared/models/types';

// --- Log Helper ---
// (createLogEntry function remains the same as in your provided code)
async function createLogEntry(
    actionType: LogActionType,
    residenciaId: ResidenciaId,
    userId: string | null,
    details?: string,
    relatedDocPath?: string
) {
    if (!userId) {
        console.warn("Cannot create log entry: User ID is missing.");
        return;
    }
    try {
        const logEntryData: Omit<LogEntry, 'id'> = {
            timestamp: Timestamp.now().toMillis(),
            userId: userId,
            residenciaId: residenciaId,
            actionType: actionType,
            relatedDocPath: relatedDocPath,
            details: details,
        };
        // console.log("Attempting to create log entry:", logEntryData); // Keep for debugging if needed
        await addDoc(collection(db, "logEntries"), logEntryData);
        // console.log("Log entry created."); // Keep for debugging if needed
    } catch (error) {
        console.error("Error creating log entry:", error);
    }
}

function DietasResidenciaPage(): React.ReactElement | null {
    const params = useParams();
    const router = useRouter();
    const residenciaId = params.residenciaId as ResidenciaId;
    const { toast } = useToast();

    // --- Auth & Profile State ---
    const { user: authUser, loading: authFirebaseLoading, error: authFirebaseError } = useAuth();
    const [adminUserProfile, setAdminUserProfile] = useState<UserProfile | null>(null);
    const [adminProfileLoading, setAdminProfileLoading] = useState<boolean>(true);
    const [adminProfileError, setAdminProfileError] = useState<string | null>(null);
    const [isAuthorized, setIsAuthorized] = useState<boolean>(false);

    // --- Residencia and Text Profile State ---
    const [residencia, setResidencia] = useState<Residencia | null>(null);
    const [textProfileName, setTextProfileName] = useState<string | undefined>(undefined);
    const [isLoadingResidencia, setIsLoadingResidencia] = useState(true);

    // --- Translations Hook ---
    const { t, isLoading: isLoadingTexts, error: textsError, currentProfile: loadedTextProfile } = useTranslations(textProfileName);

    // --- Page Data State ---
    const [dietas, setDietas] = useState<Dieta[]>([]);
    const [isLoadingDietas, setIsLoadingDietas] = useState(true); // Specific loading for dietas
    const [errorDietas, setErrorDietas] = useState<string | null>(null); // Specific error for dietas
    // residenciaNombre is now derived from `residencia?.nombre` or fallback text

    // --- Form State ---
    const [isAdding, setIsAdding] = useState(false);
    const [editingDietaId, setEditingDietaId] = useState<string | null>(null);
    const [formData, setFormData] = useState<Partial<Omit<Dieta, 'id' | 'residenciaId'>>>({});
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
            setAdminProfileLoading(false); setAdminUserProfile(null); setAdminProfileError(authFirebaseError.message); setIsAuthorized(false);
            router.replace('/');
            return;
        }
        if (!authUser) {
            // console.log("No Firebase user. Redirecting to login.");
            setAdminProfileLoading(false); setAdminUserProfile(null); setAdminProfileError(null); setIsAuthorized(false);
            router.replace('/');
            return;
        }

        // console.log("Admin user authenticated (UID:", authUser.uid,"). Fetching admin's profile...");
        setAdminProfileLoading(true); setAdminProfileError(null);
        const adminDocRef = doc(db, "users", authUser.uid);
        getDoc(adminDocRef)
            .then((docSnap) => {
                if (docSnap.exists()) {
                    setAdminUserProfile(docSnap.data() as UserProfile);
                    // console.log("Admin's profile fetched:", docSnap.data());
                } else {
                    console.error("Admin's profile not found for UID:", authUser.uid);
                    setAdminUserProfile(null); 
                    // Using a generic key or direct text as t() might not be ready
                    const errorMsg = "Perfil de administrador no encontrado.";
                    setAdminProfileError(errorMsg);
                    toast({ title: "Error de Perfil", description: "No se encontró tu perfil de administrador.", variant: "destructive" });
                }
            })
            .catch((error) => {
                console.error("Error fetching admin's profile:", error);
                setAdminUserProfile(null); 
                const errorMsg = `Error al cargar tu perfil: ${error.message}`;
                setAdminProfileError(errorMsg);
                toast({ title: "Error Cargando Perfil", description: errorMsg, variant: "destructive" });
            })
            .finally(() => setAdminProfileLoading(false));
    }, [authUser, authFirebaseLoading, authFirebaseError, router, toast]);

    // --- useEffect: Fetch Residencia Data (to get textProfile and name) ---
    useEffect(() => {
        if (!residenciaId || !authUser) return; // Wait for authUser as well

        setIsLoadingResidencia(true);
        const residenciaDocRef = doc(db, "residencias", residenciaId);
        getDoc(residenciaDocRef)
            .then((docSnap) => {
                if (docSnap.exists()) {
                    const residenciaData = docSnap.data() as Residencia;
                    setResidencia(residenciaData);
                    setTextProfileName(residenciaData.textProfile || 'espanol-honduras'); // Set textProfile or fallback
                    // console.log("Residencia data fetched:", residenciaData, "Using text profile:", residenciaData.textProfile || 'espanol-honduras');
                } else {
                    console.error(`Residencia con ID: ${residenciaId} no encontrada.`);
                    // Use t() here if available, otherwise direct text
                    const errorMsg = t('dietasPage.toastResidenciaNotFound', "La residencia con ID {{residenciaId}} no fue encontrada.").replace("{{residenciaId}}", residenciaId);
                    setErrorDietas(errorMsg); // Set main dietas error as residencia is crucial
                    setResidencia(null);
                    setTextProfileName('espanol-honduras'); // Fallback profile
                }
            })
            .catch((err) => {
                console.error("Error fetching residencia data:", err);
                 // Use t() here if available, otherwise direct text
                const errorMsg = t('dietasPage.toastErrorLoadingResidenciaName', "Error cargando el nombre de la residencia.");
                setErrorDietas(errorMsg);
                setResidencia(null);
                setTextProfileName('espanol-honduras'); // Fallback profile
            })
            .finally(() => {
                setIsLoadingResidencia(false);
            });
    }, [residenciaId, authUser, t]); // Added t to dependencies, though it might be stable initially

    // --- useEffect: Handle Authorization & Fetch Page Data (Dietas) ---
    const fetchResidenciaAndDietas = useCallback(async () => {
        if (!residenciaId || !adminUserProfile || !textProfileName || isLoadingTexts) { // Ensure textProfileName is set and texts are not loading
            setIsAuthorized(false);
            if (!adminUserProfile) setIsLoadingDietas(false); // Stop dietas loading if no admin profile
            return;
        }

        // Authorization Check
        const roles = adminUserProfile.roles || [];
        let authorized = false;
        if (roles.includes('master' as UserRole) || roles.includes('admin' as UserRole)) {
            authorized = true;
        } else if (roles.includes('director' as UserRole) && adminUserProfile.residenciaId === residenciaId) {
            authorized = true;
        }

        if (!authorized) {
            console.warn("User not authorized for this residencia's dietas.");
            setIsAuthorized(false);
            toast({ title: t('dietasPage.toastAccessDeniedTitle'), description: t('dietasPage.toastAccessDeniedDescription'), variant: "destructive" });
            setErrorDietas(t('dietasPage.accesoDenegadoTitle')); 
            setIsLoadingDietas(false);
            return;
        }

        setIsAuthorized(true);
        // console.log(`User authorized. Fetching dietas for residenciaId: ${residenciaId} using profile ${textProfileName}`);

        // Fetch Dietas for the Residencia
        setIsLoadingDietas(true);
        setErrorDietas(null);
        try {
            const q = query(collection(db, "dietas"), where("residenciaId", "==", residenciaId));
            const querySnapshot = await getDocs(q);
            const fetchedDietas: Dieta[] = [];
            querySnapshot.forEach((doc) => {
                fetchedDietas.push({ id: doc.id, ...doc.data() } as Dieta);
            });
            fetchedDietas.sort((a, b) => a.nombre.localeCompare(b.nombre));
            setDietas(fetchedDietas);
            // console.log(`Fetched ${fetchedDietas.length} dietas for ${residenciaId}`);
        } catch (err) {
            console.error("Error fetching dietas:", err);
            setErrorDietas(t('dietasPage.toastErrorLoadingDietas'));
            setDietas([]);
        } finally {
            setIsLoadingDietas(false);
        }
    }, [residenciaId, adminUserProfile, toast, t, textProfileName, isLoadingTexts]);

    useEffect(() => {
        // Trigger fetch when adminUserProfile is loaded, residenciaId is available, and textProfileName is determined
        if (!adminProfileLoading && adminUserProfile && residenciaId && textProfileName && !isLoadingTexts) {
            fetchResidenciaAndDietas();
        } else if (!adminProfileLoading && !adminUserProfile) {
            setIsAuthorized(false);
            setIsLoadingDietas(false);
        }
    }, [adminProfileLoading, adminUserProfile, residenciaId, textProfileName, isLoadingTexts, fetchResidenciaAndDietas]);


    // --- Event Handlers (CRUD for Dietas) ---
    const handleOpenAddDietaForm = () => {
        setIsAdding(true); setEditingDietaId(null); setFormData({});
    };
    const handleCancelDietaForm = () => {
        setIsAdding(false); setEditingDietaId(null); setFormData({});
    };
    const handleDietaFormChange = (field: keyof Omit<Dieta, 'id' | 'residenciaId'>, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleAddDieta = async () => {
        if (!formData.nombre?.trim()) { 
            toast({ title: t('dietasPage.toastErrorNombreRequeridoTitle'), description: t('dietasPage.toastErrorNombreRequeridoDescription'), variant: "destructive" }); return; 
        }
        if (dietas.some(d => d.nombre.toLowerCase() === formData.nombre!.trim().toLowerCase())) { 
            toast({ title: t('dietasPage.toastErrorNombreRequeridoTitle'), description: t('dietasPage.toastErrorNombreExistenteDescription'), variant: "destructive" }); return; 
        }
        setIsSaving(true);
        const newDietaData: Omit<Dieta, 'id'> = {
            residenciaId: residenciaId,
            nombre: formData.nombre!.trim(),
            descripcion: formData.descripcion?.trim() || '',
            isDefault: false,
            isActive: formData.isActive === undefined ? true : formData.isActive,
        };
        try {
            const docRef = await addDoc(collection(db, "dietas"), newDietaData);
            const newDietaWithId: Dieta = { ...newDietaData, id: docRef.id };
            setDietas(prev => [...prev, newDietaWithId].sort((a,b)=>a.nombre.localeCompare(b.nombre)));
            await createLogEntry('dieta', residenciaId, authUser?.uid || null, `Created dieta: ${newDietaWithId.nombre}`, docRef.path);
            toast({ title: t('dietasPage.toastExitoTitle'), description: t('dietasPage.toastDietaAnadidaDescription').replace("{{dietaNombre}}", newDietaWithId.nombre) });
            handleCancelDietaForm();
        } catch (error) {
            console.error("Error adding dieta: ", error);
            toast({ title: t('dietasPage.toastErrorNombreRequeridoTitle'), description: t('dietasPage.toastErrorAnadirDietaDescription'), variant: "destructive" });
        } finally { setIsSaving(false); }
    };

    const handleEditDieta = (dieta: Dieta) => {
        setEditingDietaId(dieta.id); setIsAdding(false);
        setFormData({ nombre: dieta.nombre, descripcion: dieta.descripcion, isActive: dieta.isActive, isDefault: dieta.isDefault });
    };

    const handleSaveDieta = async () => {
        if (!editingDietaId) return;
        if (!formData.nombre?.trim()) { 
            toast({ title: t('dietasPage.toastErrorNombreRequeridoTitle'), description: t('dietasPage.toastErrorNombreRequeridoDescription'), variant: "destructive" }); return; 
        }
        if (dietas.some(d => d.id !== editingDietaId && d.nombre.toLowerCase() === formData.nombre!.trim().toLowerCase())) { 
            toast({ title: t('dietasPage.toastErrorNombreRequeridoTitle'), description: t('dietasPage.toastErrorOtraDietaMismoNombreDescription'), variant: "destructive" }); return; 
        }
        setIsSaving(true);
        const originalDieta = dietas.find(d => d.id === editingDietaId);
        if (!originalDieta) { 
            toast({ title: t('dietasPage.toastErrorNombreRequeridoTitle'), description: t('dietasPage.toastErrorDietaOriginalNoEncontrada'), variant: "destructive" }); 
            setIsSaving(false); return; 
        }

        const updatedDietaData: Partial<Dieta> = {
            nombre: formData.nombre.trim(),
            descripcion: formData.descripcion?.trim() || '',
            isActive: formData.isActive === undefined ? originalDieta.isActive : formData.isActive,
        };
        try {
            const dietaRef = doc(db, "dietas", editingDietaId);
            await updateDoc(dietaRef, updatedDietaData);
            const updatedDietaInState: Dieta = { ...originalDieta, ...updatedDietaData }; // originalDieta has residenciaId and id
            setDietas(prev => prev.map(d => d.id === editingDietaId ? updatedDietaInState : d).sort((a,b)=>a.nombre.localeCompare(b.nombre)));
            await createLogEntry('dieta', residenciaId, authUser?.uid || null, `Updated dieta: ${updatedDietaInState.nombre}`, dietaRef.path);
            toast({ title: t('dietasPage.toastExitoTitle'), description: t('dietasPage.toastDietaActualizadaDescription').replace("{{dietaNombre}}", updatedDietaInState.nombre) });
            handleCancelDietaForm();
        } catch (error) {
            console.error("Error saving dieta: ", error);
            toast({ title: t('dietasPage.toastErrorNombreRequeridoTitle'), description: t('dietasPage.toastErrorGuardarDietaDescription'), variant: "destructive" });
        } finally { setIsSaving(false); }
    };

    const handleToggleActive = async (dietaToToggle: Dieta) => {
        if (dietaToToggle.isDefault && dietaToToggle.isActive) {
            toast({ title: t('dietasPage.toastAccionNoPermitidaTitle'), description: t('dietasPage.toastErrorDesactivarDefaultDescription'), variant: "destructive" }); return;
        }
        const newStatus = !dietaToToggle.isActive;
        setIsSaving(true);
        try {
            const dietaRef = doc(db, "dietas", dietaToToggle.id);
            await updateDoc(dietaRef, { isActive: newStatus });
            setDietas(prev => prev.map(d => d.id === dietaToToggle.id ? { ...d, isActive: newStatus } : d).sort((a,b)=>a.nombre.localeCompare(b.nombre)));
            await createLogEntry('dieta', residenciaId, authUser?.uid || null, `${newStatus ? 'Activated' : 'Deactivated'} dieta: ${dietaToToggle.nombre}`, dietaRef.path);
            const statusText = newStatus ? t('dietasPage.toastDietaActivadaTitle') : t('dietasPage.toastDietaDesactivadaTitle');
            toast({ 
                title: statusText, 
                description: t('dietasPage.toastDietaActivadaDesactivadaDescription').replace("{{dietaNombre}}", dietaToToggle.nombre).replace("{{status}}", statusText.toLowerCase())
            });
        } catch (error) {
            console.error("Error toggling active status: ", error);
            toast({ title: t('dietasPage.toastErrorNombreRequeridoTitle'), description: t('dietasPage.toastErrorCambiarEstadoDescription'), variant: "destructive" });
        } finally { setIsSaving(false); }
    };

    const handleSetDefault = async (dietaToSetDefault: Dieta) => {
        if (dietaToSetDefault.isDefault) { 
            toast({ title: t('dietasPage.toastInformacionTitle'), description: t('dietasPage.toastDietaYaDefaultDescription') }); return; 
        }
        if (!dietaToSetDefault.isActive) { 
            toast({ title: t('dietasPage.toastErrorNombreRequeridoTitle'), description: t('dietasPage.toastErrorMarcarInactivaDefaultDescription'), variant: "destructive" }); return; 
        }
        setIsSaving(true);
        const batch = writeBatch(db);
        let oldDefaultId: string | null = null;
        dietas.forEach(d => {
            if (d.isDefault && d.id !== dietaToSetDefault.id) {
                oldDefaultId = d.id;
                batch.update(doc(db, "dietas", d.id), { isDefault: false });
            }
        });
        batch.update(doc(db, "dietas", dietaToSetDefault.id), { isDefault: true });
        try {
            await batch.commit();
            setDietas(prevDietas =>
                prevDietas.map(d => ({
                    ...d,
                    isDefault: d.id === dietaToSetDefault.id
                })).sort((a,b)=>a.nombre.localeCompare(b.nombre))
            );
            await createLogEntry('dieta', residenciaId, authUser?.uid || null, `Set dieta default: ${dietaToSetDefault.nombre}`, doc(db, "dietas", dietaToSetDefault.id).path);
            if (oldDefaultId) {
                 await createLogEntry('dieta', residenciaId, authUser?.uid || null, `Unset old dieta default (ID: ${oldDefaultId})`, doc(db, "dietas", oldDefaultId).path);
            }
            toast({ title: t('dietasPage.toastExitoTitle'), description: t('dietasPage.toastDietaMarcadaDefaultDescription').replace("{{dietaNombre}}", dietaToSetDefault.nombre) });
        } catch (error) {
            console.error("Error setting default dieta: ", error);
            toast({ title: t('dietasPage.toastErrorNombreRequeridoTitle'), description: t('dietasPage.toastErrorMarcarDefaultDescription'), variant: "destructive" });
        } finally { setIsSaving(false); }
    };

    const handleDeleteDieta = async (dietaToDelete: Dieta) => {
        if (dietaToDelete.isDefault) {
            toast({ title: t('dietasPage.toastAccionNoPermitidaTitle'), description: t('dietasPage.toastErrorEliminarDefaultDescription'), variant: "destructive" }); return;
        }
        if (dietas.length <= 1) {
            toast({ title: t('dietasPage.toastAccionNoPermitidaTitle'), description: t('dietasPage.toastErrorEliminarUltimaDietaDescription', 'No se puede eliminar la última dieta. Una residencia debe tener al menos una dieta.'), variant: "destructive" }); return;
        }
        setIsSaving(true);
        try {
            const dietaRef = doc(db, "dietas", dietaToDelete.id);
            await deleteDoc(dietaRef);
            setDietas(prevDietas => prevDietas.filter(d => d.id !== dietaToDelete.id));
            await createLogEntry('dieta', residenciaId, authUser?.uid || null, `Deleted dieta: ${dietaToDelete.nombre} (ID: ${dietaToDelete.id})`, dietaRef.path);
            toast({ title: t('dietasPage.toastExitoTitle'), description: t('dietasPage.toastDietaEliminadaDescription').replace("{{dietaNombre}}", dietaToDelete.nombre) });
        } catch (error) {
            console.error("Error deleting dieta: ", error);
            toast({ title: t('dietasPage.toastErrorNombreRequeridoTitle'), description: t('dietasPage.toastErrorEliminarDietaDescription'), variant: "destructive" });
        } finally { setIsSaving(false); }
    };



    // =========================================================================
    // Render Logic with Translations & New Auth Flow
    // =========================================================================

    // 1. Handle Initial Loading States
    if (authFirebaseLoading || adminProfileLoading || isLoadingResidencia || (textProfileName && isLoadingTexts)) {
        let loadingMessage = t('dietasPage.loadingPreparando', "Preparando...");
        if (authFirebaseLoading) loadingMessage = t('dietasPage.loadingVerificandoSesion', "Verificando sesión...");
        else if (adminProfileLoading) loadingMessage = t('dietasPage.loadingCargandoPerfilAdmin', "Cargando perfil de administrador...");
        else if (isLoadingResidencia) loadingMessage = t('dietasPage.loadingCargandoDatosResidencia', "Cargando datos de residencia...");
        else if (isLoadingTexts) loadingMessage = t('shared.loadingText', "Cargando textos..."); // Assuming a shared key for loading texts
        
        return (
            <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
                <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
                <p className="text-lg font-medium text-muted-foreground">
                    {loadingMessage}
                </p>
            </div>
        );
    }

    // 2. Handle Critical Errors (Firebase Auth, Admin Profile, Text Loading)
    let criticalErrorMessage = authFirebaseError?.message || adminProfileError || (textsError && loadedTextProfile === textProfileName ? textsError : null);
    if (criticalErrorMessage) {
        // If textsError is present but for a DIFFERENT profile than currently attempted (e.g. fallback loaded ok)
        // we might not treat it as critical for *this* render, but log it.
        if (textsError && loadedTextProfile !== textProfileName) {
            console.warn(`Translation error for profile ${textProfileName} but fallback ${loadedTextProfile} might be in use: ${textsError}`);
            if (!authFirebaseError && !adminProfileError) criticalErrorMessage = null; // Don't block render if a fallback text profile loaded
        }

        if (criticalErrorMessage) {
             return (
                <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
                    <AlertCircle className="h-12 w-12 text-destructive mb-4" />
                    <h1 className="text-2xl font-bold text-destructive mb-2">{t('dietasPage.errorCriticoTitle', "Error Crítico")}</h1>
                    <p className="mb-4 text-destructive max-w-md">
                        {criticalErrorMessage === authFirebaseError?.message ? criticalErrorMessage :
                         criticalErrorMessage === adminProfileError ? adminProfileError :
                         textsError ? textsError : // Show textsError directly if it was the one that made criticalErrorMessage non-null
                         t('dietasPage.errorCriticoDescriptionDefault', 'Ocurrió un error al cargar información esencial.')}
                    </p>
                    <Button onClick={() => router.replace('/')}>{t('dietasPage.errorCriticoButtonVolver', "Volver al Inicio")}</Button>
                </div>
            );
        }
    }

    // 3. Handle Not Authorized (after auth, profile, and residencia are loaded)
    if (!isAuthorized) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
                <AlertCircle className="h-12 w-12 text-destructive mb-4" />
                <h1 className="text-2xl font-bold text-destructive mb-2">{t('dietasPage.accesoDenegadoTitle', "Acceso Denegado")}</h1>
                <p className="mb-4 text-muted-foreground max-w-md">
                    {errorDietas === t('dietasPage.accesoDenegadoTitle') 
                        ? t('dietasPage.accesoDenegadoDescriptionNoPermiso', "No tienes permiso para acceder a las dietas de esta residencia.") 
                        : t('dietasPage.accesoDenegadoDescriptionNoVerificado', "No se pudo verificar tu autorización para esta página.")}
                </p>
                <Button onClick={() => router.replace('/admin/residencia')}>{t('dietasPage.accesoDenegadoButtonSeleccionarResidencia', "Seleccionar otra Residencia")}</Button>
            </div>
        );
    }
    
    // Fallback for residencia name if residencia object is not loaded but we passed authorization (should be rare)
    const currentResidenciaNombre = residencia?.nombre || t('dietasPage.residenciaNameLoading', "Residencia") + ` (${residenciaId})`;

    // 4. Handle Error Fetching Dietas (after authorization is confirmed)
    if (errorDietas && errorDietas !== t('dietasPage.accesoDenegadoTitle')) {
        return (
             <div className="container mx-auto p-4">
                <h1 className="text-2xl font-bold mb-4">{t('dietasPage.title', "Gestionar Dietas para")} {currentResidenciaNombre}</h1>
                <Card>
                    <CardHeader>
                        <CardTitle className="text-destructive">{t('dietasPage.errorCargarDietasTitle', "Error al Cargar Dietas")}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-destructive">{errorDietas}</p>
                        <Button onClick={fetchResidenciaAndDietas} className="mt-4">{t('dietasPage.errorReintentarButton', "Reintentar")}</Button>
                    </CardContent>
                </Card>
            </div>
        );
    }
    
    // 5. Render Main Page Content (Authorized and no critical errors)
    const formTitleText = isAdding 
        ? t('dietasPage.formAddTitle') 
        : t('dietasPage.formEditTitle').replace("{{dietaNombre}}", dietas.find(d=>d.id===editingDietaId)?.nombre || '');

    return (
        <div className="container mx-auto p-4 space-y-6">
            <h1 className="text-3xl font-bold tracking-tight">
                {t('dietasPage.title')} <span className="text-primary">{currentResidenciaNombre}</span>
            </h1>

            <Card>
                <CardHeader>
                    <CardTitle>{t('dietasPage.cardTitle')}</CardTitle>
                    <CardDescription>
                        {t('dietasPage.cardDescription').replace("{{residenciaNombre}}", residencia?.nombre || t('dietasPage.cardDescriptionFallback'))}
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
                            <p className="text-muted-foreground mb-4">{t('dietasPage.noDietasDefined')}</p>
                            <Button onClick={handleOpenAddDietaForm} disabled={isAdding || !!editingDietaId || isSaving}>
                                {t('dietasPage.addFirstDietaButton')}
                            </Button>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {dietas.map(dieta => (
                                <div key={dieta.id} className={`p-3 border rounded-lg flex flex-col md:flex-row justify-between items-start md:items-center gap-3 ${!dieta.isActive ? 'bg-slate-100 dark:bg-slate-800/50 opacity-70' : 'hover:bg-slate-50 dark:hover:bg-slate-800/30'}`}>
                                    <div className="flex-grow">
                                        <span className="font-semibold text-lg">{dieta.nombre}</span>
                                        {dieta.isDefault && <Badge variant="default" className="ml-2 bg-green-600 hover:bg-green-700 text-white">{t('dietasPage.defaultBadge')}</Badge>}
                                        {!dieta.isActive && <Badge variant="outline" className="ml-2 text-red-600 border-red-500">{t('dietasPage.inactiveBadge')}</Badge>}
                                        {dieta.descripcion && <p className="text-sm text-muted-foreground mt-1">{dieta.descripcion}</p>}
                                    </div>
                                    <div className="space-x-2 flex-shrink-0 mt-2 md:mt-0">
                                        <Button variant="outline" size="sm" onClick={() => handleEditDieta(dieta)} disabled={isAdding || !!editingDietaId || isSaving}>
                                            {t('dietasPage.editButton')}
                                        </Button>
                                        <Button
                                            variant={dieta.isActive ? "ghost" : "secondary"}
                                            size="sm"
                                            onClick={() => handleToggleActive(dieta)}
                                            disabled={isAdding || !!editingDietaId || isSaving || (dieta.isActive && !!dieta.isDefault)}
                                            className={dieta.isActive && dieta.isDefault ? "text-muted-foreground hover:text-destructive" : dieta.isActive ? "hover:text-destructive" : ""}
                                        >
                                            {dieta.isActive ? t('dietasPage.deactivateButton') : t('dietasPage.activateButton')}
                                        </Button>
                                        {!dieta.isDefault && (
                                            <Button variant="ghost" size="sm" onClick={() => handleSetDefault(dieta)} disabled={isAdding || !!editingDietaId || isSaving || !dieta.isActive}>
                                                {t('dietasPage.setDefaultButton')}
                                            </Button>
                                        )}
                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button variant="destructive" size="sm" disabled={isAdding || !!editingDietaId || isSaving || dieta.isDefault}>
                                                    {t('dietasPage.deleteButton')}
                                                </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>{t('dietasPage.deleteDialogTitle')}</AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        {t('dietasPage.deleteDialogDescription').replace("{{dietaNombre}}", dieta.nombre)}
                                                        {dieta.isDefault ? <span className="font-semibold text-destructive block mt-2">{t('dietasPage.deleteDialogWarningDefault')}</span> : ""}
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>{t('dietasPage.deleteDialogCancel')}</AlertDialogCancel>
                                                    <AlertDialogAction
                                                        onClick={() => handleDeleteDieta(dieta)}
                                                        className={buttonVariants({ variant: "destructive" })}
                                                        disabled={dieta.isDefault}
                                                    >
                                                        {t('dietasPage.deleteDialogConfirm')}
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
                                {t('dietasPage.addNewDietaButton')}
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
                            submitButtonText={isAdding ? t('dietasPage.formSubmitAdd') : t('dietasPage.formSubmitSave')}
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
    formData: Partial<Omit<Dieta, 'id' | 'residenciaId'>>;
    onFormChange: (field: keyof Omit<Dieta, 'id' | 'residenciaId'>, value: any) => void;
    onSubmit: () => Promise<void>;
    onCancel: () => void;
    isSaving: boolean;
    formTitle: string; // This will be passed already translated
    submitButtonText: string; // This will be passed already translated
    t: (key: string, fallback?: string) => string; // Add t function prop
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
    return (
        <div className="mt-6 pt-6 border-t space-y-6">
            <h3 className="font-semibold text-xl">{formTitle}</h3>
            <div>
                <Label htmlFor="dieta-nombre" className="text-base">{t('dietasPage.formNombreLabel')}</Label>
                <Input
                    id="dieta-nombre"
                    value={formData.nombre || ''}
                    onChange={(e) => onFormChange('nombre', e.target.value)}
                    placeholder={t('dietasPage.formNombrePlaceholder')}
                    disabled={isSaving}
                    maxLength={50}
                    className="mt-1 text-base"
                />
                 <p className="text-sm text-muted-foreground mt-1">{t('dietasPage.formNombreDescription')}</p>
            </div>

            <div>
                <Label htmlFor="dieta-descripcion" className="text-base">{t('dietasPage.formDescripcionLabel')}</Label>
                <Textarea
                    id="dieta-descripcion"
                    value={formData.descripcion || ''}
                    onChange={(e) => onFormChange('descripcion', e.target.value)}
                    placeholder={t('dietasPage.formDescripcionPlaceholder')}
                    disabled={isSaving}
                    rows={3}
                    maxLength={250}
                    className="mt-1 text-base"
                />
                <p className="text-sm text-muted-foreground mt-1">{t('dietasPage.formDescripcionDescription')}</p>
            </div>

            {formTitle.startsWith(t('dietasPage.formEditTitle', "Editar Dieta:").substring(0,6)) && ( // Check if formTitle starts with the translated "Editar"
                 <div className="flex items-center space-x-2 pt-2">
                    <Checkbox
                        id="dieta-isActive"
                        checked={formData.isActive === undefined ? true : formData.isActive}
                        onCheckedChange={(checked) => onFormChange('isActive', !!checked)}
                        disabled={isSaving || formData.isDefault}
                    />
                    <Label htmlFor="dieta-isActive" className="text-base">{t('dietasPage.formIsActiveLabel')}</Label>
                    {formData.isDefault && <p className="text-xs text-amber-600 ml-2">{t('dietasPage.formIsActiveWarningDefault')}</p>}
                </div>
            )}

            <div className="flex space-x-3 pt-3">
                <Button onClick={onSubmit} disabled={isSaving} size="lg">
                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
                    {isSaving ? t('dietasPage.formSavingButton') : submitButtonText}
                </Button>
                <Button variant="outline" onClick={onCancel} disabled={isSaving} size="lg">
                    {t('dietasPage.formCancelButton')}
                </Button>
            </div>
        </div>
    );
}

export default DietasResidenciaPage;