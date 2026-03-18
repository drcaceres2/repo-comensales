import { redirect } from 'next/navigation';
import { format } from 'date-fns';
import { obtenerInfoUsuarioServer } from '@/lib/obtenerInfoUsuarioServer';
import { VistaHorariosCliente } from '@/app/[residenciaId]/elegir-horarios-comida/_components/VistaHorariosCliente';
import {urlAccesoNoAutorizado} from "@/lib/utils";

export default async function ElegirHorariosPage() {
  const sesion = await obtenerInfoUsuarioServer();
  const residenciaId = sesion.residenciaId;

  if (!sesion.usuarioId) {
    redirect('/login');
  }

  if (!residenciaId) {
    redirect(urlAccesoNoAutorizado("Parece que no hay sesión de usuario."));
  }

  const fechaInicial = format(new Date(), 'yyyy-MM-dd');

  return <VistaHorariosCliente residenciaId={residenciaId} fechaInicial={fechaInicial} />;
}
