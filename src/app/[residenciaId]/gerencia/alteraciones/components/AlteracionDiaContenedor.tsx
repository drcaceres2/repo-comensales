'use client';

import React from 'react';
import { useFormularioDia } from '../lib/useFormularioDia';
import FormularioMasterDetail from './FormularioMasterDetail';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"; // Assuming a generic Alert component
import { Terminal, Loader2 } from 'lucide-react';

type AlteracionDiaContenedorProps = {
  fecha: string;
  residenciaId: string;
};

/**
 * A container component that orchestrates data fetching and state management
 * for the daily alteration form. It consumes the `useFormularioDia` hook
 * and renders the appropriate UI based on the loading, error, or success state.
 *
 * @param {AlteracionDiaContenedorProps} props The component props.
 * @returns {React.ReactElement} The rendered component.
 */
const AlteracionDiaContenedor: React.FC<AlteracionDiaContenedorProps> = ({ fecha, residenciaId }) => {
  const { dataFormulario, isLoading, error } = useFormularioDia(fecha, residenciaId);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-full">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <Terminal className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>
          No se pudo cargar el estado del formulario. Por favor, intente de nuevo más tarde.
          <br />
          <small>{error.message}</small>
        </AlertDescription>
      </Alert>
    );
  }

  if (dataFormulario) {
    return (
      <FormularioMasterDetail
        key={`${residenciaId}-${fecha}`}
        fecha={fecha}
        residenciaId={residenciaId}
        dataFormulario={dataFormulario}
      />
    );
  }

  // Fallback in case data is not available for some reason
  return null;
};

export default AlteracionDiaContenedor;
