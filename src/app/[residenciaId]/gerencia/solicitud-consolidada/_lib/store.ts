'use client';

import { create } from 'zustand';

export type TabActiva = 'comensales' | 'novedades' | 'otros';

export type TipoComunicacionPatch = 'PREVIA' | 'DEFINITIVA' | 'CANCELACION';

export type EstadoSellado =
  | 'idle'
  | 'sellando'
  | 'sellado'
  | 'pdf_generando'
  | 'pdf_completado'
  | 'pdf_error';

export interface OverrideComensal {
  usuarioId: string;
  tiempoComidaId: string;
  nuevaAlternativaId?: string;
  nuevaDietaId?: string;
}

export interface CalendarioState {
  fechaInicio?: string;
  fechaFin?: string;
  recordatorios: Array<{
    id: string;
    nombre?: string;
    fechaInicio?: string;
    fechaInicioValidez?: string;
    fechaFinValidez?: string;
  }>;
  cumpleanios: Array<{
    id: string;
    nombre: string;
    apellido?: string;
    fechaCumpleanios: string;
  }>;
}

export interface ComensalesState {
  arbolComensales: Record<string, Record<string, Record<string, string[]>>>;
  usuariosDiccionario: Record<string, any>;
  selectedHorarioSolicitudId: string | null;
  tiempoComidaNombres: Record<string, string>;
  alternativaNombres: Record<string, string>;
}

export interface NovedadesState {
  novedades: Array<any>;
  dietas: Array<any>;
  alteraciones: Array<any>;
}

export interface OtrosState {
  actividades: Array<any>;
  atenciones: Array<any>;
  excepciones: Array<any>;
  solicitudesInvitados: Array<any>;
}

function buildInclusionDefaults(pestana3: OtrosState): Record<string, boolean> {
  const output: Record<string, boolean> = {};

  for (const item of pestana3.actividades ?? []) {
    output[`actividad:${String(item?.id ?? '')}`] = true;
  }
  for (const item of pestana3.atenciones ?? []) {
    output[`atencion:${String(item?.id ?? '')}`] = true;
  }
  for (const item of pestana3.excepciones ?? []) {
    output[`excepcion:${String(item?.id ?? '')}`] = true;
  }
  for (const item of pestana3.solicitudesInvitados ?? []) {
    output[`invitado:${String(item?.id ?? '')}`] = true;
  }

  return output;
}

export interface EstadoEncabezado {
  calendario: CalendarioState;
  colapsado: boolean;
}

export interface SolicitudConsolidadaStoreState {
  // Identidad de contexto
  residenciaId: string | null;
  solicitudId: string | null;

  // Datos cardinales (del backend)
  encabezado: EstadoEncabezado;
  pestana1: ComensalesState;
  pestana2: NovedadesState;
  pestana3: OtrosState;

  // Estado de carga
  cargandoFase0: boolean;
  cargandoFase2: boolean;
  cargandoFase3: boolean;
  errorCarga: string | null;

  // Interacción
  tabActiva: TabActiva;
  arbolComensalesExpandido: Set<string>;
  inclusionEntidades: Record<string, boolean>;

  // --- Nuevos: Overrides y Bottom Sheet ---
  overrides: OverrideComensal[];
  bottomSheetAbierto: boolean;
  dirty: boolean;

  // --- Nuevos: Sellado y PDF ---
  estadoSellado: EstadoSellado;
  urlPdfDescarga: string | null;

  // --- Nuevos: Actividad patches (consolidador elige tipoComunicacion) ---
  actividadPatches: Record<string, TipoComunicacionPatch>;

  // Acciones
  setContexto: (residenciaId: string, solicitudId: string) => void;
  setEncabezado: (encabezado: EstadoEncabezado) => void;
  setPestana1: (pestana1: ComensalesState) => void;
  setPestana2: (pestana2: NovedadesState) => void;
  setPestana3: (pestana3: OtrosState) => void;

  setCargandoFase0: (loading: boolean) => void;
  setCargandoFase2: (loading: boolean) => void;
  setCargandoFase3: (loading: boolean) => void;
  setErrorCarga: (error: string | null) => void;

  setTabActiva: (tab: TabActiva) => void;
  toggleComensalExpandido: (key: string) => void;
  setInclusionEntidad: (key: string, include: boolean) => void;
  toggleInclusionEntidad: (key: string) => void;

  toggleEncabezadoColapsado: () => void;

  // --- Nuevas acciones ---
  addOverride: (override: OverrideComensal) => void;
  removeOverride: (usuarioId: string, tiempoComidaId: string) => void;
  toggleBottomSheet: () => void;
  setEstadoSellado: (estado: EstadoSellado) => void;
  setUrlPdfDescarga: (url: string | null) => void;
  markClean: () => void;
  setActividadPatch: (actividadId: string, tipo: TipoComunicacionPatch) => void;
  removeActividadPatch: (actividadId: string) => void;

