'use client';

// UI Components
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
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
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/useToast";
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';

// --- React & Next Imports ---
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, AlertCircle } from 'lucide-react';

// --- Firebase & New Auth Hook Imports ---
import { getFunctions, httpsCallable } from "firebase/functions";
import { doc, getDoc, getDocs, collection, query, where } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import { format } from 'date-fns'

// Model Imports from the new 'shared' directory structure
import {
    Usuario,
    RolUsuario,
    Residencia,
    ResidenciaId,
    DietaId,
    DietaData,
    CentroDeCostoData,
    ConfiguracionResidencia, // Main configuration object
    CentroDeCostoId
} from '../../../../shared/models/types';

// Zod Schemas import from the new 'shared' directory structure
import {
    clientCreateUserFormSchema,
    clientUpdateUserFormSchema,
    type ClientCreateUserForm,
    type ClientUpdateUserForm,
    type AsistentePermisos,
    type AsistentePermisosDetalle,
    type ResidenteData,
} from '../../../../shared/schemas/usuarios';

const defaultPermisoDetalle: AsistentePermisosDetalle = {
    nivelAcceso: 'Ninguna',
    restriccionTiempo: false,
    fechaInicio: null,
    fechaFin: null,
};

const defaultAsistentePermisos: AsistentePermisos = {
    usuariosAsistidos: {},
    gestionActividades: { ...defaultPermisoDetalle },
    gestionInvitados: { ...defaultPermisoDetalle },
    gestionRecordatorios: { ...defaultPermisoDetalle },
    gestionDietas: { ...defaultPermisoDetalle },
    gestionAtenciones: { ...defaultPermisoDetalle },
    gestionAsistentes: { ...defaultPermisoDetalle },
    gestionGrupos: { ...defaultPermisoDetalle },
    solicitarComensales: { ...defaultPermisoDetalle },
};

const defaultResidenteData: ResidenteData = {
    dietaId: '',
    numeroDeRopa: '',
    habitacion: '',
    avisoAdministracion: 'no_comunicado'
};

// The form data type should be a union of create and update schemas to be flexible
type UserFormData = Partial<ClientCreateUserForm & ClientUpdateUserForm>;

