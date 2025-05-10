// admin/users/page.tsx
'use client'; // Make it a client component

import React, { useState, useEffect, useCallback, useMemo } from 'react'; // Added useMemo
import { useRouter } from 'next/navigation';
import { Loader2, AlertCircle } from 'lucide-react'; // Added AlertCircle

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

// --- Firebase & New Auth Hook Imports ---
import { useAuthState } from 'react-firebase-hooks/auth'; // New auth hook
import { User } from "firebase/auth"; // Keep User type if needed elsewhere, though useAuthState provides it
import { createUserWithEmailAndPassword } from "firebase/auth"; // For user creation
import { doc, getDoc, getDocs, Timestamp, addDoc, collection, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase'; // Your initialized instances

// Model Imports
import { UserProfile, UserRole, ResidenciaId, DietaId, LogEntry, LogActionType, Dieta } from '@/models/firestore'; // Added Dieta

export default function UserManagementPage(): JSX.Element | null {
    const ALL_RESIDENCIAS_FILTER_KEY = 'all_residencias';
    const NO_RESIDENCIA_FILTER_KEY = 'no_residencia_assigned';

    // Helper type for form state
    type UserFormData = Partial<Omit<UserProfile, 'id' | 'roles'>> & {
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
    };

    const router = useRouter();
    const { toast } = useToast();

    // --- New Auth and Profile State ---
    const [authUser, authFirebaseLoading, authFirebaseError] = useAuthState(auth);
    const [adminUserProfile, setAdminUserProfile] = useState<UserProfile | null>(null); // Profile of the admin using the page
    const [adminProfileLoading, setAdminProfileLoading] = useState<boolean>(true);
    const [adminProfileError, setAdminProfileError] = useState<string | null>(null);
    const [isAuthorized, setIsAuthorized] = useState<boolean>(false); // Will be set based on adminUserProfile

    // States from preventing re-fetching when no residences {}
    const [hasAttemptedFetchResidences, setHasAttemptedFetchResidences] = useState(false);
    const [hasAttemptedFetchDietas, setHasAttemptedFetchDietas] = useState(false);
    const [hasAttemptedFetchUsers, setHasAttemptedFetchUsers] = useState(false);


    // --- Page Specific State (existing state) ---
    const [formData, setFormData] = useState<UserFormData>({
        nombre: '', apellido: '', email: '', isActive: true, roles: [], residenciaId: '', dietaId: '',
        numeroDeRopa: '', habitacion: '', universidad: '', carrera: '', dni: '',
        password: '', confirmPassword: '', telefonoMovil: ''
    });
    const [isSaving, setIsSaving] = useState(false);
    const [users, setUsers] = useState<UserProfile[]>([]); // List of users being managed
    const [isLoadingUsers, setIsLoadingUsers] = useState(true);
    const [editingUserId, setEditingUserId] = useState<string | null>(null);
    const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
    const [userToDeleteId, setUserToDeleteId] = useState<string | null>(null);
    const [selectedResidenciaFilter, setSelectedResidenciaFilter] = useState<string>(ALL_RESIDENCIAS_FILTER_KEY);


    const availableRoles: UserRole[] = ['residente', 'director', 'admin', 'master', 'invitado', 'asistente', 'auditor']; // Expanded roles
    const [residences, setResidences] = useState<Record<ResidenciaId, { nombre: string }>>({});
    const [dietas, setDietas] = useState<Dieta[]>([]);

    const filteredUsers = useMemo(() => {
        if (!adminUserProfile) return [];

        let usersToDisplay = [...users]; // Start with a copy of all users

        if (adminUserProfile.roles.includes('master')) {
            if (selectedResidenciaFilter === ALL_RESIDENCIAS_FILTER_KEY) {
                // No additional filtering, master sees all (or could be refined more if needed)
            } else if (selectedResidenciaFilter === NO_RESIDENCIA_FILTER_KEY) {
                usersToDisplay = usersToDisplay.filter(user => !user.residenciaId);
            } else { // A specific residenciaId is selected
                usersToDisplay = usersToDisplay.filter(user => user.residenciaId === selectedResidenciaFilter);
            }
        } else if (adminUserProfile.roles.includes('admin') && adminUserProfile.residenciaId) {
            // Non-master admin is always filtered by their own residenciaId
            usersToDisplay = usersToDisplay.filter(user => user.residenciaId === adminUserProfile.residenciaId);
        } else {
        // If admin has no residenciaId or other roles, show users without residencia by default
        // This case should ideally be handled by authorization logic preventing access or specific view definition
        usersToDisplay = usersToDisplay.filter(user => !user.residenciaId);
        }
        return usersToDisplay.sort((a, b) => (a.apellido + a.nombre).localeCompare(b.apellido + b.nombre));
    }, [users, selectedResidenciaFilter, adminUserProfile]);

    // --- Fetch Residences (Memoized) ---
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
        } finally { // <<< ADDED finally
            setHasAttemptedFetchResidences(true); // <<< ADDED
        }
    }, [toast]); // toast is a stable dependency

    // --- Fetch Dietas (Memoized) ---
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
                    isDefault: data.isDefault === true, // Ensure boolean
                    isActive: data.isActive === true,   // Ensure boolean
                    residenciaId: data.residenciaId,
                    // Add any other Dieta fields if necessary
                } as Dieta); // Make sure your Dieta type matches this structure
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

    // --- Fetch Users to Manage (Memoized) ---
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
                    residenciaId: data.residenciaId || undefined, // Use undefined for clarity if null
                    dietaId: data.dietaId || undefined,
                    numeroDeRopa: data.numeroDeRopa || undefined,
                    habitacion: data.habitacion || undefined,
                    universidad: data.universidad || undefined,
                    carrera: data.carrera || undefined,
                    dni: data.dni || undefined,
                });
            });
            console.log("Fetched users to manage:", usersData);
            setUsers(usersData.sort((a, b) => (a.apellido + a.nombre).localeCompare(b.apellido + b.nombre))); // Sort users
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
            setHasAttemptedFetchUsers(true); // <<< ADDED
        }
    }, [toast]); // toast is a stable dependency

    // --- useEffect: Handle Firebase Auth State & Fetch Admin's Profile ---
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
            router.replace('/'); // Redirect on critical auth error
            return;
        }

        if (!authUser) {
            console.log("No Firebase user (authUser is null). Redirecting to login.");
            setAdminProfileLoading(false);
            setAdminUserProfile(null);
            setAdminProfileError(null); // Clear previous errors
            setIsAuthorized(false);
            router.replace('/');
            return;
        }

        // authUser is available, fetch the admin's own profile
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

    // --- useEffect: Handle Authorization & Fetch Page-Specific Data ---
    useEffect(() => {
        // Wait for admin profile loading to complete
        if (adminProfileLoading) {
            setIsAuthorized(false); // Not authorized until profile is checked
            return;
        }

        // Handle profile fetch error or missing profile for the admin
        if (adminProfileError || !adminUserProfile) {
            console.log("Admin authorization check failed: Profile error or profile missing.");
            setIsAuthorized(false);
            // Render logic will show error/redirect based on adminProfileError or !isAuthorized
            return;
        }

        // Check admin's roles
        const roles = adminUserProfile.roles || [];
        const isAdminAuthorized = roles.includes('admin') || roles.includes('master');

        if (isAdminAuthorized) {
            console.log("Admin user is authorized. Proceeding with fetching page data.");
            setIsAuthorized(true);

            // --- BEGIN: Initialize selectedResidenciaFilter ---
            if (adminUserProfile.roles.includes('master')) {
                // Master users can see all or filter
                setSelectedResidenciaFilter(ALL_RESIDENCIAS_FILTER_KEY); // Default to all
            } else if (adminUserProfile.roles.includes('admin') && adminUserProfile.residenciaId) {
                // Admin users are locked to their own residencia
                setSelectedResidenciaFilter(adminUserProfile.residenciaId);
            } else {
                // Fallback or other roles that might get here (though authorization should prevent most)
                setSelectedResidenciaFilter(NO_RESIDENCIA_FILTER_KEY); // Or some other sensible default
            }
            // --- END: Initialize selectedResidenciaFilter ---

            if (!hasAttemptedFetchResidences) fetchResidences();
            if (!hasAttemptedFetchDietas) fetchDietas();
            if (!hasAttemptedFetchUsers) fetchUsersToManage();
        } else {
            console.warn("Admin user does not have admin/master role. Access denied.");
            setIsAuthorized(false);
            toast({ title: "Acceso Denegado", description: "No tienes los permisos (admin/master) para acceder a esta página.", variant: "destructive" });
            // Redirect if not authorized. The render logic below also handles this.
            // Consider if router.replace('/') is needed here or if render logic is sufficient.
            // router.replace('/');
        }
    }, [
        adminUserProfile,
        adminProfileLoading,
        adminProfileError,
        fetchResidences,
        fetchDietas,
        fetchUsersToManage,
        hasAttemptedFetchResidences, // <<< ADDED
        hasAttemptedFetchDietas,     // <<< ADDED
        hasAttemptedFetchUsers,      // <<< ADDED
        isLoadingUsers,
        toast // router not needed here as redirect is handled by render logic or auth effect
    ]);

    // --- Form and UI Handler Functions ---
    const handleFormChange = (field: keyof Omit<UserFormData, 'roles'>, value: string | boolean) => {
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

            let dietaId = prev.dietaId; // Keep current dietaId by default

            // Determine if residencia is required and its value
            const residenciaRequiredForRole = updatedRoles.some(r => ['residente', 'director', 'asistente', 'auditor', 'admin'].includes(r));
            const residenciaId = residenciaRequiredForRole ? prev.residenciaId : '';

            if (role === 'residente') {
                if (checked && residenciaId && dietas.length > 0) { // 'residente' added, and a residencia is selected
                    const defaultDieta = dietas.find(d => d.residenciaId === residenciaId && d.isDefault && d.isActive);
                    if (defaultDieta) {
                        dietaId = defaultDieta.id;
                    } else {
                        dietaId = ''; // Clear if no active default found, user must select
                        toast({
                            title: "Atención",
                            description: `No se encontró una dieta por defecto (y activa) para la residencia ${residences[residenciaId]?.nombre || residenciaId}. Por favor, seleccione una dieta manualmente.`,
                            variant: "default",
                            duration: 7000
                        });
                    }
                } else if (!checked) { // 'residente' role removed
                    dietaId = ''; // Clear dietaId
                }
            }
            
            // If residenciaId was cleared because no role requires it, also clear dietaId
            if (prev.residenciaId && !residenciaId) {
                dietaId = '';
            }

            return { ...prev, roles: updatedRoles, dietaId, residenciaId };
        });
    };

    const handleSelectChange = (field: 'residenciaId' | 'dietaId', value: string) => {
        setFormData(prev => {
            const updatedFormData = { ...prev, [field]: value };

            if (field === 'residenciaId') {
                // If residencia changes, clear the current dietaId first, then attempt to set default
                updatedFormData.dietaId = '';
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

        let validationError: string | null = null;
        const roles = formData.roles || [];
        const generalPhoneRegex = /^\+?[0-9\s-]{7,15}$/;
        // Regex para Honduras:
        const hondurasPhoneRegex = /^(\+?504)?[0-9]{3}[ -]?[0-9]{4}[ -]?[0-9]{1}$/;

        const telefono = formData.telefonoMovil?.trim();
        if (!formData.password || !formData.confirmPassword) {
            validationError = "Contraseña inicial y confirmación son requeridas.";
        } else if (formData.password.length < 6) {
            validationError = "La contraseña debe tener al menos 6 caracteres.";
        } else if (formData.password !== formData.confirmPassword) {
            validationError = "Las contraseñas no coinciden.";
        } else if (!formData.nombre?.trim()) {
            validationError = "Nombre es requerido.";
        } else if (!formData.apellido?.trim()) {
            validationError = "Apellido es requerido.";
            } else if (!formData.email?.trim()) {
                validationError = "Email es requerido.";
            } else if (telefono && telefono.length > 0) { // Check if telefono has a value
                // Now that we know telefono is a non-empty string, we can use startsWith and test
                if (
                    (telefono.startsWith("+504") || telefono.startsWith("504"))
                        ? !hondurasPhoneRegex.test(telefono)
                        : !generalPhoneRegex.test(telefono)
                ) {
                    validationError = "Formato de teléfono no válido para el país ingresado o general.";
                }
            } else if (roles.length === 0) {
            validationError = "Al menos un Rol es requerido.";
        } else if (
            roles.some(r =>
                ['residente', 'director', 'asistente', 'auditor', 'admin'].includes(r)
            ) && !formData.residenciaId
        ) {
            validationError = "Residencia Asignada es requerida para el rol seleccionado.";
        } else if (roles.includes('residente') && !formData.dietaId) {
            validationError = "Dieta Predeterminada es requerida para Residentes.";
        } else if (roles.includes('residente') && !formData.numeroDeRopa?.trim()) {
            validationError = "Número de Ropa es requerido para Residentes.";
        }
        
        if (validationError) {
            toast({ title: "Error de Validación", description: validationError, variant: "destructive" });
            setIsSaving(false);
            return;
        }

        let newUserAuthUid: string | null = null;
        try {
            console.log(`Attempting to create Auth user for ${formData.email}...`);
            const userCredential = await createUserWithEmailAndPassword(auth, formData.email!, formData.password!);
            newUserAuthUid = userCredential.user.uid;
            console.log(`Auth user created successfully with UID: ${newUserAuthUid}`);

            const userProfileData: Omit<UserProfile, 'id'> = {
                nombre: formData.nombre!.trim(),
                apellido: formData.apellido!.trim(),
                email: formData.email!.trim(),
                roles: formData.roles!,
                isActive: true, // New users active by default
                ...( (roles.some(r => ['residente', 'director', 'asistente', 'auditor', 'admin'].includes(r))) && formData.residenciaId ? { residenciaId: formData.residenciaId } : {} ),
                ...( roles.includes('residente') && formData.dietaId ? { dietaId: formData.dietaId } : {} ),
                ...( formData.numeroDeRopa?.trim() ? { numeroDeRopa: formData.numeroDeRopa.trim() } : {} ),
                ...( formData.habitacion?.trim() ? { habitacion: formData.habitacion.trim() } : {} ),
                ...( formData.universidad?.trim() ? { universidad: formData.universidad.trim() } : {} ),
                ...( formData.carrera?.trim() ? { carrera: formData.carrera.trim() } : {} ),
                ...( formData.dni?.trim() ? { dni: formData.dni.trim() } : {} ),
                ...( formData.telefonoMovil?.trim() ? { telefonoMovil: formData.telefonoMovil.trim() } : {} ),
            };

            console.log(`Attempting to create Firestore document users/${newUserAuthUid}...`);
            const userDocRef = doc(db, "users", newUserAuthUid);
            await setDoc(userDocRef, userProfileData);
            console.log(`Firestore document created successfully for user ${newUserAuthUid}`);

            const newUserForUI: UserProfile = { ...userProfileData, id: newUserAuthUid };
            setUsers(prevUsers => [newUserForUI, ...prevUsers].sort((a,b) => (a.apellido + a.nombre).localeCompare(b.apellido + b.nombre)));


            toast({ title: "Usuario Creado", description: `Se ha creado el usuario ${newUserForUI.nombre} ${newUserForUI.apellido}.` });

            setFormData({
                nombre: '', apellido: '', email: '', isActive: true, roles: [], residenciaId: '', dietaId: '',
                numeroDeRopa: '', habitacion: '', universidad: '', carrera: '', dni: '',
                password: '', confirmPassword: '', telefonoMovil: ''
            });

        } catch (error: any) {
            console.error("Error creating user:", error);
            let errorTitle = "Error al Crear Usuario";
            let errorMessage = "Ocurrió un error inesperado.";
            if (error.code) {
                switch (error.code) {
                    case 'auth/email-already-in-use': errorTitle = "Error de Autenticación"; errorMessage = "Este correo electrónico ya está registrado."; break;
                    case 'auth/invalid-email': errorTitle = "Error de Autenticación"; errorMessage = "El formato del correo electrónico no es válido."; break;
                    case 'auth/weak-password': errorTitle = "Error de Autenticación"; errorMessage = "La contraseña es demasiado débil (mínimo 6 caracteres)."; break;
                    case 'permission-denied': errorTitle = "Error de Permisos"; errorMessage = "No tienes permiso para crear este usuario en Firestore.";
                        if (newUserAuthUid) console.warn(`Firestore failed after Auth user ${newUserAuthUid} created. Consider manual cleanup.`);
                        break;
                    default: errorMessage = `Error: ${error.message} (Code: ${error.code})`;
                }
            }
            toast({ title: errorTitle, description: errorMessage, variant: "destructive" });
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
            password: '', confirmPassword: '' // Clear password fields
        });
      };

      const handleCancelEdit = () => {
          setEditingUserId(null);
          setFormData({
            nombre: '', apellido: '', email: '', isActive: true, roles: [], residenciaId: '', dietaId: '',
            numeroDeRopa: '', habitacion: '', universidad: '', carrera: '', dni: '',
            password: '', confirmPassword: ''
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
          const userDocRef = doc(db, "users", userToDeleteId);
          await deleteDoc(userDocRef);
          console.log(`Firestore document deleted successfully for user ${userToDeleteId}`);
          // TODO: Implement Auth user deletion (Requires backend function). For now, only Firestore profile is deleted.
          // This means the auth account still exists and can log in, but will likely hit profile errors.
          // A more robust solution would be a Firebase Function to delete the Auth user.

          setUsers(prevUsers => prevUsers.filter(user => user.id !== userToDeleteId));
          toast({ title: "Perfil de Usuario Eliminado", description: `El perfil de Firestore para ${userToDeleteInfo?.nombre || userToDeleteId} ha sido eliminado. La cuenta de autenticación puede requerir eliminación manual/backend.` });
      } catch (error: any) {
          console.error("Error deleting user profile from Firestore:", error);
          toast({ title: "Error al Eliminar", description: `No se pudo eliminar el perfil de Firestore. ${error.message}`, variant: "destructive" });
      } finally {
           setIsConfirmingDelete(false);
           setUserToDeleteId(null);
      }
    };

    const handleUpdateUser = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!editingUserId) return;
        setIsSaving(true);

        let validationError: string | null = null;
        const roles = formData.roles || [];
        if (!formData.nombre?.trim()) validationError = "Nombre es requerido.";
        else if (!formData.apellido?.trim()) validationError = "Apellido es requerido.";
        else if (!formData.email?.trim()) validationError = "Email es requerido."; // Email should generally not be editable in Firestore profile if it's linked to Auth. This could be complex.
        else if (roles.length === 0) validationError = "Al menos un Rol es requerido.";
        else if (roles.some(r => ['residente', 'director', 'asistente', 'auditor', 'admin'].includes(r)) && !formData.residenciaId) validationError = "Residencia Asignada es requerida para el rol seleccionado.";
        else if (roles.includes('residente') && !formData.dietaId) validationError = "Dieta Predeterminada es requerida para Residentes.";
        else if (roles.includes('residente') && !formData.numeroDeRopa?.trim()) validationError = "Número de Ropa es requerido para Residentes.";

        if (validationError) {
            toast({ title: "Error de Validación", description: validationError, variant: "destructive" });
            setIsSaving(false);
            return;
        }

        try {
            const updatedData: Partial<UserProfile> = { // Use Partial<UserProfile> for update object
                nombre: formData.nombre!.trim(),
                apellido: formData.apellido!.trim(),
                // email: formData.email!.trim(), // Be cautious updating email; it's tied to Firebase Auth identity. Typically done via Auth SDK.
                roles: formData.roles!,
                isActive: formData.isActive ?? true,
                // Conditionally set fields, ensure `undefined` if not applicable or empty to remove/leave unchanged.
                residenciaId: (roles.some(r => ['residente', 'director', 'asistente', 'auditor', 'admin'].includes(r)) && formData.residenciaId) ? formData.residenciaId : undefined,
                dietaId: (roles.includes('residente') && formData.dietaId) ? formData.dietaId : undefined,
                numeroDeRopa: formData.numeroDeRopa?.trim() || undefined,
                habitacion: formData.habitacion?.trim() || undefined,
                universidad: formData.universidad?.trim() || undefined,
                carrera: formData.carrera?.trim() || undefined,
                dni: formData.dni?.trim() || undefined,
            };
            // Remove undefined keys to prevent Firestore from creating them with null or erroring
            Object.keys(updatedData).forEach(key => updatedData[key as keyof UserProfile] === undefined && delete updatedData[key as keyof UserProfile]);


            const userDocRef = doc(db, "users", editingUserId);
            await updateDoc(userDocRef, updatedData);
            console.log(`Firestore document updated successfully for user ${editingUserId}`);

            const originalUser = users.find(u => u.id === editingUserId)!; // Should exist
            const updatedUserInState: UserProfile = {
                ...originalUser,
                ...updatedData, // Apply successfully updated fields
                id: editingUserId // ensure id is present
            };

            setUsers(prevUsers => prevUsers.map(user =>
                user.id === editingUserId ? updatedUserInState : user
            ).sort((a,b) => (a.apellido + a.nombre).localeCompare(b.apellido + b.nombre)));


            toast({ title: "Usuario Actualizado", description: `Se ha actualizado el usuario ${updatedUserInState.nombre} ${updatedUserInState.apellido}.` });
            handleCancelEdit();
        } catch (error: any) {
            console.error("Error updating user profile in Firestore:", error);
            toast({ title: "Error al Actualizar", description: `No se pudo guardar el perfil en Firestore. ${error.message}`, variant: "destructive" });
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
                                {availableRoles.map((role) => (
                                    <div key={role} className="flex items-center space-x-2">
                                        <Checkbox id={`role-${role}`} checked={(formData.roles || []).includes(role)} onCheckedChange={(checked) => handleRoleChange(role, !!checked)} disabled={isSaving} />
                                        <Label htmlFor={`role-${role}`} className="font-normal capitalize text-sm whitespace-nowrap"> {/* Added whitespace-nowrap to prevent label text from breaking too early, but the grid should handle overall item width */}
                                            {formatSingleRoleName(role)}
                                        </Label>
                                    </div>
                                ))}
                            </div>
                            {formData.roles.length === 0 && <p className="text-xs text-destructive mt-1">Seleccione al menos un rol.</p> }
                        </div>

                        {/* Is Active Switch (Only show when editing) */}
                        {editingUserId && (
                            <div className="flex items-center space-x-2 pt-3">
                                <Switch id="isActive" checked={formData.isActive} onCheckedChange={(checked) => handleFormChange('isActive', checked)} disabled={isSaving} />
                                <Label htmlFor="isActive" className="text-sm">Usuario Activo</Label>
                            </div>
                        )}

                        {/* Residencia y Dieta Selects (conditional) */}
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                             <div className="space-y-1.5">
                                 <Label htmlFor="residencia">Residencia Asignada {isResidenciaConditionallyRequired ? '*' : ''}</Label>
                                 <Select value={formData.residenciaId || ''} onValueChange={(value) => handleSelectChange('residenciaId', value)} disabled={isSaving || !isResidenciaConditionallyRequired} >
                                     <SelectTrigger id="residencia"><SelectValue placeholder={isResidenciaConditionallyRequired ? "Seleccione residencia..." : "N/A (Opcional)"} /></SelectTrigger>
                                     <SelectContent>
                                         {Object.entries(residences).map(([id, res]) => ( <SelectItem key={id} value={id}>{res.nombre}</SelectItem> )) }
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

                        {/* Optional Fields Group */}
                        <Card className="p-4 mt-4 bg-slate-50 dark:bg-slate-800/30 border-dashed">
                             <h4 className="text-base font-medium mb-3 text-slate-700 dark:text-slate-300">Detalles Adicionales (Opcional)</h4>
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
                                            <TableHead className="py-3 px-4">Info</TableHead> {/* New "Info" column */}
                                            <TableHead className="text-right py-3 px-4">Acciones</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filteredUsers.map((user) => (
                                            <TableRow key={user.id} className={editingUserId === user.id ? 'bg-blue-50 dark:bg-blue-900/30' : ''}>
                                                {/* Column 1: Usuario (remains the same) */}
                                                <TableCell className="font-medium py-3 px-4">
                                                    <div className="break-words">{user.nombre} {user.apellido}</div>
                                                    <div className="text-xs text-muted-foreground break-all">({user.email})</div>
                                                </TableCell>

                                                {/* Column 2: Info (New combined column) */}
                                                <TableCell className="py-3 px-4">
                                                    <div className="capitalize text-xs break-words">
                                                        {(user.roles || []).map(formatSingleRoleName).join(', ')}
                                                    </div>
                                                    <div className="mt-1"> {/* Add a little space above the badge */}
                                                        <Badge variant={user.isActive ? 'default' : 'outline'} className={`text-xs ${user.isActive ? 'bg-green-100 text-green-700 border-green-300 dark:bg-green-700/30 dark:text-green-300 dark:border-green-700' : 'bg-red-100 text-red-700 border-red-300 dark:bg-red-700/30 dark:text-red-300 dark:border-red-700'}`}>
                                                            {user.isActive ? 'Activo' : 'Inactivo'}
                                                        </Badge>
                                                    </div>
                                                </TableCell>

                                                {/* Column 3: Acciones (remains the same, including the flex wrapper for responsive buttons) */}
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
