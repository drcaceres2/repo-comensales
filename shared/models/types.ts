import type { TiempoComida } from '../../shared/schemas/horarios';
export type TimestampString = string; // ISO 8601 (ejemplo "2023-10-25T14:00:00.000Z"

// Tipos para ubicaciones, zonas horarias, fechas y horas
export type CodigoPaisIso = string; // ISO 3166-1 alpha-2 (ej: "HN", "MX", "ES")
export type ZonaHorariaIana = string; // Identificador IANA (ej: "America/Tegucigalpa", "Europe/Madrid")
export type FechaIso = string; // Formato YYYY-MM-DD
export type FechaHoraIso = string; // Formato YYYY-MM-DDTHH:mm:ss
export type HoraIso = string; // Formato THH:MM:SS
export type DiaDeLaSemana = 'lunes' | 'martes' | 'miercoles' | 'jueves' | 'viernes' | 'sabado' | 'domingo';
export const MapaDiaDeLaSemana: Record<DiaDeLaSemana, string> = {
    lunes: 'Lunes',
    martes: 'Martes',
    miercoles: 'Miércoles',
    jueves: 'Jueves',
    viernes: 'Viernes',
    sabado: 'Sábado',
    domingo: 'Domingo'
};
export const ArregloDiaDeLaSemana: DiaDeLaSemana[] = Object.keys(MapaDiaDeLaSemana) as DiaDeLaSemana[];
export interface Ubicacion {
  // Geografía Política
  pais: CodigoPaisIso;      // Estricto 2 letras
  region?: string;          // Opcional (Departamento/Provincia/Comunidad Autónoma/Estado/State)
  ciudad: string;           // Obligatorio (ej: "San Pedro Sula")
  direccion?: string;       // Dirección exacta (Calle, Casa, Colonia)
  
  // Contexto Temporal (CRÍTICO)
  // Define cómo se interpretan las horas en esta ubicación específica
  zonaHoraria: ZonaHorariaIana;    
}
export interface OpcionZonaHoraria {
  region: string; // ej: "America"
  ciudad: string;   // ej: "Tegucigalpa" (La parte específica de IANA)
  
  /** * @deprecated Usar solo para visualización en UI. 
   * No usar para cálculos de fecha en backend.
   */
  diferenciaHoraria?: string; 
}

//Tipos genéricos
export type ColorHTML = string; // Formato #RRGGBB

// --- Usuarios  ---
export type UsuarioId = string;
export type RolUsuario = 
    'master' | 'admin' | 'director' | 
    'residente' | 'invitado' | 
    'asistente' | 'contador';

// --- Residencias y propiedades esenciales ---
export type ResidenciaId = string;
export type HorarioSolicitudComidaId = string; // ID semántico: slug estilo kebab a partir del nombre (INMUTABLE)
export type ComedorId = string; // ID semántico: slug estilo kebab a partir del nombre (INMUTABLE)
export interface GrupoUsuariosData {
    nombre: string;
    etiqueta: string;
    tipoGrupo: 'gestion-comidas' | 'centro-de-costo' | 'presentacion-reportes';
    descripcion?: string;
    centroCostoId?: CentroDeCostoId;
    gestionComida?: {
        usoSemanario: boolean;
        usoExcepciones: boolean;
        confirmacionAsistencia: boolean;
        confirmacionDiariaElecciones: boolean;
        horarioConfirmacionDiaria?: HoraIso; // Hora en ISO 8601 hh:mm en zona horaria de la residencia
        restriccionAlternativas: boolean;
        alternativasRestringidas: Record<ConfigAlternativaId, 'no_permitida' | 'requiere_aprobacion'>;
        localizacionObligatoria: boolean;
    }
}
export type GrupoUsuariosId = string; // ID semántico: slug estilo kebab a partir del nombre (INMUTABLE)
export type DietaId = string; // ID semántico: slug estilo kebab a partir del nombre (INMUTABLE)

// --- Comidas disponibles para elegir ---
export type TiempoComidaId = string; // ID semántico: slug estilo kebab a partir del nombre (INMUTABLE)

/**
 * Alternativa
 * Distintas opciones de horario que el usuario escoge para cada tiempo de comida.
 * 
 * Dos interfaces la conforman: DefinicionAlternativa y ConfiguracionAlternativa.
 */
