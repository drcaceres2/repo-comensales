'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db, FieldValue, Timestamp } from '@/lib/firebaseAdmin';
import { httpsCallable, functions } from '@/lib/firebase';
import { obtenerInfoUsuarioServer } from '@/lib/obtenerInfoUsuarioServer';
import {
    verificarPermisoGestionWrapper,
    verificarPermisoUsuarioAsistido,
} from '@/lib/acceso-privilegiado';
import type { Usuario } from 'shared/schemas/usuarios';
import type { TiempoComida } from 'shared/schemas/horarios';
import type { CentroDeCosto } from 'shared/schemas/contabilidad';
import type { ComedorData } from 'shared/schemas/complemento1';
import type { LogPayload, ResidenciaId } from 'shared/models/types';
import { ActividadCreateSchema, ActividadUpdateSchema } from 'shared/schemas/actividades';

export type EstadoActividadGestion =
    | 'pendiente'
    | 'aprobada'
    | 'inscripcion_abierta'
    | 'inscripcion_cerrada'
    | 'finalizada'
    | 'cancelada';

export type EstadoInscripcionGestion =
    | 'invitacion_pendiente'
    | 'confirmada'
    | 'rechazada'
    | 'cancelada_por_usuario'
    | 'cancelada_por_organizador';

export type ActividadGestion = {
    id: string;
    residenciaId: string;
    organizadorId: string;
    titulo: string;
    descripcion?: string;
    lugar?: string;
    estado: EstadoActividadGestion;
    visibilidad: 'publica' | 'oculta';
    tipoAcceso: 'abierta' | 'solo_invitacion';
    permiteInvitadosExternos: boolean;
    fechaInicio: string;
    tiempoComidaInicioId: string;
    fechaFin: string;
    tiempoComidaFinId: string;
    centroCostoId?: string | null;
    avisoAdministracion: 'no_comunicado' | 'comunicacion_previa' | 'comunicacion_definitiva' | 'cancelado';
    maxParticipantes: number;
    conteoInscritos: number;
    adicionalesNoNominales: number;
};

export type InscripcionGestion = {
    id: string;
    actividadId: string;
    usuarioId: string;
    invitadoPorId?: string;
    estado: EstadoInscripcionGestion;
};

type ContextoPermisos = {
    usuarioId: string;
    nivelAcceso: 'Todas' | 'Propias';
    roles: string[];
    zonaHoraria: string;
};

type ResultadoContexto =
    | { ok: true; contexto: ContextoPermisos }
    | { ok: false; error: string };

const EstadoActividadInputSchema = z.enum([
    'pendiente',
    'aprobada',
    'inscripcion_abierta',
    'inscripcion_cerrada',
    'finalizada',
    'cancelada',
]);

// Using shared Zod schemas from `shared/schemas/actividades`:
// `ActividadCreateSchema` and `ActividadUpdateSchema`

const actividadesCollection = (residenciaId: ResidenciaId) =>
    db.collection('residencias').doc(residenciaId).collection('actividades');

const estadosTerminales = new Set<EstadoActividadGestion>(['finalizada', 'cancelada']);

function normalizarEstadoActividad(value: string | undefined): EstadoActividadGestion {
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

function normalizarEstadoInscripcion(data: Record<string, unknown>): EstadoInscripcionGestion {
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
            return 'cancelada_por_organizador';
        case 'cancelada_por_usuario':
        case 'cancelado_usuario':
            return 'cancelada_por_usuario';
        case 'cancelada':
            return 'cancelada_por_organizador';
        default:
            return 'cancelada_por_usuario';
    }
}

function esInscripcionConfirmada(data: Record<string, unknown>): boolean {
    return normalizarEstadoInscripcion(data) === 'confirmada';
}

