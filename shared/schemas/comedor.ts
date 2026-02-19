import { z } from 'zod';
import { FirebaseIdSchema, CadenaOpcionalLimitada } from './common';
import { HoraIsoSchema, DiaDeLaSemanaSchema } from './fechas';

// ============================================
// ComedorData (Embebido en ConfiguracionResidencia)
// ============================================

/**
 * ComedorData: Datos de un comedor embebidos en ConfiguracionResidencia.
 * En la nueva arquitectura, los comedores viven como un Record<ComedorId, ComedorData>
 * dentro del singleton de configuración (Embed Pattern).
 */
export const ComedorDataSchema = z.object({
    nombre: z.string().min(1, "El nombre es obligatorio").max(50),
    descripcion: CadenaOpcionalLimitada(1, 255).optional(),
    aforoMaximo: z.number().int().positive("El aforo debe ser positivo").optional(),
    centroCostoId: FirebaseIdSchema.optional(),
}).strict();

// ============================================
// HorarioSolicitudData (Embebido en ConfiguracionResidencia)
// ============================================

/**
 * HorarioSolicitudData: Datos de un horario de solicitud de comida.
 * Embebido como Record<HorarioSolicitudComidaId, HorarioSolicitudData>.
 */
export const HorarioSolicitudDataSchema = z.object({
    nombre: z.string().min(1).max(50),
    dia: DiaDeLaSemanaSchema,
    horaSolicitud: HoraIsoSchema,
    esPrimario: z.boolean(),
    estaActivo: z.boolean(),
}).strict();

// ============================================
// GrupoUsuariosData (Embebido en ConfiguracionResidencia)
// ============================================

const GestionComidaSchema = z.object({
    usoSemanario: z.boolean(),
    usoExcepciones: z.boolean(),
    confirmacionAsistencia: z.boolean(),
    confirmacionDiariaElecciones: z.boolean(),
    horarioConfirmacionDiaria: HoraIsoSchema.optional(),
    restriccionAlternativas: z.boolean(),
    alternativasRestringidas: z.record(
        FirebaseIdSchema,
        z.enum(['no_permitida', 'requiere_aprobacion'])
    ),
    localizacionObligatoria: z.boolean(),
}).strict();

/**
 * GrupoUsuariosData: Configuración de un grupo de usuarios.
 * Embebido como Record<GrupoUsuariosId, GrupoUsuariosData>.
 */
export const GrupoUsuariosDataSchema = z.object({
    nombre: z.string().min(1).max(100),
    etiqueta: z.string().min(1).max(50),
    tipoGrupo: z.enum(['gestion-comidas', 'centro-de-costo', 'presentacion-reportes']),
    descripcion: CadenaOpcionalLimitada(1, 255).optional(),
    centroCostoId: FirebaseIdSchema.optional(),
    gestionComida: GestionComidaSchema.optional(),
}).strict();

// ============================================
// DietaData (Embebido en ConfiguracionResidencia)
// ============================================

/**
 * DietaData: Datos de una dieta.
 * Embebido como Record<DietaId, DietaData>.
 */
export const DietaDataSchema = z.object({
    nombre: z.string().min(1).max(255),
    identificadorAdministracion: z.string().min(1).max(100),
    descripcion: CadenaOpcionalLimitada(1, 255).optional(),
    esPredeterminada: z.boolean(),
    estado: z.enum([
        'solicitada_por_residente', 'no_aprobada_director',
        'aprobada_director', 'cancelada',
    ]),
    avisoAdministracion: z.enum([
        'no_comunicado', 'comunicacion_preliminar',
        'comunicacion_final', 'dieta_cancelada',
    ]),
    estaActiva: z.boolean(),
}).strict();

// Type exports
export type ComedorData = z.infer<typeof ComedorDataSchema>;
export type HorarioSolicitudData = z.infer<typeof HorarioSolicitudDataSchema>;
export type GrupoUsuariosData = z.infer<typeof GrupoUsuariosDataSchema>;
export type DietaData = z.infer<typeof DietaDataSchema>;
