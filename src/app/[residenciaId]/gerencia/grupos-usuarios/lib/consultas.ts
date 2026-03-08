"use client"
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { collection, doc, getDoc, getDocs, db, orderBy, query } from '@/lib/firebase';
import type { ConfiguracionResidencia } from 'shared/schemas/residencia';
import { upsertGrupoUsuario, deleteGrupoUsuario, upsertRestriccionCatalogo, deleteRestriccionCatalogo } from './actions';
import type { GrupoUsuario, RestriccionCatalogo } from "shared/schemas/usuariosGrupos";
import { CONFIG_RESIDENCIA_ID, HORARIOS_QUERY_KEY } from 'shared/models/types';
import type { DatosHorariosEnBruto } from 'shared/schemas/horarios';
import type { CentroDeCosto } from 'shared/schemas/contabilidad';

const GRUPOS_USUARIOS_QUERY_KEY = 'grupos-usuarios-restricciones';
const CONFIGURACION_PATH_DOC = (residenciaId: string) => `residencias/${residenciaId}/configuracion/${CONFIG_RESIDENCIA_ID}`;
const CENTROS_COSTO_QUERY_KEY = 'centrosDeCosto';

type GruposUsuariosRestriccionesData = {
  version: number;
  gruposUsuarios: ConfiguracionResidencia['gruposUsuarios'];
  restriccionesCatalogo: ConfiguracionResidencia['restriccionesCatalogo'];
};

type HorariosCacheData = {
  datos: DatosHorariosEnBruto;
  version: number;
};

// --- Query: Centros de costo (cache compartido con módulo contabilidad) ---
export function useCentrosDeCostoQuery(residenciaId: string) {
  return useQuery<CentroDeCosto[], Error>({
    queryKey: [CENTROS_COSTO_QUERY_KEY, residenciaId],
    queryFn: async () => {
      const q = query(
        collection(db, 'residencias', residenciaId, 'centrosDeCosto'),
        orderBy('codigoVisible', 'asc')
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map((docSnap) => docSnap.data() as CentroDeCosto);
    },
    enabled: !!residenciaId,
    staleTime: 1000 * 60,
  });
}

// --- Fetcher base del singleton de configuración ---
async function fetchConfiguracionResidencia(residenciaId: string): Promise<ConfiguracionResidencia> {
  const docRef = doc(db, CONFIGURACION_PATH_DOC(residenciaId));
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    throw new Error('No existe la configuración de la residencia');
  }

  return docSnap.data() as ConfiguracionResidencia;
}

// --- Query: Horarios (misma key que admin/horarios para compartir cache) ---
export function useHorariosConfiguracionQuery(residenciaId: string) {
  return useQuery<HorariosCacheData, Error>({
    queryKey: [HORARIOS_QUERY_KEY, residenciaId],
    queryFn: async () => {
      const data = await fetchConfiguracionResidencia(residenciaId);
      return {
        datos: {
          horariosSolicitud: data.horariosSolicitud || {},
          gruposComidas: data.gruposComidas || {},
          esquemaSemanal: data.esquemaSemanal || {},
          catalogoAlternativas: data.catalogoAlternativas || {},
          configuracionesAlternativas: data.configuracionesAlternativas || {},
          comedores: data.comedores || {},
        },
        version: data.version || 0,
      };
    },
    enabled: !!residenciaId,
    staleTime: 1000 * 60,
  });
}

// --- Query: Grupos de Usuarios + Restricciones (separada de horarios) ---
export function useGruposUsuariosRestriccionesQuery(residenciaId: string) {
  return useQuery<GruposUsuariosRestriccionesData, Error>({
    queryKey: [GRUPOS_USUARIOS_QUERY_KEY, residenciaId],
    queryFn: async () => {
      const data = await fetchConfiguracionResidencia(residenciaId);
      return {
        version: data.version || 0,
        gruposUsuarios: data.gruposUsuarios || {},
        restriccionesCatalogo: data.restriccionesCatalogo || {},
      };
    },
    enabled: !!residenciaId,
    staleTime: 1000 * 60, // 1 minuto
  });
}

// --- Mutaciones para Grupos de Usuarios ---
export function useUpsertGrupoUsuario(residenciaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (grupo: GrupoUsuario) => await upsertGrupoUsuario(residenciaId, grupo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [GRUPOS_USUARIOS_QUERY_KEY, residenciaId] });
    },
  });
}

export function useDeleteGrupoUsuario(residenciaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (grupoId: string) => await deleteGrupoUsuario(residenciaId, grupoId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [GRUPOS_USUARIOS_QUERY_KEY, residenciaId] });
    },
  });
}

// --- Mutaciones para Catálogo de Restricciones ---
export function useUpsertRestriccionCatalogo(residenciaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (restriccion: RestriccionCatalogo) => await upsertRestriccionCatalogo(residenciaId, restriccion),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [GRUPOS_USUARIOS_QUERY_KEY, residenciaId] });
    },
  });
}

export function useDeleteRestriccionCatalogo(residenciaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (restriccionId: string) => await deleteRestriccionCatalogo(residenciaId, restriccionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [GRUPOS_USUARIOS_QUERY_KEY, residenciaId] });
    },
  });
}
