import type { FechaIso, FechaHoraIso, HoraIso, DiaDeLaSemana, ZonaHorariaIana } from '../schemas/fechas';
import {Email} from "../schemas/common";

export const ctxTraduccionSoportados = ['es', 'es-HN', 'es-ES'];

export interface InfoUsuario {
    usuarioId: UsuarioId,
    email: Email,
    roles: RolUsuario[],
    residenciaId: ResidenciaId,
    zonaHoraria: ZonaHorariaIana,
    ctxTraduccion: string
}

export type TimestampString = string; // ISO 8601 (ejemplo "2023-10-25T14:00:00.000Z"

// Tipos para ubicaciones, zonas horarias, fechas y horas
export type CodigoPaisIso = string; // ISO 3166-1 alpha-2 (ej: "HN", "MX", "ES")
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
export const CONFIG_RESIDENCIA_ID = "general";
export type HorarioSolicitudComidaId = string; // ID semántico: slug estilo kebab a partir del nombre (INMUTABLE)
export type ComedorId = string; // ID semántico: slug estilo kebab a partir del nombre (INMUTABLE)
export type GrupoUsuariosId = string; // ID semántico: slug estilo kebab a partir del nombre (INMUTABLE)
export type DietaId = string; // ID semántico: slug estilo kebab a partir del nombre (INMUTABLE)

// --- Comidas disponibles para elegir ---
export type TiempoComidaId = string; // ID semántico: slug estilo kebab a partir del nombre (INMUTABLE)
export type AlternativaId = string; // ID semántico: slug estilo kebab a partir del nombre (INMUTABLE)
export type ConfigAlternativaId = string;
export type AlteracionHorarioId = string;
export const HORARIOS_QUERY_KEY = 'horarios';
export const SEMANARIOS_QUERY_KEY = 'semanarios';

// --------------------------------------------------------
// 1. MODELO DE INTENCIÓN (Mutable por el usuario/reglas)
// --------------------------------------------------------

export type ExcepcionId = string;
export type AusenciaId = string;
export type SemanarioUsuarioId = string;

export type ActionResponse<T = void> = {
  success: boolean;
  data?: T;
  error?: {
    code: 'UNAUTHORIZED' | 'MURO_MOVIL_CERRADO' | 'AUTORIDAD_RESTRINGIDA' | 'VALIDATION_ERROR' | 'INTERNAL';
    message: string;
    detalles?: any; // Para pasar ZodIssues al formulario
  };
};

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
        novedadesOperativas: NovedadOperativaId[];
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

// --- Novedades Operativas ---
export type NovedadOperativaId = string;
export type RecordatorioId = string;

// --- Actividades ---
export type ActividadId = string; 
export type DetalleActividadId = string; 
export type InscripcionActividadId = string; 
export type AtencionId = string;

// --- Notificaciones ---
export type NotificacionId = string;
export type NotificacionTipo = 'info' | 'accion_requerida' | 'recordatorio' | 'alerta'; // New
export type NotificacionPrioridad = 'baja' | 'media' | 'alta'; // New
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
    // Novedades Operativas
    | 'NOVEDAD_OPERATIVA_CREADA' | 'NOVEDAD_OPERATIVA_ACTUALIZADA' | 'NOVEDAD_OPERATIVA_ELIMINADA'
    // Modo de elección
    | 'MODO_ELECCION_CREADO' | 'MODO_ELECCION_ACTUALIZADO' | 'MODO_ELECCION_ELIMINADO'
    // Elecciones (Meal selections)
    | 'ELECCION_CREADA' | 'ELECCION_ACTUALIZADA' | 'ELECCION_ELIMINADA'
    // Semanarios
    | 'SEMANARIO_ACTUALIZADO'
    // Actividades
    | 'ACTIVIDAD_CREADA' | 'ACTIVIDAD_ACTUALIZADA' | 'ACTIVIDAD_ELIMINADA'
    // Inscripciones a actividades
    | 'INSCRIPCION_USUARIO_ACTIVIDAD' | 'SALIDA_USUARIO_ACTIVIDAD' | 'INVITACION_USUARIO_ACTIVIDAD'
    // Asistentes
    | 'PERMISO_ASISTENTE_ACTUALIZADO' | 'PERMISO_ASISTENTE_ACTUALIZADO' | 'PERMISO_ASISTENTE_REVOCADO'
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