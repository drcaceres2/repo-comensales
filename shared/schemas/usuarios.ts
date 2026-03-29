import { z } from 'zod';
import { SlugIdSchema, OptionalSlugIdSchema, 
    CadenaOpcionalLimitada, 
    TelefonoOpcionalSchema, TimestampSchema, 
    AuthIdSchema} from './common';
import { FechaIsoOpcionalSchema, HoraIsoSchema, SemanaIsoSchema } from './fechas';
import { AsistenteSchema, AsistentePermisosDetalleSchema } from './usuariosAsistentes';
import { SemanarioUsuarioSchema } from './elecciones/domain.schema';
import { verificarCoherenciaRoles } from '../utils/commonUtils';
import { RolUsuario } from '../models/types';


// ============================================
// Esquemas para los nuevos objetos anidados de Usuario
// ============================================

export const ResidenteSchema = z.object({
    dietaId: SlugIdSchema,
    numeroDeRopa: z.string().min(1, "El número de ropa es obligatorio.").max(10),
    habitacion: z.string().min(1, "La habitación es obligatoria.").max(10),
    avisoAdministracion: z.enum(['convivente', 'no_comunicado', 'comunicado']),
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

export const UsuarioBaseObject = z.object({
    // Info interna (Controlada por el servidor)
    id: AuthIdSchema,
    timestampCreacion: TimestampSchema,
    timestampActualizacion: TimestampSchema,
    timestampUltimoIngreso: TimestampSchema.nullable().optional(),

    // Info de estado y configuración
    residenciaId: SlugIdSchema.nullable().optional(),
    roles: z.array(z.enum(['master', 'admin', 'director', 'residente', 'invitado', 'asistente', 'contador']))
            .min(1, "Debe seleccionar al menos un rol."),
    email: z.string().email("El formato del email no es válido."),
    tieneAutenticacion: z.boolean(),
    estaActivo: z.boolean(),
    centroCostoPorDefectoId: SlugIdSchema.nullable().optional(),
    notificacionPreferencias: NotificacionPreferenciasSchema.nullable().optional(),

    // Info personal
    nombre: z.string().min(2, "El nombre debe tener al menos 2 caracteres.").max(100),
    apellido: z.string().min(2, "El apellido debe tener al menos 2 caracteres.").max(255),
    nombreCorto: z.string().min(2, "El nombre corto debe tener al menos 2 caracteres.").max(15),
    identificacion: CadenaOpcionalLimitada().optional(),
    referidoPorNombre: z.string().optional(),
    referidoFecha: z.string().optional(),
    telefonoMovil: TelefonoOpcionalSchema.optional(),
    fechaDeNacimiento: FechaIsoOpcionalSchema.nullable().optional(),
    fotoPerfil: z.string().url().nullable().optional(),
    universidad: CadenaOpcionalLimitada(2, 150).optional(),
    carrera: CadenaOpcionalLimitada(2, 50).optional(),

    // Info funcional
    grupoContableId: OptionalSlugIdSchema,
    grupoRestrictivoId: OptionalSlugIdSchema,
    gruposAnaliticosIds: z.array(OptionalSlugIdSchema)
        .max(20, "Límite de seguridad para evitar arrays masivos en el documento")
        .default([]),
    puedeTraerInvitados: z.enum(['no', 'requiere_autorizacion', 'si']).nullable(),
    camposPersonalizados: z.record(z.string()).optional(),
    semanarios: z.record(SemanaIsoSchema, SemanarioUsuarioSchema),

    // Propiedades anidadas por rol
    asistente: AsistenteSchema.optional(),
    residente: ResidenteSchema.optional(),
});

// ============================================
// Refinamiento base de roles
// ============================================

export const userRoleRefinement = (data: { roles?: RolUsuario[], residente?: any, asistente?: any }, ctx: z.RefinementCtx) => {
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

    const { sonCoherentes, error } = verificarCoherenciaRoles(data.roles);
    if (error) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: error,
            path: ['roles'],
        });
    }
    if (!sonCoherentes) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Configuración de roles inválida. Contacta al administrador.",
            path: ['roles'],
        });
    }
};

