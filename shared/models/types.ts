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
export interface Usuario {  
    // Información interna de aplicación
    id: UsuarioId; // ID viene de Firebase Auth
    residenciaId?: ResidenciaId | null; // Solo usuario tipo = 'master' no tiene residencia
    roles: RolUsuario[];
    email: string;
    tieneAutenticacion: boolean;
    timestampCreacion: TimestampString;
    timestampActualizacion: TimestampString;
    timestampUltimoIngreso?: TimestampString | null;
    estaActivo: boolean;
    centroCostoPorDefectoId?: CentroDeCostoId | null;
    notificacionPreferencias?: NotificacionPreferencias | null; 
 
    // Información personal
    nombre: string;
    apellido: string;
    nombreCorto: string;
    identificacion?: string;
    telefonoMovil?: string;
    fechaDeNacimiento?: FechaIso | null;
    fotoPerfil?: string | null;
    universidad?: string;
    carrera?: string;

    // Información funcional
    grupos: GrupoUsuariosId[];
    puedeTraerInvitados: 'no' | 'requiere_autorizacion' | 'si' | null;
    camposPersonalizados?: { [key: string]: string };

    // Información opcoinal solo para el rol asistente
    asistente? : {
        usuariosAsistidos: Record<UsuarioId, AsistentePermisosDetalle>;
        gestionActividades: AsistentePermisosDetalle;
        gestionInvitados: AsistentePermisosDetalle;
        gestionRecordatorios: AsistentePermisosDetalle;
        gestionDietas: AsistentePermisosDetalle;
        gestionAtenciones: AsistentePermisosDetalle;
        gestionAsistentes: AsistentePermisosDetalle;
        gestionGrupos: AsistentePermisosDetalle;
        solicitarComensales: AsistentePermisosDetalle;        
    }

    // Información opcoinal solo para el rol residente
    residente? : {
        dietaId: DietaId;
        numeroDeRopa: string; 
        habitacion: string; 
        avisoAdministracion: 'convivente' | 'no_comunicado' | 'comunicado';
    }
}
export type UsuarioId = string;
export type RolUsuario = 
    'master' | 'admin' | 'director' | 
    'residente' | 'invitado' | 
    'asistente' | 'contador';
export interface AsistentePermisosDetalle {
    nivelAcceso: 
        'Todas' | 'Propias' | 'Ninguna'; // Todas implica acceso total. 
                // Propias solo las que el asistente haya creado 
                // (no podría modificar lo creado por otro)
    restriccionTiempo: boolean;
    fechaInicio?: FechaIso | null;
    fechaFin?: FechaIso | null;
}

