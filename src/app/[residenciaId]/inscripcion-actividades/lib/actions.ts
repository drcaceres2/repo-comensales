'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db, FieldValue, Timestamp } from '@/lib/firebaseAdmin';
import { httpsCallable, functions } from '@/lib/firebase';
import { obtenerInfoUsuarioServer } from '@/lib/obtenerInfoUsuarioServer';
import { verificarPermisoUsuarioAsistido } from '@/lib/acceso-privilegiado';
import type { Usuario } from '../../../../../shared/schemas/usuarios';
import type { LogPayload, ResidenciaId } from '../../../../../shared/models/types';

export type EstadoActividadInscripcion =
    | 'pendiente'
    | 'aprobada'
    | 'inscripcion_abierta'
    | 'inscripcion_cerrada'
    | 'finalizada'
    | 'cancelada';

export type EstadoInscripcion =
    | 'invitacion_pendiente'
    | 'confirmada'
    | 'rechazada'
    | 'cancelada_por_usuario'
    | 'cancelada_por_organizador';

export type ActividadInscripcion = {
    id: string;
    titulo: string;
    descripcion?: string;
    lugar?: string;
    estado: EstadoActividadInscripcion;
    visibilidad: 'publica' | 'oculta';
    tipoAcceso: 'abierta' | 'solo_invitacion';
    permiteInvitadosExternos: boolean;
    fechaInicio: string;
    fechaFin: string;
    maxParticipantes: number;
    conteoInscritos: number;
    adicionalesNoNominales: number;
    organizadorId: string;
};

export type InscripcionActividad = {
    id: string;
    actividadId: string;
    usuarioId: string;
    invitadoPorId?: string;
    estado: EstadoInscripcion;
};

export type UsuarioObjetivo = {
    id: string;
    nombre: string;
};

export type UsuarioDirectorioActividad = {
    id: string;
    nombre: string;
    email?: string;
    tieneAutenticacion: boolean;
};

export type DatosInscripcionActividades = {
    actividades: ActividadInscripcion[];
    inscripciones: InscripcionActividad[];
    usuariosObjetivo: UsuarioObjetivo[];
    actor: {
        usuarioId: string;
        roles: string[];
    };
};

type Contexto = {
    usuarioId: string;
    residenciaId: string;
    roles: string[];
    zonaHoraria: string;
    usuariosObjetivo: Set<string>;
};

const estadosConInscripcion = new Set<EstadoActividadInscripcion>([
    'inscripcion_abierta',
    'inscripcion_cerrada',
    'finalizada',
]);

const rolesPrivilegiados = new Set(['master', 'admin', 'director']);

const EstadoInvitacionInputSchema = z.enum(['aceptar', 'rechazar']);

const UsuarioObjetivoInputSchema = z.object({
    usuarioObjetivoId: z.string().min(1),
});

const BulkParticipantesSchema = z.object({
    actividadId: z.string().min(1),
    usuarioIds: z.array(z.string().min(1)).min(1).max(100),
});

const actividadRef = (residenciaId: ResidenciaId, actividadId: string) =>
    db.collection('residencias').doc(residenciaId).collection('actividades').doc(actividadId);

function normalizarEstadoActividad(value: string | undefined): EstadoActividadInscripcion {
    switch (value) {
        case 'borrador':
            return 'pendiente';
        case 'solicitada_administracion':
            return 'finalizada';
        case 'pendiente':
        case 'aprobada':
        case 'inscripcion_abierta':
        case 'inscripcion_cerrada':
        case 'finalizada':
        case 'cancelada':
            return value;
        default:
            return 'pendiente';
    }
}

