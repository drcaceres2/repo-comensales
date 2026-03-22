'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useInfoUsuario } from '@/components/layout/AppProviders';
import { useHorariosStore } from '../_hooks/useHorariosStore';
import { useUsuariosSuplantables } from '../_hooks/useUsuariosSuplantables';

type Props = {
  residenciaId: string;
};

export function BarraSuplantacion({ residenciaId }: Props) {
  const { roles, usuarioId } = useInfoUsuario();
  const targetUid = useHorariosStore((state) => state.targetUid);
  const setTargetUid = useHorariosStore((state) => state.setTargetUid);
  const rolPrincipal = roles.includes('director') ? 'director' : roles.includes('asistente') ? 'asistente' : 'residente';

  const { data, isLoading } = useUsuariosSuplantables(residenciaId, rolPrincipal);

  if (rolPrincipal === 'residente') {
    return null;
  }

  const opciones = data?.success ? data.data ?? [] : [];
  const isSuplantando = targetUid != null && targetUid !== usuarioId;

  return (
    <section className={`rounded-lg border p-3 ${isSuplantando ? 'bg-yellow-50 border-yellow-300' : 'bg-white'}`}>
      <div className="flex items-center justify-between">
        <p className={`text-sm font-medium ${isSuplantando ? 'text-yellow-700' : ''}`}>Usuario</p>

        <div className="w-48">
          <Select value={targetUid ?? usuarioId} onValueChange={setTargetUid} disabled={isLoading}>
            <SelectTrigger className={`h-8 text-sm ${isSuplantando ? 'bg-yellow-50' : ''}`}>
              <SelectValue placeholder="Selecciona un usuario" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={usuarioId}>Mi usuario</SelectItem>
              {opciones.map((usuario) => (
                <SelectItem key={usuario.id} value={usuario.id}>
                  {usuario.nombre} {usuario.apellido}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </section>
  );
}