// ============================================
// Esquema Base para Usuario (lectura)
// ============================================


export const UsuarioSchema = UsuarioBaseObject
    .strict()
    .superRefine(userRoleRefinement);

// ============================================
// Esquemas para CREATE
// ============================================

const CreateUsuarioObject = UsuarioBaseObject
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
        grupoContableId: z.string().default(''),
        grupoRestrictivoId: z.string().default(''),
        gruposAnaliticosIds: z.array(z.string()).default([]),
        puedeTraerInvitados: z.enum(['no', 'requiere_autorizacion', 'si']).nullable().default('no'),
        semanarios: z.record(SemanaIsoSchema, SemanarioUsuarioSchema).nullable().default({}),
    });
export const createUsuarioSchema = CreateUsuarioObject
    .strict()
    .superRefine(userRoleRefinement);

// ============================================
// Esquemas para UPDATE
// ============================================

// Prácticamente todo es opcional en una actualización
const UpdateUsuarioObject = UsuarioBaseObject
    .omit({
        id: true,
        timestampCreacion: true,
        timestampActualizacion: true,
        timestampUltimoIngreso: true,
    })
    .partial();

export const UpdateUsuarioSchema = UpdateUsuarioObject
    .strict()
    .superRefine(userRoleRefinement);

// ============================================
// Esquemas para formularios del cliente
// ============================================

export const clientCreateUserFormSchema = CreateUsuarioObject
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

export const clientUpdateUserFormSchema = UpdateUsuarioSchema;

// ============================================
// Esquemas compartidos para módulo Mi Perfil
// ============================================

const MiPerfilReadDTOBaseObject = UsuarioBaseObject.pick({
    nombre: true,
    apellido: true,
    nombreCorto: true,
    identificacion: true,
    referidoPorNombre: true,
    referidoFecha: true,
    telefonoMovil: true,
    fechaDeNacimiento: true,
    fotoPerfil: true,
    universidad: true,
    carrera: true,
    camposPersonalizados: true,
    timestampActualizacion: true,
});

export const MiPerfilReadDTOSchema = MiPerfilReadDTOBaseObject
    .extend({
        fechaDeNacimiento: z.string().optional(),
        timestampActualizacion: z.string().datetime(),
        logistica: z.object({
            habitacion: z.string(),
            numeroDeRopa: z.string(),
            dieta: z.object({
                nombre: z.string(),
                descripcion: z.string().optional(),
            }).strict(),
        }).strict(),
        camposPersonalizados: z.record(z.string()),
    })
    .strict();
const UpdateMiPerfilPayloadBaseObject = UsuarioBaseObject.pick({
    nombre: true,
    apellido: true,
    nombreCorto: true,
    identificacion: true,
    referidoPorNombre: true,
    referidoFecha: true,
    telefonoMovil: true,
    fechaDeNacimiento: true,
    universidad: true,
    carrera: true,
    fotoPerfil: true,
    camposPersonalizados: true,
}).partial();

export const UpdateMiPerfilPayloadSchema = UpdateMiPerfilPayloadBaseObject
    .extend({
        lastUpdatedAt: z.string().datetime(),
    })
    .strict();

// ============================================
// Type Exports
// ============================================

export type Usuario = z.infer<typeof UsuarioSchema>;
export type CreateUsuario = z.infer<typeof createUsuarioSchema>;
export type UpdateUsuario = z.infer<typeof UpdateUsuarioSchema>;

export type AsistentePermisos = z.infer<typeof AsistenteSchema>;
export type AsistentePermisosDetalle = z.infer<typeof AsistentePermisosDetalleSchema>;
export type ResidenteData = z.infer<typeof ResidenteSchema>;
export type NotificacionPreferencias = z.infer<typeof NotificacionPreferenciasSchema>;

export type ClientCreateUserForm = z.infer<typeof clientCreateUserFormSchema>;
export type ClientUpdateUserForm = z.infer<typeof clientUpdateUserFormSchema>;

export type MiPerfilReadDTO = z.infer<typeof MiPerfilReadDTOSchema>;
export type UpdateMiPerfilPayload = z.infer<typeof UpdateMiPerfilPayloadSchema>;