function normalizarEstadoInscripcion(data: Record<string, unknown>): EstadoInscripcion {
    const estadoNuevo = typeof data.estado === 'string' ? data.estado : '';
    const estadoLegacy = typeof data.estadoInscripcion === 'string' ? data.estadoInscripcion : '';
    const estado = estadoNuevo || estadoLegacy;

    switch (estado) {
        case 'confirmada':
        case 'invitado_aceptado':
        case 'inscrito_directo':
            return 'confirmada';
        case 'invitacion_pendiente':
        case 'invitado_pendiente':
            return 'invitacion_pendiente';
        case 'rechazada':
        case 'invitado_rechazado':
            return 'rechazada';
        case 'cancelada_por_organizador':
        case 'cancelado_admin':
        case 'cancelada':
            return 'cancelada_por_organizador';
        case 'cancelada_por_usuario':
        case 'cancelado_usuario':
            return 'cancelada_por_usuario';
        default:
            return 'cancelada_por_usuario';
    }
}

function normalizarActividad(docId: string, data: Record<string, unknown>): ActividadInscripcion {
    const tituloRaw = typeof data.titulo === 'string' ? data.titulo : typeof data.nombre === 'string' ? data.nombre : 'Actividad';
    return {
        id: docId,
        titulo: tituloRaw,
        descripcion: typeof data.descripcion === 'string' ? data.descripcion : undefined,
        lugar: typeof data.lugar === 'string' ? data.lugar : undefined,
        estado: normalizarEstadoActividad(typeof data.estado === 'string' ? data.estado : undefined),
        visibilidad: data.visibilidad === 'oculta' ? 'oculta' : 'publica',
        tipoAcceso: data.tipoAcceso === 'solo_invitacion' ? 'solo_invitacion' : 'abierta',
        permiteInvitadosExternos: data.permiteInvitadosExternos === true,
        fechaInicio: typeof data.fechaInicio === 'string' ? data.fechaInicio : '',
        fechaFin: typeof data.fechaFin === 'string' ? data.fechaFin : '',
        maxParticipantes: typeof data.maxParticipantes === 'number' ? data.maxParticipantes : 0,
        conteoInscritos: typeof data.conteoInscritos === 'number' ? data.conteoInscritos : 0,
        adicionalesNoNominales: typeof data.adicionalesNoNominales === 'number' ? data.adicionalesNoNominales : 0,
        organizadorId: typeof data.organizadorId === 'string' ? data.organizadorId : '',
    };
}

function esPrivilegiado(roles: string[]) {
    return roles.some((rol) => rolesPrivilegiados.has(rol));
}

async function resolverContexto(residenciaId: ResidenciaId): Promise<{ ok: true; contexto: Contexto } | { ok: false; error: string }> {
    const user = await obtenerInfoUsuarioServer();
    if (!user.usuarioId) {
        return { ok: false, error: 'Usuario no autenticado.' };
    }

    const master = user.roles.includes('master');
    if (!master && user.residenciaId !== residenciaId) {
        return { ok: false, error: 'Acceso no autorizado para la residencia.' };
    }

    const allowedRoles = ['master', 'admin', 'director', 'asistente', 'residente', 'invitado'];
    if (!user.roles.some((rol) => allowedRoles.includes(rol))) {
        return { ok: false, error: 'No tienes permisos para inscripciones de actividades.' };
    }

    const usuariosObjetivo = new Set<string>([user.usuarioId]);

    if (user.roles.includes('asistente')) {
        const userDoc = await db.collection('usuarios').doc(user.usuarioId).get();
        if (userDoc.exists) {
            const usuarioAsistente = userDoc.data() as Usuario;
            const timestampServidor = Timestamp.now();
            const asistidos = Object.keys(usuarioAsistente.asistente?.usuariosAsistidos || {});
            for (const asistidoId of asistidos) {
                const permiso = await verificarPermisoUsuarioAsistido(
                    usuarioAsistente,
                    asistidoId,
                    user.zonaHoraria,
                    timestampServidor
                );
                if (permiso.tieneAcceso) {
                    usuariosObjetivo.add(asistidoId);
                }
            }
        }
    }

    return {
        ok: true,
        contexto: {
            usuarioId: user.usuarioId,
            residenciaId,
            roles: user.roles,
            zonaHoraria: user.zonaHoraria,
            usuariosObjetivo,
        },
    };
}