function UserManagementPage(): JSX.Element | null {
    const ALL_RESIDENCIAS_FILTER_KEY = 'all_residencias';
    const NO_RESIDENCIA_FILTER_KEY = 'no_residencia_assigned';

    const functionsInstance = getFunctions(auth.app);

    const createUserCallable = httpsCallable(functionsInstance, 'createUser');
    const updateUserCallable = httpsCallable(functionsInstance, 'updateUser');
    const deleteUserCallable = httpsCallable(functionsInstance, 'deleteUser');

    const router = useRouter();
    const { toast } = useToast();

    const { user: authUser, loading: authFirebaseLoading, error: authFirebaseError } = useAuth();
    const [adminUserProfile, setAdminUserProfile] = useState<Usuario | null>(null);
    const [adminProfileLoading, setAdminProfileLoading] = useState<boolean>(true);
    const [adminProfileError, setAdminProfileError] = useState<string | null>(null);
    const [isAuthorized, setIsAuthorized] = useState<boolean>(false);

    const [hasAttemptedFetch, setHasAttemptedFetch] = useState<{ [key: string]: boolean }>({});
    
    // State for configuration and details
    const [currentResidenciaDetails, setCurrentResidenciaDetails] = useState<Residencia | null>(null);
    const [configuracionResidencia, setConfiguracionResidencia] = useState<ConfiguracionResidencia | null>(null);
    const [isLoadingResidenciaData, setIsLoadingResidenciaData] = useState<boolean>(false);
    
    const [residentesForAsistente, setResidentesForAsistente] = useState<Usuario[]>([]);
    const [isLoadingResidentesForAsistente, setIsLoadingResidentesForAsistente] = useState<boolean>(false);

    const [formData, setFormData] = useState<UserFormData>({
        nombre: '',
        apellido: '',
        nombreCorto: '',
        email: '',
        estaActivo: true,
        roles: [],
        residenciaId: '',
        password: '',
        confirmPassword: '',
        telefonoMovil: '',
        fechaDeNacimiento: '',
        centroCostoPorDefectoId: '',
        puedeTraerInvitados: 'no',
        camposPersonalizados: {},
        grupos: [],
        tieneAutenticacion: true,
    });
    
    const [isSaving, setIsSaving] = useState(false);
    const [users, setUsers] = useState<Usuario[]>([]);
    const [isLoadingUsers, setIsLoadingUsers] = useState(true);
    const [editingUserId, setEditingUserId] = useState<string | null>(null);
    const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
    const [userToDeleteId, setUserToDeleteId] = useState<string | null>(null);
    const [selectedResidenciaFilter, setSelectedResidenciaFilter] = useState<string>(ALL_RESIDENCIAS_FILTER_KEY);

    const availableRoles: RolUsuario[] = ['residente', 'director', 'admin', 'master', 'invitado', 'asistente', 'contador'];
    const [residences, setResidences] = useState<Record<ResidenciaId, { nombre: string }>>({});

    const dietas = useMemo((): (DietaData & {id: DietaId})[] => {
        if (!configuracionResidencia?.dietas) return [];
        return Object.entries(configuracionResidencia.dietas).map(([id, data]) => ({ id, ...data }));
    }, [configuracionResidencia]);
    
    const centrosCostoList = useMemo((): (CentroDeCostoData & {id: CentroDeCostoId})[] => {
        // This needs to be adjusted based on the final schema for ConfigContabilidad
        return []; 
    }, []);


    const filteredUsers = useMemo(() => {
        if (!adminUserProfile) return [];
        let usersToDisplay = [...users];
        if (adminUserProfile.roles.includes('master')) {
            if (selectedResidenciaFilter === ALL_RESIDENCIAS_FILTER_KEY) {
            } else if (selectedResidenciaFilter === NO_RESIDENCIA_FILTER_KEY) {
                usersToDisplay = usersToDisplay.filter(user => !user.residenciaId);
            } else {
                usersToDisplay = usersToDisplay.filter(user => user.residenciaId === selectedResidenciaFilter);
            }
        } else if (adminUserProfile.roles.includes('admin') && adminUserProfile.residenciaId) {
            usersToDisplay = usersToDisplay.filter(user => user.residenciaId === adminUserProfile.residenciaId);
        } else {
            usersToDisplay = usersToDisplay.filter(user => !user.residenciaId);
        }
        return usersToDisplay.sort((a, b) => (a.apellido + a.nombre).localeCompare(b.apellido + b.nombre));
    }, [users, selectedResidenciaFilter, adminUserProfile]);

    const fetchResidences = useCallback(async (profile: Usuario | null) => {
        if (!profile || hasAttemptedFetch['residencias']) return;
        setHasAttemptedFetch(prev => ({...prev, residencias: true}));

        const isMaster = profile.roles.includes('master');
        const adminResidenciaId = profile.residenciaId;

        try {
            const residencesData: Record<ResidenciaId, { nombre: string }> = {};
            if (isMaster) {
                const residencesCol = collection(db, "residencias");
                const querySnapshot = await getDocs(residencesCol);
                querySnapshot.forEach((doc) => {
                    residencesData[doc.id] = { nombre: doc.data().nombre };
                });
            } else if (adminResidenciaId) {
                const residenciaDocRef = doc(db, "residencias", adminResidenciaId);
                const docSnap = await getDoc(residenciaDocRef);
                if (docSnap.exists()) {
                    residencesData[docSnap.id] = { nombre: docSnap.data().nombre };
                } else {
                     throw new Error("La residencia asignada no fue encontrada.");
                }
            }
            setResidences(residencesData);
        } catch (error) {
            console.error("Error fetching residences:", error);
            toast({
                title: "Error al Cargar Residencias",
                description: "No se pudieron obtener los datos de las residencias.",
                variant: "destructive",
            });
        }
    }, [toast, hasAttemptedFetch]);
    
    const fetchResidenciaData = useCallback(async (residenciaId: ResidenciaId) => {
        if (!residenciaId) {
            setCurrentResidenciaDetails(null);
            setConfiguracionResidencia(null);
            return;
        }
        setIsLoadingResidenciaData(true);
        try {
            const residenciaDocRef = doc(db, "residencias", residenciaId);
            const configDocRef = doc(db, `residencias/${residenciaId}/configuracion/general`);
            
            const [residenciaSnap, configSnap] = await Promise.all([
                getDoc(residenciaDocRef),
                getDoc(configDocRef)
            ]);

            if (residenciaSnap.exists()) {
                setCurrentResidenciaDetails({ id: residenciaSnap.id, ...residenciaSnap.data() } as Residencia);
            } else {
                setCurrentResidenciaDetails(null);
                toast({ title: "Error", description: `No se encontraron detalles para la residencia ID: ${residenciaId}.`, variant: "destructive" });
            }

            if (configSnap.exists()) {
                setConfiguracionResidencia(configSnap.data() as ConfiguracionResidencia);
            } else {
                setConfiguracionResidencia(null);
                 toast({ title: "Atención", description: `No se encontró configuración para la residencia ID: ${residenciaId}. Algunas opciones no estarán disponibles.`, variant: "default" });
            }

        } catch (error) {
            console.error(`Error fetching residencia data for ${residenciaId}:`, error);
            setCurrentResidenciaDetails(null);
            setConfiguracionResidencia(null);
            toast({ title: "Error al Cargar Datos de Residencia", description: (error as Error).message, variant: "destructive" });
        } finally {
            setIsLoadingResidenciaData(false);
        }
    }, [toast]);


    const fetchResidentesForResidencia = useCallback(async (residenciaId?: ResidenciaId) => {
        if (!residenciaId) {
            setResidentesForAsistente([]);
            return;
        }
        setIsLoadingResidentesForAsistente(true);
        try {
            const usersCol = collection(db, "usuarios");
            const q = query(usersCol, where("residenciaId", "==", residenciaId), where("roles", "array-contains", "residente"), where("estaActivo", "==", true));
            const querySnapshot = await getDocs(q);
            const fetchedResidentes: Usuario[] = [];
            querySnapshot.forEach((doc) => {
                if (editingUserId !== doc.id && formData.email !== doc.data().email) {
                    fetchedResidentes.push({ id: doc.id, ...doc.data() } as Usuario);
                }
            });
            setResidentesForAsistente(fetchedResidentes.sort((a, b) => (a.apellido + a.nombre).localeCompare(b.apellido + b.nombre)));
        } catch (error) {
            console.error("Error fetching residentes for asistente:", error);
            toast({ title: "Error", description: "No se pudieron cargar los residentes para la asignación de asistente.", variant: "destructive" });
            setResidentesForAsistente([]);
        } finally {
            setIsLoadingResidentesForAsistente(false);
        }
    }, [toast, editingUserId, formData.email]);

    const fetchUsersToManage = useCallback(async (profile: Usuario | null) => {
        if (!profile || hasAttemptedFetch['users']) return;
        setHasAttemptedFetch(prev => ({...prev, users: true}));
        setIsLoadingUsers(true);

        const isMaster = profile.roles.includes('master');
        const adminResidenciaId = profile.residenciaId;

        try {
            const usersCol = collection(db, "usuarios");
            let q;

            if (isMaster) {
                q = query(usersCol);
            } else if (adminResidenciaId) {
                q = query(usersCol, where("residenciaId", "==", adminResidenciaId));
            } else {
                 setUsers([]);
                 setIsLoadingUsers(false);
                 return;
            }

            const querySnapshot = await getDocs(q);
            const usersData: Usuario[] = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Usuario));
            setUsers(usersData.sort((a, b) => (a.apellido + a.nombre).localeCompare(b.apellido + b.nombre))); 
        } catch (error) {
            console.error("Error fetching users to manage:", error);
            toast({ title: "Error al Cargar Usuarios", description: "No se pudieron obtener los datos de los usuarios.", variant: "destructive" });
            setUsers([]);
        } finally { 
            setIsLoadingUsers(false);
        }
    }, [toast, hasAttemptedFetch]); 

    useEffect(() => {
        if (authFirebaseLoading) {
            setAdminProfileLoading(true);
            setIsAuthorized(false);
            return;
        }

        if (authFirebaseError || !authUser) {
            toast({ title: "Error de Autenticación", description: authFirebaseError?.message || 'No estás autenticado.', variant: "destructive" });
            router.replace('/');
            return;
        }
        
        setAdminProfileLoading(true);
        const adminDocRef = doc(db, "usuarios", authUser.uid);
        getDoc(adminDocRef).then((docSnap) => {
            if (docSnap.exists()) {
                const fetchedProfile = { id: docSnap.id, ...docSnap.data() } as Usuario;
                setAdminUserProfile(fetchedProfile);

                if (fetchedProfile.residenciaId && !fetchedProfile.roles.includes('master')) {
                    setFormData((prev: UserFormData) => ({ ...prev, residenciaId: fetchedProfile.residenciaId! }));
                }
            } else {
                throw new Error("Perfil de administrador no encontrado. No estás autorizado.");
            }
        }).catch((error) => {
            setAdminProfileError(`Error al cargar tu perfil: ${error.message}`);
            toast({ title: "Error Cargando Perfil", description: error.message, variant: "destructive" });
        }).finally(() => {
            setAdminProfileLoading(false);
        });
    }, [authUser, authFirebaseLoading, authFirebaseError, router, toast]);

    useEffect(() => {
        if (adminProfileLoading) return;

        if (adminProfileError || !adminUserProfile) {
            setIsAuthorized(false);
            return;
        }

        const isAdminAuthorized = adminUserProfile.roles.includes('admin') || adminUserProfile.roles.includes('master');
        setIsAuthorized(isAdminAuthorized);

        if (isAdminAuthorized) {
            let initialResFilter = NO_RESIDENCIA_FILTER_KEY;
            if (adminUserProfile.roles.includes('master')) {
                initialResFilter = ALL_RESIDENCIAS_FILTER_KEY;
            } else if (adminUserProfile.residenciaId) {
                initialResFilter = adminUserProfile.residenciaId;
                fetchResidenciaData(adminUserProfile.residenciaId);
            }
            setSelectedResidenciaFilter(initialResFilter);
            fetchResidences(adminUserProfile);
            fetchUsersToManage(adminUserProfile);
        } else {
            toast({ title: "Acceso Denegado", description: "No tienes los permisos (admin/master) para acceder a esta página.", variant: "destructive" });
        }
    }, [adminUserProfile, adminProfileLoading, adminProfileError, fetchResidences, fetchUsersToManage, fetchResidenciaData, toast]);

    useEffect(() => {
        if (formData.residenciaId && formData.residenciaId !== currentResidenciaDetails?.id) {
            fetchResidenciaData(formData.residenciaId);
        } else if (!formData.residenciaId) {
            setCurrentResidenciaDetails(null);
            setConfiguracionResidencia(null);
            setResidentesForAsistente([]);
        }
    }, [formData.residenciaId, fetchResidenciaData, currentResidenciaDetails?.id]);

    const handleFormChange = (fieldPath: string, value: any) => {
        setFormData((prev: UserFormData) => {
            const keys = fieldPath.split('.');
            if (keys.length === 1) {
                return { ...prev, [fieldPath]: value };
            }
            
            const newState = { ...prev };
            let currentLevel: any = newState;
            
            for (let i = 0; i < keys.length - 1; i++) {
                const key = keys[i];
                if (currentLevel[key] === null || typeof currentLevel[key] === 'undefined') {
                    currentLevel[key] = {};
                }
                currentLevel = currentLevel[key];
            }
            
            currentLevel[keys[keys.length - 1]] = value;
            return newState;
        });
    };

    const handleRoleChange = (role: RolUsuario, checked: boolean) => {
        setFormData((prev: UserFormData) => {
            const currentRoles = prev.roles || [];
            const updatedRoles = checked ? [...new Set([...currentRoles, role])] : currentRoles.filter((r: RolUsuario) => r !== role);

            let newFormData: UserFormData = { ...prev, roles: updatedRoles };

            if (role === 'residente') {
                if (checked) {
                    newFormData.residente = { ...(prev.residente || defaultResidenteData) };
                    const defaultDieta = dietas.find(d => d.estaActiva && d.esPredeterminada);
                    if (defaultDieta) {
                        newFormData.residente.dietaId = defaultDieta.id;
                    } else if (dietas.length > 0) {
                        toast({ title: "Atención", description: "No se encontró una dieta por defecto para la residencia. Por favor, seleccione una manualmente." });
                    }
                } else {
                    delete newFormData.residente;
                }
            }
            
            if (role === 'asistente') {
                if (checked) {
                    newFormData.asistente = { ...(prev.asistente || defaultAsistentePermisos) };
                } else {
                    delete newFormData.asistente;
                }
            }

            const residenciaRequired = updatedRoles.some((r: RolUsuario) => !['master', 'invitado'].includes(r));
            if (!residenciaRequired) {
                newFormData.residenciaId = '';
                delete newFormData.residente;
            } else if (!adminUserProfile?.roles.includes('master') && adminUserProfile?.residenciaId) {
                newFormData.residenciaId = adminUserProfile.residenciaId;
            }

            return newFormData;
        });
    };

    const handleSelectChange = (field: 'residenciaId' | 'puedeTraerInvitados' | 'centroCostoPorDefectoId' | 'residente.dietaId', value: string) => {
        handleFormChange(field, value);

        if (field === 'residenciaId') {
            handleFormChange('residente.dietaId', '');
            handleFormChange('centroCostoPorDefectoId', '');
            handleFormChange('camposPersonalizados', {});
        }
    };
    
    useEffect(() => {
        if (formData.roles?.includes('residente') && !formData.residente?.dietaId && dietas.length > 0) {
            const defaultDieta = dietas.find(d => d.estaActiva && d.esPredeterminada);
            if (defaultDieta) {
                handleFormChange('residente.dietaId', defaultDieta.id);
            } else {
                 toast({ title: "Atención", description: `No se encontró una dieta por defecto (y activa) para la residencia. Por favor, seleccione una manualmente si es necesaria.`});
            }
        }
    }, [dietas, formData.roles, formData.residente?.dietaId]);

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setIsSaving(true);
        
        try {
            const schema = editingUserId ? clientUpdateUserFormSchema : clientCreateUserFormSchema;
            let dataForValidation: UserFormData = { ...formData };

            if (dataForValidation.residenciaId === '') dataForValidation.residenciaId = undefined;
            if (dataForValidation.centroCostoPorDefectoId === '') dataForValidation.centroCostoPorDefectoId = undefined;
            if (!dataForValidation.roles?.includes('residente')) delete dataForValidation.residente;
            if (!dataForValidation.roles?.includes('asistente')) delete dataForValidation.asistente;
            if (dataForValidation.residente?.dietaId === '') delete (dataForValidation.residente as any).dietaId;

            const validationResult = schema.safeParse(dataForValidation);

            if (!validationResult.success) {
                const errors = validationResult.error.flatten();
                const errorMessages = Object.entries(errors.fieldErrors).map(([field, msgs]) => `${field}: ${(msgs as string[]).join(', ')}`);
                toast({
                    title: `Error de Validación (${errorMessages.length})`,
                    description: errorMessages.join('\n'),
                    variant: "destructive"
                });
                setIsSaving(false);
                return;
            }

            const validatedData = validationResult.data;
            const callable = editingUserId ? updateUserCallable : createUserCallable;
            
            const payload: any = {
                profileData: validatedData,
                performedByUid: adminUserProfile?.id,
            };

            if (editingUserId) {
                payload.userIdToUpdate = editingUserId;
            } else {
                payload.password = (validatedData as ClientCreateUserForm).password;
            }
            
            const result = await callable(payload);
            const resultData = result.data as { success: boolean; userId?: string; message?: string };

            if (resultData.success) {
                toast({ title: `Usuario ${editingUserId ? 'Actualizado' : 'Creado'}`, description: `Usuario ${validatedData.nombre} ${validatedData.apellido} ${editingUserId ? 'actualizado' : 'creado'}.` });
                await fetchUsersToManage(adminUserProfile);
                handleCancelEdit();
            } else {
                throw new Error(resultData.message || 'La operación falló en el servidor.');
            }

        } catch (error: any) {
            toast({ title: "Error en la Operación", description: error.message, variant: "destructive" });
        } finally {
            setIsSaving(false);
        }
    };
    
    const handleEditUser = (userId: string) => {
        const userToEdit = users.find(u => u.id === userId);
        if (!userToEdit) {
            toast({ title: "Error", description: "No se encontró el usuario para editar.", variant: "destructive" });
            return;
        }
        setEditingUserId(userId);
    
        setFormData({
            nombre: userToEdit.nombre || '',
            apellido: userToEdit.apellido || '',
            nombreCorto: userToEdit.nombreCorto || '',
            email: userToEdit.email || '',
            estaActivo: userToEdit.estaActivo,
            roles: userToEdit.roles || [],
            residenciaId: userToEdit.residenciaId || '',
            telefonoMovil: userToEdit.telefonoMovil || '',
            fechaDeNacimiento: userToEdit.fechaDeNacimiento ? format(userToEdit.fechaDeNacimiento, 'yyyy-MM-dd') : '',
            centroCostoPorDefectoId: userToEdit.centroCostoPorDefectoId || '',
            puedeTraerInvitados: userToEdit.puedeTraerInvitados || 'no',
            camposPersonalizados: userToEdit.camposPersonalizados || {},
            asistente: userToEdit.asistente,
            residente: userToEdit.residente,
            grupos: userToEdit.grupos || [],
            tieneAutenticacion: true,
            notificacionPreferencias: userToEdit.notificacionPreferencias,
        });
    };

    const handleCancelEdit = () => {
        setEditingUserId(null);
        setFormData({
            nombre: '',
            apellido: '',
            nombreCorto: '',
            email: '',
            estaActivo: true,
            roles: [],
            residenciaId: adminUserProfile?.roles.includes('master') ? '' : adminUserProfile?.residenciaId || '',
            password: '',
            confirmPassword: '',
            telefonoMovil: '',
            fechaDeNacimiento: '',
            centroCostoPorDefectoId: '',
            puedeTraerInvitados: 'no',
            camposPersonalizados: {},
            grupos: [],
            tieneAutenticacion: true,
        });
    };

    const handleDeleteUser = (userId: string) => {
        setUserToDeleteId(userId);
        setIsConfirmingDelete(true);
    };

    const confirmDeleteUser = async () => {
        if (!userToDeleteId) return;
        const userToDeleteInfo = users.find(u => u.id === userToDeleteId);
        try {
            const result = await deleteUserCallable({ userId: userToDeleteId, performedByUid: adminUserProfile?.id });
            const resultData = result.data as { success: boolean; message?: string };

            if (resultData.success) {
                setUsers(prevUsers => prevUsers.filter(user => user.id !== userToDeleteId));
                toast({ title: "Usuario Eliminado", description: `El usuario ${userToDeleteInfo?.nombre || userToDeleteId} ha sido eliminado.` });
            } else {
                throw new Error(resultData.message || 'La función de eliminación de usuario falló.');
            }
        } catch (error: any) {
            toast({ title: "Error al Eliminar", description: error.message, variant: "destructive" });
        } finally {
            setIsConfirmingDelete(false);
            setUserToDeleteId(null);
        }
    };
    
    const getResidenciaName = (id?: ResidenciaId): string => {
        if (!id) return 'N/A';
        return residences[id]?.nombre || 'Desconocida';
    };

    const getDietaName = (id?: DietaId): string => {
        if (!id) return 'N/A';
        const dieta = dietas.find(d => d.id === id);
        return dieta?.nombre || 'Desconocida';
    };

    const getUserToDeleteName = (): string => {
        const user = users.find(u => u.id === userToDeleteId);
        return user ? `${user.nombre} ${user.apellido}`.trim() : 'este usuario';
    };

    const formatSingleRoleName = (role: RolUsuario): string => {
        const roleMap: Record<RolUsuario, string> = {
            'residente': 'Residente', 'director': 'Director', 'admin': 'Admin', 'master': 'Master',
            'invitado': 'Invitado', 'asistente': 'Asistente', 'contador': 'Contador'
        };
        return roleMap[role] || role;
    };

    const isResidenciaRequired = formData.roles?.some((r: RolUsuario) => !['master', 'invitado'].includes(r));
    const isResidente = formData.roles?.includes('residente');

    if (authFirebaseLoading || (authUser && adminProfileLoading)) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
                <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
                <p className="text-lg font-medium text-muted-foreground">
                    {authFirebaseLoading ? 'Verificando sesión...' : "Cargando perfil de administrador..."}
                </p>
            </div>
        );
    }

    if (authFirebaseError || adminProfileError) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
                <AlertCircle className="h-12 w-12 text-destructive mb-4" />
                <h1 className="text-2xl font-bold text-destructive mb-2">Error Crítico</h1>
                <p className="mb-4 text-destructive max-w-md">
                    {authFirebaseError?.message || adminProfileError || 'Ocurrió un error al cargar la información de autenticación o tu perfil.'}
                </p>
                <Button onClick={() => router.replace('/')}>Volver al Inicio</Button>
            </div>
        );
    }

    if (!isAuthorized) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
                <AlertCircle className="h-12 w-12 text-destructive mb-4" />
                <h1 className="text-2xl font-bold text-destructive mb-2">Acceso Denegado</h1>
                <p className="mb-4 text-muted-foreground max-w-md">
                    No tienes los permisos necesarios (administrador o master) para acceder a esta página.
                </p>
                <Button onClick={() => router.replace('/')}>Volver al Inicio</Button>
            </div>
        );
    }

    return (
        <div className="container mx-auto p-4 space-y-6">
            <h1 className="text-3xl font-bold tracking-tight">Gestión de Usuarios</h1>

            <Card>
                <CardHeader>
                    <CardTitle>{editingUserId ? 'Editar Usuario' : 'Crear Nuevo Usuario'}</CardTitle>
                </CardHeader>
                <form onSubmit={handleSubmit}>
                    <CardContent className="space-y-6">
                        {/* Personal Info */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                           <div className="space-y-1.5">
                                <Label htmlFor="nombre">Nombre *</Label>
                                <Input id="nombre" value={formData.nombre || ''} onChange={(e) => handleFormChange('nombre', e.target.value)} disabled={isSaving} />
                            </div>
                             <div className="space-y-1.5">
                                <Label htmlFor="apellido">Apellido *</Label>
                                <Input id="apellido" value={formData.apellido || ''} onChange={(e) => handleFormChange('apellido', e.target.value)} disabled={isSaving} />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="nombreCorto">Nombre Corto *</Label>
                                <Input id="nombreCorto" value={formData.nombreCorto || ''} onChange={(e) => handleFormChange('nombreCorto', e.target.value)} disabled={isSaving} />
                            </div>
                        </div>

                        {/* Auth Info */}
                        <div className="space-y-1.5">
                            <Label htmlFor="email">Email *</Label>
                            <Input id="email" type="email" value={formData.email || ''} onChange={(e) => handleFormChange('email', e.target.value)} disabled={isSaving || !!editingUserId} />
                        </div>
                        {!editingUserId && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-1.5">
                                    <Label htmlFor="password">Contraseña *</Label>
                                    <Input id="password" type="password" value={formData.password || ''} onChange={(e) => handleFormChange('password', e.target.value)} disabled={isSaving} autoComplete="new-password" />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="confirmPassword">Confirmar *</Label>
                                    <Input id="confirmPassword" type="password" value={formData.confirmPassword || ''} onChange={(e) => handleFormChange('confirmPassword', e.target.value)} disabled={isSaving} autoComplete="new-password"/>
                                </div>
                            </div>
                        )}

                        {/* Roles */}
                        <div className="space-y-2">
                            <Label className="font-medium">Roles *</Label>
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                                {availableRoles.map((role) => (
                                    <div key={role} className="flex items-center space-x-2">
                                        <Checkbox
                                            id={`role-${role}`}
                                            checked={formData.roles?.includes(role)}
                                            onCheckedChange={(checked) => handleRoleChange(role, !!checked)}
                                            disabled={isSaving || (role === 'master' && !adminUserProfile?.roles.includes('master'))}
                                        />
                                        <Label htmlFor={`role-${role}`} className="font-normal capitalize">{formatSingleRoleName(role)}</Label>
                                    </div>
                                ))}
                            </div>
                        </div>
                        
                        {/* Status Switch for Editing */}
                        {editingUserId && (
                            <div className="flex items-center space-x-2 pt-3">
                                <Switch id="estaActivo" checked={!!formData.estaActivo} onCheckedChange={(c) => handleFormChange('estaActivo', c)} disabled={isSaving} />
                                <Label htmlFor="estaActivo">Usuario Activo</Label>
                            </div>
                        )}

                        {/* Residencia & Dieta */}
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                             <div className="space-y-1.5">
                                 <Label htmlFor="residencia">Residencia Asignada {isResidenciaRequired ? '*' : ''}</Label>
                                <Select
                                    value={formData.residenciaId || ''}
                                    onValueChange={(value) => handleSelectChange('residenciaId', value)}
                                    disabled={isSaving || !isResidenciaRequired || !adminUserProfile?.roles.includes('master')}
                                >
                                    <SelectTrigger><SelectValue placeholder="Seleccione..." /></SelectTrigger>
                                    <SelectContent>
                                        {Object.entries(residences).map(([id, res]) => (
                                            <SelectItem key={id} value={id}>{res.nombre}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                             </div>
                             <div className="space-y-1.5">
                                <Label htmlFor="dieta">Dieta {isResidente ? '*' : ''}</Label>
                                <Select 
                                    value={formData.residente?.dietaId || ''} 
                                    onValueChange={(v) => handleSelectChange('residente.dietaId', v)} 
                                    disabled={isSaving || !isResidente || isLoadingResidenciaData}
                                >
                                     <SelectTrigger><SelectValue placeholder={isResidente ? "Seleccione dieta..." : "N/A"} /></SelectTrigger>
                                     <SelectContent>
                                        {isResidente && dietas.filter(d => d.estaActiva).map(d => (
                                            <SelectItem key={d.id} value={d.id}>{d.nombre} {d.esPredeterminada ? '(Default)' : ''}</SelectItem>
                                        ))}
                                     </SelectContent>
                                 </Select>
                             </div>
                         </div>
                         
                         {/* Residente specific fields */}
                         {isResidente && (
                            <Card className="p-4 mt-4 bg-slate-50 dark:bg-slate-800/30">
                                <h4 className="text-base font-medium mb-3">Info Residente</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-1.5">
                                        <Label htmlFor="habitacion">Habitación *</Label>
                                        <Input id="habitacion" value={formData.residente?.habitacion || ''} onChange={(e) => handleFormChange('residente.habitacion', e.target.value)} disabled={isSaving} />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="numeroDeRopa">Nº Ropa *</Label>
                                        <Input id="numeroDeRopa" value={formData.residente?.numeroDeRopa || ''} onChange={(e) => handleFormChange('residente.numeroDeRopa', e.target.value)} disabled={isSaving} />
                                    </div>
                                </div>
                            </Card>
                         )}

                    </CardContent>
                    <CardFooter className="border-t pt-6">
                        <Button type="submit" disabled={isSaving}>
                            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {editingUserId ? 'Guardar Cambios' : 'Crear Usuario'}
                        </Button>
                        {editingUserId && <Button type="button" variant="outline" onClick={handleCancelEdit} disabled={isSaving} className="ml-3">Cancelar</Button>}
                    </CardFooter>
                </form>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Usuarios Existentes</CardTitle>
                    {adminUserProfile?.roles?.includes('master') && (
                        <div className="pt-2 max-w-sm">
                            <Label htmlFor="residenciaFilter" className="text-sm">Filtrar por Residencia</Label>
                            <Select value={selectedResidenciaFilter} onValueChange={setSelectedResidenciaFilter}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={ALL_RESIDENCIAS_FILTER_KEY}>Todas</SelectItem>
                                    <SelectItem value={NO_RESIDENCIA_FILTER_KEY}>Sin Residencia</SelectItem>
                                    {Object.entries(residences).map(([id, res]) => (
                                        <SelectItem key={id} value={id}>{res.nombre}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                </CardHeader>
                <CardContent>
                    {isLoadingUsers ? (
                        <Skeleton className="h-20 w-full" />
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Usuario</TableHead>
                                    <TableHead>Info</TableHead>
                                    <TableHead className="text-right">Acciones</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredUsers.map((user) => (
                                    <TableRow key={user.id} className={editingUserId === user.id ? 'bg-blue-50 dark:bg-blue-900/30' : ''}>
                                        <TableCell className="font-medium">
                                            <div>{user.nombre} {user.apellido}</div>
                                            <div className="text-xs text-muted-foreground">{user.email}</div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="capitalize text-xs">{(user.roles || []).map(formatSingleRoleName).join(', ')}</div>
                                            <Badge variant={user.estaActivo ? 'default' : 'outline'} className={user.estaActivo ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                                                {user.estaActivo ? 'Activo' : 'Inactivo'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="outline" size="sm" onClick={() => handleEditUser(user.id)} disabled={isSaving || (!!editingUserId && editingUserId !== user.id)}>Editar</Button>
                                            <Button variant="destructive" size="sm" onClick={() => handleDeleteUser(user.id)} disabled={isSaving || !!editingUserId} className="ml-2">Eliminar</Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            <AlertDialog open={isConfirmingDelete} onOpenChange={setIsConfirmingDelete}>
                 <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>¿Está seguro?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Esta acción eliminará el perfil de Firestore del usuario <span className="font-semibold">{getUserToDeleteName()}</span>. La cuenta de autenticación no se eliminará.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmDeleteUser} className={buttonVariants({ variant: "destructive" })}>
                            Confirmar Eliminación
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

export default UserManagementPage;
