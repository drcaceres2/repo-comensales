import { redirect } from 'next/navigation';
import { Mail } from 'lucide-react';
import MensajesPageClient from './components/MensajesPageClient';
import {
  obtenerDestinatariosMensajesAction,
  obtenerMensajesBandejaAction,
} from './actions';
import { obtenerInfoUsuarioServer } from '@/lib/obtenerInfoUsuarioServer';
import { urlAccesoNoAutorizado } from "@/lib/utils";

export default async function MensajesPage({ params }: { params: Promise<{ residenciaId: string }> }) {
  const { residenciaId } = await params;
  const sesion = await obtenerInfoUsuarioServer();

  if (!sesion.usuarioId || sesion.residenciaId !== residenciaId) {
    redirect(urlAccesoNoAutorizado("Problemas con la sesión del usuario."));
  }

  const [mensajesResult, destinatariosResult] = await Promise.all([
    obtenerMensajesBandejaAction(residenciaId),
    obtenerDestinatariosMensajesAction(residenciaId),
  ]);

  const initialMensajes = mensajesResult.success && mensajesResult.data ? mensajesResult.data : [];
  const initialDestinatarios =
    destinatariosResult.success && destinatariosResult.data
      ? destinatariosResult.data
      : { usuarios: [], grupos: [] };

  return (
    <main className="space-y-6 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <Mail className="h-7 w-7 text-gray-500" />
        <div>
          <h1 className="text-2xl font-bold">Mensajes</h1>
          <p className="text-sm text-muted-foreground">Residencia: {residenciaId}</p>
        </div>
      </div>

      <MensajesPageClient
        residenciaId={residenciaId}
        initialMensajes={initialMensajes}
        initialDestinatarios={initialDestinatarios}
      />
    </main>
  );
}

