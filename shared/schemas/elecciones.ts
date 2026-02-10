import { z } from 'zod';
import { FirebaseIdSchema, DateStringSchema } from './common';
import { ExcepcionSchema } from './excepciones';

/**
 * @deprecated La entidad "Eleccion" ha sido fragmentada en dos entidades distintas:
 * - Excepcion: Representa la voluntad del usuario de desviarse de su Semanario
 * - Comensal: Representa la comida efectivamente solicitada a administración
 * 
 * EleccionSchema ahora es un alias para ExcepcionSchema para mantener compatibilidad.
 * Las nuevas referencias deben usar ExcepcionSchema directamente desde excepciones.ts
 */
export const EleccionSchema = ExcepcionSchema;
