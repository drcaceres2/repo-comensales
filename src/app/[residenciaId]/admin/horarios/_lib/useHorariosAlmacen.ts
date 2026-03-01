import { create } from 'zustand';
import { DatosHorariosEnBruto } from 'shared/schemas/horarios';
import type {
    ConfiguracionAlternativa,
    DefinicionAlternativa,
    GrupoComida,
    HorarioSolicitudData,
    TiempoComida
} from "shared/schemas/horarios";
import {
    auditarIntegridadHorarios,
    construirMatrizVistaHorarios,
    type Alerta,
    type MatrizVistaHorarios
} from "./vistaModeloMapa";

// Estructura de la Interfaz del Almacén
export interface HorariosState {
    // 1. ESTADO DE UI Y NAVEGACIÓN
    pasoActual: number; // 1 a 5
    mostrarInactivos: boolean;
    errorDeGuardado: string | null;

    // 2. ESTADO DE DATOS (DRAFT PATTERN)
    datosOriginales: DatosHorariosEnBruto | null;
    datosBorrador: DatosHorariosEnBruto;
    version: number;
    hayCambios: boolean;

    // 3. ESTADO COMPUTADO (Reactivo)
    matriz: MatrizVistaHorarios;

    // 4. ESTADO DE AUDITORÍA (A demanda)
    alertas: Alerta[];
    alertasIgnoradas: string[];

    // ACCIONES DE UI
    setPasoActual: (paso: number) => void;
    toggleMostrarInactivos: () => void;
    setErrorDeGuardado: (error: string | null) => void;

    // ACCIONES DE DATOS
    inicializarDatos: (datosDelServidor: DatosHorariosEnBruto, version: number) => void;
    descartarCambios: () => void;

    // ACCIONES DE AUDITORÍA
    ejecutarAuditoria: () => void;
    ignorarAlerta: (idAviso: string) => void;

    // ACCIONES CRUD
    // GrupoComida
    upsertGrupoComida: (id: string, grupo: GrupoComida) => void;
    archivarGrupoComida: (id: string) => void;
    // HorarioSolicitudData
    upsertHorarioSolicitud: (id: string, horario: HorarioSolicitudData) => void;
    archivarHorarioSolicitud: (id: string) => void;
    // TiempoComida
    upsertTiempoComida: (id: string, tiempo: TiempoComida) => void;
    archivarTiempoComida: (id: string) => void;
    // DefinicionAlternativa
    upsertDefinicionAlternativa: (id: string, definicion: DefinicionAlternativa) => void;
    archivarDefinicionAlternativa: (id: string) => void;
    // ConfiguracionAlternativa
    upsertConfiguracionAlternativa: (id: string, config: ConfiguracionAlternativa) => void;
    archivarConfiguracionAlternativa: (id: string) => void;
    setAlternativaPrincipal: (tiempoComidaId: string, nuevaPrincipalId: string) => void;
}

const datosVacios: DatosHorariosEnBruto = {
    gruposComidas: {},
    horariosSolicitud: {},
    esquemaSemanal: {},
    catalogoAlternativas: {},
    configuracionesAlternativas: {},
    comedores: {}
};

// --- Helper Interno para Sincronización ---
const _sincronizarAlternativas = (
    tiempoComidaId: string,
    borrador: DatosHorariosEnBruto
): DatosHorariosEnBruto => {
    const tiempoComida = borrador.esquemaSemanal[tiempoComidaId];
    if (!tiempoComida) return borrador;

    const alternativasParaTiempo = Object.entries(borrador.configuracionesAlternativas)
        .filter(([, config]) => config.tiempoComidaId === tiempoComidaId && config.estaActivo)
        .map(([id]) => id);

    let principalActual = tiempoComida.alternativas?.principal || '';
    
    // Si la principal actual ya no es válida (no existe o está inactiva), la deseleccionamos
    if (principalActual && !alternativasParaTiempo.includes(principalActual)) {
        principalActual = '';
    }

    // Si no hay principal pero hay alternativas disponibles, promovemos la primera
    if (!principalActual && alternativasParaTiempo.length > 0) {
        principalActual = alternativasParaTiempo[0];
    }

    const secundariasNuevas = alternativasParaTiempo.filter(id => id !== principalActual);

    const tiempoComidaActualizado = {
        ...tiempoComida,
        alternativas: {
            principal: principalActual,
            secundarias: secundariasNuevas,
        },
    };

    return {
        ...borrador,
        esquemaSemanal: {
            ...borrador.esquemaSemanal,
            [tiempoComidaId]: tiempoComidaActualizado,
        },
    };
};

