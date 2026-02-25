import { z } from 'zod';
import { ZonaHorariaIanaSchema } from './fechas';


// IDs de Firestore (no vacíos)
export const FirestoreIdSchema = z.string()
    .min(1, "ID inválido")
    .max(20, "ID no puede tener más de 20 caracteres")
    .refine(val => !val.includes('/'), {
        message: "ID no puede contener una barra inclinada (/)",
    })
    .refine(val => val !== '.', {
        message: "ID no puede ser un punto simple (.)",
    })
    .refine(val => val !== '..', {
        message: "ID no puede ser puntos dobles (..)",
    })
    .refine(val => !(val.startsWith('__') && val.endsWith('__')), {
        message: "ID no puede empezar y terminar con guiones bajos dobles, ya que está reservado para el sistema.",
    });

export const TimestampSchema = z.any();

// Formato ISO 8601 Completo (YYYY-MM-DDTHH:mm:ss.sssZ)
export const TimestampStringSchema = z.string().datetime({
    message: "El timestamp debe estar en formato ISO 8601 (YYYY-MM-DDTHH:mm:ss.sssZ)",
});


export const slugIdSchema = z.string()
    .min(1, "El slug no puede estar vacío")
    .max(30, "El slug no puede tener más de 30 caracteres")
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "El slug debe contener solo letras minúsculas, números y guiones")
    .refine(val => !val.includes('--'), {
        message: "El slug no puede contener guiones dobles",
    });

export const slugCompuestoIdSchema = z.string()
    .min(1, "El slug no puede estar vacío")
    .max(50, "El slug no puede tener más de 50 caracteres")
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "El slug debe contener solo letras minúsculas, números y guiones")
    .refine(val => !val.includes('--'), {
        message: "El slug no puede contener guiones dobles",
    });

export const OptionalSlugIdSchema = z.preprocess(
    (val) => (val === "" || val === null) ? undefined : val,
    slugIdSchema.optional()
);

export const CadenaOpcionalLimitada = (min: number = 1, max?: number) => {
    let stringRule = z.string().min(min, { message: `Mínimo ${min} caracter(es)` });

    if (max) {
        stringRule = stringRule.max(max, { message: `Máximo ${max} caracteres` });
    }

    return z.preprocess(
        (val) => (val === "" || val === null) ? undefined : val,
        z.string().optional().pipe(stringRule.optional())
    );
};

// ISO 3166-1 alpha-2 (ej: "HN", "MX")
export const CodigoPaisIsoSchema = z.string().regex(
    /^[A-Z]{2}$/,
    "El código de país debe ser 2 letras mayúsculas (ISO 3166-1 alpha-2)"
);

// --- Interfaces ---
export const UbicacionSchema = z.object({
    pais: CodigoPaisIsoSchema,
    region: z.string().optional(),
    ciudad: z.string().min(1, "La ciudad es obligatoria"),
    direccion: z.string().optional(),
    zonaHoraria: ZonaHorariaIanaSchema,
});

export const TelefonoOpcionalSchema = z.preprocess(
    (val) => (val === "" || val === null) ? undefined : val,
    z.string().optional().pipe(
        z.string()
            .trim()
            .regex(/^(\+?(\d[\d\- ]+)?(\([\d\- ]+\))?[\d\- ]+\d$)/, { message: "El formato del número de teléfono no es válido." })
            .refine(val => {
                const digits = val.replace(/\D/g, '').length;
                return digits >= 7 && digits <= 15;
            }, { message: "El número de teléfono debe tener entre 7 y 15 dígitos." })
            .optional()
    )
);

export const UrlOpcionalSchema = z.string()
    .trim()
    .transform(v => v === "" ? undefined : v)
    .pipe(z.string().url("El formato de la URL no es válido").optional());

// Color HTML
export const ColorHTMLSchema = z.string().regex(
    /^#[0-9A-Fa-f]{6}$/,
    "El color debe estar en formato #RRGGBB"
);

export type Ubicacion = z.infer<typeof UbicacionSchema>;
