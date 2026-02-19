import { z } from 'zod';
import { FirebaseIdSchema, CadenaOpcionalLimitada, TelefonoOpcionalSchema } from './common';
import { IsoDateStringSchema, OptionalIsoDateStringSchema, IsoTimeStringSchema, TimestampStringSchema } from './fechas';

// ============================================
// Esquemas para los nuevos objetos anidados de Usuario
// ============================================

export const AsistentePermisosDetalleSchema = z.object({
    nivelAcceso: z.enum(['Todas', 'Propias', 'Ninguna']),
    restriccionTiempo: z.boolean(),
    fechaInicio: IsoDateStringSchema.nullable().optional(),
    fechaFin: IsoDateStringSchema.nullable().optional(),
}).strict();

export const ResidenteSchema = z.object({
    dietaId: FirebaseIdSchema,
    numeroDeRopa: z.string().min(1, "El número de ropa es obligatorio.").max(10),
    habitacion: z.string().min(1, "La habitación es obligatoria.").max(10),
    avisoAdministracion: z.enum(['convivente', 'no_comunicado', 'comunicado']),
}).strict();

export const AsistenteSchema = z.object({
    usuariosAsistidos: z.record(FirebaseIdSchema, AsistentePermisosDetalleSchema),
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
    horaMaxima: IsoTimeStringSchema.optional(),
    horaMinima: IsoTimeStringSchema.optional(),
}).strict();

// ============================================
// Esquema Base para Usuario (lectura)
// ============================================

export const usuarioSchema = z.object({
    // Info interna
    id: FirebaseIdSchema,
    residenciaId: FirebaseIdSchema.nullable().optional(),
    roles: z.array(z.enum(['master', 'admin', 'director', 'residente', 'invitado', 'asistente', 'contador'])),
    email: z.string().email(),
    tieneAutenticacion: z.boolean(),
    timestampCreacion: TimestampStringSchema,
    timestampActualizacion: TimestampStringSchema,
    timestampUltimoIngreso: TimestampStringSchema.nullable().optional(),
    estaActivo: z.boolean(),
    centroCostoPorDefectoId: FirebaseIdSchema.nullable().optional(),
    notificacionPreferencias: NotificacionPreferenciasSchema.nullable().optional(),

    // Info personal
    nombre: z.string().min(2).max(100),
    apellido: z.string().min(2).max(255),
    nombreCorto: z.string().min(2).max(15),
    identificacion: CadenaOpcionalLimitada().optional(),
    telefonoMovil: TelefonoOpcionalSchema.optional(),
    fechaDeNacimiento: OptionalIsoDateStringSchema,
    fotoPerfil: z.string().url().nullable().optional(),
    universidad: CadenaOpcionalLimitada(2, 150).optional(),
    carrera: CadenaOpcionalLimitada(2, 50).optional(),

    // Info funcional
    grupos: z.array(FirebaseIdSchema),
    puedeTraerInvitados: z.enum(['no', 'requiere_autorizacion', 'si']).nullable(),
    camposPersonalizados: z.record(z.string()).optional(),

    // Propiedades anidadas por rol
    asistente: AsistenteSchema.optional(),
    residente: ResidenteSchema.optional(),
}).strict();


// ============================================
// Refinamiento de roles
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
// Esquemas para CREATE
// ============================================

const createUsuarioObject = z.object({
    // Info interna
    residenciaId: FirebaseIdSchema.nullable().optional(),
    roles: z.array(z.enum(['master', 'admin', 'director', 'residente', 'invitado', 'asistente', 'contador'])).min(1, "Debe seleccionar al menos un rol."),
    email: z.string().email("El formato del email no es válido."),
    estaActivo: z.boolean().default(true),
    centroCostoPorDefectoId: FirebaseIdSchema.nullable().optional(),
    notificacionPreferencias: NotificacionPreferenciasSchema.nullable().optional(),
    tieneAutenticacion: z.boolean().default(true),

    // Info personal
    nombre: z.string().min(2, "El nombre debe tener al menos 2 caracteres.").max(100),
    apellido: z.string().min(2, "El apellido debe tener al menos 2 caracteres.").max(255),
    nombreCorto: z.string().min(2, "El nombre corto debe tener al menos 2 caracteres.").max(15),
    identificacion: CadenaOpcionalLimitada().optional(),
    telefonoMovil: TelefonoOpcionalSchema.optional(),
    fechaDeNacimiento: OptionalIsoDateStringSchema.nullable(),
    fotoPerfil: z.string().url().nullable().optional(),
    universidad: CadenaOpcionalLimitada(2, 150).optional(),
    carrera: CadenaOpcionalLimitada(2, 50).optional(),
    
    // Info funcional
    grupos: z.array(FirebaseIdSchema).default([]),
    puedeTraerInvitados: z.enum(['no', 'requiere_autorizacion', 'si']).nullable().default('no'),
    camposPersonalizados: z.record(z.string()).optional(),

    // Propiedades anidadas por rol
    asistente: AsistenteSchema.optional(),
    residente: ResidenteSchema.optional(),
}).strict();

export const createUsuarioSchema = createUsuarioObject.superRefine(userRoleRefinement);

// ============================================
// Esquemas para UPDATE
// ============================================

// Prácticamente todo es opcional en una actualización
const updateUsuarioObject = z.object({
    residenciaId: FirebaseIdSchema.nullable().optional(),
    roles: z.array(z.enum(['master', 'admin', 'director', 'residente', 'invitado', 'asistente', 'contador'])).min(1, "Debe seleccionar al menos un rol.").optional(),
    estaActivo: z.boolean().optional(),
    centroCostoPorDefectoId: FirebaseIdSchema.nullable().optional(),
    notificacionPreferencias: NotificacionPreferenciasSchema.nullable().optional(),

    nombre: z.string().min(2).max(100).optional(),
    apellido: z.string().min(2).max(255).optional(),
    nombreCorto: z.string().min(2).max(15).optional(),
    identificacion: CadenaOpcionalLimitada().optional(),
    telefonoMovil: TelefonoOpcionalSchema.optional(),
    fechaDeNacimiento: OptionalIsoDateStringSchema.nullable().optional(),
    fotoPerfil: z.string().url().nullable().optional(),
    universidad: CadenaOpcionalLimitada(2, 150).optional(),
    carrera: CadenaOpcionalLimitada(2, 50).optional(),
    
    grupos: z.array(FirebaseIdSchema).optional(),
    puedeTraerInvitados: z.enum(['no', 'requiere_autorizacion', 'si']).nullable().optional(),
    camposPersonalizados: z.record(z.string()).optional(),

    asistente: AsistenteSchema.optional(),
    residente: ResidenteSchema.optional(),
}).strict();

export const updateUsuarioSchema = updateUsuarioObject.superRefine(userRoleRefinement);


// ============================================
// Esquema para selector (dropdown)
// ============================================

export const UserSelectorItemSchema = z.object({
    id: FirebaseIdSchema,
    nombreCorto: z.string().nullable().optional(),
    email: z.string().email(),
    roles: z.array(z.string()),
    residente: z.object({ habitacion: CadenaOpcionalLimitada().optional() }).optional(),
    estaActivo: z.boolean(),
}).strip();

// ============================================
// Esquemas para formularios del cliente
// ============================================

export const clientCreateUserFormSchema = createUsuarioObject.extend({
    password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres."),
    confirmPassword: z.string().min(6),
}).superRefine(userRoleRefinement).refine((data) => data.password === data.confirmPassword, {
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
