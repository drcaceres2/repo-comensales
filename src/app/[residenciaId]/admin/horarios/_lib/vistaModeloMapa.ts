import {
  type ConfiguracionAlternativa,
  type DefinicionAlternativa,
  type GrupoComida,
  type HorarioSolicitudData,
  type TiempoComida,
} from 'shared/schemas/horarios';
import { type DiaDeLaSemana, ArregloDiaDeLaSemana } from 'shared/schemas/fechas';
import { DatosHorariosEnBruto } from 'shared/schemas/horarios';

const mapaDiasANumero: Record<DiaDeLaSemana, number> = {
  lunes: 0,
  martes: 1,
  miercoles: 2,
  jueves: 3,
  viernes: 4,
  sabado: 5,
  domingo: 6
};

const calcularAntelacion = (
  diaSolicitud: DiaDeLaSemana,
  horaSolicitud: string, // "HH:mm"
  diaComida: DiaDeLaSemana,
  horaComida: string, // "HH:mm"
  comidaIniciaDiaAnterior: boolean
): number => {
  const diaSolicitudInt = mapaDiasANumero[diaSolicitud];
  const [horaSol, minSol] = horaSolicitud.split(':').map(Number);
  const horaSolicitudDecimal = horaSol + (minSol / 60);

  let diaComidaInt = mapaDiasANumero[diaComida];
  if (comidaIniciaDiaAnterior) {
    diaComidaInt = (diaComidaInt - 1 + 7) % 7;
  }

  const [horaCom, minCom] = horaComida.split(':').map(Number);
  const horaComidaDecimal = horaCom + (minCom / 60);

  const horasAbsSolicitud = (diaSolicitudInt * 24) + horaSolicitudDecimal;
  let horasAbsComida = (diaComidaInt * 24) + horaComidaDecimal;

  let diferencia = horasAbsComida - horasAbsSolicitud;

  if (diferencia <= 0) {
    diferencia += 168; // 7 días * 24 horas
  }

  return diferencia;
};

// #################################################################################
// TIPOS DE ENTRADA (DTO de Base de Datos)
// #################################################################################

// #################################################################################
// TIPOS DE SALIDA (View Model)
// #################################################################################

export interface AlternativaEnriquecida {
  configuracion: ConfiguracionAlternativa & { id: string }; 
  definicion: DefinicionAlternativa & { id: string };       
  solicitud: HorarioSolicitudData & { id: string };         
  leadTimeHoras: number; // Pre-cálculo de la antelación
  estaInactiva: boolean; // True si la definicion o la solicitud tienen estaActivo === false
  esHuerfana: boolean;   // True si falta la definicion o la solicitud en los diccionarios
}

// NUEVA INTERFAZ: Agrupa el contenedor con SUS alternativas específicas
export interface TiempoComidaEnriquecido {
  tiempoComida: TiempoComida & { id: string };
  alternativas: AlternativaEnriquecida[];
}

export interface CeldaGrilla {
  grupoId: string; 
  // Ahora es un arreglo. 
  // Si está vacío ([]), se pinta la celda vacía.
  // Si tiene 1, se pinta normal.
  // Si tiene > 1 (ej. activos e inactivos), se iteran los contenedores dentro de la celda.
  tiempos: TiempoComidaEnriquecido[]; 
}

export interface FilaDia {
  dia: DiaDeLaSemana;
  solicitudesDelDia: (HorarioSolicitudData & { id: string })[]; 
  celdas: CeldaGrilla[]; 
}

export interface MatrizVistaHorarios {
  columnasOrdenadas: (GrupoComida & { id: string })[]; 
  filasPorDia: FilaDia[]; 
}

