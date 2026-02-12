// A flexible type for Firestore Timestamps
// On write, it can be a server timestamp.
// On read, it will be a Firestore Timestamp object, which can be converted to a number or Date.
export type FirestoreTimestamp = { seconds: number; nanoseconds: number } | any;

// ISO 3166-1 alpha-2 (ej: "HN", "MX", "ES")
export type IsoCountryCode = string;

// Identificador IANA (ej: "America/Tegucigalpa", "Europe/Madrid")
export type IanaTimezone = string;

// Formato YYYY-MM-DD
export type IsoDateString = string;

// Formato YYYY-MM-DDTHH:mm:ss
export type IsoDateTimeString = string;

// Formato THH:MM:SS
export type IsoTimeString = string;

export type DayOfWeekKey = 'lunes' | 'martes' | 'miercoles' | 'jueves' | 'viernes' | 'sabado' | 'domingo';
export const DayOfWeekMap: Record<DayOfWeekKey, string> = {
    lunes: 'Lunes',
    martes: 'Martes',
    miercoles: 'Miércoles',
    jueves: 'Jueves',
    viernes: 'Viernes',
    sabado: 'Sábado',
    domingo: 'Domingo'
};

// --- Ubicación y Zonas Horarias ---
export interface Ubicacion {
  // Geografía Política
  pais: IsoCountryCode;      // Estricto 2 letras
  region?: string;           // Opcional (Departamento/Provincia/Comunidad Autónoma/Estado/State)
  ciudad: string;            // Obligatorio (ej: "San Pedro Sula")
  direccion?: string;         // Dirección exacta (Calle, Casa, Colonia)
  
  // Contexto Temporal (CRÍTICO)
  // Define cómo se interpretan las horas en esta ubicación específica
  timezone: IanaTimezone;    
}
export interface ZonaHorariaOption {
  region: string; // ej: "America"
  name: string;   // ej: "Tegucigalpa" (La parte específica de IANA)
  
  /** * @deprecated Usar solo para visualización en UI. 
   * No usar para cálculos de fecha en backend.
   */
  offset?: string; 
}

// --- Usuarios  ---
export type UserId = string;
export type UserRole = 'master' | 'admin' | 'director' | 'residente' | 'invitado' | 'asistente' | 'contador';
export interface UserProfile {  
    id: UserId;
    nombre: string;
    apellido: string;
    nombreCorto: string;
    email: string;
    fotoPerfil?: string | null;
    roles: UserRole[];
    isActive: boolean;
    residenciaId?: ResidenciaId | null;
    dietaId?: DietaId | null;
    numeroDeRopa?: string;
    habitacion?: string;
    universidad?: string;
    carrera?: string;
    identificacion?: string;
    telefonoMovil?: string;
    fechaDeNacimiento?: IsoDateString | null;
    asistentePermisos?: AsistentePermisos | null;
    centroCostoPorDefectoId?: CentroCostoId | null;
    puedeTraerInvitados: 'no' | 'requiere_autorizacion' | 'si' | null;
    notificacionPreferencias?: NotificacionPreferencias | null; 
    tieneAutenticacion: boolean;

    fechaHoraCreacion: FirestoreTimestamp;
    ultimaActualizacion: FirestoreTimestamp;
    lastLogin?: FirestoreTimestamp | null;

    // Valores para los campos personalizables (definidos en Residencia)
    camposPersonalizados?: { [key: string]: string };
}
export interface Administradora {
    id: UserId;
    residenciaId?: ResidenciaId | null;
    nombre: string;
    apellido: string;
    nombreCorto: string;
    email: string;
    fotoPerfil?: string | null;
    isActive: boolean;
    telefonoMovil?: string;
    fechaDeNacimiento?: IsoDateString | null;
    notificacionPreferencias?: NotificacionPreferencias | null; 
    tieneAutenticacion: boolean;

