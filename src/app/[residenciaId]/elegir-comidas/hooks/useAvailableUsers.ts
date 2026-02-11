import { collection, getDocs, query, where, doc, DocumentReference } from 'firebase/firestore';
import { useDocumentSubscription, useCollectionSubscription } from '@/hooks/useDataSubscription';
import { UserProfile, Residencia, AsistenciasUsuariosDetalle } from '../../../../../shared/models/types';
import { db } from '@/lib/firebase';
import { useState, useEffect, useMemo } from 'react';
import { estaDentroFechas } from '@/lib/fechasResidencia';

// --- Helper Functions (from original SelectorUsuariosEC2) ---

async function obtenerAsistidosResidentesFiltrados(
  userProfileData: UserProfile,
  userResidencia: Residencia,
  currentResidenciaId: string
): Promise<UserProfile[]> {
  const now = new Date();
  const assistedUsers: AsistenciasUsuariosDetalle[] = userProfileData.asistentePermisos?.usuariosAsistidos || [];
  const assistedUsersIds = assistedUsers.map((a) => a.usuarioAsistido);

  if (assistedUsersIds.length === 0) return [];

  const queriesUsers = [];
  for (let i = 0; i < assistedUsersIds.length; i += 30) { // Firestore 'in' query limit is 30
    const slice = assistedUsersIds.slice(i, i + 30);
    const q = query(
      collection(db, 'users'),
      where('residenciaId', '==', currentResidenciaId),
      where('roles', 'array-contains', 'residente'),
      where('id', 'in', slice) 
    );
    queriesUsers.push(getDocs(q));
  }

  const snapshots = await Promise.all(queriesUsers);
  const userProfileMap = new Map<string, UserProfile>();
  snapshots.forEach((snap) => {
    snap.docs.forEach((doc) => {
      const data = doc.data() as UserProfile;
      userProfileMap.set(doc.id, { ...data, id: doc.id });
    });
  });

  const residenteIds = Array.from(userProfileMap.keys());
  const assistedUsersResidentes: AsistenciasUsuariosDetalle[] = assistedUsers.filter((a) =>
    residenteIds.includes(a.usuarioAsistido)
  );

  const filtradosIds = assistedUsersResidentes
    .filter((a) => {
      if (!a.restriccionTiempo) return true;
      if (a.fechaInicio && a.fechaFin && userResidencia) {
        return estaDentroFechas(now, a.fechaInicio, a.fechaFin, userResidencia.ubicacion.timezone);
      }
      return false;
    })
    .map((a) => a.usuarioAsistido);

  return filtradosIds.map((id) => userProfileMap.get(id)).filter((u): u is UserProfile => u !== undefined);
}


// --- Main Hook ---

interface UseAvailableUsersResult {
  availableUsers: UserProfile[];
  loggedUserProfile: UserProfile | null;
  loading: boolean;
  error: Error | undefined;
}

export function useAvailableUsers(
    loggedUserAuth: import('firebase/auth').User | null, 
    residenciaId: string,
    residencia: Residencia | null
): UseAvailableUsersResult {
  const [availableUsers, setAvailableUsers] = useState<UserProfile[]>([]);
  const [assistantUsers, setAssistantUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  // 1. Fetch Logged User Profile
  const userProfileRef = useMemo(() => 
    loggedUserAuth ? doc(db, 'users', loggedUserAuth.uid) as DocumentReference<UserProfile> : null
  , [loggedUserAuth]);
  const { data: loggedUserProfile, loading: userProfileLoading, error: userProfileError } = useDocumentSubscription<UserProfile>(userProfileRef);

  // 2. Fetch Director's Users
  const directorUsersQuery = useMemo(() => {
    if (loggedUserProfile?.roles.includes('director') && residenciaId) {
      return query(
        collection(db, 'users'),
        where('residenciaId', '==', residenciaId),
        where('roles', 'array-contains', 'residente')
      );
    }
    return null;
  }, [loggedUserProfile, residenciaId]);
  const { data: directorUsers, loading: directorUsersLoading, error: directorUsersError } = useCollectionSubscription<UserProfile>(directorUsersQuery);

  // 3. Fetch Assistant's Users (Manual due to complexity)
  useEffect(() => {
    const fetchAssistantUsers = async () => {
      const userProfileData = loggedUserProfile;
      if (!userProfileData || !residenciaId || !residencia) return;

      if (userProfileData.roles.includes('asistente') && !userProfileData.roles.includes('director')) {
        setLoading(true);
        try {
          const canManage = userProfileData.asistentePermisos?.gestionUsuarios;
          const assistedUsersList = userProfileData.asistentePermisos?.usuariosAsistidos;

          if (canManage && assistedUsersList && assistedUsersList.length > 0) {
            const users = await obtenerAsistidosResidentesFiltrados(userProfileData, residencia, residenciaId);
            if (userProfileData.roles.includes('residente')) {
              const selfIsIncluded = users.some(u => u.id === userProfileData.id);
              if (!selfIsIncluded) users.push(userProfileData);
            }
            setAssistantUsers(users);
          } else {
            setAssistantUsers([]);
          }
        } catch (e) {
          console.error(e);
        } finally {
          setLoading(false);
        }
      }
    };
    fetchAssistantUsers();
  }, [loggedUserProfile, residenciaId, residencia]);

  // 4. Consolidate Available Users
  useEffect(() => {
    const userProfileData = loggedUserProfile;
    if (!userProfileData) {
      if (!userProfileLoading) {
         setAvailableUsers([]);
         setLoading(false);
      }
      return;
    };

    let users: UserProfile[] = [];
    let currentLoading = true;

    if (userProfileData.roles.includes('director')) {
      users = directorUsers || [];
      currentLoading = directorUsersLoading;
    } else if (userProfileData.roles.includes('asistente')) {
      users = assistantUsers;
      // loading is handled manually for assistants
      currentLoading = loading;
    } else if (userProfileData.roles.includes('residente')) {
      users = [userProfileData];
      currentLoading = userProfileLoading;
    }

    const uniqueUsers = Array.from(new Map(users.map(u => [u.id, u])).values());
    setAvailableUsers(uniqueUsers);
    setLoading(currentLoading);
    
  }, [loggedUserProfile, directorUsers, assistantUsers, userProfileLoading, directorUsersLoading, loading]);


  return {
    availableUsers,
    loggedUserProfile: loggedUserProfile || null,
    loading: loading || userProfileLoading,
    error: (userProfileError || directorUsersError) ?? undefined,
  };
}