export const useHorariosAlmacen = create<HorariosState>((set, get) => ({
    // ESTADOS...
    pasoActual: 1,
    mostrarInactivos: false,
    errorDeGuardado: null,

    // 2. ESTADO DE DATOS (DRAFT PATTERN)
    datosOriginales: null,
    datosBorrador: datosVacios,
    version: 0,
    hayCambios: false,

    // 3. ESTADO COMPUTADO (Reactivo)
    matriz: construirMatrizVistaHorarios(datosVacios),

    // 4. ESTADO DE AUDITORÍA (A demanda)
    alertas: [],
    alertasIgnoradas: [],

    // ACCIONES DE UI
    setPasoActual: (paso) => set({ pasoActual: paso }),
    toggleMostrarInactivos: () => set((state) => ({ mostrarInactivos: !state.mostrarInactivos })),
    setErrorDeGuardado: (error) => set({ errorDeGuardado: error }),

    // ACCIONES DE DATOS
    inicializarDatos: (datosDelServidor, version) => {
        const copiaDatos = JSON.parse(JSON.stringify(datosDelServidor));
        set({
            datosOriginales: datosDelServidor,
            datosBorrador: copiaDatos,
            version: version,
            matriz: construirMatrizVistaHorarios(copiaDatos),
            hayCambios: false,
            alertas: [],
            alertasIgnoradas: [],
            pasoActual: 1,
            errorDeGuardado: null,
        });
    },
    descartarCambios: () => {
        const originales = get().datosOriginales;
        if (originales) {
            const copiaOriginales = JSON.parse(JSON.stringify(originales));
            set({
                datosBorrador: copiaOriginales,
                matriz: construirMatrizVistaHorarios(copiaOriginales),
                hayCambios: false,
            });
        }
    },

    // ACCIONES DE AUDITORÍA
    ejecutarAuditoria: () => {
        const { datosBorrador } = get();
        const nuevasAlertas = auditarIntegridadHorarios(datosBorrador);
        set({ alertas: nuevasAlertas });
    },
    ignorarAlerta: (idAviso) => set((state) => ({ alertasIgnoradas: [...state.alertasIgnoradas, idAviso] })),

    // ACCIONES CRUD
    upsertGrupoComida: (id, grupo) => {
        const borradorActual = get().datosBorrador;
        const nuevoBorrador = { ...borradorActual, gruposComidas: { ...borradorActual.gruposComidas, [id]: grupo } };
        set({ datosBorrador: nuevoBorrador, matriz: construirMatrizVistaHorarios(nuevoBorrador), hayCambios: true });
    },
    archivarGrupoComida: (id) => {
        const borradorActual = get().datosBorrador;
        const target = borradorActual.gruposComidas[id];
        if (!target) return;
        const nuevoBorrador = { ...borradorActual, gruposComidas: { ...borradorActual.gruposComidas, [id]: { ...target, estaActivo: false } } };
        set({ datosBorrador: nuevoBorrador, matriz: construirMatrizVistaHorarios(nuevoBorrador), hayCambios: true });
    },
    upsertHorarioSolicitud: (id, horario) => {
        const borradorActual = get().datosBorrador;
        const nuevoBorrador = { ...borradorActual, horariosSolicitud: { ...borradorActual.horariosSolicitud, [id]: horario } };
        set({ datosBorrador: nuevoBorrador, matriz: construirMatrizVistaHorarios(nuevoBorrador), hayCambios: true });
    },
    archivarHorarioSolicitud: (id) => {
        const borradorActual = get().datosBorrador;
        const target = borradorActual.horariosSolicitud[id];
        if (!target) return;
        const nuevoBorrador = { ...borradorActual, horariosSolicitud: { ...borradorActual.horariosSolicitud, [id]: { ...target, estaActivo: false } } };
        set({ datosBorrador: nuevoBorrador, matriz: construirMatrizVistaHorarios(nuevoBorrador), hayCambios: true });
    },
    upsertTiempoComida: (id, tiempo) => {
        const borradorActual = get().datosBorrador;
        const nuevoBorrador = { ...borradorActual, esquemaSemanal: { ...borradorActual.esquemaSemanal, [id]: tiempo } };
        set({ datosBorrador: nuevoBorrador, matriz: construirMatrizVistaHorarios(nuevoBorrador), hayCambios: true });
    },
    archivarTiempoComida: (id) => {
        const borradorActual = get().datosBorrador;
        const target = borradorActual.esquemaSemanal[id];
        if (!target) return;
        const nuevoBorrador = { ...borradorActual, esquemaSemanal: { ...borradorActual.esquemaSemanal, [id]: { ...target, estaActivo: false } } };
        set({ datosBorrador: nuevoBorrador, matriz: construirMatrizVistaHorarios(nuevoBorrador), hayCambios: true });
    },
    upsertDefinicionAlternativa: (id, definicion) => {
        const borradorActual = get().datosBorrador;
        const nuevoBorrador = { ...borradorActual, catalogoAlternativas: { ...borradorActual.catalogoAlternativas, [id]: definicion } };
        set({ datosBorrador: nuevoBorrador, matriz: construirMatrizVistaHorarios(nuevoBorrador), hayCambios: true });
    },
    archivarDefinicionAlternativa: (id) => {
        const borradorActual = get().datosBorrador;
        const target = borradorActual.catalogoAlternativas[id];
        if (!target) return;
        const nuevoBorrador = { ...borradorActual, catalogoAlternativas: { ...borradorActual.catalogoAlternativas, [id]: { ...target, estaActivo: false } } };
        set({ datosBorrador: nuevoBorrador, matriz: construirMatrizVistaHorarios(nuevoBorrador), hayCambios: true });
    },

    // --- ACCIONES CRUD CON SINCRONIZACIÓN ---
    upsertConfiguracionAlternativa: (id, config) => {
        const borradorActual = get().datosBorrador;
        let nuevoBorrador = {
            ...borradorActual,
            configuracionesAlternativas: { ...borradorActual.configuracionesAlternativas, [id]: config },
        };
        nuevoBorrador = _sincronizarAlternativas(config.tiempoComidaId, nuevoBorrador);
        set({
            datosBorrador: nuevoBorrador,
            matriz: construirMatrizVistaHorarios(nuevoBorrador),
            hayCambios: true,
        });
    },
    archivarConfiguracionAlternativa: (id) => {
        const borradorActual = get().datosBorrador;
        const config = borradorActual.configuracionesAlternativas[id];
        if (!config) return;

        let nuevoBorrador = {
            ...borradorActual,
            configuracionesAlternativas: { ...borradorActual.configuracionesAlternativas, [id]: { ...config, estaActivo: false } },
        };
        nuevoBorrador = _sincronizarAlternativas(config.tiempoComidaId, nuevoBorrador);
        set({
            datosBorrador: nuevoBorrador,
            matriz: construirMatrizVistaHorarios(nuevoBorrador),
            hayCambios: true,
        });
    },
    setAlternativaPrincipal: (tiempoComidaId, nuevaPrincipalId) => {
        const borradorActual = get().datosBorrador;
        const tiempoComida = borradorActual.esquemaSemanal[tiempoComidaId];
        if (!tiempoComida) return;

        const tiempoComidaActualizado = {
            ...tiempoComida,
            alternativas: { ...tiempoComida.alternativas, principal: nuevaPrincipalId },
        };
        
        let nuevoBorrador = {
            ...borradorActual,
            esquemaSemanal: { ...borradorActual.esquemaSemanal, [tiempoComidaId]: tiempoComidaActualizado },
        };

        nuevoBorrador = _sincronizarAlternativas(tiempoComidaId, nuevoBorrador);

        set({
            datosBorrador: nuevoBorrador,
            matriz: construirMatrizVistaHorarios(nuevoBorrador),
            hayCambios: true,
        });
    },
}));
