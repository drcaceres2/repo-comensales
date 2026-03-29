import { z } from 'zod';
import { UsuarioBaseObject } from './usuarios'; // Tu esquema base
import { SlugIdSchema, AuthIdSchema, OptionalFirestoreIdSchema, TimestampSchema } from './common';
import { FechaIsoSchema } from './fechas';

// 1. El Payload (Protegido por z.pick)
const InvitadoPayloadSchema = UsuarioBaseObject.pick({
    nombre: true,
    apellido: true,
    nombreCorto: true,
    identificacion: true,
    telefonoMovil: true,
    fechaDeNacimiento: true,
    fotoPerfil: true,
    universidad: true,
    carrera: true,
    camposPersonalizados: true,
}).extend({
    // Sobrescribimos el email para que sea opcional/nullable en esta etapa
    email: z.string().email("Formato inválido").nullable().optional(),
});

// 2. El Contexto de Intención (Unión Discriminada)
const ContextoInvitacionSchema = z.discriminatedUnion('tipo', [
    z.object({ 
        tipo: z.literal('comida'), 
        alternativaId: SlugIdSchema, 
        fecha: FechaIsoSchema 
    }),
    z.object({ 
        tipo: z.literal('actividad'), 
        actividadId: SlugIdSchema 
    }),
    z.object({ 
        tipo: z.literal('ninguno') 
    })
]);

// 3. El Contrato Principal (Solicitud)
export const SolicitudInvitadoSchema = z.object({
    id: OptionalFirestoreIdSchema,
    residenciaId: SlugIdSchema,
    idAnfitrion: AuthIdSchema, // Vínculo duro obligatorio
    estado: z.enum(['pendiente', 'aprobada', 'rechazada']).default('pendiente'),
    contexto: ContextoInvitacionSchema,
    payloadCandidato: InvitadoPayloadSchema,
    mensajeReferenciaId: OptionalFirestoreIdSchema, // Enlace a la Capa de Comunicación
    timestampCreacion: TimestampSchema.optional(),
}).superRefine((data, ctx) => {
    // Validación Capa 1: Fechas lógicas base
    if (data.contexto.tipo === 'comida') {
        const fechaContexto = new Date(data.contexto.fecha);
        const hoy = new Date();
        hoy.setHours(0,0,0,0);
        
        if (fechaContexto < hoy) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "No se pueden sugerir invitados para fechas pasadas.",
                path: ['contexto', 'fecha'],
            });
        }
    }
});

export type SolicitudInvitado = z.infer<typeof SolicitudInvitadoSchema>;