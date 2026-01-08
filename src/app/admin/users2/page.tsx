"use client";

import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
// import { Checkbox } from "@/components/ui/checkbox"; // Uncomment if Checkbox is needed

import { getFunctions, httpsCallable } from 'firebase/functions';
import { auth, db } from '@/lib/firebase';
import React, { useState, useEffect, useCallback } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';

import { UserProfile } from '@/../../shared/models/types';
import { doc, getDoc, getDocs, collection, query } from 'firebase/firestore';

export interface UserDataForCreation {
  email: string;
  password?: string;
  displayName?: string;
  roles?: string[];
  residenciaId?: string;
}

export interface UserDataForUpdate {
  uid: string;
  email?: string;
  displayName?: string;
  roles?: string[];
  residenciaId?: string;
  password?: string;
}

export interface DeleteUserData {
  uid: string;
}

const functions = getFunctions(auth.app);
const createUserCallable = httpsCallable<UserDataForCreation, { uid: string }>(functions, 'createUser');
const updateUserCallable = httpsCallable<UserDataForUpdate, void>(functions, 'updateUser');
const deleteUserCallable = httpsCallable<DeleteUserData, void>(functions, 'deleteUser');

// Extending UserProfile to include password for creation/update forms locally
interface ExtendedUserProfile extends Omit<UserProfile, 'id'> {
  password?: string;
}

interface ExtendedEditingUser extends UserProfile {
  password?: string;
}

