import { z } from 'zod';
import { FirebaseIdSchema, DateStringSchema } from './common';

// ============================================
// Esquemas para campos complejos de UserProfile
// ============================================

export const AsistentePermisosDetalleSchema = z.object({
    nivelAcceso: z.enum(['Todas', 'Propias', 'Ninguna']),
    restriccionTiempo: z.boolean(),
    fechaInicio: DateStringSchema.nullable().optional(),
    fechaFin: DateStringSchema.nullable().optional(),
}).strict();

export const AsistenciasUsuariosDetalleSchema = z.object({
    usuarioAsistido: FirebaseIdSchema,
    restriccionTiempo: z.boolean(),
    fechaInicio: DateStringSchema.nullable().optional(),
    fechaFin: DateStringSchema.nullable().optional(),
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
    horaMaxima: z.string().optional(),
    horaMinima: z.string().optional(),
}).strict();

// ============================================
// Esquema Base para UserProfile (lectura)
// ============================================

export const userProfileSchema = z.object({
    id: FirebaseIdSchema,
    nombre: z.string().min(2).max(100),
    apellido: z.string().min(2).max(255),
    nombreCorto: z.string().min(2).max(15),
    fotoPerfil: z.string().nullable().optional(),
    email: z.string().email(),
    roles: z.array(z.enum(['residente', 'director', 'admin', 'master', 'invitado', 'asistente', 'contador'])),
    isActive: z.boolean(),
    residenciaId: FirebaseIdSchema.nullable().optional(),
    dietaId: FirebaseIdSchema.nullable().optional(),
    numeroDeRopa: z.string().max(10).optional(),
    habitacion: z.string().max(10).optional(),
    universidad: z.string().max(150).optional(),
    carrera: z.string().optional(),
    dni: z.string().optional(),
    fechaDeNacimiento: DateStringSchema.nullable().optional(),
    centroCostoPorDefectoId: FirebaseIdSchema.nullable().optional(),
    puedeTraerInvitados: z.enum(['no', 'requiere_autorizacion', 'si']),
    valorCampoPersonalizado1: z.string().optional(),
    valorCampoPersonalizado2: z.string().optional(),
    valorCampoPersonalizado3: z.string().optional(),
    telefonoMovil: z.string()
        .regex(/^(\+?(\d[\d\- ]+)?(\([\d\- ]+\))?[\d\- ]+\d$)/)
        .refine(val => {
            const digits = val.replace(/\D/g, '').length;
            return digits >= 7 && digits <= 15;
        })
        .optional(),
    asistentePermisos: AsistentePermisosSchema.nullable().optional(),
    notificacionPreferencias: NotificacionPreferenciasSchema.nullable().optional(),
    tieneAutenticacion: z.boolean(),
    fechaCreacion: z.any().nullable().optional(),
    ultimaActualizacion: z.any().nullable().optional(),
    lastLogin: z.any().nullable().optional(),
}).strict();

// ============================================
// Esquemas para CREATE
// ============================================

export const createUserProfileSchema = z.object({
    nombre: z.string().min(2).max(100),
    apellido: z.string().min(2).max(255),
    nombreCorto: z.string().min(2).max(15),
    fotoPerfil: z.string().nullable().optional(),
    email: z.string().email(),
    roles: z.array(z.enum(['residente', 'director', 'admin', 'master', 'invitado', 'asistente', 'contador'])),
    isActive: z.boolean().default(true),
    residenciaId: FirebaseIdSchema.nullable().optional(),
    dietaId: FirebaseIdSchema.nullable().optional(),
    numeroDeRopa: z.string().max(10).optional(),
    habitacion: z.string().max(10).optional(),
    universidad: z.string().max(150).optional(),
    carrera: z.string().optional(),
    dni: z.string().optional(),
    fechaDeNacimiento: DateStringSchema.nullable().optional(),
    centroCostoPorDefectoId: FirebaseIdSchema.nullable().optional(),
    puedeTraerInvitados: z.enum(['no', 'requiere_autorizacion', 'si']).nullable().optional(),
    valorCampoPersonalizado1: z.string().optional(),
    valorCampoPersonalizado2: z.string().optional(),
    valorCampoPersonalizado3: z.string().optional(),
    telefonoMovil: z.string()
        .regex(/^(\+?(\d[\d\- ]+)?(\([\d\- ]+\))?[\d\- ]+\d$)/)
        .refine(val => {
            const digits = val.replace(/\D/g, '').length;
            return digits >= 7 && digits <= 15;
        })
        .optional(),
    asistentePermisos: AsistentePermisosSchema.nullable().optional(),
    notificacionPreferencias: NotificacionPreferenciasSchema.nullable().optional(),
    tieneAutenticacion: z.boolean().default(true),
}).strict();

