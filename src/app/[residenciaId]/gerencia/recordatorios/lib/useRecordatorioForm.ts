'use client';

import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
    CrearRecordatorioPayload,
    Recordatorio,
} from 'shared/schemas/recordatorios';
import {
    EstadoVisualRecordatorio,
    traducirRRuleAUI,
    traducirUIARRule,
    DiaSemana,
    Ordinal,
} from 'shared/utils/rrule-translator';
import { useMemo } from 'react';
import { format, parseISO } from 'date-fns';

// Copiamos el tipo de la Action para que el hook sepa qué esperar
type ActionResponse<T> = {
    success: true;
    data: T;
} | {
    success: false;
    errors: z.ZodError<T>['formErrors'];
    message: string;
};

type EstadoVisualRecordatorioPlano = {
    tipoPlantilla: 'unico' | 'diario' | 'semanal' | 'mensual-absoluto' | 'mensual-relativo';
    intervalo: number;
    dias: DiaSemana[];
    diaMes: number;
    ordinal: Ordinal;
    diaSemana: DiaSemana;
};

export type RecordatorioFormValues = Omit<
    CrearRecordatorioPayload,
    | 'reglaRecurrencia'
    | 'duracionDias'
    | 'residenciaId'
    | 'usuarioIniciadorId'
    | 'exclusiones'
> &
    EstadoVisualRecordatorioPlano & {
    esIndefinido: boolean;
};

interface UseRecordatorioFormParams {
    recordatorioInicial?: Recordatorio;
    onFormSubmit: (
        payload: CrearRecordatorioPayload | Recordatorio,
    ) => Promise<ActionResponse<Recordatorio> | void>; // Modificado para aceptar la respuesta con errores
    residenciaId: string;
    usuarioIniciadorId: string;
}

export function useRecordatorioForm({
    recordatorioInicial,
    onFormSubmit,
    residenciaId,
    usuarioIniciadorId,
}: UseRecordatorioFormParams) {
    const defaultValues = useMemo((): RecordatorioFormValues => {
        const fechaFinPorDefecto = new Date();
        fechaFinPorDefecto.setFullYear(fechaFinPorDefecto.getFullYear() + 1);

        const baseState: RecordatorioFormValues = {
            titulo: '',
            descripcion: '',
            color: '#86EFAC',
            fechaInicioValidez: format(new Date(), 'yyyy-MM-dd'),
            fechaFinValidez: format(fechaFinPorDefecto, 'yyyy-MM-dd'),
            estaActivo: true,
            tipoPlantilla: 'unico',
            intervalo: 1,
            dias: [],
            diaMes: 1,
            ordinal: 1,
            diaSemana: 'MO',
            esIndefinido: false,
        };

        if (!recordatorioInicial) return baseState;

        const { esIndefinido, fechaFin, ...recurrenceState } = traducirRRuleAUI({
            rrule: recordatorioInicial.reglaRecurrencia,
            fechaFinValidez: recordatorioInicial.fechaFinValidez,
        });

        return {
            ...baseState,
            ...recordatorioInicial,
            descripcion: recordatorioInicial.descripcion || '',
            fechaInicioValidez: format(parseISO(recordatorioInicial.fechaInicioValidez), 'yyyy-MM-dd'),
            fechaFinValidez: format(fechaFin, 'yyyy-MM-dd'),
            esIndefinido,
            ...recurrenceState,
        };
    }, [recordatorioInicial]);

    const form = useForm<RecordatorioFormValues>({ defaultValues });

    const handleFormSubmit = form.handleSubmit(async (formData) => {
        const { rrule, fechaFinValidez } = traducirUIARRule({
            ...formData,
            fechaFin: new Date(formData.fechaFinValidez || '1970-01-01'),
        } as unknown as EstadoVisualRecordatorio);

        const basePayload = {
            residenciaId,
            usuarioIniciadorId,
            titulo: formData.titulo,
            descripcion: formData.descripcion,
            color: formData.color,
            // Enviamos fechas en formato YYYY-MM-DD (sin hora) para cumplir con FechaIsoSchema
            fechaInicioValidez: formData.fechaInicioValidez,
            fechaFinValidez: format(parseISO(fechaFinValidez), 'yyyy-MM-dd'),
            estaActivo: formData.estaActivo,
            reglaRecurrencia: rrule,
            duracionDias: 1,
            exclusiones: recordatorioInicial?.exclusiones || [],
        };

        const payload = recordatorioInicial
            ? { ...basePayload, id: recordatorioInicial.id, timestampCreacion: recordatorioInicial.timestampCreacion, tipo: recordatorioInicial.tipo }
            : basePayload;

        const result = await onFormSubmit(payload);

        if (result && !result.success) {
            const fieldErrors = result.errors.fieldErrors;
            for (const fieldName in fieldErrors) {
                const message = fieldErrors[fieldName as keyof typeof fieldErrors]?.[0];
                if (message) {
                    form.setError(fieldName as keyof RecordatorioFormValues, {
                        type: 'server',
                        message,
                    });
                }
            }
        }
    });

    return {
        form,
        handleFormSubmit,
    };
}
