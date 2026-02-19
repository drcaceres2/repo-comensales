import { ExcepcionUsuarioSchema } from './excepciones';

/**
 * @deprecated La entidad "Eleccion" ha sido fragmentada en dos entidades distintas:
 * - ExcepcionUsuario: Representa la voluntad del usuario de desviarse de su Semanario
 * - ComensalSolicitado: Representa la comida efectivamente solicitada a administración
 * 
 * EleccionSchema ahora es un alias para ExcepcionUsuarioSchema para mantener compatibilidad.
 * Las nuevas referencias deben usar ExcepcionUsuarioSchema directamente desde excepciones.ts
 */
export const EleccionSchema = ExcepcionUsuarioSchema;
