'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, AlertCircle } from 'lucide-react';

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
import { Textarea } from '@/components/ui/textarea'; // ADDED: Textarea import

// --- Firebase & New Auth Hook Imports ---
import { useAuth } from '@/hooks/useAuth'; // Import the new hook
import { getFunctions, httpsCallable } from "firebase/functions";

// MODIFIED: Added query and where
import { doc, getDoc, getDocs, collection, query, where } from 'firebase/firestore';
import { app, auth, db } from '@/lib/firebase';
import { formatTimestampForInput } from '@/lib/utils'

// Model Imports
// MODIFIED: Added Residencia and CentroCosto
import { 
    UserProfile, 
    UserRole,
    Residencia, 
    ResidenciaId, 
    DietaId, 
    Dieta, 
    CentroCostoId, 
    CentroCosto
} from '../../../../shared/models/types';
// import { ZodUndefined } from 'zod';

function UserManagementPage(): JSX.Element | null {
    const ALL_RESIDENCIAS_FILTER_KEY = 'all_residencias';
    const NO_RESIDENCIA_FILTER_KEY = 'no_residencia_assigned';

    const functions = getFunctions(app); // Assuming 'app' is your initialized Firebase app instance from '@/lib/firebase'
    const functionsInstance = getFunctions(auth.app); // More reliable way if auth is initialized

    const createUserCallable = httpsCallable(functionsInstance, 'createUser');
    const updateUserCallable = httpsCallable(functionsInstance, 'updateUser');
    const deleteUserCallable = httpsCallable(functionsInstance, 'deleteUser');
    // Define a callable for logging (alternative to logging within each function)
    const logActionCallable = httpsCallable(functionsInstance, 'logAction');

    type UserFormData = Partial<Omit<UserProfile, 'id' | 'roles' | 'fechaDeNacimiento' | 'asistentePermisos' | 'nombreCorto' | 'fotoPerfil'>> & {
        nombreCorto?: string; // ADDED
        fotoPerfil?: string | null; // ADDED
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
        asistentePermisos: null; // MODIFIED: Explicitly null
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
            nombreCorto: '', // ADDED
            fotoPerfil: null, // ADDED
            email: '',
            isActive: true,
            roles: [],
            residenciaId: '',
            dietaId: '',
            numeroDeRopa: '',
            habitacion: '',
            universidad: '',
            carrera: '',
            dni: '',
            password: '',
            confirmPassword: '',
            telefonoMovil: '',
            fechaDeNacimiento: '',
            centroCostoPorDefectoId: '',
            puedeTraerInvitados: 'no',
            valorCampoPersonalizado1: '',
            valorCampoPersonalizado2: '',
            valorCampoPersonalizado3: '',
            asistentePermisos: null, // MODIFIED
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
            console.log("No profile provided, skipping fetchResidences.");
            return;
        }

        console.log("Fetching residences from Firestore based on user role...");
        const isMaster = profile.roles.includes('master');
        const adminResidenciaId = profile.residenciaId;

        try {
            const residencesData: Record<ResidenciaId, { nombre: string }> = {};

            if (isMaster) {
                // Master user: fetch all residences
                console.log("User is Master, fetching all residences.");
                const residencesCol = collection(db, "residencias");
                const querySnapshot = await getDocs(residencesCol);
                querySnapshot.forEach((doc) => {
                    const data = doc.data();
                    if (data.nombre) {
                        residencesData[doc.id] = { nombre: data.nombre };
                    } else {
                        console.warn(`Residence document ${doc.id} is missing the 'nombre' field.`);
                    }
                });
            } else if (adminResidenciaId) {
                // Admin user: fetch only their assigned residence
                console.log(`User is Admin, fetching residence: ${adminResidenciaId}`);
                const residenciaDocRef = doc(db, "residencias", adminResidenciaId);
                const docSnap = await getDoc(residenciaDocRef);
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    if (data.nombre) {
                        residencesData[docSnap.id] = { nombre: data.nombre };
                    } else {
                        console.warn(`Residence document ${docSnap.id} is missing the 'nombre' field.`);
                    }
                } else {
                     console.error(`Admin's assigned residence document ${adminResidenciaId} not found.`);
                     throw new Error("La residencia asignada no fue encontrada.");
                }
            } else {
                // Admin without a residenceId, or other roles. Fetch nothing.
                console.log("User is not Master and has no residenciaId. No residences to fetch.");
            }

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

    const fetchUsersToManage = useCallback(async (profile: UserProfile | null) => {
        if (!profile) {
            console.log("No profile provided, skipping fetchUsersToManage.");
            setIsLoadingUsers(false);
            return;
        }
        console.log("Fetching users to manage from Firestore based on user role...");
        setIsLoadingUsers(true);

        const isMaster = profile.roles.includes('master');
        const adminResidenciaId = profile.residenciaId;

        try {
            const usersCol = collection(db, "users");
            let q;

            if (isMaster) {
                console.log("User is Master, fetching all users.");
                q = query(usersCol);
            } else if (adminResidenciaId) {
                console.log(`User is Admin, fetching users for residencia: ${adminResidenciaId}`);
                q = query(usersCol, where("residenciaId", "==", adminResidenciaId));
            } else {
                 console.log("User is not Master and has no residenciaId. No users to fetch.");
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
                    dni: data.dni || '',
                    fechaDeNacimiento: data.fechaDeNacimiento || null, 
                    centroCostoPorDefectoId: data.centroCostoPorDefectoId || null,
                    puedeTraerInvitados: data.puedeTraerInvitados || 'no',
                    valorCampoPersonalizado1: data.valorCampoPersonalizado1 || '',
                    valorCampoPersonalizado2: data.valorCampoPersonalizado2 || '',
                    valorCampoPersonalizado3: data.valorCampoPersonalizado3 || '',
                    telefonoMovil: data.telefonoMovil || '',
                    asistentePermisos: data.asistentePermisos || null,
                    notificacionPreferencias: data.notificacionPreferencias || null,
                    tieneAutenticacion: true,
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
                    const fetchedProfile = docSnap.data() as UserProfile;
                    setAdminUserProfile(fetchedProfile); // Update the state

                    // Now, check the fetched data directly
                    if (fetchedProfile.residenciaId && !fetchedProfile.roles.includes('master')) { // Added roles check for clarity and correctness
                        setFormData(prevFormData => ({
                            ...prevFormData,
                            residenciaId: fetchedProfile.residenciaId!,
                        }));
                    }

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
            if (!hasAttemptedFetchResidences) fetchResidences(adminUserProfile);
            if (!hasAttemptedFetchDietas) fetchDietas();
            if (!hasAttemptedFetchUsers) fetchUsersToManage(adminUserProfile);
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

            // MODIFIED: asistentePermisos logic removed, it will remain null from formData type.
            // let updatedAsistentePermisos = prev.asistentePermisos; // This line and below block removed

            return { ...prev, roles: updatedRoles, dietaId, residenciaId /* asistentePermisos is already null */ };
        });
    };

    const handleSelectChange = (field: 'residenciaId' | 'dietaId' | 'grupoUsuario' | 'puedeTraerInvitados' | 'centroCostoPorDefectoId', value: string) => {
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
    
        // --- Centralized Validation ---
        const validationErrors: string[] = [];
        const trimmedNombreCorto = formData.nombreCorto?.trim();
    
        // 1. Create a unified data object for validation
        let dataForValidation = { ...formData };
    
        // 2. Adjust data based on user role (if necessary)
        if (adminUserProfile && !adminUserProfile.roles.includes('master') && adminUserProfile.residenciaId && isResidenciaConditionallyRequired) {
            if (formData.residenciaId !== adminUserProfile.residenciaId) {
                console.warn("Correcting residenciaId for non-master admin during validation.");
                dataForValidation.residenciaId = adminUserProfile.residenciaId;
            }
        }
    
        // 3. Run all validations against the unified data object
        const roles = dataForValidation.roles || [];
        const generalPhoneRegex = /^\+?[0-9\s-]{7,15}$/;
        const hondurasPhoneRegex = /^(\+?504)?[0-9]{3}[ -]?[0-9]{4}[ -]?[0-9]{1}$/;
        const telefono = dataForValidation.telefonoMovil?.trim();
    
        if (!dataForValidation.password || !dataForValidation.confirmPassword) {
            validationErrors.push("Contraseña inicial y confirmación son requeridas.");
        }
        if (dataForValidation.password && dataForValidation.password.length < 6) {
            validationErrors.push("La contraseña debe tener al menos 6 caracteres.");
        }
        if (dataForValidation.password && dataForValidation.confirmPassword && dataForValidation.password !== dataForValidation.confirmPassword) {
            validationErrors.push("Las contraseñas no coinciden.");
        }
        if (!dataForValidation.nombre?.trim()) {
            validationErrors.push("Nombre es requerido.");
        }
        if (!dataForValidation.apellido?.trim()) {
            validationErrors.push("Apellido es requerido.");
        }
        if (!dataForValidation.email?.trim()) {
            validationErrors.push("Email es requerido.");
        }
        if (!trimmedNombreCorto) {
            validationErrors.push("Nombre Corto es requerido.");
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
            !dataForValidation.residenciaId
        ) {
            validationErrors.push("Residencia Asignada es requerida para el rol seleccionado.");
        }
    
        if (roles.includes('residente') && !dataForValidation.dietaId) {
            validationErrors.push("Dieta Predeterminada es requerida para Residentes.");
        }
        if (roles.includes('residente') && !dataForValidation.numeroDeRopa?.trim()) {
            validationErrors.push("Número de Ropa es requerido para Residentes.");
        }
    
        // Custom Field Validations
        if (currentResidenciaDetails?.campoPersonalizado1_isActive && currentResidenciaDetails?.campoPersonalizado1_necesitaValidacion && currentResidenciaDetails?.campoPersonalizado1_regexValidacion) {
            const regex = new RegExp(currentResidenciaDetails.campoPersonalizado1_regexValidacion);
            if (dataForValidation.valorCampoPersonalizado1 && !regex.test(dataForValidation.valorCampoPersonalizado1)) {
                validationErrors.push(`${currentResidenciaDetails.campoPersonalizado1_etiqueta || 'Valor Personalizado 1'} no es válido.`);
            }
        }
        if (currentResidenciaDetails?.campoPersonalizado2_isActive && currentResidenciaDetails?.campoPersonalizado2_necesitaValidacion && currentResidenciaDetails?.campoPersonalizado2_regexValidacion) {
            const regex = new RegExp(currentResidenciaDetails.campoPersonalizado2_regexValidacion);
            if (dataForValidation.valorCampoPersonalizado2 && !regex.test(dataForValidation.valorCampoPersonalizado2)) {
                validationErrors.push(`${currentResidenciaDetails.campoPersonalizado2_etiqueta || 'Valor Personalizado 2'} no es válido.`);
            }
        }
        if (currentResidenciaDetails?.campoPersonalizado3_isActive && currentResidenciaDetails?.campoPersonalizado3_necesitaValidacion && currentResidenciaDetails?.campoPersonalizado3_regexValidacion) {
            const regex = new RegExp(currentResidenciaDetails.campoPersonalizado3_regexValidacion);
            if (dataForValidation.valorCampoPersonalizado3 && !regex.test(dataForValidation.valorCampoPersonalizado3)) {
                validationErrors.push(`${currentResidenciaDetails.campoPersonalizado3_etiqueta || 'Valor Personalizado 3'} no es válido.`);
            }
        }
    
        // 4. If errors, show toast and abort
        if (validationErrors.length > 0) {
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
    
        // --- End of Centralized Validation ---
    
        try {
            console.log(`Calling createUser Cloud Function for ${dataForValidation.email}...`);
    
            // Construct the profile data payload using the validated data
            const profileDataForFunction: Omit<UserProfile, 'id'> = {
                nombre: dataForValidation.nombre!.trim(),
                apellido: dataForValidation.apellido!.trim(),
                email: dataForValidation.email!.trim(),
                nombreCorto: trimmedNombreCorto!,
                fotoPerfil: null,
                tieneAutenticacion: true,
                roles: dataForValidation.roles!,
                isActive: dataForValidation.isActive === undefined ? true : dataForValidation.isActive,
                residenciaId: dataForValidation.residenciaId,
                dietaId: dataForValidation.dietaId || undefined,
                fechaDeNacimiento: dataForValidation.fechaDeNacimiento ? formatTimestampForInput(dataForValidation.fechaDeNacimiento) : null,
                telefonoMovil: dataForValidation.telefonoMovil?.trim() || undefined,
                dni: dataForValidation.dni?.trim() || undefined,
                numeroDeRopa: dataForValidation.numeroDeRopa?.trim() || undefined,
                habitacion: dataForValidation.habitacion?.trim() || undefined,
                universidad: dataForValidation.universidad?.trim() || undefined,
                carrera: dataForValidation.carrera?.trim() || undefined,
                puedeTraerInvitados: dataForValidation.puedeTraerInvitados || 'no',
                asistentePermisos: null,
                notificacionPreferencias: dataForValidation.notificacionPreferencias || undefined,
                centroCostoPorDefectoId: dataForValidation.centroCostoPorDefectoId || undefined,
                valorCampoPersonalizado1: dataForValidation.valorCampoPersonalizado1?.trim() || undefined,
                valorCampoPersonalizado2: dataForValidation.valorCampoPersonalizado2?.trim() || undefined,
                valorCampoPersonalizado3: dataForValidation.valorCampoPersonalizado3?.trim() || undefined,
            };
    
            const userDataForFunction = {
                email: dataForValidation.email!,
                password: dataForValidation.password!,
                profileData: profileDataForFunction,
                performedByUid: adminUserProfile?.id,
            };
    
            Object.keys(userDataForFunction.profileData).forEach(key => {
                const k = key as keyof typeof profileDataForFunction;
                if (userDataForFunction.profileData[k] === undefined) {
                    delete userDataForFunction.profileData[k];
                }
            });
    
            const result = await createUserCallable(userDataForFunction);
            const resultData = result.data as { success: boolean; userId?: string; message?: string };
    
            if (resultData.success && resultData.userId) {
                console.log(`Cloud Function created user successfully with UID: ${resultData.userId}`);
    
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
            console.error("Error calling createUser function or processing result:", error);
            const message = error.message || "Ocurrió un error al contactar el servicio de creación.";
            let title = "Error al Crear Usuario";
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

    setFormData({
        nombre: userToEdit.nombre || '',
        apellido: userToEdit.apellido || '',
        nombreCorto: userToEdit.nombreCorto || '', // ADDED
        fotoPerfil: userToEdit.fotoPerfil || null, // ADDED (or simply null if not yet in UserProfile)
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
        fechaDeNacimiento: userToEdit.fechaDeNacimiento ? formatTimestampForInput(userToEdit.fechaDeNacimiento) : '', // Use empty string if undefined for date input
        centroCostoPorDefectoId: userToEdit.centroCostoPorDefectoId || '',
        puedeTraerInvitados: userToEdit.puedeTraerInvitados || 'no',
        valorCampoPersonalizado1: userToEdit.valorCampoPersonalizado1 || '',
        valorCampoPersonalizado2: userToEdit.valorCampoPersonalizado2 || '',
        valorCampoPersonalizado3: userToEdit.valorCampoPersonalizado3 || '',
        asistentePermisos: null, // MODIFIED
        tieneAutenticacion: true,
        // Ensure other fields from UserFormData are mapped if they exist in UserProfile
        notificacionPreferencias: userToEdit.notificacionPreferencias || undefined,
    });
    };

    const handleCancelEdit = () => {
        setEditingUserId(null);
        setFormData({
            nombre: '',
            apellido: '',
            nombreCorto: '', // ADDED
            fotoPerfil: null, // ADDED
            email: '',
            isActive: true,
            roles: [],
            residenciaId: '',
            dietaId: '',
            numeroDeRopa: '',
            habitacion: '',
            universidad: '',
            carrera: '',
            dni: '',
            password: '',
            confirmPassword: '',
            telefonoMovil: '',
            fechaDeNacimiento: '',
            centroCostoPorDefectoId: '',
            puedeTraerInvitados: 'no',
            valorCampoPersonalizado1: '',
            valorCampoPersonalizado2: '',
            valorCampoPersonalizado3: '',
            asistentePermisos: null, // MODIFIED
            tieneAutenticacion: true,
            // Ensure all other relevant UserFormData fields are reset here if they exist
            notificacionPreferencias: undefined,
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
        const trimmedNombreCortoUpdate = formData.nombreCorto?.trim();

        if (!formData.nombre?.trim()) {
            validationErrors.push("Nombre es requerido.");
        }
        if (!formData.apellido?.trim()) {
            validationErrors.push("Apellido es requerido.");
        }
        if (!formData.email?.trim()) {
            validationErrors.push("Email es requerido."); // Although email shouldn't be updated here normally
        }
        if (!trimmedNombreCortoUpdate) { // Use the trimmed version for validation
            validationErrors.push("Nombre Corto es requerido.");
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
                // Core User Info
                nombre: formData.nombre?.trim() || undefined,
                apellido: formData.apellido?.trim() || undefined,
                // email: formData.email?.trim() || undefined, // Email is typically not updatable or handled separately

                // New fields from UserProfile requirements
                nombreCorto: trimmedNombreCortoUpdate!, // ADDED
                fotoPerfil: null, // ADDED - Placeholder for now
                tieneAutenticacion: true, // REQUIREMENT

                // Roles and Status
                roles: formData.roles ?? undefined, // Send if roles can be updated
                isActive: formData.isActive ?? undefined, // Send if isActive can be updated

                // Residencia and Related
                residenciaId: finalResidenciaId, // Send if residenciaId can be updated
                dietaId: formData.dietaId || undefined,
                
                // Personal and Contact Info
                fechaDeNacimiento: formData.fechaDeNacimiento 
                    ? formatTimestampForInput(formData.fechaDeNacimiento) // Ensures "YYYY-MM-DD"
                    : null, // Send null if empty to clear the field
                telefonoMovil: formData.telefonoMovil?.trim() || undefined,
                dni: formData.dni?.trim() || undefined,
                
                // Residencia-specific details
                numeroDeRopa: formData.numeroDeRopa?.trim() || undefined,
                habitacion: formData.habitacion?.trim() || undefined,
                universidad: formData.universidad?.trim() || undefined,
                carrera: formData.carrera?.trim() || undefined,
                
                // Permissions and Preferences
                puedeTraerInvitados: formData.puedeTraerInvitados || undefined, // Or your default like 'no'
                asistentePermisos: null, // REQUIREMENT - Set to null explicitly
                notificacionPreferencias: formData.notificacionPreferencias || undefined,

                // Centro de Costo and Custom Fields
                centroCostoPorDefectoId: formData.centroCostoPorDefectoId || undefined,
                valorCampoPersonalizado1: formData.valorCampoPersonalizado1?.trim() || undefined,
                valorCampoPersonalizado2: formData.valorCampoPersonalizado2?.trim() || undefined,
                valorCampoPersonalizado3: formData.valorCampoPersonalizado3?.trim() || undefined,
            };

            // The Object.keys line to remove undefined keys (lines 1041-1047) should remain as is.
            // The updatedDataForFunction object (lines 1049-1053) should also remain as is.

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
                const originalUser = users.find(u => u.id === editingUserId)!; // Assumes user exists

                const updatedUserInState: UserProfile = {
                    ...originalUser, // Start with the original user state

                    // Apply all fields from formData that are part of UserProfile
                    nombre: formData.nombre!.trim(), // Assume non-null due to validation
                    apellido: formData.apellido!.trim(), // Assume non-null
                    email: formData.email!.trim(), // Email is part of UserProfile

                    // New fields
                    nombreCorto: trimmedNombreCortoUpdate!,
                    fotoPerfil: null, // Per requirement, set to null
                    tieneAutenticacion: true, // Per requirement

                    // Roles and Status
                    roles: formData.roles!, // Assume non-null
                    isActive: formData.isActive!, // Assume non-null

                    // Residencia and Related
                    // Use finalResidenciaId which accounts for admin restrictions
                    residenciaId: finalResidenciaId || undefined,
                    dietaId: (formData.roles!.includes('residente') && formData.dietaId) ? formData.dietaId : undefined,

                    // Personal and Contact Info
                    // formatTimestampForInput should return "YYYY-MM-DD" string or null/undefined compatible with UserProfile.
                    // If UserProfile.fechaDeNacimiento is string | null, this is okay.
                    // If UserProfile.fechaDeNacimiento is string | undefined, adjust accordingly.
                    fechaDeNacimiento: formData.fechaDeNacimiento ? formatTimestampForInput(formData.fechaDeNacimiento) : undefined,
                    telefonoMovil: formData.telefonoMovil?.trim() || undefined,
                    dni: formData.dni?.trim() || undefined,

                    // Residencia-specific details
                    numeroDeRopa: formData.numeroDeRopa?.trim() || undefined,
                    habitacion: formData.habitacion?.trim() || undefined,
                    universidad: formData.universidad?.trim() || undefined,
                    carrera: formData.carrera?.trim() || undefined,

                    // Permissions and Preferences
                    puedeTraerInvitados: formData.puedeTraerInvitados || 'no',
                    asistentePermisos: null, // REQUIREMENT - Explicitly null
                    notificacionPreferencias: formData.notificacionPreferencias || undefined, // Keep if managed

                    // Centro de Costo and Custom Fields
                    centroCostoPorDefectoId: formData.centroCostoPorDefectoId || undefined,
                    valorCampoPersonalizado1: formData.valorCampoPersonalizado1?.trim() || undefined,
                    valorCampoPersonalizado2: formData.valorCampoPersonalizado2?.trim() || undefined,
                    valorCampoPersonalizado3: formData.valorCampoPersonalizado3?.trim() || undefined,

                    // Ensure 'id' is correctly set (it's already part of originalUser but can be explicit)
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
            'invitado': 'Invitado', 'asistente': 'Asistente', 'contador': 'Contador'
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
                        {/* Nombre, Apellido y Nombre Corto */}
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
                        {/* Foto Perfil Placeholder */}
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
                                        {(adminUserProfile?.roles.includes('master') || !adminUserProfile?.residenciaId) ? (
                                            // Master or admin without residencia: show all options
                                            Object.entries(residences).map(([id, res]) => (
                                                <SelectItem key={id} value={id}>
                                                    {res.nombre}
                                                </SelectItem>
                                            ))
                                        ) : adminUserProfile?.residenciaId && residences[adminUserProfile.residenciaId] ? (
                                            // Non-master admin with residencia: show only their residencia
                                            <SelectItem key={adminUserProfile.residenciaId} value={adminUserProfile.residenciaId}>
                                                {residences[adminUserProfile.residenciaId].nombre}
                                            </SelectItem>
                                        ) : (
                                            // Handle loading state or fallback for admin with missing residencia
                                            // Use a unique key here, perhaps incorporating a timestamp or a more descriptive key
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

// export default withAuth(UserManagementPage);
export default UserManagementPage;