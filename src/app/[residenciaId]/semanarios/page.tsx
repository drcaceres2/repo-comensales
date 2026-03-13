import { redirect } from 'next/navigation';
import { obtenerInfoUsuarioServer } from '@/lib/obtenerInfoUsuarioServer';
import { SemanarioContainer } from './components/SemanarioContainer';

export default async function SemanariosPage({
  params,
}: {
  params: Promise<{ residenciaId: string }>;
}) {
  const [{ residenciaId }, sesion] = await Promise.all([params, obtenerInfoUsuarioServer()]);

  if (!sesion.usuarioId) {
    redirect('/login');
  }

  if (sesion.residenciaId !== residenciaId) {
    redirect('/acceso-no-autorizado');
  }

  const rolesValidos = ['residente', 'invitado', 'asistente', 'director'];
  const tieneAcceso = sesion.roles.some((role) => rolesValidos.includes(role));
  const tieneRolRestringido = sesion.roles.includes('master') || sesion.roles.includes('admin');

  if (!tieneAcceso || tieneRolRestringido) {
    redirect('/acceso-no-autorizado');
  }

  return (
    <main className="mx-auto flex h-[100dvh] max-w-2xl flex-col overflow-hidden p-4 md:p-6">
      <SemanarioContainer residenciaId={residenciaId} />
    </main>
  );
}
