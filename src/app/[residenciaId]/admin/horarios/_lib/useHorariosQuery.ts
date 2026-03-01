"use client";

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useToast } from '@/hooks/useToast';

import { db, functions } from '@/lib/firebase';
import { ConfiguracionResidencia, CONFIG_RESIDENCIA_ID } from 'shared/schemas/residencia';
import { HORARIOS_QUERY_KEY } from 'shared/models/types';
import { DatosHorariosEnBruto } from 'shared/schemas/horarios';
import { useHorariosAlmacen } from './useHorariosAlmacen';


// ============================================
// Hook de Lectura (useObtenerHorarios)
// ============================================

const fetchHorarios = async (residenciaId: string): Promise<{ datos: DatosHorariosEnBruto, version: number }> => {
    const docRef = doc(db, `residencias/${residenciaId}/configuracion/${CONFIG_RESIDENCIA_ID}`);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
        const data = docSnap.data() as ConfiguracionResidencia;
        return {
            datos: {
                horariosSolicitud: data.horariosSolicitud || {},
                gruposComidas: data.gruposComidas || {},
                esquemaSemanal: data.esquemaSemanal || {},
                catalogoAlternativas: data.catalogoAlternativas || {},
                configuracionesAlternativas: data.configuracionAlternativas || {},
                comedores: data.comedores || {},
            },
            version: data.version || 0,
        };
    }

    // Devuelve un objeto vacío por defecto si el documento no existe
    return {
        datos: {
            horariosSolicitud: {},
            gruposComidas: {},
            esquemaSemanal: {},
            catalogoAlternativas: {},
            configuracionesAlternativas: {},
            comedores: {}
        },
        version: 0,
    };
};

export const useObtenerHorarios = (residenciaId: string) => {

    return useQuery({
        queryKey: [HORARIOS_QUERY_KEY, residenciaId],
        queryFn: () => fetchHorarios(residenciaId),
    });
};

// ============================================
// Hook de Escritura (useGuardarHorarios)
// ============================================

const guardarHorariosFn = httpsCallable(functions, 'guardarHorariosResidencia');

interface GuardarHorariosPayload {
    residenciaId: string;
    expectedVersion: number;
    datos: DatosHorariosEnBruto;
}

export const useGuardarHorarios = () => {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const setErrorDeGuardado = useHorariosAlmacen(s => s.setErrorDeGuardado);

    return useMutation({
        mutationFn: async (payload: GuardarHorariosPayload) => {
            setErrorDeGuardado(null); // Limpiar errores previos
            return await guardarHorariosFn(payload);
        },
        onSuccess: (result, variables) => {
            toast({ title: "Transacción completada", description: "Horarios guardados con éxito.", variant: "default" });
            queryClient.invalidateQueries({ queryKey: [HORARIOS_QUERY_KEY, variables.residenciaId] });
        },
        onError: (error: any) => {
            const details = error.details;
            if (details && details.validationError) {
                setErrorDeGuardado(details.message);
            } else if (error.message.includes('failed-precondition')) {
                setErrorDeGuardado("Error de concurrencia: Otro usuario ha modificado los datos. Por favor, refresca la página.");
            } else {
                setErrorDeGuardado(`Error inesperado: ${error.message}`);
            }
        },
    });
};