function normalizarActividadDoc(docId: string, data: Record<string, unknown>, residenciaId: ResidenciaId): ActividadGestion {
    const tituloRaw = typeof data.titulo === 'string' ? data.titulo : typeof data.nombre === 'string' ? data.nombre : 'Actividad';
    const tiempoInicio =
        typeof data.tiempoComidaInicioId === 'string'
            ? data.tiempoComidaInicioId
            : typeof data.tiempoComidaInicial === 'string'
            ? data.tiempoComidaInicial
            : '';
    const tiempoFin =
        typeof data.tiempoComidaFinId === 'string'
            ? data.tiempoComidaFinId
            : typeof data.tiempoComidaFinal === 'string'
            ? data.tiempoComidaFinal
            : '';

    const rawAviso = typeof data.avisoAdministracion === 'string' ? data.avisoAdministracion : undefined;
    const allowedAvisos = new Set([
        'no_comunicado',
        'comunicacion_previa',
        'comunicacion_definitiva',
        'cancelado',
    ] as const);
    const aviso = rawAviso && allowedAvisos.has(rawAviso as any) ? (rawAviso as any) : 'no_comunicado';
    const visibilidad = data.visibilidad === 'oculta' ? 'oculta' : 'publica';
    const tipoAcceso = data.tipoAcceso === 'solo_invitacion' ? 'solo_invitacion' : 'abierta';
    const permiteInvitadosExternos = data.permiteInvitadosExternos === true;
    const adicionalesNoNominales =
        typeof data.adicionalesNoNominales === 'number' && data.adicionalesNoNominales >= 0
            ? data.adicionalesNoNominales
            : 0;

    return {
        id: docId,
        residenciaId,
        organizadorId: typeof data.organizadorId === 'string' ? data.organizadorId : '',
        titulo: tituloRaw,
        descripcion: typeof data.descripcion === 'string' ? data.descripcion : undefined,
        lugar: typeof data.lugar === 'string' ? data.lugar : undefined,
        estado: normalizarEstadoActividad(typeof data.estado === 'string' ? data.estado : undefined),
        visibilidad,
        tipoAcceso,
        permiteInvitadosExternos,
        fechaInicio: typeof data.fechaInicio === 'string' ? data.fechaInicio : '',
        tiempoComidaInicioId: tiempoInicio,
        fechaFin: typeof data.fechaFin === 'string' ? data.fechaFin : '',
        tiempoComidaFinId: tiempoFin,
        centroCostoId: typeof data.centroCostoId === 'string' ? data.centroCostoId : null,
        avisoAdministracion: aviso,
        maxParticipantes: typeof data.maxParticipantes === 'number' ? data.maxParticipantes : 1,
        conteoInscritos: typeof data.conteoInscritos === 'number' ? data.conteoInscritos : 0,
        adicionalesNoNominales,
    };
}

async function validarContextoActividades(residenciaId: ResidenciaId): Promise<ResultadoContexto> {
    const user = await obtenerInfoUsuarioServer();

    if (!user.usuarioId) {
        return { ok: false, error: 'Usuario no autenticado. Inicia sesion de nuevo.' };
    }

    const esMaster = user.roles.includes('master');
    if (!esMaster && user.residenciaId !== residenciaId) {
        return { ok: false, error: 'Acceso no autorizado para la residencia solicitada.' };
    }

    const acceso = await verificarPermisoGestionWrapper('gestionActividades');
    if (acceso.error) {
        return { ok: false, error: acceso.error };
    }

    if (!acceso.tieneAcceso || acceso.nivelAcceso === 'Ninguna') {
        return { ok: false, error: 'No tienes permisos para gestionar actividades.' };
    }

    return {
        ok: true,
        contexto: {
            usuarioId: user.usuarioId,
            nivelAcceso: acceso.nivelAcceso,
            roles: user.roles,
            zonaHoraria: user.zonaHoraria,
        },
    };
}

async function obtenerUsuariosAsistidosPermitidos(contexto: ContextoPermisos): Promise<Set<string> | null> {
    if (!contexto.roles.includes('asistente')) {
        return null;
    }

    const userDoc = await db.collection('usuarios').doc(contexto.usuarioId).get();
    if (!userDoc.exists) {
        return new Set([contexto.usuarioId]);
    }

    const usuario = userDoc.data() as Usuario;
    const asistidos = Object.keys(usuario.asistente?.usuariosAsistidos || {});
    const permitidos = new Set<string>([contexto.usuarioId]);
    const timestampServidor = Timestamp.now();

    for (const asistidoId of asistidos) {
        const permiso = await verificarPermisoUsuarioAsistido(
            usuario,
            asistidoId,
            contexto.zonaHoraria,
            timestampServidor
        );

        if (permiso.tieneAcceso) {
            permitidos.add(asistidoId);
        }
    }

    return permitidos;
}

