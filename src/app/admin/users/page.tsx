'use client'; // Make it a client component

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation'; // Import useRouter
import { Loader2 } from 'lucide-react'; // For loading state

// UI Components (Keep existing imports)
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
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

// Firebase Imports
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, User, createUserWithEmailAndPassword } from "firebase/auth"; // Add createUserWithEmailAndPassword
import { doc, getDoc, getDocs, Timestamp, addDoc, collection, setDoc, updateDoc, deleteDoc } from 'firebase/firestore'; // Add deleteDoc
import { auth, db } from '@/lib/firebase'; // Your initialized instances

// Model Imports (Ensure these match your firestore.ts)
import { UserProfile, UserRole, ResidenciaId, DietaId, LogEntry, LogActionType } from '@/models/firestore';

// Component Definition & Initial State for Auth/Authz
export default function UserManagementPage() {
    // Helper type for form state, using roles array
    type UserFormData = Partial<Omit<UserProfile, 'id' | 'roles'>> & {
        roles: UserRole[];
        residenciaId?: ResidenciaId | '';
        dietaId?: DietaId | '';
        // Add other fields from UserProfile that are part of the form but optional in the type
        numeroDeRopa?: string;
        habitacion?: string;
        universidad?: string;
        carrera?: string;
        dni?: string;
        // isActive should be included if it's managed in the form directly
        isActive?: boolean;
        // --- ADD/VERIFY THESE LINES ---
        password?: string;
        confirmPassword?: string;
        // --- END ADD/VERIFY ---
    };

    
    const router = useRouter();
    const { toast } = useToast(); // Keep toast hook

    // State for Authentication & Authorization
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [isLoadingAuth, setIsLoadingAuth] = useState(true); // Renamed for clarity
    const [isAuthorized, setIsAuthorized] = useState(false);

    // --- Authentication & Authorization Effect ---
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
          if (user) {
            setCurrentUser(user);
            // User is signed in, check authorization
            try {
              const userDocRef = doc(db, "users", user.uid);
              const userDocSnap = await getDoc(userDocRef);
  
              if (userDocSnap.exists()) {
                const userProfile = userDocSnap.data() as UserProfile;
                const roles = userProfile.roles || [];
  
                // Authorization Check: Must be admin or master
                if (roles.includes('admin' as UserRole) || roles.includes('master' as UserRole)) {
                  console.log(`User ${user.uid} authorized as admin/master.`);
                  setIsAuthorized(true);
                } else {
                  console.warn(`User ${user.uid} is not an authorized admin/master. Roles:`, roles);
                  setIsAuthorized(false);
                  // Redirect non-admins away (optional, could show Access Denied instead)
                  // router.push('/');
                }
              } else {
                // No profile found in Firestore for logged-in user
                console.error(`No Firestore profile found for authenticated user ${user.uid}.`);
                setIsAuthorized(false);
                // Redirecting is crucial here as they have an auth account but no profile/roles
                // router.push('/');
              }
            } catch (error) {
              console.error("Error fetching user profile for authorization:", error);
              setIsAuthorized(false);
              // Redirect on error? Maybe safer
              // router.push('/');
            } finally {
              setIsLoadingAuth(false); // Auth check finished
            }
          } else {
            // No user is signed in
            setCurrentUser(null);
            setIsAuthorized(false);
            setIsLoadingAuth(false); // Auth check finished
            console.log("No user signed in, redirecting to login.");
            router.push('/'); // Redirect to login page
          }
        });
  
        // Cleanup subscription on unmount
        return () => unsubscribe();
      }, [router]); // Depend on router
  
    const [formData, setFormData] = useState<UserFormData>({
        nombre: '',
        apellido: '',
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
        confirmPassword: ''
    });
    const [isSaving, setIsSaving] = useState(false);
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [isLoadingUsers, setIsLoadingUsers] = useState(true); // Keep this for loading user list
    const [editingUserId, setEditingUserId] = useState<string | null>(null);
    const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
    const [userToDeleteId, setUserToDeleteId] = useState<string | null>(null);

    // Define available roles for the checkboxes
    const availableRoles: UserRole[] = ['residente', 'director', 'admin', 'master']; // Add/remove roles as needed

    // Initially empty
    const [residences, setResidences] = useState<Record<ResidenciaId, { nombre: string }>>({});

    // Initially empty
    const [dietas, setDietas] = useState<Record<DietaId, { nombre: string }>>({});

    // --- Fetch Residences from Firestore ---
    useEffect(() => {
        const fetchResidences = async () => {
            console.log("Fetching residences from Firestore...");
            try {
            const residencesCol = collection(db, "residencias");
            const querySnapshot = await getDocs(residencesCol);
            const residencesData: Record<ResidenciaId, { nombre: string }> = {};
            querySnapshot.forEach((doc) => {
                // Assuming each residence doc has a 'nombre' field
                const data = doc.data();
                if (data.nombre) {
                    // Use the document ID as the key
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
            }
        };
    
        // Fetch only if authorized (to avoid unnecessary calls if access denied)
        if (isAuthorized) {
            fetchResidences();
        }
    // Run only when authorization status changes to true
    }, [isAuthorized, toast]); // Add toast as dependency
    
    // --- Fetch Dietas from Firestore ---
    useEffect(() => {
        const fetchDietas = async () => {
          console.log("Fetching dietas from Firestore...");
          try {
            const dietasCol = collection(db, "dietas");
            const querySnapshot = await getDocs(dietasCol);
            const dietasData: Record<DietaId, { nombre: string }> = {};
            querySnapshot.forEach((doc) => {
              // Assuming each dieta doc has a 'nombre' field
              const data = doc.data();
              if (data.nombre) {
                  // Use the document ID as the key
                  dietasData[doc.id] = { nombre: data.nombre };
              } else {
                  console.warn(`Dieta document ${doc.id} is missing the 'nombre' field.`);
              }
            });
            console.log("Fetched dietas:", dietasData);
            setDietas(dietasData);
          } catch (error) {
            console.error("Error fetching dietas:", error);
            toast({
              title: "Error al Cargar Dietas",
              description: "No se pudieron obtener los datos de las dietas.",
              variant: "destructive",
            });
          }
        };
  
        // Fetch only if authorized
        if (isAuthorized) {
          fetchDietas();
        }
        // Run only when authorization status changes to true
    }, [isAuthorized, toast]); // Add toast as dependency
  
    // --- Fetch Users from Firestore ---
    useEffect(() => {
        const fetchUsers = async () => {
          console.log("Fetching users from Firestore...");
          setIsLoadingUsers(true); // Set loading state for the user list
          try {
            const usersCol = collection(db, "users");
            const querySnapshot = await getDocs(usersCol);
            const usersData: UserProfile[] = [];
            querySnapshot.forEach((doc) => {
              // Important: Map Firestore data to UserProfile, include the doc ID
              // Ensure all fields match your UserProfile interface
              const data = doc.data();
              usersData.push({
                  id: doc.id, // Use the document ID as the user ID
                  nombre: data.nombre || '',
                  apellido: data.apellido || '',
                  email: data.email || '',
                  roles: data.roles || [],
                  isActive: data.isActive === undefined ? true : data.isActive, // Default to true if missing
                  residenciaId: data.residenciaId || undefined,
                  dietaId: data.dietaId || undefined,
                  numeroDeRopa: data.numeroDeRopa || undefined,
                  habitacion: data.habitacion || undefined,
                  universidad: data.universidad || undefined,
                  carrera: data.carrera || undefined,
                  dni: data.dni || undefined,
                  // Add other fields from UserProfile if they exist in Firestore
                  // fechaDeCumpleanos: data.fechaDeCumpleanos // Example if you store this
              });
            });
            console.log("Fetched users:", usersData);
            setUsers(usersData); // Update state with real users
          } catch (error) {
            console.error("Error fetching users:", error);
            toast({
              title: "Error al Cargar Usuarios",
              description: "No se pudieron obtener los datos de los usuarios.",
              variant: "destructive",
            });
            setUsers([]); // Clear users on error
          } finally {
            setIsLoadingUsers(false); // Loading finished
          }
        };
  
        // Fetch only if authorized
        if (isAuthorized) {
          fetchUsers();
        } else {
           // If not authorized, ensure user list isn't stuck loading
           setIsLoadingUsers(false);
           setUsers([]); // Clear any potentially stale user data
        }
        // Run when authorization status changes
      }, [isAuthorized, toast]); // Add toast dependency
  
    // --- Handler Functions ---

    const handleFormChange = (field: keyof Omit<UserFormData, 'roles'>, value: string | boolean) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    // Handler for role checkboxes
    const handleRoleChange = (role: UserRole, checked: boolean) => {
        setFormData(prev => {
            const currentRoles = prev.roles || [];
            let updatedRoles: UserRole[];
            if (checked) {
                // Add role if not already present
                updatedRoles = [...new Set([...currentRoles, role])];
            } else {
                // Remove role
                updatedRoles = currentRoles.filter(r => r !== role);
            }
            // Automatically clear dieta if 'residente' role is removed
            const dietaId = updatedRoles.includes('residente') ? prev.dietaId : '';
            // Automatically clear residencia if neither 'residente' nor 'director' is present
             const residenciaId = updatedRoles.includes('residente') || updatedRoles.includes('director') ? prev.residenciaId : '';

            return { ...prev, roles: updatedRoles, dietaId, residenciaId };
        });
    };

    // Handler for Residencia and Dieta Selects
    const handleSelectChange = (field: 'residenciaId' | 'dietaId', value: string) => {
         setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleCreateUser = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setIsSaving(true);

        // --- Validation ---
        let validationError: string | null = null;
        const roles = formData.roles || [];
        // Add password checks
        if (!formData.password || !formData.confirmPassword) validationError = "Contraseña inicial y confirmación son requeridas.";
        else if (formData.password.length < 6) validationError = "La contraseña debe tener al menos 6 caracteres."; // Basic Firebase requirement
        else if (formData.password !== formData.confirmPassword) validationError = "Las contraseñas no coinciden.";
        // Keep existing checks
        else if (!formData.nombre?.trim()) validationError = "Nombre es requerido.";
        else if (!formData.apellido?.trim()) validationError = "Apellido es requerido.";
        else if (!formData.email?.trim()) validationError = "Email es requerido.";
        else if (roles.length === 0) validationError = "Al menos un Rol es requerido.";
        else if ((roles.includes('residente') || roles.includes('director')) && !formData.residenciaId) validationError = "Residencia Asignada es requerida para Directores y/o Residentes.";
        else if (roles.includes('residente') && !formData.dietaId) validationError = "Dieta Predeterminada es requerida para Residentes.";
        else if (roles.includes('residente') && !formData.numeroDeRopa?.trim()) validationError = "Número de Ropa es requerido para Residentes.";
    
        if (validationError) {
            toast({ title: "Error de Validación", description: validationError, variant: "destructive" });
            setIsSaving(false);
            return;
        }
        // --- End Validation ---
    
        let newUserAuthUid: string | null = null; // To store the UID from Auth creation
    
        try {
            // 1. Create Firebase Auth User
            console.log(`Attempting to create Auth user for ${formData.email}...`);
            const userCredential = await createUserWithEmailAndPassword(auth, formData.email!, formData.password!);
            newUserAuthUid = userCredential.user.uid;
            console.log(`Auth user created successfully with UID: ${newUserAuthUid}`);
    
            // 2. Prepare Firestore User Profile Data (excluding passwords!)
            const userProfileData: Omit<UserProfile, 'id'> = { // Exclude ID as it's the doc ID
                nombre: formData.nombre!.trim(),
                apellido: formData.apellido!.trim(),
                email: formData.email!.trim(),
                roles: formData.roles!,
                isActive: true, // New users are active by default
                residenciaId: (roles.includes('residente') || roles.includes('director')) ? formData.residenciaId || undefined : undefined,
                dietaId: roles.includes('residente') ? formData.dietaId || undefined : undefined,
                numeroDeRopa: formData.numeroDeRopa?.trim() || undefined,
                habitacion: formData.habitacion?.trim() || undefined,
                universidad: formData.universidad?.trim() || undefined,
                carrera: formData.carrera?.trim() || undefined,
                dni: formData.dni?.trim() || undefined,
                // Add any other relevant fields from UserProfile, ensure they match the interface
                 // passwordChangeRequired: true, // Add this if/when implementing force password change
            };
    
            // 3. Create Firestore User Document using the Auth UID
            console.log(`Attempting to create Firestore document users/${newUserAuthUid}...`);
            const userDocRef = doc(db, "users", newUserAuthUid);
            await setDoc(userDocRef, userProfileData);
            console.log(`Firestore document created successfully for user ${newUserAuthUid}`);
    
            // 4. Update Local UI State
            const newUserForUI: UserProfile = {
                ...userProfileData,
                id: newUserAuthUid, // Use the real UID
            };
            setUsers(prevUsers => [newUserForUI, ...prevUsers]); // Add to local state
    
            toast({
                title: "Usuario Creado",
                description: `Se ha creado el usuario ${newUserForUI.nombre} ${newUserForUI.apellido}.`,
            });
    
            // 5. Reset Form
            setFormData({
                nombre: '', apellido: '', email: '', isActive: true, roles: [], residenciaId: '', dietaId: '',
                numeroDeRopa: '', habitacion: '', universidad: '', carrera: '', dni: '',
                password: '', confirmPassword: '' // Clear password fields
            });
    
        } catch (error: any) {
            console.error("Error creating user:", error);
            let errorTitle = "Error al Crear Usuario";
            let errorMessage = "Ocurrió un error inesperado.";
    
            if (error.code) {
                switch (error.code) {
                    case 'auth/email-already-in-use':
                        errorTitle = "Error de Autenticación";
                        errorMessage = "Este correo electrónico ya está registrado.";
                        break;
                    case 'auth/invalid-email':
                        errorTitle = "Error de Autenticación";
                        errorMessage = "El formato del correo electrónico no es válido.";
                        break;
                    case 'auth/weak-password':
                        errorTitle = "Error de Autenticación";
                        errorMessage = "La contraseña es demasiado débil (debe tener al menos 6 caracteres).";
                        break;
                    case 'permission-denied': // Firestore error
                        errorTitle = "Error de Permisos";
                        errorMessage = "No tienes permiso para crear este documento de usuario en Firestore.";
                         // If Auth user was created but Firestore failed, we might need to delete the Auth user
                         if (newUserAuthUid) {
                             console.warn(`Firestore failed after Auth user ${newUserAuthUid} created. Consider manual cleanup or rollback function.`);
                             // Ideally, delete the auth user here if possible from client, or flag for admin cleanup
                         }
                        break;
                    default:
                        errorMessage = `Error: ${error.message} (Code: ${error.code})`;
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
        // Populate form - handle potentially undefined fields from model
        setFormData({
            nombre: userToEdit.nombre || '',
            apellido: userToEdit.apellido || '',
            email: userToEdit.email || '',
            isActive: userToEdit.isActive === undefined ? true : userToEdit.isActive, // Handle undefined isActive
            roles: userToEdit.roles || [],
            residenciaId: userToEdit.residenciaId || '',
            dietaId: userToEdit.dietaId || '',
            numeroDeRopa: userToEdit.numeroDeRopa || '',
            habitacion: userToEdit.habitacion || '',
            universidad: userToEdit.universidad || '',
            carrera: userToEdit.carrera || '',
            dni: userToEdit.dni || '',
            // DO NOT populate password fields when editing
            password: '',
            confirmPassword: ''
        });
        // Optionally scroll form into view
        // window.scrollTo({ top: 0, behavior: 'smooth' });
      };
    
      // Cancel Edit Mode
      const handleCancelEdit = () => {
          setEditingUserId(null);
          // Reset form to initial state
          setFormData({
            nombre: '', apellido: '', email: '', isActive: true, roles: [], residenciaId: '', dietaId: '',
            numeroDeRopa: '', habitacion: '', universidad: '', carrera: '', dni: '',
            password: '', confirmPassword: '' // Ensure passwords are cleared
        });
          console.log("Cancelled edit.");
      };

      const handleDeleteUser = (userId: string) => {
        const user = users.find(u => u.id === userId);
        if (!user) { toast({ title: "Error", description: "Usuario no encontrado.", variant: "destructive" }); return; }
        console.log("Requesting delete confirmation for user:", userId, user.nombre);
        setUserToDeleteId(userId); // Set the ID of the user targeted for deletion
        setIsConfirmingDelete(true); // Open the confirmation dialog
    };

    // Performs delete after confirmation in the dialog
    const confirmDeleteUser = async () => {
      if (!userToDeleteId) return; // Should not happen if dialog is open, but safe check
      const userToDelete = users.find(u => u.id === userToDeleteId); // Get user info for toast message before deleting
      console.log("Confirmed delete for user ID:", userToDeleteId);

      // Set saving state maybe? Or handle loading specifically for delete
      // setIsSaving(true); // Optional: Show loading indicator

      try {
          // Get Firestore document reference
          const userDocRef = doc(db, "users", userToDeleteId);

          // Delete Firestore document
          console.log(`Attempting to delete Firestore document users/${userToDeleteId}...`);
          await deleteDoc(userDocRef);
          console.log(`Firestore document deleted successfully for user ${userToDeleteId}`);

          // TODO: Implement Auth user deletion (Requires backend function or careful handling)
          // For now, we only delete the Firestore profile. The Auth user remains.

           // Update local state ONLY after successful Firestore deletion
           setUsers(prevUsers => prevUsers.filter(user => user.id !== userToDeleteId));
           toast({ title: "Usuario Eliminado", description: `El perfil de Firestore para ${userToDelete?.nombre || userToDeleteId} ha sido eliminado.` }); // Adjusted message

      } catch (error: any) {
          console.error("Error deleting user profile from Firestore:", error);
          toast({
              title: "Error al Eliminar",
              description: `No se pudo eliminar el perfil de Firestore. ${error.message}`,
              variant: "destructive",
          });
          // Don't proceed with UI updates if Firestore deletion fails
          // We still close the dialog and reset the ID in finally block
      } finally {
           // Close dialog and reset state regardless of success/failure
           setIsConfirmingDelete(false);
           setUserToDeleteId(null);
           // setIsSaving(false); // Optional: Reset saving state
      }
    };

    // const handleUpdateUser = async (event: React.FormEvent<HTMLFormElement>) => { ... keep this ...

    
    const handleUpdateUser = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!editingUserId) return; // Should not happen if form submit logic is correct

        setIsSaving(true);

        // --- Validation (similar to create) ---
        let validationError: string | null = null;
        const roles = formData.roles || [];
        if (!formData.nombre?.trim()) validationError = "Nombre es requerido.";
        else if (!formData.apellido?.trim()) validationError = "Apellido es requerido.";
        else if (!formData.email?.trim()) validationError = "Email es requerido.";
        else if (roles.length === 0) validationError = "Al menos un Rol es requerido.";
        else if ((roles.includes('residente') || roles.includes('director')) && !formData.residenciaId) validationError = "Residencia Asignada es requerida para Directores y/o Residentes.";
        else if (roles.includes('residente') && !formData.dietaId) validationError = "Dieta Predeterminada es requerida para Residentes.";
        else if (roles.includes('residente') && !formData.numeroDeRopa?.trim()) validationError = "Número de Ropa es requerido para Residentes.";

        if (validationError) {
            toast({ title: "Error de Validación", description: validationError, variant: "destructive" });
            setIsSaving(false);
            return;
        }
        // --- End Validation ---

        try {
            // Prepare data object for Firestore update (only include changed fields if desired, but updating all is simpler here)
            const updatedData: Partial<UserProfile> = { // Use Partial as we don't update ID
                nombre: formData.nombre!.trim(),
                apellido: formData.apellido!.trim(),
                isActive: formData.isActive ?? true, // Use the value from the form state
                email: formData.email!.trim(), // Update email in profile doc (Auth email remains unchanged)
                roles: formData.roles!,
                residenciaId: (roles.includes('residente') || roles.includes('director')) ? formData.residenciaId || undefined : undefined,
                dietaId: roles.includes('residente') ? formData.dietaId || undefined : undefined,
                numeroDeRopa: formData.numeroDeRopa?.trim() || undefined,
                habitacion: formData.habitacion?.trim() || undefined,
                universidad: formData.universidad?.trim() || undefined,
                carrera: formData.carrera?.trim() || undefined,
                dni: formData.dni?.trim() || undefined,
            };
        
            // Get Firestore document reference
            const userDocRef = doc(db, "users", editingUserId);
        
            // Update Firestore document
            console.log(`Attempting to update Firestore document users/${editingUserId}...`);
            await updateDoc(userDocRef, updatedData);
            console.log(`Firestore document updated successfully for user ${editingUserId}`);
        
        } catch (error: any) {
            console.error("Error updating user profile in Firestore:", error);
            toast({
                title: "Error al Actualizar",
                description: `No se pudo guardar el perfil en Firestore. ${error.message}`,
                variant: "destructive",
            });
            setIsSaving(false); // Stop saving state on error
            return; // Exit the function on Firestore error
        }

        // Find the original user to preserve ID and potentially other immutable fields
        const originalUser = users.find(u => u.id === editingUserId);
        if (!originalUser) {
            toast({ title: "Error", description: "No se encontró el usuario original para actualizar.", variant: "destructive" });
            setIsSaving(false);
            return;
        }


        // Create the updated user object
        const updatedUser: UserProfile = {
            ...originalUser, // Preserve original ID, etc.
            // Update fields from form data
            nombre: formData.nombre!.trim(),
            apellido: formData.apellido!.trim(),
            isActive: formData.isActive ?? true, // Save the form's isActive state
            email: formData.email!.trim(),
            roles: formData.roles!,
            residenciaId: (roles.includes('residente') || roles.includes('director')) ? formData.residenciaId || undefined : undefined,
            dietaId: roles.includes('residente') ? formData.dietaId || undefined : undefined,
            numeroDeRopa: formData.numeroDeRopa?.trim() || undefined,
            habitacion: formData.habitacion?.trim() || undefined,
            universidad: formData.universidad?.trim() || undefined,
            carrera: formData.carrera?.trim() || undefined,
            dni: formData.dni?.trim() || undefined,
        };

        // Update the user in the state array
        setUsers(prevUsers => prevUsers.map(user =>
            user.id === editingUserId ? updatedUser : user
        ));

        toast({
            title: "Usuario Actualizado (Simulado)",
            description: `Se ha actualizado el usuario ${updatedUser.nombre} ${updatedUser.apellido}.`
        });

        handleCancelEdit(); // Reset form and exit edit mode
        setIsSaving(false);
    };

    // Helper functions for display
    const getResidenciaName = (id?: ResidenciaId): string => {
        if (!id) return 'N/A';
        return residences[id]?.nombre || 'Desconocida';
    };

     const getDietaName = (id?: DietaId): string => {
        if (!id) return 'N/A';
        return dietas[id]?.nombre || 'Desconocida';
    };

    const getUserToDeleteName = () => {
        const user = users.find(u => u.id === userToDeleteId);
        // Return full name or empty string if not found
        return user ? `${user.nombre} ${user.apellido}` : '';
    };

    // Helper to format a single role name for display
    const formatSingleRoleName = (role: UserRole): string => {
        switch (role) {
            case 'residente': return 'Residente';
            case 'director': return 'Director';
            case 'admin': return 'Admin';
            case 'master': return 'Master';
            default: return role; // Return raw value if unknown
        }
    };

    // Calculate conditional requirements for the form
    const isResidenciaRequired = formData.roles.includes('residente') || formData.roles.includes('director');
    const isDietaApplicable = formData.roles.includes('residente');
    const isNumeroDeRopaRequired = formData.roles.includes('residente');

    // --- Conditional Rendering Logic ---

    if (isLoadingAuth) {
        // Show loading indicator while checking authentication/authorization
        return (
          <div className="flex items-center justify-center min-h-screen">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2">Verificando acceso...</span>
          </div>
        );
      }
  
      if (!isAuthorized) {
        // Show access denied if user is logged in but not admin/master
        return (
          <div className="container mx-auto p-4 text-center">
            <h1 className="text-2xl font-bold text-destructive mb-4">Acceso Denegado</h1>
            <p className="text-muted-foreground">No tienes permiso para acceder a esta página.</p>
             <button onClick={() => router.push('/')} className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90">
                Ir al Inicio
             </button>
          </div>
        );
      }
  
      // --- Render actual page content if authorized ---
      return (
        <div className="container mx-auto p-4 space-y-6">
          <h1 className="text-2xl font-bold">Gestión de Usuarios</h1>
  
          {/* --- Form Card --- */}
          <Card>
            <CardHeader>
              <CardTitle>{editingUserId ? 'Editar Usuario' : 'Crear Nuevo Usuario'}</CardTitle>
              <CardDescription>{editingUserId ? 'Modifique los detalles del usuario.' : 'Complete los detalles para añadir un nuevo usuario.'}</CardDescription>
            </CardHeader>
            <form onSubmit={editingUserId ? handleUpdateUser : handleCreateUser}>
                <CardContent className="space-y-4">
                    {/* Nombre y Apellido */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                       <div className="space-y-1">
                            <Label htmlFor="nombre">Nombre *</Label>
                            <Input id="nombre" value={formData.nombre || ''} onChange={(e) => handleFormChange('nombre', e.target.value)} placeholder="Ej. Juan" disabled={isSaving} />
                        </div>
                         <div className="space-y-1">
                            <Label htmlFor="apellido">Apellido *</Label>
                            <Input id="apellido" value={formData.apellido || ''} onChange={(e) => handleFormChange('apellido', e.target.value)} placeholder="Ej. Pérez" disabled={isSaving} />
                        </div>
                    </div>
  
                    {/* Email */}
                    <div className="space-y-1">
                        <Label htmlFor="email">Email *</Label>
                        <Input id="email" type="email" value={formData.email || ''} onChange={(e) => handleFormChange('email', e.target.value)} placeholder="ej. juan.perez@email.com" disabled={isSaving} />
                    </div>
  
                    {/* Roles Checkboxes */}
                    <div className="space-y-2">
                        <Label>Roles *</Label>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2">
                            {availableRoles.map((role) => (
                                <div key={role} className="flex items-center space-x-2">
                                    <Checkbox
                                        id={`role-${role}`}
                                        checked={(formData.roles || []).includes(role)}
                                        onCheckedChange={(checked) => handleRoleChange(role, !!checked)} // Pass boolean
                                        disabled={isSaving}
                                    />
                                    <Label htmlFor={`role-${role}`} className="font-normal capitalize">
                                        {formatSingleRoleName(role)}
                                    </Label>
                                </div>
                            ))}
                        </div>
                         {formData.roles.length === 0 && <p className="text-xs text-destructive mt-1">Seleccione al menos un rol.</p> }
                    </div>
  
                    {/* --- Is Active Switch (Only show when editing) --- */}
                    {editingUserId && (
                        <div className="flex items-center space-x-2 pt-2">
                            <Switch
                                id="isActive"
                                checked={formData.isActive}
                                onCheckedChange={(checked) => handleFormChange('isActive', checked)} // Use handleFormChange
                                disabled={isSaving}
                            />
                            <Label htmlFor="isActive">Usuario Activo</Label>
                        </div>
                    )}
  
                    {/* Residencia y Dieta Selects (conditional) */}
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                         {/* Residencia Asignada */}
                         <div className="space-y-1">
                             <Label htmlFor="residencia">Residencia Asignada {isResidenciaRequired ? '*' : '(Opcional)'}</Label>
                             <Select
                                 value={formData.residenciaId || ''}
                                 onValueChange={(value) => handleSelectChange('residenciaId', value)}
                                 disabled={isSaving || !isResidenciaRequired} // Disable if not required
                             >
                                 <SelectTrigger id="residencia"><SelectValue placeholder={isResidenciaRequired ? "Seleccione residencia..." : "N/A"} /></SelectTrigger>
                                 <SelectContent>
                                     {Object.entries(residences).map(([id, res]) => ( <SelectItem key={id} value={id}>{res.nombre}</SelectItem> ))}
                                 </SelectContent>
                             </Select>
                              {isResidenciaRequired && !formData.residenciaId && <p className="text-xs text-destructive mt-1">Requerido para Residente/Director.</p>}
                         </div>
                         {/* Dieta Predeterminada */}
                         <div className="space-y-1">
                             <Label htmlFor="dieta">Dieta Predet. {isDietaApplicable ? '*' : '(Solo Residentes)'}</Label>
                             <Select
                                 value={formData.dietaId || ''}
                                 onValueChange={(value) => handleSelectChange('dietaId', value)}
                                 disabled={isSaving || !isDietaApplicable} // Disable if not applicable
                             >
                                 <SelectTrigger id="dieta"><SelectValue placeholder={isDietaApplicable ? "Seleccione dieta..." : "N/A"} /></SelectTrigger>
                                 <SelectContent>
                                     {Object.entries(dietas).map(([id, d]) => ( <SelectItem key={id} value={id}>{d.nombre}</SelectItem> ))}
                                 </SelectContent>
                             </Select>
                             {isDietaApplicable && !formData.dietaId && <p className="text-xs text-destructive mt-1">Requerido para Residente.</p>}
                         </div>
                     </div>
  
                    {/* --- Optional Fields --- */}
                    <Card className="p-4 bg-gray-50/50 border-dashed">
                         <h4 className="text-sm font-medium mb-3 text-gray-600">Detalles Adicionales (Opcional)</h4>
                         <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                             <div className="space-y-1">
                                 <Label htmlFor="dni">DNI</Label>
                                 <Input id="dni" value={formData.dni || ''} onChange={(e) => handleFormChange('dni', e.target.value)} placeholder="Ej. 12345678" disabled={isSaving} />
                             </div>
                             <div className="space-y-1">
                                 <Label htmlFor="habitacion">Habitación</Label>
                                 <Input id="habitacion" value={formData.habitacion || ''} onChange={(e) => handleFormChange('habitacion', e.target.value)} placeholder="Ej. 101" disabled={isSaving} />
                             </div>
                              <div className="space-y-1">
                                 <Label htmlFor="numeroDeRopa">Nº Ropa {isNumeroDeRopaRequired ? '*' : ''}</Label>
                                 <Input id="numeroDeRopa" value={formData.numeroDeRopa || ''} onChange={(e) => handleFormChange('numeroDeRopa', e.target.value)} placeholder="Ej. 55" disabled={isSaving} />
                                 {/* Add visual feedback if required and empty */}
                                 {isNumeroDeRopaRequired && !formData.numeroDeRopa?.trim() &&
                                     <p className="text-xs text-destructive mt-1">Número de Ropa es requerido para Residentes.</p>}
                             </div>
                        </div>
                    </Card>
  
                </CardContent>
                <CardFooter>
                    {/* --- Dynamically update Submit button text --- */}
                    <Button type="submit" disabled={isSaving} className="mr-2">
                        {isSaving ? (editingUserId ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Loader2 className="mr-2 h-4 w-4 animate-spin" />) : null}
                        {isSaving ? (editingUserId ? 'Guardando...' : 'Creando...') : (editingUserId ? 'Guardar Cambios' : 'Crear Usuario')}
                    </Button>
                     {/* --- Add Cancel button for Edit mode --- */}
                    {editingUserId && (
                        <Button type="button" variant="outline" onClick={handleCancelEdit} disabled={isSaving}>
                            Cancelar
                        </Button>
                    )}
                </CardFooter>
            </form>
        </Card>
  
        {/* --- Existing Users List Card --- */}
        <Card>
            <CardHeader>
                <CardTitle>Usuarios Existentes</CardTitle>
                <CardDescription>Lista de usuarios registrados en el sistema.</CardDescription>
            </CardHeader>
            <CardContent>
                {isLoadingUsers ? (
                    <div className="space-y-3">
                       <Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" />
                    </div>
                ) : users.length > 0 ? (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Nombre</TableHead>
                                <TableHead>Apellido</TableHead>
                                <TableHead>Email</TableHead>
                                <TableHead>Roles</TableHead>
                                <TableHead>Residencia</TableHead>
                                <TableHead>Dieta</TableHead>
                                <TableHead>Estado</TableHead>
                                <TableHead className="text-right">Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {users.map((user) => (
                                <TableRow key={user.id}>
                                    <TableCell className="font-medium">{user.nombre}</TableCell>
                                    <TableCell>{user.apellido}</TableCell>
                                    <TableCell>{user.email}</TableCell>
                                    <TableCell className="capitalize">
                                        {(user.roles || []).map(formatSingleRoleName).join(', ')}
                                    </TableCell>
                                    <TableCell>{getResidenciaName(user.residenciaId)}</TableCell>
                                    <TableCell>{getDietaName(user.dietaId)}</TableCell>
                                    <TableCell>
                                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${user.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                            {user.isActive ? 'Activo' : 'Inactivo'}
                                        </span>
                                    </TableCell>
                                    <TableCell className="text-right space-x-2">
                                        {/* Disable table actions if editing another user */}
                                        <Button variant="outline" size="sm" onClick={() => handleEditUser(user.id)} disabled={isSaving || !!editingUserId}>Editar</Button>
                                        <Button variant="destructive" size="sm" onClick={() => handleDeleteUser(user.id)} disabled={isSaving || !!editingUserId}>Eliminar</Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                ) : (
                    <p className="text-muted-foreground text-center">No hay usuarios registrados.</p>
                )}
            </CardContent>
        </Card>
  
        {/* --- Delete Confirmation Dialog --- */}
        <AlertDialog open={isConfirmingDelete} onOpenChange={setIsConfirmingDelete}>
             <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>¿Está realmente seguro?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Esta acción no se puede deshacer. Esto eliminará permanentemente al usuario
                        <span className="font-medium"> {getUserToDeleteName()} </span>
                        del sistema.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setUserToDeleteId(null)}>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={confirmDeleteUser}
                         // Apply destructive variant styling
                        className={buttonVariants({ variant: "destructive" })}
                    >Confirmar Eliminación</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
  
    </div> // Close main container div
    ); // Close main return
  } // Close component function
  