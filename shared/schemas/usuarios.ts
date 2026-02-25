import { z } from 'zod';
import { FirestoreIdSchema, slugIdSchema, CadenaOpcionalLimitada, TelefonoOpcionalSchema, TimestampSchema} from './common';
import { FechaIsoSchema, FechaIsoOpcionalSchema, HoraIsoSchema } from './fechas';

// ============================================
// Esquemas para los nuevos objetos anidados de Usuario
// ============================================

export const AsistentePermisosDetalleSchema = z.object({
    nivelAcceso: z.enum(['Todas', 'Propias', 'Ninguna']),
    restriccionTiempo: z.boolean(),
    fechaInicio: FechaIsoSchema.nullable().optional(),
    fechaFin: FechaIsoSchema.nullable().optional(),
}).strict();

export const ResidenteSchema = z.object({
    dietaId: slugIdSchema,
    numeroDeRopa: z.string().min(1, "El número de ropa es obligatorio.").max(10),
    habitacion: z.string().min(1, "La habitación es obligatoria.").max(10),
    avisoAdministracion: z.enum(['convivente', 'no_comunicado', 'comunicado']),
}).strict();

export const AsistenteSchema = z.object({
    usuariosAsistidos: z.record(FirestoreIdSchema, AsistentePermisosDetalleSchema),
    gestionActividades: AsistentePermisosDetalleSchema,
    gestionInvitados: AsistentePermisosDetalleSchema,
    gestionRecordatorios: AsistentePermisosDetalleSchema,
    gestionDietas: AsistentePermisosDetalleSchema,
    gestionAtenciones: AsistentePermisosDetalleSchema,
    gestionAsistentes: AsistentePermisosDetalleSchema,
    gestionGrupos: AsistentePermisosDetalleSchema,
    solicitarComensales: AsistentePermisosDetalleSchema,
}).strict();


export const NotificacionPreferenciasSchema = z.object({
    canalEmail: z.boolean(),
    canalWhatsApp: z.boolean(),
    canalSMS: z.boolean().optional(),
    tiposPermitidos: z.array(z.enum(['info', 'accion_requerida', 'recordatorio', 'alerta'])),
    notificacionesSilenciadas: z.boolean().optional(),
    horaMaxima: HoraIsoSchema.optional(),
    horaMinima: HoraIsoSchema.optional(),
}).strict();

// ============================================
// Esquemas Base para Usuario
// ============================================

const usuarioBaseObject = z.object({
    // Info interna (Controlada por el servidor)
    id: FirestoreIdSchema,
    timestampCreacion: TimestampSchema,
    timestampActualizacion: TimestampSchema,
    timestampUltimoIngreso: TimestampSchema.nullable().optional(),
    
    // Info de estado y configuración
    residenciaId: slugIdSchema.nullable().optional(),
    roles: z.array(z.enum(['master', 'admin', 'director', 'residente', 'invitado', 'asistente', 'contador']))
            .min(1, "Debe seleccionar al menos un rol."),
    email: z.string().email("El formato del email no es válido."),
    tieneAutenticacion: z.boolean(),
    estaActivo: z.boolean(),
    centroCostoPorDefectoId: slugIdSchema.nullable().optional(),
    notificacionPreferencias: NotificacionPreferenciasSchema.nullable().optional(),

    // Info personal
    nombre: z.string().min(2, "El nombre debe tener al menos 2 caracteres.").max(100),
    apellido: z.string().min(2, "El apellido debe tener al menos 2 caracteres.").max(255),
    nombreCorto: z.string().min(2, "El nombre corto debe tener al menos 2 caracteres.").max(15),
    identificacion: CadenaOpcionalLimitada().optional(),
    telefonoMovil: TelefonoOpcionalSchema.optional(),
    fechaDeNacimiento: FechaIsoOpcionalSchema.nullable().optional(),
    fotoPerfil: z.string().url().nullable().optional(),
    universidad: CadenaOpcionalLimitada(2, 150).optional(),
    carrera: CadenaOpcionalLimitada(2, 50).optional(),

    // Info funcional
    grupos: z.array(slugIdSchema),
    puedeTraerInvitados: z.enum(['no', 'requiere_autorizacion', 'si']).nullable(),
    camposPersonalizados: z.record(z.string()).optional(),

    // Propiedades anidadas por rol
    asistente: AsistenteSchema.optional(),
    residente: ResidenteSchema.optional(),
});

