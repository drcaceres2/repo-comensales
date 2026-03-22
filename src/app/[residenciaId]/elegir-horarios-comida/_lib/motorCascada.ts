import { TarjetaComidaUI } from "shared/schemas/elecciones/ui.schema";
import { Ausencia, Excepcion, EleccionSemanario,SlotEfectivo } from "shared/schemas/elecciones/domain.schema";
import { GrupoComida, TipoVentanaConfigAlternativa } from "shared/schemas/horarios";
import { estaMuroMovilCerrado } from "./muroMovil";

const EHC_DEBUG = process.env.NODE_ENV !== 'production' || process.env.EHC_DEBUG === '1';

type OpcionResuelta = {
  configuracionAlternativaId: string;
  esAlternativaAlterada: boolean;
  nombre: string;
  descripcion?: string;
  tipo: 'comedor' | 'paraLlevar' | 'noComoEnCasa' | 'ayuno';
  comedorNombre?: string;
  ventanaServicio?: {
    horaInicio: string;
    horaFin: string;
    tipoVentana: TipoVentanaConfigAlternativa;
  };
  requiereAprobacion: boolean;
  disponibleParaElegir: boolean;
  motivoIndisponibilidad?: string;
};

// Estructura de inyección de dependencias para la función pura
export type ContextoCascada = {
  fecha: string;
  tiempoComidaId: string;
  grupoComida: GrupoComida;
  fechaHoraReferenciaUltimaSolicitud: string;
  resolverAlternativa?: (configuracionAlternativaId: string) => Partial<Omit<OpcionResuelta, 'configuracionAlternativaId'>>;
};

/**
 * Agrupa todas las intenciones de un usuario para un (1) Tiempo de Comida específico.
 * Ninguno de estos datos altera la disponibilidad del entorno (eso lo hace la Capa 0),
 * solo reflejan lo que el usuario quiere o debe hacer.
 */
export type CapasResolucionIntencion = {
  // ==========================================
  // CAPA 1: ACTIVIDAD (Inscripción)
  // Prioridad: ALTA
  // ==========================================
  // Aunque las actividades son "etiquetas de cortesía" en el calendario, 
  // si el residente ESTÁ INSCRITO en una actividad que incluye este tiempo de comida 
  // (ej. un asado de la residencia), esta capa anula las demás decisiones.
  inscripcionActividad?: {
    actividadId: string;
    nombreActividad: string;
    configuracionAlternativaId: string; // La alternativa que la actividad le impone (ej. "Menú de Asado")
  };

  // ==========================================
  // CAPA 2: AUSENCIA
  // Prioridad: MEDIA-ALTA
  // ==========================================
  // Resultado pre-calculado por `detectarInterseccionAusencia`. 
  // Si existe, el usuario no comerá en la residencia.
  ausencia?: Ausencia;

  // ==========================================
  // CAPA 3: EXCEPCIÓN PUNTUAL
  // Prioridad: MEDIA
  // ==========================================
  // La decisión táctica del usuario (o del Director) para ESTA fecha y tiempo exacto.
  // Contiene el `estadoAprobacion` y el `origenAutoridad`.
  excepcion?: Excepcion;

  // ==========================================
  // CAPA 4: SEMANARIO (Plantilla Base)
  // Prioridad: BAJA
  // ==========================================
  // La elección recurrente del usuario extraída de su DiccionarioSemanarios 
  // para el día de la semana correspondiente.
  eleccionSemanario?: EleccionSemanario;
};

function construirOpcionDesdeCapa0(
  contexto: ContextoCascada,
  capa0Densa: SlotEfectivo,
  configuracionAlternativaId: string
): OpcionResuelta {
  const desdeCapa0 = capa0Densa.opcionesActivas.find(
    (op) => op.configuracionAlternativaId === configuracionAlternativaId
  );

  const base = contexto.resolverAlternativa?.(configuracionAlternativaId) ?? {};

  const horaReferenciaProceso = contexto.fechaHoraReferenciaUltimaSolicitud;
  const horaCorte = desdeCapa0?.horarioReferenciaSolicitud ?? contexto.fechaHoraReferenciaUltimaSolicitud;
  const muroCerrado = estaMuroMovilCerrado(horaCorte, horaReferenciaProceso);

  return {
    configuracionAlternativaId,
    esAlternativaAlterada: Boolean(desdeCapa0?.configuracionAlternativaId && capa0Densa.esAlterado),
    nombre: base.nombre ?? desdeCapa0?.nombre ?? configuracionAlternativaId,
    descripcion: base.descripcion,
    tipo: base.tipo ?? 'comedor',
    comedorNombre: base.comedorNombre,
    ventanaServicio: base.ventanaServicio ?? (desdeCapa0
      ? {
          horaInicio: desdeCapa0.ventanaServicio.horaInicio,
          horaFin: desdeCapa0.ventanaServicio.horaFin,
          tipoVentana: desdeCapa0.ventanaServicio.tipoVentana,
        }
      : undefined),
    requiereAprobacion: base.requiereAprobacion ?? false,
    disponibleParaElegir: !muroCerrado,
    motivoIndisponibilidad: muroCerrado ? 'Plazo de solicitud cerrado.' : undefined,
  };
}

