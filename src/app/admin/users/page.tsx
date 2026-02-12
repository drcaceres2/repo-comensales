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
import { formatTimestampForInput } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth';

// Model Imports
import { 
    UserProfile, 
    UserRole,
    Residencia, 
    ResidenciaId, 
    DietaId, 
    Dieta, 
    CentroCosto
} from '@/../shared/models/types';
// Zod Schemas import
import { 
    clientCreateUserFormSchema,
    clientUpdateUserFormSchema,
    type ClientCreateUserForm,
    type ClientUpdateUserForm,
    type AsistentePermisos,
    type AsistentePermisosDetalle,
} from '../../../../shared/schemas/usuarios';

const defaultPermisoDetalle: AsistentePermisosDetalle = {
    nivelAcceso: 'Ninguna',
    restriccionTiempo: false,
    fechaInicio: null,
    fechaFin: null,
};

const defaultAsistentePermisos: AsistentePermisos = {
    usuariosAsistidos: [],
    gestionUsuarios: false,
    gestionActividades: { ...defaultPermisoDetalle },
    gestionInvitados: { ...defaultPermisoDetalle },
    gestionRecordatorios: { ...defaultPermisoDetalle },
    gestionDietas: { ...defaultPermisoDetalle },
    gestionAtenciones: { ...defaultPermisoDetalle },
    gestionAsistentes: { ...defaultPermisoDetalle },
    gestionGrupos: { ...defaultPermisoDetalle },
    solicitarComensales: { ...defaultPermisoDetalle },
};

