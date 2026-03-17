import { type RolUsuario } from 'shared/models/types';
import { type Usuario, type AsistentePermisos } from 'shared/schemas/usuarios';
import { EntreFechasResidencia } from "shared/utils/commonUtils";
import { type UsuarioId } from 'shared/models/types';
import { type ZonaHorariaIana } from 'shared/schemas/fechas';
import { obtenerInfoUsuarioServer } from "@/lib/obtenerInfoUsuarioServer";
import { db, Timestamp } from '@/lib/firebaseAdmin';

// La clave del permiso que coincide con las propiedades en `Usuario.asistente`
export type LlavePermisoGestion = keyof Omit<AsistentePermisos, 'usuariosAsistidos'>;

export interface ResultadoAcceso {
    tieneAcceso: boolean;
    nivelAcceso: 'Todas' | 'Propias' | 'Ninguna';
    mensaje: string | null;
    error: string | null;
}

/**
 * Wrapper de `verificarPermisoGestion` que obtiene la información del usuario y el timestamp del servidor.
 * Esto centraliza la lógica de obtención de datos para la verificación de permisos.
 * @param llavePermiso - La clave del permiso de gestión a verificar.
 * @returns Un objeto ResultadoAcceso.
 */
export async function verificarPermisoGestionWrapper(llavePermiso: LlavePermisoGestion): Promise<ResultadoAcceso> {
    const { usuarioId, residenciaId: residenciaIdAuth, roles, zonaHoraria } = await obtenerInfoUsuarioServer();
    let usuario: Partial<Usuario> = {
        id: usuarioId,
        roles: roles,
        residenciaId: residenciaIdAuth,
    };
    // Si no recibimos zona horaria desde los headers/token, intentamos obtenerla desde la residencia en la BD.
    let zonaHorariaFinal: string | null | undefined = zonaHoraria;
    if (!zonaHorariaFinal && residenciaIdAuth) {
        try {
            const residenciaDoc = await db.collection('residencias').doc(residenciaIdAuth).get();
            if (residenciaDoc.exists) {
                const residenciaData = residenciaDoc.data() as any;
                zonaHorariaFinal = residenciaData?.ubicacion?.zonaHoraria || zonaHorariaFinal;
            }
        } catch (err) {
            console.warn('acceso-privilegiado: no se pudo obtener zona horaria desde la residencia:', err);
        }
    }

    if (roles.includes('asistente')) {
        try {
            const userDoc = await db.collection('usuarios').doc(usuarioId).get();
            if (userDoc.exists) {
                const fullUserData = userDoc.data() as Usuario;
                usuario.asistente = fullUserData.asistente;
            }
        } catch (error) {
            console.error("acceso-privilegiado.ts (verificarPermisoGestionWrapper): Error en la consulta de usuario asistente.", error);
            return {
                tieneAcceso: false,
                mensaje: 'Error en la consulta de datos del asistente.',
                nivelAcceso: 'Ninguna',
                error: 'Error en la consulta de datos del asistente.'
            };
        }
    }

    const timestampServidor = Timestamp.now();

    return await verificarPermisoGestion(
        usuario,
        residenciaIdAuth,
        llavePermiso,
        zonaHorariaFinal,
        timestampServidor
    );
}

/**
 * Verifica si un usuario tiene permiso para acceder a una página de gestión.
 * Maneja roles como 'master', 'admin', 'director' y la lógica delegada para 'asistente'.
 *
 * @param usuario - El objeto completo del usuario que realiza la acción.
 * @param residenciaIdAuth - El ID de la residencia sobre la que se actúa.
 * @param llavePermiso - La clave del permiso de gestión a verificar (e.g., 'gestionComedores').
 * @param zonaHoraria - La zona horaria para la validación de fechas.
 * @param timestampServidor - es el ahora obtenido desde el servidor a través de API
 * @returns Un objeto ResultadoAcceso indicando si está autorizado y su nivel de acceso.
 */
export async function verificarPermisoGestion(
    usuario: Partial<Usuario>,
    residenciaIdAuth: string,
    llavePermiso: LlavePermisoGestion,
    zonaHoraria: ZonaHorariaIana | null | undefined,
    timestampServidor: any
): Promise<ResultadoAcceso> {
    const roles = usuario.roles || [];
    
    // Roles privilegiados que tienen acceso total en su residencia
    const rolesPrivilegiados: RolUsuario[] = ['admin', 'director'];

    // Rol 'master' tiene acceso universal.
    if (roles.includes('master')) {
        return {
            tieneAcceso: true,
            mensaje: null,
            nivelAcceso: 'Todas',
            error: null };
    }

    // Roles privilegiados ('admin', 'director') tienen acceso si pertenecen a la residencia.
    if (roles.some(r => rolesPrivilegiados.includes(r)) && usuario.residenciaId === residenciaIdAuth) {
        return { tieneAcceso: true, mensaje: null, nivelAcceso: 'Todas', error: null };
    }

    // Lógica para rol 'asistente'
    if (roles.includes('asistente') && usuario.asistente && usuario.residenciaId === residenciaIdAuth) {
        const permisoAsistente = usuario.asistente[llavePermiso];

        if (permisoAsistente){
            if (permisoAsistente.nivelAcceso !== 'Ninguna') {
                // Si no hay restricción de tiempo, el permiso es permanente.
                if (!permisoAsistente.restriccionTiempo) {
                    return {tieneAcceso: true, mensaje: null, nivelAcceso: permisoAsistente.nivelAcceso, error: null};
                }

                // Si hay restricción, se validan las fechas.
                const resultadoIntervalo = EntreFechasResidencia(
                    permisoAsistente.fechaInicio,
                    permisoAsistente.fechaFin,
                    zonaHoraria,
                    timestampServidor
                );

                const estaEnPlazo = resultadoIntervalo === 'dentro';

                if (estaEnPlazo) {
                    return {tieneAcceso: true, mensaje: null, nivelAcceso: permisoAsistente.nivelAcceso, error: null};
                }
            } else {
                return {tieneAcceso: false, mensaje: 'Tu perfil de asistente no tiene este permiso.', nivelAcceso: permisoAsistente.nivelAcceso, error: null};
            }
        }

    }

    // Acceso denegado por defecto
    return { tieneAcceso: false, mensaje: "Acceso denegado por defecto.", nivelAcceso: 'Ninguna', error: "Acceso denegado por defecto." };
}


