import { getActividadesDisponibles } from './actions';
import { ActividadesClient } from './actividades-client';

export default async function InscripcionActividadesPage({
  params,
}: {
  // Typing as any to accommodate the runtime behavior where params is a Promise
  params: any;
}) {
  const { residenciaId } = await params;
  const actividades = await getActividadesDisponibles(residenciaId);

  return <ActividadesClient actividadesIniciales={actividades} residenciaId={residenciaId} />;
}
