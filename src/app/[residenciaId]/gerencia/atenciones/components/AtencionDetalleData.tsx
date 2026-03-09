import { ReactNode } from 'react';

interface AtencionDetalleDataProps {
  children: ReactNode;
}

// Placeholder server component para futuras cargas pesadas del detalle.
export async function AtencionDetalleData({ children }: AtencionDetalleDataProps) {
  return <>{children}</>;
}
