"use client";

import type { AsistenteActual } from "../consultas";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface ListaAsistentesActualesProps {
  asistentes: AsistenteActual[];
  isLoading: boolean;
  onEdit: (asistente: AsistenteActual) => void;
  onRevoke: (asistenteId: string) => void;
}

export const ListaAsistentesActuales = ({ asistentes, isLoading, onEdit, onRevoke }: ListaAsistentesActualesProps) => {

  const getVigencia = (asistente: AsistenteActual) => {
    if (asistente.permiso.restriccionTiempo && asistente.permiso.fechaFin) {
      // Idealmente, formatear la fecha
      return `Hasta ${new Date(asistente.permiso.fechaFin).toLocaleDateString()}`;
    }
    return 'Permanente';
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-gray-800">Asistentes Asignados</h2>
      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Asistente</TableHead>
              <TableHead>Nivel de Acceso</TableHead>
              <TableHead>Vigencia</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-sm text-gray-500">Cargando asistentes...</TableCell>
              </TableRow>
            ) : asistentes.length > 0 ? (
              asistentes.map((asistente) => (
                <TableRow key={asistente.id}>
                  <TableCell className="font-medium">{asistente.nombreCompleto}</TableCell>
                  <TableCell>{asistente.permiso.nivelAcceso}</TableCell>
                  <TableCell>{getVigencia(asistente)}</TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button variant="ghost" size="icon" onClick={() => onEdit(asistente)}>
                      <Pencil className="h-4 w-4" />
                      <span className="sr-only">Editar</span>
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => onRevoke(asistente.id)}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                      <span className="sr-only">Revocar</span>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-sm text-gray-500">
                  Este usuario no tiene asistentes asignados.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};