// --- Grupos de usuarios y restricción de usuarios ---
export interface GrupoUsuariosData {
    nombre: string;
    etiqueta: string;
    tipoGrupo: 'restriccion-comidas' | 'centro-de-costo' | 'presentacion-reportes';
    descripcion?: string;
    centroCostoId?: CentroDeCostoId;
    restriccionComida?: {
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

// --- Residencias y propiedades esenciales ---
export interface Residencia {
    id: ResidenciaId; // slug escogido desde la UI por el usuario master que crea la residencia
    nombre: string;
    direccion?: string;
    logoUrl?: string;
    archivoIdiomaEstilo?: string;
    tipo: {
        tipoResidentes: 'estudiantes' | 'profesionales' | 'gente_mayor' | 'otro';
        modalidadResidencia: 'hombres' | 'mujeres';
    }
    ubicacion: Ubicacion;

    /*  Definición de campos personalizados por cada residencia, 
        con valores para cada usuario (UserProfile) */
    camposPersonalizados?: CampoPersonalizado[];

    estadoContrato: 'activo' | 'prueba' | 'inactivo';
}
export type ResidenciaId = string;
export interface CampoPersonalizado {
    activo: boolean;
    configuracionVisual: {
        etiqueta: string;
        tipoControl: 'text' | 'textArea';
        placeholder?: string;
    }
    validacion: {
        esObligatorio: boolean;
        necesitaValidacion: boolean;
        regex?: string;
        mensajeError?: string;
    }
    permisos: {
        modificablePorDirector: boolean;
        modificablePorInteresado: boolean;
    }
}

/**
 * Colección: configuracionResidencia (Singleton por residencia)
 * ID: general (es un singleton)
 * Controla el "Muro Móvil" y las "Islas de Bloqueo".
 */
export interface ConfiguracionResidencia {
  // Metadata
  residenciaId: ResidenciaId;
  nombreCompleto: string;

  // --- Muro móvil ---
  fechaHoraReferenciaUltimaSolicitud: FechaHoraIso; // De la fecha y HorarioSolicitudData.horaSolicitud
                                                    // perteneciente a la última solicitud consolidada.
  timestampUltimaSolicitud: TimestampString; // El director puede adelantar o retrasar la solicitud porque
                                                // no es automática sino manual. Aquí se almacena el instante de
                                                // creación del último documento de SolicitudConsolidada

  // --- DATOS EMBEBIDOS (Embed Pattern) ---
  // Ya no son colecciones aparte. Se leen de un solo golpe.
  horariosSolicitud: Record<HorarioSolicitudComidaId, HorarioSolicitudData>;
  comedores: Record<ComedorId, ComedorData>;
  usuarioGrupos: Record<GrupoUsuariosId, GrupoUsuariosData>;
  dietas: Record<DietaId, DietaData>;
  gruposComidas: GrupoComida[];
  esquemaSemanal: Record<TiempoComidaId, TiempoComida>;
  catalogoAlternativas: Record<AlternativaId, DefinicionAlternativa>;
  configuracionAlternativas: Record<ConfigAlternativaId, ConfiguracionAlternativa>;
}
export type GrupoComida = string;
export interface ComedorData {
    nombre: string;
    descripcion?: string;
    aforoMaximo?: number;
    centroCostoId?: CentroDeCostoId;
}
export type ComedorId = string; // ID semántico: slug estilo kebab a partir del nombre (INMUTABLE)
export interface HorarioSolicitudData {
    nombre: string;
    dia: DiaDeLaSemana;
    horaSolicitud: HoraIso;
    esPrimario: boolean;
    estaActivo: boolean;
}
export type HorarioSolicitudComidaId = string; // ID semántico: slug estilo kebab a partir del nombre (INMUTABLE)
export interface DietaData {
    nombre: string;
    identificadorAdministracion: string;
    descripcion?: string;
    esPredeterminada: boolean;
    estado: 'solicitada_por_residente' | 'no_aprobada_director' | 
        'aprobada_director' | 'cancelada';
    avisoAdministracion: 'no_comunicado' | 'comunicacion_preliminar' 
                        | 'comunicacion_final' | 'dieta_cancelada';
    estaActiva: boolean; // Esto es un "soft delete"
}
export type DietaId = string; // ID semántico: slug estilo kebab a partir del nombre (INMUTABLE)

// --- Comidas disponibles para elegir ---

/**
 * TiemposComida
 * Los tiempos de comida son como "desayuno lunes, almuerzo lunes,
 * cena lunes, desayuno martes, almuerzo martes, etc."
 * (Combinación de dia de la semana con "desayuno", "almuerzo", "cena", etc.)
 */
export interface TiempoComida {
    nombre: string;
    residenciaId: ResidenciaId;

    grupoComida: number; // Índice de arreglo "ConfiguracionResidencia.gruposComidas[]" 
    dia: DiaDeLaSemana;
    horaReferencia: HoraIso; 

    alternativas: {
        principal: ConfigAlternativaId; 
        secundarias: ConfigAlternativaId[];
    }

    estaActivo: boolean;
}
export type TiempoComidaId = string; // ID semántico: slug estilo kebab a partir del nombre (INMUTABLE)
export interface DefinicionAlternativa {
    nombre: string;
    descripcion?: string;
    tipo: TipoAlternativa;
    estaActiva: boolean;
}
export type AlternativaId = string; // ID semántico: slug estilo kebab a partir del nombre (INMUTABLE)
export type TipoAlternativa = 'COMEDOR' | 'PARA_LLEVAR' | 'COMIDA_FUERA' | 'AYUNO';
export type ConfigAlternativaId = string;
export interface ConfiguracionAlternativa {
    id: ConfigAlternativaId; // ID semántico: dia + slug alternativa

    // Coordenadas
    dia: DiaDeLaSemana;
    alternativa: AlternativaId;

    // Parámetros de Solicitud
    horarioSolicitudComidaId: HorarioSolicitudComidaId;
    comedorId?: ComedorId | null; 
    requiereAprobacion: boolean;

    // Parámetros de Horario
    horario: {
        horaInicio: HoraIso;
        iniciaDiaAnterior?: boolean;
        horaFin: HoraIso;
        terminaDiaSiguiente?: boolean;
    };
}

export type AlteracionHorarioId = string;
export interface AlteracionHorario {
    id: AlteracionHorarioId; // ID autogenerado por Firestore
    nombre: string;
    residenciaId: ResidenciaId;
    descripcion?: string;
    fechaInicio: FechaIso;
    fechaFin: FechaIso;
    alteraciones: Record<TiempoComidaId, DetalleAlteracion>;
    estado: 'propuesta' | 'aprobada' | 'cancelada';
    avisoAdministracion: 'no_comunicado' | 'comunicacion_preliminar' 
                        | 'comunicacion_final' | 'alteracion_cancelada';
}
export interface DetalleAlteracion {
    tiempoComida: TiempoComida;
    alternativas: ConfigAlternativaId[];
}

// --------------------------------------------------------
// 1. MODELO DE INTENCIÓN (Mutable por el usuario/reglas)
// --------------------------------------------------------

/**
 * Excepcion: Representa la voluntad del usuario de desviarse de su Semanario.
 * Si no existe este documento, aplica el Semanario.
 * Corresponde al Nivel 3 de la Cascada de la Verdad.
 */
export type ExcepcionId = string;
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
        estadoAprobacion: EstadoAprobacion;
        autorizadoPor?: UsuarioId;
        timestampAutorizacion: TimestampString;
        // Si el usuario selecciona una alternativa que requiere aprobación, debe también 
        // seleccionar la "alternativa de respaldo" que quedará en caso que no sea aprobada.
        alternativaRespaldoId?: ConfigAlternativaId | null; 
    }
}
export type EstadoAprobacion = 'no_requiere_aprobacion' | 'pendiente_aprobacion' | 'aprobado' | 'rechazado';
/**
 * Ausencia: Negación de servicio declarada por el usuario.
 * Corresponde al Nivel 2 de la Cascada de la Verdad.
 */
