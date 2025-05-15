export type UserId = string;
export type UserRole = 'master' | 'admin' | 'director' | 'residente' | 'invitado' | 'asistente' | 'auditor';
export type DietaId = string;
export type ResidenciaId = string;
export type CentroCostoId = string;
export type NotificacionTipo = 'info' | 'accion_requerida' | 'recordatorio' | 'alerta'; // New
export type ComedorId = string;
export type TiempoComidaId = string;
export type AlternativaTiempoComidaId = string;
export type ComentarioId = string;
export type HorarioSolicitudComidaId = string;

export type AusenciaId = string;
export type ExcepcionId = string;

export type ActividadId = string; 
export type InscripcionActividadId = string; 
export type TiempoComidaAlternativaUnicaActividadId = string; 
export type FeedbackId = string; 
export type RecordatorioId = string;

export type LogEntryId = string;
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

    export type DayOfWeekKey = 'lunes' | 'martes' | 'miercoles' | 'jueves' | 'viernes' | 'sabado' | 'domingo';
    export type TipoAccesoAlternativa = 'abierto' | 'autorizado' | 'cerrado';
    export type EstadoAprobacion = 'pendiente' | 'aprobado' | 'rechazado' | 'no_requerido' | 'contingencia' | 'contingencia_no_considerada' | 'anulada_por_cambio';
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
    export type NotificacionPrioridad = 'baja' | 'media' | 'alta'; // New
    
    export type NotificacionId = string;

    export type grupoUsuarioId = string;
    
    // --- Interfaces ---
    
export interface grupoUsuario {
    id: grupoUsuarioId;
    etiqueta: string;
    tipoGrupo: 'eleccion-comidas' | 'centro-de-costo' | 'personalizado';
    descripcion?: string;
    centroCostoId?: CentroCostoId;
}

export interface UsuariosGrupos {
    id: string;
    usuario: UserId;
    grupo: grupoUsuarioId;
}

export interface PermisosComidaPorGrupo {
    id: string;
    grupoPermisos: grupoUsuarioId;
    usoSemanario: boolean;
    usoExcepciones: boolean;
    confirmacionAsistencia: boolean;
    confirmacionDiariaElecciones: boolean;
    horarioConfirmacionDiaria?: string; // Hora en ISO 8601 hh:mm
    restriccionAlternativas: boolean;
    alternativasRestringidas?: alternativaRestringidaDetalle[];
    autorizacionLocalizacion: boolean;
}

export interface alternativaRestringidaDetalle {
    requiereAprobacion: boolean;
    alternativaRestringida: AlternativaTiempoComidaId;
}

export interface UserProfile {
    id: UserId;
    nombre: string;
    apellido: string;
    email: string;
    roles: UserRole[];
    isActive: boolean;
    residenciaId?: ResidenciaId | null; // Now allows null
    dietaId?: DietaId;
    numeroDeRopa?: string;
    habitacion?: string;
    universidad?: string;
    carrera?: string;
    dni?: string;
    telefonoMovil?: string;
    fechaDeNacimiento?: string | null; // Store as ISO string or number (millis)
    asistentePermisos?: AsistentePermisos | null; // Now allows null
    centroCostoPorDefectoId?: CentroCostoId;
    puedeTraerInvitados: 'no' | 'requiere_autorizacion' | 'si';
    notificacionPreferencias?: NotificacionPreferencias | null; // Now allows null

    fechaCreacion?: number | null;      // Milliseconds since epoch, or null
    ultimaActualizacion?: number | null; // Milliseconds since epoch, or null
    lastLogin?: number | null;          // Milliseconds since epoch, or null (if you track this)

    // Valores para los campos personalizables (definidos en Residencia)
    valorCampoPersonalizado1?: string;
    valorCampoPersonalizado2?: string;
    valorCampoPersonalizado3?: string;
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

export interface AsistentePermisos {
    usuariosAsistidos?: UserId[];
    gestionActividades: 'Todas' | 'Propias' | 'Ninguna';
    gestionInvitados: 'Todos' | 'Propios' | 'Ninguno';
    gestionRecordatorios: 'Todos' | 'Propios' | 'Ninguno';
  }
  

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


export interface CentroCosto {
    id: CentroCostoId;
    residenciaId: ResidenciaId;
    nombre: string; 
    descripcion?: string;
    codigoInterno?: string; 
    isActive: boolean; 
}


export interface LogEntry {
    id: LogEntryId;
    timestamp: string | number; // Server will convert to ServerTimestamp, client will handle string/number
    userId: UserId;
    targetUid?: UserId | null;
    residenciaId?: ResidenciaId; 
    actionType: LogActionType;
    relatedDocPath?: string; 
    details?: string | object; 
}


export interface Actividad {
    id: ActividadId;
    residenciaId: ResidenciaId;
    nombre: string; 
    descripcionGeneral?: string;
    fechaInicio: string;  // Timestamp stored as ISO string
    fechaFin: string;  // Timestamp stored as ISO string
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
    fechaEstado: string; // Timestamp stored as ISO string
    invitadoPorUserId?: UserId;     
    fechaInvitacionOriginal?: string | null; // Timestamp stored as ISO string
    nombreInvitadoNoAutenticado?: string; 
  }
  
