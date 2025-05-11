import { Timestamp } from "firebase/firestore";

// --- Basic Types ---
export type ResidenciaId = string;
export type ComedorId = string;
export type TiempoComidaId = string;
export type AlternativaTiempoComidaId = string;
export type UserId = string;
export type ComentarioId = string;
export type HorarioSolicitudComidaId = string;
export type DietaId = string;
export type LogEntryId = string;
export type AusenciaId = string;
export type ExcepcionId = string;
export type CentroCostoId = string;
export type ActividadId = string; 
export type InscripcionActividadId = string; 
export type ActividadMealDefinitionId = string; 
export type FeedbackId = string; 
export type RecordatorioId = string;

// --- Enum-like Types ---
export type DayOfWeekKey = 'lunes' | 'martes' | 'miercoles' | 'jueves' | 'viernes' | 'sabado' | 'domingo';
export type TipoAccesoAlternativa = 'abierto' | 'autorizado' | 'cerrado';
export type EstadoAprobacion = 'pendiente' | 'aprobado' | 'rechazado' | 'no_requerido' | 'contingencia' | 'contingencia_no_considerada' | 'anulada_por_cambio';
export type ModoEleccionUsuario = 'normal' | 'aprobacion_diaria' | 'explicito_diario' | 'suspendido_con_asistente' | 'suspendido';
export type OrigenEleccion = 
    'semanario' 
  | 'excepcion' 
  | 'excepcion_autorizada' 
  | 'contingencia' 
  | 'director' 
  | 'invitado_wizard'
  | 'actividad'; 
export type TipoAlternativa = 'comedor' | 'paraLlevar' | 'ayuno';
export type ActividadEstado = 'borrador' | 'abierta_inscripcion' | 'cerrada_inscripcion' | 'confirmada_finalizada' | 'cancelada';
export type TipoAccesoActividad = 'abierta' | 'invitacion_requerida' | 'opcion_unica'; 
export type MealCountFuente = 'estandar' | 'actividad'; 
export type EstadoInscripcionActividad =
  | 'invitado_pendiente'   
  | 'invitado_rechazado'   
  | 'invitado_aceptado'    
  | 'inscrito_directo'     
  | 'cancelado_usuario'    
  | 'cancelado_admin';     
export type TipoSolicitudComidasActividad = 'ninguna' | 'solicitud_unica' | 'diario_externo' | 'diario_residencia' | 'solicitud_inicial_mas_confirmacion_diaria_residencia' | 'solicitud_inicial_mas_confirmacion_diaria_externa';
export type LogActionType =
    'user_created' |
    'user_updated' |
    'user_deleted' |
    'residencia_created' |
    'residencia_updated' |
    'tiempo_comida_created' |
    'tiempo_comida_updated' |
    'tiempo_comida_deleted' |
    'alternativa_created' |
    'alternativa_updated' |
    'alternativa_deleted' |
    'horario_solicitud_created' |
    'horario_solicitud_updated' |
    'horario_solicitud_deleted' |
    'dieta_created' |
    'dieta_updated' |
    'dieta_deleted' |
    'solicitud_autorizacion_requerida' |
    'solicitud_aprobada' |
    'solicitud_rechazada' |
    'dieta_asignada' |
    'dieta_desasignada' |
    'semanario_updated' |
    'eleccion_created' |
    'eleccion_updated' |
    'eleccion_deleted' |
    'ausencia_created' |
    'ausencia_updated' |
    'ausencia_deleted' |
    'comentario_created' |
    'modo_eleccion_updated' |
    'actividad_created' |        
    'actividad_updated' |
    'actividad_deleted' |        
    'actividad_estado_changed' |  
    'inscripcion_actividad_registrada' | 
    'inscripcion_actividad_cancelada' |  
    'inscripcion_invitacion_enviada' |   
    'inscripcion_invitacion_aceptada' |  
    'inscripcion_invitacion_rechazada' | 
    'feedback_submitted'; 

export type UserRole = 'master' | 'admin' | 'director' | 'residente' | 'invitado' | 'asistente' | 'auditor';

export const DayOfWeekMap: Record<DayOfWeekKey, string> = {
    lunes: 'Lunes',
    martes: 'Martes',
    miercoles: 'Miércoles',
    jueves: 'Jueves',
    viernes: 'Viernes',
    sabado: 'Sábado',
    domingo: 'Domingo'
  };
