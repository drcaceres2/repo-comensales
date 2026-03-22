'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { getISOWeek, getISOWeekYear } from 'date-fns';
import { CalendarSync } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useInfoUsuario } from '@/components/layout/AppProviders';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { EleccionSemanario } from 'shared/schemas/elecciones/domain.schema';
import { UpsertSemanarioPayload } from 'shared/schemas/semanarios/semanario.dto';
import { useSemanarioQuery, useUsuariosObjetivoSemanarios } from '../hooks/useSemanarioQuery';
import { useUpsertSemanarioMutation } from '../hooks/useUpsertSemanarioMutation';
import { AgendaVertical } from './AgendaVertical';
import { AlternativasBottomSheet } from './AlternativasBottomSheet';
import { BandaDias } from './BandaDias';

type DiaSemana = 'lunes' | 'martes' | 'miercoles' | 'jueves' | 'viernes' | 'sabado' | 'domingo';

const DIAS: Array<{ key: DiaSemana; label: string }> = [
  { key: 'lunes', label: 'Lunes' },
  { key: 'martes', label: 'Martes' },
  { key: 'miercoles', label: 'Miércoles' },
  { key: 'jueves', label: 'Jueves' },
  { key: 'viernes', label: 'Viernes' },
  { key: 'sabado', label: 'Sábado' },
  { key: 'domingo', label: 'Domingo' },
];

const TITLE_COLLAPSE_DISTANCE = 72;

function semanaIsoNow(): string {
  const now = new Date();
  return `${getISOWeekYear(now)}-W${String(getISOWeek(now)).padStart(2, '0')}`;
}

