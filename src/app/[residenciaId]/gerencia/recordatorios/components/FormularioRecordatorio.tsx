'use client';

import {
    useRecordatorioForm,
    RecordatorioFormValues,
} from '../lib/useRecordatorioForm';
import { Recordatorio } from 'shared/schemas/recordatorios';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { DiaSemana, Ordinal } from 'shared/utils/rrule-translator';
import { Controller } from 'react-hook-form';

interface FormularioRecordatorioProps {
    residenciaId: string;
    usuarioIniciadorId: string;
    recordatorioInicial?: Recordatorio;
    onFormSubmit: (
        payload: Recordatorio | Omit<Recordatorio, 'id' | 'timestampCreacion' | 'tipo'>,
    ) => Promise<any>; // Aceptamos cualquier respuesta para manejar errores
    onCancel: () => void;
}

const diasSemana: { id: DiaSemana; label: string }[] = [
    { id: 'SU', label: 'Domingo' }, { id: 'MO', label: 'Lunes' }, { id: 'TU', label: 'Martes' },
    { id: 'WE', label: 'Miércoles' }, { id: 'TH', label: 'Jueves' }, { id: 'FR', label: 'Viernes' },
    { id: 'SA', label: 'Sábado' },
];

const ordinales: { id: Ordinal; label: string }[] = [
    { id: 1, label: 'Primer' }, { id: 2, label: 'Segundo' }, { id: 3, label: 'Tercer' },
    { id: 4, label: 'Cuarto' }, { id: -1, label: 'Último' },
];

export function FormularioRecordatorio({
    residenciaId,
    usuarioIniciadorId,
    recordatorioInicial,
    onFormSubmit,
    onCancel,
}: FormularioRecordatorioProps) {
    const { form, handleFormSubmit } = useRecordatorioForm({
        residenciaId,
        usuarioIniciadorId,
        recordatorioInicial,
        onFormSubmit,
    });

    const { register, watch, control, formState: { errors } } = form;
    const tipoPlantilla = watch('tipoPlantilla');
    const esIndefinido = watch('esIndefinido');

    return (
        <form onSubmit={handleFormSubmit} className="flex flex-col h-full">
            {/* Contenedor principal que se hará scrollable */}
            <div className="flex-grow space-y-6 overflow-y-auto max-h-[70vh] px-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="titulo">Título</Label>
                        <Input id="titulo" {...register('titulo')} required />
                        {errors.titulo && <p className="text-sm text-red-500">{errors.titulo.message}</p>}
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="color">Color</Label>
                        <Input id="color" type="color" {...register('color')} />
                        {errors.color && <p className="text-sm text-red-500">{errors.color.message}</p>}
                    </div>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="descripcion">Descripción (Opcional)</Label>
                    <Input id="descripcion" {...register('descripcion')} />
                    {errors.descripcion && <p className="text-sm text-red-500">{errors.descripcion.message}</p>}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                    <div className="space-y-2">
                        <Label htmlFor="fechaInicioValidez">Válido Desde</Label>
                        <Input id="fechaInicioValidez" type="date" {...register('fechaInicioValidez')} required />
                        {errors.fechaInicioValidez && <p className="text-sm text-red-500">{errors.fechaInicioValidez.message}</p>}
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="fechaFinValidez">Válido Hasta</Label>
                        <Input
                            id="fechaFinValidez"
                            type="date"
                            {...register('fechaFinValidez')}
                            required={!esIndefinido}
                            disabled={esIndefinido}
                        />
                        {errors.fechaFinValidez && <p className="text-sm text-red-500">{errors.fechaFinValidez.message}</p>}
                    </div>
                </div>

                <div className="flex items-center space-x-2">
                    <Controller
                        name="esIndefinido"
                        control={control}
                        render={({ field }) => (
                            <Checkbox
                                id="esIndefinido"
                                checked={field.value}
                                onCheckedChange={field.onChange}
                            />
                        )}
                    />
                    <Label htmlFor="esIndefinido">Repetir indefinidamente</Label>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="tipoPlantilla">Recurrencia</Label>
                    <Select
                        value={tipoPlantilla}
                        onValueChange={(value) => form.setValue('tipoPlantilla', value as RecordatorioFormValues['tipoPlantilla'])}
                    >
                        <SelectTrigger>
                            <SelectValue placeholder="Selecciona una recurrencia" />
                        </SelectTrigger>
                        <SelectContent className="z-[100]">
                            <SelectItem value="unico">Una sola vez</SelectItem>
                            <SelectItem value="diario">Diariamente</SelectItem>
                            <SelectItem value="semanal">Semanalmente</SelectItem>
                            <SelectItem value="mensual-absoluto">Mensual (día fijo)</SelectItem>
                            <SelectItem value="mensual-relativo">Mensual (día relativo)</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {tipoPlantilla === 'semanal' && (
                    <div className="space-y-2 p-4 border rounded-md">
                        <Label>Repetir los días</Label>
                        <div className="flex flex-wrap gap-4">
                            {diasSemana.map(({ id, label }) => (
                                <div key={id} className="flex items-center space-x-2">
                                    <Checkbox
                                        id={`dia-${id}`}
                                        checked={watch('dias').includes(id)}
                                        onCheckedChange={(checked) => {
                                            const currentDias = watch('dias');
                                            const newDias = checked ? [...currentDias, id] : currentDias.filter((d) => d !== id);
                                            form.setValue('dias', newDias);
                                        }}
                                    />
                                    <Label htmlFor={`dia-${id}`}>{label}</Label>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {tipoPlantilla === 'mensual-absoluto' && (
                    <div className="space-y-2 p-4 border rounded-md">
                        <Label htmlFor="diaMes">Día del mes</Label>
                        <Input id="diaMes" type="number" min="1" max="31" {...register('diaMes', { valueAsNumber: true })} />
                        {errors.diaMes && <p className="text-sm text-red-500">{errors.diaMes.message}</p>}
                    </div>
                )}

                {tipoPlantilla === 'mensual-relativo' && (
                    <div className="grid grid-cols-2 gap-4 p-4 border rounded-md">
                        <div className="space-y-2">
                            <Label>Ordinal</Label>
                            <Select value={String(watch('ordinal'))} onValueChange={(value) => form.setValue('ordinal', Number(value) as Ordinal)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent className="z-[100]">
                                    {ordinales.map(({ id, label }) => <SelectItem key={id} value={String(id)}>{label}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Día de la semana</Label>
                            <Select value={watch('diaSemana')} onValueChange={(value) => form.setValue('diaSemana', value as DiaSemana)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent className="z-[100]">
                                    {diasSemana.map(({ id, label }) => <SelectItem key={id} value={id}>{label}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                )}
            </div>

            {/* Contenedor de acciones que permanecerá fijo en la parte inferior */}
            <div className="flex justify-end space-x-4 pt-4 mt-auto">
                <Button type="button" variant="ghost" onClick={onCancel}>Cancelar</Button>
                <Button type="submit" disabled={form.formState.isSubmitting}>
                    {form.formState.isSubmitting ? 'Guardando...' : (recordatorioInicial ? 'Actualizar Recordatorio' : 'Crear Recordatorio')}
                </Button>
            </div>
        </form>
    );
}