const AdminUsersPage = () => {
  const [user, authFirebaseLoading, authFirebaseError] = useAuthState();
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const router = useRouter();
  const { toast } = useToast();

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  
  const [newUser, setNewUser] = useState<ExtendedUserProfile>({
    nombre: '',
    apellido: '',
    email: '',
    nombreCorto: '',
    fotoPerfil: null,
    tieneAutenticacion: true,
    roles: [],
    isActive: true,
    residenciaId: null,
    dietaId: undefined,
    fechaDeNacimiento: null,
    telefonoMovil: undefined,
    dni: undefined,
    numeroDeRopa: undefined,
    habitacion: undefined,
    universidad: undefined,
    carrera: undefined,
    puedeTraerInvitados: 'no',
    asistentePermisos: null,
    notificacionPreferencias: null,
    centroCostoPorDefectoId: undefined,
    valorCampoPersonalizado1: undefined,
    valorCampoPersonalizado2: undefined,
    valorCampoPersonalizado3: undefined,
    password: '', 
  });

  const [editingUser, setEditingUser] = useState<ExtendedEditingUser | null>(null);
  const [deletingUser, setDeletingUser] = useState<UserProfile | null>(null);
  const [residenciaOptions, setResidenciaOptions] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (authFirebaseLoading) return;

    if (authFirebaseError) {
        console.error("Firebase Auth Error:", authFirebaseError);
        toast({ title: "Error de Autenticación", description: authFirebaseError.message, variant: "destructive" });
        router.replace('/');
        return;
    }

    if (!user) {
        router.replace('/');
        return;
    }
    
    const adminDocRef = doc(db, "users", user.uid);

    getDoc(adminDocRef)
      .then((docSnap) => {
          if (docSnap.exists()) {
              setUserProfile(docSnap.data() as UserProfile);
          } else {
              console.error("Admin's profile not found");
              router.replace('/');
          }
      })
      .catch((error) => {
          console.error("Error fetching admin's profile:", error);
          setUserProfile(null);
          router.replace('/');
      });
  }, [user, authFirebaseLoading, authFirebaseError, router, toast]);

  useEffect(() => {
    if (!authFirebaseLoading) {
      const hasRequiredRole = userProfile?.roles?.includes('master') || userProfile?.roles?.includes('admin');
      if (user && hasRequiredRole) {
        fetchUsers();
        fetchResidencias();
      } else if (user && userProfile) { 
         // Only redirect if user is loaded and profile is loaded but role is missing
         // Avoid redirecting while profile is still being fetched (userProfile is null initially)
         // But here userProfile is null initially so we need to be careful.
         // Ideally this check should be inside the getDoc .then block or have a separate loading state for profile
      }
    }
  }, [user, userProfile, authFirebaseLoading]); // Removed router from deps to avoid loop if redirects happen

  const fetchResidencias = async () => {
    try {
      const residenciasRef = collection(db, 'residencias');
      const q = query(residenciasRef);
      const querySnapshot = await getDocs(q);
      const residencias = querySnapshot.docs.map(doc => ({ id: doc.id, name: doc.data().nombre }));
      setResidenciaOptions(residencias);
    } catch (error) {
      console.error("Error fetching residences:", error);
    }
  };

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
        const usersCol = collection(db, "users");
        const querySnapshot = await getDocs(usersCol);
        const usersData: UserProfile[] = [];
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            // Safe casting/mapping
            usersData.push({
                id: doc.id,
                nombre: data.nombre || '',
                apellido: data.apellido || '',
                email: data.email || '',
                roles: data.roles || [],
                residenciaId: data.residenciaId || null,
                isActive: data.isActive ?? true,
                nombreCorto: data.nombreCorto || '',
                fotoPerfil: data.fotoPerfil || null,
                tieneAutenticacion: data.tieneAutenticacion ?? true,
                // Map other optional fields if necessary for the table/edit
            } as UserProfile);
        });
        setUsers(usersData.sort((a, b) => (a.apellido + a.nombre).localeCompare(b.apellido + b.nombre))); 
    } catch (error) {
        console.error("Error fetching users:", error);
        toast({
            title: "Error",
            description: "No se pudieron obtener los usuarios.",
            variant: "destructive",
        });
    } finally {
        setLoading(false);
    }
  }, [toast]); 


  const handleCreateUser = async () => {
    try {
      // Map extended user to creation DTO
      const creationData: UserDataForCreation = {
          email: newUser.email,
          password: newUser.password,
          displayName: `${newUser.nombre} ${newUser.apellido}`,
          roles: newUser.roles,
          residenciaId: newUser.residenciaId || undefined
      };

      await createUserCallable(creationData);
      toast({
        title: "User created.",
        description: `User ${newUser.email} has been created.`,
      });
      setIsCreateDialogOpen(false);
      // Reset form
      setNewUser({
        nombre: '', apellido: '', email: '', nombreCorto: '', fotoPerfil: null, tieneAutenticacion: true,
        roles: [], isActive: true, residenciaId: null, password: '', puedeTraerInvitados: 'no'
      });
      fetchUsers();
    } catch (error: any) {
      console.error("Error creating user:", error);
      toast({
        title: "Error creating user.",
        description: error.message || "An unexpected error occurred.",
        variant: "destructive",
      });
    }
  };

  const handleUpdateUser = async () => {
    if (!editingUser) return;
    try {
      const updateData: UserDataForUpdate = {
        uid: editingUser.id,
        email: editingUser.email,
        displayName: `${editingUser.nombre} ${editingUser.apellido}`,
        roles: editingUser.roles,
        residenciaId: editingUser.residenciaId || undefined,
        password: editingUser.password || undefined
      };
      
      await updateUserCallable(updateData);
      toast({
        title: "User updated.",
        description: `User ${editingUser.email} has been updated.`,
      });
      setIsEditDialogOpen(false);
      setEditingUser(null);
      fetchUsers();
    } catch (error: any) {
      console.error("Error updating user:", error);
      toast({
        title: "Error updating user.",
        description: error.message || "An unexpected error occurred.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteUser = async () => {
    if (!deletingUser) return;
    try {
      await deleteUserCallable({ uid: deletingUser.id });
      toast({
        title: "User deleted.",
        description: `User ${deletingUser.email} has been deleted.`,
      });
      setIsDeleteDialogOpen(false);
      setDeletingUser(null);
      fetchUsers();
    } catch (error: any) {
      console.error("Error deleting user:", error);
      toast({
        title: "Error deleting user.",
        description: error.message || "An unexpected error occurred.",
        variant: "destructive",
      });
    }
  };

  if (authFirebaseLoading || loading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">User Management</h1>
      <Button className="mb-4" onClick={() => setIsCreateDialogOpen(true)}>Create New User</Button>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Email</TableHead>
            <TableHead>Nombre completo</TableHead>
            <TableHead>Roles</TableHead>
            <TableHead>Residencia</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((usr) => (
            <TableRow key={usr.id}>
              <TableCell>{usr.email}</TableCell>
              <TableCell>{`${usr.nombre} ${usr.apellido}`}</TableCell>
              <TableCell>{usr.roles.join(', ')}</TableCell>
              <TableCell>{usr.residenciaId || 'N/A'}</TableCell>
              <TableCell>
                <Button variant="outline" size="sm" className="mr-2" onClick={() => {
                  setEditingUser({...usr, password: ''}); // Initialize with empty password for edit
                  setIsEditDialogOpen(true);
                }}>Edit</Button>
                <Button variant="destructive" size="sm" onClick={() => {
                    setDeletingUser(usr);
                    setIsDeleteDialogOpen(true);
                }} 
                disabled={userProfile?.id === usr.id || usr.roles.includes('master')}
                >Delete</Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Create User Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New User</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="email" className="text-right">Email</Label>
              <Input id="email" type="email" value={newUser.email} onChange={(e) => setNewUser({...newUser, email: e.target.value})} className="col-span-3" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="password" className="text-right">Contraseña</Label>
              <Input id="password" type="password" value={newUser.password || ''} onChange={(e) => setNewUser({...newUser, password: e.target.value})} className="col-span-3" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="nombre" className="text-right">Nombre</Label>
              <Input id="nombre" value={newUser.nombre} onChange={(e) => setNewUser({...newUser, nombre: e.target.value})} className="col-span-3" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="apellido" className="text-right">Apellido</Label>
              <Input id="apellido" value={newUser.apellido} onChange={(e) => setNewUser({...newUser, apellido: e.target.value})} className="col-span-3" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="roles" className="text-right">Roles (comma separated)</Label>
              <Input id="roles" value={newUser.roles.join(', ')} onChange={(e) => setNewUser({...newUser, roles: e.target.value.split(',').map(r => r.trim() as any)})} className="col-span-3" />
            </div>
             <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="residencia" className="text-right">Residencia</Label>
               <Select onValueChange={(value) => setNewUser({...newUser, residenciaId: value || null})} value={newUser.residenciaId || ''}>
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select a residence" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="none">No Residence</SelectItem> {/* Use a specific value for none */}
                  {residenciaOptions.map(res => (
                    <SelectItem key={res.id} value={res.id}>{res.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateUser}>Create User</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
          </DialogHeader>
          {editingUser && (
            <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="editEmail" className="text-right">Email (Read Only)</Label>
                    <Input id="editEmail" value={editingUser.email || ''} className="col-span-3" readOnly />
                </div>
                 <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="editNombre" className="text-right">Nombre</Label>
                    <Input id="editNombre" value={editingUser.nombre || ''} onChange={(e) => setEditingUser({...editingUser, nombre: e.target.value})} className="col-span-3" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="editApellido" className="text-right">Apellido</Label>
                    <Input id="editApellido" value={editingUser.apellido || ''} onChange={(e) => setEditingUser({...editingUser, apellido: e.target.value})} className="col-span-3" />
                </div>
                 <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="editPassword" className="text-right">Password (Optional)</Label>
                    <Input id="editPassword" type="password" value={editingUser.password || ''} onChange={(e) => setEditingUser({...editingUser, password: e.target.value})} placeholder="Leave blank to keep current" className="col-span-3" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="editRoles" className="text-right">Roles</Label>
                    <Input id="editRoles" value={editingUser.roles?.join(', ') || ''} onChange={(e) => setEditingUser({...editingUser, roles: e.target.value.split(',').map(role => role.trim() as any)})} className="col-span-3" />
                </div>
                 <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="editResidencia" className="text-right">Residencia</Label>
                    <Select onValueChange={(value) => setEditingUser({...editingUser, residenciaId: value === "none" ? null : value})} value={editingUser.residenciaId || 'none'}>
                        <SelectTrigger className="col-span-3">
                            <SelectValue placeholder="Select a residence" />
                        </SelectTrigger>
                        <SelectContent>
                             <SelectItem value="none">No Residence</SelectItem>
                            {residenciaOptions.map(res => (
                                <SelectItem key={res.id} value={res.id}>{res.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => {setIsEditDialogOpen(false); setEditingUser(null);}}>Cancel</Button>
            <Button onClick={handleUpdateUser}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

       {/* Delete User Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the user {deletingUser?.email}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {setIsDeleteDialogOpen(false); setDeletingUser(null);}}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteUser}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
};

export default AdminUsersPage;