    fechaHoraCreacion: FirestoreTimestamp;
    ultimaActualizacion: FirestoreTimestamp;
    lastLogin?: FirestoreTimestamp | null;
}
export interface NotificacionPreferencias {
    canalEmail: boolean; // Opt-in for email
    canalWhatsApp: boolean; // Opt-in for WhatsApp
    canalSMS?: boolean; // Optional opt-in for SMS
    tiposPermitidos: NotificacionTipo[]; // e.g., ['info', 'recordatorio']
    notificacionesSilenciadas?: boolean; // Mute non-critical notifications
    horaMaxima?: IsoTimeString;
    horaMinima?: IsoTimeString;
}

// --- Asistentes ---
export interface AsistentePermisos {
    usuariosAsistidos?: AsistenciasUsuariosDetalle[];
    gestionUsuarios: boolean;
    gestionActividades: AsistentePermisosDetalle;
    gestionInvitados: AsistentePermisosDetalle;
    gestionRecordatorios: AsistentePermisosDetalle;
    gestionDietas: AsistentePermisosDetalle;
    gestionAtenciones: AsistentePermisosDetalle;
    gestionAsistentes: AsistentePermisosDetalle;
    gestionGrupos: AsistentePermisosDetalle;
    solicitarComensales: AsistentePermisosDetalle;
}
export interface AsistentePermisosDetalle {
    nivelAcceso: 'Todas' | 'Propias' | 'Ninguna';
    restriccionTiempo: boolean;
    fechaInicio?: IsoDateString | null;
    fechaFin?: IsoDateString | null;
}
export interface AsistenciasUsuariosDetalle {
    usuarioAsistido: UserId;
    restriccionTiempo: boolean;
    fechaInicio?: IsoDateString | null;
    fechaFin?: IsoDateString | null;
}

// --- Grupos de usuarios y restricción de usuarios ---
export type grupoUsuarioId = string;
export interface grupoUsuario {
    id: grupoUsuarioId;
    residenciaId: ResidenciaId;
    etiqueta: string;
    tipoGrupo: 'eleccion-comidas' | 'centro-de-costo' | 'personalizado';
    descripcion?: string;
    centroCostoId?: CentroCostoId;
}
export interface UsuariosGrupos {
    id: string;
    usuario: UserId;
    residenciaId: ResidenciaId;
    grupo: grupoUsuarioId;
}
export interface PermisosComidaPorGrupo {
    id: string;
    grupoPermisos: grupoUsuarioId;
    residenciaId: ResidenciaId;
    usoSemanario: boolean;
    usoExcepciones: boolean;
    confirmacionAsistencia: boolean;
    confirmacionDiariaElecciones: boolean;
    horarioConfirmacionDiaria?: IsoTimeString; // Hora en ISO 8601 hh:mm en zona horaria de la residencia
    restriccionAlternativas: boolean;
    alternativasRestringidas?: alternativaRestringidaDetalle[];
    autorizacionLocalizacion: boolean;
}
export interface alternativaRestringidaDetalle {
    requiereAprobacion: boolean;
    alternativaRestringida: AlternativaTiempoComidaId;
}

// --- Residencias y propiedades esenciales ---
export type ResidenciaId = string;
export interface Residencia {
    id: ResidenciaId; // Not auto-generated by Firestore. Recognizable from final user
    nombre: string;
    direccion?: string;
    logoUrl?: string;
    antelacionActividadesDefault?: number; 
    textProfile?: string;
    tipoResidencia: TipoResidencia;
    esquemaAdministracion: 'estricto' | 'flexible';
    ubicacion: Ubicacion; // Zona horaria de la residencia en formato IANA (lista jerarquizada en dos niveles en @/zonas_horarias_dif.json)

    // Definición de campos personalizables para UserProfile
    camposPersonalizados?: { [key: string]: ConfiguracionCampo };

    configuracionContabilidad: ConfigContabilidad | null;

