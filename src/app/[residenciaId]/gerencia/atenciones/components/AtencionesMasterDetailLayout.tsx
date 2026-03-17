'use client';

import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { Atencion } from 'shared/schemas/atenciones';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/useToast';
import { useIsMobile } from '@/hooks/useMobile';
import { FiltroEstadoAtenciones, FiltroAtenciones } from './FiltroEstadoAtenciones';
import { AtencionesMasterList } from './AtencionesMasterList';
import { AtencionDetailForm } from './AtencionDetailForm';
import { useMutacionesAtenciones, useObtenerAtenciones } from '../lib/consultas';

interface AtencionesMasterDetailLayoutProps {
  residenciaId: string;
  usuarioId: string;
  email: string;
  initialAtenciones: Atencion[];
}

export function AtencionesMasterDetailLayout({
  residenciaId,
  usuarioId,
  email,
  initialAtenciones,
}: AtencionesMasterDetailLayoutProps) {
  const [filtro, setFiltro] = useState<FiltroAtenciones>('activas');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const { toast } = useToast();
  const isMobile = useIsMobile();

  const { data: atenciones = [], isLoading, error } = useObtenerAtenciones(
    residenciaId,
    initialAtenciones,
  );

  const {
    crearMutation,
    actualizarMutation,
    cambiarEstadoMutation,
    eliminarMutation,
  } = useMutacionesAtenciones(residenciaId);

  const conteos = useMemo(
    () => ({
      activas: atenciones.filter((item) => item.estado !== 'rechazada').length,
      pendientes: atenciones.filter((item) => item.estado === 'pendiente').length,
      todas: atenciones.length,
    }),
    [atenciones],
  );

  const atencionesFiltradas = useMemo(() => {
    if (filtro === 'activas') {
      return atenciones.filter((item) => item.estado !== 'rechazada');
    }

    if (filtro === 'pendientes') {
      return atenciones.filter((item) => item.estado === 'pendiente');
    }

    return atenciones;
  }, [atenciones, filtro]);

  const selectedAtencion = useMemo(
    () => atenciones.find((item) => item.id === selectedId) || null,
    [atenciones, selectedId],
  );

  const handleSelect = (id: string) => {
    setSelectedId(id);
    setSheetOpen(true);
  };

  const handleCreateOpen = () => {
    setSelectedId(null);
    setSheetOpen(true);
  };

  const handleQuickEstado = async (id: string, estado: Atencion['estado']) => {
    const result = await cambiarEstadoMutation.mutateAsync({ id, estado });

    if (!result.success) {
      toast({
        variant: 'destructive',
        title: 'No se pudo cambiar el estado',
        description: result.message,
      });
      return;
    }

    toast({
      title: 'Estado actualizado',
      description: `La atencion ahora esta ${result.data.estado}.`,
    });
  };

  const handleCreate = async (payload: any) => {
    const result = await crearMutation.mutateAsync(payload);
    if (!result.success) {
      toast({
        variant: 'destructive',
        title: 'No se pudo crear la atencion',
        description: result.message,
      });
      return;
    }

    setSelectedId(result.data.id);
    toast({
      title: 'Atencion creada',
      description: 'La atencion se registro correctamente.',
    });
  };

  const handleUpdate = async (payload: any) => {
    const result = await actualizarMutation.mutateAsync(payload);
    if (!result.success) {
      toast({
        variant: 'destructive',
        title: 'No se pudo actualizar la atencion',
        description: result.message,
      });
      return;
    }

    toast({
      title: 'Atencion actualizada',
      description: 'Los cambios se guardaron correctamente.',
    });
  };

  const handleDelete = async (atencionId: string) => {
    const result = await eliminarMutation.mutateAsync(atencionId);
    if (!result.success) {
      toast({
        variant: 'destructive',
        title: 'No se pudo eliminar la atencion',
        description: result.message,
      });
      return;
    }

    setSheetOpen(false);
    setSelectedId(null);
    toast({
      title: 'Atencion eliminada',
      description: 'La atencion fue eliminada correctamente.',
    });
  };

  return (
    <div className="container mx-auto space-y-6 px-4 py-6 sm:px-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Gestion de Atenciones</h1>
        <p className="text-sm text-muted-foreground">
          Residencia: {residenciaId} | Usuario: {usuarioId} ({email})
        </p>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <FiltroEstadoAtenciones value={filtro} onChange={setFiltro} conteos={conteos} />
        <Button type="button" onClick={handleCreateOpen}>
          <Plus className="mr-2 h-4 w-4" />
          Nueva atencion
        </Button>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Error cargando atenciones</AlertTitle>
          <AlertDescription>
            Ocurrio un problema al consultar las atenciones de la residencia.
          </AlertDescription>
        </Alert>
      ) : isLoading ? (
        <div className="rounded-lg border p-6 text-sm text-muted-foreground">Cargando atenciones...</div>
      ) : (
        <AtencionesMasterList
          atenciones={atencionesFiltradas}
          selectedId={selectedId}
          onSelect={handleSelect}
          onCambiarEstado={handleQuickEstado}
          quickActionsBusy={cambiarEstadoMutation.isPending}
        />
      )}

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side={isMobile ? 'bottom' : 'right'}
          className="w-full h-full max-h-screen flex flex-col sm:max-w-2xl p-0"
        >
          <div className="flex-1 min-h-0 overflow-y-auto px-6 pt-6">
            <SheetHeader>
              <SheetTitle>
                {selectedAtencion ? 'Detalle de atencion' : 'Crear nueva atencion'}
              </SheetTitle>
              <SheetDescription>
                Gestiona los datos principales y el estado interno de la atencion.
              </SheetDescription>
            </SheetHeader>
            <div className="mt-6">
              <AtencionDetailForm
                atencion={selectedAtencion}
                onCreate={handleCreate}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
                saving={crearMutation.isPending || actualizarMutation.isPending}
                deleting={eliminarMutation.isPending}
                onCancel={() => setSheetOpen(false)}
                residenciaId={residenciaId}
              />
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