export type AusenciaId = string;
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

export type SemanarioUsuarioId = string;
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
    hayRestriccionGrupo: boolean;
    mensajeAlteracion?: string; // Ej: "Horario adelantado 1h"

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
    avisoAdministracion: 'no_comunicado' | 'comunicacion_preliminar' 
                        | 'comunicacion_final' | 'comentario_cancelado';
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

/**
 * Actividad: Evento que sobrescribe la rutina de comida.
 * Corresponde al Nivel 1 (Máxima Prioridad) de la Cascada de la Verdad.
 */
export interface Actividad {
    // Campos generales
    id: ActividadId;
    residenciaId: ResidenciaId;
    organizadorId: UsuarioId; 
    nombre: string; 
    descripcion?: string;
    estado: 'borrador' | 'inscripcion_abierta' | 'inscripcion_cerrada' |
            'solicitada_administracion' | 'cancelada';
    avisoAdministracion: 'no_comunicado' | 'comunicacion_preliminar' |
                         'comunicacion_final' | 'actividad_cancelada';
    tipoSolicitudComidas: TipoSolicitudComidasActividad;

    // Campos de cálculo de comidas
    fechaInicio: FechaIso; // Fecha almacenada como cadena (string) en formato ISO 8601 "YYYY-MM-DD" en zona horaria de la residencia
    fechaFin: FechaIso; // Fecha almacenada como cadena (string) en formato ISO 8601 "YYYY-MM-DD" en zona horaria de la residencia
    tiempoComidaInicial: TiempoComidaId; // Tiempo de comida a ser excluido a las personas que se inscriban
    tiempoComidaFinal: TiempoComidaId; // Tiempo de comida a ser excluido a las personas que se inscriban
    planComidas: DetalleActividad[]; 
    comedorActividad?: ComedorId | null;
    modoAtencionActividad: 'residencia' | 'externa'; // En la solicitud de comidas que lee el director, si es "residencia" lo verá con todos los demás comensales o al menos en los comedores de la casa. Si es "externa" lo verá en la sección de actividades
    diasAntelacionSolicitudAdministracion: number; 