// ============================================
// Refinamiento base de roles
// ============================================


const userRoleRefinement = (data: { roles?: string[], residente?: any, asistente?: any }, ctx: z.RefinementCtx) => {
    if (!data.roles) return;
    // Regla para rol 'residente'
    if (data.roles.includes('residente')) {
        if (!data.residente) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "La información de residente (dieta, ropa, habitación) es obligatoria para este rol.",
                path: ['residente'],
            });
        }
    } else {
        if (data.residente) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "La información de residente solo es aplicable a usuarios con el rol 'residente'.",
                path: ['residente'],
            });
        }
    }

    // Regla para rol 'asistente'
    if (data.roles.includes('asistente')) {
        if (!data.asistente) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Los permisos de asistente son obligatorios para este rol.",
                path: ['asistente'],
            });
        }
    } else {
        if (data.asistente) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Los permisos de asistente solo son aplicables a usuarios con el rol 'asistente'.",
                path: ['asistente'],
            });
        }
    }
};

// ============================================
// Esquema Base para Usuario (lectura)
// ============================================


export const usuarioSchema = usuarioBaseObject
    .strict()
    .superRefine(userRoleRefinement);

// ============================================
// Esquemas para CREATE
// ============================================

const createUsuarioObject = usuarioBaseObject
    .omit({
        id: true,
        timestampCreacion: true,
        timestampActualizacion: true,
        timestampUltimoIngreso: true,
    })
    .extend({
        // Usamos extend para inyectar los .default() específicos de creación
        estaActivo: z.boolean().default(true),
        tieneAutenticacion: z.boolean().default(true),
        grupos: z.array(slugIdSchema).default([]),
        puedeTraerInvitados: z.enum(['no', 'requiere_autorizacion', 'si']).nullable().default('no'),
    });
export const createUsuarioSchema = createUsuarioObject
    .strict()
    .superRefine(userRoleRefinement);

// ============================================
// Esquemas para UPDATE
// ============================================

// Prácticamente todo es opcional en una actualización
const updateUsuarioObject = usuarioBaseObject
    .omit({
        id: true,
        timestampCreacion: true,
        timestampActualizacion: true,
        timestampUltimoIngreso: true,
    })
    .partial();

export const updateUsuarioSchema = updateUsuarioObject
    .strict()
    .superRefine(userRoleRefinement);

// ============================================
// Esquema para selector (dropdown)
// ============================================

export const UserSelectorItemSchema = z.object({
    id: FirestoreIdSchema,
    nombreCorto: z.string().nullable().optional(),
    email: z.string().email(),
    roles: z.array(z.string()),
    residente: z.object({ habitacion: CadenaOpcionalLimitada().optional() }).optional(),
    estaActivo: z.boolean(),
}).strip();

// ============================================
// Esquemas para formularios del cliente
// ============================================

export const clientCreateUserFormSchema = createUsuarioObject
    .extend({
        password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres."),
        confirmPassword: z.string().min(6),
    })
    .strict()
    .superRefine(userRoleRefinement)
    .refine((data) => data.password === data.confirmPassword, {
        message: "Las contraseñas no coinciden",
        path: ['confirmPassword'],
    });

export const clientUpdateUserFormSchema = updateUsuarioSchema;

// ============================================
// Type Exports
// ============================================

export type Usuario = z.infer<typeof usuarioSchema>;
export type CreateUsuario = z.infer<typeof createUsuarioSchema>;
export type UpdateUsuario = z.infer<typeof updateUsuarioSchema>;

export type AsistentePermisos = z.infer<typeof AsistenteSchema>;
export type AsistentePermisosDetalle = z.infer<typeof AsistentePermisosDetalleSchema>;
export type ResidenteData = z.infer<typeof ResidenteSchema>;
export type NotificacionPreferencias = z.infer<typeof NotificacionPreferenciasSchema>;

export type ClientCreateUserForm = z.infer<typeof clientCreateUserFormSchema>;
export type ClientUpdateUserForm = z.infer<typeof clientUpdateUserFormSchema>;