export type TipoRecurrente = 'semanal' | 'quincenal' | 'mensual-diasemana' | 'mensual-diames' | 'anual';

// --- Notificaciones ---
export type NotificacionTipo = 'info' | 'accion_requerida' | 'recordatorio' | 'alerta'; // New
export type NotificacionPrioridad = 'baja' | 'media' | 'alta'; // New

export type NotificacionId = string;

// --- Interfaces ---

export interface Residencia {
    id: ResidenciaId;
    nombre: string;
    direccion?: string;
    logoUrl?: string;
    nombreEtiquetaCentroCosto?: string; 
    modoDeCosteo?: 'por-usuario' | 'por-comedor' | 'por-eleccion';
    antelacionActividadesDefault?: number; 
    textProfile?: string;
    tipoResidentes: 'estudiantes' | 'profesionales' | 'gente_mayor';
    esquemaAdministracion: 'estricto' | 'flexible';

    nombreTradicionalDesayuno?: string;
    nombreTradicionalAlmuerzo?: string;
    nombreTradicionalCena?: string;
    nombreTradicionalLunes?: string;
    nombreTradicionalMartes?: string;
    nombreTradicionalMiercoles?: string;
    nombreTradicionalJueves?: string;
    nombreTradicionalViernes?: string;
    nombreTradicionalSabado?: string;
    nombreTradicionalDomingo?: string;

    // Definición de campos personalizables para UserProfile
    campoPersonalizado1_etiqueta?: string;
    campoPersonalizado1_isActive?: boolean;
    campoPersonalizado1_necesitaValidacion?: boolean;
    campoPersonalizado1_regexValidacion?: string;
    campoPersonalizado1_tamanoTexto?: 'text' | 'textArea';

    campoPersonalizado2_etiqueta?: string;
    campoPersonalizado2_isActive?: boolean;
    campoPersonalizado2_necesitaValidacion?: boolean;
    campoPersonalizado2_regexValidacion?: string;
    campoPersonalizado2_tamanoTexto?: 'text' | 'textArea';

    campoPersonalizado3_etiqueta?: string;
    campoPersonalizado3_isActive?: boolean;
    campoPersonalizado3_necesitaValidacion?: boolean;
    campoPersonalizado3_regexValidacion?: string;
    campoPersonalizado3_tamanoTexto?: 'text' | 'textArea';
}

export interface CentroCosto {
    id: CentroCostoId;
    residenciaId: ResidenciaId;
    nombre: string; 
    descripcion?: string;
    codigoInterno?: string; 
    isActive: boolean; 
}

export interface Comedor {
    id: ComedorId;
    nombre: string;
    residenciaId: ResidenciaId;
    descripcion?: string;
    capacidad?: number; 
    centroCostoPorDefectoId?: CentroCostoId;
}

export interface TiempoComida {
    id: TiempoComidaId;
    nombre: string; 
    residenciaId: ResidenciaId;
    nombreGrupo: string; 
    ordenGrupo: number; 
    dia: DayOfWeekKey; 
    horaEstimada?: string; 
}

export interface AlternativaTiempoComida {
    id: AlternativaTiempoComidaId;
    nombre: string; 
    tipo: TipoAlternativa; 
    tipoAcceso: TipoAccesoAlternativa; 
    requiereAprobacion: boolean; 
    ventanaInicio: string; 
    iniciaDiaAnterior?: boolean; 
    ventanaFin: string; 
    terminaDiaSiguiente?: boolean; 
    horarioSolicitudComidaId: HorarioSolicitudComidaId; 
    tiempoComidaId: TiempoComidaId; 
    residenciaId: ResidenciaId;
    comedorId?: ComedorId; 
    isActive: boolean; 
}

export interface TiempoComidaAlternativaUnicaActividad {
  id: ActividadMealDefinitionId; 
  nombreTiempoComida_AlternativaUnica: string; 
  nombreGrupoTiempoComida: string;
  ordenGrupoTiempoComida: number;
  fecha: Timestamp;
  horaEstimadaMeal?: string; 
}