function puedeGestionarObjetivo(contexto: Contexto, usuarioObjetivoId: string): boolean {
    return contexto.usuariosObjetivo.has(usuarioObjetivoId) || esPrivilegiado(contexto.roles);
}

function puedeForzarMutaciones(contexto: Contexto, actividad: ActividadInscripcion): boolean {
    return actividad.organizadorId === contexto.usuarioId || esPrivilegiado(contexto.roles);
}

async function listarUsuariosObjetivo(usuariosObjetivo: Set<string>): Promise<UsuarioObjetivo[]> {
    const usuarios = await Promise.all(
        Array.from(usuariosObjetivo).map(async (id) => {
            const snap = await db.collection('usuarios').doc(id).get();
            if (!snap.exists) {
                return { id, nombre: id };
            }
            const data = snap.data() as Record<string, unknown>;
            const nombre = [data.nombre, data.apellido].filter(Boolean).join(' ').trim();
            return { id, nombre: nombre || id };
        })
    );

    return usuarios.sort((a, b) => a.nombre.localeCompare(b.nombre));
}

function normalizarUsuarioDirectorio(docId: string, data: Record<string, unknown>): UsuarioDirectorioActividad {
    const nombre = [data.nombre, data.apellido].filter(Boolean).join(' ').trim();
    return {
        id: docId,
        nombre: nombre || docId,
        email: typeof data.email === 'string' ? data.email : undefined,
        tieneAutenticacion: data.tieneAutenticacion === true,
    };
}

export async function obtenerDirectorioUsuarios(
    residenciaId: ResidenciaId
): Promise<{ success: true; data: UsuarioDirectorioActividad[] } | { success: false; error: string }> {
    try {
        const resultado = await resolverContexto(residenciaId);
        if (!resultado.ok) {
            return { success: false, error: resultado.error };
        }

        const usuariosSnap = await db
            .collection('usuarios')
            .where('residenciaId', '==', residenciaId)
            .where('estaActivo', '==', true)
            .limit(800)
            .get();

        const usuarios = usuariosSnap.docs
            .map((doc) => normalizarUsuarioDirectorio(doc.id, doc.data() as Record<string, unknown>))
            .sort((a, b) => a.nombre.localeCompare(b.nombre));

        return { success: true, data: usuarios };
    } catch (error) {
        console.error('Error obteniendo directorio de usuarios:', error);
        return { success: false, error: 'No se pudo cargar el directorio de usuarios.' };
    }
}