    estadoContrato: 'activo' | 'prueba' | 'inactivo';
}
export interface ConfiguracionCampo {
    etiqueta: string;
    isActive: boolean;
    necesitaValidacion?: boolean;
    regexValidacion?: string;
    tamanoTexto?: 'text' | 'textArea';
    puedeModDirector?: boolean;
    puedeModInteresado?: boolean;
    esObligatorio?: boolean; // Por defecto: false
}


export type TipoResidencia = 'estudiantes' | 'profesionales' | 'gente_mayor';
export type ComedorId = string;
export interface Comedor {
    id: ComedorId;
    nombre: string;
    residenciaId: ResidenciaId;
    descripcion?: string;
    capacidad?: number; 
    centroCostoPorDefectoId?: CentroCostoId;
}
export type HorarioSolicitudComidaId = string;
export interface HorarioSolicitudComida {
    id: HorarioSolicitudComidaId;
    residenciaId: ResidenciaId;
    nombre: string; 
    dia: DayOfWeekKey; 
    horaSolicitud: IsoTimeString;
    isPrimary: boolean; 
    isActive: boolean; 
}
export type DietaId = string;
export interface Dieta {
    id: DietaId;
    residenciaId: ResidenciaId;
    nombre: string;
    descripcion?: string;
    isDefault: boolean; 
    isActive: boolean;
}

// --- Comidas disponibles para elegir ---
export type TiempoComidaId = string;
export interface TiempoComida {
    id: TiempoComidaId;
    nombre: string; 
    residenciaId: ResidenciaId;
    /*  Los tiempos de comida son como "desayuno lunes, almuerzo lunes,
        cena lunes, desayuno martes, almuerzo martes, etc."
        
        Los grupos en la interfaz son solo para visualización. Los grupos
        son como "desayuno", "almuerzo", "cena". Son necesarios para
        conservar el orden en que se muestran los tiempos de comida
        en la interfaz, manteniendo el nivel de abstracción.
    */
    nombreGrupo: string; // Ejemplo: "desayuno, almuerzo, cena"
    ordenGrupo: number; // Ejemplo: 1, 2, 3 (para orden en la UI)

