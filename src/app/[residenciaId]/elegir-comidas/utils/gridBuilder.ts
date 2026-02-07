import {
  UserProfile,
  Residencia,
  Semanario,
  SemanarioDesnormalizado,
  TiempoComida,
  AlternativaTiempoComida,
  HorarioSolicitudComida,
  Ausencia,
  InscripcionActividad,
  PermisosComidaPorGrupo,
  Actividad,
  TiempoComidaMod,
  AlternativaTiempoComidaMod,
  CeldaSemanarioDesnormalizado,
} from '../../../../../shared/models/types';
import { format, parseISO } from 'date-fns';
import { formatToDayOfWeekKey, estaDentroFechas } from '@/lib/fechasResidencia';

interface BuildGridParams {
  residencia: Residencia;
  affectedPeriodDays: string[];
  config: {
    tiemposComida: TiempoComida[];
    alternativas: AlternativaTiempoComida[];
    horariosSolicitud: HorarioSolicitudComida[];
  };
  userData: {
    userProfile: UserProfile;
    userSemanarioData: Semanario | null;
    ausencias: Ausencia[];
    inscripciones: InscripcionActividad[];
    permissions: PermisosComidaPorGrupo | null;
  };
  globalData: {
    actividades: Actividad[];
    tiemposComidaMod: TiempoComidaMod[];
    alternativasMod: AlternativaTiempoComidaMod[];
  };
}

