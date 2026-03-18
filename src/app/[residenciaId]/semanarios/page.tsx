import { redirect } from 'next/navigation';
import { obtenerInfoUsuarioServer } from '@/lib/obtenerInfoUsuarioServer';
import { SemanarioContainer } from './components/SemanarioContainer';
import { urlAccesoNoAutorizado } from "@/lib/utils";

export default async function SemanariosPage() {
  const sesion = await obtenerInfoUsuarioServer();
  const residenciaId = sesion.residenciaId;

  const rolesValidos = ['residente', 'invitado', 'asistente', 'director'];
  const tieneAcceso = sesion.roles.some((role) => rolesValidos.includes(role));
  const tieneRolRestringido = sesion.roles.includes('master') || sesion.roles.includes('admin');

  if (!sesion.usuarioId || !residenciaId) {
    redirect(urlAccesoNoAutorizado("Problemas con la sesión del usuario."));
  }
  if (!tieneAcceso || tieneRolRestringido) {
    redirect(urlAccesoNoAutorizado("Tu perfil de usuario no tiene acceso a la página de semanarios."));
  }

  return (
    <main className="mx-auto flex h-[100dvh] max-w-2xl flex-col overflow-hidden p-4 md:p-6">
      <SemanarioContainer residenciaId={residenciaId} />
    </main>
  );
}
