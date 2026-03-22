import { ConfiguracionResidencia } from "shared/schemas/residencia";
import { HorarioEfectivoDiario, Ausencia, Excepcion, DiccionarioSemanarios } from "shared/schemas/elecciones/domain.schema";
import { AlteracionDiaria } from 'shared/schemas/alteraciones';
import { CargaHorariosUI, CargaHorariosUISchema } from "shared/schemas/elecciones/ui.schema";
import { AlteracionDiariaInput, densificarCapa0 } from "./densificadorCapa0";
import { detectarInterseccionAusencia } from "./interseccionAusencias";
import { resolverCascadaTiempoComida } from "./motorCascada";
import { getISOWeek, getISOWeekYear, parseISO } from "date-fns";
import { compararHorasReferencia, slugify } from 'shared/utils/commonUtils';

const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'] as const;
const EHC_DEBUG = process.env.NODE_ENV !== 'production' || process.env.EHC_DEBUG === '1';

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
  alteracionesCapa0?: AlteracionDiariaInput[];
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

function parseSemanaIso(semanaIso: string): { year: number; week: number } | null {
  const match = /^(\d{4})-W(\d{2})$/.exec(semanaIso);
  if (!match) {
    return null;
  }

  return {
    year: Number(match[1]),
    week: Number(match[2]),
  };
}

function compararSemanaIso(a: string, b: string): number {
  const pa = parseSemanaIso(a);
  const pb = parseSemanaIso(b);
  if (!pa || !pb) {
    return a.localeCompare(b);
  }

  if (pa.year !== pb.year) {
    return pa.year - pb.year;
  }

  return pa.week - pb.week;
}

function obtenerSemanarioSemanaConFallback(
  diccionarioSemanarios: DiccionarioSemanarios,
  semanaIsoObjetivo: string
): Record<string, any> {
  const exacta = diccionarioSemanarios[semanaIsoObjetivo];
  if (exacta && Object.keys(exacta).length > 0) {
    return exacta;
  }

  const semanasDisponibles = Object.keys(diccionarioSemanarios)
    .filter((key) => Object.keys(diccionarioSemanarios[key] ?? {}).length > 0)
    .sort(compararSemanaIso);

  if (semanasDisponibles.length === 0) {
    return {};
  }

  const objetivo = parseSemanaIso(semanaIsoObjetivo);
  if (!objetivo) {
    return diccionarioSemanarios[semanasDisponibles[semanasDisponibles.length - 1]] ?? {};
  }

  let candidata = semanasDisponibles[semanasDisponibles.length - 1];
  for (const semana of semanasDisponibles) {
    const parsed = parseSemanaIso(semana);
    if (!parsed) {
      continue;
    }

    const esAnteriorOIgual = parsed.year < objetivo.year
      || (parsed.year === objetivo.year && parsed.week <= objetivo.week);

    if (esAnteriorOIgual) {
      candidata = semana;
    }
  }

  if (EHC_DEBUG && candidata !== semanaIsoObjetivo) {
    console.log('[EHC][orquestadorUI] fallback semana semanario', {
      semanaObjetivo: semanaIsoObjetivo,
      semanaUsada: candidata,
    });
  }

  return diccionarioSemanarios[candidata] ?? {};
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

      return compararHorasReferencia(a[1].horaReferencia, b[1].horaReferencia);
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
  const tiempoComidaNormalizado = slugify(tiempoComidaId, 120);

  return inscripciones.find((ins) => {
    const cruzaFecha = fecha >= ins.fechaInicio && fecha <= ins.fechaFin;
    if (!cruzaFecha) {
      return false;
    }

    if (!ins.tiemposComidaIds || ins.tiemposComidaIds.length === 0) {
      return true;
    }

    return ins.tiemposComidaIds.some((id) => slugify(id, 120) === tiempoComidaNormalizado);
  });
}

function obtenerEleccionSemanario(
  semanarioSemana: Record<string, any>,
  tiempoComidaId: string
): any {
  const candidatos = [
    tiempoComidaId,
    tiempoComidaId.replace(/-/g, '_'),
    tiempoComidaId.replace(/_/g, '-'),
    slugify(tiempoComidaId, 120),
  ];

  for (const candidato of candidatos) {
    if (candidato in semanarioSemana) {
      return semanarioSemana[candidato];
    }
  }

  return undefined;
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
    inputs.alteracionesCapa0 ?? []
  );

  const excepcionesIndex = indexarExcepciones(inputs.excepcionesUsuario);
  const inscripciones = inputs.inscripcionesActividad ?? [];

  const dias = inputs.fechasRango.map((fecha) => {
    const semanaIso = obtenerSemanaIso(fecha);
    const semanarioSemana = obtenerSemanarioSemanaConFallback(inputs.diccionarioSemanarios, semanaIso);
    const ordenTiemposComida = ordenarTiemposDelDia(inputs.singletonResidencia, fecha);
    const diaDenso = diasDensos[fecha];

    if (EHC_DEBUG) {
      console.log('[EHC][orquestadorUI] procesando dia', {
        fecha,
        semanaIso,
        tiemposDia: ordenTiemposComida,
        semanarioKeys: Object.keys(semanarioSemana),
        inscripcionesDia: inscripciones
          .filter((ins) => fecha >= ins.fechaInicio && fecha <= ins.fechaFin)
          .map((ins) => ({
            actividadId: ins.actividadId,
            fechaInicio: ins.fechaInicio,
            fechaFin: ins.fechaFin,
            tiemposComidaIds: ins.tiemposComidaIds,
          })),
      });
    }

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
        const eleccionSemanario = obtenerEleccionSemanario(semanarioSemana, tiempoComidaId);
        const actividad = buscarInscripcionActividad(fecha, tiempoComidaId, inscripciones);

        const slot = diaDenso?.tiemposComida?.[tiempoComidaId];
        if (!slot) {
          throw new Error(
            `[generarPayloadHorariosUI] Slot no encontrado para fecha '${fecha}' y tiempo '${tiempoComidaId}'.`
          );
        }

        const tarjeta = resolverCascadaTiempoComida(
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

        if (EHC_DEBUG) {
          console.log('[EHC][orquestadorUI] evaluacion tiempo', {
            fecha,
            tiempoComidaId,
            capasEntrada: {
              actividad: actividad
                ? {
                    actividadId: actividad.actividadId,
                    nombreActividad: actividad.nombreActividad,
                    configuracionAlternativaId: actividad.configuracionAlternativaId,
                    tiemposComidaIds: actividad.tiemposComidaIds,
                  }
                : null,
              ausencia: ausencia
                ? {
                    fechaInicio: ausencia.fechaInicio,
                    fechaFin: ausencia.fechaFin,
                  }
                : null,
              excepcion: excepcion
                ? {
                    fecha: excepcion.fecha,
                    tiempoComidaId: excepcion.tiempoComidaId,
                    estadoAprobacion: excepcion.estadoAprobacion,
                    configuracionAlternativaId: excepcion.configuracionAlternativaId,
                  }
                : null,
              semanario: eleccionSemanario ?? null,
            },
            salida: {
              origen: tarjeta.origen,
              origenResolucion: tarjeta.origenResolucion,
              estadoInteraccion: tarjeta.estadoInteraccion,
              configuracionAlternativaId: tarjeta.resultadoEfectivo.configuracionAlternativaId,
            },
          });
        }

        return tarjeta;
      } catch {
        if (EHC_DEBUG) {
          console.log('[EHC][orquestadorUI] tarjeta descartada por error', {
            fecha,
            tiempoComidaId,
          });
        }
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