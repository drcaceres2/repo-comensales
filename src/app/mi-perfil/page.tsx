import { redirect } from "next/navigation";

import { obtenerInfoUsuarioServer } from "@/lib/obtenerInfoUsuarioServer";
import { MiPerfilClient } from "./MiPerfilClient";

export default async function MiPerfilPage() {
  const sesion = await obtenerInfoUsuarioServer();

  if (!sesion.usuarioId) {
    redirect("/");
  }

  return <MiPerfilClient />;
}