export interface Actividad {
  id: ActividadId;
  residenciaId: ResidenciaId;
  nombre: string; 
  descripcionGeneral?: string;
  fechaInicio: Timestamp; 
  fechaFin: Timestamp;    
  ultimoTiempoComidaIdAntes?: TiempoComidaId; 
  primerTiempoComidaIdDespues?: TiempoComidaId; 
  planComidas?: TiempoComidaAlternativaUnicaActividad[]; 
  requiereInscripcion: boolean;
  aceptaResidentes: boolean;
  aceptaInvitados: 'no' | 'por_invitacion' | 'invitacion_libre';
  tipoAccesoActividad: TipoAccesoActividad; 
  maxParticipantes?: number;
  diasAntelacionCierreInscripcion?: number; 
  defaultCentroCostoId?: CentroCostoId; 
  estado: ActividadEstado;
  organizadorUserId: UserId; 
  tipoSolicitudComidas: TipoSolicitudComidasActividad;
  estadoSolicitudAdministracion: 'no_solicitado' | 'solicitud_inicial_realizada' | 'completada';
}

export interface InscripcionActividad {
  id: InscripcionActividadId; 
  actividadId: ActividadId;
  userId: UserId; 
  residenciaId: ResidenciaId;     
  estadoInscripcion: EstadoInscripcionActividad;
  fechaEstado: Timestamp;        
  invitadoPorUserId?: UserId;     
  fechaInvitacionOriginal?: Timestamp; 
  nombreInvitadoNoAutenticado?: string; 
}

export interface HorarioSolicitudComida {
    id: HorarioSolicitudComidaId;
    residenciaId: ResidenciaId;
    nombre: string; 
    dia: DayOfWeekKey; 
    horaSolicitud: string; 
    isPrimary: boolean; 
    isActive: boolean; 
}

export interface Dieta {
    id: DietaId;
    residenciaId: ResidenciaId;
    nombre: string;
    descripcion?: string;
    isDefault?: boolean; 
    isActive: boolean;
}

export interface AsistentePermisos {
  elecc_uids?: UserId[];
  activ_crear?: boolean;
  activ_gest_propias?: boolean; 
  activ_gest_todas?: boolean;   
  invit_elecc_act_propias?: boolean; 
  invit_elecc_act_todas?: boolean;
  recor_gest_propias?: boolean;
  recor_gest_todas?: boolean;
}

export interface UserProfile {
    id: UserId;
    nombre: string;
    apellido: string;
    email: string;
    roles: UserRole[];
    isActive: boolean;
    residenciaId?: ResidenciaId;
    dietaId?: DietaId; 
    modoEleccion?: ModoEleccionUsuario;
    numeroDeRopa?: string;
    habitacion?: string;
    universidad?: string;
    carrera?: string;
    dni?: string;
    telefonoMovil?: string;
    fechaDeNacimiento?: Timestamp;
    asistentePermisos?: AsistentePermisos; 
    centroCostoPorDefectoId?: CentroCostoId;
    puedeTraerInvitados: 'no' | 'requiere_autorizacion' | 'si';
    notificacionPreferencias?: NotificacionPreferencias;

    // Valores para los campos personalizables (definidos en Residencia)
    valorCampoPersonalizado1?: string;
    valorCampoPersonalizado2?: string;
    valorCampoPersonalizado3?: string;
}



export interface Semanario {
    id?: string; 
    userId: UserId;
    residenciaId: ResidenciaId;
    elecciones: {
        [tiempoComidaId: TiempoComidaId]: AlternativaTiempoComidaId[];
    };
    ultimaActualizacion: Timestamp;
}

export interface Eleccion {
    id?: string;
    usuarioId: UserId;
    residenciaId: ResidenciaId;
    fecha: Timestamp;
    tiempoComidaId?: TiempoComidaId;
    alternativaTiempoComidaId?: AlternativaTiempoComidaId;
    dietaId?: DietaId;
    solicitado: boolean;
    congelado: boolean; 
    asistencia?: boolean;
    fechaSolicitud: Timestamp;
    estadoAprobacion: EstadoAprobacion;
    origen: OrigenEleccion;
    centroCostoId?: CentroCostoId;
    comentario?: string;
    processedForBilling?: boolean;
    actividadId?: ActividadId;
    actividadMealId?: ActividadMealDefinitionId;
    tipoEleccion: 'regular' | 'actividad';
    origenCentroCosto?: 'usuario-por-defecto' | 'comedor-por-defecto' | 'manual' | 'modificado';
}

