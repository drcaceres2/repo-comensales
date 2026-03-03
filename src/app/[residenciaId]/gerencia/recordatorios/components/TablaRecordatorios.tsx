'use client';

import { Recordatorio } from 'shared/schemas/recordatorios';
import { Button } from '@/components/ui/button';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

// --- Helper para Humanizar RRULE ---
function humanizarRRule(rrule?: string): string {
    if (!rrule) return 'Una vez';
    if (rrule.includes('FREQ=DAILY')) return 'Diario';
    if (rrule.includes('FREQ=WEEKLY')) return 'Semanal';
    if (rrule.includes('FREQ=MONTHLY')) return 'Mensual';
    if (rrule.includes('FREQ=YEARLY')) return 'Anual';
    return 'Personalizado';
}

interface TablaRecordatoriosProps {
    recordatorios: Recordatorio[];
    isLoading: boolean;
    onEdit: (recordatorio: Recordatorio) => void;
    onDeactivate: (recordatorioId: string) => void;
}

/**
 * Componente de presentación para mostrar una lista de recordatorios en una tabla.
 * No contiene lógica de fetching ni de estado de UI, solo recibe datos y emite eventos.
 */
export function TablaRecordatorios({
    recordatorios,
    isLoading,
    onEdit,
    onDeactivate,
}: TablaRecordatoriosProps) {
    if (isLoading) {
        return (
            <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
            </div>
        );
    }

    return (
        <div className="border rounded-lg">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Título</TableHead>
                        <TableHead>Patrón</TableHead>
                        <TableHead>Validez</TableHead>
                        <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {recordatorios.length === 0 && !isLoading ? (
                        <TableRow>
                            <TableCell colSpan={4} className="text-center h-24">
                                No se encontraron recordatorios. ¡Crea uno nuevo!
                            </TableCell>
                        </TableRow>
                    ) : (
                        recordatorios.map((recordatorio) => {
                            const noEditable = recordatorio.tipo === 'cumpleanos' || recordatorio.tipo === 'sistema';
                            return (
                                <TableRow key={recordatorio.id}>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: recordatorio.color }} />
                                            <span className="font-medium">{recordatorio.titulo}</span>
                                            {noEditable && <Badge variant="secondary">{recordatorio.tipo}</Badge>}
                                        </div>
                                    </TableCell>
                                    <TableCell>{humanizarRRule(recordatorio.reglaRecurrencia)}</TableCell>
                                    <TableCell>
                                        {new Date(recordatorio.fechaInicioValidez).toLocaleDateString()} - {new Date(recordatorio.fechaFinValidez).toLocaleDateString()}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => onEdit(recordatorio)}
                                            disabled={noEditable}
                                            aria-label={noEditable ? `El recordatorio de tipo ${recordatorio.tipo} no es editable` : 'Editar'}
                                        >
                                            Editar
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => onDeactivate(recordatorio.id)}
                                            disabled={noEditable}
                                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                            aria-label={noEditable ? `No se puede desactivar` : 'Desactivar'}
                                        >
                                            Desactivar
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            );
                        })
                    )}
                </TableBody>
            </Table>
        </div>
    );
}
