'use client';

import { format } from 'date-fns';
import { create } from 'zustand';

type ModalActivo = 'ninguno' | 'excepcion' | 'ausencia' | 'mensaje';

type AccionGuardado = 'excepcion' | 'ausencia';

type TarjetaActiva = {
  fecha: string;
  tiempoComidaId: string;
} | null;

type SavingState = Record<AccionGuardado, boolean>;

type HorariosUiState = {
  usuarioSesionId: string | null;
  targetUid: string | null;
  fechaEnFoco: string;
  drawerAbierto: boolean;
  modalActivo: ModalActivo;
  tarjetaActiva: TarjetaActiva;
  saving: SavingState;

  syncUsuarioSesion: (usuarioId: string) => void;
  setTargetUid: (targetUid: string) => void;
  setFechaEnFoco: (fecha: string) => void;
  abrirDrawerTarjeta: (input: { fecha: string; tiempoComidaId: string }) => void;
  cerrarDrawer: () => void;
  abrirModal: (modal: Exclude<ModalActivo, 'ninguno'>) => void;
  cerrarModal: () => void;
  setSavingAccion: (accion: AccionGuardado, saving: boolean) => void;
  resetInteraccionDia: () => void;
};

const hoyIso = format(new Date(), 'yyyy-MM-dd');

export const useHorariosStore = create<HorariosUiState>((set) => ({
  usuarioSesionId: null,
  targetUid: null,
  fechaEnFoco: hoyIso,
  drawerAbierto: false,
  modalActivo: 'ninguno',
  tarjetaActiva: null,
  saving: {
    excepcion: false,
    ausencia: false,
  },

  syncUsuarioSesion: (usuarioId) =>
    set((state) => {
      const sessionChanged = state.usuarioSesionId !== usuarioId;

      return {
        usuarioSesionId: usuarioId,
        targetUid: sessionChanged ? usuarioId : (state.targetUid ?? usuarioId),
      };
    }),
  setTargetUid: (targetUid) =>
    set({
      targetUid,
      drawerAbierto: false,
      modalActivo: 'ninguno',
      tarjetaActiva: null,
    }),
  setFechaEnFoco: (fecha) => set({ fechaEnFoco: fecha }),
  abrirDrawerTarjeta: ({ fecha, tiempoComidaId }) =>
    set({
      drawerAbierto: true,
      tarjetaActiva: { fecha, tiempoComidaId },
    }),
  cerrarDrawer: () => set({ drawerAbierto: false, tarjetaActiva: null }),
  abrirModal: (modalActivo) => set({ modalActivo }),
  cerrarModal: () => set({ modalActivo: 'ninguno' }),
  setSavingAccion: (accion, estaGuardando) =>
    set((state) => ({
      saving: {
        ...state.saving,
        [accion]: estaGuardando,
      },
    })),
  resetInteraccionDia: () =>
    set({
      drawerAbierto: false,
      modalActivo: 'ninguno',
      tarjetaActiva: null,
    }),
}));

export type { ModalActivo, AccionGuardado, TarjetaActiva };