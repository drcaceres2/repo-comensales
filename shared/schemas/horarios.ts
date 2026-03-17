import { z } from 'zod';
import { CadenaOpcionalLimitada, SlugIdSchema } from './common';
import { HoraIsoSchema, DiaDeLaSemanaSchema } from './fechas';
import {ComedorDataSchema, ComedorDataSelector} from "./complemento1";
import { convertirHoraAMinutos } from '../utils/commonUtils';

/**
 * HorarioSolicitudData: Datos de un horario de solicitud de comida.
 * Embebido como Record<HorarioSolicitudComidaId, HorarioSolicitudData>.
 */
export const HorarioSolicitudDataSchema = z.object({
    nombre: z.string().min(1).max(50),  // Este nombre se usa para construir el slug que sirve de ID semántico en singleton que contiene estos objetos embebidos. Es inmutable, si cambia el nombre, el ID permanece
    dia: DiaDeLaSemanaSchema,
    horaSolicitud: HoraIsoSchema,
    esPrimario: z.boolean().default(false),
    estaActivo: z.boolean().default(true),
}).strict();

/**
 * GrupoComida: Abstracción de "desayuno", "almuerzo", "merienda", etc.
 * Embebido como Record<GrupoComidaId, GrupoComida>
 */
export const GrupoComidaSchema = z.object({
    nombre: z.string().min(1).max(20), // Este nombre se usa para construir el slug que sirve de ID semántico en singleton que contiene estos objetos embebidos. Es inmutable, si cambia el nombre, el ID permanece
    orden: z.number().int().nonnegative(),
    estaActivo: z.boolean().default(true),
});

/**
 * TiempoComida: Categoría operativa que representa la intersección 
 * entre un día de la semana y una comida (ej. "desayuno lunes").
 * Embebido como Record<TiempoComidaId, TiempoComida> en ConfiguracionResidencia.esquemaSemanal.
 */
export const TiempoComidaSchema = z.object({
    nombre: z.string().min(1).max(100), // Este nombre se usa para construir el slug que sirve de ID semántico en singleton que contiene estos objetos embebidos. Es inmutable, si cambia el nombre, el ID permanece

    grupoComida: SlugIdSchema,
    dia: DiaDeLaSemanaSchema,
    horaReferencia: HoraIsoSchema,

    alternativas: z.object({
        principal: SlugIdSchema, // Apunta a una ConfiguracionAlternativa
        secundarias: z.array(SlugIdSchema).optional(), // Apunta a ConfiguracionesAlternativas
    }).strict(),

    estaActivo: z.boolean().default(true),
}).strict();

export const TiempoComidaCreateSchema = TiempoComidaSchema.omit({
    alternativas: true
})

export const TiempoComidaFormSchema = TiempoComidaSchema.omit({
    estaActivo: true,
    alternativas: true
})

export const TipoAlternativaEnumSchema =
    z.enum(['comedor', 'paraLlevar', 'noComoEnCasa', 'ayuno']);


/**
 * DefinicionAlternativa: Define una alternativa de forma genérica.
 * Embebida como Record<AlternativaId, DefinicionAlternativa> en ConfiguracionResidencia.catalogoAlternativas.
 */
export const DefinicionAlternativaSchema = z.object({
    nombre: z.string().min(1).max(100), // Este nombre se usa para construir el slug que sirve de ID semántico en singleton que contiene estos objetos embebidos. Es inmutable, si cambia el nombre, el ID permanece
    grupoComida: SlugIdSchema,
    descripcion: CadenaOpcionalLimitada(1, 255).optional(),
    tipo: TipoAlternativaEnumSchema,
    estaActiva: z.boolean().default(true),
}).strict();

export const CrearVariosSchema = DefinicionAlternativaSchema.pick({
    tipo: true,
    estaActiva: true,
}).extend({
    texto: z.string().min(1).max(25),
    posicion: z.enum(['antes', 'despues']),
});
export type CrearVariosValues = z.infer<typeof CrearVariosSchema>;


export const TipoVentanaConfigAlternativaSchema =
    z.enum(['normal', 'inicia_dia_anterior', 'termina_dia_siguiente']).default('normal')

