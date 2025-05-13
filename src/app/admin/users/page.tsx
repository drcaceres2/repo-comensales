// admin/users/page.tsx
'use client'; // Make it a client component

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, AlertCircle } from 'lucide-react';

// UI Components (Keep existing imports)
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
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea'; // ADDED: Textarea import

// --- Firebase & New Auth Hook Imports ---\nimport { useAuthState } from 'react-firebase-hooks/auth';
import { User } from "firebase/auth";
import { useAuthState } from 'react-firebase-hooks/auth'; // Import the new hook
import { getFunctions, httpsCallable } from "firebase/functions";

// MODIFIED: Added query and where
import { doc, getDoc, getDocs, Timestamp, addDoc, collection, setDoc, updateDoc, deleteDoc, query, where } from 'firebase/firestore';
import { app, auth, db } from '@/lib/firebase';
import { formatTimestampForInput } from '@/lib/utils'

// Model Imports
// MODIFIED: Added Residencia and CentroCosto
import { 
    UserProfile, 
    UserRole, 
    ResidenciaId, 
    DietaId, 
    Dieta, 
    ModoEleccionUsuario, 
    CentroCostoId, 
    Residencia, 
    CentroCosto,
    AsistentePermisos // ADDED
} from '@/../../shared/models/types';
import { ZodUndefined } from 'zod';

