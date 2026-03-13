import { ConfiguracionResidencia } from "shared/schemas/residencia";
import { HorarioEfectivoDiario, Ausencia, Excepcion, DiccionarioSemanarios } from "shared/schemas/elecciones/domain.schema";
import { CargaHorariosUI, CargaHorariosUISchema } from "shared/schemas/elecciones/ui.schema";
import { densificarCapa0 } from "./densificadorCapa0";
import { detectarInterseccionAusencia } from "./interseccionAusencias";
import { resolverCascadaTiempoComida } from "./motorCascada";
import { getISOWeek, getISOWeekYear, parseISO } from "date-fns";

const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'] as const;

type InscripcionActividadInput = {
  actividadId: string;
  nombreActividad: string;
  configuracionAlternativaId: string;
  fechaInicio: string;
  fechaFin: string;
  tiemposComidaIds?: string[];
};

export type InputsOrquestador = {
  fechasRango: string[]; // Arreglo de 7 fechas ISO
  fechaHoraReferenciaUltimaSolicitud: string;
  
  // Colecciones crudas obtenidas por la Server Action
  singletonResidencia: ConfiguracionResidencia; 
  vistaMaterializadaDiaria: Record<string, HorarioEfectivoDiario>; // Key: Fecha
  diccionarioSemanarios: DiccionarioSemanarios;
  excepcionesUsuario: Excepcion[];
  ausenciasUsuario: Ausencia[];
  inscripcionesActividad?: InscripcionActividadInput[];
};

function obtenerDiaSemana(fechaIso: string): string {
  const fecha = new Date(`${fechaIso}T00:00:00Z`);
  if (Number.isNaN(fecha.getTime())) {
    throw new Error(`[generarPayloadHorariosUI] Fecha inválida en rango: ${fechaIso}`);
  }
  return DIAS_SEMANA[fecha.getUTCDay()];
}

function obtenerSemanaIso(fechaIso: string): string {
  const fecha = parseISO(fechaIso);
  const week = getISOWeek(fecha).toString().padStart(2, '0');
  const year = getISOWeekYear(fecha).toString();
  return `${year}-W${week}`;
}

function ordenarTiemposDelDia(singleton: ConfiguracionResidencia, fecha: string): string[] {
  const dia = obtenerDiaSemana(fecha);

  return Object.entries(singleton.esquemaSemanal)
    .filter(([, tiempo]) => tiempo.estaActivo && tiempo.dia === dia)
    .sort((a, b) => {
      const grupoA = singleton.gruposComidas[a[1].grupoComida];
      const grupoB = singleton.gruposComidas[b[1].grupoComida];
      const ordenGrupoA = grupoA?.orden ?? Number.MAX_SAFE_INTEGER;
      const ordenGrupoB = grupoB?.orden ?? Number.MAX_SAFE_INTEGER;

      if (ordenGrupoA !== ordenGrupoB) {
        return ordenGrupoA - ordenGrupoB;
      }

      return a[1].horaReferencia.localeCompare(b[1].horaReferencia);
    })
    .map(([tiempoComidaId]) => tiempoComidaId);
}

function indexarExcepciones(excepciones: Excepcion[]): Map<string, Excepcion> {
  return new Map(excepciones.map((e) => [`${e.fecha}__${e.tiempoComidaId}`, e]));
}

function buscarInscripcionActividad(
  fecha: string,
  tiempoComidaId: string,
  inscripciones: InscripcionActividadInput[]
): InscripcionActividadInput | undefined {
  return inscripciones.find((ins) => {
    const cruzaFecha = fecha >= ins.fechaInicio && fecha <= ins.fechaFin;
    if (!cruzaFecha) {
      return false;
    }

    if (!ins.tiemposComidaIds || ins.tiemposComidaIds.length === 0) {
      return true;
    }

    return ins.tiemposComidaIds.includes(tiempoComidaId);
  });
}

