import { FieldValue } from 'firebase/firestore';

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
    dni?: string;
    telefonoMovil?: string;
    fechaDeNacimiento?: string | null; // Fecha almacenada como ISO 8601 string "YYYY-MM-DD"
    asistentePermisos?: AsistentePermisos | null;
    centroCostoPorDefectoId?: CentroCostoId | null;
    puedeTraerInvitados: 'no' | 'requiere_autorizacion' | 'si' | null;
    notificacionPreferencias?: NotificacionPreferencias | null; 
    tieneAutenticacion: boolean;

    fechaCreacion?: number | null;      // Milliseconds since epoch, or null 
    ultimaActualizacion?: number | null; // Milliseconds since epoch, or null
    lastLogin?: number | null;          // Milliseconds since epoch, or null (if you track this)

    // Valores para los campos personalizables (definidos en Residencia)
    valorCampoPersonalizado1?: string;
    valorCampoPersonalizado2?: string;
    valorCampoPersonalizado3?: string;
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
    fechaDeNacimiento?: string | null; // Fecha almacenada como ISO 8601 string "YYYY-MM-DD"
    notificacionPreferencias?: NotificacionPreferencias | null; 
    tieneAutenticacion: boolean;

    fechaCreacion?: number | null;      // Milliseconds since epoch, or null 
    ultimaActualizacion?: number | null; // Milliseconds since epoch, or null
    lastLogin?: number | null;          // Milliseconds since epoch, or null (if you track this)
}
export interface NotificacionPreferencias {
    canalEmail: boolean; // Opt-in for email
    canalWhatsApp: boolean; // Opt-in for WhatsApp
    canalSMS?: boolean; // Optional opt-in for SMS
    tiposPermitidos: NotificacionTipo[]; // e.g., ['info', 'recordatorio']
    notificacionesSilenciadas?: boolean; // Mute non-critical notifications
    horaMaxima?: string;
    horaMinima?: string;
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
    fechaInicio?: string | null; // Fecha almacenada como ISO 8601 string "YYYY-MM-DD"
    fechaFin?: string | null; // Fecha almacenada como ISO 8601 string "YYYY-MM-DD"
}
export interface AsistenciasUsuariosDetalle {
    usuarioAsistido: UserId;
    restriccionTiempo: boolean;
    fechaInicio?: string | null; // Fecha almacenada como ISO 8601 string "YYYY-MM-DD"
    fechaFin?: string | null; // Fecha almacenada como ISO 8601 string "YYYY-MM-DD"
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
    horarioConfirmacionDiaria?: string; // Hora en ISO 8601 hh:mm en zona horaria de la residencia
    restriccionAlternativas: boolean;
    alternativasRestringidas?: alternativaRestringidaDetalle[];
    autorizacionLocalizacion: boolean;
}
export interface alternativaRestringidaDetalle {
    requiereAprobacion: boolean;
    alternativaRestringida: AlternativaTiempoComidaId;
}
export interface Faltas {
    id: string;
    fecha: number; // Timestamp stored as number (millis) from epoch
    residencia: ResidenciaId;
    usuario: UserId;
    titulo: string;
    descripcion?: string;
    notificada: boolean;
    confirmada: boolean;
    origen: string;
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
    zonaHoraria: string; // Zona horaria de la residencia en formato IANA (lista jerarquizada en dos niveles en @/zonas_horarias_dif.json)

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
    campoPersonalizado1_puedeModDirector?: boolean;
    campoPersonalizado1_puedeModInteresado?: boolean;

    campoPersonalizado2_etiqueta?: string;
    campoPersonalizado2_isActive?: boolean;
    campoPersonalizado2_necesitaValidacion?: boolean;
    campoPersonalizado2_regexValidacion?: string;
    campoPersonalizado2_tamanoTexto?: 'text' | 'textArea';
    campoPersonalizado2_puedeModDirector?: boolean;
    campoPersonalizado2_puedeModInteresado?: boolean;

    campoPersonalizado3_etiqueta?: string;
    campoPersonalizado3_isActive?: boolean;
    campoPersonalizado3_necesitaValidacion?: boolean;
    campoPersonalizado3_regexValidacion?: string;
    campoPersonalizado3_tamanoTexto?: 'text' | 'textArea';
    campoPersonalizado3_puedeModDirector?: boolean;
    campoPersonalizado3_puedeModInteresado?: boolean;

    configuracionContabilidad: ConfigContabilidad | null;

