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
import type { LogPayload, ResidenciaId } from '@/../shared/models/types';

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
    | 'cancelada';

export type ActividadGestion = {
    id: string;
    residenciaId: string;
    organizadorId: string;
    titulo: string;
    descripcion?: string;
    lugar?: string;
    estado: EstadoActividadGestion;
    fechaInicio: string;
    tiempoComidaInicioId: string;
    fechaFin: string;
    tiempoComidaFinId: string;
    centroCostoId?: string | null;
    solicitudAdministracion: 'ninguna' | 'solicitud_unica' | 'diario';
    maxParticipantes: number;
    conteoInscritos: number;
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

const ActividadCrearSchema = z.object({
    titulo: z.string().min(3),
    descripcion: z.string().optional(),
    lugar: z.string().optional(),
    fechaInicio: z.string(),
    tiempoComidaInicioId: z.string().min(1),
    fechaFin: z.string(),
    tiempoComidaFinId: z.string().min(1),
    centroCostoId: z.string().nullable().optional(),
    solicitudAdministracion: z.enum(['ninguna', 'solicitud_unica', 'diario']).default('solicitud_unica'),
    maxParticipantes: z.number().int().positive(),
});

const ActividadActualizarSchema = ActividadCrearSchema.partial();

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
        default:
            return 'cancelada';
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

    const solicitud = typeof data.solicitudAdministracion === 'string' ? data.solicitudAdministracion : data.tipoSolicitudComidas;

    return {
        id: docId,
        residenciaId,
        organizadorId: typeof data.organizadorId === 'string' ? data.organizadorId : '',
        titulo: tituloRaw,
        descripcion: typeof data.descripcion === 'string' ? data.descripcion : undefined,
        lugar: typeof data.lugar === 'string' ? data.lugar : undefined,
        estado: normalizarEstadoActividad(typeof data.estado === 'string' ? data.estado : undefined),
        fechaInicio: typeof data.fechaInicio === 'string' ? data.fechaInicio : '',
        tiempoComidaInicioId: tiempoInicio,
        fechaFin: typeof data.fechaFin === 'string' ? data.fechaFin : '',
        tiempoComidaFinId: tiempoFin,
        centroCostoId: typeof data.centroCostoId === 'string' ? data.centroCostoId : null,
        solicitudAdministracion:
            solicitud === 'diario' || solicitud === 'solicitud_unica' || solicitud === 'ninguna'
                ? solicitud
                : 'solicitud_unica',
        maxParticipantes: typeof data.maxParticipantes === 'number' ? data.maxParticipantes : 1,
        conteoInscritos: typeof data.conteoInscritos === 'number' ? data.conteoInscritos : 0,
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
    };
}

function extraerPesoTiempoComida(tiempo: TiempoComida): number {
    const grupo = Number(tiempo.grupoComida || 0);
    const horaRef =
        typeof (tiempo as any).horaEstimada === 'string'
            ? (tiempo as any).horaEstimada
            : typeof (tiempo as any).hora === 'string'
            ? (tiempo as any).hora
            : '00:00';

    const [h, m] = horaRef.split(':').map((v: string) => Number(v || 0));
    return grupo * 1000 + h * 60 + m;
}

