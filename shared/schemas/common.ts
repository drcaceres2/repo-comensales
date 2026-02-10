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

