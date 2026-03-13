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

  return (
    <section className="rounded-lg border bg-muted/40 p-3">
      <p className="mb-2 text-sm font-medium">Usuario</p>

      <Select value={targetUid ?? usuarioId} onValueChange={setTargetUid} disabled={isLoading}>
        <SelectTrigger>
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
    </section>
  );
}