async function mutarEstadoInscripcionTransaccional(input: {
    residenciaId: ResidenciaId;
    actividadId: string;
    usuarioObjetivoId: string;
    nuevoEstado: EstadoInscripcion;
    actorId: string;
    exigirActividadAbierta: boolean;
    exigirTipoAbierto: boolean;
    permitirSoloOrganizador: boolean;
    requiereEstadoPrevio?: EstadoInscripcion;
}): Promise<{ success: true } | { success: false; error: string }> {
    try {
        await db.runTransaction(async (transaction) => {
            const aRef = actividadRef(input.residenciaId, input.actividadId);
            const aSnap = await transaction.get(aRef);

            if (!aSnap.exists) {
                throw new Error('Actividad no encontrada.');
            }

            const actividad = normalizarActividad(aSnap.id, aSnap.data() as Record<string, unknown>);
            const organizador = actividad.organizadorId === input.actorId;

            if (input.permitirSoloOrganizador && !organizador) {
                throw new Error('Solo el organizador puede ejecutar esta operacion.');
            }

            if (input.exigirActividadAbierta && !organizador && actividad.estado !== 'inscripcion_abierta') {
                throw new Error('La actividad no esta abierta a inscripciones.');
            }

            if (input.exigirTipoAbierto && !organizador && actividad.tipoAcceso !== 'abierta') {
                throw new Error('La actividad solo permite inscripcion por invitacion.');
            }

            if (actividad.estado === 'cancelada') {
                throw new Error('No puedes modificar inscripciones de una actividad cancelada.');
            }

            const iRef = aRef.collection('inscripciones').doc(input.usuarioObjetivoId);
            const iSnap = await transaction.get(iRef);

            const actualData = (iSnap.exists ? iSnap.data() : null) as Record<string, unknown> | null;
            const estadoActual = actualData ? normalizarEstadoInscripcion(actualData) : null;

            if (input.requiereEstadoPrevio && estadoActual !== input.requiereEstadoPrevio) {
                throw new Error('La inscripcion no esta en el estado esperado para esta operacion.');
            }

            let delta = 0;
            if (estadoActual !== 'confirmada' && input.nuevoEstado === 'confirmada') {
                delta = 1;
            }
            if (estadoActual === 'confirmada' && input.nuevoEstado !== 'confirmada') {
                delta = -1;
            }

            if (delta > 0) {
                const conteo = Number(actividad.conteoInscritos || 0);
                if (actividad.maxParticipantes > 0 && conteo + delta > actividad.maxParticipantes) {
                    throw new Error('No hay cupos disponibles para confirmar la inscripcion.');
                }
            }

            const payload: Record<string, unknown> = {
                residenciaId: input.residenciaId,
                actividadId: input.actividadId,
                usuarioId: input.usuarioObjetivoId,
                estado: input.nuevoEstado,
                timestampModificacion: FieldValue.serverTimestamp(),
            };

            if (!iSnap.exists) {
                payload.timestampCreacion = FieldValue.serverTimestamp();
            }

            if (input.nuevoEstado === 'invitacion_pendiente') {
                payload.invitadoPorId = input.actorId;
            } else if (!actualData?.invitadoPorId) {
                payload.invitadoPorId = input.actorId !== input.usuarioObjetivoId ? input.actorId : FieldValue.delete();
            }

            transaction.set(iRef, payload, { merge: true });

            if (delta !== 0) {
                transaction.update(aRef, {
                    conteoInscritos: FieldValue.increment(delta),
                    timestampModificacion: FieldValue.serverTimestamp(),
                });
            }
        });

        return { success: true };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'No se pudo procesar la inscripcion.',
        };
    }
}

export async function obtenerDatosInscripcionActividades(residenciaId: ResidenciaId): Promise<{ success: true; data: DatosInscripcionActividades } | { success: false; error: string }> {
    try {
        const resultado = await resolverContexto(residenciaId);
        if (!resultado.ok) {
            return { success: false, error: resultado.error };
        }

        const { contexto } = resultado;
        const puedeVerOcultas = contexto.roles.includes('director') || contexto.roles.includes('master') || contexto.roles.includes('admin');

        const actividadesSnap = await db
            .collection('residencias')
            .doc(residenciaId)
            .collection('actividades')
            .orderBy('fechaInicio', 'desc')
            .limit(120)
            .get();

        const actividades: ActividadInscripcion[] = [];
        const inscripciones: InscripcionActividad[] = [];

        for (const doc of actividadesSnap.docs) {
            const actividad = normalizarActividad(doc.id, doc.data() as Record<string, unknown>);
            const insSnap = await doc.ref.collection('inscripciones').get();

            const inscripcionesActividad = insSnap.docs.map((insDoc) => {
                const data = insDoc.data() as Record<string, unknown>;
                const usuarioId =
                    typeof data.usuarioId === 'string'
                        ? data.usuarioId
                        : typeof data.usuarioInscritoId === 'string'
                        ? data.usuarioInscritoId
                        : insDoc.id;
                const invitadoPorId =
                    typeof data.invitadoPorId === 'string'
                        ? data.invitadoPorId
                        : typeof data.invitadoPorUsuarioId === 'string'
                        ? data.invitadoPorUsuarioId
                        : undefined;

                return {
                    id: insDoc.id,
                    actividadId: actividad.id,
                    usuarioId,
                    invitadoPorId,
                    estado: normalizarEstadoInscripcion(data),
                } as InscripcionActividad;
            });

            const inscripcionesRelevantes = inscripcionesActividad.filter(
                (ins) => contexto.usuariosObjetivo.has(ins.usuarioId) || ins.invitadoPorId === contexto.usuarioId
            );

            const visiblePorPolitica = actividad.visibilidad === 'publica' || puedeVerOcultas;
            const visiblePorRelacion = inscripcionesRelevantes.length > 0 || actividad.organizadorId === contexto.usuarioId;

            if (!visiblePorPolitica && !visiblePorRelacion) {
                continue;
            }

            if (!estadosConInscripcion.has(actividad.estado) && inscripcionesRelevantes.length === 0) {
                continue;
            }

            actividades.push(actividad);
            inscripciones.push(...inscripcionesRelevantes);
        }

        const usuariosObjetivo = await listarUsuariosObjetivo(contexto.usuariosObjetivo);

        return {
            success: true,
            data: {
                actividades,
                inscripciones,
                usuariosObjetivo,
                actor: {
                    usuarioId: contexto.usuarioId,
                    roles: contexto.roles,
                },
            },
        };
    } catch (error) {
        console.error('Error obteniendo datos de inscripcion actividades:', error);
        return { success: false, error: 'No se pudo cargar la pantalla de inscripciones.' };
    }
}