function construirOpcionesDrawer(contexto: ContextoCascada, capa0Densa: SlotEfectivo): OpcionResuelta[] {
  const ids = new Set<string>();
  for (const op of capa0Densa.opcionesActivas) {
    ids.add(op.configuracionAlternativaId);
  }
  ids.add(capa0Densa.contingenciaAlternativaId);

  return [...ids].map((id) => construirOpcionDesdeCapa0(contexto, capa0Densa, id));
}

function resolverAlternativaConFallback(
  capa0Densa: SlotEfectivo,
  configuracionAlternativaId?: string
): string {
  const fallbackId = capa0Densa.contingenciaAlternativaId;
  if (!configuracionAlternativaId) {
    return fallbackId;
  }

  if (configuracionAlternativaId === fallbackId) {
    return fallbackId;
  }

  const existeEnCapa0 = capa0Densa.opcionesActivas.some(
    (op) => op.configuracionAlternativaId === configuracionAlternativaId
  );

  return existeEnCapa0 ? configuracionAlternativaId : fallbackId;
}

export function resolverCascadaTiempoComida(
  contexto: ContextoCascada,
  capa0Densa: SlotEfectivo,
  capasIntencion: CapasResolucionIntencion
): TarjetaComidaUI {
  const opcionesDrawer = construirOpcionesDrawer(contexto, capa0Densa);
  const primeraOpcion = construirOpcionDesdeCapa0(
    contexto,
    capa0Densa,
    resolverAlternativaConFallback(capa0Densa)
  );

  let resultado = primeraOpcion;
  let origen: TarjetaComidaUI['origenResolucion'] = 'FALLBACK_SISTEMA';
  let origenTarjeta: TarjetaComidaUI['origen'] = 'sistema';
  let estadoInteraccion: TarjetaComidaUI['estadoInteraccion'] = 'MUTABLE';
  let mensajeFormativo: string | undefined;
  let estadoAprobacion: TarjetaComidaUI['estadoAprobacion'] | undefined;
  let detalleAusencia: TarjetaComidaUI['detallesDrawer']['detalleAusencia'] | undefined;

  if (capa0Densa.esAlterado && capa0Densa.opcionesActivas.length === 0) {
    resultado = construirOpcionDesdeCapa0(contexto, capa0Densa, capa0Densa.contingenciaAlternativaId);
    origen = 'CAPA0_ALTERACION';
    estadoInteraccion = 'BLOQUEADO_SISTEMA';
    mensajeFormativo = capa0Densa.motivo ?? 'Horario alterado por dirección. Esta tarjeta no admite cambios.';
  } else if (capasIntencion.inscripcionActividad) {
    const alternativaActividad = resolverAlternativaConFallback(
      capa0Densa,
      capasIntencion.inscripcionActividad.configuracionAlternativaId
    );
    resultado = construirOpcionDesdeCapa0(
      contexto,
      capa0Densa,
      alternativaActividad
    );
    origen = 'CAPA1_ACTIVIDAD';
    origenTarjeta = 'actividad';
    estadoInteraccion = 'BLOQUEADO_AUTORIDAD';
    mensajeFormativo = `Estás inscrito en la actividad '${capasIntencion.inscripcionActividad.nombreActividad}'.`;
  } else if (capasIntencion.ausencia) {
    resultado = construirOpcionDesdeCapa0(contexto, capa0Densa, capa0Densa.contingenciaAlternativaId);
    origen = 'CAPA2_AUSENCIA';
    origenTarjeta = 'ausencia';
    estadoInteraccion = 'BLOQUEADO_RESTRICCION';
    mensajeFormativo = 'Ausencia activa para este tiempo de comida.';

    // En superficie no debe verse la resolución de capas inferiores durante una ausencia.
    resultado = {
      ...resultado,
      nombre: 'Ausente',
      tipo: 'noComoEnCasa',
    };

    detalleAusencia = {
      fechaInicio: capasIntencion.ausencia.fechaInicio,
      fechaFin: capasIntencion.ausencia.fechaFin,
      primerTiempoAusente: capasIntencion.ausencia.primerTiempoAusente ?? null,
      ultimoTiempoAusente: capasIntencion.ausencia.ultimoTiempoAusente ?? null,
      motivo: capasIntencion.ausencia.motivo ?? undefined,
    };
  } else if (capasIntencion.excepcion?.estadoAprobacion === 'aprobada') {
    const alternativaExcepcion = resolverAlternativaConFallback(
      capa0Densa,
      capasIntencion.excepcion.configuracionAlternativaId
    );
    resultado = construirOpcionDesdeCapa0(contexto, capa0Densa, alternativaExcepcion);
    origen = 'CAPA3_EXCEPCION';
    origenTarjeta = 'excepcion';
    estadoInteraccion = capasIntencion.excepcion.origenAutoridad === 'director-restringido'
      ? 'BLOQUEADO_AUTORIDAD'
      : 'MUTABLE';
    estadoAprobacion = 'aprobada';
    if (capasIntencion.excepcion.origenAutoridad === 'director-restringido') {
      mensajeFormativo = 'Esta decisión fue fijada por dirección y no puede ser modificada por el residente.';
    }
  } else if (capasIntencion.eleccionSemanario) {
    const alternativaSemanario = resolverAlternativaConFallback(
      capa0Densa,
      capasIntencion.eleccionSemanario.configuracionAlternativaId
    );
    resultado = construirOpcionDesdeCapa0(
      contexto,
      capa0Densa,
      alternativaSemanario
    );
    origen = 'CAPA4_SEMANARIO';
    origenTarjeta = 'semanario';
    estadoInteraccion = 'MUTABLE';
  }

  if (capasIntencion.excepcion?.estadoAprobacion === 'pendiente') {
    estadoAprobacion = 'pendiente';
    if (!mensajeFormativo) {
      mensajeFormativo = 'Tu excepción está pendiente de aprobación. Se mantiene la elección base.';
    }
  }

  // Muro móvil: si la tarjeta aún es MUTABLE pero el plazo de solicitud del resultado
  // efectivo ya fue superado por la última consolidación, bloquearla a nivel sistema.
  // Esto respeta la jerarquía de capas: solo actúa cuando ninguna capa superior ya bloqueó.
  if (estadoInteraccion === 'MUTABLE' && !resultado.disponibleParaElegir) {
    estadoInteraccion = 'BLOQUEADO_SISTEMA';
    if (!mensajeFormativo) {
      mensajeFormativo = resultado.motivoIndisponibilidad ?? 'Plazo de solicitud cerrado.';
    }
  }

  if (EHC_DEBUG) {
    console.log('[EHC][motorCascada] resultado', {
      fecha: contexto.fecha,
      tiempoComidaId: contexto.tiempoComidaId,
      capas: {
        alteracionDura: capa0Densa.esAlterado && capa0Densa.opcionesActivas.length === 0,
        actividad: Boolean(capasIntencion.inscripcionActividad),
        ausencia: Boolean(capasIntencion.ausencia),
        excepcionAprobada: capasIntencion.excepcion?.estadoAprobacion === 'aprobada',
        excepcionPendiente: capasIntencion.excepcion?.estadoAprobacion === 'pendiente',
        semanario: Boolean(capasIntencion.eleccionSemanario),
      },
      salida: {
        origen: origenTarjeta,
        origenResolucion: origen,
        estadoInteraccion,
        configuracionAlternativaId: resultado.configuracionAlternativaId,
      },
    });
  }

  return {
    tiempoComidaId: contexto.tiempoComidaId,
    grupoComida: {
      id: contexto.tiempoComidaId,
      nombre: contexto.grupoComida.nombre,
      colorBase: undefined,
    },
    resultadoEfectivo: {
      configuracionAlternativaId: resultado.configuracionAlternativaId,
      nombre: resultado.nombre,
      tipo: resultado.tipo,
      colorBase: undefined,
    },
    estadoInteraccion,
    origenResolucion: origen,
    origen: origenTarjeta,
    estadoAprobacion,
    detallesDrawer: {
      mensajeFormativo,
      detalleAusencia,
      opciones: estadoInteraccion === 'BLOQUEADO_SISTEMA' ? undefined : opcionesDrawer,
    },
  };
}