  export interface HorarioSolicitudComida {
      id: HorarioSolicitudComidaId;
      residenciaId: ResidenciaId;
      nombre: string; 
      dia: DayOfWeekKey; 
      horaSolicitud: string; // Timestamp stored as ISO string
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
  
  export interface Semanario {
      id?: string; 
      userId: UserId;
      residenciaId: ResidenciaId;
      elecciones: {
          [tiempoComidaId: TiempoComidaId]: AlternativaTiempoComidaId[];
      };
      ultimaActualizacion: number; // Timestamp stored as number (millis)
  }
  
  export interface Eleccion {
      id?: string;
      usuarioId: UserId;
      residenciaId: ResidenciaId;
      fecha: string; // Timestamp stored as ISO string
      tiempoComidaId?: TiempoComidaId;
      alternativaTiempoComidaId?: AlternativaTiempoComidaId;
      dietaId?: DietaId;
      solicitado: boolean;
      congelado: boolean; 
      asistencia?: boolean;
      fechaSolicitud: string; // Timestamp stored as ISO string
      estadoAprobacion: EstadoAprobacion;
      origen: OrigenEleccion;
      centroCostoId?: CentroCostoId;
      comentario?: string;
      processedForBilling?: boolean;
      actividadId?: ActividadId;
      TiempoComidaAlternativaUnicaActividadId?: TiempoComidaAlternativaUnicaActividadId;
      tipoEleccion: 'regular' | 'actividad';
      origenCentroCosto?: 'usuario-por-defecto' | 'comedor-por-defecto' | 'manual' | 'modificado';
  }
  
  export interface MealCount {
      id: string; 
      residenciaId: ResidenciaId;
      fecha: string; // Timestamp stored as ISO string
      fuente: MealCountFuente; 
      tiempoComidaId?: TiempoComidaId; 
      alternativaTiempoComidaId?: AlternativaTiempoComidaId;
      actividadId?: ActividadId;
      TiempoComidaAlternativaUnicaActividadId?: TiempoComidaAlternativaUnicaActividadId; 
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
      fechaInicio: string; // Timestamp stored as ISO string
      ultimoTiempoComidaId?: TiempoComidaId | null; 
      fechaFin: string; // Timestamp stored as ISO string
      primerTiempoComidaId?: TiempoComidaId | null; 
      retornoPendienteConfirmacion?: boolean; 
      fechaCreacion: number; // Timestamp stored as number (millis)
      motivo?: string; 
  }
  
  export interface Comentario {
      id: ComentarioId;
      usuarioId: UserId; 
      destinatarioId?: UserId; 
      residenciaId: ResidenciaId;
      texto: string;
      fechaEnvio: number; // Timestamp stored as number (millis)
      leido: boolean;
      archivado: boolean;
      relacionadoA?: { 
          coleccion: 'eleccion' | 'ausencia' | 'usuario'; 
          documentoId: string;
      };
  }
  
  export interface Feedback {
    id?: FeedbackId; 
    userId: UserId; 
    userEmail: string; 
    residenciaId?: ResidenciaId; 
    text: string; 
    createdAt: number; // Timestamp stored as number (millis)
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
      fechaInicio: string; // Timestamp stored as ISO string
      fechaFin: string; // Timestamp stored as ISO string
      isSingleDay: boolean;
      isRecurrente: boolean;
      tipoRecurrente?: TipoRecurrente;
      titulo: string;
      descripcion?: string;
      color: string;
  }
  
  export interface Faltas {
      id: string;
      fecha: number; // Timestamp stored as number (millis)
      residencia: ResidenciaId;
      usuario: UserId;
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
  
export interface TiempoComidaAlternativaUnicaActividad {
    id: TiempoComidaAlternativaUnicaActividadId; 
    nombreTiempoComida_AlternativaUnica: string; 
    nombreGrupoTiempoComida: string;
    ordenGrupoTiempoComida: number;
    fecha: string;  // Timestamp stored as ISO string
    horaEstimadaMeal?: string; 
  }
  