export async function autoInscribirse(
    residenciaId: ResidenciaId,
    actividadId: string,
    payload?: { usuarioObjetivoId?: string }
) {
    const resultado = await resolverContexto(residenciaId);
    if (!resultado.ok) {
        return { success: false, error: resultado.error };
    }

    const usuarioObjetivoId = payload?.usuarioObjetivoId || resultado.contexto.usuarioId;
    if (!puedeGestionarObjetivo(resultado.contexto, usuarioObjetivoId)) {
        return { success: false, error: 'No tienes permisos para inscribir a ese usuario.' };
    }

    const res = await mutarEstadoInscripcionTransaccional({
        residenciaId,
        actividadId,
        usuarioObjetivoId,
        nuevoEstado: 'confirmada',
        actorId: resultado.contexto.usuarioId,
        exigirActividadAbierta: true,
        exigirTipoAbierto: true,
        permitirSoloOrganizador: false,
    });

    if (!res.success) {
        return res;
    }

    revalidatePath(`/${residenciaId}/inscripcion-actividades`);
    return { success: true };
}

export async function invitarParticipante(
    residenciaId: ResidenciaId,
    actividadId: string,
    payload: { usuarioObjetivoId: string }
) {
    const parsed = UsuarioObjetivoInputSchema.safeParse(payload);
    if (!parsed.success) {
        return { success: false, error: 'Payload de invitacion invalido.' };
    }

    const resultado = await resolverContexto(residenciaId);
    if (!resultado.ok) {
        return { success: false, error: resultado.error };
    }

    const aSnap = await actividadRef(residenciaId, actividadId).get();
    if (!aSnap.exists) {
        return { success: false, error: 'Actividad no encontrada.' };
    }

    const actividad = normalizarActividad(aSnap.id, aSnap.data() as Record<string, unknown>);
    const organizador = puedeForzarMutaciones(resultado.contexto, actividad);

    if (!organizador && !actividad.permiteInvitadosExternos) {
        return { success: false, error: 'La actividad no permite invitados externos.' };
    }

    if (!organizador && actividad.estado !== 'inscripcion_abierta') {
        return { success: false, error: 'La actividad no admite nuevas invitaciones en este estado.' };
    }

    const res = await mutarEstadoInscripcionTransaccional({
        residenciaId,
        actividadId,
        usuarioObjetivoId: parsed.data.usuarioObjetivoId,
        nuevoEstado: 'invitacion_pendiente',
        actorId: resultado.contexto.usuarioId,
        exigirActividadAbierta: false,
        exigirTipoAbierto: false,
        permitirSoloOrganizador: false,
    });

    if (!res.success) {
        return res;
    }

    revalidatePath(`/${residenciaId}/inscripcion-actividades`);
    return { success: true };
}

