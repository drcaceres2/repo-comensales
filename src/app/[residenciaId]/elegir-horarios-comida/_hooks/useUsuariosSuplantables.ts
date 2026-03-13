"use client";
import { useQuery } from '@tanstack/react-query';
import { obtenerUsuariosSuplantables } from '../_actions/obtenerUsuariosSuplantables';

export function useUsuariosSuplantables(residenciaId: string, rolUsuarioActual: string) {
  const puedeSuplantar = rolUsuarioActual === 'director' || rolUsuarioActual === 'asistente';

  return useQuery({
    // La QueryKey única que identifica esta caché
    queryKey: ['usuarios-suplantables', residenciaId],
    
    // La llamada a la Server Action
    queryFn: () => obtenerUsuariosSuplantables(residenciaId),
    
    // Cacheamos por 30 minutos. La lista de residentes cambia muy poco.
    staleTime: 1000 * 60 * 30, 
    
    // Regla de oro: No ejecutar la query si el usuario es un residente
    enabled: puedeSuplantar, 
  });
}