// #################################################################################
// FUNCION DE TRANSFORMACION
// #################################################################################
export const construirMatrizVistaHorarios = (
  datos: DatosHorariosEnBruto,
): MatrizVistaHorarios => {
  // 1. Filtrar grupos de comida activos y ordenarlos para las columnas.
  const columnasOrdenadas = (Object.entries(datos.gruposComidas))
    .filter(([, grupo]) => grupo.estaActivo)
    .map(([id, grupo]) => ({ ...grupo, id }))
    .sort((a, b) => a.orden - b.orden);

  const idsGruposActivos = new Set(columnasOrdenadas.map(g => g.id));

  // 2. Filtrar tiempos de comida que pertenecen a grupos activos.
  const tiemposComidaDeGrupoActivo = Object.entries(datos.esquemaSemanal)
    .filter(([, tc]) => idsGruposActivos.has(tc.grupoComida))
    .map(([id, tc]) => ({ ...tc, id }));

  // 3. Filtrar configuraciones de alternativas que pertenecen a tiempos de comida activos.
  const idsTiemposComidaDeGrupoActivo = new Set(tiemposComidaDeGrupoActivo.map(tc => tc.id));
  const configsAlternativasDeGrupoActivo = Object.entries(
    datos.configuracionesAlternativas,
  )
    .filter(([, config]) => idsTiemposComidaDeGrupoActivo.has(config.tiempoComidaId))
    .map(([id, config]) => ({ ...config, id }));

  // 4. Mapear entidades por ID para acceso rápido.
  const horariosSolicitudMap = new Map(
    Object.entries(datos.horariosSolicitud).map(([id, item]) => [
      id,
      { ...item, id },
    ]),
  );
  const definicionesAlternativasMap = new Map(
    Object.entries(datos.catalogoAlternativas).map(([id, item]) => [
      id,
      { ...item, id },
    ]),
  );

  // 5. Construir la matriz de filas por día.
  const filasPorDia: FilaDia[] = ArregloDiaDeLaSemana.map(dia => {
    const solicitudesDelDia = Array.from(horariosSolicitudMap.values()).filter(
      sol => sol.dia === dia,
    );

    const celdas: CeldaGrilla[] = columnasOrdenadas.map(grupo => {
      const tiemposComidaDeLaCelda = tiemposComidaDeGrupoActivo.filter(
        tc => tc.dia === dia && tc.grupoComida === grupo.id,
      );

      const tiempos: TiempoComidaEnriquecido[] = tiemposComidaDeLaCelda.map(tiempoComida => {
        const configsParaEsteTiempo = configsAlternativasDeGrupoActivo.filter(
          config => config.tiempoComidaId === tiempoComida.id,
        );

        const alternativas: AlternativaEnriquecida[] = [];
        for (const config of configsParaEsteTiempo) {
          const definicion = definicionesAlternativasMap.get(
            config.definicionAlternativaId,
          );
          const solicitud = horariosSolicitudMap.get(config.horarioSolicitudComidaId);

          if (definicion && solicitud) {
            // --- INICIO: Lógica de cálculo de lead time ---
            const diaComida = tiempoComida.dia;
            const horaComida = config.ventanaServicio.horaInicio;
            const comidaIniciaDiaAnterior = config.ventanaServicio.tipoVentana === 'inicia_dia_anterior';

            const leadTimeHoras = calcularAntelacion(
              solicitud.dia,
              solicitud.horaSolicitud, // Usamos la hora de la solicitud
              diaComida, // Usamos el día de la comida (potencialmente ajustado)
              horaComida, // Usamos la hora de inicio de la ventana de servicio
              comidaIniciaDiaAnterior
            );
            // --- FIN: Lógica de cálculo de lead time ---

            const estaInactiva = !definicion.estaActiva || !solicitud.estaActivo;

            alternativas.push({
              configuracion: config,
              definicion,
              solicitud,
              leadTimeHoras,
              estaInactiva,
              esHuerfana: false, 
            });
          }
        }

        return {
          tiempoComida,
          alternativas,
        };
      });

      return {
        grupoId: grupo.id,
        tiempos,
      };
    });

    return {
      dia,
      solicitudesDelDia,
      celdas,
    };
  });

  return {
    columnasOrdenadas,
    filasPorDia,
  };
};