const VentanaServicioComidaSchema = z.object({
    horaInicio: HoraIsoSchema,
    horaFin: HoraIsoSchema,
    tipoVentana: TipoVentanaConfigAlternativaSchema
}).strict().superRefine((val, ctx) => {
    // Validate that for 'normal' windows the end is not before start.
    // convertirHoraAMinutos handles inputs like 'T12:00' or '12:00'.
    try {
        const inicioMin = convertirHoraAMinutos(val.horaInicio);
        const finMin = convertirHoraAMinutos(val.horaFin);
        if (inicioMin === null || finMin === null) {
            return; // let HoraIsoSchema handle format errors
        }
        if ((val.tipoVentana ?? 'normal') === 'normal' && finMin < inicioMin) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['horaFin'],
                message: 'La hora fin debe ser mayor o igual que la hora inicio para ventanas normales',
            });
        }
    } catch (e) {
        // ignore and let other validators report
    }
});

/**
 * ConfiguracionAlternativa: Configuración específica de una alternativa para un día concreto.
 * Embebida como Record<ConfigAlternativaId, ConfiguracionAlternativa> en ConfiguracionResidencia.configuracionAlternativas.
 */
export const ConfiguracionAlternativaSchema = z.object({
    nombre: z.string().min(1).max(100),
    tiempoComidaId: SlugIdSchema,
    definicionAlternativaId: SlugIdSchema,
    horarioSolicitudComidaId: SlugIdSchema,
    comedorId: z.preprocess(val => val === "" || val === null ? undefined : val, SlugIdSchema.optional()),
    requiereAprobacion: z.boolean().default(false),
    ventanaServicio: VentanaServicioComidaSchema.optional(),
    estaActivo: z.boolean().default(true)
}).strict();

export const DatosHorariosEnBrutoSchema = z.object({
    horariosSolicitud: z.record(HorarioSolicitudDataSchema),
    gruposComidas: z.record(GrupoComidaSchema),
    esquemaSemanal: z.record(TiempoComidaSchema),
    catalogoAlternativas: z.record(DefinicionAlternativaSchema),
    configuracionesAlternativas: z.record(ConfiguracionAlternativaSchema),
    comedores: z.record(ComedorDataSchema)
}).superRefine((data, ctx) => {
    for (const configId in data.configuracionesAlternativas) {
        const config = data.configuracionesAlternativas[configId];
        const definicion = data.catalogoAlternativas[config.definicionAlternativaId];

        if (definicion) {
            const esTipoAusencia = definicion.tipo === 'noComoEnCasa' || definicion.tipo === 'ayuno';

            if (esTipoAusencia) {
                if (config.comedorId) {
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        path: ['configuracionesAlternativas', configId, 'comedorId'],
                        message: `Una configuración de tipo '${definicion.tipo}' no puede tener un comedor asignado.`,
                    });
                }
                if (config.ventanaServicio) {
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        path: ['configuracionesAlternativas', configId, 'ventanaServicio'],
                        message: `Una configuración de tipo '${definicion.tipo}' no puede tener una ventana de servicio.`,
                    });
                }
            }
        }
    }
});

export const MultipleConfigSchema = ConfiguracionAlternativaSchema.pick({
    definicionAlternativaId: true,
    comedorId: true,
    requiereAprobacion: true,
    estaActivo: true,
    ventanaServicio: true,
}).extend({
    dias: z.array(DiaDeLaSemanaSchema).nonempty("Debes seleccionar al menos un día"),
    antelacion: z.preprocess(val => Number(val), z.number().int().min(0)),
});

export type MultipleConfigFormData = z.infer<typeof MultipleConfigSchema>;


// Type exports

export type HorarioSolicitudData = z.infer<typeof HorarioSolicitudDataSchema>;

/**
 * TiemposComida
 * Los tiempos de comida son como "desayuno lunes, almuerzo lunes,
 * cena lunes, desayuno martes, almuerzo martes, etc."
 * (Combinación de día de la semana con "desayuno", "almuerzo", "cena", etc.)
 */
export type TiempoComida = z.infer<typeof TiempoComidaSchema>;
export type GrupoComida = z.infer<typeof GrupoComidaSchema>;

/**
 * Alternativa
 * Distintas opciones de horario que el usuario escoge para cada tiempo de comida.
 * 
 * Dos interfaces la conforman: DefinicionAlternativa y ConfiguracionAlternativa.
 */
export type DefinicionAlternativa = z.infer<typeof DefinicionAlternativaSchema>;
export type TipoAlternativaEnum = z.infer<typeof TipoAlternativaEnumSchema>;
export type ConfiguracionAlternativa = z.infer<typeof ConfiguracionAlternativaSchema>;
export type TipoVentanaConfigAlternativa = z.infer<typeof TipoVentanaConfigAlternativaSchema>;

export type DatosHorariosEnBruto = z.infer<typeof DatosHorariosEnBrutoSchema>;