async function obtenerEsquemaSemanal(residenciaId: ResidenciaId) {
    const configRef = db.collection('residencias').doc(residenciaId).collection('configuracion').doc('general');
    const configSnap = await configRef.get();
    if (!configSnap.exists) {
        throw new Error('Configuracion de la residencia no encontrada.');
    }
    const configData = configSnap.data() || {};
    return {
        esquemaSemanal: (configData.esquemaSemanal || {}) as Record<string, TiempoComida>,
        comedores: (configData.comedores || {}) as Record<string, ComedorData>,
        gruposComidas: (configData.gruposComidas || {}) as Record<string, { nombre?: string; orden?: number; estaActivo?: boolean }>,
    };
}

function extraerPesoTiempoComida(tiempo: TiempoComida, gruposComidas?: Record<string, { orden?: number }>): number {
    // Determine numeric group order. `tiempo.grupoComida` can be a slug string
    // that should map to `gruposComidas[slug].orden`, or a numeric-like value.
    let grupoNum = 0;
    const rawGrupo = (tiempo as any).grupoComida;
    if (typeof rawGrupo === 'number') {
        grupoNum = Number(rawGrupo);
    } else if (typeof rawGrupo === 'string') {
        if (gruposComidas && gruposComidas[rawGrupo] && typeof gruposComidas[rawGrupo].orden === 'number') {
            grupoNum = gruposComidas[rawGrupo].orden as number;
        } else {
            const maybe = Number(rawGrupo);
            grupoNum = Number.isFinite(maybe) ? maybe : 0;
        }
    }

    const horaRef =
        typeof (tiempo as any).horaEstimada === 'string'
            ? (tiempo as any).horaEstimada
            : typeof (tiempo as any).hora === 'string'
            ? (tiempo as any).hora
            : '00:00';

    const [h, m] = horaRef.split(':').map((v: string) => Number(v || 0));
    return grupoNum * 100000 + h * 60 + m;
}

function validarFronteras(
    actividad: { fechaInicio: string; tiempoComidaInicioId: string; fechaFin: string; tiempoComidaFinId: string },
    esquemaSemanal: Record<string, TiempoComida>,
    gruposComidas?: Record<string, { orden?: number }>
) {
    const tiempoInicio = esquemaSemanal[actividad.tiempoComidaInicioId];
    if (!tiempoInicio) {
        return { valid: false, field: 'tiempoComidaInicioId', message: 'El tiempo de comida inicial no existe.' };
    }

    const tiempoFin = esquemaSemanal[actividad.tiempoComidaFinId];
    if (!tiempoFin) {
        return { valid: false, field: 'tiempoComidaFinId', message: 'El tiempo de comida final no existe.' };
    }

    const inicio = Date.parse(`${actividad.fechaInicio}T00:00:00Z`) + extraerPesoTiempoComida(tiempoInicio, gruposComidas);
    const fin = Date.parse(`${actividad.fechaFin}T00:00:00Z`) + extraerPesoTiempoComida(tiempoFin, gruposComidas);

    if (!Number.isFinite(inicio) || !Number.isFinite(fin) || inicio >= fin) {
        return {
            valid: false,
            field: 'fechaFin',
            message: 'Las fronteras cronologicas son invalidas. Debe cumplirse inicio < fin.',
        };
    }

    return { valid: true };
}

async function purgarInscripcionesYAuditar(
    residenciaId: ResidenciaId,
    actividadId: string,
    usuarioQueModifico: string
) {
    const actividadRef = actividadesCollection(residenciaId).doc(actividadId);
    const snap = await actividadRef.collection('inscripciones').get();

    const usuariosPurgados: string[] = [];
    let batch = db.batch();
    let count = 0;

    for (const doc of snap.docs) {
        const data = doc.data() as Record<string, unknown>;
        const usuarioId =
            typeof data.usuarioId === 'string'
                ? data.usuarioId
                : typeof data.usuarioInscritoId === 'string'
                ? data.usuarioInscritoId
                : '';
        if (usuarioId) {
            usuariosPurgados.push(usuarioId);
        }

        batch.delete(doc.ref);
        count += 1;

        if (count === 500) {
            await batch.commit();
            batch = db.batch();
            count = 0;
        }
    }

    if (count > 0) {
        await batch.commit();
    }

    await actividadRef.update({
        conteoInscritos: 0,
        timestampModificacion: FieldValue.serverTimestamp(),
        fechaHoraModificacion: FieldValue.serverTimestamp(),
    });

    await db.collection('auditoria').add({
        tipo: 'ACTIVIDAD_RESETEO_DESTRUCTIVO',
        residenciaId,
        actividadId,
        usuarioQueModifico,
        listaDeUsuariosPurgados: usuariosPurgados,
        timestamp: FieldValue.serverTimestamp(),
    });
}

