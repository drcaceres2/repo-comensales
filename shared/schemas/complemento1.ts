import { z } from 'zod';
import { FirestoreIdSchema, CadenaOpcionalLimitada, OptionalSlugIdSchema, slugIdSchema } from './common';
import { HoraIsoSchema } from './fechas';

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
    creadoPor: FirestoreIdSchema,
    centroCostoId: OptionalSlugIdSchema,
}).strict();

export const comedorDataSelectorSchema = ComedorDataSchema.pick({
    nombre: true
}).extend({
    id: slugIdSchema
});

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
        slugIdSchema,
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
    centroCostoId: slugIdSchema.optional(),
    gestionComida: GestionComidaSchema.optional(),
}).strict();

// ============================================
// DietaData (Embebido en ConfiguracionResidencia)
// ============================================

const DescripcionSimple = z.object({
  tipo: z.literal('texto_corto'),
  descripcion: z.string().max(200),
});

const DescripcionDetallada = z.object({
  tipo: z.literal('texto_enriquecido'),
  titulo: z.string().max(200),
  contenidoMarkdown: z.string().min(100).max(15000, "El documento es demasiado largo para el sistema.")
});

const DescripcionPorEnlace = z.object({
  tipo: z.literal('enlace_externo'),
  urlDocumento: z.string().url(),
  notas: z.string().optional(),
});

/**
 * DietaData: Datos de una dieta.
 * Embebido como Record<DietaId, DietaData>.
 */
export const DietaDataSchema = z.object({
    nombre: z.string().min(1).max(255),
    identificadorAdministracion: z.string().min(1).max(100),
    descripcion: z.discriminatedUnion('tipo', [
        DescripcionSimple,
        DescripcionDetallada,
        DescripcionPorEnlace
    ]),
    esPredeterminada: z.boolean(),
    estado: z.enum([
        'solicitada_por_residente', 'no_aprobada_director',
        'aprobada_director', 'cancelada',
    ]),
    avisoAdministracion: z.enum([
        'no_comunicado', 'comunicacion_preliminar',
        'comunicacion_final', 'dieta_cancelada',
    ]),
    creadoPor: FirestoreIdSchema,
    estaActiva: z.boolean(),
}).strict();

// Type exports
export type ComedorData = z.infer<typeof ComedorDataSchema>;
export type ComedorDataSelector = z.infer<typeof comedorDataSelectorSchema>;

export type GrupoUsuariosData = z.infer<typeof GrupoUsuariosDataSchema>;
export type DietaData = z.infer<typeof DietaDataSchema>;
