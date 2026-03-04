"use client";

import { useState } from "react";
import {
  type DehydratedState,
  HydrationBoundary,
} from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import AlteracionForm from "./AlteracionForm";
import { useAlteraciones } from "./lib/useAlteraciones";

interface AlteracionesClientViewProps {
  residenciaId: string;
  usuarioId: string;
  dehydratedState: DehydratedState;
}

function AlteracionesContent({
  residenciaId,
  usuarioId,
}: {
  residenciaId: string;
  usuarioId: string;
}) {
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const {
    alteraciones,
    isLoadingAlteraciones,
    isFetchingAlteraciones,
    isErrorAlteraciones,
  } = useAlteraciones(residenciaId);
  const alteracionesUI = alteraciones as unknown as Array<{
    id: string;
    nombre: string;
    fechaInicio: string;
    fechaFin: string;
    estado: string;
  }>;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Gestión de alteraciones</h1>
        <Button
          type="button"
          variant="outline"
          onClick={() => setMostrarFormulario((prev) => !prev)}
        >
          {mostrarFormulario ? "Cerrar formulario" : "Nueva alteración"}
        </Button>
      </div>

      {mostrarFormulario && (
        <Card>
          <CardContent className="p-4">
            <AlteracionForm residenciaId={residenciaId} autorId={usuarioId} />
          </CardContent>
        </Card>
      )}

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Fecha inicio</TableHead>
              <TableHead>Fecha fin</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoadingAlteraciones && (
              <TableRow>
                <TableCell colSpan={4} className="text-center">
                  Cargando alteraciones...
                </TableCell>
              </TableRow>
            )}
            {isErrorAlteraciones && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-red-600">
                  No se pudieron cargar las alteraciones.
                </TableCell>
              </TableRow>
            )}
            {!isLoadingAlteraciones &&
              !isFetchingAlteraciones &&
              !isErrorAlteraciones &&
              alteraciones.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center">
                    No hay alteraciones registradas.
                  </TableCell>
                </TableRow>
              )}
            {!isLoadingAlteraciones &&
              !isErrorAlteraciones &&
              alteracionesUI.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.nombre}</TableCell>
                  <TableCell>{item.fechaInicio}</TableCell>
                  <TableCell>{item.fechaFin}</TableCell>
                  <TableCell>{item.estado}</TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </Card>
    </section>
  );
}

export default function AlteracionesClientView({
  residenciaId,
  usuarioId,
  dehydratedState,
}: AlteracionesClientViewProps) {
  return (
    <HydrationBoundary state={dehydratedState}>
      <AlteracionesContent residenciaId={residenciaId} usuarioId={usuarioId} />
    </HydrationBoundary>
  );
}