function validarFronteras(
    actividad: { fechaInicio: string; tiempoComidaInicioId: string; fechaFin: string; tiempoComidaFinId: string },
    esquemaSemanal: Record<string, TiempoComida>
) {
    const tiempoInicio = esquemaSemanal[actividad.tiempoComidaInicioId];
    if (!tiempoInicio) {
        return { valid: false, field: 'tiempoComidaInicioId', message: 'El tiempo de comida inicial no existe.' };
    }

    const tiempoFin = esquemaSemanal[actividad.tiempoComidaFinId];
    if (!tiempoFin) {
        return { valid: false, field: 'tiempoComidaFinId', message: 'El tiempo de comida final no existe.' };
    }

    const inicio = Date.parse(`${actividad.fechaInicio}T00:00:00Z`) + extraerPesoTiempoComida(tiempoInicio);
    const fin = Date.parse(`${actividad.fechaFin}T00:00:00Z`) + extraerPesoTiempoComida(tiempoFin);

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

function mapSolicitudToLegacy(solicitud: 'ninguna' | 'solicitud_unica' | 'diario') {
    if (solicitud === 'diario') {
        return 'solicitud_diaria';
    }
    return solicitud;
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

        const centroCostos = centrosSnap.docs
            .map((snap) => snap.data() as CentroDeCosto)
            .filter((centroCosto) => centroCosto.estaActivo);

        const tiemposComida = Object.entries(config.esquemaSemanal)
            .map(([id, data]) => ({ id, ...data }))
            .sort((a, b) => Number(a.grupoComida || 0) - Number(b.grupoComida || 0));

        const comedores = Object.entries(config.comedores).map(([id, data]) => ({ id, ...data }));

        return {
            success: true,
            data: {
                actividades: actividadesConConteo,
                inscripciones,
                centroCostos,
                tiemposComida,
                comedores,
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

        const parsed = ActividadCrearSchema.safeParse(data);
        if (!parsed.success) {
            return { success: false, error: parsed.error.flatten() };
        }

        const validacion = validarFronteras(parsed.data, (await obtenerEsquemaSemanal(residenciaId)).esquemaSemanal);
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
            nombre: parsed.data.titulo,
            descripcion: parsed.data.descripcion || null,
            lugar: parsed.data.lugar || null,
            estado: 'pendiente',
            fechaInicio: parsed.data.fechaInicio,
            fechaFin: parsed.data.fechaFin,
            tiempoComidaInicioId: parsed.data.tiempoComidaInicioId,
            tiempoComidaFinId: parsed.data.tiempoComidaFinId,
            tiempoComidaInicial: parsed.data.tiempoComidaInicioId,
            tiempoComidaFinal: parsed.data.tiempoComidaFinId,
            centroCostoId: parsed.data.centroCostoId || null,
            solicitudAdministracion: parsed.data.solicitudAdministracion,
            tipoSolicitudComidas: mapSolicitudToLegacy(parsed.data.solicitudAdministracion),
            maxParticipantes: parsed.data.maxParticipantes,
            conteoInscritos: 0,
            planComidas: [],
            comensalesNoUsuarios: 0,
            requiereInscripcion: true,
            modoAtencionActividad: 'externa',
            diasAntelacionSolicitudAdministracion: 0,
            fechaHoraCreacion: FieldValue.serverTimestamp(),
            fechaHoraModificacion: FieldValue.serverTimestamp(),
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

        revalidatePath(`/${residenciaId}/gerencia/actividades`);
        return { success: true, data: { id: docRef.id, ...payload } };
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

        const parsed = ActividadActualizarSchema.safeParse(data);
        if (!parsed.success) {
            return { success: false, error: parsed.error.flatten() };
        }

        const mergeFronteras = {
            fechaInicio: parsed.data.fechaInicio ?? actividadActual.fechaInicio,
            tiempoComidaInicioId: parsed.data.tiempoComidaInicioId ?? actividadActual.tiempoComidaInicioId,
            fechaFin: parsed.data.fechaFin ?? actividadActual.fechaFin,
            tiempoComidaFinId: parsed.data.tiempoComidaFinId ?? actividadActual.tiempoComidaFinId,
        };

        const validacion = validarFronteras(mergeFronteras, (await obtenerEsquemaSemanal(residenciaId)).esquemaSemanal);
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
            fechaHoraModificacion: FieldValue.serverTimestamp(),
        };

        if (parsed.data.titulo !== undefined) {
            updatePayload.titulo = parsed.data.titulo;
            updatePayload.nombre = parsed.data.titulo;
        }
        if (parsed.data.descripcion !== undefined) {
            updatePayload.descripcion = parsed.data.descripcion || null;
        }
        if (parsed.data.lugar !== undefined) {
            updatePayload.lugar = parsed.data.lugar || null;
        }
        if (parsed.data.fechaInicio !== undefined) {
            updatePayload.fechaInicio = parsed.data.fechaInicio;
        }
        if (parsed.data.fechaFin !== undefined) {
            updatePayload.fechaFin = parsed.data.fechaFin;
        }
        if (parsed.data.tiempoComidaInicioId !== undefined) {
            updatePayload.tiempoComidaInicioId = parsed.data.tiempoComidaInicioId;
            updatePayload.tiempoComidaInicial = parsed.data.tiempoComidaInicioId;
        }
        if (parsed.data.tiempoComidaFinId !== undefined) {
            updatePayload.tiempoComidaFinId = parsed.data.tiempoComidaFinId;
            updatePayload.tiempoComidaFinal = parsed.data.tiempoComidaFinId;
        }
        if (parsed.data.centroCostoId !== undefined) {
            updatePayload.centroCostoId = parsed.data.centroCostoId || null;
        }
        if (parsed.data.maxParticipantes !== undefined) {
            updatePayload.maxParticipantes = parsed.data.maxParticipantes;
        }
        if (parsed.data.solicitudAdministracion !== undefined) {
            updatePayload.solicitudAdministracion = parsed.data.solicitudAdministracion;
            updatePayload.tipoSolicitudComidas = mapSolicitudToLegacy(parsed.data.solicitudAdministracion);
        }

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
                    estado: 'cancelada',
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