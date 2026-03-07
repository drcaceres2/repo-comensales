'use server';

import ComedorClient from './ComedorClient';
import { verificarPermisoGestionWrapper } from '@/lib/acceso-privilegiado'

export default async function GestionComedoresPage() {
  const resultadoAcceso = await verificarPermisoGestionWrapper('gestionComedores');
  return <ComedorClient resultadoAcceso={resultadoAcceso} />;
}