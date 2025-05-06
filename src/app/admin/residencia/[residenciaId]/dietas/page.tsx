'use client';

import React, { useState, useEffect, useCallback } from 'react'; // Added useCallback
import { useParams, useRouter } from 'next/navigation'; // Added useRouter
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Dieta, ResidenciaId, LogEntry, LogActionType, UserProfile, UserRole } from '@/models/firestore'; // Added UserProfile, UserRole
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from "@/components/ui/textarea";
import { Loader2, AlertCircle } from 'lucide-react'; // Added Loader2, AlertCircle

// --- Firebase Imports ---
import { Timestamp, addDoc, collection, doc, getDoc, query, where, getDocs, setDoc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore'; // Added writeBatch
import { db, auth } from '@/lib/firebase';
import { useAuthState } from 'react-firebase-hooks/auth'; // New Auth Hook

// --- Log Helper ---
async function createLogEntry(
    actionType: LogActionType,
    residenciaId: ResidenciaId,
    userId: string | null, // Changed to accept userId
    details?: string,
    relatedDocPath?: string
) {
    if (!userId) {
        console.warn("Cannot create log entry: User ID is missing.");
        return;
    }
    try {
        const logEntryData: Omit<LogEntry, 'id'> = {
            timestamp: Timestamp.now(),
            userId: userId,
            residenciaId: residenciaId,
            actionType: actionType,
            relatedDocPath: relatedDocPath,
            details: details,
        };
        console.log("Attempting to create log entry:", logEntryData);
        // Uncomment to enable actual logging
        // await addDoc(collection(db, "logEntries"), logEntryData);
        // console.log("Log entry created.");
    } catch (error) {
        console.error("Error creating log entry:", error);
    }
}

export default function DietasResidenciaPage(): JSX.Element | null {
    const params = useParams();
    const router = useRouter(); // For redirects
    const residenciaId = params.residenciaId as ResidenciaId;
    const { toast } = useToast();

    // --- Auth & Profile State (New) ---
    const [authUser, authFirebaseLoading, authFirebaseError] = useAuthState(auth);
    const [adminUserProfile, setAdminUserProfile] = useState<UserProfile | null>(null);
    const [adminProfileLoading, setAdminProfileLoading] = useState<boolean>(true);
    const [adminProfileError, setAdminProfileError] = useState<string | null>(null);
    const [isAuthorized, setIsAuthorized] = useState<boolean>(false);

    // --- Page Data State ---
    const [dietas, setDietas] = useState<Dieta[]>([]);
    const [isLoadingDietas, setIsLoadingDietas] = useState(true); // Specific loading for dietas
    const [errorDietas, setErrorDietas] = useState<string | null>(null); // Specific error for dietas
    const [residenciaNombre, setResidenciaNombre] = useState<string>('');
    const [isLoadingResidenciaNombre, setIsLoadingResidenciaNombre] = useState(true);

    // --- Form State ---
    const [isAdding, setIsAdding] = useState(false);
    const [editingDietaId, setEditingDietaId] = useState<string | null>(null);
    const [formData, setFormData] = useState<Partial<Omit<Dieta, 'id' | 'residenciaId'>>>({}); // Omit id and residenciaId
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
            toast({ title: "Error de Autenticación", description: authFirebaseError.message, variant: "destructive" });
            setAdminProfileLoading(false); setAdminUserProfile(null); setAdminProfileError(authFirebaseError.message); setIsAuthorized(false);
            router.replace('/');
            return;
        }
        if (!authUser) {
            console.log("No Firebase user. Redirecting to login.");
            setAdminProfileLoading(false); setAdminUserProfile(null); setAdminProfileError(null); setIsAuthorized(false);
            router.replace('/');
            return;
        }

        console.log("Admin user authenticated (UID:", authUser.uid,"). Fetching admin's profile...");
        setAdminProfileLoading(true); setAdminProfileError(null);
        const adminDocRef = doc(db, "users", authUser.uid);
        getDoc(adminDocRef)
            .then((docSnap) => {
                if (docSnap.exists()) {
                    setAdminUserProfile(docSnap.data() as UserProfile);
                    console.log("Admin's profile fetched:", docSnap.data());
                } else {
                    console.error("Admin's profile not found for UID:", authUser.uid);
                    setAdminUserProfile(null); setAdminProfileError("Perfil de administrador no encontrado.");
                    toast({ title: "Error de Perfil", description: "No se encontró tu perfil de administrador.", variant: "destructive" });
                }
            })
            .catch((error) => {
                console.error("Error fetching admin's profile:", error);
                setAdminUserProfile(null); setAdminProfileError(`Error al cargar tu perfil: ${error.message}`);
                toast({ title: "Error Cargando Perfil", description: `No se pudo cargar tu perfil: ${error.message}`, variant: "destructive" });
            })
            .finally(() => setAdminProfileLoading(false));
    }, [authUser, authFirebaseLoading, authFirebaseError, router, toast]);

    // --- useEffect: Handle Authorization & Fetch Page Data (Residencia Nombre, Dietas) ---
    const fetchResidenciaAndDietas = useCallback(async () => {
        if (!residenciaId || !adminUserProfile) { // Ensure residenciaId and admin profile are available
            setIsAuthorized(false);
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
            toast({ title: "Acceso Denegado", description: "No tienes permiso para ver las dietas de esta residencia.", variant: "destructive" });
            // Consider redirecting or showing a specific message in render logic
            // router.replace('/admin/residencia'); // Example redirect
            setErrorDietas("Acceso denegado."); // Set an error to be displayed
            setIsLoadingResidenciaNombre(false);
            setIsLoadingDietas(false);
            return;
        }

        setIsAuthorized(true);
        console.log(`User authorized. Fetching data for residenciaId: ${residenciaId}`);

        // Fetch Residencia Nombre
        setIsLoadingResidenciaNombre(true);
        try {
            const residenciaDocRef = doc(db, "residencias", residenciaId);
            const residenciaDocSnap = await getDoc(residenciaDocRef);
            if (residenciaDocSnap.exists()) {
                setResidenciaNombre(residenciaDocSnap.data()?.nombre || `Residencia (${residenciaId})`);
            } else {
                console.error(`Residencia con ID: ${residenciaId} no encontrada.`);
                setResidenciaNombre(`Residencia (${residenciaId})`); // Fallback name
                setErrorDietas(`La residencia con ID ${residenciaId} no fue encontrada.`); // Set error for dietas as well
            }
        } catch (err) {
            console.error("Error fetching residencia nombre:", err);
            setResidenciaNombre(`Residencia (${residenciaId})`);
            setErrorDietas("Error cargando el nombre de la residencia.");
        } finally {
            setIsLoadingResidenciaNombre(false);
        }

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
            fetchedDietas.sort((a, b) => a.nombre.localeCompare(b.nombre)); // Sort dietas
            setDietas(fetchedDietas);
            console.log(`Fetched ${fetchedDietas.length} dietas for ${residenciaId}`);
        } catch (err) {
            console.error("Error fetching dietas:", err);
            setErrorDietas("Error al cargar las dietas.");
            setDietas([]);
        } finally {
            setIsLoadingDietas(false);
        }
    }, [residenciaId, adminUserProfile, toast]); // router is not needed here if redirects handled elsewhere or by render logic

    useEffect(() => {
        // Trigger fetch when adminUserProfile is loaded and residenciaId is available
        if (!adminProfileLoading && adminUserProfile && residenciaId) {
            fetchResidenciaAndDietas();
        } else if (!adminProfileLoading && !adminUserProfile) {
            // If profile loading is done but no profile, implies auth error or no profile found
            // This case is mostly handled by the first useEffect redirecting, but as a fallback:
            setIsAuthorized(false);
            setIsLoadingResidenciaNombre(false);
            setIsLoadingDietas(false);
        }
    }, [adminProfileLoading, adminUserProfile, residenciaId, fetchResidenciaAndDietas]);


    // --- Placeholder Handlers (to be updated for Firestore) ---
    const handleOpenAddDietaForm = () => {
        setIsAdding(true); setEditingDietaId(null); setFormData({}); console.log("Opening Add Dieta form");
    };
    const handleCancelDietaForm = () => {
        setIsAdding(false); setEditingDietaId(null); setFormData({}); console.log("Closing Add/Edit Dieta form");
    };
    const handleDietaFormChange = (field: keyof Omit<Dieta, 'id' | 'residenciaId'>, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleAddDieta = async () => {
        if (!formData.nombre?.trim()) { toast({ title: "Error", description: "El nombre es requerido.", variant: "destructive" }); return; }
        if (dietas.some(d => d.nombre.toLowerCase() === formData.nombre!.trim().toLowerCase())) { toast({ title: "Error", description: "Ya existe una dieta con ese nombre.", variant: "destructive" }); return; }
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
            await createLogEntry('dieta_created', residenciaId, authUser?.uid || null, `Created dieta: ${newDietaWithId.nombre}`, docRef.path);
            toast({ title: "Éxito", description: `Dieta "${newDietaWithId.nombre}" añadida.` });
            handleCancelDietaForm();
        } catch (error) {
            console.error("Error adding dieta: ", error);
            toast({ title: "Error", description: "No se pudo añadir la dieta.", variant: "destructive" });
        } finally { setIsSaving(false); }
    };

    const handleEditDieta = (dieta: Dieta) => {
        setEditingDietaId(dieta.id); setIsAdding(false);
        setFormData({ nombre: dieta.nombre, descripcion: dieta.descripcion, isActive: dieta.isActive, isDefault: dieta.isDefault });
        console.log("Opening Edit Dieta form for:", dieta.id);
    };

    const handleSaveDieta = async () => {
        if (!editingDietaId) return;
        if (!formData.nombre?.trim()) { toast({ title: "Error", description: "El nombre es requerido.", variant: "destructive" }); return; }
        if (dietas.some(d => d.id !== editingDietaId && d.nombre.toLowerCase() === formData.nombre!.trim().toLowerCase())) { toast({ title: "Error", description: "Ya existe OTRA dieta con ese nombre.", variant: "destructive" }); return; }
        setIsSaving(true);
        const originalDieta = dietas.find(d => d.id === editingDietaId);
        if (!originalDieta) { toast({ title: "Error", description: "Dieta original no encontrada.", variant: "destructive" }); setIsSaving(false); return; }

        const updatedDietaData: Partial<Dieta> = {
            nombre: formData.nombre.trim(),
            descripcion: formData.descripcion?.trim() || '',
            isActive: formData.isActive === undefined ? originalDieta.isActive : formData.isActive, // Keep original if not in form
            // isDefault cannot be changed directly here, only via handleSetDefault
        };
        try {
            const dietaRef = doc(db, "dietas", editingDietaId);
            await updateDoc(dietaRef, updatedDietaData);
            const updatedDietaInState: Dieta = { ...originalDieta, ...updatedDietaData };
            setDietas(prev => prev.map(d => d.id === editingDietaId ? updatedDietaInState : d).sort((a,b)=>a.nombre.localeCompare(b.nombre)));
            await createLogEntry('dieta_updated', residenciaId, authUser?.uid || null, `Updated dieta: ${updatedDietaInState.nombre}`, dietaRef.path);
            toast({ title: "Éxito", description: `Dieta "${updatedDietaInState.nombre}" actualizada.` });
            handleCancelDietaForm();
        } catch (error) {
            console.error("Error saving dieta: ", error);
            toast({ title: "Error", description: "No se pudo guardar la dieta.", variant: "destructive" });
        } finally { setIsSaving(false); }
    };

    const handleToggleActive = async (dietaToToggle: Dieta) => {
        if (dietaToToggle.isDefault && dietaToToggle.isActive) {
            toast({ title: "Acción no permitida", description: "No se puede desactivar la dieta Default.", variant: "destructive" }); return;
        }
        const newStatus = !dietaToToggle.isActive;
        setIsSaving(true); // Indicate general saving activity
        try {
            const dietaRef = doc(db, "dietas", dietaToToggle.id);
            await updateDoc(dietaRef, { isActive: newStatus });
            setDietas(prev => prev.map(d => d.id === dietaToToggle.id ? { ...d, isActive: newStatus } : d).sort((a,b)=>a.nombre.localeCompare(b.nombre)));
            await createLogEntry('dieta_updated', residenciaId, authUser?.uid || null, `${newStatus ? 'Activated' : 'Deactivated'} dieta: ${dietaToToggle.nombre}`, dietaRef.path);
            toast({ title: newStatus ? "Activada" : "Desactivada", description: `La dieta "${dietaToToggle.nombre}" ha sido ${newStatus ? 'activada' : 'desactivada'}.` });
        } catch (error) {
            console.error("Error toggling active status: ", error);
            toast({ title: "Error", description: "No se pudo cambiar el estado de la dieta.", variant: "destructive" });
        } finally { setIsSaving(false); }
    };

    const handleSetDefault = async (dietaToSetDefault: Dieta) => {
        if (dietaToSetDefault.isDefault) { toast({ title: "Información", description: "Esta dieta ya es la Default." }); return; }
        if (!dietaToSetDefault.isActive) { toast({ title: "Error", description: "No se puede marcar una dieta inactiva como Default.", variant: "destructive" }); return; }
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
            await createLogEntry('dieta_updated', residenciaId, authUser?.uid || null, `Set dieta default: ${dietaToSetDefault.nombre}`, doc(db, "dietas", dietaToSetDefault.id).path);
            if (oldDefaultId) {
                 await createLogEntry('dieta_updated', residenciaId, authUser?.uid || null, `Unset old dieta default (ID: ${oldDefaultId})`, doc(db, "dietas", oldDefaultId).path);
            }
            toast({ title: "Éxito", description: `Dieta "${dietaToSetDefault.nombre}" marcada como Default.` });
        } catch (error) {
            console.error("Error setting default dieta: ", error);
            toast({ title: "Error", description: "No se pudo marcar la dieta como Default.", variant: "destructive" });
        } finally { setIsSaving(false); }
    };

    const handleDeleteDieta = async (dietaToDelete: Dieta) => {
        if (dietaToDelete.isDefault) { toast({ title: "Acción no permitida", description: "No se puede eliminar la dieta Default.", variant: "destructive" }); return; }
        setIsSaving(true);
        try {
            const dietaRef = doc(db, "dietas", dietaToDelete.id);
            await deleteDoc(dietaRef);
            setDietas(prevDietas => prevDietas.filter(d => d.id !== dietaToDelete.id));
            await createLogEntry('dieta_deleted', residenciaId, authUser?.uid || null, `Deleted dieta: ${dietaToDelete.nombre} (ID: ${dietaToDelete.id})`, dietaRef.path);
            toast({ title: "Éxito", description: `Dieta "${dietaToDelete.nombre}" eliminada.` });
        } catch (error) {
            console.error("Error deleting dieta: ", error);
            toast({ title: "Error", description: "No se pudo eliminar la dieta.", variant: "destructive" });
        } finally { setIsSaving(false); }
    };

    // =========================================================================
    // Render Logic with New Auth Flow
    // =========================================================================

    // 1. Handle Initial Loading (Firebase Auth, Admin's Profile, or Residencia Name)
    if (authFirebaseLoading || adminProfileLoading || (isAuthorized && isLoadingResidenciaNombre)) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
                <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
                <p className="text-lg font-medium text-muted-foreground">
                    {authFirebaseLoading ? 'Verificando sesión...' :
                     adminProfileLoading ? "Cargando perfil de administrador..." :
                     isLoadingResidenciaNombre ? "Cargando datos de residencia..." :
                     "Preparando..."}
                </p>
            </div>
        );
    }

    // 2. Handle Firebase Auth Error or Admin's Profile Fetch Error
    if (authFirebaseError || adminProfileError) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
                <AlertCircle className="h-12 w-12 text-destructive mb-4" />
                <h1 className="text-2xl font-bold text-destructive mb-2">Error Crítico</h1>
                <p className="mb-4 text-destructive max-w-md">
                    {authFirebaseError?.message || adminProfileError || 'Ocurrió un error al cargar información esencial.'}
                </p>
                <Button onClick={() => router.replace('/')}>Volver al Inicio</Button>
            </div>
        );
    }

    // 3. Handle Not Authorized (after auth and profile loading are complete and no critical errors)
    if (!isAuthorized) {
        // This can happen if roles are insufficient or if there was an error fetching initial page data like residenciaNombre
        // that led to setErrorDietas("Acceso denegado")
        return (
            <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
                <AlertCircle className="h-12 w-12 text-destructive mb-4" />
                <h1 className="text-2xl font-bold text-destructive mb-2">Acceso Denegado</h1>
                <p className="mb-4 text-muted-foreground max-w-md">
                    {errorDietas === "Acceso denegado." ? "No tienes permiso para acceder a las dietas de esta residencia." :
                     "No se pudo verificar tu autorización para esta página."}
                </p>
                <Button onClick={() => router.replace('/admin/residencia')}>Seleccionar otra Residencia</Button>
            </div>
        );
    }

    // 4. Handle Error Fetching Dietas (after authorization is confirmed)
    if (errorDietas && errorDietas !== "Acceso denegado.") { // Don't show this if it was an auth issue
        return (
             <div className="container mx-auto p-4">
                <h1 className="text-2xl font-bold mb-4">Gestionar Dietas para {residenciaNombre || `Residencia (${residenciaId})`}</h1>
                <Card>
                    <CardHeader>
                        <CardTitle className="text-destructive">Error al Cargar Dietas</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-destructive">{errorDietas}</p>
                        <Button onClick={fetchResidenciaAndDietas} className="mt-4">Reintentar</Button>
                    </CardContent>
                </Card>
            </div>
        );
    }
    
    // 5. Render Main Page Content (Authorized and no critical errors)
    return (
        <div className="container mx-auto p-4 space-y-6">
            <h1 className="text-3xl font-bold tracking-tight">Gestionar Dietas para <span className="text-primary">{residenciaNombre || `Residencia (${residenciaId})`}</span></h1>

            <Card>
                <CardHeader>
                    <CardTitle>Dietas Disponibles</CardTitle>
                    <CardDescription>
                        Define las dietas especiales para <span className="font-semibold">{residenciaNombre || `esta residencia`}</span>. Una debe ser marcada como 'Default'.
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
                            <p className="text-muted-foreground mb-4">No hay dietas definidas para esta residencia.</p>
                            <Button onClick={handleOpenAddDietaForm} disabled={isAdding || !!editingDietaId || isSaving}>
                                + Añadir Primera Dieta
                            </Button>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {dietas.map(dieta => (
                                <div key={dieta.id} className={`p-3 border rounded-lg flex flex-col md:flex-row justify-between items-start md:items-center gap-3 ${!dieta.isActive ? 'bg-slate-100 dark:bg-slate-800/50 opacity-70' : 'hover:bg-slate-50 dark:hover:bg-slate-800/30'}`}>
                                    <div className="flex-grow">
                                        <span className="font-semibold text-lg">{dieta.nombre}</span>
                                        {dieta.isDefault && <Badge variant="default" className="ml-2 bg-green-600 hover:bg-green-700 text-white">Default</Badge>}
                                        {!dieta.isActive && <Badge variant="outline" className="ml-2 text-red-600 border-red-500">Inactiva</Badge>}
                                        {dieta.descripcion && <p className="text-sm text-muted-foreground mt-1">{dieta.descripcion}</p>}
                                    </div>
                                    <div className="space-x-2 flex-shrink-0 mt-2 md:mt-0">
                                        <Button variant="outline" size="sm" onClick={() => handleEditDieta(dieta)} disabled={isAdding || !!editingDietaId || isSaving}>
                                            Editar
                                        </Button>
                                        <Button
                                            variant={dieta.isActive ? "ghost" : "secondary"}
                                            size="sm"
                                            onClick={() => handleToggleActive(dieta)}
                                            disabled={isAdding || !!editingDietaId || isSaving || (dieta.isActive && !!dieta.isDefault)}
                                            className={dieta.isActive && dieta.isDefault ? "text-muted-foreground hover:text-destructive" : dieta.isActive ? "hover:text-destructive" : ""}
                                        >
                                            {dieta.isActive ? 'Desactivar' : 'Activar'}
                                        </Button>
                                        {!dieta.isDefault && (
                                            <Button variant="ghost" size="sm" onClick={() => handleSetDefault(dieta)} disabled={isAdding || !!editingDietaId || isSaving || !dieta.isActive}>
                                                Marcar Default
                                            </Button>
                                        )}
                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button variant="destructive" size="sm" disabled={isAdding || !!editingDietaId || isSaving || dieta.isDefault}>
                                                    Eliminar
                                                </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>¿Estás realmente seguro?</AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        Esta acción eliminará la dieta "{dieta.nombre}". Esta acción no se puede deshacer.
                                                        {dieta.isDefault ? <span className="font-semibold text-destructive block mt-2">¡Advertencia! Esta es la dieta Default.</span> : ""}
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                    <AlertDialogAction
                                                        onClick={() => handleDeleteDieta(dieta)}
                                                        className={buttonVariants({ variant: "destructive" })}
                                                        disabled={dieta.isDefault}
                                                    >
                                                        Sí, Eliminar
                                                    </AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Add New Dieta Button - only show if not adding/editing and there are dietas or no dietas at all */}
                    {(!isAdding && !editingDietaId && dietas.length > 0) && (
                        <div className="mt-6 pt-6 border-t">
                            <Button onClick={handleOpenAddDietaForm} disabled={isAdding || !!editingDietaId || isSaving}>
                                + Añadir Nueva Dieta
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
                            formTitle={isAdding ? "Añadir Nueva Dieta" : `Editar Dieta: ${dietas.find(d=>d.id===editingDietaId)?.nombre || ''}`}
                            submitButtonText={isAdding ? "Añadir Dieta" : "Guardar Cambios"}
                        />
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

// DietaForm component (assuming it's correctly defined below as per your original structure)
interface DietaFormProps {
    formData: Partial<Omit<Dieta, 'id' | 'residenciaId'>>;
    onFormChange: (field: keyof Omit<Dieta, 'id' | 'residenciaId'>, value: any) => void;
    onSubmit: () => Promise<void>;
    onCancel: () => void;
    isSaving: boolean;
    formTitle: string;
    submitButtonText: string;
}

function DietaForm({
    formData,
    onFormChange,
    onSubmit,
    onCancel,
    isSaving,
    formTitle,
    submitButtonText
}: DietaFormProps) {
    return (
        <div className="mt-6 pt-6 border-t space-y-6"> {/* Added space-y-6 */}
            <h3 className="font-semibold text-xl">{formTitle}</h3> {/* Increased size */}
            <div>
                <Label htmlFor="dieta-nombre" className="text-base">Nombre de la Dieta *</Label> {/* Increased size */}
                <Input
                    id="dieta-nombre"
                    value={formData.nombre || ''}
                    onChange={(e) => onFormChange('nombre', e.target.value)}
                    placeholder="Ej. Sin Gluten, Vegetariana"
                    disabled={isSaving}
                    maxLength={50}
                    className="mt-1 text-base" /* Increased size */
                />
                 <p className="text-sm text-muted-foreground mt-1">Nombre corto y descriptivo (máx 50 caract.)</p>
            </div>

            <div>
                <Label htmlFor="dieta-descripcion" className="text-base">Descripción (Opcional)</Label> {/* Increased size */}
                <Textarea
                    id="dieta-descripcion"
                    value={formData.descripcion || ''}
                    onChange={(e) => onFormChange('descripcion', e.target.value)}
                    placeholder="Breve descripción de las características principales de la dieta..."
                    disabled={isSaving}
                    rows={3}
                    maxLength={250} // Increased max length
                    className="mt-1 text-base" /* Increased size */
                />
                <p className="text-sm text-muted-foreground mt-1">Detalles sobre la dieta (máx 250 caract.)</p>
            </div>

            {/* isActive is only for editing, not for new dietas (they are active by default) */}
            {/* We manage isActive via the toggle button, but if you want it in edit form: */}
            {formTitle.startsWith("Editar") && ( // Only show for editing existing dietas
                 <div className="flex items-center space-x-2 pt-2">
                    <Checkbox
                        id="dieta-isActive"
                        checked={formData.isActive === undefined ? true : formData.isActive} // Default to true if undefined in form
                        onCheckedChange={(checked) => onFormChange('isActive', !!checked)}
                        disabled={isSaving || formData.isDefault} // Cannot make default diet inactive from form
                    />
                    <Label htmlFor="dieta-isActive" className="text-base">Dieta Activa</Label>
                    {formData.isDefault && <p className="text-xs text-amber-600 ml-2">(La dieta Default no puede desactivarse desde aquí)</p>}
                </div>
            )}


            <div className="flex space-x-3 pt-3"> {/* Increased spacing */}
                <Button onClick={onSubmit} disabled={isSaving} size="lg"> {/* Increased size */}
                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
                    {isSaving ? 'Guardando...' : submitButtonText}
                </Button>
                <Button variant="outline" onClick={onCancel} disabled={isSaving} size="lg"> {/* Increased size */}
                    Cancelar
                </Button>
            </div>
        </div>
    );
}