export type AlternativaId = string; // ID semántico: slug estilo kebab a partir del nombre (INMUTABLE)
export type ConfigAlternativaId = string;

export interface AlteracionHorario {
    id: AlteracionHorarioId; // ID autogenerado por Firestore
    nombre: string;
    residenciaId: ResidenciaId;
    descripcion?: string;
    fechaInicio: FechaIso;
    fechaFin: FechaIso;
    alteraciones: Record<TiempoComidaId, DetalleAlteracion>;
    estado: 'propuesta' | 'aprobada' | 'cancelada';
    avisoAdministracion: EstadoAvisoAdministracion;
}
export type AlteracionHorarioId = string;
export interface DetalleAlteracion {
    tiempoComida: TiempoComida;
    alternativas: ConfigAlternativaId[];
}
export type EstadoAvisoAdministracion =
    | 'no_comunicado' | 'comunicacion_preliminar' 
    | 'comunicacion_final' | 'evento_cancelado';

// --------------------------------------------------------
// 1. MODELO DE INTENCIÓN (Mutable por el usuario/reglas)
// --------------------------------------------------------

/**
 * Excepcion: Representa la voluntad del usuario de desviarse de su Semanario.
 * Si no existe este documento, aplica el Semanario.
 * Corresponde al Nivel 3 de la Cascada de la Verdad.
 */
export interface ExcepcionUsuario {
    id?: ExcepcionId; 
    residenciaId: ResidenciaId;
    fecha: FechaIso;
    tiempoComidaId: TiempoComidaId;
    alternativaId: ConfigAlternativaId;
    origen: 'residente' | 'director' | 'asistente' | 'wizard_invitados';
    timestampCreacion: TimestampString;
    // Solo para excepciones que requieren aprobación
    autorizacion?: {
        motivo: string;
        estadoAprobacion: 'no_requiere_aprobacion' | 'pendiente_aprobacion' | 'aprobado' | 'rechazado';
        autorizadoPor?: UsuarioId;
        timestampAutorizacion: TimestampString;
        // Si el usuario selecciona una alternativa que requiere aprobación, debe también 
        // seleccionar la "alternativa de respaldo" que quedará en caso que no sea aprobada.
        alternativaRespaldoId?: ConfigAlternativaId | null; 
    }
}
export type ExcepcionId = string;

/**
 * Ausencia: Negación de servicio declarada por el usuario.
 * Corresponde al Nivel 2 de la Cascada de la Verdad.
 */
export interface Ausencia {
    id?: AusenciaId;
    usuarioId: UsuarioId;
    residenciaId: ResidenciaId;
    fechaInicio: FechaIso;
    primerTiempoAusente?: TiempoComidaId | null; 
    fechaFin: FechaIso;
    ultimoTiempoAusente?: TiempoComidaId | null; 
    retornoPendienteConfirmacion?: boolean; 
    timestampCreacion: TimestampString;
    motivo?: string; 
}
export type AusenciaId = string;

/**
 * Semanario: 
 * Entidad cíclica de elección de comidas. 
 * El usuario define su rutina semanal.
 */
export interface SemanarioUsuario {
  id: SemanarioUsuarioId;
  residenciaId: ResidenciaId;
  
  timestampCreacion: TimestampString;
  
  // VIGENCIA:
  // A partir de qué día aplica esta plantilla.
  // Permite planificar cambios de régimen (ej. "A partir del lunes me pongo a dieta").
  fechaDesde: FechaIso; 

  // LA PLANTILLA:
  // Mapa: Día -> TiempoComidaId -> AlternativaId
  elecciones: Record<DiaDeLaSemana, Record<TiempoComidaId, ConfigAlternativaId>>;

  // UX:
  recordatorioCambio?: {
    fechaNotificacion: FechaIso;
    mensaje: string;
    visto: boolean;
  };
}
export type SemanarioUsuarioId = string;

// --- TIPOS DE ENUMERACIÓN Y ESTADOS ---

/**
 * Indica de dónde provino la decisión de qué comer.
 * Fundamental para el coloreado de la UI y la trazabilidad.
 */
