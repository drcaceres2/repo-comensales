import { redirect } from 'next/navigation';
import { format } from 'date-fns';
import { obtenerInfoUsuarioServer } from '@/lib/obtenerInfoUsuarioServer';
import { VistaHorariosCliente } from '@/app/[residenciaId]/elegir-horarios-comida/_components/VistaHorariosCliente';
import {urlAccesoNoAutorizado} from "@/lib/utils";

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
    redirect(urlAccesoNoAutorizado("Parece que no hay sesión de usuario."));
  }

  const fechaInicial = format(new Date(), 'yyyy-MM-dd');

  return <VistaHorariosCliente residenciaId={residenciaRuta} fechaInicial={fechaInicial} />;
}
