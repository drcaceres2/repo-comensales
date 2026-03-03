/**
 * @file rrule-translator.ts
 * @description Proporciona una capa de traducción entre un estado de UI para recordatorios recurrentes y el formato de string RRULE (RFC 5545).
 * Este módulo maneja 5 plantillas de recurrencia estrictas y no depende de ninguna librería externa de parsing de RRULE.
 */

export const FECHA_FIN_CENTINELA = '2099-12-31T23:59:59Z';

// Tipos auxiliares para la construcción de las reglas.
export type DiaSemana = 'SU' | 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA';
export type Ordinal = 1 | 2 | 3 | 4 | -1; // Representa Primera, Segunda, Tercera, Cuarta y Última.

// --- Definición del Estado Visual (Discriminator Pattern) ---

interface EstadoBase {
    // El intervalo de repetición. Ej: cada 2 días, cada 3 semanas.
    intervalo: number;
}

export interface EstadoUnico {
    tipoPlantilla: 'unico';
}

export interface EstadoDiario extends EstadoBase {
    tipoPlantilla: 'diario';
}

export interface EstadoSemanal extends EstadoBase {
    tipoPlantilla: 'semanal';
    // Un arreglo de los días de la semana seleccionados. Ej: ['MO', 'WE', 'FR']
    dias: DiaSemana[];
}

export interface EstadoMensualAbsoluto extends EstadoBase {
    tipoPlantilla: 'mensual-absoluto';
    // El día del mes. Ej: 15
    diaMes: number;
}

export interface EstadoMensualRelativo extends EstadoBase {
    tipoPlantilla: 'mensual-relativo';
    // El ordinal del día en el mes. Ej: el "tercer" (3) miércoles.
    ordinal: Ordinal;
    // El día de la semana. Ej: "miércoles" (WE).
    diaSemana: DiaSemana;
}

/**
 * Representa el estado de la configuración de recurrencia.
 */
type EstadoRecurrencia =
    | EstadoUnico
    | EstadoDiario
    | EstadoSemanal
    | EstadoMensualAbsoluto
    | EstadoMensualRelativo;

/**
 * Representa el estado completo del formulario de UI para un recordatorio.
 * Es una unión discriminada por `tipoPlantilla` para manejar los diferentes tipos de recurrencia.
 * Incluye el estado de la fecha de fin.
 */
export type EstadoVisualRecordatorio = EstadoRecurrencia & {
    esIndefinido: boolean;
    /** La fecha de fin de la recurrencia, solo relevante si `esIndefinido` es false. */
    fechaFin: Date;
};

// --- Tipos de Backend ---

/**
 * Representa la estructura de un recordatorio como se guarda en Firestore.
 */
interface RecordatorioFirestore {
    rrule?: string;
    fechaFinValidez: string;
}

// --- Traductores ---

/**
 * Traduce un objeto de estado de la UI a un objeto compatible con Firestore.
 *
 * @param estado El objeto que representa el estado del formulario de UI.
 * @returns Un objeto con `rrule` y `fechaFinValidez`.
 */
export function traducirUIARRule(estado: EstadoVisualRecordatorio): {
    rrule: string | undefined;
    fechaFinValidez: string;
} {
    let rrule: string | undefined;
    const fechaFinValidez = estado.esIndefinido
        ? FECHA_FIN_CENTINELA
        : estado.fechaFin.toISOString();

    if (estado.tipoPlantilla === 'unico') {
        rrule = undefined;
    } else {
        const parts: string[] = [];
        let freq: string;

        switch (estado.tipoPlantilla) {
            case 'diario':
                freq = 'DAILY';
                break;
            case 'semanal':
                freq = 'WEEKLY';
                if (estado.dias.length > 0) {
                    parts.push(`BYDAY=${estado.dias.join(',')}`);
                }
                break;
            case 'mensual-absoluto':
                freq = 'MONTHLY';
                parts.push(`BYMONTHDAY=${estado.diaMes}`);
                break;
            case 'mensual-relativo':
                freq = 'MONTHLY';
                parts.push(`BYDAY=${estado.ordinal}${estado.diaSemana}`);
                break;
            default:
                // Esto asegura que todos los casos del tipo están cubiertos.
                const exhaustiveCheck: never = estado;
                throw new Error(`Tipo de plantilla no manejado: ${exhaustiveCheck}`);
        }

        const baseRule = `FREQ=${freq}`;
        if ('intervalo' in estado && estado.intervalo > 1) {
            parts.push(`INTERVAL=${estado.intervalo}`);
        }

        rrule = [baseRule, ...parts].join(';');
    }

    return { rrule, fechaFinValidez };
}

