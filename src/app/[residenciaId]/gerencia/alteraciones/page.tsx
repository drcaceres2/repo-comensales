"use server";

import { dehydrate, QueryClient } from "@tanstack/react-query";
import { obtenerInfoUsuarioServer } from "@/lib/obtenerInfoUsuarioServer";

import AlteracionesClientView from "./AlteracionesClientView";
import { fetchAlteracionesServer } from "./lib/server-service";

export default async function AlteracionesPage() {
  const { residenciaId, usuarioId } = await obtenerInfoUsuarioServer();

  const queryClient = new QueryClient();

  await queryClient.prefetchQuery({
    queryKey: ["alteraciones", residenciaId],
    queryFn: () => fetchAlteracionesServer(residenciaId),
  });

  const dehydratedState = dehydrate(queryClient);

  return (
    <AlteracionesClientView
      residenciaId={residenciaId}
      usuarioId={usuarioId}
      dehydratedState={dehydratedState}
    />
  );
}