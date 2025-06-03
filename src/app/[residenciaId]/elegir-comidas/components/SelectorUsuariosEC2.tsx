"use client";

import React, { useState, useEffect, useContext } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuthState } from 'react-firebase-hooks/auth';
import { collection, doc, getDoc, getDocs, query, where, orderBy } from 'firebase/firestore'
import { UserProfile, PermisosComidaPorGrupo, Semanario, Eleccion, Ausencia, Actividad, Residencia, AsistenciasUsuariosDetalle } from '@/../../shared/models/types';
// import { ElegirComidasContextProps } from '../page';
import { useElegirComidas } from '../page';
import { parse } from 'date-fns'
import { fromZonedTime } from 'date-fns-tz'
import { isWithinInterval, startOfDay, endOfDay } from 'date-fns'
import { validarResidenciaUsuario } from '@/lib/utils'

const { 
  loggedUser, setLoggedUser, 
  selectedUser, setSelectedUser, 
  selectedUserMealPermissions, setSelectedUserMealPermissions, 
  isLoadingLoggedUser, setIsLoadingLoggedUser, 
  isLoadingSelectedUserData, setIsLoadingSelectedUserData,
  residenciaId, setResidenciaId,
  auth, db
} = useElegirComidas();

function fechaEstaEnIntervalo(
  fecha: Date,
  intervaloInicio: string,
  intervaloFin: string,
  zonaHorariaResidencia: string
): boolean {
  const fechaUTC = new Date(fecha.getTime());

  const intervaloInicioD = parse(intervaloInicio, 'yyyy-MM-dd', new Date())
  const intervaloFinD = parse(intervaloFin, 'yyyy-MM-dd', new Date())

  const intervaloInicioUTC = fromZonedTime(startOfDay(intervaloInicioD), zonaHorariaResidencia)
  const intervaloFinUTC = fromZonedTime(endOfDay(intervaloFinD), zonaHorariaResidencia)

  return isWithinInterval(fechaUTC, {
    start: intervaloInicioUTC,
    end: intervaloFinUTC,
  })
}
async function obtenerAsistidosResidentesFiltrados(
  userProfileData: any,
): Promise<UserProfile[]> {
  const now = new Date();
  const assistedUsers: AsistenciasUsuariosDetalle[] =
    userProfileData.asistentePermisos.usuariosAsistidos;
  const assistedUsersIds = assistedUsers.map((a) => a.usuarioAsistido);

  // Consultar los usuarios residentes que están en el arreglo de asistidos
  const queriesUsers = [];
  for (let i = 0; i < assistedUsersIds.length; i += 10) {
    const slice = assistedUsersIds.slice(i, i + 10);
    const q = query(
      collection(db, 'users'),
      where('residenciaId', '==', residenciaId),
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
      userProfileMap.set(data.id, data); // o 'uid' si fuera necesario
    });
  });

  const residenteIds = Array.from(userProfileMap.keys());

  // Filtrar el arreglo original de AsistenciasUsuariosDetalle[]
  const assistedUsersResidentes: AsistenciasUsuariosDetalle[] = assistedUsers.filter((a) =>
    residenteIds.includes(a.usuarioAsistido)
  );

  // Obtener datos de la residencia (zona horaria)
  let residencia: Residencia | undefined = undefined;
  if (residenciaId) {
    const residenciaRef = doc(db, 'residencias', residenciaId);
    const docSnap = await getDoc(residenciaRef);
    if (docSnap.exists()) {
      residencia = docSnap.data() as Residencia;
    }
  }

  // Filtrar por restricción de tiempo
  const filtradosIds = assistedUsersResidentes
    .filter((a) => {
      if (!a.restriccionTiempo) return true;
      if (a.fechaInicio && a.fechaFin && residencia) {
        return fechaEstaEnIntervalo(
          now,
          a.fechaInicio,
          a.fechaFin,
          residencia.zonaHoraria
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

  const [authUser, loading, error] = useAuthState(auth);
  const [availableUsers, setAvailableUsers] = useState<UserProfile[]>([]);
  const [internalLoading, setInternalLoading] = useState<boolean>(true);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoadingLoggedUser(true);
      setInternalLoading(true);

      if (loading) {
        // Still loading auth state, do nothing
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
        const tokenResult = await authUser.getIdTokenResult();
        const claims = tokenResult.claims;
        const params = useParams();
        userProfileData = await validarResidenciaUsuario({authUser, claims, params}); 
      } catch {
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

        // Access granted: Update loggedUser
        setLoggedUser(userProfileData);
        setResidenciaId(userProfileData.residenciaId!);

        // Fetch available users for selection
        let users: UserProfile[] = [];
        if (userProfileData.roles.includes('director')) {
          // Fetch all residentes
          const q = query(collection(db, 'users'), where('residenciaId', '==', userProfileData.residenciaId), where('roles', 'array-contains', 'residente'));
          const snapshot = await getDocs(q);
          users = snapshot.docs.map(doc => doc.data()) as UserProfile[];
        } else if (userProfileData.roles.includes('asistente')) {
          if (userProfileData.asistentePermisos && userProfileData.asistentePermisos.gestionUsuarios && userProfileData.asistentePermisos.usuariosAsistidos && userProfileData.asistentePermisos.usuariosAsistidos.length > 0) {
            // Fetch assisted users with 'residente' role and within timeframe
            users = await obtenerAsistidosResidentesFiltrados(userProfileData);
            // Incluir al propio asistente si también es residente
            if (userProfileData.roles.includes('residente')) {
              const yaIncluido = users.some(u => u.id === userProfileData.id); // o `uid` si usás ese campo
              if (!yaIncluido)
                users.push(userProfileData);
            }
          }
        } else if (userProfileData.roles.includes('residente')) {
          // Only the logged-in user
          users = [userProfileData];
        }
        setAvailableUsers(users);
        // If only one user is available, select it automatically
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
  }, [authUser, loading, error, router, setResidenciaId, setLoggedUser, setSelectedUser, setIsLoadingLoggedUser]);

  useEffect(() => {
    const fetchMealPermissions = async () => {
      if (!selectedUser) {
        setSelectedUserMealPermissions(null);
        return;
      }

      setIsLoadingSelectedUserData(true);

      try {
        // 6.1 Search if the selectedUser belongs to a grupoUsuario of tipoGrupo='eleccion-comidas'.
        const q1 = query(collection(db, "usuariosGrupos"), where("residenciaId", "==", residenciaId), where('userId', '==', selectedUser.id));
        const usuariosGruposSnapshot = await getDocs(q1)
        const gruposUsuarioIds: string[] = usuariosGruposSnapshot.docs.map(doc => doc.data().grupoUsuarioId);

        if (gruposUsuarioIds.length === 0) {
          setSelectedUserMealPermissions(null);
          setIsLoadingSelectedUserData(false);
          return;
        }

        const q2 = query(collection(db, "gruposUsuarios"), where("residenciaId", "==", residenciaId), where('tipoGrupo', '==', 'eleccion-comidas'), where('id', 'in', gruposUsuarioIds));
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

    if (selectedUser) {
      fetchMealPermissions();
    }
  }, [selectedUser, residenciaId, setSelectedUserMealPermissions, setIsLoadingSelectedUserData]);


  const handleUserChange = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedUid = event.target.value;
    const user = availableUsers.find(user => user.id === selectedUid);
    setSelectedUser(user || null);
  };

  if (internalLoading) {
    return <div>Cargando...</div>;
  }

  return (
    <div>
      {availableUsers.length > 1 ? (
        <select value={selectedUser ? selectedUser.id : ''} onChange={handleUserChange}>
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
