import { z } from 'zod';

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

export const CadenaOpcionalLimitada = (min: number = 1, max?: number) => {
    // 1. Definimos la regla base para el string (cuando SÍ hay valor)
    let stringRule = z.string().min(min, { message: `Mínimo ${min} caracter(es)` });

    // 2. Si nos pasaron un max, lo inyectamos a la regla
    if (max) {
        stringRule = stringRule.max(max, { message: `Máximo ${max} caracteres` });
    }

    // 3. Retornamos el pipeline completo
    return z.string()
        .trim() // Limpieza inicial
        .transform(v => v === "" ? undefined : v) // La magia del formulario
        .pipe(stringRule.optional()); // Aplicamos las reglas construidas arriba
};

export const TelefonoOpcionalSchema = z.string()
    .trim()
    .transform(v => v === "" ? undefined : v)
    .pipe(z.string()
        .regex(/^(\+?(\d[\d\- ]+)?(\([\d\- ]+\))?[\d\- ]+\d$)/, { message: "El formato del número de teléfono no es válido." })
        .refine(val => {
            const digits = val.replace(/\D/g, '').length;
            return digits >= 7 && digits <= 15;
        }, { message: "El número de teléfono debe tener entre 7 y 15 dígitos." })
        .optional()
    );

export const UrlOpcionalSchema = z.string()
    .trim()
    .transform(v => v === "" ? undefined : v)
    .pipe(z.string().url("El formato de la URL no es válido").optional());