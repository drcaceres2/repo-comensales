import { z } from 'zod';
import { FirebaseIdSchema, CadenaOpcionalLimitada, FirestoreTimestampSchema } from './common';
import { IsoDateStringSchema } from './fechas';

export const ComentarioSchema = z.object({
    id: FirebaseIdSchema,
    residenciaId: FirebaseIdSchema,
    autorId: FirebaseIdSchema,
    fechaHoraCreacion: FirestoreTimestampSchema,
    texto: CadenaOpcionalLimitada(1, 500),
    categoria: z.enum(['comida', 'limpieza', 'mantenimiento', 'varios']),
    estado: z.enum(['nuevo', 'leido', 'diferido', 'archivado']),
    fechaDiferidoHasta: IsoDateStringSchema.optional(),
});

export const FaltaSchema = z.object({
    id: FirebaseIdSchema,
    fecha: IsoDateStringSchema,
    residencia: FirebaseIdSchema,
    usuario: FirebaseIdSchema,
    titulo: CadenaOpcionalLimitada(1, 100),
    descripcion: CadenaOpcionalLimitada(0, 500).optional(),
    notificada: z.boolean(),
    confirmada: z.boolean(),
    origen: z.string(),
});