export const CatalogoErrores = {
  GENERAL: {
    codigo: "GENERAL",
    severidad: "advertencia",
    descripcion: "No hay ninguna entidad de horarios activa. La configuración de horarios está completamente vacía."
  },
  HSC_DIA: { 
    codigo: "HSC_DIA",
    severidad: "advertencia",
    descripcion: "No hay 'HorarioSolicitudData' activo en un determinado 'DiaDeLaSemana'"
  },
  HSC_PRI_DIA: { 
    codigo: "HSC_PRI_DIA",
    severidad: "advertencia",
    descripcion: "No hay (o hay más de un) 'HorarioSolicitudData' activo primario en un determinado 'DiaDeLaSemana'"
  },
  TC_DIAxGR: { 
    codigo: "TC_DIAxGR",
    severidad: "advertencia",
    descripcion: "No hay (o hay más de un) 'TiempoComida' activo para cada 'GrupoComida' y 'DiaDeLaSemana'"
  },
  CFALT_TC: { 
    codigo: "CFALT_TC",
    severidad: "advertencia",
    descripcion: "No hay ninguna `ConfiguracionAlternativa` activa para algún `TiempoComida` activo"
  },
  CFALT_TCxCOM: { 
    codigo: "CFALT_TCxCOM",
    severidad: "advertencia",
    descripcion: "No hay ninguna `ConfiguracionAlternativa` activa de tipo comedor (`DefinicionAlternativa.tipo='comedor'`) en un determinado `TiempoComida`"
  },
  HSC_REP: { 
    codigo: "HSC_REP",
    severidad: "advertencia",
    descripcion: "Hay nombres repetidos en dos o más `HorarioSolicitudData` activos"
  },
  TC_REP: { 
    codigo: "TC_REP",
    severidad: "advertencia",
    descripcion: "Hay nombres repetidos en dos o más `TiempoComida` activos"
  },
  DFALT_REP: { 
    codigo: "DFALT_REP",
    severidad: "advertencia",
    descripcion: "Hay nombres repetidos en dos o más `DefinicionAlternativa` activas"
  },
  CFALT_REP: { 
    codigo: "CFALT_REP",
    severidad: "advertencia",
    descripcion: "Hay nombres repetidos en dos o más `ConfiguracionAlternativa` activas"
  },
  CFALT_CONC: {
    codigo: "CFALT_CONC",
    severidad: "advertencia",
    descripcion: "Hay dos o más `ConfiguracionAlternativa` con la misma `ventanaServicio` para el mismo `DiaDeLaSemana`"
  },
  CFALT_CONC_COM: {
    codigo: "CFALT_CONC_COM",
    severidad: "advertencia",
    descripcion: "Hay dos o más `ConfiguracionAlternativa` concurriendo al mismo tiempo en el mismo `comedorId`"
  },
  CFALT_TIEM_NEG: {
    codigo: "CFALT_TIEM_NEG",
    severidad: "advertencia",
    descripcion: "Hay una `ConfiguracionAlternativa` activa que tiene `VentanaServicioComidaSchema` de `tipo='normal'` con horaInicio > horaFin"
  },
  HSC_INACT_ASOC: {
    codigo: "HSC_INACT_ASOC",
    severidad: "error",
    descripcion: "Hay un `HorarioSolicitudData` inactivo que tiene una `ConfiguracionAlternativa` activa asociada"
  },
  TC_INACT_ASOC: {
    codigo: "TC_INACT_ASOC",
    severidad: "error",
    descripcion: "Hay un `TiempoComida` inactivo que tiene una `ConfiguracionAlternativa` activa asociada"
  },
  GC_DESOR: {
    codigo: "GC_DESOR",
    severidad: "error",
    descripcion: "El orden de los `GrupoComida` activos no son consecutivos"
  },
  GC_REP: {
    codigo: "GC_REP",
    severidad: "error",
    descripcion: "Hay nombres repetidos en `GrupoComida` activos"
  }
}

export type TipoError = keyof typeof CatalogoErrores;

export interface Alerta {
  tipo: TipoError;
  entidad: 'HorarioSolicitudData' | 'GrupoComida' | 'TiempoComida' | 'ConfiguracionAlternativa' | 'Global';
  id?: string; // El ID de la entidad que causa el problema
  mensaje: string;
}