export type OrigenEleccion = 
  | 'SEMANARIO'     // Automático (Azul)
  | 'EXCEPCION'     // Manual puntual (Amarillo)
  | 'ASISTENTE_INVITADOS' // Manual puntual (Amarillo)
  | 'AUSENCIA'      // No está (Gris)
  | 'ACTIVIDAD'     // Evento (Morado)
  | 'NO_APLICA';    // No hay servicio ese día/hora

/**
 * Estado de la celda en la UI para el usuario.
 * Define si puede hacer clic o editar.
 */
export type EstadoInteraccion = 
  | 'ABIERTO'       // Editable en la semana presente
  | 'SOLICITADO'    // Edición afecta semanas siguientes

/**
 * EstadoCeltaComida. CRÍTICO: NO ES PARA ALMACENAMIENTO.
 * Junto con VistaGrillaSemanal son una proyección en memoria calculada al vuelo
 * en el navegador del cliente.
 */
export interface EstadoCeldaComida {
  // --- ESTADO PRINCIPAL (Semáforo) ---
  origen: OrigenEleccion;    // SEMANARIO, EXCEPCION, AUSENCIA, ACTIVIDAD
  estado: EstadoInteraccion; // ABIERTO, BLOQUEADO, SOLO_LECTURA
 
  // --- PAYLOAD (Horario seleccionado y disponiblea para seleccionar) ---
  alternativaSeleccionada?: ConfigAlternativaId; 
  alternativasDisponibles: ConfigAlternativaId[];

  // --- CONTEXTO ADICIONAL (Tus campos enriquecidos) ---
  contexto: {
    esAlteracion: boolean;      // True si hay AlteracionHorario vigente
    alteracionId?: AlteracionHorarioId;
    mensajeAlteracion?: string; // Ej: "Horario adelantado 1h"

    hayRestriccionGrupo: boolean;

    nombresActividadesDisponibles?: string[];
  }
}
/**
 * VistaGrillaSemanal. CRÍTICO: NO ES PARA ALMACENAMIENTO.
 * Mapa: Fecha -> { TiempoComidaId -> EstadoCelda }
 */
export interface VistaGrillaSemanal { 
    elecciones: Record<FechaIso, Record<TiempoComidaId, EstadoCeldaComida>>;
    actividadesDisponibles: ActividadId[];
    recordatoriosAplicables: RecordatorioId[];
}

// --------------------------------------------------------
// 2. MODELO DE HECHO (Inmutable / Snapshot)
// --------------------------------------------------------

/**
 * SolicitudConsolidada: Es la unidad atómica para Cocina y Contabilidad (Ticket de Comida).
 * Se genera automáticamente al cerrar/solicitar el día (Snapshot).
 * Es la "Fuente de la Verdad" para el historial.
 */
export interface SolicitudConsolidada {
    id: SolicitudConsolidadaId;
    residenciaId: ResidenciaId;
    fecha: FechaIso;
    timestampCreacion: TimestampString;
    estadoSincronizacionERP: 'pendiente' | 'sincronizado' | 'error';

    comensales: ComensalSolicitadoId[];

    otrasSolicitudes: {
        movimientosDeUsuarios: DetalleMovimientoUsuario[];
        actividades: ActividadId[];
        dietas: DietaId[];
        atenciones: AtencionId[];
        alteracionesHorario: AlteracionHorarioId[];
        comentarios: ComentarioId[];
    }

    resumen: DetalleResumen[];
}
export type SolicitudConsolidadaId = string;
export interface DetalleMovimientoUsuario {
    usuarioId: UsuarioId;
    accion: 'entrada' | 'salida' | 'cambio_informacion';
    comentario?: string;
}
export interface DetalleResumen {
    tiempoComidaId: TiempoComidaId;
    nombreTiempoComida: string;
    alternativaId: ConfigAlternativaId;
    nombreAlternativa: string;
	totalComensales: number;
    desglosePorDieta: Record<DietaId, number>;
}

/**
 * ComensalSolicitado: Es la unidad atómica para Cocina y Contabilidad (Ticket de Comida).
 * Se genera automáticamente al cerrar/solicitar el día (Snapshot).
 * Es la "Fuente de la Verdad" para el historial.
 */