export interface MealCount {
    id: string; 
    residenciaId: ResidenciaId;
    fecha: Timestamp; 
    fuente: MealCountFuente; 
    tiempoComidaId?: TiempoComidaId; 
    alternativaTiempoComidaId?: AlternativaTiempoComidaId;
    actividadId?: ActividadId;
    actividadMealDefinitionId?: ActividadMealDefinitionId; 
    actividadMealNombreGrupo?: string; 
    actividadMealDescripcion?: string;
    dietaId?: DietaId | 'ninguna';
    centroCostoId?: CentroCostoId | 'ninguno'; 
    totalSolicitado: number; 
    totalAprobado?: number; 
    estadoCentroCosto: 'pendiente' | 'asignado';
}

export interface Ausencia {
    id?: AusenciaId;
    userId: UserId;
    residenciaId: ResidenciaId;
    fechaInicio: Timestamp; 
    ultimoTiempoComidaId?: TiempoComidaId | null; 
    fechaFin: Timestamp; 
    primerTiempoComidaId?: TiempoComidaId | null; 
    retornoPendienteConfirmacion?: boolean; 
    fechaCreacion: Timestamp;
    motivo?: string; 
}

export interface Comentario {
    id: ComentarioId;
    usuarioId: UserId; 
    destinatarioId?: UserId; 
    residenciaId: ResidenciaId;
    texto: string;
    fechaEnvio: Timestamp;
    leido: boolean;
    archivado: boolean;
    relacionadoA?: { 
        coleccion: 'eleccion' | 'ausencia' | 'usuario'; 
        documentoId: string;
    };
}

export interface LogEntry {
    id: LogEntryId;
    timestamp: Timestamp;
    userId: UserId; 
    residenciaId?: ResidenciaId; 
    actionType: LogActionType;
    relatedDocPath?: string; 
    details?: string | object; 
}

export interface Feedback {
  id?: FeedbackId; 
  userId: UserId; 
  userEmail: string; 
  residenciaId?: ResidenciaId; 
  text: string; 
  createdAt: Timestamp; 
  page?: string; 
  userAgent?: string; 
  ipAddress?: string; 
  screenResolution?: string; 
  viewportSize?: string; 
  status?: 'nuevo' | 'leido' | 'procesado'; 
}

export interface Recordatorio {
    id: RecordatorioId;
    residenciaId: ResidenciaId;
    userId: UserId;
    fechaInicio: Timestamp;
    fechaFin: Timestamp;
    isSingleDay: boolean;
    isRecurrente: boolean;
    tipoRecurrente?: TipoRecurrente;
    titulo: string;
    descripcion?: string;
    color: string;
}

export interface Faltas {
    id: string;
    usuario: UserProfile;
    titulo: string;
    descripcion?: string;
    notificada: boolean;
    confirmada: boolean;
    origen: string;
}

export interface Notificacion {
  id: NotificacionId;
  residenciaId: ResidenciaId;
  usuarioId: UserId; // Recipient
  tipo: NotificacionTipo; // e.g., 'info', 'accion_requerida'
  prioridad: NotificacionPrioridad; // e.g., 'alta', 'media'
  titulo: string; // e.g., "Recordatorio: Elige tu comida"
  mensaje: string; // e.g., "Tienes hasta las 8 PM para elegir tu almuerzo."
  relacionadoA?: {
    coleccion: 'eleccion' | 'actividad' | 'ausencia' | 'mealCount';
    documentoId: string;
  };
  leido: boolean; // Whether the user has read the notification
  creadoEn: Timestamp; // Creation timestamp
  venceEn?: Timestamp; // Optional expiration
  entregadoCorreoEn?: Timestamp;
  enviadoCorreoA?: string; // Email address
  estadoCorreo?: 'pendiente' | 'enviado' | 'fallido';
  errorcorreo?: string; // Error message if failed
  entregadoSMSEn?: Timestamp;
  entregadoWAEn?: Timestamp;
  enviadoWAA: string; // Phone number
  estadoWA: 'pendiente' | 'enviado' | 'fallido';
  errorWA?: string; // Error message if failed
  entregadoEnAppEn?: Timestamp;
}

export interface NotificacionPreferencias {
  usuarioId: UserId;
  residenciaId: ResidenciaId;
  canalEmail: boolean; // Opt-in for email
  canalWhatsApp: boolean; // Opt-in for WhatsApp
  canalSMS?: boolean; // Optional opt-in for SMS
  tiposPermitidos: NotificacionTipo[]; // e.g., ['info', 'recordatorio']
  notificacionesSilenciadas?: boolean; // Mute non-critical notifications
}
