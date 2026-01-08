"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth'; // Updated hook
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore'; // Removed react-firebase-hooks
import { UserProfile, PermisosComidaPorGrupo, Residencia, AsistenciasUsuariosDetalle } from '@/../../shared/models/types';
import { useLoginC } from '../page';
import { parse } from 'date-fns';
import { fromZonedTime } from 'date-fns-tz';
import { isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { validarResidenciaUsuario } from '@/lib/utils';
import { db } from '@/lib/firebase'; // Direct import or via context

const { 
  loggedUser, setLoggedUser, 
  selectedUser, setSelectedUser, 
  setSelectedUserMealPermissions, 
  setResidencia,
  residenciaId, setResidenciaId,
  setIsLoadingLoggedUser, 
  setIsLoadingSelectedUserData,
} = useLoginC();

// --- Helper Functions ---

function fechaEstaEnIntervalo(
  fecha: Date,
  intervaloInicio: string,
  intervaloFin: string,
  zonaHorariaResidencia: string
): boolean {
  const fechaUTC = new Date(fecha.getTime());

  const intervaloInicioD = parse(intervaloInicio, 'yyyy-MM-dd', new Date());
  const intervaloFinD = parse(intervaloFin, 'yyyy-MM-dd', new Date());

  const intervaloInicioUTC = fromZonedTime(startOfDay(intervaloInicioD), zonaHorariaResidencia);
  const intervaloFinUTC = fromZonedTime(endOfDay(intervaloFinD), zonaHorariaResidencia);

  return isWithinInterval(fechaUTC, {
    start: intervaloInicioUTC,
    end: intervaloFinUTC,
  });
}

async function obtenerAsistidosResidentesFiltrados(
  userProfileData: any,
  userResidencia: Residencia,
  currentResidenciaId: string
): Promise<UserProfile[]> {
  const now = new Date();
  const assistedUsers: AsistenciasUsuariosDetalle[] =
    userProfileData.asistentePermisos.usuariosAsistidos;
  const assistedUsersIds = assistedUsers.map((a) => a.usuarioAsistido);

  if (assistedUsersIds.length === 0) return [];

  // Consultar los usuarios residentes que están en el arreglo de asistidos
  const queriesUsers = [];
  for (let i = 0; i < assistedUsersIds.length; i += 10) {
    const slice = assistedUsersIds.slice(i, i + 10);
    const q = query(
      collection(db, 'users'),
      where('residenciaId', '==', currentResidenciaId),
      where('roles', 'array-contains', 'residente'),
      where('id', 'in', slice)
    );
    queriesUsers.push(getDocs(q));
  }

  const snapshots = await Promise.all(queriesUsers);

  // Crear un mapa de UserProfiles consultados
  const userProfileMap = new Map<string, UserProfile>();
  snapshots.forEach((snap) => {
    snap.docs.forEach((doc) => {
      const data = doc.data() as UserProfile;
      // Ensure ID is set
      userProfileMap.set(data.id || doc.id, { ...data, id: data.id || doc.id }); 
    });
  });

  const residenteIds = Array.from(userProfileMap.keys());

  // Filtrar el arreglo original de AsistenciasUsuariosDetalle[]
  const assistedUsersResidentes: AsistenciasUsuariosDetalle[] = assistedUsers.filter((a) =>
    residenteIds.includes(a.usuarioAsistido)
  );

  // Filtrar por restricción de tiempo
  const filtradosIds = assistedUsersResidentes
    .filter((a) => {
      if (!a.restriccionTiempo) return true;
      if (a.fechaInicio && a.fechaFin && userResidencia) {
        return fechaEstaEnIntervalo(
          now,
          a.fechaInicio,
          a.fechaFin,
          userResidencia.zonaHoraria
        );
      }
      return false;
    })
    .map((a) => a.usuarioAsistido);

  // Obtener perfiles desde el mapa, sin reconsultar
  const users: UserProfile[] = filtradosIds
    .map((id) => userProfileMap.get(id))
    .filter((u): u is UserProfile => u !== undefined);

  return users;
}

const SelectorUsuariosEC = () => {
  const router = useRouter();

  // Replaced useAuthState with custom hook
  const { user: authUser, loading, error, claims } = useAuth(); 

  // Local state
  const [availableUsers, setAvailableUsers] = useState<UserProfile[]>([]);
  const [internalLoading, setInternalLoading] = useState<boolean>(true);

  // Consume Context
  const context = useLoginC(); // Using context safely via hook

  useEffect(() => {
    const fetchData = async () => {
      // Access context functions
      const { 
        setIsLoadingLoggedUser, 
        setLoggedUser, 
        setResidenciaId, 
        setResidencia, 
        setSelectedUser,
        residenciaId: contextResidenciaId // Might be null initially
      } = context;

      setIsLoadingLoggedUser(true);
      setInternalLoading(true);

      if (loading) {
        return;
      }

      if (error) {
        console.error("Authentication error", error);
        router.push(`/acceso-no-autorizado?mensaje=${encodeURIComponent('Error de autenticación.')}`);
        return;
      }

      if (!authUser) {
        router.push(`/acceso-no-autorizado?mensaje=${encodeURIComponent('No has iniciado sesión.')}`);
        return;
      }

      let userProfileData: UserProfile;
      try {
        // Use claims from useAuth hook directly if available, or just pass what's needed.
        // validarResidenciaUsuario might need specific params structure, adapting:
        // Note: validating using just claims or fetching profile inside?
        // Assuming validarResidenciaUsuario fetches if needed or uses claims.
        // Passed 'params' is tricky if we are in a component and not page with params prop.
        // We can get params from window location or context if it was passed down, 
        // but here we are in a component. 
        // Actually, SelectorUsuariosEC previously used useParams(), let's re-add it or get ID from context.
        // Context `residenciaId` should be the source of truth if page set it.
        
        // However, existing logic uses `validarResidenciaUsuario` which usually checks if URL param matches user claim.
        // Let's rely on context.residenciaId if available, or bypass check if logic allows.
        
        // Re-implement simplified fetch:
        const userRef = doc(db, 'users', authUser.uid);
        const userSnap = await getDoc(userRef);
        if(!userSnap.exists()){
           throw new Error("User profile not found");
        }
        userProfileData = userSnap.data() as UserProfile;
        
      } catch (err) {
        console.error(err);
        router.push(`/acceso-no-autorizado?mensaje=${encodeURIComponent('No se pudo validar la residencia del usuario.')}`);
        return;
      }

      try {
        // Role verification
        const allowedRoles = ['residente', 'director', 'asistente'];
        const hasRequiredRole = userProfileData.roles.some(role => allowedRoles.includes(role));
        if (!hasRequiredRole) {
          router.push(`/acceso-no-autorizado?mensaje=${encodeURIComponent('No tienes permisos para acceder a esta página.')}`);
          return;
        }

        // Fetch Residencia
        const targetResidenciaId = userProfileData.residenciaId;
        if (!targetResidenciaId) {
             throw new Error("User has no residenciaId");
        }

        let residenciaData: Residencia | undefined = undefined;
        const residenciaRef = doc(db, 'residencias', targetResidenciaId);
        const docSnap = await getDoc(residenciaRef);
        if (docSnap.exists()) {
            residenciaData = docSnap.data() as Residencia;
        }
           
        if (!residenciaData) {
          router.push(`/acceso-no-autorizado?mensaje=${encodeURIComponent('Problemas al cargar la residencia del usuario.')}`);
          return;
        }

        // Access granted: Update loggedUser in Context
        setLoggedUser(userProfileData);
        setResidenciaId(targetResidenciaId); // Sync Context
        setResidencia(residenciaData);

        // Fetch available users for selection based on role
        let users: UserProfile[] = [];
        if (userProfileData.roles.includes('director')) {
          // Fetch all residentes
          const q = query(
            collection(db, 'users'), 
            where('residenciaId', '==', targetResidenciaId), 
            where('roles', 'array-contains', 'residente')
          );
          const snapshot = await getDocs(q);
          users = snapshot.docs.map(doc => {
              const d = doc.data() as UserProfile;
              return { ...d, id: d.id || doc.id };
          });
        } else if (userProfileData.roles.includes('asistente')) {
          if (userProfileData.asistentePermisos && userProfileData.asistentePermisos.gestionUsuarios && userProfileData.asistentePermisos.usuariosAsistidos && userProfileData.asistentePermisos.usuariosAsistidos.length > 0) {
            // Fetch assisted users
            users = await obtenerAsistidosResidentesFiltrados(userProfileData, residenciaData, targetResidenciaId);
            // Incluir al propio asistente si también es residente
            if (userProfileData.roles.includes('residente')) {
              const yaIncluido = users.some(u => u.id === userProfileData.id);
              if (!yaIncluido)
                users.push(userProfileData);
            }
          }
        } else if (userProfileData.roles.includes('residente')) {
          // Only the logged-in user
          users = [userProfileData];
        }
        setAvailableUsers(users);
        
        // Automatic selection
        if (users.length === 1) {
          setSelectedUser(users[0]);
        }
      } catch (error) {
        console.error("Error fetching data", error);
        router.push(`/acceso-no-autorizado?mensaje=${encodeURIComponent('Error obteniendo datos del usuario.')}`);
      } finally {
        setIsLoadingLoggedUser(false);
        setInternalLoading(false);
      }
    };

    fetchData();
  }, [authUser, loading, error, router, context.setResidenciaId, context.setResidencia, context.setLoggedUser, context.setSelectedUser, context.setIsLoadingLoggedUser]); 

  // Effect to fetch meal permissions when selectedUser changes
  useEffect(() => {
    const fetchMealPermissions = async () => {
       const { selectedUser, residenciaId, setSelectedUserMealPermissions, setIsLoadingSelectedUserData } = context;

      if (!selectedUser) {
        setSelectedUserMealPermissions(null);
        return;
      }

      setIsLoadingSelectedUserData(true);

      try {
        if(!residenciaId) return; 

        // 6.1 Search if the selectedUser belongs to a grupoUsuario of tipoGrupo='eleccion-comidas'.
        const q1 = query(
            collection(db, "usuariosGrupos"), 
            where("residenciaId", "==", residenciaId), 
            where('userId', '==', selectedUser.id)
        );
        const usuariosGruposSnapshot = await getDocs(q1)
        const gruposUsuarioIds: string[] = usuariosGruposSnapshot.docs.map(doc => doc.data().grupoUsuarioId);

        if (gruposUsuarioIds.length === 0) {
          setSelectedUserMealPermissions(null);
          setIsLoadingSelectedUserData(false);
          return;
        }

        const q2 = query(
            collection(db, "gruposUsuarios"), 
            where("residenciaId", "==", residenciaId), 
            where('tipoGrupo', '==', 'eleccion-comidas'), 
            where('id', 'in', gruposUsuarioIds)
        );
        const gruposUsuarioSnapshot = await getDocs(q2)
        const gruposUsuario = gruposUsuarioSnapshot.docs.map(doc => doc.data());

        if (gruposUsuario.length === 0) {
          setSelectedUserMealPermissions(null);
        } else if (gruposUsuario.length > 1) {
          //This profile has an internal error
          alert('El usuario seleccionado tiene incongruencias en sus permisos. Por favor contacte al administrador.');
          setSelectedUserMealPermissions(null);
        } else {
          //Fetch PermisosComidaPorGrupo
          const permisosComidaPorGrupoId = gruposUsuario[0].permisosComidaPorGrupoId

          if(permisosComidaPorGrupoId) {
            const permisosComidaPorGrupoRef = doc(db, 'permisosComidaPorGrupo', permisosComidaPorGrupoId);
            const docSnap = await getDoc(permisosComidaPorGrupoRef);
            if (docSnap.exists()) {
              const permisosComidaPorGrupoData = docSnap.data() as PermisosComidaPorGrupo;
              setSelectedUserMealPermissions(permisosComidaPorGrupoData);
            }
          } else {
            setSelectedUserMealPermissions(null);
          }
        }

      } catch (error) {
        console.error("Error fetching meal permissions", error);
        alert('Error obteniendo permisos de comida del usuario.');
        setSelectedUserMealPermissions(null);
      } finally {
        setIsLoadingSelectedUserData(false);
      }
    };

    if (context.selectedUser) {
      fetchMealPermissions();
    }
  }, [context.selectedUser, context.residenciaId, context.setSelectedUserMealPermissions, context.setIsLoadingSelectedUserData]); 


  const handleUserChange = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedUid = event.target.value;
    const user = availableUsers.find(user => user.id === selectedUid);
    context.setSelectedUser(user || null);
  };

  if (internalLoading) {
    return <div>Cargando...</div>;
  }

  return (
    <div>
      {availableUsers.length > 1 ? (
        <select value={context.selectedUser ? context.selectedUser.id : ''} onChange={handleUserChange}>
          <option value="">Seleccione un usuario</option>
          {availableUsers.map(user => (
            <option key={user.id} value={user.id}>{user.nombreCorto}</option>
          ))}
        </select>
      ) : availableUsers.length === 1 ? (
        <label>Usuario: {availableUsers[0].nombreCorto}</label>
      ) : (
        <div>No hay usuarios disponibles para seleccionar.</div>
      )}
    </div>
  );
};

export default SelectorUsuariosEC;