export async function responderInvitacion(
    residenciaId: ResidenciaId,
    actividadId: string,
    decision: 'aceptar' | 'rechazar',
    payload?: { usuarioObjetivoId?: string }
) {
    const decisionParse = EstadoInvitacionInputSchema.safeParse(decision);
    if (!decisionParse.success) {
        return { success: false, error: 'Decision invalida.' };
    }

    const resultado = await resolverContexto(residenciaId);
    if (!resultado.ok) {
        return { success: false, error: resultado.error };
    }

    const usuarioObjetivoId = payload?.usuarioObjetivoId || resultado.contexto.usuarioId;
    if (!puedeGestionarObjetivo(resultado.contexto, usuarioObjetivoId)) {
        return { success: false, error: 'No tienes permisos para responder esta invitacion.' };
    }

    const res = await mutarEstadoInscripcionTransaccional({
        residenciaId,
        actividadId,
        usuarioObjetivoId,
        nuevoEstado: decision === 'aceptar' ? 'confirmada' : 'rechazada',
        actorId: resultado.contexto.usuarioId,
        exigirActividadAbierta: false,
        exigirTipoAbierto: false,
        permitirSoloOrganizador: false,
        requiereEstadoPrevio: 'invitacion_pendiente',
    });

    if (!res.success) {
        return res;
    }

    revalidatePath(`/${residenciaId}/inscripcion-actividades`);
    return { success: true };
}

export async function cancelarInscripcion(
    residenciaId: ResidenciaId,
    actividadId: string,
    payload?: { usuarioObjetivoId?: string }
) {
    const resultado = await resolverContexto(residenciaId);
    if (!resultado.ok) {
        return { success: false, error: resultado.error };
    }

    const usuarioObjetivoId = payload?.usuarioObjetivoId || resultado.contexto.usuarioId;
    if (!puedeGestionarObjetivo(resultado.contexto, usuarioObjetivoId)) {
        return { success: false, error: 'No tienes permisos para cancelar esta inscripcion.' };
    }

    const res = await mutarEstadoInscripcionTransaccional({
        residenciaId,
        actividadId,
        usuarioObjetivoId,
        nuevoEstado: 'cancelada_por_usuario',
        actorId: resultado.contexto.usuarioId,
        exigirActividadAbierta: false,
        exigirTipoAbierto: false,
        permitirSoloOrganizador: false,
    });

    if (!res.success) {
        return res;
    }

    revalidatePath(`/${residenciaId}/inscripcion-actividades`);
    return { success: true };
}