export default function UserManagementPage(): JSX.Element | null {
    const ALL_RESIDENCIAS_FILTER_KEY = 'all_residencias';
    const NO_RESIDENCIA_FILTER_KEY = 'no_residencia_assigned';

    const functions = getFunctions(app); // Assuming 'app' is your initialized Firebase app instance from '@/lib/firebase'
    const functionsInstance = getFunctions(auth.app); // More reliable way if auth is initialized

    const createUserCallable = httpsCallable(functionsInstance, 'createUser');
    const updateUserCallable = httpsCallable(functionsInstance, 'updateUser');
    const deleteUserCallable = httpsCallable(functionsInstance, 'deleteUser');
    // Define a callable for logging (alternative to logging within each function)
    const logActionCallable = httpsCallable(functionsInstance, 'logAction');

    type UserFormData = Partial<Omit<UserProfile, 'id' | 'roles' | 'fechaDeNacimiento' | 'asistentePermisos'>> & { // Exclude asistentePermisos from Partial
        roles: UserRole[];
        residenciaId?: ResidenciaId | '';
        dietaId?: DietaId | '';
        numeroDeRopa?: string;
        habitacion?: string;
        universidad?: string;
        carrera?: string;
        dni?: string;
        isActive?: boolean;
        password?: string;
        confirmPassword?: string;
        telefonoMovil?: string;
        fechaDeNacimiento?: string; 
        valorCampoPersonalizado1?: string;
        valorCampoPersonalizado2?: string;
        valorCampoPersonalizado3?: string;
        asistentePermisos?: Partial<AsistentePermisos>;
    };

    const router = useRouter();
    const { toast } = useToast();

    const [authUser, authFirebaseLoading, authFirebaseError] = useAuthState(auth);
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
            email: '',
            isActive: true,
            roles: [], // Corrected: Was undefined, now an empty array
            residenciaId: initialResidenciaId,
            dietaId: '',
            numeroDeRopa: '',
            habitacion: '',
            universidad: '',
            carrera: '',
            dni: '',
            password: '',      // Added for completeness, was missing from your snippet but likely in original
            confirmPassword: '',// Added for completeness
            telefonoMovil: '',
            modoEleccion: undefined,
            fechaDeNacimiento: '', // Corrected: Was null, now an empty string for consistency
            centroCostoPorDefectoId: '', // Match handleCancelEdit
            puedeTraerInvitados: 'no',
            valorCampoPersonalizado1: '', // Match handleCancelEdit
            valorCampoPersonalizado2: '', // Match handleCancelEdit
            valorCampoPersonalizado3: '', // Match handleCancelEdit
            asistentePermisos: undefined,
            notificacionPreferencias: undefined, // Assuming this is part of UserProfile and thus UserFormData
        };
    });

    const [isSaving, setIsSaving] = useState(false);
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [isLoadingUsers, setIsLoadingUsers] = useState(true);
    const [editingUserId, setEditingUserId] = useState<string | null>(null);
    const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
    const [userToDeleteId, setUserToDeleteId] = useState<string | null>(null);
    const [selectedResidenciaFilter, setSelectedResidenciaFilter] = useState<string>(ALL_RESIDENCIAS_FILTER_KEY);

    const availableRoles: UserRole[] = ['residente', 'director', 'admin', 'master', 'invitado', 'asistente', 'auditor'];
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

    const fetchResidences = useCallback(async () => {
        console.log("Fetching residences from Firestore...");
        try {
            const residencesCol = collection(db, "residencias");
            const querySnapshot = await getDocs(residencesCol);
            const residencesData: Record<ResidenciaId, { nombre: string }> = {};
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                if (data.nombre) {
                    residencesData[doc.id] = { nombre: data.nombre };
                } else {
                    console.warn(`Residence document ${doc.id} is missing the 'nombre' field.`);
                }
            });
            console.log("Fetched residences:", residencesData);
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
        console.log("Fetching all dietas from Firestore...");
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
            console.log("Fetched all dietas:", fetchedDietas);
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

    // ADDED: Fetch Full Residencia Details
    const fetchFullResidenciaDetails = useCallback(async (residenciaId: ResidenciaId) => {
        if (!residenciaId) {
            setCurrentResidenciaDetails(null);
            return;
        }
        console.log(`Fetching full details for residencia ${residenciaId}...`);
        setIsLoadingResidenciaDetails(true);
        try {
            const residenciaDocRef = doc(db, "residencias", residenciaId);
            const docSnap = await getDoc(residenciaDocRef);
            if (docSnap.exists()) {
                setCurrentResidenciaDetails({ id: docSnap.id, ...docSnap.data() } as Residencia);
                console.log("Fetched residencia details:", { id: docSnap.id, ...docSnap.data() });
            } else {
                console.warn(`Residencia document ${residenciaId} not found.`);
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

    // ADDED: Fetch Centros de Costo for Residencia
    const fetchCentrosCostoForResidencia = useCallback(async (residenciaId: ResidenciaId) => {
        if (!residenciaId) {
            setCentrosCostoList([]);
            return;
        }
        console.log(`Fetching centros de costo for residencia ${residenciaId}...`);
        setIsLoadingCentrosCosto(true);
        try {
            const ccCol = collection(db, "centrosCosto");
            // Query for active centros de costo belonging to the specific residencia
            const q = query(ccCol, where("residenciaId", "==", residenciaId), where("isActive", "==", true));
            const querySnapshot = await getDocs(q);
            const fetchedCCs: CentroCosto[] = [];
            querySnapshot.forEach((doc) => {
                fetchedCCs.push({ id: doc.id, ...doc.data() } as CentroCosto);
            });
            setCentrosCostoList(fetchedCCs.sort((a, b) => a.nombre.localeCompare(b.nombre)));
            console.log("Fetched centros de costo:", fetchedCCs);
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
                // Ensure not to add the asistente themselves if they are also a residente (edge case)
                if (editingUserId !== doc.id) { // Or if creating, this check is not directly applicable
                    fetchedResidentes.push({ id: doc.id, ...doc.data() } as UserProfile);
                } else if (!editingUserId && formData.email !== doc.data().email) { // for creation, don't list self if email known
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
    }, [toast, editingUserId, formData.email]); // Added editingUserId and formData.email


    const fetchUsersToManage = useCallback(async () => {
        console.log("Fetching users to manage from Firestore...");
        setIsLoadingUsers(true);
        try {
            const usersCol = collection(db, "users");
            const querySnapshot = await getDocs(usersCol);
            const usersData: UserProfile[] = [];
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                usersData.push({
                    id: doc.id,
                    nombre: data.nombre || '',
                    apellido: data.apellido || '',
                    email: data.email || '',
                    roles: data.roles || [],
                    isActive: data.isActive === undefined ? true : data.isActive,
                    residenciaId: data.residenciaId || undefined, 
                    dietaId: data.dietaId || undefined,
                    numeroDeRopa: data.numeroDeRopa || undefined,
                    habitacion: data.habitacion || undefined,
                    universidad: data.universidad || undefined,
                    carrera: data.carrera || undefined,
                    dni: data.dni || undefined,
                    modoEleccion: data.modoEleccion || undefined,
                    fechaDeNacimiento: data.fechaDeNacimiento || undefined, 
                    centroCostoPorDefectoId: data.centroCostoPorDefectoId || undefined,
                    puedeTraerInvitados: data.puedeTraerInvitados || 'no',
                    valorCampoPersonalizado1: data.valorCampoPersonalizado1 || undefined,
                    valorCampoPersonalizado2: data.valorCampoPersonalizado2 || undefined,
                    valorCampoPersonalizado3: data.valorCampoPersonalizado3 || undefined,
                    telefonoMovil: data.telefonoMovil || undefined,
                    asistentePermisos: data.asistentePermisos || undefined,
                    notificacionPreferencias: data.notificacionPreferencias || undefined,
                });
            });
            console.log("Fetched users to manage:", usersData);
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
            console.log("Auth state loading (useAuthState)...");
            setAdminProfileLoading(true);
            setIsAuthorized(false);
            return;
        }

        if (authFirebaseError) {
            console.error("Firebase Auth Error (useAuthState):", authFirebaseError);
            toast({ title: "Error de Autenticación", description: authFirebaseError.message, variant: "destructive" });
            setAdminProfileLoading(false);
            setAdminUserProfile(null);
            setAdminProfileError(authFirebaseError.message);
            setIsAuthorized(false);
            router.replace('/');
            return;
        }

        if (!authUser) {
            console.log("No Firebase user (authUser is null). Redirecting to login.");
            setAdminProfileLoading(false);
            setAdminUserProfile(null);
            setAdminProfileError(null); 
            setIsAuthorized(false);
            router.replace('/');
            return;
        }
        console.log("Admin user authenticated via Firebase (UID:", authUser.uid,"). Fetching admin's profile...");
        setAdminProfileLoading(true);
        setAdminProfileError(null);
        const adminDocRef = doc(db, "users", authUser.uid);

        getDoc(adminDocRef)
            .then((docSnap) => {
                if (docSnap.exists()) {
                    setAdminUserProfile(docSnap.data() as UserProfile);
                    console.log("Admin's profile fetched:", docSnap.data());
                } else {
                    console.error("Admin's profile not found in Firestore for UID:", authUser.uid);
                    setAdminUserProfile(null);
                    setAdminProfileError("Perfil de administrador no encontrado. No estás autorizado.");
                    toast({ title: "Error de Perfil", description: "No se encontró tu perfil de administrador.", variant: "destructive" });
                }
            })
            .catch((error) => {
                console.error("Error fetching admin's profile:", error);
                setAdminUserProfile(null);
                setAdminProfileError(`Error al cargar tu perfil: ${error.message}`);
                toast({ title: "Error Cargando Perfil Administrador", description: `No se pudo cargar tu perfil: ${error.message}`, variant: "destructive" });
            })
            .finally(() => {
                setAdminProfileLoading(false);
                console.log("Admin profile fetch attempt finished.");
            });
    }, [authUser, authFirebaseLoading, authFirebaseError, router, toast]);

    useEffect(() => {
        if (adminProfileLoading) {
            setIsAuthorized(false);
            return;
        }
        if (adminProfileError || !adminUserProfile) {
            console.log("Admin authorization check failed: Profile error or profile missing.");
            setIsAuthorized(false);
            return;
        }
        const roles = adminUserProfile.roles || [];
        const isAdminAuthorized = roles.includes('admin') || roles.includes('master');

        if (isAdminAuthorized) {
            console.log("Admin user is authorized. Proceeding with fetching page data.");
            setIsAuthorized(true);
            if (adminUserProfile.roles.includes('master')) {
                setSelectedResidenciaFilter(ALL_RESIDENCIAS_FILTER_KEY);
            } else if (adminUserProfile.roles.includes('admin') && adminUserProfile.residenciaId) {
                setSelectedResidenciaFilter(adminUserProfile.residenciaId);
                 // ADDED: Fetch details for admin's specific residencia if not master
                if (adminUserProfile.residenciaId) {
                    fetchFullResidenciaDetails(adminUserProfile.residenciaId);
                    fetchCentrosCostoForResidencia(adminUserProfile.residenciaId);
                }
            } else {
                setSelectedResidenciaFilter(NO_RESIDENCIA_FILTER_KEY);
                 setCurrentResidenciaDetails(null); // Clear if no specific residencia tied to admin
                 setCentrosCostoList([]);
            }
            if (!hasAttemptedFetchResidences) fetchResidences();
            if (!hasAttemptedFetchDietas) fetchDietas();
            if (!hasAttemptedFetchUsers) fetchUsersToManage();
        } else {
            console.warn("Admin user does not have admin/master role. Access denied.");
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
        fetchFullResidenciaDetails, // ADDED
        fetchCentrosCostoForResidencia // ADDED
    ]);

    useEffect(() => {
        if (formData.residenciaId && formData.residenciaId !== currentResidenciaDetails?.id) {
            fetchFullResidenciaDetails(formData.residenciaId);
            fetchCentrosCostoForResidencia(formData.residenciaId);
            fetchResidentesForResidencia(formData.residenciaId); // ADDED
        } else if (!formData.residenciaId) {
            setCurrentResidenciaDetails(null);
            setCentrosCostoList([]);
            setResidentesForAsistente([]); // ADDED: Clear if no residencia
        }
        // If roles change and 'asistente' is now selected, and residenciaId is already set, fetch residentes
        else if (formData.residenciaId && formData.roles?.includes('asistente') && residentesForAsistente.length === 0){
            fetchResidentesForResidencia(formData.residenciaId);
        }
    }, [formData.residenciaId, formData.roles, fetchFullResidenciaDetails, fetchCentrosCostoForResidencia, fetchResidentesForResidencia, currentResidenciaDetails?.id, residentesForAsistente.length]); // Added formData.roles, fetchResidentesForResidencia, residentesForAsistente.length

    const handleFormChange = (field: keyof Omit<UserFormData, 'roles'>, value: string | boolean | ModoEleccionUsuario | undefined) => {
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
            const residenciaRequiredForRole = updatedRoles.some(r => ['residente', 'director', 'asistente', 'auditor', 'admin'].includes(r));
            const residenciaId = residenciaRequiredForRole ? prev.residenciaId : '';

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

            // MODIFIED: Handle asistentePermisos based on 'asistente' role with new structure
            let updatedAsistentePermisos = prev.asistentePermisos;
            if (role === 'asistente') {
                if (checked) {
                    // Initialize with new defaults if 'asistente' role is added
                    updatedAsistentePermisos = {
                        usuariosAsistidos: [], // Changed from elecc_uids
                        gestionActividades: 'Ninguna', // New default
                        gestionInvitados: 'Ninguno',   // New default
                        gestionRecordatorios: 'Ninguno' // New default
                    };
                } else {
                    // Clear if 'asistente' role is removed
                    updatedAsistentePermisos = undefined;
                }
            }
            
            // Ensure if 'asistente' is not in updatedRoles at all, permissions are cleared
            if (!updatedRoles.includes('asistente') && updatedAsistentePermisos !== undefined) { // Check against undefined
                 updatedAsistentePermisos = undefined;
            }

            return { ...prev, roles: updatedRoles, dietaId, residenciaId, asistentePermisos: updatedAsistentePermisos };
        });
    };

    const handleSelectChange = (field: 'residenciaId' | 'dietaId' | 'modoEleccion' | 'puedeTraerInvitados' | 'centroCostoPorDefectoId', value: string) => {
        setFormData(prev => {
            const updatedFormData = { ...prev, [field]: value };

            if (field === 'residenciaId') {
                updatedFormData.dietaId = ''; // Clear dieta on residencia change
                updatedFormData.centroCostoPorDefectoId = ''; // Clear Centro de Costo
                // ADDED: Clear custom field values as they depend on the residencia
                updatedFormData.valorCampoPersonalizado1 = '';
                updatedFormData.valorCampoPersonalizado2 = '';
                updatedFormData.valorCampoPersonalizado3 = '';

                if (updatedFormData.roles.includes('residente') && value) { // value is the new residenciaId
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
        setIsSaving(true);

        // Ensure non-master admin uses their own residenciaId if required
        if (adminUserProfile && !adminUserProfile.roles.includes('master') && adminUserProfile.residenciaId && isResidenciaConditionallyRequired) {
            if (formData.residenciaId !== adminUserProfile.residenciaId) {
                console.warn("Correcting residenciaId for non-master admin during creation.");
                // Use a temporary variable to avoid direct state mutation before validation if needed,
                // or ensure validation uses the admin's residenciaId directly.
                // For simplicity here, we'll assume validation will catch if it was somehow empty.
                // A direct assignment before validation might be cleaner:
                const correctedFormData = { ...formData, residenciaId: adminUserProfile.residenciaId };
                // Now proceed with validation using correctedFormData

                const validationErrors: string[] = [];

                const roles = correctedFormData.roles || [];
                const generalPhoneRegex = /^\+?[0-9\s-]{7,15}$/;
                // Regex para Honduras:
                const hondurasPhoneRegex = /^(\+?504)?[0-9]{3}[ -]?[0-9]{4}[ -]?[0-9]{1}$/;

                const telefono = correctedFormData.telefonoMovil?.trim();
                if (!correctedFormData.password || !correctedFormData.confirmPassword) {
                    validationErrors.push("Contraseña inicial y confirmación son requeridas.");
                }
                if (correctedFormData.password && correctedFormData.password.length < 6) { // Added check for correctedFormData.password existence
                    validationErrors.push("La contraseña debe tener al menos 6 caracteres.");
                }
                if (correctedFormData.password && correctedFormData.confirmPassword && correctedFormData.password !== correctedFormData.confirmPassword) { // Added checks for existence
                    validationErrors.push("Las contraseñas no coinciden.");
                }
                if (!correctedFormData.nombre?.trim()) {
                    validationErrors.push("Nombre es requerido.");
                }
                if (!correctedFormData.apellido?.trim()) {
                validationErrors.push("Apellido es requerido.");
                }
                if (!correctedFormData.email?.trim()) {
                    validationErrors.push("Email es requerido.");
                }
                if (telefono && telefono.length > 0) {
                    if (
                        (telefono.startsWith("+504") || telefono.startsWith("504"))
                            ? !hondurasPhoneRegex.test(telefono)
                            : !generalPhoneRegex.test(telefono)
                    ) {
                        validationErrors.push("Formato de teléfono no válido para el país ingresado o general.");
                    }
                }
                if (roles.length === 0) {
                    validationErrors.push("Al menos un Rol es requerido.");
                }

                if (
                    roles.some(r => ['residente', 'director', 'asistente', 'auditor', 'admin'].includes(r)) &&
                    !correctedFormData.residenciaId
                ) {
                    validationErrors.push("Residencia Asignada es requerida para el rol seleccionado.");
                }

                if (roles.includes('residente') && !correctedFormData.dietaId) {
                    validationErrors.push("Dieta Predeterminada es requerida para Residentes.");
                } 
                if (roles.includes('residente') && !correctedFormData.numeroDeRopa?.trim()) {
                    validationErrors.push("Número de Ropa es requerido para Residentes.");
                }

                // Custom Field Validations
                if (currentResidenciaDetails?.campoPersonalizado1_isActive && currentResidenciaDetails?.campoPersonalizado1_necesitaValidacion && currentResidenciaDetails?.campoPersonalizado1_regexValidacion) {
                    const regex = new RegExp(currentResidenciaDetails.campoPersonalizado1_regexValidacion);
                    if (correctedFormData.valorCampoPersonalizado1 && !regex.test(correctedFormData.valorCampoPersonalizado1)) {
                        validationErrors.push(`${currentResidenciaDetails.campoPersonalizado1_etiqueta || 'Valor Personalizado 1'} no es válido.`);
                    }
                }
                if (currentResidenciaDetails?.campoPersonalizado2_isActive && currentResidenciaDetails?.campoPersonalizado2_necesitaValidacion && currentResidenciaDetails?.campoPersonalizado2_regexValidacion) {
                    const regex = new RegExp(currentResidenciaDetails.campoPersonalizado2_regexValidacion);
                    if (correctedFormData.valorCampoPersonalizado2 && !regex.test(correctedFormData.valorCampoPersonalizado2)) {
                        validationErrors.push(`${currentResidenciaDetails.campoPersonalizado2_etiqueta || 'Valor Personalizado 2'} no es válido.`);
                    }
                }
                if (currentResidenciaDetails?.campoPersonalizado3_isActive && currentResidenciaDetails?.campoPersonalizado3_necesitaValidacion && currentResidenciaDetails?.campoPersonalizado3_regexValidacion) {
                    const regex = new RegExp(currentResidenciaDetails.campoPersonalizado3_regexValidacion);
                    if (correctedFormData.valorCampoPersonalizado3 && !regex.test(correctedFormData.valorCampoPersonalizado3)) {
                        validationErrors.push(`${currentResidenciaDetails.campoPersonalizado3_etiqueta || 'Valor Personalizado 3'} no es válido.`);
                    }
                }
                
                // AsistentePermisos Validation
                if (roles.includes('asistente')) {
                    if (!correctedFormData.asistentePermisos) { // Should be initialized by handleRoleChange, but good check
                        validationErrors.push("Faltan los permisos de asistente. Por favor, re-seleccione el rol.");
                    } else {
                        const permisos = correctedFormData.asistentePermisos;
                        const noUsuariosAsistidos = !permisos.usuariosAsistidos || permisos.usuariosAsistidos.length === 0;
                        const noGestionActividades = permisos.gestionActividades === 'Ninguna';
                        const noGestionInvitados = permisos.gestionInvitados === 'Ninguno';
                        const noGestionRecordatorios = permisos.gestionRecordatorios === 'Ninguno';

                        if (noUsuariosAsistidos && noGestionActividades && noGestionInvitados && noGestionRecordatorios) {
                            validationErrors.push("Un asistente debe tener al menos un usuario asignado o algún permiso de gestión (actividades, invitados o recordatorios).");
                        }
                    }
                }        

                if (validationErrors.length > 0) {
                    const title = validationErrors.length === 1
                        ? "Error de Validación"
                        : `Existen ${validationErrors.length} errores de validación`;
                    const description = validationErrors.join("\\n"); // Use double backslash for newline in string literal
                
                    toast({
                        title: title,
                        description: description,
                        variant: "destructive",
                        duration: 9000 // Optional: Increase duration for multiple errors
                    });
                    setIsSaving(false);
                    return;
                }
            }
        }
        // --- The rest of the validation logic ---
        // Make sure to use the potentially corrected residenciaId in the profile data later:
        const finalResidenciaId = (adminUserProfile && !adminUserProfile.roles.includes('master') && adminUserProfile.residenciaId)
                                ? adminUserProfile.residenciaId
                                : formData.residenciaId;

        let newUserAuthUid: string | null = null;

        // (Keep validation logic as is, possibly adjusting residenciaId as per Step 2.3)

        try {
            console.log(`Calling createUser Cloud Function for ${formData.email}...`);

                // --- Construct the profile data payload ---
                const profileData: Omit<UserProfile, 'id'> = {
                    nombre: formData.nombre ?? '',
                    apellido: formData.apellido ?? '',
                    email: formData.email ?? '', // Include email in profile too
                    residenciaId: finalResidenciaId, // Use selected or admin's residencia
                    roles: formData.roles!,
                    isActive: formData.isActive ?? true,
                    modoEleccion: formData.modoEleccion ?? undefined, // Fixed for optional type
                    fechaDeNacimiento: formData.fechaDeNacimiento ? formatTimestampForInput(formData.fechaDeNacimiento) : null, // Fixed: Use helper for YYYY-MM-DD string or null
                    centroCostoPorDefectoId: formData.centroCostoPorDefectoId ?? '',
                    telefonoMovil: formData.telefonoMovil ?? '',
                    dietaId: formData.dietaId ?? undefined, // Fixed for optional type
                    numeroDeRopa: formData.numeroDeRopa ?? undefined, // Fixed for optional type
                    habitacion: formData.habitacion ?? '',
                    universidad: formData.universidad ?? '',
                    carrera: formData.carrera ?? '',
                    dni: formData.dni ?? '',
                    puedeTraerInvitados: formData.puedeTraerInvitados ?? 'no',
                    notificacionPreferencias: formData.notificacionPreferencias, // If you have form fields for these
                    valorCampoPersonalizado1: formData.valorCampoPersonalizado1 ?? '',
                    valorCampoPersonalizado2: formData.valorCampoPersonalizado2 ?? '',
                    valorCampoPersonalizado3: formData.valorCampoPersonalizado3 ?? '',
                    // Ensure all required fields from your UserProfile are included
                    // Omit 'id' as Firestore/Function will generate it
                };
            // Prepare data for the Cloud Function
            const userDataForFunction = {
                email: formData.email!,
                password: formData.password!, // Send password to function
                profileData,
                performedByUid: adminUserProfile?.id, // Send admin UID for logging
            };
            // Remove undefined keys from profileData before sending
            Object.keys(userDataForFunction.profileData).forEach(key => (userDataForFunction.profileData as any)[key] === undefined && delete (userDataForFunction.profileData as any)[key]);

            // Call the function
            const result = await createUserCallable(userDataForFunction);
            const resultData = result.data as { success: boolean; userId?: string; message?: string }; // Define expected response structure

            if (resultData.success && resultData.userId) {
                console.log(`Cloud Function created user successfully with UID: ${resultData.userId}`);

                // Add the new user to the local state (using data sent + returned ID)
                const newUserForUI: UserProfile = {
                    ...(userDataForFunction.profileData as Omit<UserProfile, 'id' | 'fechaDeNacimiento'>), // Cast carefully
                    id: resultData.userId,
                    // Reconstruct timestamp if needed, or adjust UI to handle string dates initially
                    fechaDeNacimiento: formatTimestampForInput(formData.fechaDeNacimiento),
                };
                setUsers(prevUsers => [newUserForUI, ...prevUsers].sort((a, b) => (a.apellido + a.nombre).localeCompare(b.apellido + b.nombre)));

                toast({ title: "Usuario Creado", description: `Usuario ${newUserForUI.nombre} ${newUserForUI.apellido} creado.` });
                // Reset form
                handleCancelEdit(); // Or your specific reset logic

            } else {
                throw new Error(resultData.message || 'La función de creación de usuario falló.');
            }

        } catch (error: any) {
            console.error("Error calling createUser function or processing result:", error);
            // Use error.message if available from the function's throw
            const message = error.message || "Ocurrió un error al contactar el servicio de creación.";
            let title = "Error al Crear Usuario";
            // You might check error.code if the callable function returns specific codes
            if (message.includes("already exists")) title = "Error de Duplicado";
            if (message.includes("permission denied")) title = "Error de Permisos";

            toast({ title: title, description: message, variant: "destructive" });
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
    console.log("Editing user:", userToEdit);
    setEditingUserId(userId);
    
    let permisosParaForm: Partial<AsistentePermisos> | undefined = undefined;
    if (userToEdit.roles?.includes('asistente')) {
        if (userToEdit.asistentePermisos) {
            permisosParaForm = {
                usuariosAsistidos: userToEdit.asistentePermisos.usuariosAsistidos || [],
                gestionActividades: userToEdit.asistentePermisos.gestionActividades || 'Ninguna',
                gestionInvitados: userToEdit.asistentePermisos.gestionInvitados || 'Ninguno',
                gestionRecordatorios: userToEdit.asistentePermisos.gestionRecordatorios || 'Ninguno',
            };
        } else { // Role is 'asistente' but no permissions object exists, initialize with defaults
            permisosParaForm = {
                usuariosAsistidos: [],
                gestionActividades: 'Ninguna',
                gestionInvitados: 'Ninguno',
                gestionRecordatorios: 'Ninguno',
            };
        }
    }

    setFormData({
        nombre: userToEdit.nombre || '',
        apellido: userToEdit.apellido || '',
        email: userToEdit.email || '',
        isActive: userToEdit.isActive === undefined ? true : userToEdit.isActive,
        roles: userToEdit.roles || [],
        residenciaId: userToEdit.residenciaId || '',
        dietaId: userToEdit.dietaId || '',
        numeroDeRopa: userToEdit.numeroDeRopa || '',
        habitacion: userToEdit.habitacion || '',
        universidad: userToEdit.universidad || '',
        carrera: userToEdit.carrera || '',
        dni: userToEdit.dni || '',
        password: '', confirmPassword: '', 
        telefonoMovil: userToEdit.telefonoMovil || '',
        modoEleccion: userToEdit.modoEleccion || undefined,
        fechaDeNacimiento: userToEdit.fechaDeNacimiento ? formatTimestampForInput(userToEdit.fechaDeNacimiento) : undefined,
        centroCostoPorDefectoId: userToEdit.centroCostoPorDefectoId || '',
        puedeTraerInvitados: userToEdit.puedeTraerInvitados || 'no',
        valorCampoPersonalizado1: userToEdit.valorCampoPersonalizado1 || '',
        valorCampoPersonalizado2: userToEdit.valorCampoPersonalizado2 || '',
        valorCampoPersonalizado3: userToEdit.valorCampoPersonalizado3 || '',
        asistentePermisos: permisosParaForm, // MODIFIED
    });
    };

    const handleCancelEdit = () => {
        setEditingUserId(null);
        setFormData({
        nombre: '', apellido: '', email: '', isActive: true, roles: [], residenciaId: '', dietaId: '',
        numeroDeRopa: '', habitacion: '', universidad: '', carrera: '', dni: '',
        password: '', confirmPassword: '', telefonoMovil: '',
        modoEleccion: undefined,
        fechaDeNacimiento: '',
        centroCostoPorDefectoId: '',
        puedeTraerInvitados: 'no',
        valorCampoPersonalizado1: '',
        valorCampoPersonalizado2: '',
        valorCampoPersonalizado3: '',
        asistentePermisos: undefined // ADDED/MODIFIED
    });
        console.log("Cancelled edit.");
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
        console.log("Confirmed delete for user ID:", userToDeleteId);
        try {
            // Call the function, passing the user ID
            const result = await deleteUserCallable({ userId: userToDeleteId });
            const resultData = result.data as { success: boolean; message?: string };

            if (resultData.success) {
                console.log(`Cloud Function deleted user ${userToDeleteId} successfully (Auth & Firestore).`);

                // Remove user from local state
                setUsers(prevUsers => prevUsers.filter(user => user.id !== userToDeleteId));
                toast({ title: "Usuario Eliminado", description: `El usuario ${userToDeleteInfo?.nombre || userToDeleteId} ha sido eliminado.` });

            } else {
                throw new Error(resultData.message || 'La función de eliminación de usuario falló.');
            }

        } catch (error: any) {
            console.error("Error calling deleteUser function or processing result:", error);
            const message = error.message || "Ocurrió un error al contactar el servicio de eliminación.";
            let title = "Error al Eliminar";
            if (message.includes("permission denied")) title = "Error de Permisos";
            if (message.includes("not found")) title = "Error: Usuario No Encontrado";
            toast({ title: title, description: message, variant: "destructive" });
        } finally {
            setIsConfirmingDelete(false);
            setUserToDeleteId(null);
            // setIsDeleting(false); // Reset loading state if added
        }
    };

    const handleUpdateUser = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!editingUserId) return;
        setIsSaving(true);

        let finalResidenciaId = formData.residenciaId; // Start with form data
        if (adminUserProfile && !adminUserProfile.roles.includes('master') && adminUserProfile.residenciaId && isResidenciaConditionallyRequired) {
            if (formData.residenciaId !== adminUserProfile.residenciaId) {
                console.warn("Correcting residenciaId for non-master admin during update.");
                finalResidenciaId = adminUserProfile.residenciaId; // Force correct ID
            }
        }

        const validationErrors: string[] = [];
        const roles = formData.roles || [];
        if (!formData.nombre?.trim()) {
            validationErrors.push("Nombre es requerido.");
        }
        if (!formData.apellido?.trim()) {
            validationErrors.push("Apellido es requerido.");
        }
        if (!formData.email?.trim()) {
            validationErrors.push("Email es requerido."); // Although email shouldn't be updated here normally
        }
         if (roles.length === 0) {
             validationErrors.push("Al menos un Rol es requerido.");
         }
        if (roles.some(r => ['residente', 'director', 'asistente', 'auditor', 'admin'].includes(r)) && !finalResidenciaId) validationErrors.push("Residencia Asignada es requerida para el rol seleccionado.");
        if (roles.includes('residente') && !formData.dietaId) validationErrors.push("Dieta Predeterminada es requerida para Residentes.");
        if (roles.includes('residente') && !formData.numeroDeRopa?.trim()) validationErrors.push("Número de Ropa es requerido para Residentes.");
        // Custom Field Validations
        if (currentResidenciaDetails?.campoPersonalizado1_isActive && currentResidenciaDetails?.campoPersonalizado1_necesitaValidacion && currentResidenciaDetails?.campoPersonalizado1_regexValidacion) {
            const regex = new RegExp(currentResidenciaDetails.campoPersonalizado1_regexValidacion);
            if (formData.valorCampoPersonalizado1 && !regex.test(formData.valorCampoPersonalizado1)) {
                validationErrors.push(`${currentResidenciaDetails.campoPersonalizado1_etiqueta || 'Valor Personalizado 1'} no es válido.`);
            }
        }
        if (currentResidenciaDetails?.campoPersonalizado2_isActive && currentResidenciaDetails?.campoPersonalizado2_necesitaValidacion && currentResidenciaDetails?.campoPersonalizado2_regexValidacion) {
            const regex = new RegExp(currentResidenciaDetails.campoPersonalizado2_regexValidacion);
            if (formData.valorCampoPersonalizado2 && !regex.test(formData.valorCampoPersonalizado2)) {
                validationErrors.push(`${currentResidenciaDetails.campoPersonalizado2_etiqueta || 'Valor Personalizado 2'} no es válido.`);
            }
        }
        if (currentResidenciaDetails?.campoPersonalizado3_isActive && currentResidenciaDetails?.campoPersonalizado3_necesitaValidacion && currentResidenciaDetails?.campoPersonalizado3_regexValidacion) {
            const regex = new RegExp(currentResidenciaDetails.campoPersonalizado3_regexValidacion);
            if (formData.valorCampoPersonalizado3 && !regex.test(formData.valorCampoPersonalizado3)) {
                validationErrors.push(`${currentResidenciaDetails.campoPersonalizado3_etiqueta || 'Valor Personalizado 3'} no es válido.`);
            }
        }

        // AsistentePermisos Validation
        if (roles.includes('asistente')) {
            if (!formData.asistentePermisos) {
                validationErrors.push("Faltan los permisos de asistente. Por favor, re-seleccione el rol.");
            } else {
                const permisos = formData.asistentePermisos;
                const noUsuariosAsistidos = !permisos.usuariosAsistidos || permisos.usuariosAsistidos.length === 0;
                const noGestionActividades = permisos.gestionActividades === 'Ninguna';
                const noGestionInvitados = permisos.gestionInvitados === 'Ninguno';
                const noGestionRecordatorios = permisos.gestionRecordatorios === 'Ninguno';

                if (noUsuariosAsistidos && noGestionActividades && noGestionInvitados && noGestionRecordatorios) {
                    validationErrors.push("Un asistente debe tener al menos un usuario asignado o algún permiso de gestión (actividades, invitados o recordatorios).");
                }
            }
        }

        if (validationErrors.length > 0) {
            const title = validationErrors.length === 1
                ? "Error de Validación"
                : `Existen ${validationErrors.length} errores de validación`;
            const description = validationErrors.join("\\n"); // Use double backslash for newline
        
            toast({
                title: title,
                description: description,
                variant: "destructive",
                duration: 9000 // Optional: Increase duration
            });
            setIsSaving(false);
            return;
        }

        try {
            console.log(`Calling updateUser Cloud Function for user ${editingUserId}...`);

            // Prepare data for the Cloud Function
            const profileUpdateData: Partial<UserProfile> = {
                // id: editingUserId, // The server's UpdateUserDataPayload for profileData omits 'id'. 
                                      // userIdToUpdate in updatedDataForFunction covers this.
                                      // However, if your existing client code (Line 1014) includes it, 
                                      // you might keep it, but it won't be used from this specific field by the backend.
                nombre: formData.nombre?.trim() ?? undefined, // Use undefined if empty after trim or null/undefined
                apellido: formData.apellido?.trim() ?? undefined, // Use undefined if empty after trim or null/undefined
                email: formData.email ?? undefined, // Server's profileData type omits email, but if client sends it.
                residenciaId: finalResidenciaId,     // This should align with UserProfile type (e.g., string | undefined)
                roles: formData.roles ?? undefined, // Or ensure formData.roles is never null/undefined if it's required
                isActive: formData.isActive ?? undefined, // Or a default like true if that's intended for undefined
                modoEleccion: formData.modoEleccion ?? undefined,
                fechaDeNacimiento: formData.fechaDeNacimiento 
                    ? formatTimestampForInput(formData.fechaDeNacimiento) // Ensure this helper returns 'YYYY-MM-DD' or null
                    : null,
                centroCostoPorDefectoId: formData.centroCostoPorDefectoId ?? undefined,
                telefonoMovil: formData.telefonoMovil ?? undefined,
                dietaId: formData.dietaId ?? undefined,
                numeroDeRopa: formData.numeroDeRopa ?? undefined,
                habitacion: formData.habitacion ?? undefined,
                universidad: formData.universidad ?? undefined,
                carrera: formData.carrera ?? undefined,
                dni: formData.dni ?? undefined,
                puedeTraerInvitados: formData.puedeTraerInvitados ?? undefined, // Or a default like 'no'
                notificacionPreferencias: formData.notificacionPreferencias ?? undefined, // Ensure this matches UserProfile's type
                valorCampoPersonalizado1: formData.valorCampoPersonalizado1 ?? undefined,
                valorCampoPersonalizado2: formData.valorCampoPersonalizado2 ?? undefined,
                valorCampoPersonalizado3: formData.valorCampoPersonalizado3 ?? undefined,
            };

            // Remove undefined keys. This is important because sending 'undefined' to Firestore
            // via a function often means "do not change this field", whereas 'null' means "set to null".
            // Your backend 'profileData' is Partial<UserProfile>, so undefined fields are fine.
            Object.keys(profileUpdateData).forEach(keyStr => {
                const key = keyStr as keyof Partial<UserProfile>;
                if (profileUpdateData[key] === undefined) {
                    delete profileUpdateData[key];
                }
            });
            
            const updatedDataForFunction = {
                userIdToUpdate: editingUserId, // The UID of the user to update
                profileData: profileUpdateData, // Send the updated fields
                performedByUid: adminUserProfile?.id, // Send admin UID for logging
            };

            
            // Call the function
            const result = await updateUserCallable(updatedDataForFunction);
            const resultData = result.data as { success: boolean; message?: string };

            if (resultData.success) {
                console.log(`Cloud Function updated user ${editingUserId} successfully.`);

                // Update local state optimistically or based on returned data if needed
                const originalUser = users.find(u => u.id === editingUserId)!;
                // Create the updated user state based on formData submitted
                const updatedUserInState: UserProfile = {
                    ...originalUser, // Start with original
                    // Apply changes from formData
                    nombre: formData.nombre!.trim(),
                    apellido: formData.apellido!.trim(),
                    email: formData.email!.trim(), // Include email in profile too
                    residenciaId: finalResidenciaId, // Use selected or admin's residencia
                    roles: formData.roles!,
                    isActive: formData.isActive!,
                    modoEleccion: formData.modoEleccion ?? undefined,
                    fechaDeNacimiento: formData.fechaDeNacimiento ? formatTimestampForInput(formData.fechaDeNacimiento) : undefined,
                    centroCostoPorDefectoId: formData.centroCostoPorDefectoId ?? '',
                    telefonoMovil: formData.telefonoMovil ?? '',
                    dietaId: (formData.roles!.includes('residente') && formData.dietaId) ? formData.dietaId : undefined,
                    habitacion: formData.habitacion ?? '',
                    universidad: formData.universidad ?? '',
                    carrera: formData.carrera ?? '',
                    dni: formData.dni ?? '',
                    puedeTraerInvitados: formData.puedeTraerInvitados ?? 'no',
                    notificacionPreferencias: formData.notificacionPreferencias, // If you have form fields for these
                    valorCampoPersonalizado1: formData.valorCampoPersonalizado1 ?? '',
                    valorCampoPersonalizado2: formData.valorCampoPersonalizado2 ?? '',
                    valorCampoPersonalizado3: formData.valorCampoPersonalizado3 ?? '',
                    // Ensure all required fields from your UserProfile are included
                    numeroDeRopa: formData.numeroDeRopa?.trim() || undefined,
                    // ... apply ALL other fields from formData ...
                    asistentePermisos: (formData.roles!.includes('asistente') && formData.asistentePermisos)
                        ? {
                            // Ensure all properties of AsistentePermisos are explicitly defined here
                            // Use the actual property names and types from your AsistentePermisos interface.
                            // The defaults should be one of the valid literal strings for each field.

                            usuariosAsistidos: formData.asistentePermisos.usuariosAsistidos || [],

                            // From your error: gestionActividades must be 'Todas' | 'Propias' | 'Ninguna'
                            // 'Ninguna' is a safe default from your snippet (line 813).
                            gestionActividades: formData.asistentePermisos.gestionActividades || 'Ninguna',

                            // Assuming 'gestionInvitados' and 'gestionRecordatorios' have similar non-undefined literal types.
                            // Using 'Ninguno' as a default based on your snippet (lines 814-815).
                            // Please verify these against your AsistentePermisos interface definition.
                            gestionInvitados: formData.asistentePermisos.gestionInvitados || 'Ninguno',
                            gestionRecordatorios: formData.asistentePermisos.gestionRecordatorios || 'Ninguno',
                        }
                        : undefined,

                    id: editingUserId,
                };

                setUsers(prevUsers => prevUsers.map(user =>
                    user.id === editingUserId ? updatedUserInState : user
                ).sort((a, b) => (a.apellido + a.nombre).localeCompare(b.apellido + b.nombre)));

                toast({ title: "Usuario Actualizado", description: `Usuario ${updatedUserInState.nombre} ${updatedUserInState.apellido} actualizado.` });
                handleCancelEdit(); // Reset form

            } else {
                throw new Error(resultData.message || 'La función de actualización de usuario falló.');
            }

        } catch (error: any) {
            console.error("Error calling updateUser function or processing result:", error);
            const message = error.message || "Ocurrió un error al contactar el servicio de actualización.";
            let title = "Error al Actualizar";
            if (message.includes("permission denied")) title = "Error de Permisos";
            if (message.includes("not found")) title = "Error: Usuario No Encontrado";

            toast({ title: title, description: message, variant: "destructive" });
        } finally {
            setIsSaving(false);
        }
    };

    // --- Helper display functions ---
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
            'invitado': 'Invitado', 'asistente': 'Asistente', 'auditor': 'Auditor'
        };
        return roleMap[role] || role;
    };

    // --- Calculate conditional requirements for the form for better UX ---
    const isResidenciaConditionallyRequired = formData.roles.some(r => ['residente', 'director', 'asistente', 'auditor', 'admin'].includes(r));
    const isDietaConditionallyRequired = formData.roles.includes('residente');
    const isNumeroDeRopaConditionallyRequired = formData.roles.includes('residente');

    // =========================================================================
    // Conditional Rendering Logic (New Auth Flow)
    // =========================================================================

    // 1. Handle Initial Loading (Firebase Auth or Admin's Profile)
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

    // 2. Handle Firebase Auth Error or Admin's Profile Fetch Error
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

    // 3. Handle Not Authorized (Admin doesn't have 'admin' or 'master' role)
    // This check runs after auth and profile loading are complete and no errors occurred.
    if (!isAuthorized) {
        // authUser should exist here if we got past the initial checks without redirecting,
        // but isAuthorized is false due to role check.
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

    // 4. Render Actual Page Content (If all checks above passed, user is authorized)
    // At this point, authUser and adminUserProfile should be non-null.

    return (
        <div className="container mx-auto p-4 space-y-6">
            <h1 className="text-3xl font-bold tracking-tight">Gestión de Usuarios</h1>

            {/* --- Form Card --- */}
            <Card>
                <CardHeader>
                    <CardTitle>{editingUserId ? 'Editar Usuario' : 'Crear Nuevo Usuario'}</CardTitle>
                    <CardDescription>
                        {editingUserId ? 'Modifique los detalles del usuario seleccionado.' : 'Complete los detalles para añadir un nuevo usuario al sistema.'}
                    </CardDescription>
                </CardHeader>
                <form onSubmit={editingUserId ? handleUpdateUser : handleCreateUser}>
                    <CardContent className="space-y-6"> {/* Adjusted padding from p-6 to space-y-6 for consistency */}
                        {/* Nombre y Apellido */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6"> {/* Increased gap */}
                           <div className="space-y-1.5"> {/* Standardized spacing */}
                                <Label htmlFor="nombre">Nombre *</Label>
                                <Input id="nombre" value={formData.nombre || ''} onChange={(e) => handleFormChange('nombre', e.target.value)} placeholder="Ej. Juan" disabled={isSaving} />
                            </div>
                             <div className="space-y-1.5">
                                <Label htmlFor="apellido">Apellido *</Label>
                                <Input id="apellido" value={formData.apellido || ''} onChange={(e) => handleFormChange('apellido', e.target.value)} placeholder="Ej. Pérez" disabled={isSaving} />
                            </div>
                        </div>
                        <div>
                        <Label htmlFor="telefonoMovil">Teléfono Móvil (Opcional)</Label>
                        <Input
                            id="telefonoMovil"
                            name="telefonoMovil"
                            type="tel" // Using type="tel" can be helpful for mobile browsers
                            value={formData.telefonoMovil || ''}
                            onChange={(e) => handleFormChange('telefonoMovil', e.target.value)} // Assuming you have a generic input change handler
                            placeholder="Ej: +34600123456"
                            // disabled={formLoading} // Or your loading state variable
                        />
                        {/* Optional: Add a small description for the expected format */}
                        <p className="text-xs text-muted-foreground mt-1">
                            Incluir prefijo de país si es necesario (ej. +34).
                        </p>
                        </div>
                        {/* Email */}
                        <div className="space-y-1.5">
                            <Label htmlFor="email">Email *</Label>
                            <Input id="email" type="email" value={formData.email || ''} onChange={(e) => handleFormChange('email', e.target.value)} placeholder="ej. juan.perez@email.com" disabled={isSaving || !!editingUserId} />
                            {editingUserId && <p className="text-xs text-muted-foreground pt-1">El email no se puede cambiar después de la creación.</p>}
                        </div>

                        {/* Password Fields (Only for Create Mode) */}
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

                        {/* Roles Checkboxes */}
                        <div className="space-y-2">
                            <Label className="font-medium">Roles *</Label>
                            {/* Adjusted grid columns for better responsiveness */}
                            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-2 pt-1">
                                {availableRoles.map((role) => {
                                    // Determine if the checkbox should be disabled
                                    const isMasterRole = role === 'master';
                                    const isAdminMaster = adminUserProfile?.roles?.includes('master');
                                    const isDisabled = isSaving || (isMasterRole && !isAdminMaster); // Disable 'master' if admin is not master
                                    return (
                                        <div key={role} className="flex items-center space-x-2">
                                            <Checkbox
                                                id={`role-${role}`}
                                                checked={(formData.roles || []).includes(role)}
                                                onCheckedChange={(checked) => handleRoleChange(role, !!checked)}
                                                disabled={isDisabled} // Apply the disabled state
                                            />
                                            <Label
                                                htmlFor={`role-${role}`}
                                                className={`font-normal capitalize text-sm whitespace-nowrap ${isDisabled ? 'text-muted-foreground cursor-not-allowed' : ''}`} // Style disabled label
                                            >
                                                {formatSingleRoleName(role)}
                                            </Label>
                                        </div>
                                    );
                                })}
                            </div>
                            {formData.roles.length === 0 && <p className="text-xs text-destructive mt-1">Seleccione al menos un rol.</p> }
                        </div>

                        {/* Is Active Switch (Only show when editing) */}
                        {editingUserId && (
                            <div className="flex items-center space-x-2 pt-3">
                                <Switch id="isActive" checked={!!formData.isActive} onCheckedChange={(checked) => handleFormChange('isActive', checked)} disabled={isSaving} />
                                <Label htmlFor="isActive" className="text-sm">Usuario Activo</Label>
                            </div>
                        )}

                        {/* Residencia y Dieta Selects (conditional) */}
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                             <div className="space-y-1.5">
                                 <Label htmlFor="residencia">Residencia Asignada {isResidenciaConditionallyRequired ? '*' : ''}</Label>
                                <Select
                                    value={
                                        // If admin is not master and has a residencia, force their residenciaId
                                        (adminUserProfile && !adminUserProfile.roles.includes('master') && adminUserProfile.residenciaId)
                                        ? adminUserProfile.residenciaId
                                        : formData.residenciaId || '' // Otherwise, use the form's value
                                    }
                                    onValueChange={(value) => {
                                        // Only allow change if user is master or doesn't have a fixed residencia
                                        if (adminUserProfile?.roles.includes('master') || !adminUserProfile?.residenciaId) {
                                            handleSelectChange('residenciaId', value);
                                        }
                                    }}
                                    disabled={
                                        !!( // Coerce the entire result to a boolean
                                            isSaving ||
                                            !isResidenciaConditionallyRequired ||
                                            // Disable if admin is not master and has a residencia assigned
                                            (adminUserProfile && !adminUserProfile.roles.includes('master') && !!adminUserProfile.residenciaId)
                                        )
                                    }
                                >
                                    <SelectTrigger id="residencia">
                                        <SelectValue placeholder={isResidenciaConditionallyRequired ? "Seleccione residencia..." : "N/A (Opcional)"} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {/* Render options based on whether the admin is master or not */}
                                        {(adminUserProfile?.roles.includes('master') || !adminUserProfile?.residenciaId)
                                            ? (
                                                // Master or admin without residencia: show all options
                                                Object.entries(residences).map(([id, res]) => (
                                                    <SelectItem key={id} value={id}>{res.nombre}</SelectItem>
                                                ))
                                            ) : (adminUserProfile?.residenciaId && residences[adminUserProfile.residenciaId])
                                            ? (
                                                // Non-master admin with residencia: show only their residencia
                                                <SelectItem key={adminUserProfile.residenciaId} value={adminUserProfile.residenciaId}>
                                                    {residences[adminUserProfile.residenciaId].nombre}
                                                </SelectItem>
                                            ) : (
                                                // Fallback if admin's residencia somehow isn't in the list (shouldn't happen)
                                                <SelectItem value="loading" disabled>Cargando residencias...</SelectItem>
                                            )
                                        }
                                        {/* Handle loading state */}
                                        {Object.keys(residences).length === 0 && <SelectItem value="loading" disabled>Cargando residencias...</SelectItem>}
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
                                                    .filter(d => d.residenciaId === formData.residenciaId && d.isActive) // Only show active dietas for the selected residencia
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
                        
                        {/* --- START: New UserProfile Fields --- */}
                        <Card className="p-4 mt-4 bg-slate-50 dark:bg-slate-800/30 border-dashed">
                            <h4 className="text-base font-medium mb-3 text-slate-700 dark:text-slate-300">Configuraciones Adicionales</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-1.5">
                                    <Label htmlFor="modoEleccion">Modo de Elección de Comidas</Label>
                                    <Select value={formData.modoEleccion || ''} onValueChange={(value) => handleSelectChange('modoEleccion', value as ModoEleccionUsuario)} disabled={isSaving} >
                                        <SelectTrigger id="modoEleccion"><SelectValue placeholder="Seleccione modo..." /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="normal">Normal (Semanario)</SelectItem>
                                            <SelectItem value="aprobacion_diaria">Aprobación Diaria</SelectItem>
                                            <SelectItem value="explicito_diario">Elección Diaria Explícita</SelectItem>
                                            <SelectItem value="suspendido_con_asistente">Suspendido (Asistente Elige)</SelectItem>
                                            <SelectItem value="suspendido">Suspendido Totalmente</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="fechaDeNacimiento">Fecha de Nacimiento</Label>
                                    <Input id="fechaDeNacimiento" type="date" value={formData.fechaDeNacimiento || ''} onChange={(e) => handleFormChange('fechaDeNacimiento', e.target.value)} disabled={isSaving} />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="centroCostoPorDefectoId">
                                        {currentResidenciaDetails?.nombreEtiquetaCentroCosto || 'Centro de Costo por Defecto'}
                                    </Label>
                                    <Select
                                        value={formData.centroCostoPorDefectoId || ''}
                                        onValueChange={(value) => handleSelectChange('centroCostoPorDefectoId', value)}
                                        disabled={isSaving || isLoadingCentrosCosto || !formData.residenciaId}
                                    >
                                        <SelectTrigger id="centroCostoPorDefectoId">
                                            <SelectValue placeholder={
                                                !formData.residenciaId ? "Seleccione residencia primero" :
                                                isLoadingCentrosCosto ? "Cargando..." :
                                                (currentResidenciaDetails?.nombreEtiquetaCentroCosto || 'Seleccione centro de costo...')
                                            } />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {!formData.residenciaId ? (
                                                <SelectItem value="no-residencia" disabled>Seleccione una residencia primero</SelectItem>
                                            ) : isLoadingCentrosCosto ? (
                                                <SelectItem value="loading" disabled>Cargando...</SelectItem>
                                            ) : centrosCostoList.length === 0 ? (
                                                <SelectItem value="no-options" disabled>
                                                    No hay {(currentResidenciaDetails?.nombreEtiquetaCentroCosto || 'centros de costo').toLowerCase()} activos para esta residencia.
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
                                {currentResidenciaDetails?.campoPersonalizado1_isActive && (
                                    <div className="space-y-1.5">
                                        <Label htmlFor="valorCampoPersonalizado1">
                                            {currentResidenciaDetails.campoPersonalizado1_etiqueta || 'Valor Personalizado 1'}
                                            {currentResidenciaDetails.campoPersonalizado1_necesitaValidacion ? ' *' : ''}
                                        </Label>
                                        {currentResidenciaDetails.campoPersonalizado1_tamanoTexto === 'textArea' ? (
                                            <Textarea
                                                id="valorCampoPersonalizado1"
                                                value={formData.valorCampoPersonalizado1 || ''}
                                                onChange={(e) => handleFormChange('valorCampoPersonalizado1', e.target.value)}
                                                placeholder={currentResidenciaDetails.campoPersonalizado1_etiqueta || 'Valor 1'}
                                                disabled={isSaving || !formData.residenciaId}
                                            />
                                        ) : (
                                            <Input
                                                id="valorCampoPersonalizado1"
                                                value={formData.valorCampoPersonalizado1 || ''}
                                                onChange={(e) => handleFormChange('valorCampoPersonalizado1', e.target.value)}
                                                placeholder={currentResidenciaDetails.campoPersonalizado1_etiqueta || 'Valor 1'}
                                                disabled={isSaving || !formData.residenciaId}
                                            />
                                        )}
                                        {currentResidenciaDetails.campoPersonalizado1_necesitaValidacion && currentResidenciaDetails.campoPersonalizado1_regexValidacion && (
                                            <p className="text-xs text-muted-foreground mt-1">
                                                Validación requerida. Formato esperado: {currentResidenciaDetails.campoPersonalizado1_regexValidacion}
                                            </p>
                                        )}
                                    </div>
                                )}
                                {currentResidenciaDetails?.campoPersonalizado2_isActive && (
                                    <div className="space-y-1.5">
                                        <Label htmlFor="valorCampoPersonalizado2">
                                            {currentResidenciaDetails.campoPersonalizado2_etiqueta || 'Valor Personalizado 2'}
                                            {currentResidenciaDetails.campoPersonalizado2_necesitaValidacion ? ' *' : ''}
                                        </Label>
                                        {currentResidenciaDetails.campoPersonalizado2_tamanoTexto === 'textArea' ? (
                                            <Textarea
                                                id="valorCampoPersonalizado2"
                                                value={formData.valorCampoPersonalizado2 || ''}
                                                onChange={(e) => handleFormChange('valorCampoPersonalizado2', e.target.value)}
                                                placeholder={currentResidenciaDetails.campoPersonalizado2_etiqueta || 'Valor 2'}
                                                disabled={isSaving || !formData.residenciaId}
                                            />
                                        ) : (
                                            <Input
                                                id="valorCampoPersonalizado2"
                                                value={formData.valorCampoPersonalizado2 || ''}
                                                onChange={(e) => handleFormChange('valorCampoPersonalizado2', e.target.value)}
                                                placeholder={currentResidenciaDetails.campoPersonalizado2_etiqueta || 'Valor 2'}
                                                disabled={isSaving || !formData.residenciaId}
                                            />
                                        )}
                                        {currentResidenciaDetails.campoPersonalizado2_necesitaValidacion && currentResidenciaDetails.campoPersonalizado2_regexValidacion && (
                                            <p className="text-xs text-muted-foreground mt-1">
                                                Validación requerida. Formato esperado: {currentResidenciaDetails.campoPersonalizado2_regexValidacion}
                                            </p>
                                        )}
                                    </div>
                                )}
                                {currentResidenciaDetails?.campoPersonalizado3_isActive && (
                                    <div className="space-y-1.5">
                                        <Label htmlFor="valorCampoPersonalizado3">
                                            {currentResidenciaDetails.campoPersonalizado3_etiqueta || 'Valor Personalizado 3'}
                                            {currentResidenciaDetails.campoPersonalizado3_necesitaValidacion ? ' *' : ''}
                                        </Label>
                                        {currentResidenciaDetails.campoPersonalizado3_tamanoTexto === 'textArea' ? (
                                            <Textarea
                                                id="valorCampoPersonalizado3"
                                                value={formData.valorCampoPersonalizado3 || ''}
                                                onChange={(e) => handleFormChange('valorCampoPersonalizado3', e.target.value)}
                                                placeholder={currentResidenciaDetails.campoPersonalizado3_etiqueta || 'Valor 3'}
                                                disabled={isSaving || !formData.residenciaId}
                                            />
                                        ) : (
                                            <Input
                                                id="valorCampoPersonalizado3"
                                                value={formData.valorCampoPersonalizado3 || ''}
                                                onChange={(e) => handleFormChange('valorCampoPersonalizado3', e.target.value)}
                                                placeholder={currentResidenciaDetails.campoPersonalizado3_etiqueta || 'Valor 3'}
                                                disabled={isSaving || !formData.residenciaId}
                                            />
                                        )}
                                        {currentResidenciaDetails.campoPersonalizado3_necesitaValidacion && currentResidenciaDetails.campoPersonalizado3_regexValidacion && (
                                            <p className="text-xs text-muted-foreground mt-1">
                                                Validación requerida. Formato esperado: {currentResidenciaDetails.campoPersonalizado3_regexValidacion}
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>
                        </Card>
                        {/* --- END: New UserProfile Fields --- */}


                        {/* Optional Fields Group (Existing) */}
                        <Card className="p-4 mt-4 bg-slate-50 dark:bg-slate-800/30 border-dashed">
                             <h4 className="text-base font-medium mb-3 text-slate-700 dark:text-slate-300">Detalles Adicionales (Opcional - Existentes)</h4>
                             <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                 <div className="space-y-1.5">
                                     <Label htmlFor="dni">DNI</Label>
                                     <Input id="dni" value={formData.dni || ''} onChange={(e) => handleFormChange('dni', e.target.value)} placeholder="Ej. 12345678" disabled={isSaving} />
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
                    <CardFooter className="border-t pt-6"> {/* Added border and padding */}
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

            {/* --- Existing Users List Card --- */}
            <Card>
                <CardHeader>
                    <CardTitle>Usuarios Existentes</CardTitle>
                    <CardDescription>Lista de todos los usuarios registrados en el sistema.</CardDescription>
                </CardHeader>
                <CardContent>
                    {/* --- BEGIN Residencia Filter for Master Users --- */}
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
                    {/* --- END Residencia Filter --- */}

                    {/* --- BEGIN User List Display Logic --- */}
                    {isLoadingUsers ? (
                        <div className="space-y-4">
                           <Skeleton className="h-12 w-full" />
                           <Skeleton className="h-12 w-full" />
                           <Skeleton className="h-12 w-full" />
                        </div>
                    ) : ( // This is the "else" branch for isLoadingUsers:
                        filteredUsers.length > 0 ? (
                            // If there are users to display (after filtering)
                            <div> {/* This div should NOT have overflow-x-auto */}
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
                                                    <div className="mt-1">{/* Add a little space above the badge */}
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
                            </div> // This div closes the table container
                        ) : users.length > 0 && filteredUsers.length === 0 ? (
                            // If there are users in the system, but the current filter yields no results
                            <p className="text-muted-foreground text-center py-8">
                                No hay usuarios que coincidan con el filtro seleccionado.
                            </p>
                        ) : (
                            // If there are no users in the system at all (users array is empty)
                            <p className="text-muted-foreground text-center py-8">
                                No hay usuarios registrados en el sistema.
                            </p>
                        )
                    )}
                    {/* --- END User List Display Logic --- */}
                </CardContent>
            </Card>

            {/* --- Delete Confirmation Dialog --- */}
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