export function SemanarioContainer({ residenciaId }: { residenciaId: string }) {
  const router = useRouter();
  const { usuarioId, roles } = useInfoUsuario();

  const [targetUid, setTargetUid] = useState<string | null>(null);
  const [tiempoActivoId, setTiempoActivoId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, EleccionSemanario>>({});
  const [diaActivo, setDiaActivo] = useState<string>('lunes');
  const [scrollToDiaKey, setScrollToDiaKey] = useState<string | null>(null);
  const [titleScrollOffset, setTitleScrollOffset] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const esDirector = roles.includes('director');
  const esAsistente = roles.includes('asistente');
  const rolesIncompatibles = esDirector && esAsistente;
  const puedeSeleccionarTarget = esDirector || esAsistente;

  const usuariosTargetQuery = useUsuariosObjetivoSemanarios(residenciaId, usuarioId);
  const usuariosObjetivo = usuariosTargetQuery.data ?? [];

  useEffect(() => {
    if (!residenciaId || rolesIncompatibles) {
      return;
    }

    if (!puedeSeleccionarTarget) {
      if (targetUid !== usuarioId) {
        setTargetUid(usuarioId);
      }
      return;
    }

    if (usuariosTargetQuery.isLoading) {
      return;
    }

    if (usuariosObjetivo.length === 0) {
      if (targetUid !== null) {
        setTargetUid(null);
      }
      return;
    }

    const targetActualSigueDisponible = Boolean(
      targetUid && usuariosObjetivo.some((user) => user.id === targetUid)
    );
    if (targetActualSigueDisponible) {
      return;
    }

    const targetInicial = usuariosObjetivo.some((user) => user.id === usuarioId)
      ? usuarioId
      : usuariosObjetivo[0].id;

    if (targetUid !== targetInicial) {
      setTargetUid(targetInicial);
    }
  }, [
    residenciaId,
    rolesIncompatibles,
    puedeSeleccionarTarget,
    usuarioId,
    usuariosTargetQuery.isLoading,
    usuariosObjetivo,
    targetUid,
  ]);

  const dataQuery = useSemanarioQuery(residenciaId, usuarioId, targetUid ?? undefined);
  const upsertMutation = useUpsertSemanarioMutation(residenciaId, targetUid ?? undefined);

  const singleton = dataQuery.singleton;
  const read = dataQuery.read;
  const modoEdicion = read?.modoEdicion ?? 'read-only';
  const readOnly = modoEdicion === 'read-only';

  useEffect(() => {
    if (!read?.dto) {
      return;
    }

    const base = read.dto.semanarios[read.semanaIsoActual] ?? {};
    setDraft(base);
  }, [read?.dto, read?.semanaIsoActual, targetUid]);

  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) {
      return;
    }

    const syncTitle = () => {
      setTitleScrollOffset(Math.min(scrollContainer.scrollTop, TITLE_COLLAPSE_DISTANCE));
    };

    syncTitle();
    scrollContainer.addEventListener('scroll', syncTitle, { passive: true });
    return () => scrollContainer.removeEventListener('scroll', syncTitle);
  }, []);

  const diasRender = useMemo(() => {
    if (!singleton) {
      return [] as Array<{ key: string; label: string; tiempos: Array<{ tiempoId: string; nombreTiempo: string; nombreGrupo: string; nombreAlternativa: string | null; }> }>;
    }

    const tiempos = Object.entries(singleton.esquemaSemanal)
      .filter(([, tiempo]) => tiempo.estaActivo)
      .sort((a, b) => {
        const grupoOrdenA = singleton.gruposComidas[a[1].grupoComida]?.orden ?? Number.MAX_SAFE_INTEGER;
        const grupoOrdenB = singleton.gruposComidas[b[1].grupoComida]?.orden ?? Number.MAX_SAFE_INTEGER;
        if (grupoOrdenA !== grupoOrdenB) {
          return grupoOrdenA - grupoOrdenB;
        }
        return String(a[1].horaReferencia ?? '').localeCompare(String(b[1].horaReferencia ?? ''));
      });

    return DIAS.map((dia) => {
      const tiemposDia = tiempos
        .filter(([, tiempo]) => tiempo.dia === dia.key)
        .map(([tiempoId, tiempo]) => {
          const eleccion = draft[tiempoId];
          const config = eleccion ? singleton.configuracionesAlternativas[eleccion.configuracionAlternativaId] : undefined;
          const definicion = config
            ? singleton.catalogoAlternativas[config.definicionAlternativaId]
            : undefined;

          return {
            tiempoId,
            nombreTiempo: tiempo.nombre,
            nombreGrupo: singleton.gruposComidas[tiempo.grupoComida]?.nombre ?? tiempo.grupoComida,
            nombreAlternativa: config?.nombre ?? definicion?.nombre ?? null,
          };
        });

      return {
        key: dia.key,
        label: dia.label,
        tiempos: tiemposDia,
      };
    });
  }, [singleton, draft]);

  const tiempoActivo = useMemo(() => {
    if (!singleton || !tiempoActivoId) {
      return null;
    }

    const tiempo = singleton.esquemaSemanal[tiempoActivoId];
    if (!tiempo) {
      return null;
    }

    const candidatos = [tiempo.alternativas.principal, ...(tiempo.alternativas.secundarias ?? [])];
    const hiddenCount = candidatos.reduce((acc, configId) => {
      const conf = singleton?.configuracionesAlternativas?.[configId];
      return acc + (conf?.requiereAprobacion ? 1 : 0);
    }, 0);

    const opciones = candidatos
      .map((configId) => {
        const config = singleton.configuracionesAlternativas[configId];
        if (!config || !config.estaActivo) return null;
        // Exclude alternatives that require approval
        if (config.requiereAprobacion) return null;

        const definicion = singleton.catalogoAlternativas[config.definicionAlternativaId];
        if (!definicion || !definicion.estaActiva) return null;

        return {
          configuracionAlternativaId: configId,
          nombre: config.nombre,
          tipo: definicion.tipo,
          requiereAprobacion: !!config.requiereAprobacion,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    return {
      tiempoId: tiempoActivoId,
      nombre: tiempo.nombre,
      opciones,
      hiddenCount,
      seleccionActual: draft[tiempoActivoId]?.configuracionAlternativaId,
    };
  }, [singleton, tiempoActivoId, draft]);

  const sinUsuariosObjetivo = puedeSeleccionarTarget && !usuariosTargetQuery.isLoading && usuariosObjetivo.length === 0;
  const viendoOtroUsuario = Boolean(targetUid && targetUid !== usuarioId);
  const errorPie = upsertMutation.isError ? upsertMutation.error.message : null;
  const mostrarTitulo = titleScrollOffset === 0 && diaActivo === 'lunes';

  const guardarCambios = async () => {
    if (!read?.dto || !targetUid || readOnly) {
      return;
    }

    const payload: UpsertSemanarioPayload = {
      usuarioId: targetUid,
      semanaIsoEfectiva: read.semanaIsoActual,
      semanario: draft,
      lastUpdatedAt: read.dto.updatedAt,
    };

    // Build a minimal, serializable configContext for server-side validation
    const configContext: Record<string, { requiereAprobacion?: boolean }> = {};
    try {
      Object.values(payload.semanario || {}).forEach((s) => {
        const configId = s.configuracionAlternativaId;
        if (!configId) return;
        const conf = singleton?.configuracionesAlternativas?.[configId];
        configContext[configId] = { requiereAprobacion: !!conf?.requiereAprobacion };
      });
    } catch (e) {
      // if anything unexpected occurs, fail early to avoid sending incomplete context
      return;
    }

    const wrapper = { payload, configContext };

    const result = await upsertMutation.mutateAsync(wrapper);

    if (result.success) {
      // Evitar navegar a la raíz de la residencia que no existe; permanecer
      // en la ruta de semanarios para prevenir 404 en server actions.
      router.push(`/${residenciaId}/semanarios`);
    }
  };

  if (rolesIncompatibles) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        Configuración inválida de roles: director y asistente no pueden coexistir.
      </div>
    );
  }

  if (dataQuery.isLoading || usuariosTargetQuery.isLoading) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (dataQuery.isError || usuariosTargetQuery.isError || !singleton || (Boolean(targetUid) && !read)) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        No se pudo cargar el módulo de semanarios. {(dataQuery.error ?? usuariosTargetQuery.error)?.message}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b bg-background/95 backdrop-blur">
        <header
          className={`overflow-hidden transition-all duration-200 ease-out ${
            mostrarTitulo
              ? (puedeSeleccionarTarget ? 'max-h-72 translate-y-0 opacity-100' : 'max-h-48 translate-y-0 opacity-100')
              : 'max-h-0 -translate-y-3 opacity-0'
          }`}
        >
          <div className="space-y-2 pb-4">
            <div className="flex items-center gap-3">
              <CalendarSync className="h-8 w-8 text-gray-700 shrink-0" />
              <div className="flex flex-col">
                <h1 className="text-xl font-semibold">Mi horario base</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Configura tu semanario base. Los cambios se aplican en cascada desde el Home.
                </p>
              </div>
            </div>
          </div>
          {puedeSeleccionarTarget ? (
            <section className="mt-3 space-y-2 rounded-lg border bg-muted/30 p-3">
              <p className="text-sm font-medium">Usuario objetivo</p>
              <Select value={targetUid ?? undefined} onValueChange={setTargetUid}>
                <SelectTrigger
                  className={viendoOtroUsuario
                    ? 'border-amber-300 bg-amber-50 text-amber-900 focus:ring-amber-500 dark:border-amber-500/70 dark:bg-amber-500/10 dark:text-amber-200'
                    : undefined}
                >
                  <SelectValue placeholder="Selecciona un usuario" />
                </SelectTrigger>
                <SelectContent>
                  {usuariosObjetivo.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.nombre} {user.apellido}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </section>
          ) : null}

        </header>

        <div className="flex items-center justify-between gap-3 pb-3">
          <Badge variant="outline">Semana activa: {read?.semanaIsoActual ?? semanaIsoNow()}</Badge>
          <Badge variant={readOnly ? 'secondary' : 'default'}>
            {readOnly ? 'Solo lectura' : 'Editable'}
          </Badge>
        </div>

        <BandaDias
          diaActivo={diaActivo}
          onDiaClick={(dia) => {
            setDiaActivo(dia);
            setScrollToDiaKey(dia);
          }}
        />
      </div>

      <div ref={scrollContainerRef} className="min-h-0 flex-1 overflow-y-auto py-4">
        <div className="space-y-4 pb-28">
          {/* selector moved into header to collapse with title */}

          {sinUsuariosObjetivo ? (
            <section className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/70 dark:bg-amber-500/10 dark:text-amber-200">
              No hay usuarios disponibles para gestionar semanarios con tu perfil actual.
            </section>
          ) : null}

          {!sinUsuariosObjetivo ? (
            <AgendaVertical
              dias={diasRender}
              readOnly={readOnly}
              onSeleccionarTiempo={(tiempoId) => setTiempoActivoId(tiempoId)}
              onDiaActivo={setDiaActivo}
              scrollContainerRef={scrollContainerRef}
              scrollToDiaKey={scrollToDiaKey}
            />
          ) : null}
        </div>
      </div>

      <footer className="fixed left-6 right-6 bottom-2 z-40 space-y-3 border-t bg-background/95 pt-3 backdrop-blur rounded-lg shadow-sm">
        {errorPie ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {errorPie}
          </div>
        ) : null}

        <Button
          className="w-full"
          disabled={readOnly || upsertMutation.isPending || sinUsuariosObjetivo}
          onClick={guardarCambios}
        >
          {upsertMutation.isPending ? 'Guardando...' : 'Guardar semanario'}
        </Button>
      </footer>

      <AlternativasBottomSheet
        open={Boolean(tiempoActivo)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setTiempoActivoId(null);
          }
        }}
        tiempoNombre={tiempoActivo?.nombre ?? ''}
        opciones={tiempoActivo?.opciones ?? []}
        hiddenCount={tiempoActivo?.hiddenCount ?? 0}
        seleccionActual={tiempoActivo?.seleccionActual}
        readOnly={readOnly}
        onSeleccionar={(configuracionAlternativaId) => {
          if (!tiempoActivo) {
            return;
          }
          setDraft((current) => ({
            ...current,
            [tiempoActivo.tiempoId]: { configuracionAlternativaId },
          }));
        }}
      />
    </div>
  );
}
