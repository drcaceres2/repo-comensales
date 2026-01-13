"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth'; 
import { useDocumentSubscription } from '@/hooks/useFirebaseData';
import { useCollectionSubscription } from '@/hooks/useFirebaseData';
import { collection, doc, getDoc, getDocs, query, where, DocumentReference } from 'firebase/firestore'; 
import { UserProfile, PermisosComidaPorGrupo, Residencia, AsistenciasUsuariosDetalle } from '../../../../../shared/models/types';
import { useMainContext } from '../context/ElegirComidasContext';
import { parse } from 'date-fns';
import { fromZonedTime } from 'date-fns-tz';
import { isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { db } from '@/lib/firebase';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'; 

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

// Helper mainly for Assistant logic which is complex
async function obtenerAsistidosResidentesFiltrados(
  userProfileData: UserProfile,
  userResidencia: Residencia,
  currentResidenciaId: string
): Promise<UserProfile[]> {
  const now = new Date();
  const assistedUsers: AsistenciasUsuariosDetalle[] =
    userProfileData.asistentePermisos?.usuariosAsistidos || [];
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
  const { user: authUser, loading: authLoading, error: authError } = useAuth();
  const context = useMainContext();
  
  const [availableUsers, setAvailableUsers] = useState<UserProfile[]>([]);
  const [internalLoading, setInternalLoading] = useState<boolean>(true);
  const [assistantUsers, setAssistantUsers] = useState<UserProfile[]>([]); // To store manually fetched assistant users

  // 1. Fetch Logged User Profile
  const userRef = useMemo(() => {
    return authUser ? (doc(db, 'users', authUser.uid) as DocumentReference<UserProfile>) : null;
  }, [authUser]);

  const { value: userProfileData, loading: userProfileLoading, error: userProfileError } = useDocumentSubscription<UserProfile>(userRef);

  // 2. Set Logged User in Context & Validation
  useEffect(() => {
    if (authLoading || userProfileLoading) return;

    if (authError || userProfileError) {
      console.error("Authentication or Profile Error", authError || userProfileError);
      router.push(`/acceso-no-autorizado?mensaje=${encodeURIComponent('Error obteniendo perfil de usuario.')}`);
      return;
    }

    if (!authUser || !userProfileData) {
      // Handled by parent or auth hook mostly, but safe check
      return;
    }

    // Role Validation
    const allowedRoles = ['residente', 'director', 'asistente'];
    const hasRequiredRole = userProfileData.roles?.some(role => allowedRoles.includes(role));
    if (!hasRequiredRole) {
      router.push(`/acceso-no-autorizado?mensaje=${encodeURIComponent('No tienes permisos para acceder a esta página.')}`);
      return;
    }

    // Validate Residencia Match
    if (context.residenciaId && userProfileData.residenciaId !== context.residenciaId) {
        // Mismatch between URL residence and User residence
        // Only Master/Admin might bypass, but this selector is for specific residence ops.
        // Assuming strict check:
        // router.push(`/acceso-no-autorizado?mensaje=${encodeURIComponent('No perteneces a esta residencia.')}`);
        // return;
    }

    context.setLoggedUser(userProfileData);
    // context.setResidenciaId(userProfileData.residenciaId); // Handled by page/client prop

  }, [authUser, userProfileData, authLoading, userProfileLoading, authError, userProfileError, context, router]);


  // 3. Prepare Query for Available Users (Director Case)
  const directorUsersQuery = useMemo(() => {
    if (!userProfileData || !context.residenciaId) return null;
    if (userProfileData.roles.includes('director')) {
      return query(
        collection(db, 'users'), 
        where('residenciaId', '==', context.residenciaId), 
        where('roles', 'array-contains', 'residente')
      );
    }
    return null;
  }, [userProfileData, context.residenciaId]);

  const { value: directorUsers, loading: directorUsersLoading } = useCollectionSubscription<UserProfile>(directorUsersQuery);

  // 4. Handle Assistant Users (Manual Fetch due to complexity)
  useEffect(() => {
    const fetchAssistantUsers = async () => {
      if (!userProfileData || !context.residenciaId || !context.residencia) return;
      if (userProfileData.roles.includes('asistente') && !userProfileData.roles.includes('director')) {
        setInternalLoading(true);
        try {
          if (userProfileData.asistentePermisos?.gestionUsuarios && userProfileData.asistentePermisos?.usuariosAsistidos && userProfileData.asistentePermisos.usuariosAsistidos.length > 0) {
            const users = await obtenerAsistidosResidentesFiltrados(userProfileData, context.residencia, context.residenciaId);
             // Include self if resident
            if (userProfileData.roles.includes('residente')) {
                const yaIncluido = users.some(u => u.id === userProfileData.id);
                if (!yaIncluido) users.push(userProfileData);
            }
            setAssistantUsers(users);
          } else {
            setAssistantUsers([]);
          }
        } catch (e) {
            console.error(e);
        } finally {
            setInternalLoading(false);
        }
      } else {
          setInternalLoading(false);
      }
    };
    fetchAssistantUsers();
  }, [userProfileData, context.residenciaId, context.residencia]);

  // 5. Consolidate Available Users
  useEffect(() => {
    if (!userProfileData) return;

    let users: UserProfile[] = [];

    if (userProfileData.roles.includes('director')) {
      users = directorUsers || [];
    } else if (userProfileData.roles.includes('asistente')) {
      users = assistantUsers;
    } else if (userProfileData.roles.includes('residente')) {
      users = [userProfileData];
    }

    // Filter duplicates just in case
    const uniqueUsers = Array.from(new Map(users.map(u => [u.id || 'uid', u])).values());
    setAvailableUsers(uniqueUsers);

    // Auto-select if only one
    if (uniqueUsers.length === 1 && !context.selectedUser) {
        context.setSelectedUser(uniqueUsers[0]);
    }
  }, [userProfileData, directorUsers, assistantUsers, context.selectedUser, context.setSelectedUser]);

  // 6. Update Loading State
  useEffect(() => {
    const loading = userProfileLoading || (userProfileData?.roles.includes('director') ? directorUsersLoading : internalLoading);
    context.setIsLoadingLoggedUser(loading);
  }, [userProfileLoading, directorUsersLoading, internalLoading, userProfileData, context.setIsLoadingLoggedUser]);


  // Effect to fetch meal permissions when selectedUser changes
  // Keeping this manual as it involves chaining queries which is hard with pure hooks cleanly without splitting components
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
          // alert('El usuario seleccionado tiene incongruencias en sus permisos. Por favor contacte al administrador.'); // Alert might be annoying
          console.warn('El usuario seleccionado tiene incongruencias en sus permisos.');
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
        setSelectedUserMealPermissions(null);
      } finally {
        setIsLoadingSelectedUserData(false);
      }
    };

    if (context.selectedUser) {
      fetchMealPermissions();
    }
  }, [context.selectedUser, context.residenciaId, context.setSelectedUserMealPermissions, context.setIsLoadingSelectedUserData]); 


  if (authLoading || userProfileLoading) {
    return <div>Cargando perfil...</div>;
  }

  return (
    <div>
      {availableUsers.length > 1 ? (
        <Select value={context.selectedUser?.id || ""} onValueChange={(value) => { const user = availableUsers.find(u => u.id === value); context.setSelectedUser(user || null); }}>
          <SelectTrigger>
            <SelectValue placeholder="Seleccione un usuario" />
          </SelectTrigger>
          <SelectContent>
            {availableUsers.map(user => (
              <SelectItem key={user.id} value={user.id}>{user.nombreCorto || user.email}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : availableUsers.length === 1 ? (
        <label>Usuario: {availableUsers[0].nombreCorto || availableUsers[0].email}</label>
      ) : (
        <div>No hay usuarios disponibles.</div>
      )}
    </div>
  );
};

export default SelectorUsuariosEC;
