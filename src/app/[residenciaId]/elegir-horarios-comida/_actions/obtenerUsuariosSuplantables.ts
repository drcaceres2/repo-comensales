"use server";

import { UsuarioSuplantableUI } from 'shared/schemas/elecciones/ui.schema';
import { Usuario } from 'shared/schemas/usuarios';
import { ActionResponse, RolUsuario } from 'shared/models/types';
import { obtenerInfoUsuarioServer } from '@/lib/obtenerInfoUsuarioServer';
import { db } from '@/lib/firebaseAdmin';
import { verificarCoherenciaRoles } from 'shared/utils/commonUtils';
import { verificarPermisoEleccionesOtros } from '@/lib/acceso-privilegiado'

export async function obtenerUsuariosSuplantables(
  residenciaId: string
): Promise<ActionResponse<UsuarioSuplantableUI[]>> {
    const infoSesion = await obtenerInfoUsuarioServer();
    if (!infoSesion || !infoSesion.usuarioId || !infoSesion.residenciaId) {
      return {
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'No autorizado para esta residencia.',
        }
      };
    }

    const rolesPermisoPropio: RolUsuario[] = ['residente','invitado'];
    const rolesPermisoOtros: RolUsuario[] = ['director', 'asistente'];

    if(!rolesPermisoPropio.concat(rolesPermisoOtros).some(rol => infoSesion.roles.includes(rol))) {
        return {
            success: false,
            error: {
                code: 'UNAUTHORIZED',
                message: 'No autorizado para esta residencia.'
            }
        };
    }
    const { sonCoherentes, error } = verificarCoherenciaRoles(infoSesion.roles);
    if (error || !sonCoherentes) {
        return {
            success: false,
            error: {
                code: 'INTERNAL',
                message: 'Error al procesar los roles del usuario.'
            }
        };
    }
    const tienePermisoPropio = rolesPermisoPropio.some((rol) => infoSesion.roles.includes(rol));
    const esDirector = infoSesion.roles.includes('director');
    const esAsistente = infoSesion.roles.includes('asistente');

    let usuariosConsulta: Usuario[] = [];

    if (esDirector) {
        const snapUsuariosDirector = await db
            .collection('usuarios')
            .where('residenciaId', '==', residenciaId)
            .where('roles', 'array-contains-any', ['residente', 'invitado'])
            .get();
        usuariosConsulta = snapUsuariosDirector.docs.map((doc) => doc.data() as Usuario);
    } else if (tienePermisoPropio && !esAsistente) {
        const snapUsuarioSesion = await db.collection('usuarios').doc(infoSesion.usuarioId).get();
        if (!snapUsuarioSesion.exists) {
            return {
                success: false,
                error: {
                    code: 'INTERNAL',
                    message: 'No se pudo obtener información del usuario.'
                }
            };
        }

        const usuarioSesion = snapUsuarioSesion.data() as Usuario;
        if (usuarioSesion.residenciaId === residenciaId) {
            usuariosConsulta = [usuarioSesion];
        }
    } else if (esAsistente) {
        try {
            const snapAsistente = await db.collection('asistentes').doc(infoSesion.usuarioId).get();
            if (!snapAsistente.exists) {
                return {
                    success: false,
                    error: {
                        code: 'INTERNAL',
                        message: 'No se pudo obtener información del usuario asistente.'
                    }
                };
            }

            const usuarioAsistente = snapAsistente.data() as Usuario;
            const verificacion = verificarPermisoEleccionesOtros(usuarioAsistente);
            const idsPermitidos = new Set<string>();

            if (!verificacion.error && verificacion.tieneAcceso && usuarioAsistente.asistente) {
                Object.keys(usuarioAsistente.asistente.usuariosAsistidos).forEach((id) => idsPermitidos.add(id));
            }

            if (tienePermisoPropio) {
                idsPermitidos.add(infoSesion.usuarioId);
            }

            if (idsPermitidos.size === 0) {
                return {
                    success: true,
                    data: []
                };
            }

            const ids = Array.from(idsPermitidos);
            const chunks: string[][] = [];
            for (let i = 0; i < ids.length; i += 30) {
                chunks.push(ids.slice(i, i + 30));
            }

            const snapsUsuarios = await Promise.all(
                chunks.map((chunk) =>
                    db
                        .collection('usuarios')
                        .where('residenciaId', '==', residenciaId)
                        .where('id', 'in', chunk)
                        .get()
                )
            );

            usuariosConsulta = snapsUsuarios.flatMap((snap) => snap.docs.map((doc) => doc.data() as Usuario));
        } catch {
            return {
                success: false,
                error: {
                    code: 'INTERNAL',
                    message: 'Problema al consultar base de datos.'
                }
            };
        }
    }

    usuariosConsulta = usuariosConsulta.filter(
        (usuario) => (tienePermisoPropio || usuario.id !== infoSesion.usuarioId) && usuario.estaActivo
    );

    const usuariosSuplantablesUI: UsuarioSuplantableUI[] = usuariosConsulta.map(usuario => ({
        residenciaId: usuario.residenciaId,
        id: usuario.id,
        roles: usuario.roles,
        tieneAutenticacion: usuario.tieneAutenticacion,
        nombre: usuario.nombre,
        apellido: usuario.apellido,
        nombreCorto: usuario.nombreCorto,
        email: usuario.email,
        estaActivo: usuario.estaActivo,
        residente: usuario.residente,
        asistente: usuario.asistente
    }));
    return {
        success: true,
        data: usuariosSuplantablesUI
    }
}