// ============================================
// Esquemas para UPDATE
// ============================================

export const updateUserProfileSchema = z.object({
    nombre: z.string().min(2).max(100).optional(),
    apellido: z.string().min(2).max(255).optional(),
    nombreCorto: z.string().min(2).max(15).optional(),
    fotoPerfil: z.string().nullable().optional(),
    roles: z.array(z.enum(['residente', 'director', 'admin', 'master', 'invitado', 'asistente', 'contador'])).optional(),
    isActive: z.boolean().optional(),
    residenciaId: FirebaseIdSchema.nullable().optional(),
    dietaId: FirebaseIdSchema.nullable().optional(),
    numeroDeRopa: z.string().max(10).optional(),
    habitacion: z.string().max(10).optional(),
    universidad: z.string().max(150).optional(),
    carrera: z.string().optional(),
    dni: z.string().optional(),
    fechaDeNacimiento: DateStringSchema.nullable().optional(),
    centroCostoPorDefectoId: FirebaseIdSchema.nullable().optional(),
    puedeTraerInvitados: z.enum(['no', 'requiere_autorizacion', 'si']).nullable().optional(),
    valorCampoPersonalizado1: z.string().optional(),
    valorCampoPersonalizado2: z.string().optional(),
    valorCampoPersonalizado3: z.string().optional(),
    telefonoMovil: z.string()
        .regex(/^(\+?(\d[\d\- ]+)?(\([\d\- ]+\))?[\d\- ]+\d$)/)
        .refine(val => {
            const digits = val.replace(/\D/g, '').length;
            return digits >= 7 && digits <= 15;
        })
        .optional(),
    asistentePermisos: AsistentePermisosSchema.nullable().optional(),
    notificacionPreferencias: NotificacionPreferenciasSchema.nullable().optional(),
    tieneAutenticacion: z.boolean().optional(),
}).strict();

// ============================================
// Esquema para selector (dropdown)
// ============================================

export const UserSelectorItemSchema = z.object({
    id: FirebaseIdSchema,
    nombreCorto: z.string().nullable().optional(),
    email: z.string().email(),
    roles: z.array(z.string()),
    habitacion: z.string().optional(),
    isActive: z.boolean(),
}).strip();

// ============================================
// Esquemas para formularios del cliente
// ============================================

export const clientCreateUserFormSchema = createUserProfileSchema.extend({
    password: z.string().min(6),
    confirmPassword: z.string().min(6),
}).refine((data: z.infer<typeof createUserProfileSchema> & { password: string; confirmPassword: string }) => data.password === data.confirmPassword, {
    message: "Las contraseñas no coinciden",
    path: ['confirmPassword'],
});

export const clientUpdateUserFormSchema = updateUserProfileSchema;

// ============================================
// Type Exports
// ============================================

export type UserProfile = z.infer<typeof userProfileSchema>;
export type CreateUserProfile = z.infer<typeof createUserProfileSchema>;
export type UpdateUserProfile = z.infer<typeof updateUserProfileSchema>;
export type AsistentePermisos = z.infer<typeof AsistentePermisosSchema>;
export type NotificacionPreferencias = z.infer<typeof NotificacionPreferenciasSchema>;
export type ClientCreateUserForm = z.infer<typeof clientCreateUserFormSchema>;
export type ClientUpdateUserForm = z.infer<typeof clientUpdateUserFormSchema>;