export async function obtenerDatosInicialesGestionActividades(residenciaId: ResidenciaId) {
    try {
        const resultadoContexto = await validarContextoActividades(residenciaId);
        if (!resultadoContexto.ok) {
            return { success: false, error: resultadoContexto.error };
        }

        const { contexto } = resultadoContexto;
        const permitidosAsistente = await obtenerUsuariosAsistidosPermitidos(contexto);

        let actividadesQuery: FirebaseFirestore.Query = actividadesCollection(residenciaId).orderBy('fechaInicio', 'desc');
        if (contexto.nivelAcceso === 'Propias') {
            actividadesQuery = actividadesQuery.where('organizadorId', '==', contexto.usuarioId);
        }

        const [actividadesSnap, centrosSnap, config] = await Promise.all([
            actividadesQuery.get(),
            db.collection('residencias').doc(residenciaId).collection('centrosDeCosto').get(),
            obtenerEsquemaSemanal(residenciaId),
        ]);

        const actividades = actividadesSnap.docs.map((doc) =>
            normalizarActividadDoc(doc.id, doc.data() as Record<string, unknown>, residenciaId)
        );

        const inscripcionesAgrupadas = await Promise.all(
            actividades.map(async (actividad) => {
                const snap = await actividadesCollection(residenciaId)
                    .doc(actividad.id)
                    .collection('inscripciones')
                    .get();

                return snap.docs.map((insDoc) => {
                    const data = insDoc.data() as Record<string, unknown>;
                    const usuarioId =
                        typeof data.usuarioId === 'string'
                            ? data.usuarioId
                            : typeof data.usuarioInscritoId === 'string'
                            ? data.usuarioInscritoId
                            : '';

                    return {
                        id: insDoc.id,
                        actividadId: actividad.id,
                        usuarioId,
                        invitadoPorId:
                            typeof data.invitadoPorId === 'string'
                                ? data.invitadoPorId
                                : typeof data.invitadoPorUsuarioId === 'string'
                                ? data.invitadoPorUsuarioId
                                : undefined,
                        estado: normalizarEstadoInscripcion(data),
                    } as InscripcionGestion;
                });
            })
        );

        let inscripciones = inscripcionesAgrupadas.flat();
        if (permitidosAsistente) {
            inscripciones = inscripciones.filter((ins) => permitidosAsistente.has(ins.usuarioId));
        }

        const conteosConfirmados = new Map<string, number>();
        for (const ins of inscripciones) {
            if (ins.estado !== 'confirmada') {
                continue;
            }
            conteosConfirmados.set(ins.actividadId, (conteosConfirmados.get(ins.actividadId) || 0) + 1);
        }

        const actividadesConConteo = actividades.map((actividad) => ({
            ...actividad,
            conteoInscritos: conteosConfirmados.get(actividad.id) || 0,
        }));

        const puedeVerOcultas = contexto.roles.includes('director') || contexto.roles.includes('master');
        const actividadesVisibles = actividadesConConteo.filter(
            (actividad) => actividad.visibilidad === 'publica' || puedeVerOcultas
        );
        const idsActividadesVisibles = new Set(actividadesVisibles.map((actividad) => actividad.id));
        const inscripcionesVisibles = inscripciones.filter((inscripcion) =>
            idsActividadesVisibles.has(inscripcion.actividadId)
        );

        const centroCostos = centrosSnap.docs
            .map((snap) => snap.data() as CentroDeCosto)
            .filter((centroCosto) => centroCosto.estaActivo);

        const tiemposComida = Object.entries(config.esquemaSemanal)
            .map(([id, data]) => ({ id, ...data }));

        const comedores = Object.entries(config.comedores).map(([id, data]) => ({ id, ...data }));

        const gruposComidas = Object.entries(config.gruposComidas || {}).map(([id, data]) => ({ id, ...data }));

        return {
            success: true,
            data: {
                actividades: actividadesVisibles,
                inscripciones: inscripcionesVisibles,
                centroCostos,
                tiemposComida,
                comedores,
                gruposComidas,
            },
        };
    } catch (error) {
        console.error('Error obteniendo datos iniciales de actividades:', error);
        return { success: false, error: 'No se pudo cargar la pantalla de actividades.' };
    }
}

