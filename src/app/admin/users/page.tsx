'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox"; // Import Checkbox
import { Switch } from "@/components/ui/switch"; // Import Switch
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
// Import types from the model file (UserProfile now has roles: UserRole[])
import { UserProfile, UserRole, ResidenciaId, DietaId } from '@/models/firestore';

// Define available roles for the checkboxes
const availableRoles: UserRole[] = ['residente', 'director', 'admin', 'master']; // Add/remove roles as needed

// Mock residences data
const mockResidences: Record<ResidenciaId, { nombre: string }> = {
    'res-guaymura': { nombre: 'Residencia Guaymura' },
    'res-del-valle': { nombre: 'Residencia Del Valle' },
    'res-los-andes': { nombre: 'Residencia Los Andes' },
};

// Mock diets data
const mockDietas: Record<DietaId, { nombre: string }> = {
    'dieta-std-g': { nombre: 'Standard'},
    'dieta-celi-g': { nombre: 'Sin Gluten (Celíaco)'},
    'dieta-veggie-g': { nombre: 'Vegetariana'},
};


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

// Helper type for form state, using roles array
type UserFormData = Partial<Omit<UserProfile, 'id' | 'roles'>> & { // Keep isActive here now
    // Use roles array
    roles: UserRole[];
    residenciaId?: ResidenciaId | '';
    dietaId?: DietaId | '';
};

export default function UserManagementPage() {
    const { toast } = useToast();
    // Initialize form state with roles as empty array
    const [formData, setFormData] = useState<UserFormData>({
        nombre: '',
        apellido: '',
        email: '',
        isActive: true, // Default new users to active
        roles: [], // Initialize roles as empty array
        residenciaId: '',
        dietaId: '',
        numeroDeRopa: '',
        habitacion: '',
        universidad: '',
        carrera: '',
        dni: '',
    });
    const [isSaving, setIsSaving] = useState(false);
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [isLoadingUsers, setIsLoadingUsers] = useState(true);
    const [editingUserId, setEditingUserId] = useState<string | null>(null); // State to track editing
    const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
    const [userToDeleteId, setUserToDeleteId] = useState<string | null>(null);

    const [residences, setResidences] = useState<Record<ResidenciaId, { nombre: string }>>(mockResidences);
    const [dietas, setDietas] = useState<Record<DietaId, { nombre: string }>>(mockDietas);

    useEffect(() => {
        setIsLoadingUsers(true);
        const timer = setTimeout(() => {
            setUsers(mockUsers);
            setIsLoadingUsers(false);
        }, 800);
        return () => clearTimeout(timer);
    }, []);

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
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Create the new user object with roles array
        const newUser: UserProfile = {
            id: `usr-${Date.now()}`,
            nombre: formData.nombre!.trim(),
            apellido: formData.apellido!.trim(),
            email: formData.email!.trim(),
            roles: formData.roles!, // Assign roles array
            isActive: true,
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

        setUsers(prevUsers => [newUser, ...prevUsers]);

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
        await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate API delay

        // Find the original user to preserve ID and potentially other immutable fields like isActive
        const originalUser = users.find(u => u.id === editingUserId);
        if (!originalUser) {
            toast({ title: "Error", description: "No se encontró el usuario original para actualizar.", variant: "destructive" });
            setIsSaving(false);
            return;
        }


        // Create the updated user object
        const updatedUser: UserProfile = {
            ...originalUser, // Preserve original ID, isActive, etc.
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
            description: `Se ha actualizado el usuario ${updatedUser.nombre} ${updatedUser.apellido}.`,
        });

        handleCancelEdit(); // Reset form and exit edit mode
        setIsSaving(false);
    };    

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

    // Check if Residencia is required based on current roles
    const isResidenciaRequired = formData.roles.includes('residente') || formData.roles.includes('director');
    // Check if Dieta is required/applicable based on current roles
    const isDietaApplicable = formData.roles.includes('residente');
    // Check if Número de Ropa is required
    const isNumeroDeRopaRequired = formData.roles.includes('residente');

    return (
        <div className="container mx-auto p-4 space-y-6">
            <h1 className="text-2xl font-bold">Gestión de Usuarios</h1>

            <Card>
                {/* --- Dynamically update Title and Submit handler --- */}
                <CardHeader>
                  <CardTitle>{editingUserId ? 'Editar Usuario' : 'Crear Nuevo Usuario'}</CardTitle>
                  <CardDescription>{editingUserId ? 'Modifique los detalles del usuario.' : 'Complete los detalles para añadir un nuevo usuario.'}</CardDescription>
                </CardHeader>
                <form onSubmit={editingUserId ? handleUpdateUser : handleCreateUser}>
                    <CardContent className="space-y-4">
                        {/* Nombre y Apellido */}
                        {/* ... keep existing form fields ... */}
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
        </div>
    );
}
