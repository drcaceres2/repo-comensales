'use client';

import { useState } from 'react';
import { Recordatorio } from 'shared/schemas/recordatorios';
import { useObtenerRecordatorios, useMutacionesRecordatorio } from '../consultas';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import { FormularioRecordatorio } from './FormularioRecordatorio';
import { TablaRecordatorios } from './TablaRecordatorios';
import { useInfoUsuario } from '@/components/layout/AppProviders';

export const GestionRecordatoriosClient = () => {
    const authSesion = useInfoUsuario();

    if (
        !authSesion ||
        !authSesion.residenciaId ||
        authSesion.residenciaId === '' ||
        !authSesion.usuarioId ||
        authSesion.usuarioId === ''
    ) {
        return (
            <div className="container mx-auto py-8">
                <h1 className="text-3xl font-bold">Gestión de Recordatorios</h1>
                <p className="mt-4 text-gray-600">
                    Inicia sesión para gestionar los recordatorios de tu residencia.
                </p>
            </div>
        );
    }

    const residenciaId = authSesion.residenciaId;
    const usuarioIniciadorId = authSesion.usuarioId;

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [recordatorioEnEdicion, setRecordatorioEnEdicion] =
        useState<Recordatorio | null>(null);

    const { data: recordatorios, isLoading } =
        useObtenerRecordatorios(residenciaId);
    const { crearMutation, actualizarMutation, desactivarMutation } =
        useMutacionesRecordatorio(residenciaId);

    const handleAbrirParaCrear = () => {
        setRecordatorioEnEdicion(null);
        setIsModalOpen(true);
    };

    const handleAbrirParaEditar = (recordatorio: Recordatorio) => {
        setRecordatorioEnEdicion(recordatorio);
        setIsModalOpen(true);
    };

    const handleFormSubmit = async (
        payload: Recordatorio | Omit<Recordatorio, 'id' | 'timestampCreacion' | 'tipo'>
    ) => {
        const promise = 'id' in payload
            ? actualizarMutation.mutateAsync(payload as Recordatorio)
            : crearMutation.mutateAsync(payload);

        try {
            const result = await promise;

            if (result && result.success) {
                setIsModalOpen(false);
                return result;
            }

            return result;
        } catch (error) {
            console.error('Error inesperado durante la mutación:', error);
        }
    };

    return (
        <div className="container mx-auto py-8 space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold">Gestión de Recordatorios</h1>
                <Button onClick={handleAbrirParaCrear}>Nuevo Recordatorio</Button>
            </div>

            <TablaRecordatorios
                recordatorios={recordatorios || []}
                isLoading={isLoading}
                onEdit={handleAbrirParaEditar}
                onDeactivate={(recordatorioId) =>
                    desactivarMutation.mutate(recordatorioId)
                }
            />

            {isModalOpen && (
                <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                    <DialogContent className="sm:max-w-[600px]">
                        <DialogHeader>
                            <DialogTitle>
                                {recordatorioEnEdicion
                                    ? 'Editar Recordatorio'
                                    : 'Crear Nuevo Recordatorio'}
                            </DialogTitle>
                            <DialogDescription>
                                {recordatorioEnEdicion
                                    ? 'Modifica los detalles de tu recordatorio.'
                                    : 'Completa el formulario para añadir un nuevo recordatorio recurrente.'}
                            </DialogDescription>
                        </DialogHeader>
                        <div className="py-4">
                            <FormularioRecordatorio
                                residenciaId={residenciaId}
                                usuarioIniciadorId={usuarioIniciadorId}
                                recordatorioInicial={
                                    recordatorioEnEdicion ?? undefined
                                }
                                onFormSubmit={handleFormSubmit}
                                onCancel={() => setIsModalOpen(false)}
                            />
                        </div>
                    </DialogContent>
                </Dialog>
            )}
        </div>
    );
};