export async function createActividad(residenciaId: ResidenciaId, data: unknown) {
    try {
        const resultadoContexto = await validarContextoActividades(residenciaId);
        if (!resultadoContexto.ok) {
            return { success: false, error: resultadoContexto.error };
        }

        const parsed = ActividadCreateSchema.safeParse(data);
        if (!parsed.success) {
            return { success: false, error: parsed.error.flatten() };
        }

        const config = await obtenerEsquemaSemanal(residenciaId);
        const validacion = validarFronteras(parsed.data, config.esquemaSemanal, config.gruposComidas);
        if (!validacion.valid) {
            const fieldKey = validacion.field || 'fechaFin';
            return {
                success: false,
                error: { fieldErrors: { [fieldKey]: [validacion.message] } },
            };
        }

        const payload = {
            residenciaId,
            organizadorId: resultadoContexto.contexto.usuarioId,
            titulo: parsed.data.titulo,
            descripcion: parsed.data.descripcion || null,
            lugar: parsed.data.lugar || null,
            estado: 'pendiente',
            visibilidad: parsed.data.visibilidad,
            tipoAcceso: parsed.data.tipoAcceso,
            permiteInvitadosExternos: parsed.data.permiteInvitadosExternos,
            fechaInicio: parsed.data.fechaInicio,
            fechaFin: parsed.data.fechaFin,
            tiempoComidaInicioId: parsed.data.tiempoComidaInicioId,
            tiempoComidaFinId: parsed.data.tiempoComidaFinId,
            centroCostoId: parsed.data.centroCostoId || null,
            avisoAdministracion: 'no_comunicado',
            maxParticipantes: parsed.data.maxParticipantes,
            conteoInscritos: 0,
            adicionalesNoNominales: parsed.data.adicionalesNoNominales,
            timestampCreacion: FieldValue.serverTimestamp(),
            timestampModificacion: FieldValue.serverTimestamp(),
        };

        const docRef = await actividadesCollection(residenciaId).add(payload);

        const logAction = httpsCallable<LogPayload, { success: boolean }>(functions, 'logActionCallable');
        logAction({
            action: 'ACTIVIDAD_CREADA',
            targetId: docRef.id,
            targetCollection: `residencias/${residenciaId}/actividades`,
            residenciaId,
            details: { titulo: parsed.data.titulo, estado: 'pendiente' },
        }).catch((err) => console.error('Error logging ACTIVIDAD_CREADA:', err));

        // Remove non-serializable sentinel values (FieldValue) before returning to client
        const safePayload: Record<string, unknown> = { ...payload };
        delete (safePayload as any).timestampCreacion;
        delete (safePayload as any).timestampModificacion;

        revalidatePath(`/${residenciaId}/gerencia/actividades`);
        return { success: true, data: { id: docRef.id, ...safePayload } };
    } catch (error) {
        console.error('Error creando actividad:', error);
        return { success: false, error: 'No se pudo crear la actividad.' };
    }
}