    estadoContrato: 'activo' | 'prueba' | 'inactivo';
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
    horaSolicitud: string; // hora en formato ISO 8601 "HH:mm" en zona horaria de la residencia
    isPrimary: boolean; 
    isActive: boolean; 
}
export type DietaId = string;
export interface Dieta {
    id: DietaId;
    residenciaId: ResidenciaId;
    nombre: string;
    descripcion?: string;
    isDefault?: boolean; 
    isActive: boolean;
}

// --- Comidas disponibles para elegir ---
export type TiempoComidaId = string;
export interface TiempoComida {
    id: TiempoComidaId;
    nombre: string; 
    residenciaId: ResidenciaId;
    nombreGrupo: string; 
    ordenGrupo: number;
    dia?: DayOfWeekKey | null; // null cuando no es aplicación ordinaria
    horaEstimada?: string | null; 
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
    ventanaInicio: string; // hora en formato ISO 8601 "HH:mm" en zona horaria de la residencia
    iniciaDiaAnterior?: boolean; 
    ventanaFin: string; // hora en formato ISO 8601 "HH:mm" en zona horaria de la residencia
    terminaDiaSiguiente?: boolean; 
    horarioSolicitudComidaId?: HorarioSolicitudComidaId | null; 
    tiempoComidaId: TiempoComidaId; 
    residenciaId: ResidenciaId;
    comedorId?: ComedorId; 
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
    fechaInicio: string; // Fecha almacenada como cadena (string) en formato ISO 8601 "YYYY-MM-DD" en zona horaria de la residencia
    fechaFin: string; // Fecha almacenada como cadena (string) en formato ISO 8601 "YYYY-MM-DD" en zona horaria de la residencia
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
    horaEstimada?: string | null; 
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
    ventanaInicio?: string | null;              // Se utiliza solo si tipoAlteracion!='eliminar'
    iniciaDiaAnterior?: boolean | null;         // Se utiliza solo si tipoAlteracion!='eliminar'
    ventanaFin?: string | null;                 // Se utiliza solo si tipoAlteracion!='eliminar'
    terminaDiaSiguiente?: boolean | null;       // Se utiliza solo si tipoAlteracion!='eliminar'
    comedorId?: ComedorId | null;
}

// --- Elecciones de los residentes e invitados
export type EstadoAprobacion = 'pendiente' | 'aprobado' | 'rechazado' | 'no_requerido' | 'contingencia' | 'contingencia_no_considerada' | 'anulada_por_cambio';
export type OrigenEleccion = 
    | 'semanario' 
    | 'excepcion' // excepción que no necesitaba autorización
    | 'excepcion_autorizada' // excepción que sí necesitaba autorización y fue concedida
    | 'contingencia' // excepcion que no fue autorizada y quedó la contingencia
    | 'director' 
    | 'invitado_wizard'
    | 'actividad'; 
