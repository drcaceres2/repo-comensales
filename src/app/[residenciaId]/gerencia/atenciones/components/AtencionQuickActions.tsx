'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Atencion } from 'shared/schemas/atenciones';

interface AtencionQuickActionsProps {
  atencion: Atencion;
  onCambiarEstado: (id: string, estado: Atencion['estado']) => Promise<void>;
  isBusy?: boolean;
}

export function AtencionQuickActions({
  atencion,
  onCambiarEstado,
  isBusy = false,
}: AtencionQuickActionsProps) {
  const [confirmRejectOpen, setConfirmRejectOpen] = useState(false);

  const canApprove = atencion.estado === 'pendiente';
  const canReject =
    atencion.estado === 'pendiente' ||
    (atencion.estado === 'aprobada' && atencion.avisoAdministracion === 'no_comunicado');

  return (
    <div className="flex items-center gap-2">
      {canApprove && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isBusy}
          onClick={() => onCambiarEstado(atencion.id, 'aprobada')}
        >
          Aprobar
        </Button>
      )}

      {canReject && (
        <AlertDialog open={confirmRejectOpen} onOpenChange={setConfirmRejectOpen}>
          <AlertDialogTrigger asChild>
            <Button type="button" variant="destructive" size="sm" disabled={isBusy}>
              Rechazar
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Rechazar atencion</AlertDialogTitle>
              <AlertDialogDescription>
                Esta accion cambiara la atencion a rechazada y forzara
                <strong> avisoAdministracion: cancelado</strong>.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => onCambiarEstado(atencion.id, 'rechazada')}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Confirmar rechazo
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