export async function updateActividad(actividadId: string, residenciaId: ResidenciaId, data: unknown) {
    try {
        const resultadoContexto = await validarContextoActividades(residenciaId);
        if (!resultadoContexto.ok) {
            return { success: false, error: resultadoContexto.error };
        }

        const actividadRef = actividadesCollection(residenciaId).doc(actividadId);
        const actividadSnap = await actividadRef.get();
        if (!actividadSnap.exists) {
            return { success: false, error: 'Actividad no encontrada.' };
        }

        const actividadActual = normalizarActividadDoc(
            actividadId,
            actividadSnap.data() as Record<string, unknown>,
            residenciaId
        );

        if (
            resultadoContexto.contexto.nivelAcceso === 'Propias' &&
            actividadActual.organizadorId !== resultadoContexto.contexto.usuarioId
        ) {
            return { success: false, error: 'No puedes editar actividades creadas por otros usuarios.' };
        }

        const parsed = ActividadUpdateSchema.safeParse(data);
        if (!parsed.success) {
            return { success: false, error: parsed.error.flatten() };
        }

        const mergeFronteras = {
            fechaInicio: parsed.data.fechaInicio ?? actividadActual.fechaInicio,
            tiempoComidaInicioId: parsed.data.tiempoComidaInicioId ?? actividadActual.tiempoComidaInicioId,
            fechaFin: parsed.data.fechaFin ?? actividadActual.fechaFin,
            tiempoComidaFinId: parsed.data.tiempoComidaFinId ?? actividadActual.tiempoComidaFinId,
        };

        const config = await obtenerEsquemaSemanal(residenciaId);
        const validacion = validarFronteras(mergeFronteras, config.esquemaSemanal, config.gruposComidas);
        if (!validacion.valid) {
            const fieldKey = validacion.field || 'fechaFin';
            return {
                success: false,
                error: { fieldErrors: { [fieldKey]: [validacion.message] } },
            };
        }

        const cambiosCriticos =
            (parsed.data.fechaInicio && parsed.data.fechaInicio !== actividadActual.fechaInicio) ||
            (parsed.data.fechaFin && parsed.data.fechaFin !== actividadActual.fechaFin) ||
            (parsed.data.tiempoComidaInicioId && parsed.data.tiempoComidaInicioId !== actividadActual.tiempoComidaInicioId) ||
            (parsed.data.tiempoComidaFinId && parsed.data.tiempoComidaFinId !== actividadActual.tiempoComidaFinId) ||
            (parsed.data.centroCostoId !== undefined && parsed.data.centroCostoId !== actividadActual.centroCostoId);

        if (parsed.data.adicionalesNoNominales !== undefined && estadosTerminales.has(actividadActual.estado)) {
            return {
                success: false,
                error: 'No puedes modificar adicionales no nominales en actividades finalizadas o canceladas.',
            };
        }

        if (cambiosCriticos && estadosTerminales.has(actividadActual.estado)) {
            return {
                success: false,
                error: 'No puedes modificar campos criticos en actividades finalizadas o canceladas.',
            };
        }

        if (cambiosCriticos && actividadActual.estado !== 'pendiente') {
            await purgarInscripcionesYAuditar(residenciaId, actividadId, resultadoContexto.contexto.usuarioId);
        }

        const updatePayload: Record<string, unknown> = {
            timestampModificacion: FieldValue.serverTimestamp(),
        };

        if (parsed.data.titulo !== undefined) {
            updatePayload.titulo = parsed.data.titulo;
        }
        if (parsed.data.descripcion !== undefined) {
            updatePayload.descripcion = parsed.data.descripcion || null;
        }
        if (parsed.data.lugar !== undefined) {
            updatePayload.lugar = parsed.data.lugar || null;
        }
        if (parsed.data.visibilidad !== undefined) {
            updatePayload.visibilidad = parsed.data.visibilidad;
        }
        if (parsed.data.tipoAcceso !== undefined) {
            updatePayload.tipoAcceso = parsed.data.tipoAcceso;
        }
        if (parsed.data.permiteInvitadosExternos !== undefined) {
            updatePayload.permiteInvitadosExternos = parsed.data.permiteInvitadosExternos;
        }
        if (parsed.data.fechaInicio !== undefined) {
            updatePayload.fechaInicio = parsed.data.fechaInicio;
        }
        if (parsed.data.fechaFin !== undefined) {
            updatePayload.fechaFin = parsed.data.fechaFin;
        }
        if (parsed.data.tiempoComidaInicioId !== undefined) {
            updatePayload.tiempoComidaInicioId = parsed.data.tiempoComidaInicioId;
        }
        if (parsed.data.tiempoComidaFinId !== undefined) {
            updatePayload.tiempoComidaFinId = parsed.data.tiempoComidaFinId;
        }
        if (parsed.data.centroCostoId !== undefined) {
            updatePayload.centroCostoId = parsed.data.centroCostoId || null;
        }
        if (parsed.data.maxParticipantes !== undefined) {
            updatePayload.maxParticipantes = parsed.data.maxParticipantes;
        }
        if (parsed.data.adicionalesNoNominales !== undefined) {
            updatePayload.adicionalesNoNominales = parsed.data.adicionalesNoNominales;
        }
        // `avisoAdministracion` is managed by the "solicitud consolidada" module and
        // must not be overwritten from this endpoint. Do not copy any client-provided
        // `solicitudAdministracion`/`avisoAdministracion` values into the update payload.

        await actividadRef.update(updatePayload);

        const logAction = httpsCallable<LogPayload, { success: boolean }>(functions, 'logActionCallable');
        logAction({
            action: 'ACTIVIDAD_ACTUALIZADA',
            targetId: actividadId,
            targetCollection: `residencias/${residenciaId}/actividades`,
            residenciaId,
            details: { cambiosCriticos, cambios: Object.keys(updatePayload) },
        }).catch((err) => console.error('Error logging ACTIVIDAD_ACTUALIZADA:', err));

        revalidatePath(`/${residenciaId}/gerencia/actividades`);
        return { success: true };
    } catch (error) {
        console.error('Error actualizando actividad:', error);
        return { success: false, error: 'No se pudo actualizar la actividad.' };
    }
}

