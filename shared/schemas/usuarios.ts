import { z } from 'zod';
import { FirebaseIdSchema, CadenaOpcionalLimitada, TelefonoOpcionalSchema, FirestoreTimestampSchema } from './common';
import { IsoDateStringSchema, OptionalIsoDateStringSchema, IsoTimeStringSchema } from './fechas';

// ============================================
// Esquemas para campos complejos de UserProfile
// ============================================

export const AsistentePermisosDetalleSchema = z.object({
    nivelAcceso: z.enum(['Todas', 'Propias', 'Ninguna']),
    restriccionTiempo: z.boolean(),
    fechaInicio: IsoDateStringSchema.nullable().optional(),
    fechaFin: IsoDateStringSchema.nullable().optional(),
}).strict();

export const AsistenciasUsuariosDetalleSchema = z.object({
    usuarioAsistido: FirebaseIdSchema,
    restriccionTiempo: z.boolean(),
    fechaInicio: IsoDateStringSchema.nullable().optional(),
    fechaFin: IsoDateStringSchema.nullable().optional(),
}).strict();

export const AsistentePermisosSchema = z.object({
    usuariosAsistidos: z.array(AsistenciasUsuariosDetalleSchema).optional(),
    gestionUsuarios: z.boolean(),
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
    tiposPermitidos: z.array(z.string()),
    notificacionesSilenciadas: z.boolean().optional(),
    horaMaxima: IsoTimeStringSchema.optional(),
    horaMinima: IsoTimeStringSchema.optional(),
}).strict();

// ============================================
// Esquema Base para UserProfile (lectura)
// ============================================

export const userProfileSchema = z.object({
    id: FirebaseIdSchema,
    nombre: z.string().min(2).max(100),
    apellido: z.string().min(2).max(255),
    nombreCorto: z.string().min(2).max(15),
    email: z.string().email(),
    fotoPerfil: z.string().nullable().optional(),
    roles: z.array(z.enum(['residente', 'director', 'admin', 'master', 'invitado', 'asistente', 'contador'])),
    isActive: z.boolean(),
    residenciaId: FirebaseIdSchema.nullable().optional(),
    dietaId: FirebaseIdSchema.nullable().optional(),
    numeroDeRopa: CadenaOpcionalLimitada(1,10).optional(),
    habitacion: CadenaOpcionalLimitada(1,10).optional(),
    universidad: CadenaOpcionalLimitada(2,150).optional(),
    carrera: CadenaOpcionalLimitada(2,50).optional(),
    identificacion: CadenaOpcionalLimitada().optional(),
    telefonoMovil: TelefonoOpcionalSchema.optional(),
    fechaDeNacimiento: OptionalIsoDateStringSchema,
    asistentePermisos: AsistentePermisosSchema.nullable().optional(),
    centroCostoPorDefectoId: FirebaseIdSchema.nullable().optional(),
    puedeTraerInvitados: z.enum(['no', 'requiere_autorizacion', 'si']).nullable(),
    notificacionPreferencias: NotificacionPreferenciasSchema.nullable().optional(),
    tieneAutenticacion: z.boolean(),
    
    fechaHoraCreacion: FirestoreTimestampSchema.nullable().optional(),
    ultimaActualizacion: FirestoreTimestampSchema.nullable().optional(),
    lastLogin: FirestoreTimestampSchema.nullable().optional(),

    camposPersonalizados: z.record(z.string()).optional(),
}).strict();

// ============================================
// Refinamiento de roles
// ============================================

const userRoleRefinement = (data: { roles: string[], dietaId?: string | null, numeroDeRopa?: string, habitacion?: string, asistentePermisos?: any | null }, ctx: z.RefinementCtx) => {
    // Regla para rol 'residente'
    if (data.roles.includes('residente')) {
        if (!data.dietaId) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "La dieta es obligatoria para los residentes.",
                path: ['dietaId'],
            });
        }
        if (!data.numeroDeRopa) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "El número de ropa es obligatorio para los residentes.",
                path: ['numeroDeRopa'],
            });
        }
        if (!data.habitacion) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "La habitación es obligatoria para los residentes.",
                path: ['habitacion'],
            });
        }
    }

    // Regla para rol 'asistente'
    if (data.roles.includes('asistente')) {
        if (!data.asistentePermisos) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Los permisos de asistente son obligatorios para este rol.",
                path: ['asistentePermisos'],
            });
        }
    } else {
        if (data.asistentePermisos) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Los permisos de asistente solo son aplicables a usuarios con el rol 'asistente'.",
                path: ['asistentePermisos'],
            });
        }
    }
};

// ============================================
// Esquemas para CREATE
// ============================================