    // Campos de lógica de inscripción
    maxParticipantes?: number;
    comensalesNoUsuarios: number; // se inscriben usuarios, se pueden inscribir invitados que no son usuarios y también se puede sencillamente agregar un número no asociado a un usuario (autenticado o no autenticado)
    requiereInscripcion: boolean; // false significaría que las comidas se pedirán a la administración sin interacción de los involucraddos en "Comensales Residencia"
    fechaLimiteInscripcion?: FechaIso; // indefinido significa que no hay fecha límite propia, sino hasta que se solicite a la administración
    modoAccesoResidentes?: ModoAcceso; 
    modoAccesoInvitados?: ModoAcceso;

    // Campos de costo
    centroCostoId?: CentroDeCostoId | null; 
}
export type ActividadId = string; 
export interface DetalleActividad {
    id: DetalleActividadId; 
    fechaComida: FechaIso;  
    grupoComida: number;
    nombreTiempoComida: string; 
    horaEstimada?: HoraIso; 
}
export type DetalleActividadId = string; 

/** 
 * ModoAcceso
 * Abierta quiere decir que se inscribe voluntariamente quien lo desee. 
 * Por invitación, como lo dice el texto. 
 * Opción única quiere decir que no habrá otra opción para los residentes (los tiempos de comida omitidos no estarán disponibles en la residencia).
 */
export interface ModoAcceso {
    accesoUsuario: 'abierto' | 'por_invitacion';
    puedeInvitar: boolean;
}

/**
 * TipoSolicitudComidasActividad
 * Aquí se define el modo en como se debe solicitar la actividad 
 * a la administración.
 * 
 * 1. Ninguna: 
 *      No se solicita a la administración. Por ejemplo si la comida 
 *      no la prepara la administración. Igualmente sirve en la aplicación
 *      porque los inscritos dejarán de verse reflejados en los comensales
 *      normales.
 * 2. Solicitud unica: Es la forma ordinaria de solicitar una actividad.
 *      Se solicita a la administración con la antelación debida.
 * 3. Diario: Por la longitud de la actividad, se pide a la administración
 *      cada día en el horario normal. Por ejemplo una convivencia larga con gente
 *      de afuera, un retiro de gente externa que vienen y van, etc.
 * 4. Solicitud inicial mas confirmacion diaria: 
 *      Se solicita una vez con antelación y se confirma diariamente.
 */
export interface InscripcionActividad {
    id: InscripcionActividadId; 
    residenciaId: ResidenciaId;     
    actividadId: ActividadId;
    usuarioInscritoId: UsuarioId; 
    invitadoPorUsuarioId?: UsuarioId;     

    fechaInvitacion: FechaIso | null;
    estadoInscripcion: EstadoInscripcionActividad;

    timestampCreacion: TimestampString;
    timestampModificacion: TimestampString;
}
export type TipoSolicitudComidasActividad = 
    | 'ninguna' | 'solicitud_unica' | 'solicitud_diaria' 
    | 'solicitud_inicial_mas_confirmacion_diaria';
export type InscripcionActividadId = string; 
export type EstadoInscripcionActividad =
    | 'invitado_pendiente' | 'invitado_rechazado' | 'invitado_aceptado'    
    | 'inscrito_directo'     
    | 'cancelado_usuario' | 'cancelado_admin';

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
export interface ConfigContabilidad {
    residenciaId: ResidenciaId;
    nombreEtiquetaCentroCosto?: string; 
    modeloClasificacion?: 'por-usuario' | 'por-grupo-usuario' | 'por-comedor' | 'detallada';
    valorizacionComensales: boolean;
    modoCosteo?: 'general' | 'por-grupo-tiempo-comida' | 'por-tiempo-comida' | 'detallado';
    costoDiferenciadoDietas: boolean;
    centrosDeCosto: Record<CentroDeCostoId, CentroDeCostoData>;
}
export type CentroDeCostoId = string;
export interface CentroDeCostoData {
    codigo: CentroDeCostoId;
    nombre: string; 
    descripcion?: string;
    estaActivo: boolean; 
}

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