    dia?: DayOfWeekKey | null; // null cuando no es aplicación ordinaria
    horaEstimada?: IsoTimeString | null; 
    aplicacionOrdinaria: boolean;
    /*  Aplicación 'ordinaria' está disponible siempre para elegir. 
        Extraordinaria sirve para cuando el director quiere poner 
        "horario de sábado" o "de domingo" sin necesidad de hacer 
        una alteración de horario detallada. Se pueden crear tantos
        Tiempos de Comida extraordinarias como se desee. */
    isActive: boolean;
}
export type AlternativaTiempoComidaId = string;
export interface AlternativaTiempoComida {
    id: AlternativaTiempoComidaId;
    nombre: string; 
    tipo: TipoAlternativa; 
    tipoAcceso: TipoAccesoAlternativa; 
    requiereAprobacion: boolean; 
    ventanaInicio: IsoTimeString;
    iniciaDiaAnterior?: boolean; 
    ventanaFin: IsoTimeString;
    terminaDiaSiguiente?: boolean; 
    horarioSolicitudComidaId?: HorarioSolicitudComidaId | null; 
    tiempoComidaId: TiempoComidaId; 
    comedorId?: ComedorId | null; 
    residenciaId: ResidenciaId;
    esPrincipal: boolean; // La alternativa principal servirá para alimentar el formulario de invitados, actividades y otro. Debe haber una alternativa principal por TiempoComida
    isActive: boolean;
}
export type TipoAlternativa = 'comedor' | 'paraLlevar' | 'ayuno';
export type TipoAccesoAlternativa = 'abierto' | 'autorizado' | 'cerrado';
export type AlteracionHorarioId = string;
export interface AlteracionHorario {
    id: AlteracionHorarioId;
    nombre?: string;
    residenciaId: ResidenciaId;
    descripcion?: string;
    fechaInicio: IsoDateString;
    fechaFin: IsoDateString;
}
export type TiempoComidaModId = string;
export interface TiempoComidaMod {
    id: TiempoComidaModId;
    alteracionId: AlteracionHorarioId;
    residenciaId: ResidenciaId;
    tipoAlteracion: 'agregar'| 'modificar' | 'eliminar';
    tiempoAfectado?: TiempoComidaId | null; // Si tipoAlteracion='agregar', entonces tiempoAfectado=null
    nombre?: string; // Si está asociado a un tiempo, entonces nombre puede o no puede ser null
    nombreGrupo?: string | null; // Si tipoAlteracion='agregar', entonces nombreGrupo debe existir, de lo contrario debe ser null
    ordenGrupo?: number | null;  // Si tipoAlteracion='agregar', entonces nombreGrupo debe existir, de lo contrario debe ser null
    dia?: DayOfWeekKey | null;   // Si tipoAlteracion='agregar', entonces nombreGrupo debe existir, de lo contrario debe ser null
    horaEstimada?: IsoTimeString | null; 
}
export type AlternativaTiempoComidaModId = string;
export interface AlternativaTiempoComidaMod {
    id: AlternativaTiempoComidaModId;
    residenciaId: ResidenciaId;
    nombre?: string | null; 
    tipoAlteracion: 'agregar' | 'modificar' | 'eliminar';
    tiempoComidaModId: TiempoComidaModId;
    horarioSolicitudComidaId: HorarioSolicitudComidaId;
    alternativaAfectada?: AlternativaTiempoComidaId | null; // Solo para tipoAlteracion!='agregar'
    alternativaDesborde?: AlternativaTiempoComidaId | null; // Opción de configurar una alternativa en caso que no actualice su información
    tipo?: TipoAlternativa | null;              // Se utiliza solo si tipoAlteracion!='eliminar'
    tipoAcceso?: TipoAccesoAlternativa | null;  // Se utiliza solo si tipoAlteracion!='eliminar'
    requiereAprobacion?: boolean | null;        // Se utiliza solo si tipoAlteracion!='eliminar'
    ventanaInicio?: IsoDateString | null;       // Se utiliza solo si tipoAlteracion!='eliminar'
    iniciaDiaAnterior?: boolean | null;         // Se utiliza solo si tipoAlteracion!='eliminar'
    ventanaFin?: IsoDateString | null;          // Se utiliza solo si tipoAlteracion!='eliminar'
    terminaDiaSiguiente?: boolean | null;       // Se utiliza solo si tipoAlteracion!='eliminar'
    comedorId?: ComedorId | null;
}

// --------------------------------------------------------
// 1. MODELO DE INTENCIÓN (Mutable por el usuario/reglas)
// --------------------------------------------------------

/**
 * Excepcion: Representa la voluntad del usuario de desviarse de su Semanario.
 * Si no existe este documento, aplica el Semanario.
 * Corresponde al Nivel 3 de la Cascada de la Verdad.
 */
export interface Excepcion {
    id?: string;
    usuarioId: UserId;
    residenciaId: ResidenciaId;
    fecha: IsoDateString; // YYYY-MM-DD
    
    // Qué tiempo de comida se altera
    tiempoComidaId: TiempoComidaId; 
    
    // Tipo de desviación
    tipo: 'cambio_alternativa' | 'cancelacion_comida' | 'cambio_dieta';
    
    // Payload (solo si es cambio_alternativa)
    alternativaTiempoComidaId?: AlternativaTiempoComidaId;
    
    // Contexto
    motivo?: string;
    origen: 'residente' | 'director' | 'asistente' | 'wizard_invitados';
    autorizadoPor?: UserId; // Si requería aprobación
    estadoAprobacion?: EstadoAprobacion;
}
export type EstadoAprobacion = 'no_requiere_aprobacion' | 'pendiente' | 'aprobado' | 'rechazado';
/**
 * Ausencia: Negación de servicio declarada por el usuario.
 * Corresponde al Nivel 2 de la Cascada de la Verdad.
 */