export async function updateActividadEstado(
    actividadId: string,
    residenciaId: ResidenciaId,
    nuevoEstado: EstadoActividadGestion
) {
    try {
        const resultadoContexto = await validarContextoActividades(residenciaId);
        if (!resultadoContexto.ok) {
            return { success: false, error: resultadoContexto.error };
        }

        const parsed = EstadoActividadInputSchema.safeParse(nuevoEstado);
        if (!parsed.success) {
            return { success: false, error: parsed.error.flatten() };
        }

        const actividadRef = actividadesCollection(residenciaId).doc(actividadId);
        const actividadSnap = await actividadRef.get();
        if (!actividadSnap.exists) {
            return { success: false, error: 'La actividad no existe.' };
        }

        const actividadActual = normalizarActividadDoc(
            actividadId,
            actividadSnap.data() as Record<string, unknown>,
            residenciaId
        );

        if (
            resultadoContexto.contexto.nivelAcceso === 'Propias' &&
            actividadActual.organizadorId !== resultadoContexto.contexto.usuarioId
        ) {
            return { success: false, error: 'No puedes cambiar estado en actividades creadas por otros usuarios.' };
        }

        const allowed: Record<EstadoActividadGestion, EstadoActividadGestion[]> = {
            pendiente: ['aprobada', 'cancelada'],
            aprobada: ['inscripcion_abierta', 'cancelada'],
            inscripcion_abierta: ['inscripcion_cerrada', 'cancelada'],
            inscripcion_cerrada: ['finalizada', 'cancelada'],
            finalizada: [],
            cancelada: [],
        };

        if (actividadActual.estado === nuevoEstado) {
            return { success: true };
        }

        if (!allowed[actividadActual.estado].includes(nuevoEstado)) {
            return {
                success: false,
                error: `Transicion invalida: ${actividadActual.estado} -> ${nuevoEstado}.`,
            };
        }

        if (nuevoEstado === 'inscripcion_cerrada' || nuevoEstado === 'finalizada') {
            const inscripcionesSnap = await actividadRef.collection('inscripciones').get();
            const hayConfirmadas = inscripcionesSnap.docs.some((doc) =>
                esInscripcionConfirmada(doc.data() as Record<string, unknown>)
            );
            if (!hayConfirmadas) {
                return {
                    success: false,
                    error: 'Debe haber al menos una inscripcion confirmada para cerrar o finalizar la actividad.',
                };
            }
        }

        const batch = db.batch();
        if (nuevoEstado === 'cancelada') {
            const inscripcionesSnap = await actividadRef.collection('inscripciones').get();
            for (const ins of inscripcionesSnap.docs) {
                batch.update(ins.ref, {
                    estado: 'cancelada_por_organizador',
                    estadoInscripcion: 'cancelado_admin',
                    timestampModificacion: FieldValue.serverTimestamp(),
                    fechaHoraModificacion: FieldValue.serverTimestamp(),
                });
            }
        }

        batch.update(actividadRef, {
            estado: nuevoEstado,
            timestampModificacion: FieldValue.serverTimestamp(),
            fechaHoraModificacion: FieldValue.serverTimestamp(),
        });

        await batch.commit();

        const logAction = httpsCallable<LogPayload, { success: boolean }>(functions, 'logActionCallable');
        logAction({
            action: 'ACTIVIDAD_ACTUALIZADA',
            targetId: actividadId,
            targetCollection: `residencias/${residenciaId}/actividades`,
            residenciaId,
            details: { oldState: actividadActual.estado, newState: nuevoEstado },
        }).catch((err) => console.error('Error logging ACTIVIDAD_ACTUALIZADA (estado):', err));

        revalidatePath(`/${residenciaId}/gerencia/actividades`);
        return { success: true };
    } catch (error) {
        console.error('Error actualizando estado de actividad:', error);
        return { success: false, error: 'No se pudo actualizar el estado de la actividad.' };
    }
}