function resolverAlternativaDesdeSingleton(singleton: ConfiguracionResidencia, configuracionAlternativaId: string) {
  const configuracion = singleton.configuracionesAlternativas[configuracionAlternativaId];
  if (!configuracion) {
    return {
      nombre: configuracionAlternativaId,
      tipo: 'comedor' as const,
      requiereAprobacion: false,
    };
  }

  const definicion = singleton.catalogoAlternativas[configuracion.definicionAlternativaId];
  const comedor = configuracion.comedorId ? singleton.comedores[configuracion.comedorId] : undefined;

  return {
    nombre: configuracion.nombre,
    descripcion: definicion?.descripcion,
    tipo: definicion?.tipo ?? 'comedor',
    comedorNombre: comedor?.nombre,
    ventanaServicio: configuracion.ventanaServicio,
    requiereAprobacion: configuracion.requiereAprobacion,
  };
}

/**
 * Orquesta la transformación masiva de las entidades de dominio al contrato de Interfaz (CargaHorariosUI).
 * * @param inputs - Todos los datos crudos extraídos de Firestore y la referencia horaria del singleton.
 * @returns CargaHorariosUI - El payload denso y pre-calculado listo para el cliente.
 */
export function generarPayloadHorariosUI(
  inputs: InputsOrquestador
): CargaHorariosUI;

export function generarPayloadHorariosUI(
  inputs: InputsOrquestador
): CargaHorariosUI {
  const diasDensos = densificarCapa0(
    inputs.fechasRango,
    inputs.singletonResidencia,
    inputs.vistaMaterializadaDiaria
  );

  const excepcionesIndex = indexarExcepciones(inputs.excepcionesUsuario);
  const inscripciones = inputs.inscripcionesActividad ?? [];

  const dias = inputs.fechasRango.map((fecha) => {
    const semanaIso = obtenerSemanaIso(fecha);
    const semanarioSemana = inputs.diccionarioSemanarios[semanaIso] ?? {};
    const ordenTiemposComida = ordenarTiemposDelDia(inputs.singletonResidencia, fecha);
    const diaDenso = diasDensos[fecha];

    const tarjetas = ordenTiemposComida.map((tiempoComidaId) => {
      try {
      const tiempo = inputs.singletonResidencia.esquemaSemanal[tiempoComidaId];
      if (!tiempo) {
        throw new Error(
          `[generarPayloadHorariosUI] No existe tiempoComida '${tiempoComidaId}' en singleton.`
        );
      }

      const grupo = inputs.singletonResidencia.gruposComidas[tiempo.grupoComida];
      if (!grupo) {
        throw new Error(
          `[generarPayloadHorariosUI] No existe grupoComida '${tiempo.grupoComida}' para tiempo '${tiempoComidaId}'.`
        );
      }

      const ausencia = detectarInterseccionAusencia(
        fecha,
        tiempoComidaId,
        inputs.ausenciasUsuario,
        ordenTiemposComida
      );

      const excepcion = excepcionesIndex.get(`${fecha}__${tiempoComidaId}`);
      const eleccionSemanario = semanarioSemana[tiempoComidaId];
      const actividad = buscarInscripcionActividad(fecha, tiempoComidaId, inscripciones);

      const slot = diaDenso?.tiemposComida?.[tiempoComidaId];
      if (!slot) {
        throw new Error(
          `[generarPayloadHorariosUI] Slot no encontrado para fecha '${fecha}' y tiempo '${tiempoComidaId}'.`
        );
      }

      return resolverCascadaTiempoComida(
        {
          fecha,
          tiempoComidaId,
          grupoComida: grupo,
          fechaHoraReferenciaUltimaSolicitud: inputs.fechaHoraReferenciaUltimaSolicitud,
          resolverAlternativa: (configuracionAlternativaId) =>
            resolverAlternativaDesdeSingleton(inputs.singletonResidencia, configuracionAlternativaId),
        },
        slot,
        {
          inscripcionActividad: actividad
            ? {
                actividadId: actividad.actividadId,
                nombreActividad: actividad.nombreActividad,
                configuracionAlternativaId: actividad.configuracionAlternativaId,
              }
            : undefined,
          ausencia,
          excepcion,
          eleccionSemanario,
        }
      );
      } catch {
        return null;
      }
    }).filter((tarjeta): tarjeta is NonNullable<typeof tarjeta> => tarjeta !== null);

    return {
      fecha,
      tarjetas,
    };
  });

  const actividades = inscripciones.map((ins) => ({
    id: ins.actividadId,
    nombre: ins.nombreActividad,
    fechaInicio: ins.fechaInicio,
    fechaFin: ins.fechaFin,
  }));

  return CargaHorariosUISchema.parse({ dias, actividades });
}