export type AusenciaId = string;
export interface Ausencia {
    id?: AusenciaId;
    userId: UserId;
    residenciaId: ResidenciaId;
    fechaInicio: IsoDateString; // Date stored as a string using ISO 8601 format "YYYY-MM-DD" to be handled as a date in Residencia timezone
    ultimoTiempoComidaId?: TiempoComidaId | null; 
    fechaFin: IsoDateString; // Date stored as a string using ISO 8601 format "YYYY-MM-DD  " to be handled as a date in Residencia timezone
    primerTiempoComidaId?: TiempoComidaId | null; 
    retornoPendienteConfirmacion?: boolean; 
    fechaHoraCreacion: FirestoreTimestamp; // Timestamp stored as number (millis) from epoch
    motivo?: string; 
}

/**
 * Semanario: Plantilla base de comidas del usuario.
 * Corresponde al Nivel 4 (Fallback) de la Cascada de la Verdad.
 */
export interface Semanario {
    id?: string; 
    userId: UserId;
    residenciaId: ResidenciaId;
    elecciones: {
        [tiempoComidaId: TiempoComidaId]: AlternativaTiempoComidaId | null;
    };
    ultimaActualizacion: FirestoreTimestamp; // Timestamp stored as number (millis)
}

/**
 * Objeto de Vista (ViewModel) para el frontend.
 * Se construye en el cliente para mostrar el estado resuelto de la semana.
 */
export interface CeldaSemanarioDesnormalizado {
    // Información del TiempoComida base
    tiempoComidaId?: TiempoComidaId | null; // null en caso de horario alterado y añadido
    alternativasDisponiblesId: AlternativaTiempoComidaId[];
    
    hayAlternativasAlteradas: boolean;
    tiempoComidaModId?: TiempoComidaModId | null;
    alternativasModId: AlternativaTiempoComidaModId[];
    
    nombreTiempoComida: string; // "Desayuno lunes" por ejemplo, para referencia

    // Lista de alternativas que son válidas para este slot
    hayAlternativasRestringidas: boolean;
    alternativasRestringidasId: AlternativaTiempoComidaId[];
    hayActividadInscrita: boolean;
    actividadesInscritasId: InscripcionActividadId[];
    alternativasActividadInscritaId: TiempoComidaAlternativaUnicaActividadId[];
    hayActividadParaInscribirse: boolean;
    actividadesDisponiblesId: ActividadId[];  
    hayAusencia: boolean;
    ausenciaAplicableId: AusenciaId | null;
    eleccionSemanarioId?: AlternativaTiempoComidaId | null;
}
export interface SemanarioDesnormalizado {
    userId: UserId;
    residenciaId: ResidenciaId;
    semana: string; // Número de semana en formato ISO 8601 "YYYY-Www"

    ordenGruposComida: {nombreGrupo: string; ordenGrupo: number }[];  

    // Mapa anidado para la tabla: { nombreGrupo: { dia: AlternativasDisponiblesSlot } }
    tabla: {
        [nombreGrupo: string]: {
          [dia: string]: CeldaSemanarioDesnormalizado;
        };
      };
}

// --------------------------------------------------------
// 2. MODELO DE HECHO (Inmutable / Snapshot)
// --------------------------------------------------------

/**
 * Comensal: Es la unidad atómica para Cocina y Contabilidad (Ticket de Comida).
 * Se genera automáticamente al cerrar/solicitar el día (Snapshot).
 * Es la "Fuente de la Verdad" para el historial.
 */
export interface ComensalSolicitado {
    id: string;
    
    // Coordenadas
    residenciaId: ResidenciaId;
    usuarioComensalId: UserId;
    usuarioDirectorId: UserId;
    fecha: IsoDateString; // YYYY-MM-DD según zona horaria de la residencia
    
