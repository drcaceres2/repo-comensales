'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';

// --- Firebase & Actions ---
import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc, deleteField, collection, getDocs } from 'firebase/firestore';
import { verificarPermisoGestion } from '@/lib/acceso-privilegiado'; // <-- Importar helper con nuevo nombre

// --- Types & Schemas ---
import { type ComedorId } from 'shared/models/types';
import type { CentroDeCosto } from 'shared/schemas/contabilidad';
import { type ConfiguracionResidencia } from 'shared/schemas/residencia';
import { type ComedorData } from 'shared/schemas/complemento1';
import { type Usuario } from 'shared/schemas/usuarios';

// --- Components ----
import { ComedorForm } from './ComedorForm';
import { logClientAction } from '@/lib/utils';
import { slugify } from 'shared/utils/commonUtils';
import { useInfoUsuario } from '@/components/layout/AppProviders';

// --- UI components ---
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/useToast";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
    ConciergeBell,
    Plus,
    Pencil,
    Trash2,
    Loader2,
    AlertCircle,
    Utensils
} from 'lucide-react';

export default function GestionComedoresPage() {
    const router = useRouter();
    const { t } = useTranslation('comedores');
    const { toast } = useToast();
    const { usuarioId, roles, residenciaId, zonaHoraria } = useInfoUsuario();

    // --- State ---
    const [comedores, setComedores] = useState<Record<ComedorId, ComedorData>>({});
    const [centroCostos, setCentroCostos] = useState<CentroDeCosto[]>([]);
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
    const [soloPropios, setSoloPropios] = useState<boolean>(false);

    // --- Modal State ---
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

    // --- Fetch Data ---
    const fetchData = useCallback(async () => {
        if (!residenciaId || !usuarioId) {
            setIsAuthorized(false);
            setLoading(false);
            return;
        }
        
        setLoading(true);
        try {
            // Verificación de autorización
            const userDocRef = doc(db, 'usuarios', usuarioId);
            const userSnap = await getDoc(userDocRef);
            if (!userSnap.exists()) {
                setIsAuthorized(false);
                return;
            }
            const userData = userSnap.data() as Usuario;

            const resultadoAcceso = await verificarPermisoGestion(userData, residenciaId, 'gestionComedores', zonaHoraria);

            if (!resultadoAcceso.tieneAcceso) {
                setIsAuthorized(false);
                return;
            }
            setIsAuthorized(true);
            setSoloPropios(resultadoAcceso.nivelAcceso === 'Propias');

            // Fetch Comedores (client side directly)
            const configRef = doc(db, 'residencias', residenciaId, 'configuracion', 'general');
            const configSnap = await getDoc(configRef);
            if (configSnap.exists()) {
                const configData = configSnap.data() as ConfiguracionResidencia;
                setComedores(configData.comedores || {});
            } else {
                setComedores({});
            }

            const ccCollRef = collection(db, 'residencias', residenciaId, 'centrosDeCosto');
            const ccSnap = await getDocs(ccCollRef);
            const ccList = ccSnap.docs
                .map(doc => ({ id: doc.id, ...doc.data() } as CentroDeCosto))
                .filter(cc => cc.estaActivo);
            setCentroCostos(ccList);
        } catch (error) {
            console.error('Error fetching data:', error);
            toast({
                title: t('messages.error_generic'),
                variant: 'destructive',
            });
        } finally {
            setLoading(false);
        }
    }, [residenciaId, usuarioId, zonaHoraria, t, toast]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // --- Handlers ---
    const handleAdd = () => {
        setEditingId(null);
        setIsFormOpen(true);
    };

    const handleEdit = (id: string) => {
        setEditingId(id);
        setIsFormOpen(true);
    };

    const handleFormSubmit = async (data: ComedorData) => {
        setIsSaving(true);
        try {
            // --- RE-VALIDACIÓN DE PERMISOS ---
            const userDocRef = doc(db, 'usuarios', usuarioId!);
            const userSnap = await getDoc(userDocRef);
            if (!userSnap.exists()) throw new Error("Tu sesión ha expirado o el usuario no existe.");
            
            const resultadoAcceso = await verificarPermisoGestion(userSnap.data() as Usuario, residenciaId, 'gestionComedores', zonaHoraria);
            if (!resultadoAcceso.tieneAcceso) {
                toast({ title: "Acceso Denegado", description: "Tus permisos han cambiado. No puedes realizar esta acción.", variant: "destructive" });
                setIsSaving(false);
                router.refresh(); // Forzar recarga para reflejar el estado de permisos actual
                return;
            }
            // Si el permiso es solo para 'Propias', no puede editar un comedor ajeno.
            if (editingId && resultadoAcceso.nivelAcceso === 'Propias' && comedores[editingId]?.creadoPor !== usuarioId) {
                toast({ title: "Acción no permitida", description: "No tienes permiso para editar este comedor.", variant: "destructive" });
                setIsSaving(false);
                return;
            }
            // --- FIN DE RE-VALIDACIÓN ---

            const id = editingId || slugify(data.nombre);
            
            // Check if ID exists for NEW comedor
            if (!editingId && comedores[id]) {
                toast({
                    title: "Error",
                    description: "Ya existe un comedor con ese nombre (o un nombre muy similar).",
                    variant: "destructive"
                });
                setIsSaving(false);
                return;
            }

            const cleanData: Partial<ComedorData> = {
                nombre: data.nombre,
                creadoPor: data.creadoPor,
            };
            if (data.descripcion) cleanData.descripcion = data.descripcion;
            if (data.aforoMaximo) cleanData.aforoMaximo = data.aforoMaximo;
            if (data.centroCostoId) cleanData.centroCostoId = data.centroCostoId;

            const configRef = doc(db, 'residencias', residenciaId, 'configuracion', 'general');
            await updateDoc(configRef, {
                [`comedores.${id}`]: cleanData
            });

            await logClientAction(
                editingId ? 'COMEDOR_ACTUALIZADO' : 'COMEDOR_CREADO',
                {
                    targetId: id,
                    targetCollection: 'configuracion/general',
                    residenciaId: residenciaId,
                    details: { nombre: data.nombre }
                }
            );

            toast({ title: editingId ? t('messages.success_edit') : t('messages.success_add') });
            setIsFormOpen(false);
            fetchData(); // Refresh list
        } catch (error: any) {
            console.error('Error upserting comedor:', error);
            toast({
                title: t('messages.error_generic'),
                description: error.message,
                variant: 'destructive',
            });
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!deleteConfirmId) return;

        // --- RE-VALIDACIÓN DE PERMISOS ---
        const userDocRef = doc(db, 'usuarios', usuarioId!);
        const userSnap = await getDoc(userDocRef);
        if (!userSnap.exists()) throw new Error("Tu sesión ha expirado o el usuario no existe.");
        
        const resultadoAcceso = await verificarPermisoGestion(userSnap.data() as Usuario, residenciaId, 'gestionComedores', zonaHoraria);
        // Para eliminar, se necesita acceso a 'Todas' o ser el creador si el acceso es 'Propias'.
        const puedeEliminar = resultadoAcceso.tieneAcceso && (resultadoAcceso.nivelAcceso === 'Todas' || (resultadoAcceso.nivelAcceso === 'Propias' && comedores[deleteConfirmId]?.creadoPor === usuarioId));

        if (!puedeEliminar) {
            toast({ title: "Acceso Denegado", description: "No tienes permiso para eliminar este comedor.", variant: "destructive" });
            setIsSaving(false);
            setDeleteConfirmId(null);
            router.refresh();
            return;
        }

        // Prevention: Always keep at least one comedor
        if (Object.keys(comedores).length <= 1) {
            toast({
                title: "Error",
                description: t('last_comedor_error'),
                variant: 'destructive',
            });
            setDeleteConfirmId(null);
            return;
        }

        setIsSaving(true);
        try {
            const configRef = doc(db, 'residencias', residenciaId, 'configuracion', 'general');
            await updateDoc(configRef, {
                [`comedores.${deleteConfirmId}`]: deleteField()
            });

            await logClientAction(
                'COMEDOR_ELIMINADO',
                {
                    targetId: deleteConfirmId,
                    targetCollection: 'configuracion/general',
                    residenciaId: residenciaId,
                    details: { id: deleteConfirmId }
                }
            );

            toast({ title: t('messages.success_delete') });
            setDeleteConfirmId(null);
            fetchData();
        } catch (error: any) {
            console.error('Error deleting comedor:', error);
            toast({
                title: t('messages.error_generic'),
                description: error.message,
                variant: 'destructive',
            });
        } finally {
            setIsSaving(false);
        }
    };

    // --- Loading State ---
    if (loading || isAuthorized === null) {
        return (
            <div className="container mx-auto p-6 space-y-6">
                <div className="flex justify-between items-center">
                    <div className="space-y-2">
                        <Skeleton className="h-10 w-64" />
                        <Skeleton className="h-4 w-48" />
                    </div>
                    <Skeleton className="h-10 w-32" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {[1, 2, 3].map(i => (
                        <Skeleton key={i} className="h-48 w-full rounded-xl" />
                    ))}
                </div>
            </div>
        );
    }

    if (!isAuthorized || !usuarioId) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] p-4 text-center">
                <AlertCircle className="h-12 w-12 text-destructive mb-4" />
                <h1 className="text-2xl font-bold text-destructive mb-2">Acceso Denegado</h1>
                <p className="mb-4 text-muted-foreground max-w-md">
                    No tienes los permisos necesarios para gestionar los comedores de esta residencia.
                </p>
                <Button onClick={() => router.replace('/')}>Volver al inicio</Button>
            </div>
        );
    }

    const comedoresList = Object.entries(comedores).filter(([_, data]) => {
        if (soloPropios) {
            return data.creadoPor === usuarioId;
        }
        return true;
    });

    return (
        <div className="container mx-auto p-6 space-y-8 animate-in fade-in duration-500">
            {/* Header */}
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b pb-6">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-primary/10 rounded-full text-primary">
                        <ConciergeBell size={32} />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
                        <p className="text-muted-foreground">{residenciaId}</p>
                    </div>
                </div>
                <Button onClick={handleAdd} className="w-full md:w-auto shadow-sm">
                    <Plus className="mr-2 h-4 w-4" /> {t('add_comedor')}
                </Button>
            </header>

            {/* List */}
            {comedoresList.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
                    <div className="p-6 bg-muted rounded-full text-muted-foreground/50">
                        <Utensils size={64} />
                    </div>
                    <h3 className="text-xl font-medium text-muted-foreground">
                        {soloPropios ? "No has creado ningún comedor todavía" : "No hay comedores registrados"}
                    </h3>
                    <Button variant="outline" onClick={handleAdd}>Empezar a añadir</Button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {comedoresList.map(([id, data]) => {
                        const puedeEditar = !soloPropios || (soloPropios && data.creadoPor === usuarioId);
                        return (
                            <Card key={id} className="overflow-hidden hover:shadow-md transition-shadow">
                                <CardHeader className="bg-muted/50 pb-4">
                                    <div className="flex justify-between items-start">
                                        <CardTitle className="text-xl">{data.nombre}</CardTitle>
                                        <Badge variant="secondary">
                                            {data.aforoMaximo || '∞'} personas
                                        </Badge>
                                    </div>
                                    {data.centroCostoId && (
                                        <CardDescription className="flex items-center gap-1 mt-1 font-medium">
                                            CC: {data.centroCostoId}
                                        </CardDescription>
                                    )}
                                </CardHeader>
                                <CardContent className="pt-6 space-y-4">
                                    <p className="text-muted-foreground line-clamp-3 min-h-[4.5rem]">
                                        {data.descripcion || 'Sin descripción.'}
                                    </p>
                                    <div className="flex gap-2 pt-2">
                                        <Button 
                                            variant="outline" 
                                            className="flex-1"
                                            onClick={() => handleEdit(id)}
                                            disabled={!puedeEditar}
                                        >
                                            <Pencil className="mr-2 h-4 w-4" /> {t('form.submit_edit')}
                                        </Button>
                                        <Button 
                                            variant="ghost" 
                                            size="icon"
                                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                            onClick={() => setDeleteConfirmId(id)}
                                            disabled={!puedeEditar}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}

            {/* Add/Edit Modal */}
            <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
                <DialogContent className="sm:max-w-[500px] backdrop-blur-sm bg-background/95">
                    <DialogHeader>
                        <DialogTitle>
                            {editingId ? t('edit_comedor') : t('add_comedor')}
                        </DialogTitle>
                        <DialogDescription>
                            Completa los datos del comedor. El nombre debe ser único.
                        </DialogDescription>
                    </DialogHeader>
                    <ComedorForm 
                        initialData={editingId ? comedores[editingId] : undefined}
                        onSubmit={handleFormSubmit}
                        onCancel={() => setIsFormOpen(false)}
                        isSaving={isSaving}
                        centroCostosList={centroCostos}
                        creadoPorData={usuarioId}
                    />
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation */}
            <AlertDialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t('confirm_delete')}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {t('delete_warning')}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isSaving}>{t('form.cancel')}</AlertDialogCancel>
                        <AlertDialogAction 
                            onClick={(e) => {
                                e.preventDefault();
                                handleDelete();
                            }}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            disabled={isSaving}
                        >
                            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {t('delete_comedor')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