export function buildSemanarioGrid({
  residencia,
  affectedPeriodDays,
  config,
  userData,
  globalData,
}: BuildGridParams): SemanarioDesnormalizado {
  const { tiemposComida, alternativas } = config;
  const { userProfile, userSemanarioData, ausencias, inscripciones, permissions } = userData;
  const { actividades, tiemposComidaMod, alternativasMod } = globalData;

  const today = new Date(); // Or pass from hook if specific time is needed
  const newSemanarioUI: SemanarioDesnormalizado = {
    userId: userProfile.id,
    residenciaId: residencia.id,
    semana: format(today, 'yyyy-ww'),
    ordenGruposComida: [],
    tabla: {},
  };

  const mealGroupsMap = new Map<string, { nombreGrupo: string; ordenGrupo: number }>();
  (tiemposComida || []).forEach(tc => {
    mealGroupsMap.set(tc.nombreGrupo, { nombreGrupo: tc.nombreGrupo, ordenGrupo: tc.ordenGrupo });
  });
  (tiemposComidaMod || []).forEach(tcm => {
    if (tcm.nombreGrupo && tcm.ordenGrupo) {
      mealGroupsMap.set(tcm.nombreGrupo, { nombreGrupo: tcm.nombreGrupo, ordenGrupo: tcm.ordenGrupo });
    }
  });

  newSemanarioUI.ordenGruposComida = Array.from(mealGroupsMap.values()).sort((a, b) => {
    if (a.ordenGrupo < b.ordenGrupo) return -1;
    if (a.ordenGrupo > b.ordenGrupo) return 1;
    return a.nombreGrupo.localeCompare(b.nombreGrupo);
  });

  for (const grupoInfo of newSemanarioUI.ordenGruposComida) {
    newSemanarioUI.tabla[grupoInfo.nombreGrupo] = {};
  }

  for (const diaStr of affectedPeriodDays) {
    const dayOfWeekKey = formatToDayOfWeekKey(parseISO(diaStr));

    for (const grupoInfo of newSemanarioUI.ordenGruposComida) {
      const nombreGrupo = grupoInfo.nombreGrupo;
      let celda: CeldaSemanarioDesnormalizado = {
        tiempoComidaId: null,
        alternativasDisponiblesId: [],
        hayAlternativasAlteradas: false,
        tiempoComidaModId: null,
        alternativasModId: [],
        nombreTiempoComida: "",
        hayAlternativasRestringidas: false,
        alternativasRestringidasId: [],
        hayActividadInscrita: false,
        actividadesInscritasId: [],
        alternativasActividadInscritaId: [],
        hayActividadParaInscribirse: false,
        actividadesDisponiblesId: [],
        hayAusencia: false,
        ausenciaAplicableId: null,
        eleccionSemanarioId: null,
      };

      const originalTiempoComida = (tiemposComida || []).find(
        tc => tc.dia === dayOfWeekKey && tc.nombreGrupo === nombreGrupo
      );
      celda.tiempoComidaId = originalTiempoComida ? originalTiempoComida.id : null;
      celda.nombreTiempoComida = originalTiempoComida ? originalTiempoComida.nombre : "";

      const relevantTcm = (tiemposComidaMod || []).find(
        tcm => tcm.dia === dayOfWeekKey && tcm.nombreGrupo === nombreGrupo
      );
      let relevantAtcms: AlternativaTiempoComidaMod[] = [];
      if (relevantTcm) {
        celda.hayAlternativasAlteradas = true;
        celda.tiempoComidaModId = relevantTcm.id;
        if (relevantTcm.nombre) celda.nombreTiempoComida = relevantTcm.nombre;
        relevantAtcms = (alternativasMod || []).filter(
          altm => altm.tiempoComidaModId === relevantTcm.id
        );
        if (relevantAtcms.length > 0)
          celda.alternativasModId = relevantAtcms.map(altm => altm.id);
      } else {
        if (!originalTiempoComida) celda.nombreTiempoComida = "No configurada";
      }

      let currentAlternativas: AlternativaTiempoComida[] = [];
      if (originalTiempoComida) {
        currentAlternativas = (alternativas || [])
          .filter(alt => alt.tiempoComidaId === originalTiempoComida.id)
          .map(alt => ({ ...alt }));
      };
      if (relevantAtcms.length > 0) {
        relevantAtcms.forEach(altm => {
          if (altm.tipoAlteracion === 'eliminar') {
            currentAlternativas = currentAlternativas.filter(alt => alt.id !== altm.alternativaAfectada);
          }
        });
      }
      celda.alternativasDisponiblesId = currentAlternativas.map(alt => alt.id);

      if (permissions && permissions.restriccionAlternativas === true && permissions.alternativasRestringidas) {
        const restrictedForUser = new Set(
          (permissions.alternativasRestringidas || [])
            .map(detail => detail.alternativaRestringida)
        );
        celda.alternativasRestringidasId = celda.alternativasDisponiblesId.filter(
          availId => restrictedForUser.has(availId)
        );
        celda.hayAlternativasRestringidas = celda.alternativasRestringidasId.length > 0;
      }

      const ausenciaActiva = ausencias.find(a => estaDentroFechas(diaStr, a.fechaInicio, a.fechaFin, residencia.zonaHoraria));
      if (ausenciaActiva) {
        celda.hayAusencia = true;
        celda.ausenciaAplicableId = ausenciaActiva.id ?? null;
      }

      const inscripcionesActivas = inscripciones.filter(i => {
        const actividad = actividades.find(a => a.id === i.actividadId);
        return actividad && estaDentroFechas(diaStr, actividad.fechaInicio, actividad.fechaFin, residencia.zonaHoraria);
      });

      if (inscripcionesActivas.length > 0) {
        celda.hayActividadInscrita = true;
        celda.actividadesInscritasId = inscripcionesActivas.map(i => i.id);
      }

      const actividadesDisponibles = actividades.filter(a => {
        const isEnrolled = inscripciones.some(i => i.actividadId === a.id);
        const isOpen = a.estado === 'abierta_inscripcion';
        return !isEnrolled && isOpen && estaDentroFechas(diaStr, a.fechaInicio, a.fechaFin, residencia.zonaHoraria);
      });

      if (actividadesDisponibles.length > 0) {
        celda.hayActividadParaInscribirse = true;
        celda.actividadesDisponiblesId = actividadesDisponibles.map(a => a.id);
      }

      if (originalTiempoComida && userSemanarioData && userSemanarioData.elecciones[originalTiempoComida.id]) {
        celda.eleccionSemanarioId = userSemanarioData.elecciones[originalTiempoComida.id];
      }

      newSemanarioUI.tabla[nombreGrupo][diaStr] = celda;
    }
  }

  return newSemanarioUI;
}