    // Detalle del consumo (Snapshot de nombres para evitar cambios históricos)
    tiempoComidaId: TiempoComidaId;
    nombreTiempoComida: string;
    alternativaId: AlternativaTiempoComidaId;
    nombreAlternativa: string;
    
    // Contabilidad (CRÍTICO: Se calcula al crear el snapshot)
    centroCostoId: CentroCostoId; 
    
    // Trazabilidad del origen (Priority Cascade Result)
    origen: 'SEMANARIO' | 'EXCEPCION' | 'ACTIVIDAD' | 'ASISTENTE_INVITADOS' | 'INVITADO_EXTERNO';
    referenciaOrigenId?: string; // ID de la Excepcion o Actividad
    
    // Estado
    solicitadoAdministracion: boolean; // true = enviado a cocina
    comentarioCocina?: string; // Feedback específico de este plato (ej. "carne muy hecha")
    fechaHoraCreacion: FirestoreTimestamp;
}


// --------------------------------------------------------
// 3. MÓDULOS DE SOPORTE
// --------------------------------------------------------

// --- Comentarios ---
export type ComentarioId = string;
export interface Comentario {
    id: ComentarioId;
    residenciaId: ResidenciaId;
    autorId: UserId; // Residente que se queja/avisa
    fechaHoraCreacion: FirestoreTimestamp;
    
    texto: string;
    categoria: 'comida' | 'limpieza' | 'mantenimiento' | 'varios';
    
    // Estado de gestión del Director
    estado: 'nuevo' | 'leido' | 'diferido' | 'archivado';
    fechaDiferidoHasta?: IsoDateString; // "Recuérdame esto el lunes"
}
export interface Falta {
    id: string;
    fecha: IsoDateString;
    residencia: ResidenciaId;
    usuario: UserId;
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
    userId: UserId;
    fechaInicio: IsoDateString;
    fechaFin: IsoDateString;
    isSingleDay: boolean;
    isRecurrente: boolean;
    recurrenciaRecordatorio?: RecurrenciaRecordatorio;
    titulo: string;
    descripcion?: string;
    color: string;
}
export type RecurrenciaRecordatorio = 'semanal' | 'quincenal' | 'mensual-diasemana' | 'mensual-diames' | 'anual';

// --- Actividades ---
/**
 * Actividad: Evento que sobrescribe la rutina de comida.
 * Corresponde al Nivel 1 (Máxima Prioridad) de la Cascada de la Verdad.
 */
export type ActividadId = string; 
export interface Actividad {
    //Campos generales
    id: ActividadId;
    residenciaId: ResidenciaId;
    nombre: string; 
    descripcionGeneral?: string;
    maxParticipantes?: number;
    estado: ActividadEstado;
    organizadorUserId: UserId; 
    comensalesNoUsuarios?: number; // se inscriben usuarios, se pueden inscribir invitados que no son usuarios y también se puede sencillamente agregar un número no asociado a un usuario (autenticado o no autenticado)

    //Campos de cálculo de comidas
    fechaInicio: IsoDateString; // Fecha almacenada como cadena (string) en formato ISO 8601 "YYYY-MM-DD" en zona horaria de la residencia
    fechaFin: IsoDateString; // Fecha almacenada como cadena (string) en formato ISO 8601 "YYYY-MM-DD" en zona horaria de la residencia
    ultimoTiempoComidaAntes: TiempoComidaId; // Tiempo de comida a ser excluido a las personas que se inscriban
    primerTiempoComidaDespues: TiempoComidaId; // Tiempo de comida a ser excluido a las personas que se inscriban
    planComidas: TiempoComidaAlternativaUnicaActividad[]; 
    tipoSolicitudComidas: TipoSolicitudComidasActividad;
    estadoSolicitudAdministracion: 'no_solicitado' | 'solicitud_inicial_realizada' | 'completada';
    comedorActividad?: ComedorId | null;
    modoAtencionActividad: 'residencia' | 'externa'; // En la solicitud de comidas que lee el director, si es "residencia" lo verá con todos los demás comensales. Si es "externa" lo verá en la sección de actividades

