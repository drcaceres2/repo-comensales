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
import { onAuthStateChanged, User } from 'firebase/auth'; // Import User type
import { doc, getDoc, Timestamp, addDoc, collection } from 'firebase/firestore'; // Keep Timestamp etc. if needed later
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
  
    // --- Original State Variables and Mock Data ---
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
        dni: ''
    });
    const [isSaving, setIsSaving] = useState(false);
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [isLoadingUsers, setIsLoadingUsers] = useState(true); // Keep this for loading user list
    const [editingUserId, setEditingUserId] = useState<string | null>(null);
    const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
    const [userToDeleteId, setUserToDeleteId] = useState<string | null>(null);

    // Define available roles for the checkboxes
    const availableRoles: UserRole[] = ['residente', 'director', 'admin', 'master']; // Add/remove roles as needed

    // Mock residences data (Keep for now, replace with fetched data later)
    const [residences, setResidences] = useState<Record<ResidenciaId, { nombre: string }>>({
        'res-guaymura': { nombre: 'Residencia Guaymura' },
        'res-del-valle': { nombre: 'Residencia Del Valle' },
        'res-los-andes': { nombre: 'Residencia Los Andes' },
    });

    // Mock diets data (Keep for now, replace with fetched data later)
    const [dietas, setDietas] = useState<Record<DietaId, { nombre: string }>>({
        'dieta-std-g': { nombre: 'Standard' },
        'dieta-celi-g': { nombre: 'Sin Gluten (Celíaco)' },
        'dieta-veggie-g': { nombre: 'Vegetariana' },
    });

    // --- MOCK USER DATA (Using roles array) ---
    const mockUsers: UserProfile[] = [
        // Using 'id', roles[], and no 'createdAt'
        { id: 'usr-1', nombre: 'Ana', apellido: 'García', email: 'ana.garcia@email.com', roles: ['residente'], residenciaId: 'res-guaymura', dietaId: 'dieta-std-g', isActive: true },
        { id: 'usr-2', nombre: 'Carlos', apellido: 'López', email: 'carlos.lopez@email.com', roles: ['director', 'residente'], residenciaId: 'res-guaymura', dietaId: 'dieta-std-g', isActive: true }, // Example Director + Residente
        { id: 'usr-3', nombre: 'Admin', apellido: 'General', email: 'admin@sistema.com', roles: ['admin'], isActive: true },
        { id: 'usr-4', nombre: 'Beatriz', apellido: 'Fernández', email: 'beatriz.fernandez@email.com', roles: ['residente'], residenciaId: 'res-del-valle', dietaId: 'dieta-celi-g', isActive: false },
        { id: 'usr-5', nombre: 'David', apellido: 'Martínez', email: 'david.martinez@email.com', roles: ['director'], residenciaId: 'res-del-valle', isActive: true }, // Example Director only
        { id: 'usr-6', nombre: 'Master', apellido: 'User', email: 'master@sistema.com', roles: ['master', 'admin'], isActive: true }, // Example Master + Admin
        ];
    // --- END MOCK USER DATA ---

    // Mock effect to load users (replace with actual Firestore fetch later)
    useEffect(() => {
        setIsLoadingUsers(true);
        // Simulate fetching users
        const timer = setTimeout(() => {
            setUsers(mockUsers); // Load mock users into state
            setIsLoadingUsers(false);
        }, 800); // Simulate network delay
        return () => clearTimeout(timer); // Cleanup timer
    }, []); // Run once on mount

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

        // Validation adjusted for roles array
        let validationError: string | null = null;
        const roles = formData.roles || [];
        if (!formData.nombre?.trim()) validationError = "Nombre es requerido.";
        else if (!formData.apellido?.trim()) validationError = "Apellido es requerido.";
        else if (!formData.email?.trim()) validationError = "Email es requerido."; // TODO: Add email format validation
        else if (roles.length === 0) validationError = "Al menos un Rol es requerido.";
        else if ((roles.includes('residente') || roles.includes('director')) && !formData.residenciaId) validationError = "Residencia Asignada es requerida para Directores y/o Residentes.";
        else if (roles.includes('residente') && !formData.dietaId) validationError = "Dieta Predeterminada es requerida para Residentes.";
        else if (roles.includes('residente') && !formData.numeroDeRopa?.trim()) validationError = "Número de Ropa es requerido para Residentes.";

        if (validationError) {
            toast({ title: "Error de Validación", description: validationError, variant: "destructive" });
            setIsSaving(false);
            return;
        }

        console.log("Simulating user creation with data:", formData);
        // TODO: Replace simulation with actual Firebase logic (Auth creation + Firestore doc write)
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Create the new user object with roles array
        const newUser: UserProfile = {
            id: `usr-${Date.now()}`, // Generate mock ID
            nombre: formData.nombre!.trim(),
            apellido: formData.apellido!.trim(),
            email: formData.email!.trim(),
            roles: formData.roles!, // Assign roles array
            isActive: true, // New users are active by default
            residenciaId: (roles.includes('residente') || roles.includes('director')) ? formData.residenciaId || undefined : undefined,
            dietaId: roles.includes('residente') ? formData.dietaId || undefined : undefined,
            numeroDeRopa: formData.numeroDeRopa?.trim() || undefined,
            habitacion: formData.habitacion?.trim() || undefined,
            universidad: formData.universidad?.trim() || undefined,
            carrera: formData.carrera?.trim() || undefined,
            dni: formData.dni?.trim() || undefined,
        };

        toast({
            title: "Usuario Creado (Simulado)",
            description: `Se ha creado el usuario ${newUser.nombre} ${newUser.apellido}.`,
        });

        setUsers(prevUsers => [newUser, ...prevUsers]); // Add to local state

        // Reset form
        setFormData({
            nombre: '', apellido: '', email: '', isActive: true, roles: [], residenciaId: '', dietaId: '', // Reset isActive
            numeroDeRopa: '', habitacion: '', universidad: '', carrera: '', dni: ''
        });
        setIsSaving(false);
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
            isActive: userToEdit.isActive, // Load current isActive status
            roles: userToEdit.roles || [],
            residenciaId: userToEdit.residenciaId || '',
            dietaId: userToEdit.dietaId || '',
            numeroDeRopa: userToEdit.numeroDeRopa || '',
            habitacion: userToEdit.habitacion || '',
            universidad: userToEdit.universidad || '',
            carrera: userToEdit.carrera || '',
            dni: userToEdit.dni || '',
        });
        // Optionally scroll form into view
        // window.scrollTo({ top: 0, behavior: 'smooth' });
      };

      const handleDeleteUser = (userId: string) => {
          const user = users.find(u => u.id === userId);
          if (!user) { toast({ title: "Error", description: "Usuario no encontrado.", variant: "destructive" }); return; }
          console.log("Requesting delete confirmation for user:", userId, user.nombre);
          setUserToDeleteId(userId); // Set the ID
          setIsConfirmingDelete(true); // Open the dialog
      };

      // Added: confirmDeleteUser - Performs delete after confirmation
      const confirmDeleteUser = async () => {
        if (!userToDeleteId) return;
        const userToDelete = users.find(u => u.id === userToDeleteId); // Find user info before filtering
        console.log("Confirmed delete for user ID:", userToDeleteId);
        // TODO: Implement actual Firebase Auth user deletion & Firestore doc deletion
        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 500));
        // Update state
        setUsers(prevUsers => prevUsers.filter(user => user.id !== userToDeleteId));
        toast({ title: "Usuario Eliminado (Simulado)", description: `El usuario ${userToDelete?.nombre || userToDeleteId} ha sido eliminado.` });
        // Close dialog and reset
        setIsConfirmingDelete(false);
        setUserToDeleteId(null);
    };

    // Cancel Edit Mode
    const handleCancelEdit = () => {
      setEditingUserId(null);
      // Reset form to initial state
      setFormData({
        nombre: '', apellido: '', email: '', isActive: true, roles: [], residenciaId: '', dietaId: '', // Reset isActive to true
        numeroDeRopa: '', habitacion: '', universidad: '', carrera: '', dni: ''
    });
      console.log("Cancelled edit.");
    };

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

        console.log("Simulating user update for ID:", editingUserId, "with data:", formData);
        // TODO: Replace simulation with actual Firestore document update
        await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate API delay

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
  