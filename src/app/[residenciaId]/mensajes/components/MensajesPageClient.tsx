"use client";

import { useMemo, useState } from 'react';
import { useInfoUsuario } from '@/components/layout/AppProviders';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Mensaje } from 'shared/schemas/comunicacion/mensajes.dominio';
import { FormNuevoMensaje } from 'shared/schemas/comunicacion/mensajes.dto';
import { useMensajes, DestinatariosMensajesData } from '../hooks/useMensajes';

const ASUNTOS: Array<{ id: FormNuevoMensaje['asunto']; label: string }> = [
  { id: 'solicitud_aprobacion', label: 'Solicitud de aprobación' },
  { id: 'justificacion_ausencia', label: 'Justificación de ausencia' },
  { id: 'modificacion_directiva', label: 'Modificación directiva' },
  { id: 'rechazo_solicitud', label: 'Rechazo de solicitud' },
  { id: 'duda_operativa', label: 'Duda operativa' },
  { id: 'otro', label: 'Otro' },
];

type Props = {
  residenciaId: string;
  initialMensajes: Mensaje[];
  initialDestinatarios: DestinatariosMensajesData;
};

export default function MensajesPageClient({
  residenciaId,
  initialMensajes,
  initialDestinatarios,
}: Props) {
  const { usuarioId } = useInfoUsuario();
  const [asunto, setAsunto] = useState<FormNuevoMensaje['asunto']>('duda_operativa');
  const [cuerpo, setCuerpo] = useState('');
  const [destinoTipo, setDestinoTipo] = useState<'usuario' | 'grupo'>('usuario');
  const [destinatarioUsuarioId, setDestinatarioUsuarioId] = useState('');
  const [destinatarioGrupoAnaliticoId, setDestinatarioGrupoAnaliticoId] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<'todos' | 'enviado' | 'leido' | 'archivado'>('todos');

  const { mensajes, destinatarios, isLoading, isSending, cambiarEstado, enviarMensaje } = useMensajes(
    residenciaId,
    usuarioId,
    initialMensajes,
    initialDestinatarios
  );

  const mensajesFiltrados = useMemo(() => {
    const data = mensajes ?? [];
    if (filtroEstado === 'todos') {
      return data;
    }
    return data.filter((m) => m.estado === filtroEstado);
  }, [mensajes, filtroEstado]);

  const submit = () => {
    if (!cuerpo.trim()) {
      return;
    }

    if (destinoTipo === 'usuario' && !destinatarioUsuarioId) {
      return;
    }

    if (destinoTipo === 'grupo' && !destinatarioGrupoAnaliticoId) {
      return;
    }

    const payload: FormNuevoMensaje =
      destinoTipo === 'usuario'
        ? {
            destinoTipo: 'usuario',
            destinatarioUsuarioId,
            asunto,
            cuerpo: cuerpo.trim(),
          }
        : {
            destinoTipo: 'grupo',
            destinatarioGrupoAnaliticoId,
            asunto,
            cuerpo: cuerpo.trim(),
          };

    enviarMensaje(payload);
    setCuerpo('');
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[420px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Nuevo mensaje</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <label className="text-sm font-medium">Tipo de destino</label>
            <select
              className="w-full rounded-md border px-3 py-2 text-sm"
              value={destinoTipo}
              onChange={(event) => setDestinoTipo(event.target.value as 'usuario' | 'grupo')}
            >
              <option value="usuario">Usuario</option>
              <option value="grupo">Grupo</option>
            </select>
          </div>

          {destinoTipo === 'usuario' ? (
            <div className="space-y-1">
              <label className="text-sm font-medium">Destinatario</label>
              <select
                className="w-full rounded-md border px-3 py-2 text-sm"
                value={destinatarioUsuarioId}
                onChange={(event) => setDestinatarioUsuarioId(event.target.value)}
              >
                <option value="">Selecciona un usuario</option>
                {(destinatarios?.usuarios ?? []).map((usuario) => (
                  <option key={usuario.id} value={usuario.id}>
                    {usuario.nombre}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="space-y-1">
              <label className="text-sm font-medium">Grupo</label>
              <select
                className="w-full rounded-md border px-3 py-2 text-sm"
                value={destinatarioGrupoAnaliticoId}
                onChange={(event) => setDestinatarioGrupoAnaliticoId(event.target.value)}
              >
                <option value="">Selecciona un grupo</option>
                {(destinatarios?.grupos ?? []).map((grupo) => (
                  <option key={grupo.id} value={grupo.id}>
                    {grupo.nombre}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-sm font-medium">Asunto</label>
            <select
              className="w-full rounded-md border px-3 py-2 text-sm"
              value={asunto}
              onChange={(event) => setAsunto(event.target.value as FormNuevoMensaje['asunto'])}
            >
              {ASUNTOS.map((opcion) => (
                <option key={opcion.id} value={opcion.id}>
                  {opcion.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Mensaje</label>
            <Textarea
              value={cuerpo}
              onChange={(event) => setCuerpo(event.target.value)}
              maxLength={500}
              rows={5}
              placeholder="Escribe tu mensaje"
            />
          </div>

          <Button onClick={submit} disabled={isSending} className="w-full">
            {isSending ? 'Enviando...' : 'Enviar mensaje'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-3">
          <CardTitle>Bandeja de entrada</CardTitle>
          <div className="flex items-center gap-2">
            <Input
              readOnly
              value={`Total: ${mensajes?.length ?? 0}`}
              className="max-w-[140px]"
            />
            <select
              className="rounded-md border px-3 py-2 text-sm"
              value={filtroEstado}
              onChange={(event) => setFiltroEstado(event.target.value as typeof filtroEstado)}
            >
              <option value="todos">Todos</option>
              <option value="enviado">Enviados</option>
              <option value="leido">Leídos</option>
              <option value="archivado">Archivados</option>
            </select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? <p className="text-sm text-muted-foreground">Cargando mensajes...</p> : null}

          {!isLoading && mensajesFiltrados.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay mensajes en este filtro.</p>
          ) : null}

          <div className="space-y-3">
            {mensajesFiltrados.map((mensaje) => (
              <div key={mensaje.id} className="rounded-md border p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-sm font-medium">{mensaje.asunto}</div>
                  <Badge variant={String(mensaje.estado) === 'enviado' ? 'secondary' : 'outline'}>{mensaje.estado}</Badge>
                </div>

                <p className="mb-2 text-sm whitespace-pre-wrap">{mensaje.cuerpo}</p>

                <p className="mb-3 text-xs text-muted-foreground">
                  Remitente: {mensaje.remitenteId} · {typeof mensaje.timestampCreacion === 'string' ? mensaje.timestampCreacion : 'sin fecha'}
                </p>

                <div className="flex items-center gap-2">
                  {String(mensaje.estado) === 'enviado' ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => cambiarEstado({ mensajeId: mensaje.id!, estado: 'leido' })}
                    >
                      Marcar leído
                    </Button>
                  ) : null}

                  {mensaje.estado !== 'archivado' ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => cambiarEstado({ mensajeId: mensaje.id!, estado: 'archivado' })}
                    >
                      Archivar
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