    // Campos de lógica de inscripción
    requiereInscripcion: boolean;
    diasAntelacionCierreInscripcion?: number; 
    tipoAccesoActividad: TipoAccesoActividad; 
    aceptaResidentes: boolean;
    aceptaInvitados: 'no' | 'por_invitacion' | 'invitacion_libre';

    // Campos de costo
    defaultCentroCostoId?: CentroCostoId | null; 
}
export type ActividadEstado = 'borrador' | 'abierta_inscripcion' | 'cerrada_inscripcion' | 'confirmada_finalizada' | 'cancelada';
export type TipoAccesoActividad = 'abierta' | 'invitacion_requerida' | 'opcion_unica'; 
export type TipoSolicitudComidasActividad = 
    | 'ninguna' | 'solicitud_unica' | 'diario_externo' | 'diario_residencia' 
    | 'solicitud_inicial_mas_confirmacion_diaria_residencia' 
    | 'solicitud_inicial_mas_confirmacion_diaria_externa';
export type InscripcionActividadId = string;   
export interface InscripcionActividad {
    id: InscripcionActividadId; 
    actividadId: ActividadId;
    userId: UserId; 
    residenciaId: ResidenciaId;     
    estadoInscripcion: EstadoInscripcionActividad;
    invitadoPorUserId?: UserId;     
    nombreInvitadoNoAutenticado?: string; 
    fechaInvitacionOriginal?: IsoDateString | null;
    fechaHoraCreacion: FirestoreTimestamp;
    fechaHoraModificacion: FirestoreTimestamp;
}
export type EstadoInscripcionActividad =
    | 'invitado_pendiente' | 'invitado_rechazado' | 'invitado_aceptado'    
    | 'inscrito_directo'     
    | 'cancelado_usuario' | 'cancelado_admin';     
export type TiempoComidaAlternativaUnicaActividadId = string; 
export interface TiempoComidaAlternativaUnicaActividad {
    id: TiempoComidaAlternativaUnicaActividadId; 
    nombreTiempoComida_AlternativaUnica: string; 
    nombreGrupoTiempoComida: string;
    ordenGrupoTiempoComida: number;
    fecha: IsoDateString;  
    horaEstimadaMeal?: IsoTimeString; 
}

// --- Notificaciones ---
export type NotificacionId = string;
export type NotificacionTipo = 'info' | 'accion_requerida' | 'recordatorio' | 'alerta'; // New
export type NotificacionPrioridad = 'baja' | 'media' | 'alta'; // New
export interface Notificacion {
    id: NotificacionId;
    residenciaId: ResidenciaId;
    usuarioId: UserId; // Recipient
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

// Contabilidad
export type CentroCostoId = string;
export interface CentroCosto {
    id: CentroCostoId;
    residenciaId: ResidenciaId;
    nombre: string; 
    descripcion?: string;
    codigoInterno?: string; 
    isActive: boolean; 
}
export interface ConfigContabilidad {
    nombreEtiquetaCentroCosto?: string; 
    modeloClasificacion?: 'por-usuario' | 'por-grupo-usuario' | 'por-comedor' | 'detallada';
    valorizacionComensales: boolean;
    modoCosteo?: 'general' | 'por-grupo-tiempo-comida' | 'por-tiempo-comida' | 'detallado';
    costoDiferenciadoDietas: boolean;
}
export interface comensalesContabilizados {
    id: string;
    tiempoDeComida: TiempoComidaId;
    centroDeCosto: CentroCostoId;
    dietaContabilizada?: DietaId | null;
    cantidad: number;
    costo: number;
}

// --- Registro de actividad ---
export type LogEntryId = string;
export interface LogEntry {
    id: string;
    userId: string;          // Quién lo hizo
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
    userId: UserId; 
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
