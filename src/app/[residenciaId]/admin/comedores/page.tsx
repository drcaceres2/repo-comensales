'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';

// --- Firebase & Actions ---
import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc, deleteField, collection, getDocs } from 'firebase/firestore';
import { useAuth } from '@/hooks/useAuth';

// --- Types & Schemas ---
import { type ComedorId } from 'shared/models/types';
import type { CentroDeCosto, ConfigContabilidad } from 'shared/schemas/contabilidad';
import { type ConfiguracionResidencia } from 'shared/schemas/residencia';
import { type ComedorData } from 'shared/schemas/complemento1';
import { type Usuario } from 'shared/schemas/usuarios';

// --- Components ----
import { ComedorForm } from './ComedorForm';
import { logClientAction } from '@/lib/utils';
import { slugify } from 'shared/utils/commonUtils';

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
    const params = useParams();
    const router = useRouter();
    const residenciaId = params.residenciaId as string;
    const { t } = useTranslation('comedores');
    const { toast } = useToast();
    const { user: authUser, loading: authLoading } = useAuth();

    // --- State ---
    const [comedores, setComedores] = useState<Record<ComedorId, ComedorData>>({});
    const [centroCostos, setCentroCostos] = useState<CentroDeCosto[]>([]);
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [residenciaNombre, setResidenciaNombre] = useState('');
    const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);

    // --- Modal State ---
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

    // --- Fetch Data ---
    const fetchData = useCallback(async () => {
        if (!residenciaId || !authUser) return;
        
        // Authorization Check
        const userDocRef = doc(db, 'usuarios', authUser.uid);
        const userSnap = await getDoc(userDocRef);
        if (!userSnap.exists()) {
            setIsAuthorized(false);
            setLoading(false);
            return;
        }

        const userData = userSnap.data() as Usuario;
        const roles = userData.roles || [];
        const isAllowed = roles.some((role: string) => ['admin', 'director', 'asistente', 'master'].includes(role)) 
                         && (userData.residenciaId === residenciaId || roles.includes('master'));

        if (!isAllowed) {
            setIsAuthorized(false);
            setLoading(false);
            return;
        }

        setIsAuthorized(true);
        setLoading(true);
        try {
            // Fetch Comedores (client side directly)
            const configRef = doc(db, 'residencias', residenciaId, 'configuracion', 'general');
            const configSnap = await getDoc(configRef);
            if (configSnap.exists()) {
                const configData = configSnap.data() as ConfiguracionResidencia;
                setComedores(configData.comedores || {});
            } else {
                setComedores({});
            }

            // Fetch Residencia Info & Centro Costos (client side is fine)
            const resRef = doc(db, 'residencias', residenciaId);
            const resSnap = await getDoc(resRef);
            if (resSnap.exists()) {
                setResidenciaNombre(resSnap.data().nombre);
            }
            // ZONA HORARIA AQUÍ
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
    }, [residenciaId, t, toast, authUser]);

    useEffect(() => {
        if (!authLoading && authUser) {
            fetchData();
        }
    }, [authLoading, authUser, fetchData]);

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
    if (loading || authLoading) {
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

    if (isAuthorized === false) {
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

    const comedoresList = Object.entries(comedores);

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
                        <p className="text-muted-foreground">{residenciaNombre}</p>
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
                    <h3 className="text-xl font-medium text-muted-foreground">No hay comedores registrados</h3>
                    <Button variant="outline" onClick={handleAdd}>Empezar a añadir</Button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {comedoresList.map(([id, data]) => (
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
                                    >
                                        <Pencil className="mr-2 h-4 w-4" /> {t('form.submit_edit')}
                                    </Button>
                                    <Button 
                                        variant="ghost" 
                                        size="icon"
                                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                        onClick={() => setDeleteConfirmId(id)}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
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