export interface ComensalSolicitado {
    id: ComensalSolicitadoId;

    // Coordenadas
    residenciaId: ResidenciaId;
    usuarioComensalId: UsuarioId;
    nombreUsuarioComensal: string;
    dietaId: DietaId;
    usuarioDirectorId: UsuarioId;
    fecha: FechaIso; // YYYY-MM-DD según zona horaria de la residencia
    
    // Detalle del consumo (Snapshot de nombres para evitar cambios históricos)
    snapshot: {
        tiempoComidaId: TiempoComidaId;
        nombreTiempoComida: string;
        alternativaId: ConfigAlternativaId;
        nombreAlternativa: string;
        comedor: ComedorId;
    };
    
    // Contabilidad
    contabilidad: {
        ccDeUsuario?: CentroDeCostoId; 
        nombreCcDeUsuario?: string;
        ccDeGrupo?: CentroDeCostoId;
        nombreCcDeGrupo?: string;
        ccDeComedor?: CentroDeCostoId;
        nombreCcDeComedor?: string;
        ccDeActividad?: CentroDeCostoId;
        nombreCcDeActividad?: string;
        ccEscogidos?: CentroDeCostoId[];
    }
    // Trazabilidad del origen (Priority Cascade Result)
    origen: 'SEMANARIO' | 'EXCEPCION' | 'ACTIVIDAD' | 'AUSENCIA' | 'ASISTENTE_INVITADOS' | 'INVITADO_EXTERNO';
    referenciaOrigenId?: SemanarioUsuarioId | ExcepcionId | ActividadId | AusenciaId; // ID de la Excepcion o Actividad
    timestampCreacion: TimestampString;
}
export type ComensalSolicitadoId = string;


// --------------------------------------------------------
// 3. MÓDULOS DE SOPORTE
// --------------------------------------------------------

// --- Comentarios ---
export type ComentarioId = string;
export interface Comentario {
    id: ComentarioId;
    residenciaId: ResidenciaId;
    autorId: UsuarioId; // Residente que se queja/avisa
    timestampCreacion: TimestampString;
    
    texto: string;
    categoria: 'comida'| 'ropa' | 'limpieza' | 'mantenimiento' | 'otros';
    fecha: FechaIso;
    
    // Estado de gestión del Director
    estado: 'nuevo' | 'diferido' | 'atendido' | 'no_aprobado' | 'archivado';
    fechaDiferido?: FechaIso; // "Recuérdame esto el lunes"
    avisoAdministracion: EstadoAvisoAdministracion;
}
export interface Falta {
    id: string;
    fecha: FechaIso;
    residencia: ResidenciaId;
    usuario: UsuarioId;
    titulo: string;
    descripcion?: string;
    notificada: boolean;
    confirmada: boolean;
    origen: string;
}

export type RecordatorioId = string;
export interface Recordatorio {
    id: RecordatorioId;
    residenciaId: ResidenciaId;
    usuarioIniciadorId: UsuarioId;

    fecha: FechaIso;
    duracion: number;
    recurrencia?: {
        fechaFin: FechaIso;
        periodicidad: 'semanal' | 'quincenal' | 'mensual-diasemana' | 'mensual-diames' | 'anual';
    }

    titulo: string;
    descripcion?: string;
    color: ColorHTML;

    timestampCreacion: TimestampString;
}

// --- Actividades ---
export type ActividadId = string; 
export type DetalleActividadId = string; 
export type InscripcionActividadId = string; 

/*
 * Atenciones
 * Solicitudes extra a la administración que requiere registro y seguimiento, tales como:
 * aperitivos, coffee-break, flores para actividad académica, etc.
 */
export interface Atencion {
    id: AtencionId;
    residenciaId: ResidenciaId;
    usuarioId: UsuarioId;
    nombre: string;
    comentarios?: string;
    timestampCreacion: TimestampString
    horarioSolicitudComidaId: HorarioSolicitudComidaId;
    fechaSolicitudComida: FechaIso;
    fechaHoraAtencion: FechaHoraIso;
    estado: 'pendiente' | 'aprobada' | 'cancelada';
    avisoAdministracion: 'no_comunicado' | 'comunicacion_preliminar' 
                        | 'comunicacion_final' | 'atencion_cancelada';
    centroCostoId?: CentroDeCostoId;
}
export type AtencionId = string;