export async function forceAddParticipants(
    residenciaId: ResidenciaId,
    payload: { actividadId: string; usuarioIds: string[] }
) {
    const parsed = BulkParticipantesSchema.safeParse(payload);
    if (!parsed.success) {
        return { success: false, error: 'Payload de participantes invalido.' };
    }

    const resultado = await resolverContexto(residenciaId);
    if (!resultado.ok) {
        return { success: false, error: resultado.error };
    }

    const aSnap = await actividadRef(residenciaId, parsed.data.actividadId).get();
    if (!aSnap.exists) {
        return { success: false, error: 'Actividad no encontrada.' };
    }

    const actividad = normalizarActividad(aSnap.id, aSnap.data() as Record<string, unknown>);
    if (!puedeForzarMutaciones(resultado.contexto, actividad)) {
        return { success: false, error: 'Solo organizador/director/admin puede forzar altas.' };
    }

    try {
        await db.runTransaction(async (transaction) => {
            const aRef = actividadRef(residenciaId, parsed.data.actividadId);
            const aFresh = await transaction.get(aRef);
            const actividadFresh = normalizarActividad(aFresh.id, aFresh.data() as Record<string, unknown>);

            let delta = 0;
            const cambios: Array<{ ref: FirebaseFirestore.DocumentReference; estado: EstadoInscripcion }> = [];

            for (const uid of parsed.data.usuarioIds) {
                const iRef = aRef.collection('inscripciones').doc(uid);
                const iSnap = await transaction.get(iRef);
                const actual = iSnap.exists ? normalizarEstadoInscripcion(iSnap.data() as Record<string, unknown>) : null;
                if (actual !== 'confirmada') {
                    delta += 1;
                }
                cambios.push({ ref: iRef, estado: 'confirmada' });
            }

            if (actividadFresh.maxParticipantes > 0 && actividadFresh.conteoInscritos + delta > actividadFresh.maxParticipantes) {
                throw new Error('No hay cupo suficiente para agregar participantes de forma forzada.');
            }

            for (const cambio of cambios) {
                transaction.set(
                    cambio.ref,
                    {
                        residenciaId,
                        actividadId: parsed.data.actividadId,
                        usuarioId: cambio.ref.id,
                        estado: cambio.estado,
                        invitadoPorId: resultado.contexto.usuarioId,
                        timestampCreacion: FieldValue.serverTimestamp(),
                        timestampModificacion: FieldValue.serverTimestamp(),
                    },
                    { merge: true }
                );
            }

            if (delta !== 0) {
                transaction.update(aRef, {
                    conteoInscritos: FieldValue.increment(delta),
                    timestampModificacion: FieldValue.serverTimestamp(),
                });
            }
        });

        const logAction = httpsCallable<LogPayload, { success: boolean }>(functions, 'logActionCallable');
        logAction({
            action: 'ACTIVIDAD_ACTUALIZADA',
            targetId: parsed.data.actividadId,
            targetCollection: `residencias/${residenciaId}/actividades/${parsed.data.actividadId}/inscripciones`,
            residenciaId,
            details: { actor: resultado.contexto.usuarioId, count: parsed.data.usuarioIds.length },
        }).catch((err) => console.error('Error logging ACTIVIDAD_FORCE_ADD_PARTICIPANTS:', err));

        revalidatePath(`/${residenciaId}/inscripcion-actividades`);
        return { success: true };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'No se pudo forzar la inscripcion.',
        };
    }
}

export async function kickParticipant(
    residenciaId: ResidenciaId,
    actividadId: string,
    payload: { usuarioObjetivoId: string }
) {
    const parsed = UsuarioObjetivoInputSchema.safeParse(payload);
    if (!parsed.success) {
        return { success: false, error: 'Payload invalido.' };
    }

    const resultado = await resolverContexto(residenciaId);
    if (!resultado.ok) {
        return { success: false, error: resultado.error };
    }

    const aSnap = await actividadRef(residenciaId, actividadId).get();
    if (!aSnap.exists) {
        return { success: false, error: 'Actividad no encontrada.' };
    }

    const actividad = normalizarActividad(aSnap.id, aSnap.data() as Record<string, unknown>);
    if (!puedeForzarMutaciones(resultado.contexto, actividad)) {
        return { success: false, error: 'Solo organizador/director/admin puede expulsar participantes.' };
    }

    const res = await mutarEstadoInscripcionTransaccional({
        residenciaId,
        actividadId,
        usuarioObjetivoId: parsed.data.usuarioObjetivoId,
        nuevoEstado: 'cancelada_por_organizador',
        actorId: resultado.contexto.usuarioId,
        exigirActividadAbierta: false,
        exigirTipoAbierto: false,
        permitirSoloOrganizador: false,
    });

    if (!res.success) {
        return res;
    }

    const logAction = httpsCallable<LogPayload, { success: boolean }>(functions, 'logActionCallable');
    logAction({
        action: 'ACTIVIDAD_ACTUALIZADA',
        targetId: parsed.data.usuarioObjetivoId,
        targetCollection: `residencias/${residenciaId}/actividades/${actividadId}/inscripciones`,
        residenciaId,
        details: { actor: resultado.contexto.usuarioId, actividadId },
    }).catch((err) => console.error('Error logging ACTIVIDAD_KICK_PARTICIPANT:', err));

    revalidatePath(`/${residenciaId}/inscripcion-actividades`);
    return { success: true };
}
