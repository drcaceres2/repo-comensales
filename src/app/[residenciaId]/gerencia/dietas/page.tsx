'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
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
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/useToast';
import { useInfoUsuario } from '@/components/layout/AppProviders';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DietaId, ResidenciaId, RolUsuario } from 'shared/models/types';
import { DietaData } from 'shared/schemas/complemento1';
import { slugify } from 'shared/utils/commonUtils';
import {
    createDietaAction,
    deleteDietaAction,
    getDietasResidenciaData,
    setDefaultDietaAction,
    toggleDietaActivaAction,
    updateDietaAction,
} from './actions';

type DietaConId = DietaData & { id: DietaId };

function DietasResidenciaPage(): React.ReactElement | null {
    const params = useParams();
    const router = useRouter();
    const residenciaIdParams = params.residenciaId as ResidenciaId;
    const { toast } = useToast();
    const { usuarioId, roles, residenciaId: residenciaIdUsuario } = useInfoUsuario();
    const { t } = useTranslation('dietas');

    const [isAuthorized, setIsAuthorized] = useState<boolean>(false);
    const [residenciaNombre, setResidenciaNombre] = useState<string | null>(null);
    const [isLoadingResidencia, setIsLoadingResidencia] = useState<boolean>(true);
    const [dietas, setDietas] = useState<DietaConId[]>([]);
    const [isLoadingDietas, setIsLoadingDietas] = useState(true);
    const [errorDietas, setErrorDietas] = useState<string | null>(null);

    const [isAdding, setIsAdding] = useState(false);
    const [editingDietaId, setEditingDietaId] = useState<string | null>(null);
    const [formData, setFormData] = useState<any>({});
    const [isSaving, setIsSaving] = useState(false);

    const fetchResidenciaAndDietas = useCallback(async () => {
        if (!residenciaIdParams || !usuarioId) {
            setIsAuthorized(false);
            setIsLoadingResidencia(false);
            setIsLoadingDietas(false);
            return;
        }

        // Allow privileged roles and let the server-side verify assistant permissions.
        let authorized = false;
        if (roles.includes('master' as RolUsuario) || roles.includes('admin' as RolUsuario)) {
            authorized = true;
        } else if (roles.includes('director' as RolUsuario) && residenciaIdUsuario === residenciaIdParams) {
            authorized = true;
        } else if (roles.includes('asistente' as RolUsuario)) {
            // Don't block assistants on the client — the server will enforce time-bounded permissions.
            authorized = true;
        }

        setIsAuthorized(true);
        setIsLoadingResidencia(true);
        setIsLoadingDietas(true);
        setErrorDietas(null);

        try {
            const result = await getDietasResidenciaData(residenciaIdParams);

            if (!result.success || !result.data) {
                if (result.error?.code === 'UNAUTHORIZED') {
                    setIsAuthorized(false);
                    setErrorDietas(t('accesoDenegadoTitle'));
                } else {
                    setErrorDietas(result.error?.message || t('toastErrorLoadingDietas'));
                }

                setDietas([]);
                setResidenciaNombre(null);
                return;
            }

            setResidenciaNombre(result.data.residenciaNombre);
            setDietas(result.data.dietas);
        } catch (error) {
            console.error('Error fetching dietas:', error);
            setErrorDietas(t('toastErrorLoadingDietas'));
            setDietas([]);
            setResidenciaNombre(null);
        } finally {
            setIsLoadingResidencia(false);
            setIsLoadingDietas(false);
        }
    }, [residenciaIdParams, usuarioId, roles, residenciaIdUsuario, toast, t]);

    useEffect(() => {
        if (usuarioId && residenciaIdParams) {
            fetchResidenciaAndDietas();
        } else {
            setIsAuthorized(false);
            setIsLoadingResidencia(false);
            setIsLoadingDietas(false);
        }
    }, [usuarioId, residenciaIdParams, fetchResidenciaAndDietas]);

    useEffect(() => {
        if (!usuarioId || isLoadingResidencia || isAuthorized) {
            return;
        }
        router.replace('/acceso-no-autorizado');
    }, [isAuthorized, isLoadingResidencia, router, usuarioId]);

    const handleOpenAddDietaForm = () => {
        setIsAdding(true);
        setEditingDietaId(null);
        setFormData({});
    };

    const handleCancelDietaForm = () => {
        setIsAdding(false);
        setEditingDietaId(null);
        setFormData({});
    };

    const handleDietaFormChange = (field: keyof DietaData, value: any) => {
        setFormData((prev: any) => ({ ...prev, [field]: value }));
    };

    const handleAddDieta = async () => {
        if (!usuarioId) {
            toast({
                title: t('dietasPage.toastAccessDeniedTitle'),
                description: t('dietasPage.toastAccessDeniedDescription'),
                variant: 'destructive',
            });
            return;
        }

        if (!formData.nombre?.trim()) {
            toast({
                title: t('dietasPage.toastErrorNombreRequeridoTitle'),
                description: t('dietasPage.toastErrorNombreRequeridoDescription'),
                variant: 'destructive',
            });
            return;
        }

        if (!formData.identificadorAdministracion?.trim()) {
            toast({
                title: t('dietasPage.toastErrorNombreRequeridoTitle'),
                description: t('toastErrorIdentificadorAdministracionRequeridoDescription'),
                variant: 'destructive',
            });
            return;
        }

        const newDietaId = slugify(formData.nombre.trim(), 50);
        if (dietas.some((dieta) => dieta.id.toLowerCase() === newDietaId.toLowerCase())) {
            toast({
                title: t('dietasPage.toastErrorNombreRequeridoTitle'),
                description: t('dietasPage.toastErrorNombreExistenteDescription'),
                variant: 'destructive',
            });
            return;
        }

        setIsSaving(true);
        try {
            const result = await createDietaAction(residenciaIdParams, {
                nombre: formData.nombre,
                identificadorAdministracion: formData.identificadorAdministracion,
                descripcion: formData.descripcion,
                estaActiva: formData.estaActiva,
            });

            if (!result.success || !result.data) {
                toast({
                    title: t('dietasPage.toastErrorNombreRequeridoTitle'),
                    description: result.error?.message || t('dietasPage.toastErrorAnadirDietaDescription'),
                    variant: 'destructive',
                });
                return;
            }

            setDietas((prev) => [...prev, result.data!].sort((a, b) => a.nombre.localeCompare(b.nombre)));
            toast({
                title: t('toastExitoTitle'),
                description: t('toastDietaAnadidaDescription', { dietaNombre: result.data.nombre }),
            });
            handleCancelDietaForm();
        } catch (error) {
            console.error('Error adding dieta:', error);
            toast({
                title: t('dietasPage.toastErrorNombreRequeridoTitle'),
                description: t('dietasPage.toastErrorAnadirDietaDescription'),
                variant: 'destructive',
            });
        } finally {
            setIsSaving(false);
        }
    };

    const handleEditDieta = (dieta: DietaConId) => {
        const descripcion = dieta.descripcion?.tipo === 'texto_corto' ? dieta.descripcion.descripcion : '';
        setEditingDietaId(dieta.id);
        setIsAdding(false);
        setFormData({
            nombre: dieta.nombre,
            identificadorAdministracion: dieta.identificadorAdministracion,
            descripcion,
            estaActiva: dieta.estaActiva,
            esPredeterminada: dieta.esPredeterminada,
        });
    };

    const handleSaveDieta = async () => {
        if (!editingDietaId) {
            return;
        }

        setIsSaving(true);
        const originalDieta = dietas.find((dieta) => dieta.id === editingDietaId);
        if (!originalDieta) {
            toast({
                title: t('dietasPage.toastErrorNombreRequeridoTitle'),
                description: t('dietasPage.toastErrorDietaOriginalNoEncontrada'),
                variant: 'destructive',
            });
            setIsSaving(false);
            return;
        }

        if (formData.nombre && formData.nombre.trim() !== originalDieta.nombre) {
            toast({
                title: 'Informacion',
                description: 'No se puede cambiar el nombre de una dieta existente.',
                variant: 'default',
            });
        }

        if (!formData.identificadorAdministracion?.trim()) {
            toast({
                title: t('dietasPage.toastErrorNombreRequeridoTitle'),
                description: t('toastErrorIdentificadorAdministracionRequeridoDescription'),
                variant: 'destructive',
            });
            setIsSaving(false);
            return;
        }

        try {
            const result = await updateDietaAction(residenciaIdParams, editingDietaId, {
                nombre: formData.nombre,
                identificadorAdministracion: formData.identificadorAdministracion,
                descripcion: formData.descripcion,
                estaActiva: formData.estaActiva,
            });

            if (!result.success || !result.data) {
                toast({
                    title: t('dietasPage.toastErrorNombreRequeridoTitle'),
                    description: result.error?.message || t('dietasPage.toastErrorGuardarDietaDescription'),
                    variant: 'destructive',
                });
                return;
            }

            setDietas((prev) =>
                prev
                    .map((dieta) => (dieta.id === editingDietaId ? result.data! : dieta))
                    .sort((a, b) => a.nombre.localeCompare(b.nombre))
            );
            toast({
                title: t('toastExitoTitle'),
                description: t('toastDietaActualizadaDescription', { dietaNombre: result.data.nombre }),
            });
            handleCancelDietaForm();
        } catch (error) {
            console.error('Error saving dieta:', error);
            toast({
                title: t('dietasPage.toastErrorNombreRequeridoTitle'),
                description: t('dietasPage.toastErrorGuardarDietaDescription'),
                variant: 'destructive',
            });
        } finally {
            setIsSaving(false);
        }
    };

    const handleToggleActive = async (dietaToToggle: DietaConId) => {
        if (dietaToToggle.esPredeterminada && dietaToToggle.estaActiva) {
            toast({
                title: t('dietasPage.toastAccionNoPermitidaTitle'),
                description: t('dietasPage.toastErrorDesactivarDefaultDescription'),
                variant: 'destructive',
            });
            return;
        }

        setIsSaving(true);
        try {
            const result = await toggleDietaActivaAction(residenciaIdParams, dietaToToggle.id);

            if (!result.success || !result.data) {
                toast({
                    title: t('dietasPage.toastErrorNombreRequeridoTitle'),
                    description: result.error?.message || t('dietasPage.toastErrorCambiarEstadoDescription'),
                    variant: 'destructive',
                });
                return;
            }

            setDietas((prev) =>
                prev
                    .map((dieta) =>
                        dieta.id === result.data!.dietaId
                            ? { ...dieta, estaActiva: result.data!.estaActiva }
                            : dieta
                    )
                    .sort((a, b) => a.nombre.localeCompare(b.nombre))
            );

            const statusText = result.data.estaActiva ? t('toastDietaActivadaTitle') : t('toastDietaDesactivadaTitle');
            toast({
                title: statusText,
                description: t('toastDietaActivadaDesactivadaDescription', {
                    dietaNombre: dietaToToggle.nombre,
                    status: statusText.toLowerCase(),
                }),
            });
        } catch (error) {
            console.error('Error toggling dieta active status:', error);
            toast({
                title: t('dietasPage.toastErrorNombreRequeridoTitle'),
                description: t('dietasPage.toastErrorCambiarEstadoDescription'),
                variant: 'destructive',
            });
        } finally {
            setIsSaving(false);
        }
    };

    const handleSetDefault = async (dietaToSetDefault: DietaConId) => {
        if (dietaToSetDefault.esPredeterminada) {
            toast({
                title: t('dietasPage.toastInformacionTitle'),
                description: t('dietasPage.toastDietaYaDefaultDescription'),
            });
            return;
        }

        if (!dietaToSetDefault.estaActiva) {
            toast({
                title: t('dietasPage.toastErrorNombreRequeridoTitle'),
                description: t('dietasPage.toastErrorMarcarInactivaDefaultDescription'),
                variant: 'destructive',
            });
            return;
        }

        setIsSaving(true);
        try {
            const result = await setDefaultDietaAction(residenciaIdParams, dietaToSetDefault.id);
            if (!result.success || !result.data) {
                toast({
                    title: t('dietasPage.toastErrorNombreRequeridoTitle'),
                    description: result.error?.message || t('dietasPage.toastErrorMarcarDefaultDescription'),
                    variant: 'destructive',
                });
                return;
            }

            setDietas((prev) =>
                prev
                    .map((dieta) => ({
                        ...dieta,
                        esPredeterminada: dieta.id === dietaToSetDefault.id,
                    }))
                    .sort((a, b) => a.nombre.localeCompare(b.nombre))
            );
            toast({
                title: t('toastExitoTitle'),
                description: t('toastDietaMarcadaDefaultDescription', { dietaNombre: dietaToSetDefault.nombre }),
            });
        } catch (error) {
            console.error('Error setting default dieta:', error);
            toast({
                title: t('dietasPage.toastErrorNombreRequeridoTitle'),
                description: t('dietasPage.toastErrorMarcarDefaultDescription'),
                variant: 'destructive',
            });
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteDieta = async (dietaToDelete: DietaConId) => {
        if (dietaToDelete.esPredeterminada) {
            toast({
                title: t('dietasPage.toastAccionNoPermitidaTitle'),
                description: t('dietasPage.toastErrorEliminarDefaultDescription'),
                variant: 'destructive',
            });
            return;
        }

        if (dietas.length <= 1) {
            toast({
                title: t('dietasPage.toastAccionNoPermitidaTitle'),
                description: t(
                    'dietasPage.toastErrorEliminarUltimaDietaDescription',
                    'No se puede eliminar la ultima dieta. Una residencia debe tener al menos una dieta.'
                ),
                variant: 'destructive',
            });
            return;
        }

        setIsSaving(true);
        try {
            const result = await deleteDietaAction(residenciaIdParams, dietaToDelete.id);
            if (!result.success || !result.data) {
                toast({
                    title: t('dietasPage.toastErrorNombreRequeridoTitle'),
                    description: result.error?.message || t('dietasPage.toastErrorEliminarDietaDescription'),
                    variant: 'destructive',
                });
                return;
            }

            setDietas((prev) => prev.filter((dieta) => dieta.id !== result.data!.dietaId));
            toast({
                title: t('toastExitoTitle'),
                description: t('toastDietaEliminadaDescription', { dietaNombre: dietaToDelete.nombre }),
            });
        } catch (error) {
            console.error('Error deleting dieta:', error);
            toast({
                title: t('dietasPage.toastErrorNombreRequeridoTitle'),
                description: t('dietasPage.toastErrorEliminarDietaDescription'),
                variant: 'destructive',
            });
        } finally {
            setIsSaving(false);
        }
    };

    if (!usuarioId || isLoadingResidencia) {
        let loadingMessage = t('loadingPreparando');
        if (!usuarioId) {
            loadingMessage = t('loadingVerificandoSesion');
        } else if (isLoadingResidencia) {
            loadingMessage = t('loadingCargandoDatosResidencia');
        }

        return (
            <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
                <Loader2 className="mb-4 h-10 w-10 animate-spin text-primary" />
                <p className="text-lg font-medium text-muted-foreground">{loadingMessage}</p>
            </div>
        );
    }

    if (usuarioId && !isLoadingResidencia && !isAuthorized) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
                <Loader2 className="mb-4 h-10 w-10 animate-spin text-primary" />
                <p className="text-lg font-medium text-muted-foreground">Redireccionando...</p>
            </div>
        );
    }

    const currentResidenciaNombre = residenciaNombre || `${t('residenciaNameLoading')} (${residenciaIdParams})`;

    if (errorDietas && errorDietas !== t('accesoDenegadoTitle')) {
        return (
            <div className="container mx-auto p-4">
                <h1 className="mb-4 text-2xl font-bold">
                    {t('title')} {currentResidenciaNombre}
                </h1>
                <Card>
                    <CardHeader>
                        <CardTitle className="text-destructive">{t('errorCargarDietasTitle')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-destructive">{errorDietas}</p>
                        <Button onClick={fetchResidenciaAndDietas} className="mt-4">
                            {t('errorReintentarButton')}
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    const formTitleText = isAdding
        ? t('formAddTitle')
        : t('formEditTitle', { dietaNombre: dietas.find((dieta) => dieta.id === editingDietaId)?.nombre || '' });

    return (
        <div className="container mx-auto space-y-6 p-4">
            <h1 className="text-3xl font-bold tracking-tight">
                {t('title')} <span className="text-primary">{currentResidenciaNombre}</span>
            </h1>

            <Card>
                <CardHeader>
                    <CardTitle>{t('cardTitle')}</CardTitle>
                    <CardDescription>
                        {t('cardDescription', { residenciaNombre: residenciaNombre || t('cardDescriptionFallback') })}
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
                        <div className="py-8 text-center">
                            <p className="mb-4 text-muted-foreground">{t('noDietasDefined')}</p>
                            <Button onClick={handleOpenAddDietaForm} disabled={isAdding || !!editingDietaId || isSaving}>
                                {t('addFirstDietaButton')}
                            </Button>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {dietas.map((dieta) => (
                                <div
                                    key={dieta.id}
                                    className={`flex flex-col items-start justify-between gap-3 rounded-lg border p-3 md:flex-row md:items-center ${
                                        !dieta.estaActiva
                                            ? 'bg-slate-100 opacity-70 dark:bg-slate-800/50'
                                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/30'
                                    }`}
                                >
                                    <div className="flex-grow">
                                        <span className="text-lg font-semibold">{dieta.nombre}</span>
                                        {dieta.esPredeterminada && (
                                            <Badge variant="default" className="ml-2 bg-green-600 text-white hover:bg-green-700">
                                                {t('defaultBadge')}
                                            </Badge>
                                        )}
                                        {!dieta.estaActiva && (
                                            <Badge variant="outline" className="ml-2 border-red-500 text-red-600">
                                                {t('inactiveBadge')}
                                            </Badge>
                                        )}
                                        {dieta.descripcion && (
                                            <p className="mt-1 text-sm text-muted-foreground">
                                                {dieta.descripcion.tipo === 'texto_corto'
                                                    ? dieta.descripcion.descripcion
                                                    : dieta.descripcion.tipo === 'texto_enriquecido'
                                                        ? dieta.descripcion.titulo
                                                        : dieta.descripcion.tipo === 'enlace_externo'
                                                            ? dieta.descripcion.urlDocumento
                                                            : ''}
                                            </p>
                                        )}
                                    </div>
                                    <div className="mt-2 flex-shrink-0 space-x-2 md:mt-0">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handleEditDieta(dieta)}
                                            disabled={isAdding || !!editingDietaId || isSaving}
                                        >
                                            {t('editButton')}
                                        </Button>
                                        <Button
                                            variant={dieta.estaActiva ? 'ghost' : 'secondary'}
                                            size="sm"
                                            onClick={() => handleToggleActive(dieta)}
                                            disabled={isAdding || !!editingDietaId || isSaving || (dieta.estaActiva && dieta.esPredeterminada)}
                                            className={
                                                dieta.estaActiva && dieta.esPredeterminada
                                                    ? 'text-muted-foreground hover:text-destructive'
                                                    : dieta.estaActiva
                                                        ? 'hover:text-destructive'
                                                        : ''
                                            }
                                        >
                                            {dieta.estaActiva ? t('deactivateButton') : t('activateButton')}
                                        </Button>
                                        {!dieta.esPredeterminada && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleSetDefault(dieta)}
                                                disabled={isAdding || !!editingDietaId || isSaving || !dieta.estaActiva}
                                            >
                                                {t('setDefaultButton')}
                                            </Button>
                                        )}
                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button
                                                    variant="destructive"
                                                    size="sm"
                                                    disabled={isAdding || !!editingDietaId || isSaving || dieta.esPredeterminada}
                                                >
                                                    {t('deleteButton')}
                                                </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>{t('deleteDialogTitle')}</AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        {t('deleteDialogDescription', { dietaNombre: dieta.nombre })}
                                                        {dieta.esPredeterminada ? (
                                                            <span className="mt-2 block font-semibold text-destructive">
                                                                {t('deleteDialogWarningDefault')}
                                                            </span>
                                                        ) : (
                                                            ''
                                                        )}
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>{t('deleteDialogCancel')}</AlertDialogCancel>
                                                    <AlertDialogAction
                                                        onClick={() => handleDeleteDieta(dieta)}
                                                        className={buttonVariants({ variant: 'destructive' })}
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

                    {!isAdding && !editingDietaId && dietas.length > 0 && (
                        <div className="mt-6 border-t pt-6">
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
                            formTitle={formTitleText}
                            submitButtonText={isAdding ? t('formSubmitAdd') : t('formSubmitSave')}
                            t={t}
                        />
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

interface DietaFormProps {
    formData: any;
    onFormChange: (field: keyof DietaData, value: any) => void;
    onSubmit: () => Promise<void>;
    onCancel: () => void;
    isSaving: boolean;
    formTitle: string;
    submitButtonText: string;
    t: (key: string, options?: any) => string;
}

function DietaForm({
    formData,
    onFormChange,
    onSubmit,
    onCancel,
    isSaving,
    formTitle,
    submitButtonText,
    t,
}: DietaFormProps) {
    const isEditing = !formTitle.includes(t('formAddTitle'));

    return (
        <div className="mt-6 space-y-6 border-t pt-6">
            <h3 className="text-xl font-semibold">{formTitle}</h3>
            <div>
                <Label htmlFor="dieta-nombre" className="text-base">
                    {t('formNombreLabel')}
                </Label>
                <Input
                    id="dieta-nombre"
                    value={formData.nombre || ''}
                    onChange={(e) => onFormChange('nombre', e.target.value)}
                    placeholder={t('formNombrePlaceholder')}
                    disabled={isSaving || isEditing}
                    maxLength={50}
                    className="mt-1 text-base"
                />
                <p className="mt-1 text-sm text-muted-foreground">{t('formNombreDescription')}</p>
            </div>

            <div>
                <Label htmlFor="dieta-descripcion" className="text-base">
                    {t('formDescripcionLabel')}
                </Label>
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
                <p className="mt-1 text-sm text-muted-foreground">{t('formDescripcionDescription')}</p>
            </div>

            <div>
                <Label htmlFor="dieta-identificador-administracion" className="text-base">
                    {t('formIdentificadorAdministracionLabel')}
                </Label>
                <Input
                    id="dieta-identificador-administracion"
                    value={formData.identificadorAdministracion || ''}
                    onChange={(e) => onFormChange('identificadorAdministracion', e.target.value)}
                    placeholder={t('formIdentificadorAdministracionPlaceholder')}
                    disabled={isSaving}
                    maxLength={100}
                    className="mt-1 text-base"
                />
                <p className="mt-1 text-sm text-muted-foreground">{t('formIdentificadorAdministracionDescription')}</p>
            </div>

            {isEditing && (
                <div className="flex items-center space-x-2 pt-2">
                    <Checkbox
                        id="dieta-isActive"
                        checked={formData.estaActiva === undefined ? true : formData.estaActiva}
                        onCheckedChange={(checked) => onFormChange('estaActiva', !!checked)}
                        disabled={isSaving || formData.esPredeterminada}
                    />
                    <Label htmlFor="dieta-isActive" className="text-base">
                        {t('formIsActiveLabel')}
                    </Label>
                    {formData.esPredeterminada && (
                        <p className="ml-2 text-xs text-amber-600">{t('formIsActiveWarningDefault')}</p>
                    )}
                </div>
            )}

            <div className="flex space-x-3 pt-3">
                <Button onClick={onSubmit} disabled={isSaving} size="lg">
                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
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