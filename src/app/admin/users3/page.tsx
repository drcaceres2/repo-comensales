"use client";

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth'; // Assuming your custom hook is here
import { UserProfile, UserRole, Residencia, DietaId, CentroCostoId, UserId } from '@/../../shared/models/types'; // Adjust the import path
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase'; // Adjust the import path
import { useRouter } from 'next/navigation';

// Define the callable function types
const createUserCallable = httpsCallable<CreateUserDataPayload, { userId: string }>(functions, 'createUser');
const updateUserCallable = httpsCallable<UpdateUserDataPayload, void>(functions, 'updateUser');
const deleteUserCallable = httpsCallable<DeleteUserDataPayload, void>(functions, 'deleteUser');

interface CreateUserDataPayload {
    email: string;
    password?: string;
    profileData: Omit<UserProfile, "id" | "fechaCreacion" | "ultimaActualizacion" | "lastLogin" | "email"> & { email?: string };
}

interface UpdateUserDataPayload {
    userIdToUpdate: string;
    profileData: Partial<Omit<UserProfile, "id" | "email" | "fechaCreacion" | "ultimaActualizacion" | "lastLogin">>;
}

interface DeleteUserDataPayload {
    userIdToDelete: string;
}

const UserManagementPage: React.FC = () => {
    const { authUser, userProfile, loading, error } = useAuth();
    const router = useRouter();

    const [users, setUsers] = useState<UserProfile[]>([]);
    const [isCreating, setIsCreating] = useState(false);
    const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
    const [newUser, setNewUser] = useState<Partial<UserProfile> & { password?: string }>({
        roles: [],
        isActive: true,
        tieneAutenticacion: true,
        puedeTraerInvitados: 'no',
    });
    const [editedUserData, setEditedUserData] = useState<Partial<UserProfile>>({});

    // State for available options and residence configuration
    const [availableDietas, setAvailableDietas] = useState<{ id: string, nombre: string }[]>([]);
    const [availableCentrosCosto, setAvailableCentrosCosto] = useState<{ id: string, nombre: string }[]>([]);
    const [residencias, setResidencias] = useState<{ id: string, nombre: string }[]>([]);
    const [residenciaConfig, setResidenciaConfig] = useState<Residencia | null>(null); // State to hold the configuration of the selected residence
    console.log(`USERS3: Los estados son loading=${loading} y up.id=${userProfile ? userProfile.id : "nulo"}`);
    useEffect(() => {
        console.log(`USERS3-use effect: Los estados son loading=${loading} y up.id=${userProfile ? userProfile.id : "nulo"}`);
        if (!loading && !userProfile) {
            // Redirect to unauthorized page if not authenticated or no user profile
            router.push('/acceso-no-autorizado');
        } else if (userProfile && !['master', 'admin'].some(role => userProfile.roles.includes(role as UserRole))) {
            // Redirect if authenticated but not master or admin
            router.push('/acceso-no-autorizado');
        } else if (userProfile) {
            // Fetch users if authorized
            fetchUsers();
            // TODO: Fetch available residencias
        }
    }, [authUser, userProfile, loading, error, router]);

    const fetchUsers = async () => {
        // TODO: Implement fetching users from Firestore based on user's role and residence
        // If master, fetch all users. If admin, fetch users within their residence.
        // For now, using a placeholder:
        console.log("Fetching users...");
        // Replace with actual Firestore fetching logic
        const dummyUsers: UserProfile[] = [
            // Add some dummy user data for testing
        ];
        setUsers(dummyUsers);
    };
    
    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newUser.email || !newUser.roles || newUser.nombre === undefined || newUser.apellido === undefined || newUser.nombreCorto === undefined) {
            alert('Email, Name, Last Name, Short Name, and Roles are required.');
            return;
        }

        // Validation for admin creating master user
        if (userProfile?.roles.includes('admin') && newUser.roles.includes('master')) {
            alert('Admin users cannot create master users.');
            return;
        }

        // Validation for non-master role requiring residenceId
        if (!newUser.roles.includes('master') && !newUser.residenciaId) {
            alert('Residencia is required for non-master users.');
            return;
        }

        // TODO: Add validation for custom fields based on residenciaConfig

        try {
            const payload: CreateUserDataPayload = {
                email: newUser.email,
                password: newUser.password,
                profileData: {
                    nombre: newUser.nombre, // Ensure these are not undefined
                    apellido: newUser.apellido, // Ensure these are not undefined
                    nombreCorto: newUser.nombreCorto, // Ensure these are not undefined
                    roles: newUser.roles, // Ensure these are not undefined
                    isActive: newUser.isActive ?? true, // Provide a default if undefined
                    tieneAutenticacion: newUser.tieneAutenticacion ?? true, // Provide a default if undefined
                    puedeTraerInvitados: newUser.puedeTraerInvitados ?? 'no', // Provide a default if undefined
                    residenciaId: newUser.residenciaId,
                    dietaId: newUser.dietaId,
                    numeroDeRopa: newUser.numeroDeRopa,
                    habitacion: newUser.habitacion,
                    universidad: newUser.universidad,
                    carrera: newUser.carrera,
                    dni: newUser.dni,
                    telefonoMovil: newUser.telefonoMovil,
                    fechaDeNacimiento: newUser.fechaDeNacimiento,
                    centroCostoPorDefectoId: newUser.centroCostoPorDefectoId,
                    valorCampoPersonalizado1: newUser.valorCampoPersonalizado1,
                    valorCampoPersonalizado2: newUser.valorCampoPersonalizado2,
                    valorCampoPersonalizado3: newUser.valorCampoPersonalizado3,
                    fotoPerfil: newUser.fotoPerfil ?? null, // Provide a default if undefined
                    asistentePermisos: newUser.asistentePermisos ?? null, // Provide a default if undefined
                    notificacionPreferencias: newUser.notificacionPreferencias ?? null, // Provide a default if undefined
                    // email is explicitly allowed in profileData, but optional
                    email: newUser.email,
                },
            };
            const result = await createUserCallable(payload);
            console.log('User created:', result.data.userId);
            setIsCreating(false);
            setNewUser({
                roles: [],
                isActive: true,
                tieneAutenticacion: true,
                puedeTraerInvitados: 'no',
            }); // Reset form
            fetchUsers(); // Refresh user list
        } catch (error) {
            console.error('Error creating user:', error);
            alert('Failed to create user.');
        }
    };

    const handleEditUser = (user: UserProfile) => {
        setEditingUser(user);
        setEditedUserData({ ...user });
        // TODO: Fetch residence configuration, available dietas and centros de costo for the user's residence
    };

    const handleUpdateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingUser || !editedUserData.roles) {
            alert('No user selected for editing or roles are missing.');
            return;
        }

        // Validation for admin assigning master role
        if (userProfile?.roles.includes('admin') && editedUserData.roles.includes('master')) {
            alert('Admin users cannot assign the master role.');
            return;
        }

        // Validation for non-master role requiring residenceId
        if (!editedUserData.roles.includes('master') && !editedUserData.residenciaId) {
            alert('Residencia is required for non-master users.');
            return;
        }

        // TODO: Add validation for custom fields based on residenciaConfig

        try {
            const payload: UpdateUserDataPayload = {
                userIdToUpdate: editingUser.id,
                profileData: {
                    ...editedUserData,
                },
            };
            await updateUserCallable(payload);
            console.log('User updated:', editingUser.id);
            setEditingUser(null); // Close edit form
            setEditedUserData({}); // Reset edited data
            fetchUsers(); // Refresh user list
        } catch (error) {
            console.error('Error updating user:', error);
            alert('Failed to update user.');
        }
    };

    const handleDeleteUser = async (userId: string) => {
        if (confirm('Are you sure you want to delete this user?')) {
            try {
                const payload: DeleteUserDataPayload = { userIdToDelete: userId };
                await deleteUserCallable(payload);
                console.log('User deleted:', userId);
                fetchUsers(); // Refresh user list
            } catch (error) {
                console.error('Error deleting user:', error);
                alert('Failed to delete user.');
            }
        }
    };

    if (loading) {
        return <div>Loading...</div>;
    }

    if (error) {
        return <div>Error: {error.message}</div>;
    }

    if (!userProfile || !['master', 'admin'].some(role => userProfile.roles.includes(role as UserRole))) {
        return null; // Redirect handled by useEffect
    }

    const isAdmin = userProfile.roles.includes('admin');
    const isMaster = userProfile.roles.includes('master');

    return (
        <div className="container mx-auto p-4">
            <h1 className="text-2xl font-bold mb-4">User Management</h1>

            {/* Create User Form */}
            <button onClick={() => setIsCreating(true)}>Create New User</button>
            {isCreating && (
                <div>
                    <h2>Create User</h2>
                    <form onSubmit={handleCreateUser}>
                        <div>
                            <label>Email:</label>
                            <input
                                type="email"
                                value={newUser.email || ''}
                                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                                required
                            />
                        </div>
                        <div>
                            <label>Password:</label>
                            <input
                                type="password"
                                value={newUser.password || ''}
                                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                                // Password is not required if inviting an existing auth user
                            />
                        </div>
                        <div>
                            <label>Nombre:</label>
                            <input
                                type="text"
                                value={newUser.nombre || ''}
                                onChange={(e) => setNewUser({ ...newUser, nombre: e.target.value })}
                                required
                            />
                        </div>
                        <div>
                            <label>Apellido:</label>
                            <input
                                type="text"
                                value={newUser.apellido || ''}
                                onChange={(e) => setNewUser({ ...newUser, apellido: e.target.value })}
                                required
                            />
                        </div>
                        <div>
                            <label>Nombre Corto:</label>
                            <input
                                type="text"
                                value={newUser.nombreCorto || ''}
                                onChange={(e) => setNewUser({ ...newUser, nombreCorto: e.target.value })}
                                required
                            />
                        </div>
                        {/* Role selection - Master can create master/admin, Admin can create admin/other in their residence */}
                        <div>
                            <label>Roles:</label>
                            <select
                                multiple
                                value={newUser.roles || []}
                                onChange={(e) => {
                                    const selectedOptions = Array.from(e.target.selectedOptions).map((option) => option.value as UserRole);
                                    // Validation for admin creating master user
                                    if (isAdmin && selectedOptions.includes('master')) {
                                        alert('Admin users cannot create master users.');
                                        return;
                                    }
                                    setNewUser({ ...newUser, roles: selectedOptions });
                                }}
                                required
                            >
                                {isMaster && <option value="master">Master</option>}
                                <option value="admin">Admin</option>
                                {/* Add other roles as needed */}
                            </select>
                        </div>
                        {/* Residencia selection - Mandatory for non-master roles */}
                        {!newUser.roles?.includes('master') && (
                            <div>
                                <label>Residencia:</label>
                                <select
                                    value={newUser.residenciaId || ''}
                                    onChange={(e) => setNewUser({ ...newUser, residenciaId: e.target.value })}
                                    required
                                >
                                    <option value="">Select Residencia</option>
                                    {/* Map through available residencias */}
                                    {/* {residencias.map(residencia => <option key={residencia.id} value={residencia.id}>{residencia.nombre}</option>)} */}
                                </select>
                            </div>
                        )}

                        {/* Dieta selection - Filtered by selected residence */}
                        {newUser.residenciaId && (
                            <div>
                                <label>Dieta:</label>
                                <select
                                    value={newUser.dietaId || ''}
                                    onChange={(e) => setNewUser({ ...newUser, dietaId: e.target.value })}
                                >
                                    <option value="">Select Dieta</option>
                                    {/* Map through available dietas for the selected residence */}
                                    {/* {availableDietas.map(dieta => <option key={dieta.id} value={dieta.id}>{dieta.nombre}</option>)} */}
                                </select>
                            </div>
                        )}

                        {/* Centro de Costo selection - Filtered by selected residence */}
                        {newUser.residenciaId && (
                            <div>
                                <label>Centro de Costo por Defecto:</label>
                                <select
                                    value={newUser.centroCostoPorDefectoId || ''}
                                    onChange={(e) => setNewUser({ ...newUser, centroCostoPorDefectoId: e.target.value })}
                                >
                                    <option value="">Select Centro de Costo</option>
                                    {/* Map through available centros de costo for the selected residence */}
                                    {/* {availableCentrosCosto.map(centro => <option key={centro.id} value={centro.id}>{centro.nombre}</option>)} */}
                                </select>
                            </div>
                        )}

                        {/* TODO: Add custom fields for creation based on selected residence's configuration */}

                        <button type="submit">Create User</button>
                        <button onClick={() => setIsCreating(false)}>Cancel</button>
                    </form>
                </div>
            )}

            {/* User Table */}
            {!isCreating && !editingUser && (
                <table>
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Email</th>
                            <th>Roles</th>
                            <th>Residencia</th>
                            <th>Is Active</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.map((user) => (
                            <tr key={user.id}>
                                <td>{user.nombre} {user.apellido}</td>
                                <td>{user.email}</td>
                                <td>{user.roles.join(', ')}</td>
                                <td>{user.residenciaId || 'N/A'}</td>
                                <td>{user.isActive ? 'Yes' : 'No'}</td>
                                <td>
                                    <button onClick={() => handleEditUser(user)}>Edit</button>
                                    {/* Prevent deleting own user or master users (if not master) */}
                                    {userProfile?.id !== user.id && !(isAdmin && user.roles.includes('master')) && (
                                        <button onClick={() => handleDeleteUser(user.id)}>Delete</button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}

            {/* Edit User Form */}
            {editingUser && (
                <div>
                    <h2>Edit User</h2>
                    <form onSubmit={handleUpdateUser}>
                        {/* Non-modifiable fields */}
                        <div>
                            <label>User ID:</label>
                            <input type="text" value={editingUser.id} disabled />
                        </div>
                        <div>
                            <label>Email:</label>
                            <input type="email" value={editingUser.email} disabled />
                        </div>
                        {editingUser.fechaCreacion && (
                            <div>
                                <label>Creation Date:</label>
                                <input type="text" value={new Date(editingUser.fechaCreacion).toLocaleDateString()} disabled />
                            </div>
                        )}
                        {editingUser.ultimaActualizacion && (
                            <div>
                                <label>Last Updated:</label>
                                <input type="text" value={new Date(editingUser.ultimaActualizacion).toLocaleDateString()} disabled />
                            </div>
                        )}
                        {editingUser.lastLogin && (
                            <div>
                                <label>Last Login:</label>
                                <input type="text" value={new Date(editingUser.lastLogin).toLocaleDateString()} disabled />
                            </div>
                        )}

                        {/* Editable fields */}
                        <div>
                            <label>Nombre:</label>
                            <input
                                type="text"
                                value={editedUserData.nombre || ''}
                                onChange={(e) => setEditedUserData({ ...editedUserData, nombre: e.target.value })}
                                required
                            />
                        </div>
                        <div>
                            <label>Apellido:</label>
                            <input
                                type="text"
                                value={editedUserData.apellido || ''}
                                onChange={(e) => setEditedUserData({ ...editedUserData, apellido: e.target.value })}
                                required
                            />
                        </div>
                        <div>
                            <label>Nombre Corto:</label>
                            <input
                                type="text"
                                value={editedUserData.nombreCorto || ''}
                                onChange={(e) => setEditedUserData({ ...editedUserData, nombreCorto: e.target.value })}
                                required
                            />
                        </div>

                        {/* Role selection - Master can create master/admin, Admin can create admin/other in their residence */}
                        <div>
                            <label>Roles:</label>
                            <select
                                multiple
                                value={editedUserData.roles || []}
                                onChange={(e) => {
                                    const selectedOptions = Array.from(e.target.selectedOptions).map((option) => option.value as UserRole);
                                    // Validation for role selection based on current user's role and residence
                                    if (userProfile?.roles.includes('admin') && selectedOptions.includes('master')) {
                                        alert('Admin users cannot assign the master role.');
                                        return;
                                    }
                                    setEditedUserData({ ...editedUserData, roles: selectedOptions });
                                }}
                                required
                            >
                                {userProfile?.roles.includes('master') && <option value="master">Master</option>}
                                <option value="admin">Admin</option>
                                {/* Add other roles as needed */}
                            </select>
                        </div>

                        {/* Residencia selection - Mandatory for non-master roles */}
                        {!editedUserData.roles?.includes('master') && (
                            <div>
                                <label>Residencia:</label>
                                <select
                                    value={editedUserData.residenciaId || ''}
                                    onChange={(e) => {
                                        // Fetch residence-specific data (dietas, centrosCosto, custom fields) when residence changes
                                        setEditedUserData({ ...editedUserData, residenciaId: e.target.value });
                                        // TODO: Fetch residence data and update available options and custom field configurations
                                    }}
                                    required
                                >
                                    <option value="">Select Residencia</option>
                                    {/* Map through available residencias */}
                                    {/* {residencias.map(residencia => <option key={residencia.id} value={residencia.id}>{residencia.nombre}</option>)} */}
                                </select>
                            </div>
                        )}

                        {/* Dieta selection - Filtered by selected residence */}
                        {editedUserData.residenciaId && (
                            <div>
                                <label>Dieta:</label>
                                <select
                                    value={editedUserData.dietaId || ''}
                                    onChange={(e) => setEditedUserData({ ...editedUserData, dietaId: e.target.value })}
                                >
                                    <option value="">Select Dieta</option>
                                    {/* Map through available dietas for the selected residence */}
                                    {/* {availableDietas.map(dieta => <option key={dieta.id} value={dieta.id}>{dieta.nombre}</option>)} */}
                                </select>
                            </div>
                        )}

                        {/* Centro de Costo selection - Filtered by selected residence */}
                        {editedUserData.residenciaId && (
                            <div>
                                <label>Centro de Costo por Defecto:</label>
                                <select
                                    value={editedUserData.centroCostoPorDefectoId || ''}
                                    onChange={(e) => setEditedUserData({ ...editedUserData, centroCostoPorDefectoId: e.target.value })}
                                >
                                    <option value="">Select Centro de Costo</option>
                                    {/* Map through available centros de costo for the selected residence */}
                                    {/* {availableCentrosCosto.map(centro => <option key={centro.id} value={centro.id}>{centro.nombre}</option>)} */}
                                </select>
                            </div>
                        )}

                        {/* Custom Fields based on Residence Configuration */}
                        {/* Example for Custom Field 1 */}
                        {residenciaConfig?.campoPersonalizado1_isActive && (
                            <div>
                                <label>{residenciaConfig.campoPersonalizado1_etiqueta || 'Custom Field 1'}:</label>
                                {residenciaConfig.campoPersonalizado1_tamanoTexto === 'textArea' ? (
                                    <textarea
                                        value={editedUserData.valorCampoPersonalizado1 || ''}
                                        onChange={(e) => setEditedUserData({ ...editedUserData, valorCampoPersonalizado1: e.target.value })}
                                        // Add validation based on residenciaConfig.campoPersonalizado1_necesitaValidacion and .campoPersonalizado1_regexValidacion
                                        // Add disabled based on residenciaConfig.campoPersonalizado1_puedeModDirector (if current user is not director) and .campoPersonalizado1_puedeModInteresado (if editing own profile)
                                    />
                                ) : (
                                    <input
                                        type="text"
                                        value={editedUserData.valorCampoPersonalizado1 || ''}
                                        onChange={(e) => setEditedUserData({ ...editedUserData, valorCampoPersonalizado1: e.target.value })}
                                        // Add validation based on residenciaConfig.campoPersonalizado1_necesitaValidacion and .campoPersonalizado1_regexValidacion
                                        // Add disabled based on residenciaConfig.campoPersonalizado1_puedeModDirector (if current user is not director) and .campoPersonalizado1_puedeModInteresado (if editing own profile)
                                    />
                                )}
                            </div>
                        )}
                        {/* Repeat for Custom Field 2 and 3 */}

                        {/* Other fields */}
                        <div>
                            <label>Is Active:</label>
                            <input
                                type="checkbox"
                                checked={editedUserData.isActive || false}
                                onChange={(e) => setEditedUserData({ ...editedUserData, isActive: e.target.checked })}
                            />
                        </div>
                        {/* Add other fields as needed */}


                        <button type="submit">Update User</button>
                        <button onClick={() => setEditingUser(null)}>Cancel</button>
                    </form>
                </div>
            )}
        </div>
    );
};

export default UserManagementPage;