// --- Notificaciones ---
export type NotificacionId = string;
export type NotificacionTipo = 'info' | 'accion_requerida' | 'recordatorio' | 'alerta'; // New
export type NotificacionPrioridad = 'baja' | 'media' | 'alta'; // New
export interface Notificacion {
    id: NotificacionId;
    residenciaId: ResidenciaId;
    usuarioId: UsuarioId; // Recipient
    tipo: NotificacionTipo; // e.g., 'info', 'accion_requerida'
    prioridad: NotificacionPrioridad; // e.g., 'alta', 'media'
    titulo: string; // e.g., "Recordatorio: Elige tu comida"
    mensaje: string; // e.g., "Tienes hasta las 8 PM para elegir tu almuerzo."
    relacionadoA?: {
        coleccion: 'excepcion' | 'actividad' | 'ausencia' | 'mealCount';
        documentoId: string;
    };
    leido: boolean; // Whether the user has read the notification
    creadoEn: number; // Timestamp stored as number (millis)
    venceEn?: number; // Timestamp stored as number (millis)
    entregadoCorreoEn?: number; // Timestamp stored as number (millis)
    enviadoCorreoA?: string; // Email address
    estadoCorreo?: 'pendiente' | 'enviado' | 'fallido';
    errorcorreo?: string; // Error message if failed
    entregadoSMSEn?: number; // Timestamp stored as number (millis)
    entregadoWAEn?: number; // Timestamp stored as number (millis)
    enviadoWAA: string; // Phone number
    estadoWA: 'pendiente' | 'enviado' | 'fallido';
    errorWA?: string; // Error message if failed
    entregadoEnAppEn?: number; // Timestamp stored as number (millis)
}
export interface NotificacionPreferencias {
    canalEmail: boolean; // Opt-in for email
    canalWhatsApp: boolean; // Opt-in for WhatsApp
    canalSMS?: boolean; // Optional opt-in for SMS
    tiposPermitidos: NotificacionTipo[]; // e.g., ['info', 'recordatorio']
    notificacionesSilenciadas?: boolean; // Mute non-critical notifications
    horaMaxima?: HoraIso;
    horaMinima?: HoraIso;
}

// Contabilidad
export type CentroDeCostoId = string;