/**
 * Verifica si un asistente tiene permiso para actuar en nombre de un usuario específico.
 * Revisa la propiedad `usuariosAsistidos` del asistente.
 *
 * @param usuarioAsistente - El objeto completo del usuario con rol 'asistente'.
 * @param idUsuarioAsistido - El ID del usuario sobre el que el asistente quiere actuar.
 * @param zonaHoraria - La zona horaria para la validación de fechas.
 * @param timestampServidor - es el ahora obtenido desde el servidor a través de API
 * @returns Un objeto ResultadoAcceso indicando si está autorizado y su nivel de acceso.
 */
export async function verificarPermisoUsuarioAsistido(
    usuarioAsistente: Usuario,
    idUsuarioAsistido: UsuarioId,
    zonaHoraria: ZonaHorariaIana | null | undefined,
    timestampServidor: any
): Promise<ResultadoAcceso> {
    // Solo aplica a asistentes con la configuración correcta
    if (!usuarioAsistente.roles.includes('asistente') || !usuarioAsistente.asistente?.usuariosAsistidos) {
        return {
            tieneAcceso: false,
            mensaje: 'Verificación Usuarios asistidos: No es un usuario con rol asistente.',
            nivelAcceso: 'Ninguna',
            error: null
        };
    }

    const detallesPermiso = usuarioAsistente.asistente.usuariosAsistidos[idUsuarioAsistido];

    // Si no hay una entrada de permiso para ese usuario, no hay acceso.
    if (!detallesPermiso || detallesPermiso.nivelAcceso === 'Ninguna') {
        return {
            tieneAcceso: false,
            mensaje: 'Tu usuario con rol asistente no tiene permisos para este usuario.',
            nivelAcceso: 'Ninguna',
            error: null
        };
    }

    // Si no hay restricción de tiempo, el permiso es permanente.
    if (!detallesPermiso.restriccionTiempo) {
        return {
            tieneAcceso: true,
            mensaje: null,
            nivelAcceso: detallesPermiso.nivelAcceso,
            error: null
        };
    }

    // Si hay restricción, se validan las fechas.
    const estaEnPlazo = EntreFechasResidencia(
        detallesPermiso.fechaInicio,
        detallesPermiso.fechaFin,
        zonaHoraria,
        timestampServidor
    ) === 'dentro';

    return estaEnPlazo 
      ? {
        tieneAcceso: true,
        mensaje: null,
        nivelAcceso: detallesPermiso.nivelAcceso,
        error: null
      } : {
        tieneAcceso: false,
        mensaje: `Permisos de asistente fuera de las fechas (desde ${detallesPermiso.fechaInicio} hasta ${detallesPermiso.fechaFin})`,
        nivelAcceso: 'Ninguna',
        error: null
      };
}

/**
 * Verifica acceso para funcionalidades donde aplica:
 * - Acceso total para rol 'director' sin más validaciones.
 * - Acceso para rol 'asistente' solo si tiene al menos un usuario asistido.
 *
 * @param usuario - El objeto completo del usuario autenticado.
 * @returns Un objeto ResultadoAcceso indicando si está autorizado.
 */
export function verificarPermisoEleccionesOtros(
    usuario: Usuario
): ResultadoAcceso {
    if (!usuario || !usuario.id || !usuario.roles) {
        return { 
            tieneAcceso: false,
            mensaje: 'Usuario inválido',
            nivelAcceso: 'Ninguna', 
            error: "Usuario no válido" 
        };
    }

    if (usuario.roles.includes('director')) {
        return { 
            tieneAcceso: true,
            mensaje: null,
            nivelAcceso: 'Todas', 
            error: null 
        };
    }

    if (usuario.roles.includes('asistente')) {
        const cantidadUsuariosAsistidos = Object.keys(usuario.asistente?.usuariosAsistidos || {}).length;

        if (cantidadUsuariosAsistidos > 0) {
            return { 
                tieneAcceso: true,
                mensaje: null,
                nivelAcceso: 'Propias', 
                error: null
            };
        } else {
            return {
                tieneAcceso: false,
                mensaje: 'Tu perfil de asistente no tiene permisos de asistencia de usuarios.',
                nivelAcceso: 'Propias',
                error: null
            };
        }
    }

    return {
        tieneAcceso: false,
        mensaje: '',
        nivelAcceso: 'Ninguna',
        error: null
    };
}