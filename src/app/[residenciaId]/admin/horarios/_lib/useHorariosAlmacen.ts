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

    // 2. ESTADO DE DATOS (DRAFT PATTERN)
    datosOriginales: DatosHorariosEnBruto | null;
    datosBorrador: DatosHorariosEnBruto;
    version: number;
    hayCambios: boolean;

    // 3. ESTADO COMPUTADO (Reactivo)
    matriz: MatrizVistaHorarios;

    // 4. ESTADO DE AUDITORÍA (A demanda)
    alertas: Alerta[];
    alertasIgnoradas: string[]; // Arreglo de IDs deterministas de alertas que el usuario ocultó

    // ACCIONES DE UI
    setPasoActual: (paso: number) => void;
    toggleMostrarInactivos: () => void;

    // ACCIONES DE DATOS
    inicializarDatos: (datosDelServidor: DatosHorariosEnBruto, version: number) => void;
    descartarCambios: () => void; // Restaura datosOriginales sobre datosBorrador y setea hayCambios = false

    // ACCIONES DE AUDITORÍA
    ejecutarAuditoria: () => void;
    ignorarAlerta: (idAviso: string) => void; // Agrega el ID al arreglo alertasIgnoradas

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
}

const datosVacios: DatosHorariosEnBruto = {
    gruposComidas: {},
    horariosSolicitud: {},
    esquemaSemanal: {},
    catalogoAlternativas: {},
    configuracionesAlternativas: {},
    comedores: {}
};

export const useHorariosAlmacen = create<HorariosState>((set, get) => ({
    // 1. ESTADO DE UI Y NAVEGACIÓN
    pasoActual: 1,
    mostrarInactivos: false,

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
    // --- GrupoComida ---
    upsertGrupoComida: (id, grupo) => {
        const borradorActual = get().datosBorrador;
        const nuevoBorrador = {
            ...borradorActual,
            gruposComidas: { ...borradorActual.gruposComidas, [id]: grupo },
        };
        set({
            datosBorrador: nuevoBorrador,
            matriz: construirMatrizVistaHorarios(nuevoBorrador),
            hayCambios: true,
        });
    },
    archivarGrupoComida: (id) => {
        const borradorActual = get().datosBorrador;
        const target = borradorActual.gruposComidas[id];
        if (!target) return;
        const nuevoBorrador = {
            ...borradorActual,
            gruposComidas: { ...borradorActual.gruposComidas, [id]: { ...target, estaActivo: false } },
        };
        set({
            datosBorrador: nuevoBorrador,
            matriz: construirMatrizVistaHorarios(nuevoBorrador),
            hayCambios: true,
        });
    },

    // --- HorarioSolicitudData ---
    upsertHorarioSolicitud: (id, horario) => {
        const borradorActual = get().datosBorrador;
        const nuevoBorrador = {
            ...borradorActual,
            horariosSolicitud: { ...borradorActual.horariosSolicitud, [id]: horario },
        };
        set({
            datosBorrador: nuevoBorrador,
            matriz: construirMatrizVistaHorarios(nuevoBorrador),
            hayCambios: true,
});
    },
    archivarHorarioSolicitud: (id) => {
        const borradorActual = get().datosBorrador;
        const target = borradorActual.horariosSolicitud[id];
        if (!target) return;
        const nuevoBorrador = {
            ...borradorActual,
            horariosSolicitud: { ...borradorActual.horariosSolicitud, [id]: { ...target, estaActivo: false } },
        };
        set({
            datosBorrador: nuevoBorrador,
            matriz: construirMatrizVistaHorarios(nuevoBorrador),
            hayCambios: true,
        });
    },

    // --- TiempoComida ---
    upsertTiempoComida: (id, tiempo) => {
        const borradorActual = get().datosBorrador;
        const nuevoBorrador = {
            ...borradorActual,
            esquemaSemanal: { ...borradorActual.esquemaSemanal, [id]: tiempo },
        };
        set({
            datosBorrador: nuevoBorrador,
            matriz: construirMatrizVistaHorarios(nuevoBorrador),
            hayCambios: true,
        });
    },
    archivarTiempoComida: (id) => {
        const borradorActual = get().datosBorrador;
        const target = borradorActual.esquemaSemanal[id];
        if (!target) return;
        const nuevoBorrador = {
            ...borradorActual,
            esquemaSemanal: { ...borradorActual.esquemaSemanal, [id]: { ...target, estaActivo: false } },
        };
        set({
            datosBorrador: nuevoBorrador,
            matriz: construirMatrizVistaHorarios(nuevoBorrador),
            hayCambios: true,
        });
    },

    // --- DefinicionAlternativa ---
    upsertDefinicionAlternativa: (id, definicion) => {
        const borradorActual = get().datosBorrador;
        const nuevoBorrador = {
            ...borradorActual,
            catalogoAlternativas: { ...borradorActual.catalogoAlternativas, [id]: definicion },
        };
        set({
            datosBorrador: nuevoBorrador,
            matriz: construirMatrizVistaHorarios(nuevoBorrador),
            hayCambios: true,
        });
    },
    archivarDefinicionAlternativa: (id) => {
        const borradorActual = get().datosBorrador;
        const target = borradorActual.catalogoAlternativas[id];
        if (!target) return;
        const nuevoBorrador = {
            ...borradorActual,
            catalogoAlternativas: { ...borradorActual.catalogoAlternativas, [id]: { ...target, estaActiva: false } },
        };
        set({
            datosBorrador: nuevoBorrador,
            matriz: construirMatrizVistaHorarios(nuevoBorrador),
            hayCambios: true,
        });
    },

    // --- ConfiguracionAlternativa ---
    upsertConfiguracionAlternativa: (id, config) => {
        const borradorActual = get().datosBorrador;
        const nuevoBorrador = {
            ...borradorActual,
            configuracionesAlternativas: { ...borradorActual.configuracionesAlternativas, [id]: config },
        };
        set({
            datosBorrador: nuevoBorrador,
            matriz: construirMatrizVistaHorarios(nuevoBorrador),
            hayCambios: true,
        });
    },
    archivarConfiguracionAlternativa: (id) => {
        const borradorActual = get().datosBorrador;
        const target = borradorActual.configuracionesAlternativas[id];
        if (!target) return;
        const nuevoBorrador = {
            ...borradorActual,
            configuracionesAlternativas: { ...borradorActual.configuracionesAlternativas, [id]: { ...target, estaActivo: false } },
        };
        set({
            datosBorrador: nuevoBorrador,
            matriz: construirMatrizVistaHorarios(nuevoBorrador),
            hayCambios: true,
        });
    },
}));
