import { type RolUsuario } from 'shared/models/types';
import { type Usuario, type AsistentePermisos } from 'shared/schemas/usuarios';
import { hoyEstamosEntreFechasResidencia } from "shared/utils/commonUtils";
import { type UsuarioId } from 'shared/models/types';

// La clave del permiso que coincide con las propiedades en `Usuario.asistente`
// Omitimos los que no son permisos de "gestión"
export type LlavePermisoGestion = keyof Omit<AsistentePermisos, 'usuarioAprobador' | 'usuariosAsistidos'>;

export interface ResultadoAcceso {
    tieneAcceso: boolean;
    nivelAcceso: 'Todas' | 'Propias' | 'Ninguna';
}

/**
 * Verifica si un usuario tiene permiso para acceder a una página de gestión.
 * Maneja roles como 'master', 'admin', 'director' y la lógica delegada para 'asistente'.
 *
 * @param usuario - El objeto completo del usuario que realiza la acción.
 * @param residenciaId - El ID de la residencia sobre la que se actúa.
 * @param llavePermiso - La clave del permiso de gestión a verificar (e.g., 'gestionComedores').
 * @param zonaHoraria - La zona horaria para la validación de fechas.
 * @returns Un objeto ResultadoAcceso indicando si está autorizado y su nivel de acceso.
 */
export async function verificarPermisoGestion(
    usuario: Usuario,
    residenciaId: string,
    llavePermiso: LlavePermisoGestion,
    zonaHoraria: string
): Promise<ResultadoAcceso> {
    const roles = usuario.roles || [];
    
    // Roles privilegiados que tienen acceso total en su residencia
    const rolesPrivilegiados: RolUsuario[] = ['admin', 'director']; 

    // Rol 'master' tiene acceso universal.
    if (roles.includes('master')) {
        return { tieneAcceso: true, nivelAcceso: 'Todas' };
    }

    // Roles privilegiados ('admin', 'director') tienen acceso si pertenecen a la residencia.
    if (roles.some(r => rolesPrivilegiados.includes(r)) && usuario.residenciaId === residenciaId) {
        return { tieneAcceso: true, nivelAcceso: 'Todas' };
    }

    // Lógica para rol 'asistente'
    if (roles.includes('asistente') && usuario.asistente && usuario.residenciaId === residenciaId) {
        const permisoAsistente = usuario.asistente[llavePermiso];

        if (permisoAsistente && permisoAsistente.nivelAcceso !== 'Ninguna') {
            // Si no hay restricción de tiempo, el permiso es permanente.
            if (!permisoAsistente.restriccionTiempo) {
                return { tieneAcceso: true, nivelAcceso: permisoAsistente.nivelAcceso };
            }

            // Si hay restricción, se validan las fechas.
            const estaEnPlazo = await hoyEstamosEntreFechasResidencia(
                permisoAsistente.fechaInicio,
                permisoAsistente.fechaFin,
                zonaHoraria
            ) === 'dentro';

            if (estaEnPlazo) {
                return { tieneAcceso: true, nivelAcceso: permisoAsistente.nivelAcceso };
            }
        }
    }

    // Acceso denegado por defecto
    return { tieneAcceso: false, nivelAcceso: 'Ninguna' };
}


/**
 * Verifica si un asistente tiene permiso para actuar en nombre de un usuario específico.
 * Revisa la propiedad `usuariosAsistidos` del asistente.
 *
 * @param usuarioAsistente - El objeto completo del usuario con rol 'asistente'.
 * @param idUsuarioAsistido - El ID del usuario sobre el que el asistente quiere actuar.
 * @param zonaHoraria - La zona horaria para la validación de fechas.
 * @returns Un objeto ResultadoAcceso indicando si está autorizado y su nivel de acceso.
 */
export async function verificarPermisoUsuarioAsistido(
    usuarioAsistente: Usuario,
    idUsuarioAsistido: UsuarioId,
    zonaHoraria: string
): Promise<ResultadoAcceso> {
    // Solo aplica a asistentes con la configuración correcta
    if (!usuarioAsistente.roles.includes('asistente') || !usuarioAsistente.asistente?.usuariosAsistidos) {
        return { tieneAcceso: false, nivelAcceso: 'Ninguna' };
    }

    const detallesPermiso = usuarioAsistente.asistente.usuariosAsistidos[idUsuarioAsistido];

    // Si no hay una entrada de permiso para ese usuario, no hay acceso.
    if (!detallesPermiso || detallesPermiso.nivelAcceso === 'Ninguna') {
        return { tieneAcceso: false, nivelAcceso: 'Ninguna' };
    }

    // Si no hay restricción de tiempo, el permiso es permanente.
    if (!detallesPermiso.restriccionTiempo) {
        return { tieneAcceso: true, nivelAcceso: detallesPermiso.nivelAcceso };
    }

    // Si hay restricción, se validan las fechas.
    const estaEnPlazo = await hoyEstamosEntreFechasResidencia(
        detallesPermiso.fechaInicio,
        detallesPermiso.fechaFin,
        zonaHoraria
    ) === 'dentro';

    return estaEnPlazo 
      ? { tieneAcceso: true, nivelAcceso: detallesPermiso.nivelAcceso }
      : { tieneAcceso: false, nivelAcceso: 'Ninguna' };
}