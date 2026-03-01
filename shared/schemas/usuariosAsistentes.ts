import { z } from 'zod';
import {FirestoreIdSchema, slugIdSchema} from './common';
import {FechaIsoSchema, HoraIsoSchema} from "./fechas";

export const AsistentePermisosDetalleSchema = z.object({
    nivelAcceso: z.enum(['Todas', 'Propias', 'Ninguna']),
    restriccionTiempo: z.boolean(),
    fechaInicio: FechaIsoSchema.nullable().optional(),
    fechaFin: FechaIsoSchema.nullable().optional(),
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
    gestionHorariosYAlteraciones: AsistentePermisosDetalleSchema,
    gestionComedores: AsistentePermisosDetalleSchema,
    solicitarComensales: AsistentePermisosDetalleSchema,
}).strict();


// 1. Función de validación de integridad de fechas
const validarFechasPermiso = (data: AsistentePermisosDetalle, ctx: z.RefinementCtx, basePath: string) => {
    if (data.restriccionTiempo) {
        if (!data.fechaInicio) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Obligatorio si hay restricción temporal.",
                path: [basePath, 'fechaInicio'],
            });
        }
        if (!data.fechaFin) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Obligatorio si hay restricción temporal.",
                path: [basePath, 'fechaFin'],
            });
        }

        // Asumiendo que FechaIsoSchema valida el formato de string ISO
        if (data.fechaInicio && data.fechaFin) {
            const inicio = new Date(data.fechaInicio);
            const fin = new Date(data.fechaFin);
            if (inicio >= fin) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: "La fecha de fin debe ser posterior al inicio.",
                    path: [basePath, 'fechaFin'],
                });
            }
        }
    } else {
        // Regla de Higiene de Datos: Si apagan el switch de tiempo, las fechas deben venir limpias
        if (data.fechaInicio !== null || data.fechaFin !== null) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Las fechas deben ser nulas si no hay restricción.",
                path: [basePath, 'fechaInicio'], // Lo marcamos en inicio como referencia
            });
        }
    }
};

// 2. Esquema de Payload para el Server Action (Matriz de Sistema)
export const UpdateMatrizAccesosPayloadSchema = z.object({
    targetUserId: FirestoreIdSchema,

    // Heredamos omitiendo lo que pertenece al Blueprint 2 (Proxy)
    permisos: AsistenteSchema.omit({
        usuariosAsistidos: true,
    }).superRefine((permisos, ctx) => {
        // Iteramos sobre las llaves del objeto omitido dinámicamente
        Object.keys(permisos).forEach((key) => {
            const permiso = permisos[key as keyof typeof permisos];
            if (permiso) {
                validarFechasPermiso(permiso as AsistentePermisosDetalle, ctx, key);
            }
        });
    })
});

export type AsistentePermisosDetalle = z.infer<typeof AsistentePermisosDetalleSchema>;
export type UpdateMatrizAccesosPayload = z.infer<typeof UpdateMatrizAccesosPayloadSchema>;