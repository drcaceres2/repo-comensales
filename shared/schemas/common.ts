import { z } from 'zod';

// IDs de Firestore (no vacíos)
export const FirebaseIdSchema = z.string().min(1, "ID inválido");

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

/**
 * FirestoreTimestampSchema: Valida un timestamp de Firestore
 * Puede ser:
 * - Un objeto con estructura { seconds: number; nanoseconds: number }
 * - Un número (milisegundos desde época)
 * - Cualquier otro tipo (para compatibilidad con datos existentes)
 */
export const FirestoreTimestampSchema = z.union([
    z.object({
        seconds: z.number(),
        nanoseconds: z.number(),
    }),
    z.number(),
    z.any(), // Fallback para compatibilidad
]).describe("Firestore Timestamp - puede ser { seconds, nanoseconds } o número en ms");

