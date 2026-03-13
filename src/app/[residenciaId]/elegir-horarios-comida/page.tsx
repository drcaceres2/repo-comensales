import { redirect } from 'next/navigation';
import { format } from 'date-fns';
import { obtenerInfoUsuarioServer } from '@/lib/obtenerInfoUsuarioServer';
import { VistaHorariosCliente } from '@/app/[residenciaId]/elegir-horarios-comida/_components/VistaHorariosCliente';

export default async function ElegirHorariosPage({
  params,
}: {
  params: Promise<{ residenciaId: string }>;
}) {
  const [{ residenciaId: residenciaRuta }, sesion] = await Promise.all([
    params,
    obtenerInfoUsuarioServer(),
  ]);

  if (!sesion.usuarioId) {
    redirect('/login');
  }

  if (sesion.residenciaId !== residenciaRuta) {
    redirect('/acceso-no-autorizado');
  }

  const fechaInicial = format(new Date(), 'yyyy-MM-dd');

  return <VistaHorariosCliente residenciaId={residenciaRuta} fechaInicial={fechaInicial} />;
}