function UserManagementPage(): JSX.Element | null {
    const ALL_RESIDENCIAS_FILTER_KEY = 'all_residencias';
    const NO_RESIDENCIA_FILTER_KEY = 'no_residencia_assigned';

    const functionsInstance = getFunctions(auth.app); // More reliable way if auth is initialized

    const createUserCallable = httpsCallable(functionsInstance, 'createUser');
    const updateUserCallable = httpsCallable(functionsInstance, 'updateUser');
    const deleteUserCallable = httpsCallable(functionsInstance, 'deleteUser');

    type UserFormData = Partial<Omit<UserProfile, 'id' | 'roles' | 'fechaDeNacimiento' | 'asistentePermisos' | 'nombreCorto' | 'fotoPerfil'>> & {
        nombreCorto?: string;
        fotoPerfil?: string | null;
        roles: UserRole[];
        residenciaId?: ResidenciaId | '';
        dietaId?: DietaId | '';
        numeroDeRopa?: string;
        habitacion?: string;
        universidad?: string;
        carrera?: string;
        identificacion?: string;
        isActive?: boolean;
        password?: string;
        confirmPassword?: string;
        telefonoMovil?: string;
        fechaDeNacimiento?: string;
        camposPersonalizados?: { [key: string]: string };
        asistentePermisos?: AsistentePermisos | null;
        tieneAutenticacion: true;
    };

    const router = useRouter();
    const { toast } = useToast();

    const { user: authUser, loading: authFirebaseLoading, error: authFirebaseError } = useAuth();
    const [adminUserProfile, setAdminUserProfile] = useState<UserProfile | null>(null);
    const [adminProfileLoading, setAdminProfileLoading] = useState<boolean>(true);
    const [adminProfileError, setAdminProfileError] = useState<string | null>(null);
    const [isAuthorized, setIsAuthorized] = useState<boolean>(false);

    const [hasAttemptedFetchResidences, setHasAttemptedFetchResidences] = useState(false);
    const [hasAttemptedFetchDietas, setHasAttemptedFetchDietas] = useState(false);
    const [hasAttemptedFetchUsers, setHasAttemptedFetchUsers] = useState(false);

    // ADDED: State for current Residencia details and Centros de Costo
    const [currentResidenciaDetails, setCurrentResidenciaDetails] = useState<Residencia | null>(null);
    const [isLoadingResidenciaDetails, setIsLoadingResidenciaDetails] = useState<boolean>(false);
    const [centrosCostoList, setCentrosCostoList] = useState<CentroCosto[]>([]);
    const [isLoadingCentrosCosto, setIsLoadingCentrosCosto] = useState<boolean>(false);
    const [residentesForAsistente, setResidentesForAsistente] = useState<UserProfile[]>([]);
    const [isLoadingResidentesForAsistente, setIsLoadingResidentesForAsistente] = useState<boolean>(false);

    const [formData, setFormData] = useState<UserFormData>(() => {
        const initialResidenciaId = (adminUserProfile && !adminUserProfile.roles.includes('master') && adminUserProfile.residenciaId)
            ? adminUserProfile.residenciaId
            : '';
        return {
            nombre: '',
            apellido: '',
            nombreCorto: '',
            fotoPerfil: null,
            email: '',
            isActive: true,
            roles: [],
            residenciaId: '',
            dietaId: '',
            numeroDeRopa: '',
            habitacion: '',
            universidad: '',
            carrera: '',
            identificacion: '',
            password: '',
            confirmPassword: '',
            telefonoMovil: '',
            fechaDeNacimiento: '',
            centroCostoPorDefectoId: '',
            puedeTraerInvitados: 'no',
            camposPersonalizados: {},
            asistentePermisos: null,
            notificacionPreferencias: undefined,
            tieneAutenticacion: true,
        };
    });

    const [isSaving, setIsSaving] = useState(false);
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [isLoadingUsers, setIsLoadingUsers] = useState(true);
    const [editingUserId, setEditingUserId] = useState<string | null>(null);
    const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
    const [userToDeleteId, setUserToDeleteId] = useState<string | null>(null);
    const [selectedResidenciaFilter, setSelectedResidenciaFilter] = useState<string>(ALL_RESIDENCIAS_FILTER_KEY);

    const availableRoles: UserRole[] = ['residente', 'director', 'admin', 'master', 'invitado', 'asistente', 'contador'];
    const [residences, setResidences] = useState<Record<ResidenciaId, { nombre: string }>>({});
    const [dietas, setDietas] = useState<Dieta[]>([]);

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

    const fetchResidences = useCallback(async (profile: UserProfile | null) => {
        if (!profile) {
            return;
        }

        const isMaster = profile.roles.includes('master');
        const adminResidenciaId = profile.residenciaId;

        try {
            const residencesData: Record<ResidenciaId, { nombre: string }> = {};

            if (isMaster) {
                const residencesCol = collection(db, "residencias");
                const querySnapshot = await getDocs(residencesCol);
                querySnapshot.forEach((doc) => {
                    const data = doc.data();
                    if (data.nombre) {
                        residencesData[doc.id] = { nombre: data.nombre };
                    }
                });
            } else if (adminResidenciaId) {
                const residenciaDocRef = doc(db, "residencias", adminResidenciaId);
                const docSnap = await getDoc(residenciaDocRef);
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    if (data.nombre) {
                        residencesData[docSnap.id] = { nombre: data.nombre };
                    }
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
        } finally {
            setHasAttemptedFetchResidences(true);
        }
    }, [toast]);

    const fetchDietas = useCallback(async () => {
        try {
            const dietasCol = collection(db, "dietas");
            const querySnapshot = await getDocs(dietasCol);
            const fetchedDietas: Dieta[] = [];
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                fetchedDietas.push({
                    id: doc.id,
                    nombre: data.nombre || 'Nombre no disponible',
                    descripcion: data.descripcion || '',
                    isDefault: data.isDefault === true,
                    isActive: data.isActive === true, 
                    residenciaId: data.residenciaId,
                } as Dieta);
            });
            setDietas(fetchedDietas.sort((a, b) => a.nombre.localeCompare(b.nombre)));
        } catch (error) {
            console.error("Error fetching all dietas:", error);
            toast({
                title: "Error al Cargar Dietas Globales",
                description: "No se pudieron obtener los datos de todas las dietas.",
                variant: "destructive",
            });
            setDietas([]);
        } finally {
            setHasAttemptedFetchDietas(true);
        }
    }, [toast]);

    const fetchFullResidenciaDetails = useCallback(async (residenciaId: ResidenciaId) => {
        if (!residenciaId) {
            setCurrentResidenciaDetails(null);
            return;
        }
        setIsLoadingResidenciaDetails(true);
        try {
            const residenciaDocRef = doc(db, "residencias", residenciaId);
            const docSnap = await getDoc(residenciaDocRef);
            if (docSnap.exists()) {
                setCurrentResidenciaDetails({ id: docSnap.id, ...docSnap.data() } as Residencia);
            } else {
                setCurrentResidenciaDetails(null);
                toast({ title: "Error", description: `No se encontraron detalles para la residencia ID: ${residenciaId}.`, variant: "destructive" });
            }
        } catch (error) {
            console.error(`Error fetching residencia details for ${residenciaId}:`, error);
            setCurrentResidenciaDetails(null);
            toast({ title: "Error al Cargar Detalles de Residencia", description: (error as Error).message, variant: "destructive" });
        } finally {
            setIsLoadingResidenciaDetails(false);
        }
    }, [toast]);

    const fetchCentrosCostoForResidencia = useCallback(async (residenciaId: ResidenciaId) => {
        if (!residenciaId) {
            setCentrosCostoList([]);
            return;
        }
        setIsLoadingCentrosCosto(true);
        try {
            const ccCol = collection(db, "centrosCosto");
            const q = query(ccCol, where("residenciaId", "==", residenciaId), where("isActive", "==", true));
            const querySnapshot = await getDocs(q);
            const fetchedCCs: CentroCosto[] = [];
            querySnapshot.forEach((doc) => {
                fetchedCCs.push({ id: doc.id, ...doc.data() } as CentroCosto);
            });
            setCentrosCostoList(fetchedCCs.sort((a, b) => a.nombre.localeCompare(b.nombre)));
        } catch (error) {
            console.error(`Error fetching centros de costo for ${residenciaId}:`, error);
            setCentrosCostoList([]);
            toast({ title: "Error al Cargar Centros de Costo", description: (error as Error).message, variant: "destructive" });
        } finally {
            setIsLoadingCentrosCosto(false);
        }
    }, [toast]);

    const fetchResidentesForResidencia = useCallback(async (residenciaId?: ResidenciaId) => {
        if (!residenciaId) {
            setResidentesForAsistente([]);
            return;
        }
        setIsLoadingResidentesForAsistente(true);
        try {
            const usersCol = collection(db, "users");
            const q = query(usersCol, where("residenciaId", "==", residenciaId), where("roles", "array-contains", "residente"), where("isActive", "==", true));
            const querySnapshot = await getDocs(q);
            const fetchedResidentes: UserProfile[] = [];
            querySnapshot.forEach((doc) => {
                if (editingUserId !== doc.id) {
                    fetchedResidentes.push({ id: doc.id, ...doc.data() } as UserProfile);
                } else if (!editingUserId && formData.email !== doc.data().email) {
                    fetchedResidentes.push({ id: doc.id, ...doc.data() } as UserProfile);
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

    const fetchUsersToManage = useCallback(async (profile: UserProfile | null) => {
        if (!profile) {
            setIsLoadingUsers(false);
            return;
        }
        setIsLoadingUsers(true);

        const isMaster = profile.roles.includes('master');
        const adminResidenciaId = profile.residenciaId;

        try {
            const usersCol = collection(db, "users");
            let q;

            if (isMaster) {
                q = query(usersCol);
            } else if (adminResidenciaId) {
                q = query(usersCol, where("residenciaId", "==", adminResidenciaId));
            } else {
                 setUsers([]);
                 setIsLoadingUsers(false);
                 setHasAttemptedFetchUsers(true);
                 return;
            }

            const querySnapshot = await getDocs(q);
            const usersData: UserProfile[] = [];
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                usersData.push({
                    id: doc.id,
                    nombre: data.nombre || '',
                    apellido: data.apellido || '',
                    nombreCorto: data.nombreCorto || '',
                    fotoPerfil: data.fotoPerfil || '',
                    email: data.email || '',
                    roles: data.roles || [],
                    isActive: data.isActive === undefined ? true : data.isActive,
                    residenciaId: data.residenciaId || null, 
                    dietaId: data.dietaId || null,
                    numeroDeRopa: data.numeroDeRopa || '',
                    habitacion: data.habitacion || '',
                    universidad: data.universidad || '',
                    carrera: data.carrera || '',
                    identificacion: data.identificacion || '',
                    telefonoMovil: data.telefonoMovil || '',
                    fechaDeNacimiento: data.fechaDeNacimiento || null, 
                    asistentePermisos: data.asistentePermisos || null,
                    centroCostoPorDefectoId: data.centroCostoPorDefectoId || null,
                    puedeTraerInvitados: data.puedeTraerInvitados || 'no',
                    notificacionPreferencias: data.notificacionPreferencias || null,
                    tieneAutenticacion: true,
                    fechaHoraCreacion: data.fechaHoraCreacion || null,
                    ultimaActualizacion: data.ultimaActualizacion || null,
                    lastLogin: data.lastLogin || null,
                    camposPersonalizados: data.camposPersonalizados || {},
                });
            });
            setUsers(usersData.sort((a, b) => (a.apellido + a.nombre).localeCompare(b.apellido + b.nombre))); 
        } catch (error) {
            console.error("Error fetching users to manage:", error);
            toast({
                title: "Error al Cargar Usuarios",
                description: "No se pudieron obtener los datos de los usuarios.",
                variant: "destructive",
            });
            setUsers([]);
        } finally { 
            setIsLoadingUsers(false);
            setHasAttemptedFetchUsers(true);
        }
    }, [toast]); 

    useEffect(() => {
        if (authFirebaseLoading) {
            setAdminProfileLoading(true);
            setIsAuthorized(false);
            return;
        }

        if (authFirebaseError) {
            toast({ title: "Error de Autenticación", description: authFirebaseError.message, variant: "destructive" });
            setAdminProfileLoading(false);
            setAdminUserProfile(null);
            setAdminProfileError(authFirebaseError.message);
            setIsAuthorized(false);
            router.replace('/');
            return;
        }

        if (!authUser) {
            setAdminProfileLoading(false);
            setAdminUserProfile(null);
            setAdminProfileError(null); 
            setIsAuthorized(false);
            router.replace('/');
            return;
        }
        setAdminProfileLoading(true);
        setAdminProfileError(null);
        const adminDocRef = doc(db, "users", authUser.uid);

        getDoc(adminDocRef)
            .then((docSnap) => {
                if (docSnap.exists()) {
                    const fetchedProfile = docSnap.data() as UserProfile;
                    setAdminUserProfile(fetchedProfile);

                    if (fetchedProfile.residenciaId && !fetchedProfile.roles.includes('master')) {
                        setFormData(prevFormData => ({
                            ...prevFormData,
                            residenciaId: fetchedProfile.residenciaId!,
                        }));
                    }
                } else {
                    setAdminUserProfile(null);
                    setAdminProfileError("Perfil de administrador no encontrado. No estás autorizado.");
                    toast({ title: "Error de Perfil", description: "No se encontró tu perfil de administrador.", variant: "destructive" });
                }
            })
            .catch((error) => {
                setAdminUserProfile(null);
                setAdminProfileError(`Error al cargar tu perfil: ${error.message}`);
                toast({ title: "Error Cargando Perfil Administrador", description: `No se pudo cargar tu perfil: ${error.message}`, variant: "destructive" });
            })
            .finally(() => {
                setAdminProfileLoading(false);
            });
    }, [authUser, authFirebaseLoading, authFirebaseError, router, toast]);

    useEffect(() => {
        if (adminProfileLoading) {
            setIsAuthorized(false);
            return;
        }
        if (adminProfileError || !adminUserProfile) {
            setIsAuthorized(false);
            return;
        }
        const roles = adminUserProfile.roles || [];
        const isAdminAuthorized = roles.includes('admin') || roles.includes('master');

        if (isAdminAuthorized) {
            setIsAuthorized(true);
            if (adminUserProfile.roles.includes('master')) {
                setSelectedResidenciaFilter(ALL_RESIDENCIAS_FILTER_KEY);
            } else if (adminUserProfile.roles.includes('admin') && adminUserProfile.residenciaId) {
                setSelectedResidenciaFilter(adminUserProfile.residenciaId);
                if (adminUserProfile.residenciaId) {
                    fetchFullResidenciaDetails(adminUserProfile.residenciaId);
                    fetchCentrosCostoForResidencia(adminUserProfile.residenciaId);
                }
            } else {
                setSelectedResidenciaFilter(NO_RESIDENCIA_FILTER_KEY);
                 setCurrentResidenciaDetails(null);
                 setCentrosCostoList([]);
            }
            if (!hasAttemptedFetchResidences) fetchResidences(adminUserProfile);
            if (!hasAttemptedFetchDietas) fetchDietas();
            if (!hasAttemptedFetchUsers) fetchUsersToManage(adminUserProfile);
        } else {
            setIsAuthorized(false);
            toast({ title: "Acceso Denegado", description: "No tienes los permisos (admin/master) para acceder a esta página.", variant: "destructive" });
        }
    }, [
        adminUserProfile,
        adminProfileLoading,
        adminProfileError,
        fetchResidences,
        fetchDietas,
        fetchUsersToManage,
        hasAttemptedFetchResidences,
        hasAttemptedFetchDietas,    
        hasAttemptedFetchUsers,     
        isLoadingUsers,
        toast,
        fetchFullResidenciaDetails,
        fetchCentrosCostoForResidencia
    ]);

    useEffect(() => {
        if (formData.residenciaId && formData.residenciaId !== currentResidenciaDetails?.id) {
            fetchFullResidenciaDetails(formData.residenciaId);
            fetchCentrosCostoForResidencia(formData.residenciaId);
            fetchResidentesForResidencia(formData.residenciaId);
        } else if (!formData.residenciaId) {
            setCurrentResidenciaDetails(null);
            setCentrosCostoList([]);
            setResidentesForAsistente([]);
        }
        else if (formData.residenciaId && formData.roles?.includes('asistente') && residentesForAsistente.length === 0){
            fetchResidentesForResidencia(formData.residenciaId);
        }
    }, [formData.residenciaId, formData.roles, fetchFullResidenciaDetails, fetchCentrosCostoForResidencia, fetchResidentesForResidencia, currentResidenciaDetails?.id, residentesForAsistente.length]);

    const handleFormChange = (field: keyof Omit<UserFormData, 'roles'>, value: string | boolean | number | undefined) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleRoleChange = (role: UserRole, checked: boolean) => {
        setFormData(prev => {
            const currentRoles = prev.roles || [];
            let updatedRoles: UserRole[];
            if (checked) {
                updatedRoles = [...new Set([...currentRoles, role])];
            } else {
                updatedRoles = currentRoles.filter(r => r !== role);
            }

            let dietaId = prev.dietaId;
            let residenciaRequiredForRole: boolean;
            let residenciaId: string | undefined;
            if(adminUserProfile?.roles.includes('master')) {
                residenciaRequiredForRole = updatedRoles.some(r => ['residente', 'director', 'asistente', 'auditor', 'admin'].includes(r));
                residenciaId = residenciaRequiredForRole ? prev.residenciaId : '';
            } else {
                residenciaRequiredForRole = true;
                residenciaId = prev.residenciaId;
            }

            if (role === 'residente') {
                if (checked && residenciaId && dietas.length > 0) {
                    const defaultDieta = dietas.find(d => d.residenciaId === residenciaId && d.isDefault && d.isActive);
                    if (defaultDieta) {
                        dietaId = defaultDieta.id;
                    } else {
                        dietaId = '';
                        toast({
                            title: "Atención",
                            description: `No se encontró una dieta por defecto (y activa) para la residencia ${residences[residenciaId]?.nombre || residenciaId}. Por favor, seleccione una dieta manualmente.`,
                            variant: "default",
                            duration: 7000
                        });
                    }
                } else if (!checked) {
                    dietaId = '';
                }
            }
            
            if (prev.residenciaId && !residenciaId) {
                dietaId = '';
            }

            const newAsistentePermisos = updatedRoles.includes('asistente') ? (prev.asistentePermisos || defaultAsistentePermisos) : null;

            return { ...prev, roles: updatedRoles, dietaId, residenciaId, asistentePermisos: newAsistentePermisos };
        });
    };

    const handleSelectChange = (field: 'residenciaId' | 'dietaId' | 'grupoUsuario' | 'puedeTraerInvitados' | 'centroCostoPorDefectoId', value: string) => {
        setFormData(prev => {
            const updatedFormData = { ...prev, [field]: value };

            if (field === 'residenciaId') {
                updatedFormData.dietaId = '';
                updatedFormData.centroCostoPorDefectoId = '';
                updatedFormData.camposPersonalizados = {};

                if (updatedFormData.roles.includes('residente') && value) {
                    const defaultDieta = dietas.find(d => d.residenciaId === value && d.isDefault && d.isActive);
                    if (defaultDieta) {
                        updatedFormData.dietaId = defaultDieta.id;
                    } else {
                        toast({
                            title: "Atención",
                            description: `No se encontró una dieta por defecto (y activa) para la residencia seleccionada. Por favor, seleccione una dieta manualmente si es necesaria.`,
                            variant: "default",
                            duration: 7000
                        });
                    }
                }
            }
            return updatedFormData;
        });
    };

    const handleCreateUser = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        console.log("handleCreateUser: Function triggered.");
        setIsSaving(true);
    
        try {
            console.log("handleCreateUser: Current form data state:", formData);
            let dataForValidation: Partial<ClientCreateUserForm> = { ...formData };
            
            if (dataForValidation.puedeTraerInvitados === null) {
                dataForValidation.puedeTraerInvitados = undefined;
            }
    
        if (adminUserProfile && !adminUserProfile.roles.includes('master') && adminUserProfile.residenciaId && isResidenciaConditionallyRequired) {
                if (formData.residenciaId !== adminUserProfile.residenciaId) {
                    dataForValidation.residenciaId = adminUserProfile.residenciaId;
                }
            }
    
            // Cleanse empty strings for optional ID fields
            if (dataForValidation.residenciaId === '') dataForValidation.residenciaId = null;
            if (dataForValidation.dietaId === '') dataForValidation.dietaId = null;
            if (dataForValidation.centroCostoPorDefectoId === '') dataForValidation.centroCostoPorDefectoId = null;

            if (dataForValidation.fechaDeNacimiento && typeof dataForValidation.fechaDeNacimiento === 'string') {
                const formatted = formatTimestampForInput(dataForValidation.fechaDeNacimiento);
                dataForValidation.fechaDeNacimiento = formatted;
            }

            console.log("handleCreateUser: Data prepared for validation:", dataForValidation);
            const validationResult = clientCreateUserFormSchema.safeParse(dataForValidation);
    
            if (!validationResult.success) {
                console.error("handleCreateUser: Zod validation failed.", validationResult.error.flatten());
                const zodErrors = validationResult.error.flatten();
                const errorMessages: string[] = [];
    
                if (zodErrors.fieldErrors) {
                    Object.entries(zodErrors.fieldErrors).forEach(([field, messages]) => {
                        if (messages && Array.isArray(messages) && messages.length > 0) {
                            errorMessages.push(`${field}: ${messages[0]}`);
                        }
                    });
                }
    
                if (zodErrors.formErrors && zodErrors.formErrors.length > 0) {
                    errorMessages.push(...zodErrors.formErrors);
                }
    
                const validationErrors: string[] = [...errorMessages];
    
                if (currentResidenciaDetails?.camposPersonalizados) {
                    for (const key in currentResidenciaDetails.camposPersonalizados) {
                        const campo = currentResidenciaDetails.camposPersonalizados[key];
                        if (campo.isActive && campo.necesitaValidacion && campo.regexValidacion) {
                            const regex = new RegExp(campo.regexValidacion);
                            if (dataForValidation.camposPersonalizados?.[key] && !regex.test(dataForValidation.camposPersonalizados[key])) {
                                validationErrors.push(`${campo.etiqueta || `Campo ${key}`} no es válido.`);
                            }
                        }
                    }
                }
    
                const title = validationErrors.length === 1
                    ? "Error de Validación"
                    : `Existen ${validationErrors.length} errores de validación`;
                const description = validationErrors.join("\n");
        
                toast({
                    title: title,
                    description: description,
                    variant: "destructive",
                    duration: 9000
                });
                setIsSaving(false);
                return;
            }
    
            console.log("handleCreateUser: Zod validation successful.", validationResult.data);
            const validatedData = validationResult.data;
    
            const profileDataForFunction: Omit<UserProfile, 'id'> = {
                nombre: validatedData.nombre!.trim(),
                apellido: validatedData.apellido!.trim(),
                email: validatedData.email!.trim(),
                nombreCorto: validatedData.nombreCorto!.trim(),
                fotoPerfil: null,
                tieneAutenticacion: true,
                roles: validatedData.roles!,
                isActive: true, // validatedData.isActive is not in create schema validatedData.isActive ?? true,
                residenciaId: validatedData.residenciaId,
                dietaId: validatedData.dietaId || undefined,
                fechaDeNacimiento: validatedData.fechaDeNacimiento || null,
                telefonoMovil: validatedData.telefonoMovil?.trim() || undefined,
                identificacion: validatedData.identificacion?.trim() || undefined,
                numeroDeRopa: validatedData.numeroDeRopa?.trim() || undefined,
                habitacion: validatedData.habitacion?.trim() || undefined,
                universidad: validatedData.universidad?.trim() || undefined,
                carrera: validatedData.carrera?.trim() || undefined,
                puedeTraerInvitados: validatedData.puedeTraerInvitados || 'no',
                asistentePermisos: validatedData.asistentePermisos || null,
                notificacionPreferencias: (validatedData.notificacionPreferencias as any) || undefined,
                centroCostoPorDefectoId: validatedData.centroCostoPorDefectoId || undefined,
                camposPersonalizados: validatedData.camposPersonalizados || {},
                fechaHoraCreacion: null,
                ultimaActualizacion: null,
            };
    
            const userDataForFunction = {
                email: validatedData.email!,
                password: validatedData.password!,
                profileData: profileDataForFunction,
                performedByUid: adminUserProfile?.id,
            };
    
            Object.keys(userDataForFunction.profileData).forEach(key => {
                const k = key as keyof typeof profileDataForFunction;
                if (userDataForFunction.profileData[k] === undefined) {
                    delete userDataForFunction.profileData[k];
                }
            });
    
            console.log("handleCreateUser: Calling 'createUser' Firebase function with:", userDataForFunction);
            const result = await createUserCallable(userDataForFunction);
            const resultData = result.data as { success: boolean; userId?: string; message?: string };
            console.log("handleCreateUser: 'createUser' function result:", resultData);
    
            if (resultData.success && resultData.userId) {
                const newUserForUI: UserProfile = {
                    ...(userDataForFunction.profileData as Omit<UserProfile, 'id'>),
                    id: resultData.userId,
                };
                setUsers(prevUsers => [newUserForUI, ...prevUsers].sort((a, b) => (a.apellido + a.nombre).localeCompare(b.apellido + b.nombre)));
    
                toast({ title: "Usuario Creado", description: `Usuario ${newUserForUI.nombre} ${newUserForUI.apellido} creado.` });
                handleCancelEdit();
    
            } else {
                throw new Error(resultData.message || 'La función de creación de usuario falló.');
            }
    
        } catch (error: any) {
            console.error("handleCreateUser: An error occurred in the catch block:", error);
            const message = error.message || "Ocurrió un error al contactar el servicio de creación.";
            let title = "Error al Crear Usuario";
            if (message.includes("already exists")) title = "Error de Duplicado";
            if (message.includes("permission denied")) title = "Error de Permisos";
    
            toast({ title: title, description: message, variant: "destructive" });
        } finally {
            console.log("handleCreateUser: Function finished.");
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
        fotoPerfil: userToEdit.fotoPerfil || null,
        email: userToEdit.email || '',
        isActive: userToEdit.isActive === undefined ? true : userToEdit.isActive,
        roles: userToEdit.roles || [],
        residenciaId: userToEdit.residenciaId || '',
        dietaId: userToEdit.dietaId || '',
        numeroDeRopa: userToEdit.numeroDeRopa || '',
        habitacion: userToEdit.habitacion || '',
        universidad: userToEdit.universidad || '',
        carrera: userToEdit.carrera || '',
        identificacion: userToEdit.identificacion || '',
        password: '', confirmPassword: '',
        telefonoMovil: userToEdit.telefonoMovil || '',
        fechaDeNacimiento: userToEdit.fechaDeNacimiento ? formatTimestampForInput(userToEdit.fechaDeNacimiento) : '',
        centroCostoPorDefectoId: userToEdit.centroCostoPorDefectoId || '',
        puedeTraerInvitados: userToEdit.puedeTraerInvitados || 'no',
        camposPersonalizados: userToEdit.camposPersonalizados || {},
        asistentePermisos: userToEdit.asistentePermisos || null,
        tieneAutenticacion: true,
        notificacionPreferencias: userToEdit.notificacionPreferencias || undefined,
    });
    };

    const handleCancelEdit = () => {
        setEditingUserId(null);
        setFormData({
            nombre: '',
            apellido: '',
            nombreCorto: '',
            fotoPerfil: null,
            email: '',
            isActive: true,
            roles: [],
            residenciaId: '',
            dietaId: '',
            numeroDeRopa: '',
            habitacion: '',
            universidad: '',
            carrera: '',
            identificacion: '',
            password: '',
            confirmPassword: '',
            telefonoMovil: '',
            fechaDeNacimiento: '',
            centroCostoPorDefectoId: '',
            puedeTraerInvitados: 'no',
            camposPersonalizados: {},
            asistentePermisos: null,
            tieneAutenticacion: true,
            notificacionPreferencias: undefined,
        });
    };

    const handleDeleteUser = (userId: string) => {
        const user = users.find(u => u.id === userId);
        if (!user) { toast({ title: "Error", description: "Usuario no encontrado.", variant: "destructive" }); return; }
        setUserToDeleteId(userId);
        setIsConfirmingDelete(true);
    };

    const confirmDeleteUser = async () => {
        if (!userToDeleteId) return;
        const userToDeleteInfo = users.find(u => u.id === userToDeleteId);
        try {
            const result = await deleteUserCallable({ userId: userToDeleteId });
            const resultData = result.data as { success: boolean; message?: string };

            if (resultData.success) {
                setUsers(prevUsers => prevUsers.filter(user => user.id !== userToDeleteId));
                toast({ title: "Usuario Eliminado", description: `El usuario ${userToDeleteInfo?.nombre || userToDeleteId} ha sido eliminado.` });

            } else {
                throw new Error(resultData.message || 'La función de eliminación de usuario falló.');
            }

        } catch (error: any) {
            const message = error.message || "Ocurrió un error al contactar el servicio de eliminación.";
            let title = "Error al Eliminar";
            if (message.includes("permission denied")) title = "Error de Permisos";
            if (message.includes("not found")) title = "Error: Usuario No Encontrado";
            toast({ title: title, description: message, variant: "destructive" });
        } finally {
            setIsConfirmingDelete(false);
            setUserToDeleteId(null);
        }
    };

    const handleUpdateUser = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!editingUserId) return;
        setIsSaving(true);

        try {
            let finalResidenciaId = formData.residenciaId;
            
            if (adminUserProfile && !adminUserProfile.roles.includes('master') && adminUserProfile.residenciaId && isResidenciaConditionallyRequired) {
                if (formData.residenciaId !== adminUserProfile.residenciaId) {
                    finalResidenciaId = adminUserProfile.residenciaId;
                }
            }

            let dataForValidation: Partial<ClientUpdateUserForm> = { ...formData };
            if (dataForValidation.fechaDeNacimiento && typeof dataForValidation.fechaDeNacimiento === 'string') {
                const formatted = formatTimestampForInput(dataForValidation.fechaDeNacimiento);
                dataForValidation.fechaDeNacimiento = formatted;
            }
            if (finalResidenciaId) {
                dataForValidation.residenciaId = finalResidenciaId;
            }
            
            // Cleanse empty strings for optional ID fields
            if (dataForValidation.residenciaId === '') dataForValidation.residenciaId = null;
            if (dataForValidation.dietaId === '') dataForValidation.dietaId = null;
            if (dataForValidation.centroCostoPorDefectoId === '') dataForValidation.centroCostoPorDefectoId = null;

            const validationResult = clientUpdateUserFormSchema.safeParse(dataForValidation);

            if (!validationResult.success) {
                const zodErrors = validationResult.error.flatten();
                const validationErrors: string[] = [];
    
                if (zodErrors.fieldErrors) {
                    Object.entries(zodErrors.fieldErrors).forEach(([field, messages]) => {
                        if (messages && Array.isArray(messages) && messages.length > 0) {
                            validationErrors.push(`${field}: ${messages[0]}`);
                        }
                    });
                }
    
                if (zodErrors.formErrors && zodErrors.formErrors.length > 0) {
                    validationErrors.push(...zodErrors.formErrors);
                }
    
                if (currentResidenciaDetails?.camposPersonalizados) {
                    for (const key in currentResidenciaDetails.camposPersonalizados) {
                        const campo = currentResidenciaDetails.camposPersonalizados[key];
                        if (campo.isActive && campo.necesitaValidacion && campo.regexValidacion) {
                            const regex = new RegExp(campo.regexValidacion);
                            if (dataForValidation.camposPersonalizados?.[key] && !regex.test(dataForValidation.camposPersonalizados[key])) {
                                validationErrors.push(`${campo.etiqueta || `Campo ${key}`} no es válido.`);
                            }
                        }
                    }
                }

                const title = validationErrors.length === 1
                    ? "Error de Validación"
                    : `Existen ${validationErrors.length} errores de validación`;
                const description = validationErrors.join("\n");
        
                toast({
                    title: title,
                    description: description,
                    variant: "destructive",
                    duration: 9000
                });
                setIsSaving(false);
                return;
            }

            const validatedData = validationResult.data;

            const profileUpdateData: Partial<UserProfile> = {
                nombre: validatedData.nombre?.trim() || undefined,
                apellido: validatedData.apellido?.trim() || undefined,
                nombreCorto: validatedData.nombreCorto?.trim() || undefined,
                fotoPerfil: null,
                tieneAutenticacion: true,
                roles: validatedData.roles ?? undefined,
                isActive: validatedData.isActive ?? undefined,
                residenciaId: validatedData.residenciaId,
                dietaId: validatedData.dietaId,
                fechaDeNacimiento: validatedData.fechaDeNacimiento,
                telefonoMovil: validatedData.telefonoMovil?.trim() || undefined,
                identificacion: validatedData.identificacion?.trim() || undefined,
                numeroDeRopa: validatedData.numeroDeRopa?.trim() || undefined,
                habitacion: validatedData.habitacion?.trim() || undefined,
                universidad: validatedData.universidad?.trim() || undefined,
                carrera: validatedData.carrera?.trim() || undefined,
                puedeTraerInvitados: validatedData.puedeTraerInvitados || undefined,
                asistentePermisos: validatedData.asistentePermisos || null,
                notificacionPreferencias: (validatedData.notificacionPreferencias as any) || undefined,
                centroCostoPorDefectoId: validatedData.centroCostoPorDefectoId,
                camposPersonalizados: validatedData.camposPersonalizados || {},
            };

            Object.keys(profileUpdateData).forEach(keyStr => {
                const key = keyStr as keyof Partial<UserProfile>;
                if (profileUpdateData[key] === undefined) {
                    delete profileUpdateData[key];
                }
            });
            
            const updatedDataForFunction = {
                userIdToUpdate: editingUserId,
                profileData: profileUpdateData,
                performedByUid: adminUserProfile?.id,
            };

            const result = await updateUserCallable(updatedDataForFunction);
            const resultData = result.data as { success: boolean; message?: string };

            if (resultData.success) {
                const originalUser = users.find(u => u.id === editingUserId)!;

                const updatedUserInState: UserProfile = {
                    ...originalUser,
                    nombre: validatedData.nombre!.trim(),
                    apellido: validatedData.apellido!.trim(),
                    email: formData.email || originalUser.email,
                    nombreCorto: validatedData.nombreCorto!.trim(),
                    fotoPerfil: null,
                    tieneAutenticacion: true,
                    roles: validatedData.roles!,
                    isActive: validatedData.isActive!,
                    residenciaId: finalResidenciaId || undefined,
                    dietaId: (validatedData.roles!.includes('residente') && validatedData.dietaId) ? validatedData.dietaId : undefined,
                    fechaDeNacimiento: validatedData.fechaDeNacimiento || undefined,
                    telefonoMovil: validatedData.telefonoMovil?.trim() || undefined,
                    identificacion: validatedData.identificacion?.trim() || undefined,
                    numeroDeRopa: validatedData.numeroDeRopa?.trim() || undefined,
                    habitacion: validatedData.habitacion?.trim() || undefined,
                    universidad: validatedData.universidad?.trim() || undefined,
                    carrera: validatedData.carrera?.trim() || undefined,
                    puedeTraerInvitados: validatedData.puedeTraerInvitados || 'no',
                    asistentePermisos: validatedData.asistentePermisos || null,
                    notificacionPreferencias: (validatedData.notificacionPreferencias as any) || undefined,
                    centroCostoPorDefectoId: validatedData.centroCostoPorDefectoId || undefined,
                    camposPersonalizados: validatedData.camposPersonalizados || {},
                    id: editingUserId,
                };

                setUsers(prevUsers => prevUsers.map(user =>
                    user.id === editingUserId ? updatedUserInState : user
                ).sort((a, b) => (a.apellido + a.nombre).localeCompare(b.apellido + b.nombre)));

                toast({ title: "Usuario Actualizado", description: `Usuario ${updatedUserInState.nombre} ${updatedUserInState.apellido} actualizado.` });
                handleCancelEdit();

            } else {
                throw new Error(resultData.message || 'La función de actualización de usuario falló.');
            }

        } catch (error: any) {
            const message = error.message || "Ocurrió un error al contactar el servicio de actualización.";
            let title = "Error al Actualizar";
            if (message.includes("permission denied")) title = "Error de Permisos";
            if (message.includes("not found")) title = "Error: Usuario No Encontrado";

            toast({ title: title, description: message, variant: "destructive" });
        } finally {
            setIsSaving(false);
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

    const formatSingleRoleName = (role: UserRole): string => {
        const roleMap: Record<UserRole, string> = {
            'residente': 'Residente', 'director': 'Director', 'admin': 'Admin', 'master': 'Master',
            'invitado': 'Invitado', 'asistente': 'Asistente', 'contador': 'Contador'
        };
        return roleMap[role] || role;
    };

    const isResidenciaConditionallyRequired = formData.roles.some(r => ['residente', 'director', 'asistente', 'auditor', 'admin'].includes(r));
    const isDietaConditionallyRequired = formData.roles.includes('residente');
    const isNumeroDeRopaConditionallyRequired = formData.roles.includes('residente');

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
                    <CardDescription>
                        {editingUserId ? 'Modifique los detalles del usuario seleccionado.' : 'Complete los detalles para añadir un nuevo usuario al sistema.'}
                    </CardDescription>
                </CardHeader>
                <form onSubmit={editingUserId ? handleUpdateUser : handleCreateUser}>
                    <CardContent className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                           <div className="space-y-1.5">
                                <Label htmlFor="nombre">Nombre *</Label>
                                <Input id="nombre" value={formData.nombre || ''} onChange={(e) => handleFormChange('nombre', e.target.value)} placeholder="Ej. Juan" disabled={isSaving} />
                            </div>
                             <div className="space-y-1.5">
                                <Label htmlFor="apellido">Apellido *</Label>
                                <Input id="apellido" value={formData.apellido || ''} onChange={(e) => handleFormChange('apellido', e.target.value)} placeholder="Ej. Pérez" disabled={isSaving} />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="nombreCorto">Nombre Corto *</Label>
                                <Input id="nombreCorto" value={formData.nombreCorto || ''} onChange={(e) => handleFormChange('nombreCorto', e.target.value)} placeholder="Ej. Juanito" disabled={isSaving} />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="fotoPerfil">Foto de Perfil</Label>
                            <div className="p-3 border rounded-md text-sm text-muted-foreground bg-gray-50 dark:bg-gray-800">
                                Foto de Perfil
                            </div>
                            <Input id="fotoPerfil" type="file" disabled />
                        </div>
                        <div>
                        <Label htmlFor="telefonoMovil">Teléfono Móvil (Opcional)</Label>
                        <Input
                            id="telefonoMovil"
                            name="telefonoMovil"
                            type="tel"
                            value={formData.telefonoMovil || ''}
                            onChange={(e) => handleFormChange('telefonoMovil', e.target.value)}
                            placeholder="Ej: +34600123456"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                            Incluir prefijo de país si es necesario (ej. +34).
                        </p>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="email">Email *</Label>
                            <Input id="email" type="email" value={formData.email || ''} onChange={(e) => handleFormChange('email', e.target.value)} placeholder="ej. juan.perez@email.com" disabled={isSaving || !!editingUserId} />
                            {editingUserId && <p className="text-xs text-muted-foreground pt-1">El email no se puede cambiar después de la creación.</p>}
                        </div>

                        {!editingUserId && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-1.5">
                                    <Label htmlFor="password">Contraseña Inicial *</Label>
                                    <Input id="password" type="password" value={formData.password || ''} onChange={(e) => handleFormChange('password', e.target.value)} placeholder="Mínimo 6 caracteres" disabled={isSaving} autoComplete="new-password" />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="confirmPassword">Confirmar Contraseña *</Label>
                                    <Input id="confirmPassword" type="password" value={formData.confirmPassword || ''} onChange={(e) => handleFormChange('confirmPassword', e.target.value)} placeholder="Repetir contraseña" disabled={isSaving} autoComplete="new-password"/>
                                </div>
                            </div>
                        )}

                        <div className="space-y-2">
                            <Label className="font-medium">Roles *</Label>
                            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-2 pt-1">
                                {availableRoles.map((role) => {
                                    const isMasterRole = role === 'master';
                                    const isAdminMaster = adminUserProfile?.roles?.includes('master');
                                    const isDisabled = isSaving || (isMasterRole && !isAdminMaster);
                                    return (
                                        <div key={role} className="flex items-center space-x-2">
                                            <Checkbox
                                                id={`role-${role}`}
                                                checked={(formData.roles || []).includes(role)}
                                                onCheckedChange={(checked) => handleRoleChange(role, !!checked)}
                                                disabled={isDisabled}
                                            />
                                            <Label
                                                htmlFor={`role-${role}`}
                                                className={`font-normal capitalize text-sm whitespace-nowrap ${isDisabled ? 'text-muted-foreground cursor-not-allowed' : ''}`}
                                            >
                                                {formatSingleRoleName(role)}
                                            </Label>
                                        </div>
                                    );
                                })}
                            </div>
                            {formData.roles.length === 0 && <p className="text-xs text-destructive mt-1">Seleccione al menos un rol.</p> }
                        </div>

                        {editingUserId && (
                            <div className="flex items-center space-x-2 pt-3">
                                <Switch id="isActive" checked={!!formData.isActive} onCheckedChange={(checked) => handleFormChange('isActive', checked)} disabled={isSaving} />
                                <Label htmlFor="isActive" className="text-sm">Usuario Activo</Label>
                            </div>
                        )}

                         <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                             <div className="space-y-1.5">
                                 <Label htmlFor="residencia">Residencia Asignada {isResidenciaConditionallyRequired ? '*' : ''}</Label>
                                <Select
                                    value={
                                        (adminUserProfile && !adminUserProfile.roles.includes('master') && adminUserProfile.residenciaId)
                                        ? adminUserProfile.residenciaId
                                        : formData.residenciaId || ''
                                    }
                                    onValueChange={(value) => {
                                        if (adminUserProfile?.roles.includes('master') || !adminUserProfile?.residenciaId) {
                                            handleSelectChange('residenciaId', value);
                                        }
                                    }}
                                    disabled={
                                        !!(
                                            isSaving ||
                                            !isResidenciaConditionallyRequired ||
                                            (adminUserProfile && !adminUserProfile.roles.includes('master') && !!adminUserProfile.residenciaId)
                                        )
                                    }
                                >
                                    <SelectTrigger id="residencia">
                                        <SelectValue placeholder={isResidenciaConditionallyRequired ? "Seleccione residencia..." : "N/A (Opcional)"} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {(adminUserProfile?.roles.includes('master') || !adminUserProfile?.residenciaId) ? (
                                            Object.entries(residences).map(([id, res]) => (
                                                <SelectItem key={id} value={id}>
                                                    {res.nombre}
                                                </SelectItem>
                                            ))
                                        ) : adminUserProfile?.residenciaId && residences[adminUserProfile.residenciaId] ? (
                                            <SelectItem key="admin-residencia" value={adminUserProfile.residenciaId}>
                                                {residences[adminUserProfile.residenciaId].nombre}
                                            </SelectItem>
                                        ) : (
                                            <SelectItem key="residences-loading-or-fallback" value="loading" disabled>
                                                {Object.keys(residences).length === 0 ? "Cargando residencias..." : "Error cargando residencia asignada..."}
                                            </SelectItem>
                                        )}
                                    </SelectContent>
                                </Select>
                                  {isResidenciaConditionallyRequired && !formData.residenciaId && <p className="text-xs text-destructive mt-1">Requerido para el rol seleccionado.</p>}
                             </div>
                             <div className="space-y-1.5">
                                 <Label htmlFor="dieta">Dieta Predet. {isDietaConditionallyRequired ? '*' : ''}</Label>
                                 <Select value={formData.dietaId || ''} onValueChange={(value) => handleSelectChange('dietaId', value)} disabled={isSaving || !isDietaConditionallyRequired} >
                                     <SelectTrigger id="dieta"><SelectValue placeholder={isDietaConditionallyRequired ? "Seleccione dieta..." : "N/A (Solo Residentes)"} /></SelectTrigger>
                                        <SelectContent>
                                            {formData.residenciaId ? (
                                                dietas
                                                    .filter(d => d.residenciaId === formData.residenciaId && d.isActive)
                                                    .map(d => (
                                                        <SelectItem key={d.id} value={d.id}>
                                                            {d.nombre} {d.isDefault ? '(Default)' : ''}
                                                        </SelectItem>
                                                    ))
                                            ) : (
                                                <SelectItem value="no-residencia" disabled>Seleccione una residencia primero</SelectItem>
                                            )}
                                            {formData.residenciaId && dietas.filter(d => d.residenciaId === formData.residenciaId && d.isActive).length === 0 && (
                                                <SelectItem value="no-dietas" disabled>No hay dietas activas para esta residencia</SelectItem>
                                            )}
                                            {!formData.residenciaId && Object.keys(residences).length > 0 && (
                                                <SelectItem value="placeholder-select-res" disabled>Seleccione residencia para ver dietas</SelectItem>
                                            )}
                                            {!hasAttemptedFetchDietas && !formData.residenciaId && (
                                                <SelectItem value="loading-all-dietas" disabled>Cargando lista de dietas...</SelectItem>
                                            )}
                                        </SelectContent>
                                 </Select>
                                 {isDietaConditionallyRequired && !formData.dietaId && <p className="text-xs text-destructive mt-1">Requerido para Residente.</p>}
                             </div>
                         </div>
                        
                        <Card className="p-4 mt-4 bg-slate-50 dark:bg-slate-800/30 border-dashed">
                            <h4 className="text-base font-medium mb-3 text-slate-700 dark:text-slate-300">Configuraciones Adicionales</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-1.5">
                                    <Label htmlFor="fechaDeNacimiento">Fecha de Nacimiento</Label>
                                    <Input id="fechaDeNacimiento" type="date" value={formData.fechaDeNacimiento || ''} onChange={(e) => handleFormChange('fechaDeNacimiento', e.target.value)} disabled={isSaving} />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="centroCostoPorDefectoId">
                                        {currentResidenciaDetails?.configuracionContabilidad?.nombreEtiquetaCentroCosto || 'Centro de Costo por Defecto'}
                                    </Label>
                                    <Select
                                        value={formData.centroCostoPorDefectoId || ''}
                                        onValueChange={(value) => handleFormChange('centroCostoPorDefectoId', value)}
                                        disabled={isSaving || isLoadingCentrosCosto || !formData.residenciaId}
                                    >
                                        <SelectTrigger id="centroCostoPorDefectoId">
                                            <SelectValue placeholder={
                                                !formData.residenciaId ? "Seleccione residencia primero" :
                                                isLoadingCentrosCosto ? "Cargando..." :
                                                (currentResidenciaDetails?.configuracionContabilidad?.nombreEtiquetaCentroCosto || 'Seleccione centro de costo...')
                                            } />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {!formData.residenciaId ? (
                                                <SelectItem value="no-residencia" disabled>Seleccione una residencia primero</SelectItem>
                                            ) : isLoadingCentrosCosto ? (
                                                <SelectItem value="loading" disabled>Cargando...</SelectItem>
                                            ) : centrosCostoList.length === 0 ? (
                                                <SelectItem value="no-options" disabled>
                                                    No hay {(currentResidenciaDetails?.configuracionContabilidad?.nombreEtiquetaCentroCosto || 'centros de costo').toLowerCase()} activos para esta residencia.
                                                </SelectItem>
                                            ) : (
                                                <>
                                                    <SelectItem value="">Ninguno</SelectItem> 
                                                    {centrosCostoList.map((cc) => (
                                                        <SelectItem key={cc.id} value={cc.id}>
                                                            {cc.nombre}
                                                        </SelectItem>
                                                    ))}
                                                </>
                                            )}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="puedeTraerInvitados">Puede Traer Invitados</Label>
                                    <Select value={formData.puedeTraerInvitados || 'no'} onValueChange={(value) => handleSelectChange('puedeTraerInvitados', value as 'no' | 'requiere_autorizacion' | 'si')} disabled={isSaving} >
                                        <SelectTrigger id="puedeTraerInvitados"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="no">No</SelectItem>
                                            <SelectItem value="requiere_autorizacion">Requiere Autorización</SelectItem>
                                            <SelectItem value="si">Sí</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </Card>
                        
                        <Card className="p-4 mt-4 bg-slate-50 dark:bg-slate-800/30 border-dashed">
                             <h4 className="text-base font-medium mb-3 text-slate-700 dark:text-slate-300">Campos Personalizados (Definidos en Residencia)</h4>
                             <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                {currentResidenciaDetails?.camposPersonalizados && Object.entries(currentResidenciaDetails.camposPersonalizados).map(([key, campo]) => {
                                    if (!campo.isActive) return null;
                                    return (
                                        <div key={key} className="space-y-1.5">
                                            <Label htmlFor={`campo-${key}`}>
                                                {campo.etiqueta || `Campo ${key}`}
                                                {campo.esObligatorio ? ' *' : ''}
                                            </Label>
                                            {campo.tamanoTexto === 'textArea' ? (
                                                <Textarea
                                                    id={`campo-${key}`}
                                                    value={formData.camposPersonalizados?.[key] || ''}
                                                    onChange={(e) => {
                                                        const newCampos = { ...formData.camposPersonalizados, [key]: e.target.value };
                                                        setFormData(prev => ({ ...prev, camposPersonalizados: newCampos }));
                                                    }}
                                                    placeholder={campo.etiqueta || `Valor para ${key}`}
                                                    disabled={isSaving || !formData.residenciaId}
                                                />
                                            ) : (
                                                <Input
                                                    id={`campo-${key}`}
                                                    value={formData.camposPersonalizados?.[key] || ''}
                                                    onChange={(e) => {
                                                        const newCampos = { ...formData.camposPersonalizados, [key]: e.target.value };
                                                        setFormData(prev => ({ ...prev, camposPersonalizados: newCampos }));
                                                    }}
                                                    placeholder={campo.etiqueta || `Valor para ${key}`}
                                                    disabled={isSaving || !formData.residenciaId}
                                                />
                                            )}
                                            {campo.necesitaValidacion && campo.regexValidacion && (
                                                <p className="text-xs text-muted-foreground mt-1">
                                                    Validación requerida. Formato esperado: {campo.regexValidacion}
                                                </p>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </Card>

                        <Card className="p-4 mt-4 bg-slate-50 dark:bg-slate-800/30 border-dashed">
                             <h4 className="text-base font-medium mb-3 text-slate-700 dark:text-slate-300">Detalles Adicionales (Opcional - Existentes)</h4>
                             <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                 <div className="space-y-1.5">
                                     <Label htmlFor="identificacion">Identificación</Label>
                                     <Input id="identificacion" value={formData.identificacion || ''} onChange={(e) => handleFormChange('identificacion', e.target.value)} placeholder="Ej. 12345678" disabled={isSaving} />
                                 </div>
                                 <div className="space-y-1.5">
                                     <Label htmlFor="habitacion">Habitación</Label>
                                     <Input id="habitacion" value={formData.habitacion || ''} onChange={(e) => handleFormChange('habitacion', e.target.value)} placeholder="Ej. 101A" disabled={isSaving} />
                                 </div>
                                  <div className="space-y-1.5">
                                     <Label htmlFor="numeroDeRopa">Nº Ropa {isNumeroDeRopaConditionallyRequired ? '*' : ''}</Label>
                                     <Input id="numeroDeRopa" value={formData.numeroDeRopa || ''} onChange={(e) => handleFormChange('numeroDeRopa', e.target.value)} placeholder="Ej. 55" disabled={isSaving} />
                                     {isNumeroDeRopaConditionallyRequired && !formData.numeroDeRopa?.trim() &&
                                         <p className="text-xs text-destructive mt-1">Requerido para Residentes.</p>}
                                 </div>
                                 <div className="space-y-1.5">
                                     <Label htmlFor="universidad">Universidad</Label>
                                     <Input id="universidad" value={formData.universidad || ''} onChange={(e) => handleFormChange('universidad', e.target.value)} placeholder="Ej. UNAH" disabled={isSaving} />
                                 </div>
                                 <div className="space-y-1.5">
                                     <Label htmlFor="carrera">Carrera</Label>
                                     <Input id="carrera" value={formData.carrera || ''} onChange={(e) => handleFormChange('carrera', e.target.value)} placeholder="Ej. Ing. Sistemas" disabled={isSaving} />
                                 </div>
                            </div>
                        </Card>

                    </CardContent>
                    <CardFooter className="border-t pt-6">
                        <Button type="submit" disabled={isSaving} className="mr-3">
                            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            {isSaving ? (editingUserId ? 'Guardando Cambios...' : 'Creando Usuario...') : (editingUserId ? 'Guardar Cambios' : 'Crear Usuario')}
                        </Button>
                        {editingUserId && (
                            <Button type="button" variant="outline" onClick={handleCancelEdit} disabled={isSaving}>
                                Cancelar Edición
                            </Button>
                        )}
                    </CardFooter>
                </form>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Usuarios Existentes</CardTitle>
                    <CardDescription>Lista de todos los usuarios registrados en el sistema.</CardDescription>
                </CardHeader>
                <CardContent>
                    {adminUserProfile?.roles?.includes('master') && Object.keys(residences).length > 0 && (
                        <div className="mb-4 p-1 max-w-sm">
                            <Label htmlFor="residenciaFilter" className="text-sm font-medium">Filtrar por Residencia:</Label>
                            <Select
                                value={selectedResidenciaFilter}
                                onValueChange={setSelectedResidenciaFilter}
                            >
                                <SelectTrigger id="residenciaFilter" className="mt-1">
                                    <SelectValue placeholder="Seleccionar residencia..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={ALL_RESIDENCIAS_FILTER_KEY}>
                                        Todas las Residencias
                                    </SelectItem>
                                    <SelectItem value={NO_RESIDENCIA_FILTER_KEY}>
                                        Usuarios Sin Residencia
                                    </SelectItem>
                                    {Object.entries(residences).map(([id, res]) => (
                                        <SelectItem key={id} value={id}>
                                            {res.nombre}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    {isLoadingUsers ? (
                        <div className="space-y-4">
                           <Skeleton className="h-12 w-full" />
                           <Skeleton className="h-12 w-full" />
                           <Skeleton className="h-12 w-full" />
                        </div>
                    ) : (
                        filteredUsers.length > 0 ? (
                            <div>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="py-3 px-4">Usuario</TableHead>
                                            <TableHead className="py-3 px-4">Info</TableHead>
                                            <TableHead className="text-right py-3 px-4">Acciones</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filteredUsers.map((user) => (
                                            <TableRow key={user.id} className={editingUserId === user.id ? 'bg-blue-50 dark:bg-blue-900/30' : ''}>
                                                <TableCell className="font-medium py-3 px-4">
                                                    <div className="break-words">{user.nombre} {user.apellido}</div>
                                                    <div className="text-xs text-muted-foreground break-all">({user.email})</div>
                                                </TableCell>
                                                <TableCell className="py-3 px-4">
                                                    <div className="capitalize text-xs break-words">
                                                        {(user.roles || []).map(formatSingleRoleName).join(', ')}
                                                    </div>
                                                    <div className="mt-1">
                                                        <Badge variant={user.isActive ? 'default' : 'outline'} className={`text-xs ${user.isActive ? 'bg-green-100 text-green-700 border-green-300 dark:bg-green-700/30 dark:text-green-300 dark:border-green-700' : 'bg-red-100 text-red-700 border-red-300 dark:bg-red-700/30 dark:text-red-300 dark:border-red-700'}`}>
                                                            {user.isActive ? 'Activo' : 'Inactivo'}
                                                        </Badge>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right py-3 px-4">
                                                    <div className="flex flex-col space-y-1 items-end sm:flex-row sm:space-y-0 sm:space-x-2 sm:items-center">
                                                        <Button variant="outline" size="sm" onClick={() => handleEditUser(user.id)} disabled={isSaving || (!!editingUserId && editingUserId !== user.id)} className="w-full sm:w-auto">Editar</Button>
                                                        <Button variant="destructive" size="sm" onClick={() => handleDeleteUser(user.id)} disabled={isSaving || !!editingUserId} className="w-full sm:w-auto">Eliminar</Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        ) : users.length > 0 && filteredUsers.length === 0 ? (
                            <p className="text-muted-foreground text-center py-8">
                                No hay usuarios que coincidan con el filtro seleccionado.
                            </p>
                        ) : (
                            <p className="text-muted-foreground text-center py-8">
                                No hay usuarios registrados en el sistema.
                            </p>
                        )
                    )}
                </CardContent>
            </Card>

            <AlertDialog open={isConfirmingDelete} onOpenChange={setIsConfirmingDelete}>
                 <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>¿Está realmente seguro?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Esta acción eliminará el perfil de Firestore del usuario <span className="font-semibold">{getUserToDeleteName()}</span>.
                            La cuenta de autenticación de Firebase asociada <strong className="text-amber-600 dark:text-amber-400">NO</strong> se eliminará automáticamente y podría requerir una limpieza manual o mediante una función de backend.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setUserToDeleteId(null)}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={confirmDeleteUser}
                            className={buttonVariants({ variant: "destructive" })}
                        >Confirmar Eliminación de Perfil</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

export default UserManagementPage;