export function auditarIntegridadHorarios(raw: DatosHorariosEnBruto): Alerta[] {
  const alertas: Alerta[] = [];
  const {
    gruposComidas,
    esquemaSemanal,
    horariosSolicitud,
    catalogoAlternativas,
    configuracionesAlternativas
  } = raw;

  const gruposComidasActivos = Object.entries(gruposComidas).filter(([, g]) => g.estaActivo);
  const tiemposComidasActivos = Object.entries(esquemaSemanal).filter(([, t]) => t.estaActivo);
  const horariosSolicitudActivos = Object.entries(horariosSolicitud).filter(([, h]) => h.estaActivo);
  const definicionesAlternativasActivas = Object.entries(catalogoAlternativas).filter(([, d]) => d.estaActiva);
  const configuracionesAlternativasActivas = Object.entries(configuracionesAlternativas).filter(([, c]) => c.estaActivo);

  if (
    gruposComidasActivos.length === 0 &&
    tiemposComidasActivos.length === 0 &&
    horariosSolicitudActivos.length === 0 &&
    definicionesAlternativasActivas.length === 0 &&
    configuracionesAlternativasActivas.length === 0
  ) {
    alertas.push({
      tipo: 'GENERAL',
      entidad: 'Global',
      mensaje: 'No hay ninguna entidad de horarios activa. La configuración de horarios está completamente vacía.'
    });
    return alertas;
  }

  // ADVERTENCIAS
  // No hay `HorarioSolicitudData` activo en un determinado `DiaDeLaSemana`
  ArregloDiaDeLaSemana.forEach(dia => {
    const horariosParaDia = horariosSolicitudActivos.filter(([, h]) => h.dia === dia);
    if (horariosParaDia.length === 0) {
      alertas.push({
        tipo: 'HSC_DIA',
        entidad: 'HorarioSolicitudData',
        mensaje: `No hay ningún horario de solicitud activo para el día ${dia}.`
      });
    }
  });

  // No hay (o hay más de un) `HorarioSolicitudData` activo primario en un determinado `DiaDeLaSemana`
  ArregloDiaDeLaSemana.forEach(dia => {
    const primariosParaDia = horariosSolicitudActivos.filter(([, h]) => h.dia === dia && h.esPrimario);
    if (primariosParaDia.length === 0) {
      alertas.push({
        tipo: 'HSC_PRI_DIA',
        entidad: 'HorarioSolicitudData',
        mensaje: `No hay un horario de solicitud primario definido para el día ${dia}.`
      });
    } else if (primariosParaDia.length > 1) {
      alertas.push({
        tipo: 'HSC_PRI_DIA',
        entidad: 'HorarioSolicitudData',
        id: primariosParaDia.map(([id]) => id).join(', '),
        mensaje: `Hay más de un horario de solicitud primario definido para el día ${dia}.`
      });
    }
  });

  // No hay (o hay más de un) `TiempoComida` activo para cada `GrupoComida` y `DiaDeLaSemana`
  gruposComidasActivos.forEach(([grupoId, grupo]) => {
    ArregloDiaDeLaSemana.forEach(dia => {
      const tiemposParaGrupoDia = tiemposComidasActivos.filter(
        ([, t]) => t.grupoComida === grupoId && t.dia === dia
      );
      if (tiemposParaGrupoDia.length === 0) {
        alertas.push({
          tipo: 'TC_DIAxGR',
          entidad: 'TiempoComida',
          mensaje: `No hay un tiempo de comida activo para el grupo '${grupo.nombre}' en el día ${dia}.`
        });
      } else if (tiemposParaGrupoDia.length > 1) {
        alertas.push({
          tipo: 'TC_DIAxGR',
          entidad: 'TiempoComida',
          id: tiemposParaGrupoDia.map(([id]) => id).join(', '),
          mensaje: `Hay más de un tiempo de comida activo para el grupo '${grupo.nombre}' en el día ${dia}.`
        });
      }
    });
  });

  // No hay ninguna `ConfiguracionAlternativa` activa para algún `TiempoComida` activo
  tiemposComidasActivos.forEach(([tiempoId, tiempo]) => {
    const configsParaTiempo = configuracionesAlternativasActivas.filter(
      ([, c]) => c.tiempoComidaId === tiempoId
    );
    if (configsParaTiempo.length === 0) {
      alertas.push({
        tipo: 'CFALT_TC',
        entidad: 'ConfiguracionAlternativa',
        id: tiempoId,
        mensaje: `El tiempo de comida '${tiempo.nombre}' no tiene ninguna configuración de alternativa activa.`
      });
    }
  });

  // No hay ninguna `ConfiguracionAlternativa` activa de tipo comedor (`DefinicionAlternativa.tipo='comedor'`) en un determinado `TiempoComida`
  tiemposComidasActivos.forEach(([tiempoId, tiempo]) => {
    const configsParaTiempo = configuracionesAlternativasActivas.filter(
      ([, c]) => c.tiempoComidaId === tiempoId
    );
    const hayDeTipoComedor = configsParaTiempo.some(([, config]) => {
      const definicion = catalogoAlternativas[config.definicionAlternativaId];
      return definicion && definicion.tipo === 'comedor';
    });
    if (!hayDeTipoComedor) {
      alertas.push({
        tipo: 'CFALT_TCxCOM',
        entidad: 'ConfiguracionAlternativa',
        id: tiempoId,
        mensaje: `El tiempo de comida '${tiempo.nombre}' no tiene ninguna alternativa de tipo 'comedor'.`
      });
    }
  });

  // Hay nombres repetidos en dos o más `HorarioSolicitudData` activos
  const nombresHorarios = new Map<string, string[]>();
  horariosSolicitudActivos.forEach(([id, h]) => {
    if (!nombresHorarios.has(h.nombre)) {
      nombresHorarios.set(h.nombre, []);
    }
    nombresHorarios.get(h.nombre)!.push(id);
  });
  nombresHorarios.forEach((ids, nombre) => {
    if (ids.length > 1) {
      alertas.push({
        tipo: 'HSC_REP',
        entidad: 'HorarioSolicitudData',
        id: ids.join(', '),
        mensaje: `Nombre de horario de solicitud repetido: '${nombre}'.`
      });
    }
  });

  // Hay nombres repetidos en dos o más `TiempoComida` activos
  const nombresTiempos = new Map<string, string[]>();
  tiemposComidasActivos.forEach(([id, t]) => {
    if (!nombresTiempos.has(t.nombre)) {
      nombresTiempos.set(t.nombre, []);
    }
    nombresTiempos.get(t.nombre)!.push(id);
  });
  nombresTiempos.forEach((ids, nombre) => {
    if (ids.length > 1) {
      alertas.push({
        tipo: 'TC_REP',
        entidad: 'TiempoComida',
        id: ids.join(', '),
        mensaje: `Nombre de tiempo de comida repetido: '${nombre}'.`
      });
    }
  });

  // Hay nombres repetidos en dos o más `DefinicionAlternativa` activos
  const nombresDefiniciones = new Map<string, string[]>();
  definicionesAlternativasActivas.forEach(([id, d]) => {
    if (!nombresDefiniciones.has(d.nombre)) {
      nombresDefiniciones.set(d.nombre, []);
    }
    nombresDefiniciones.get(d.nombre)!.push(id);
  });
  nombresDefiniciones.forEach((ids, nombre) => {
    if (ids.length > 1) {
      alertas.push({
        tipo: 'DFALT_REP',
        entidad: 'ConfiguracionAlternativa',
        id: ids.join(', '),
        mensaje: `Nombre de definición de alternativa repetido: '${nombre}'.`
      });
    }
  });
  
  // Hay nombres repetidos en dos o más `ConfiguracionAlternativa` activos
  const nombresConfiguraciones = new Map<string, string[]>();
  configuracionesAlternativasActivas.forEach(([id, c]) => {
    if (!nombresConfiguraciones.has(c.nombre)) {
      nombresConfiguraciones.set(c.nombre, []);
    }
    nombresConfiguraciones.get(c.nombre)!.push(id);
  });
  nombresConfiguraciones.forEach((ids, nombre) => {
    if (ids.length > 1) {
      alertas.push({
        tipo: 'CFALT_REP',
        entidad: 'ConfiguracionAlternativa',
        id: ids.join(', '),
        mensaje: `Nombre de configuración de alternativa repetido: '${nombre}'.`
      });
    }
  });
  
  // Hay dos o más `ConfiguracionAlternativa` con la misma `ventanaServicio` para el mismo `DiaDeLaSemana`
  const ventanasPorDia = new Map<string, { id: string, ventana: string }[]>();
  configuracionesAlternativasActivas.forEach(([id, c]) => {
    const tiempo = esquemaSemanal[c.tiempoComidaId];
    if(tiempo) {
        const key = tiempo.dia;
        const ventanaStr = JSON.stringify(c.ventanaServicio);
        if (!ventanasPorDia.has(key)) {
            ventanasPorDia.set(key, []);
        }
        const bucket = ventanasPorDia.get(key)!;
        const existente = bucket.find(item => item.ventana === ventanaStr);
        if (existente) {
            alertas.push({
                tipo: 'CFALT_CONC',
                entidad: 'ConfiguracionAlternativa',
                id: `${existente.id}, ${id}`,
                mensaje: `Conflicto de ventanas de servicio en ${tiempo.dia} para la ventana ${c.ventanaServicio.horaInicio}-${c.ventanaServicio.horaFin}.`
            });
        } else {
            bucket.push({ id, ventana: ventanaStr });
        }
    }
  });


  // Hay una `ConfiguracionAlternativa` activa que tiene `VentanaServicioComidaSchema` de `tipo='normal'` con horaInicio > horaFin
  configuracionesAlternativasActivas.forEach(([id, c]) => {
    if (c.ventanaServicio.tipoVentana === 'normal' && c.ventanaServicio.horaInicio > c.ventanaServicio.horaFin) {
      alertas.push({
        tipo: 'CFALT_TIEM_NEG',
        entidad: 'ConfiguracionAlternativa',
        id: id,
        mensaje: `La configuración alternativa '${c.nombre}' tiene una ventana de servicio con hora de inicio posterior a la hora de fin.`
      });
    }
  });

  // ERRORES
  // Hay un `HorarioSolicitudData` inactivo que tiene una `ConfiguracionAlternativa` activa asociada
  const horariosInactivosConConfigActiva = Object.entries(horariosSolicitud).filter(([,h]) => !h.estaActivo);
  horariosInactivosConConfigActiva.forEach(([hId, h]) => {
      const tieneConfigActiva = configuracionesAlternativasActivas.some(([,c]) => c.horarioSolicitudComidaId === hId);
      if(tieneConfigActiva){
        alertas.push({
            tipo: 'HSC_INACT_ASOC',
            entidad: 'HorarioSolicitudData',
            id: hId,
            mensaje: `El horario de solicitud inactivo '${h.nombre}' está siendo usado por una configuración de alternativa activa.`
        });
      }
  });

  // Hay un `TiempoComida` inactivo que tiene una `ConfiguracionAlternativa` activa asociada
  const tiemposInactivosConConfigActiva = Object.entries(esquemaSemanal).filter(([,t]) => !t.estaActivo);
  tiemposInactivosConConfigActiva.forEach(([tId, t]) => {
      const tieneConfigActiva = configuracionesAlternativasActivas.some(([,c]) => c.tiempoComidaId === tId);
      if(tieneConfigActiva){
        alertas.push({
            tipo: 'TC_INACT_ASOC',
            entidad: 'TiempoComida',
            id: tId,
            mensaje: `El tiempo de comida inactivo '${t.nombre}' está siendo usado por una configuración de alternativa activa.`
        });
      }
  });

  // El orden de los `GrupoComida` activos no son consecutivos
  const ordenGrupos = gruposComidasActivos.map(([,g]) => g.orden).sort((a,b) => a - b);
  for(let i = 0; i < ordenGrupos.length - 1; i++){
      if(ordenGrupos[i+1] !== ordenGrupos[i] + 1){
          alertas.push({
              tipo: 'GC_DESOR',
              entidad: 'GrupoComida',
              mensaje: 'El orden de los grupos de comida activos no es consecutivo.'
          });
          break;
      }
  }

  // Hay nombres repetidos en `GrupoComida` activos
  const nombresGrupos = new Map<string, string[]>();
  gruposComidasActivos.forEach(([id, g]) => {
    if (!nombresGrupos.has(g.nombre)) {
        nombresGrupos.set(g.nombre, []);
    }
    nombresGrupos.get(g.nombre)!.push(id);
  });
  nombresGrupos.forEach((ids, nombre) => {
    if (ids.length > 1) {
      alertas.push({
        tipo: 'GC_REP',
        entidad: 'GrupoComida',
        id: ids.join(', '),
        mensaje: `Nombre de grupo de comida repetido: '${nombre}'.`
      });
    }
  });

  // Agrupar mensajes idénticos
  const alertasAgrupadas: Record<string, Alerta> = {};
  alertas.forEach(alerta => {
    const key = `${alerta.tipo}-${alerta.entidad}-${alerta.mensaje}`;
    if (alertasAgrupadas[key]) {
      if (alerta.id) {
        alertasAgrupadas[key].id = `${alertasAgrupadas[key].id || ''}, ${alerta.id}`;
      }
    } else {
      alertasAgrupadas[key] = { ...alerta };
    }
  });

  return Object.values(alertasAgrupadas);
}
