"use client";

import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast'; // Assuming you have a custom hook for toasts
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { getFunctions, httpsCallable } from 'firebase/functions';
import { app, auth, db } from '@/lib/firebase'; // Assuming you have a firebase client initialized
import { useState, useEffect } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';

import { UserProfile } from '@/../../shared/models/types'; // Import interfaces
import { doc, getDoc, getDocs, collection, query, where } from 'firebase/firestore';

export interface UserDataForCreation {
  email: string;
  password?: string; // Optional: if you allow setting passwords directly
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
  password?: string; // Optional: for password reset/update
}

export interface DeleteUserData {
  uid: string;
}

const functions = getFunctions(auth.app);
const createUserCallable = httpsCallable<UserDataForCreation, { uid: string }>(functions, 'createUser');
const updateUserCallable = httpsCallable<UserDataForUpdate, void>(functions, 'updateUser');
const deleteUserCallable = httpsCallable<DeleteUserData, void>(functions, 'deleteUser');
const listUsersCallable = httpsCallable<{}, UserProfile[]>(functions, 'listUsers');

const AdminUsersPage = () => {
  const [authUser, authFirebaseLoading, authFirebaseError] = useAuthState(auth);
  const [adminUserProfile, setAdminUserProfile] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [adminProfileError, setAdminProfileError] = useState<string | null>(null);
  const [isAuthorized, setIsAuthorized] = useState<boolean>(false);
  // const { user, userProfile, loading: authLoading } = useAuth(); // Get auth state and user profile
  const router = useRouter();
  const { toast } = useToast();

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [newUser, setNewUser] = useState<UserDataForCreation>({ email: '', roles: ['user'] });
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [deletingUser, setDeletingUser] = useState<UserProfile | null>(null);
  const [residenciaOptions, setResidenciaOptions] = useState<{ id: string; name: string }[]>([]); // Populate this with actual residences

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
    if (!authFirebaseLoading) {
      // Check for roles after auth state is loaded
      const hasRequiredRole = userProfile?.roles?.includes('master') || userProfile?.roles?.includes('admin');
      if (!authUser || !hasRequiredRole) {
        router.push('/acceso-no-autorizado'); // Redirect if not authorized
      } else {
        fetchUsers();
        fetchResidencias(); // Fetch residences for dropdown
      }
    }
  }, [user, userProfile, authLoading, router]);

  const fetchResidencias = async () => {
    try {
      const residenciasRef = collection(db, 'residencias'); // Assuming 'residencias' is your collection name
      const q = query(residenciasRef);
      const querySnapshot = await getDocs(q);
      const residencias = querySnapshot.docs.map(doc => ({ id: doc.id, name: doc.data().nombre })); // Assuming 'nombre' is the residence name field
      setResidenciaOptions(residencias);
    } catch (error) {
      console.error("Error fetching residences:", error);
    }
  };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      // TODO: Implement fetching users based on user profile roles (master fetches all, admin fetches within their residence)
      console.error("Error fetching users:", error);
      toast({
        title: "Error fetching users.",
        description: "Could not load user list.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async () => {
    try {
      await createUserCallable(newUser);
      toast({
        title: "User created.",
        description: `User ${newUser.email} has been created.`,
      });
      setIsCreateDialogOpen(false);
      setNewUser({ email: '', roles: ['user'] });
      fetchUsers(); // Refresh list
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
        uid: editingUser.id, // Assuming uid is stored as 'id' in UserProfile
      };
      await updateUserCallable(updateData);
      toast({
        title: "User updated.",
        description: `User ${editingUser.email} has been updated.`,
      });
      setIsEditDialogOpen(false);
      setEditingUser(null);
      fetchUsers(); // Refresh list
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
      await deleteUserCallable({ uid: deletingUser.id }); // Assuming uid is stored as 'id' in UserProfile
      toast({
        title: "User deleted.",
        description: `User ${deletingUser.email} has been deleted.`,
      });
      setIsDeleteDialogOpen(false);
      setDeletingUser(null);
      fetchUsers(); // Refresh list
    } catch (error: any) {
      console.error("Error deleting user:", error);
      toast({
        title: "Error deleting user.",
        description: error.message || "An unexpected error occurred.",
        variant: "destructive",
      });
      if (error.code === 'functions/invalid-argument') {
         // Handle specific error like attempting to delete self or the master user
         toast({
            title: "Action not allowed.",
            description: "Cannot delete this user.",
            variant: "destructive",
          });
      }
    }
  };

  if (authLoading || loading) {
    return <div>Loading...</div>; // Or a more sophisticated loading spinner
  }

  // Check again after loading if user or profile are not available (should be handled by the useEffect redirect)
  if (!user || !(userProfile?.roles?.includes('master') || userProfile?.roles?.includes('admin'))) {
     return null; // Should not reach here due to redirect
  }


  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">User Management</h1>
      {/* TODO: Implement filtering and sorting */}
      <Button className="mb-4" onClick={() => setIsCreateDialogOpen(true)}>Create New User</Button>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Email</TableHead>
            <TableHead>Display Name</TableHead>
            <TableHead>Roles</TableHead>
            <TableHead>Residencia</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.id}>
              <TableCell>{user.email}</TableCell>
              <TableCell>{user.displayName}</TableCell>
              <TableCell>{user.roles.join(', ')}</TableCell>
              <TableCell>{user.residenciaId || 'N/A'}</TableCell>
              <TableCell>
                <Button variant="outline" size="sm" className="mr-2" onClick={() => {
                  setEditingUser(user);
                  setIsEditDialogOpen(true);
                }}>Edit</Button>
                <Button variant="destructive" size="sm" onClick={() => {
                    setDeletingUser(user);
                    setIsDeleteDialogOpen(true);
                }} {/* TODO: Check if deletion is allowed based on roles and user being deleted */}
                disabled={userProfile?.uid === user.uid || user.roles.includes('master')} // Prevent deleting self or master
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
              <Label htmlFor="password" className="text-right">Password</Label>
              <Input id="password" type="password" value={newUser.password || ''} onChange={(e) => setNewUser({...newUser, password: e.target.value})} className="col-span-3" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="nombre" className="text-right">Nombre</Label>
              <Input id="nombre" value={newUser.profileData?.nombre || ''} onChange={(e) => setNewUser({...newUser, profileData: {...newUser.profileData, nombre: e.target.value}})} className="col-span-3" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="apellido" className="text-right">Apellido</Label>
              <Input id="apellido" value={newUser.profileData?.apellido || ''} onChange={(e) => setNewUser({...newUser, profileData: {...newUser.profileData, apellido: e.target.value}})} className="col-span-3" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="roles" className="text-right">Roles</Label>
               {/* TODO: Implement role selection based on userProfile and selected residence */}
              <Input id="roles" value={newUser.profileData?.roles?.join(', ') || ''} onChange={(e) => setNewUser({...newUser, profileData: {...newUser.profileData, roles: e.target.value.split(',').map(role => role.trim()) as any}})} className="col-span-3" />
            </div>
             <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="residencia" className="text-right">Residencia</Label>
               <Select onValueChange={(value) => setNewUser({...newUser, profileData: {...newUser.profileData, residenciaId: value || null}})} value={newUser.profileData?.residenciaId || ''}>
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select a residence" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="">No Residence</SelectItem> {/* Only allow 'No Residence' for master users */}
                  {residenciaOptions.map(res => (
                    <SelectItem key={res.id} value={res.id}>{res.name}</SelectItem>
                  ))} {/* TODO: Filter residences based on userProfile */}
                    onCheckedChange={(checked) => {
                       const updatedRoles = checked ? [...(newUser.roles || []), 'admin'] : (newUser.roles || []).filter(role => role !== 'admin');
                       setNewUser({...newUser, roles: updatedRoles});
                    }}
                 />
                 <Label htmlFor="admin-role">Admin</Label>
                 <Checkbox
                    id="user-role"
                    checked={newUser.roles?.includes('user')}
                     onCheckedChange={(checked) => {
                       const updatedRoles = checked ? [...(newUser.roles || []), 'user'] : (newUser.roles || []).filter(role => role !== 'user');
                       setNewUser({...newUser, roles: updatedRoles});
                    }}
                 />
                 <Label htmlFor="user-role">User</Label>
                {/* Add other roles as needed */}
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
                    <Input id="editPassword" type="password" value="" onChange={(e) => setEditingUser({...editingUser, password: e.target.value})} placeholder="Leave blank to keep current password" className="col-span-3" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                    {/* TODO: Implement editing customized fields */}
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="editRoles" className="text-right">Roles</Label>
                    <Input id="editRoles" value={editingUser.roles?.join(', ') || ''} onChange={(e) => setEditingUser({...editingUser, roles: e.target.value.split(',').map(role => role.trim()) as any})} className="col-span-3" />
                </div>
                 <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="editResidencia" className="text-right">Residencia (Optional)</Label>
                    <Select onValueChange={(value) => setEditingUser({...editingUser, residenciaId: value || null})} value={editingUser.residenciaId || ''}>
                        <SelectTrigger className="col-span-3">
                            <SelectValue placeholder="Select a residence" />
                        </SelectTrigger>
                        <SelectContent>
                             <SelectItem value="">No Residence</SelectItem> {/* Only allow 'No Residence' for master users */}
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
      {/* TODO: Use AlertDialog component */}
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
