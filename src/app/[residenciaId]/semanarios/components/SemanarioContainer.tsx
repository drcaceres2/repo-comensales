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

  const [targetUid, setTargetUid] = useState(usuarioId);
  const [tiempoActivoId, setTiempoActivoId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, EleccionSemanario>>({});
  const [diaActivo, setDiaActivo] = useState<string>('lunes');
  const [titleScrollOffset, setTitleScrollOffset] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const usuariosTargetQuery = useUsuariosObjetivoSemanarios(residenciaId);
  const dataQuery = useSemanarioQuery(residenciaId, targetUid);
  const upsertMutation = useUpsertSemanarioMutation(residenciaId, targetUid);

  const singleton = dataQuery.singleton;
  const read = dataQuery.read;
  const semanaIsoActual = read?.semanaIsoActual ?? singleton?.fechaHoraReferenciaUltimaSolicitud ? semanaIsoNow() : semanaIsoNow();
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
    const opciones = candidatos
      .map((configId) => {
        const config = singleton.configuracionesAlternativas[configId];
        if (!config || !config.estaActivo) {
          return null;
        }

        const definicion = singleton.catalogoAlternativas[config.definicionAlternativaId];
        if (!definicion || !definicion.estaActiva) {
          return null;
        }

        return {
          configuracionAlternativaId: configId,
          nombre: config.nombre,
          tipo: definicion.tipo,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    return {
      tiempoId: tiempoActivoId,
      nombre: tiempo.nombre,
      opciones,
      seleccionActual: draft[tiempoActivoId]?.configuracionAlternativaId,
    };
  }, [singleton, tiempoActivoId, draft]);

  const puedeSeleccionarTarget = roles.includes('director') || roles.includes('asistente');
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

    const result = await upsertMutation.mutateAsync(payload);

    if (result.success) {
      router.push(`/${residenciaId}`);
    }
  };

  if (dataQuery.isLoading || usuariosTargetQuery.isLoading) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (dataQuery.isError || usuariosTargetQuery.isError || !read || !singleton) {
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
            mostrarTitulo ? 'max-h-24 translate-y-0 opacity-100' : 'max-h-0 -translate-y-3 opacity-0'
          }`}
        >
          <div className="space-y-2 pb-4">
            <h1 className="flex items-center gap-2 text-xl font-semibold">
              <CalendarSync className="h-5 w-5 shrink-0" />
              Mi horario base
            </h1>
            <p className="text-sm text-muted-foreground">
              Configura tu semanario base. Los cambios se aplican en cascada desde el Home.
            </p>
          </div>
        </header>

        <div className="flex items-center justify-between gap-3 pb-3">
          <Badge variant="outline">Semana activa: {read.semanaIsoActual}</Badge>
          <Badge variant={readOnly ? 'secondary' : 'default'}>
            {readOnly ? 'Solo lectura' : 'Editable'}
          </Badge>
        </div>

        <BandaDias diaActivo={diaActivo} />
      </div>

      <div ref={scrollContainerRef} className="min-h-0 flex-1 overflow-y-auto py-4">
        <div className="space-y-4 pb-4">
          {puedeSeleccionarTarget ? (
            <section className="space-y-2 rounded-lg border bg-muted/30 p-3">
              <p className="text-sm font-medium">Usuario objetivo</p>
              <Select value={targetUid} onValueChange={setTargetUid}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un usuario" />
                </SelectTrigger>
                <SelectContent>
                  {(usuariosTargetQuery.data ?? []).map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.nombre} {user.apellido}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </section>
          ) : null}

          <AgendaVertical
            dias={diasRender}
            readOnly={readOnly}
            onSeleccionarTiempo={(tiempoId) => setTiempoActivoId(tiempoId)}
            onDiaActivo={setDiaActivo}
            scrollContainerRef={scrollContainerRef}
          />
        </div>
      </div>

      <footer className="sticky bottom-0 z-30 shrink-0 space-y-3 border-t bg-background/95 pt-3 backdrop-blur">
        {errorPie ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {errorPie}
          </div>
        ) : null}

        <Button
          className="w-full"
          disabled={readOnly || upsertMutation.isPending}
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