export interface Semanario {
    id?: string; 
    userId: UserId;
    residenciaId: ResidenciaId;
    elecciones: {
        [tiempoComidaId: TiempoComidaId]: AlternativaTiempoComidaId | null;
    };
    ultimaActualizacion: number; // Timestamp stored as number (millis)
}
export interface Eleccion {
    id?: string;
    usuarioId: UserId;
    residenciaId: ResidenciaId;
    fecha: string; // Date stored as a string using ISO 8601 format "YYYY-Www-D" to be handled as a date in Residencia timezone
    tiempoComidaId?: TiempoComidaId;
    alternativaTiempoComidaId?: AlternativaTiempoComidaId;
    dietaId?: DietaId;
    solicitadoAdministracion: boolean;
    congelado: boolean; // El proceso de solicitud a la administración comenzó y ya no se pueden hacer cambios aunque no se haya hecho la solicitud
    asistencia?: boolean | null; // null si no se sabe, true si comió, false si no llegó a comer
    fechaSolicitudAdministracion: string; // Date stored as a string using ISO 8601 format "YYYY-Www-D" to be handled as a date in Residencia timezone
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
export type AusenciaId = string;
export interface Ausencia {
    id?: AusenciaId;
    userId: UserId;
    residenciaId: ResidenciaId;
    fechaInicio: string;  // Date stored as a string using ISO 8601 format "YYYY-Www-D" to be handled as a date in Residencia timezone
    ultimoTiempoComidaId?: TiempoComidaId | null; 
    fechaFin: string;  // Date stored as a string using ISO 8601 format "YYYY-Www-D" to be handled as a date in Residencia timezone
    primerTiempoComidaId?: TiempoComidaId | null; 
    retornoPendienteConfirmacion?: boolean; 
    fechaCreacion: number; // Timestamp stored as number (millis) from epoch
    motivo?: string; 
}
export type ComentarioId = string;
export interface Comentario {
    id: ComentarioId;
    usuarioId: UserId; 
    destinatarioId?: UserId; 
    residenciaId: ResidenciaId;
    texto: string;
    fechaEnvio: number; // Timestamp stored as number (millis) from epoch
    leido: boolean;
    archivado: boolean;
    relacionadoA?: { 
        coleccion: 'eleccion' | 'ausencia' | 'usuario'; 
        documentoId: string;
    };
}
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

// --- Solicitud a la administración ---
export interface comensalesSolicitadosAdministracion {
    id: string; 
    residenciaId: ResidenciaId;
    fecha: string;  // Date stored as a string using ISO 8601 format "YYYY-Www-D" to be handled as a date in Residencia timezone
    tipo: 'residencia' | 'actividad-externa'; // Cuando la actividad es externa, hay un recuento separado de comensales
    tiempoComidaId?: TiempoComidaId; 
    alternativaTiempoComidaId?: AlternativaTiempoComidaId;
    actividadId?: ActividadId;
    TiempoComidaAlternativaUnicaActividadId?: TiempoComidaAlternativaUnicaActividadId; 
    dietaId?: DietaId | 'ninguna';
    totalSolicitadoAdministracion: number; 
}
export type RecordatorioId = string;
export interface Recordatorio {
    id: RecordatorioId;
    residenciaId: ResidenciaId;
    userId: UserId;
    fechaInicio: string; // Date stored as a string using ISO 8601 format "YYYY-Www-D" to be handled as a date in Residencia timezone
    fechaFin: string; // Date stored as a string using ISO 8601 format "YYYY-Www-D" to be handled as a date in Residencia timezone
    isSingleDay: boolean;
    isRecurrente: boolean;
    recurrenciaRecordatorio?: RecurrenciaRecordatorio;
    titulo: string;
    descripcion?: string;
    color: string;
}
export type RecurrenciaRecordatorio = 'semanal' | 'quincenal' | 'mensual-diasemana' | 'mensual-diames' | 'anual';

// --- Actividades ---
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
    fechaInicio: string; // Fecha almacenada como cadena (string) en formato ISO 8601 "YYYY-MM-DD" en zona horaria de la residencia
    fechaFin: string; // Fecha almacenada como cadena (string) en formato ISO 8601 "YYYY-MM-DD" en zona horaria de la residencia
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
    fechaEstado: number; // Timestamp as miliseconds from epoch
    invitadoPorUserId?: UserId;     
    fechaInvitacionOriginal?: number | null; // Timestamp as miliseconds from epoch
    nombreInvitadoNoAutenticado?: string; 
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
    fecha: string;  // Timestamp stored as ISO string 
    horaEstimadaMeal?: string; 
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
    // Semanarios
    | 'SEMANARIO_CREADO' | 'SEMANARIO_ACTUALIZADO' | 'SEMANARIO_ELIMINADO'
    // Elecciones
    | 'ELECCION_CREADA' | 'ELECCION_ACTUALIZADA' | 'ELECCION_ELIMINADA'
    // Ausencias
    | 'AUSENCIA_CREADA' | 'AUSENCIA_ACTUALIZADA' | 'AUSENCIA_ELIMINADA'
    // Autorizaciones
    | 'AUTORIZACION_CREADA' | 'AUTORIZACION_ACTUALIZADA' | 'AUTORIZACION_ELIMINADA'
    // Comentarios
    | 'COMENTARIO_CREADO' | 'COMENTARIO_ACTUALIZADO' | 'COMENTARIO_ELIMINADO'
    // Modo de elección
    | 'MODO_ELECCION_CREADO' | 'MODO_ELECCION_ACTUALIZADO' | 'MODO_ELECCION_ELIMINADO'
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
    
// --- Otros ---
export interface campoFechaConZonaHoraria {
    fecha: string; // fecha-hora, fecha u hora guardada en formato ISO: "YYYY-MM-DD" / "yyyy-MM-dd HH:mm" / "yyyy-MM-dd HH:mm:ss" / "HH:mm" / "HH:mm:ss"
    zonaHoraria: string; // formato IANA de zona horaria
}
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