const createUserProfileObject = z.object({
    nombre: z.string().min(2).max(100),
    apellido: z.string().min(2).max(255),
    nombreCorto: z.string().min(2).max(15),
    email: z.string().email(),
    fotoPerfil: z.string().nullable().optional(),
    roles: z.array(z.enum(['residente', 'director', 'admin', 'master', 'invitado', 'asistente', 'contador']), {
        required_error: "Es necesario agregar al menos un rol"}),
    isActive: z.boolean().default(true),
    residenciaId: FirebaseIdSchema.nullable().optional(),
    dietaId: FirebaseIdSchema.nullable().optional(),
    numeroDeRopa: z.string().max(10).optional(),
    habitacion: z.string().max(10).optional(),
    universidad: z.string().max(150).optional(),
    carrera: CadenaOpcionalLimitada().optional(),
    identificacion: CadenaOpcionalLimitada().optional(),
    telefonoMovil: TelefonoOpcionalSchema.optional(),
    fechaDeNacimiento: OptionalIsoDateStringSchema.nullable(),
    asistentePermisos: AsistentePermisosSchema.nullable().optional(),
    centroCostoPorDefectoId: FirebaseIdSchema.nullable().optional(),
    puedeTraerInvitados: z.enum(['no', 'requiere_autorizacion', 'si']).nullable().optional(),
    notificacionPreferencias: NotificacionPreferenciasSchema.nullable().optional(),
    tieneAutenticacion: z.boolean().default(true),

    camposPersonalizados: z.record(z.string()).optional()
}).strict();

export const createUserProfileSchema = createUserProfileObject.superRefine(userRoleRefinement);

// ============================================
// Esquemas para UPDATE
// ============================================

const updateUserProfileObject = z.object({
    nombre: z.string().min(2).max(100).optional(),
    apellido: z.string().min(2).max(255).optional(),
    nombreCorto: z.string().min(2).max(15).optional(),
    fotoPerfil: z.string().nullable().optional(),
    roles: z.array(z.enum(['residente', 'director', 'admin', 'master', 'invitado', 'asistente', 'contador'])),
    isActive: z.boolean().optional(),
    residenciaId: FirebaseIdSchema.nullable().optional(),
    dietaId: FirebaseIdSchema.nullable().optional(),
    numeroDeRopa: z.string().max(10).optional(),
    habitacion: z.string().max(10).optional(),
    universidad: z.string().max(150).optional(),
    carrera: CadenaOpcionalLimitada().optional(),
    identificacion: CadenaOpcionalLimitada().optional(),
    telefonoMovil: TelefonoOpcionalSchema.optional(),
    fechaDeNacimiento: OptionalIsoDateStringSchema,
    asistentePermisos: AsistentePermisosSchema.nullable().optional(),
    centroCostoPorDefectoId: FirebaseIdSchema.nullable().optional(),
    puedeTraerInvitados: z.enum(['no', 'requiere_autorizacion', 'si']).nullable().optional(),
    notificacionPreferencias: NotificacionPreferenciasSchema.nullable().optional(),
    tieneAutenticacion: z.boolean().optional(),

    camposPersonalizados: z.record(z.string()).optional()
}).strict();

export const updateUserProfileSchema = updateUserProfileObject.superRefine(userRoleRefinement);


// ============================================
// Esquema para selector (dropdown)
// ============================================

export const UserSelectorItemSchema = z.object({
    id: FirebaseIdSchema,
    nombreCorto: z.string().nullable().optional(),
    email: z.string().email(),
    roles: z.array(z.string()),
    habitacion: CadenaOpcionalLimitada().optional(),
    isActive: z.boolean(),
}).strip();

// ============================================
// Esquemas para formularios del cliente
// ============================================

export const clientCreateUserFormSchema = createUserProfileObject.extend({
    password: z.string().min(6),
    confirmPassword: z.string().min(6),
}).refine((data) => data.password === data.confirmPassword, {
    message: "Las contraseñas no coinciden",
    path: ['confirmPassword'],
}).superRefine(userRoleRefinement);

export const clientUpdateUserFormSchema = updateUserProfileSchema;

// ============================================
// Type Exports
// ============================================

export type UserProfile = z.infer<typeof userProfileSchema>;
export type CreateUserProfile = z.infer<typeof createUserProfileSchema>;
export type UpdateUserProfile = z.infer<typeof updateUserProfileSchema>;
export type AsistentePermisos = z.infer<typeof AsistentePermisosSchema>;
export type AsistentePermisosDetalle = z.infer<typeof AsistentePermisosDetalleSchema>;
export type NotificacionPreferencias = z.infer<typeof NotificacionPreferenciasSchema>;
export type ClientCreateUserForm = z.infer<typeof clientCreateUserFormSchema>;
export type ClientUpdateUserForm = z.infer<typeof clientUpdateUserFormSchema>;