// --- Registro de actividad ---
export type LogEntryId = string;
export interface LogEntry {
    id: string;
    usuarioId: string;          // Quién lo hizo
    userEmail?: string;      // (Opcional) Ayuda visual rápida
    action: LogActionType;   // Qué hizo
    // GENERALIZACIÓN: En vez de targetUid, usamos targetId y colección
    targetId?: string | null;         // ID del objeto afectado (User, Menu, Factura)
    targetCollection?: string | null; // 'users', 'menus', etc.
    residenciaId?: string;   // Contexto
    details?: Record<string, any>; // Flexible para guardar el "antes y después"
    timestamp: any; // En lectura será un Firestore.Timestamp. 
                    // No lo fuerces a string aquí o te pelearás con el SDK.
    source: 'web-client' | 'cloud-function' | 'system';
}
export type LogActionType =
    // Clientes
    | 'CLIENTE_CREADO' | 'CLIENTE_ACTUALIZADO' | 'CLIENTE_ELIMINADO'
    // Contratos
    | 'CONTRATO_CREADO' | 'CONTRATO_ACTUALIZADO' | 'CONTRATO_ELIMINADO'
    // Pedidos
    | 'PEDIDO_CREADO' | 'PEDIDO_ACTUALIZADO' | 'PEDIDO_ELIMINADO'
    // Facturas
    | 'FACTURA_CREADA' | 'FACTURA_ACTUALIZADA' | 'FACTURA_ELIMINADA'
    // Licencias
    | 'LICENCIA_CREADA' | 'LICENCIA_ACTUALIZADA' | 'LICENCIA_ELIMINADA'
    // Usuarios (userProfile)
    | 'USUARIO_CREADO' | 'USUARIO_ACTUALIZADO' | 'USUARIO_ELIMINADO' | 'USUARIO_INICIO_SESION'
    // Residencias
    | 'RESIDENCIA_CREADA' | 'RESIDENCIA_ACTUALIZADA' | 'RESIDENCIA_ELIMINADA'
    // Dietas
    | 'DIETA_CREADA' | 'DIETA_ACTUALIZADA' | 'DIETA_ELIMINADA'
    // Comedores
    | 'COMEDOR_CREADO' | 'COMEDOR_ACTUALIZADO' | 'COMEDOR_ELIMINADO'
    // Horario de solicitud de comida
    | 'HORARIO_SOLICITUD_COMIDA_CREADO' | 'HORARIO_SOLICITUD_COMIDA_ACTUALIZADO' | 'HORARIO_SOLICITUD_COMIDA_ELIMINADO'
    // Tiempos de comida
    | 'TIEMPO_COMIDA_CREADO' | 'TIEMPO_COMIDA_ACTUALIZADO' | 'TIEMPO_COMIDA_ELIMINADO'
    // Alternativas de tiempo de comida
    | 'ALTERNATIVA_TIEMPO_COMIDA_CREADA' | 'ALTERNATIVA_TIEMPO_COMIDA_ACTUALIZADA' | 'ALTERNATIVA_TIEMPO_COMIDA_ELIMINADA'
    // La carga masiva de horarios incluye horarios de solicitud comida, tiempos de comida y alternativas
    | 'CARGA_MASIVA_HORARIOS'
    // Semanarios
    | 'SEMANARIO_CREADO' | 'SEMANARIO_ACTUALIZADO' | 'SEMANARIO_ELIMINADO'
    // Excepciones
    | 'EXCEPCION_CREADA' | 'EXCEPCION_ACTUALIZADA' | 'EXCEPCION_ELIMINADA'
    // Comensales (meal records for kitchen/accounting)
    | 'COMENSAL_CREADO' | 'COMENSAL_ACTUALIZADO' | 'COMENSAL_ELIMINADO'
    // Ausencias
    | 'AUSENCIA_CREADA' | 'AUSENCIA_ACTUALIZADA' | 'AUSENCIA_ELIMINADA'
    // Autorizaciones
    | 'AUTORIZACION_CREADA' | 'AUTORIZACION_ACTUALIZADA' | 'AUTORIZACION_ELIMINADA'
    // Comentarios
    | 'COMENTARIO_CREADO' | 'COMENTARIO_ACTUALIZADO' | 'COMENTARIO_ELIMINADO'
    // Modo de elección
    | 'MODO_ELECCION_CREADO' | 'MODO_ELECCION_ACTUALIZADO' | 'MODO_ELECCION_ELIMINADO'
    // Elecciones (Meal selections)
    | 'ELECCION_CREADA' | 'ELECCION_ACTUALIZADA' | 'ELECCION_ELIMINADA'
    // Actividades
    | 'ACTIVIDAD_CREADA' | 'ACTIVIDAD_ACTUALIZADA' | 'ACTIVIDAD_ELIMINADA'
    // Inscripciones a actividades
    | 'INSCRIPCION_USUARIO_ACTIVIDAD' | 'SALIDA_USUARIO_ACTIVIDAD' | 'INVITACION_USUARIO_ACTIVIDAD'
    // Recordatorios
    | 'RECORDATORIO_CREADO' | 'RECORDATORIO_ACTUALIZADO' | 'RECORDATORIO_ELIMINADO'
    // Feedback
    | 'FEEDBACK_ENVIADO';
export interface LogPayload {
    action: LogActionType;
    targetId?: string;
    targetCollection?: string; // Opcional, pero recomendado
    residenciaId?: string;
    details?: Record<string, any>;
}

// --- Feedback ---
export type FeedbackId = string; 
export interface Feedback {
    id?: FeedbackId; 
    usuarioId: UsuarioId; 
    userEmail: string; 
    residenciaId?: ResidenciaId; 
    text: string; 
    createdAt: number; // Timestamp stored as number (millis) from epoch
    page?: string; 
    userAgent?: string; 
    ipAddress?: string; 
    screenResolution?: string; 
    viewportSize?: string; 
    status?: 'nuevo' | 'leido' | 'procesado'; 
}