/**
 * Traduce un objeto de recordatorio de Firestore a un estado de UI para re-hidratar el formulario.
 *
 * @param recordatorio El objeto de recordatorio de Firestore.
 * @returns Un objeto `EstadoVisualRecordatorio` que representa el estado para la UI.
 */
export function traducirRRuleAUI(recordatorio: RecordatorioFirestore): EstadoVisualRecordatorio {
    const { rrule, fechaFinValidez } = recordatorio;

    const esIndefinido = fechaFinValidez.startsWith('2099');
    let fechaFin: Date;

    if (esIndefinido) {
        // Si es indefinido, ponemos una fecha por defecto para cuando el usuario desmarque la opción.
        fechaFin = new Date();
        fechaFin.setFullYear(fechaFin.getFullYear() + 1);
    } else {
        fechaFin = new Date(fechaFinValidez);
    }

    let estadoRecurrencia: EstadoRecurrencia;

    if (!rrule) {
        estadoRecurrencia = { tipoPlantilla: 'unico' };
    } else {
        const parts = rrule.split(';').reduce((acc, part) => {
            const [key, value] = part.split('=');
            if (key && value) {
                acc[key] = value;
            }
            return acc;
        }, {} as Record<string, string>);

        const freq = parts['FREQ'];
        const interval = parts['INTERVAL'] ? parseInt(parts['INTERVAL'], 10) : 1;

        switch (freq) {
            case 'DAILY':
                estadoRecurrencia = {
                    tipoPlantilla: 'diario',
                    intervalo: interval,
                };
                break;
            case 'WEEKLY':
                estadoRecurrencia = {
                    tipoPlantilla: 'semanal',
                    intervalo: interval,
                    dias: (parts['BYDAY']?.split(',') as DiaSemana[]) || [],
                };
                break;
            case 'MONTHLY':
                if (parts['BYMONTHDAY']) {
                    estadoRecurrencia = {
                        tipoPlantilla: 'mensual-absoluto',
                        intervalo: interval,
                        diaMes: parseInt(parts['BYMONTHDAY'], 10),
                    };
                } else if (parts['BYDAY']) {
                    const byDayMatch = parts['BYDAY'].match(/(-?\d+)?([A-Z]{2})/);
                    if (byDayMatch) {
                        const [, ordinalStr, diaSemana] = byDayMatch;
                        const ordinal = parseInt(ordinalStr, 10) as Ordinal;

                        estadoRecurrencia = {
                            tipoPlantilla: 'mensual-relativo',
                            intervalo: interval,
                            ordinal: ordinal,
                            diaSemana: diaSemana as DiaSemana,
                        };
                    } else {
                        // Fallback si BYDAY no tiene el formato esperado
                        estadoRecurrencia = { tipoPlantilla: 'unico' };
                    }
                } else {
                    // Mensual sin BYDAY o BYMONTHDAY
                    estadoRecurrencia = { tipoPlantilla: 'unico' };
                }
                break;
            default:
                // Fallback para FREQ no soportado (ej. YEARLY)
                estadoRecurrencia = { tipoPlantilla: 'unico' };
                break;
        }
    }

    return {
        ...estadoRecurrencia,
        esIndefinido,
        fechaFin,
    };
}