  reset: () => void;
}

const initialState = {
  residenciaId: null,
  solicitudId: null,
  encabezado: {
    calendario: {
      recordatorios: [],
      cumpleanios: [],
    },
    colapsado: false,
  },
  pestana1: {
    arbolComensales: {},
    usuariosDiccionario: {},
    selectedHorarioSolicitudId: null,
    tiempoComidaNombres: {},
    alternativaNombres: {},
  },
  pestana2: {
    novedades: [],
    dietas: [],
    alteraciones: [],
  },
  pestana3: {
    actividades: [],
    atenciones: [],
    excepciones: [],
    solicitudesInvitados: [],
  },
  cargandoFase0: false,
  cargandoFase2: false,
  cargandoFase3: false,
  errorCarga: null as string | null,
  tabActiva: 'comensales' as const,
  arbolComensalesExpandido: new Set<string>(),
  inclusionEntidades: {} as Record<string, boolean>,
  // Nuevos defaults
  overrides: [] as OverrideComensal[],
  bottomSheetAbierto: false,
  dirty: false,
  estadoSellado: 'idle' as EstadoSellado,
  urlPdfDescarga: null as string | null,
  actividadPatches: {} as Record<string, TipoComunicacionPatch>,
};

export const useSolicitudConsolidadaStore = create<SolicitudConsolidadaStoreState>((set) => ({
  ...initialState,

  setContexto: (residenciaId, solicitudId) =>
    set({
      residenciaId,
      solicitudId,
    }),

  setEncabezado: (encabezado) =>
    set({
      encabezado,
    }),

  setPestana1: (pestana1) =>
    set({
      pestana1,
    }),

  setPestana2: (pestana2) =>
    set({
      pestana2,
    }),

  setPestana3: (pestana3) =>
    set((state) => ({
      pestana3,
      inclusionEntidades: {
        ...buildInclusionDefaults(pestana3),
        ...state.inclusionEntidades,
      },
    })),

  setCargandoFase0: (cargandoFase0) =>
    set({
      cargandoFase0,
    }),

  setCargandoFase2: (cargandoFase2) =>
    set({
      cargandoFase2,
    }),

  setCargandoFase3: (cargandoFase3) =>
    set({
      cargandoFase3,
    }),

  setErrorCarga: (errorCarga) =>
    set({
      errorCarga,
    }),

  setTabActiva: (tabActiva) =>
    set({
      tabActiva,
    }),

  toggleComensalExpandido: (key) =>
    set((state) => {
      const newSet = new Set(state.arbolComensalesExpandido);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return {
        arbolComensalesExpandido: newSet,
      };
    }),

  setInclusionEntidad: (key, include) =>
    set((state) => ({
      inclusionEntidades: {
        ...state.inclusionEntidades,
        [key]: include,
      },
    })),

  toggleInclusionEntidad: (key) =>
    set((state) => ({
      inclusionEntidades: {
        ...state.inclusionEntidades,
        [key]: !(state.inclusionEntidades[key] ?? true),
      },
    })),

  toggleEncabezadoColapsado: () =>
    set((state) => ({
      encabezado: {
        ...state.encabezado,
        colapsado: !state.encabezado.colapsado,
      },
    })),

  // --- Nuevas acciones ---
  addOverride: (override) =>
    set((state) => {
      // Reemplazar si ya existe un override para el mismo usuario+tiempoComida
      const filtered = state.overrides.filter(
        (o) => !(o.usuarioId === override.usuarioId && o.tiempoComidaId === override.tiempoComidaId),
      );
      return {
        overrides: [...filtered, override],
        dirty: true,
      };
    }),

  removeOverride: (usuarioId, tiempoComidaId) =>
    set((state) => ({
      overrides: state.overrides.filter(
        (o) => !(o.usuarioId === usuarioId && o.tiempoComidaId === tiempoComidaId),
      ),
      dirty: true,
    })),

  toggleBottomSheet: () =>
    set((state) => ({
      bottomSheetAbierto: !state.bottomSheetAbierto,
    })),

  setEstadoSellado: (estadoSellado) =>
    set({ estadoSellado }),

  setUrlPdfDescarga: (urlPdfDescarga) =>
    set({ urlPdfDescarga }),

  markClean: () =>
    set({ dirty: false }),

  setActividadPatch: (actividadId, tipo) =>
    set((state) => ({
      actividadPatches: {
        ...state.actividadPatches,
        [actividadId]: tipo,
      },
    })),

  removeActividadPatch: (actividadId) =>
    set((state) => {
      const { [actividadId]: _, ...rest } = state.actividadPatches;
      return { actividadPatches: rest };
    }),

  reset: () =>
    set(() => ({
      ...initialState,
      arbolComensalesExpandido: new Set<string>(),
      inclusionEntidades: {},
      overrides: [],
      actividadPatches: {},
    })),
}));

