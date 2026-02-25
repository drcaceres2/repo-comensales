'use client';

import { useState, useTransition } from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Actividad, InscripcionActividad } from '@/../shared/schemas/actividades';
import type { ResidenciaId, RolUsuario } from '@/../shared/models/types';
import { useAuth } from '@/hooks/useAuth';
import { Loader2, UserPlus, Info, Users, Soup, CheckCircle, XCircle } from 'lucide-react';
import {
  inscribirEnActividad,
  responderInvitacion,
  cancelarInscripcion,
} from './actions';
import { useToast } from '@/hooks/useToast';
import { Badge } from '@/components/ui/badge';

interface ActividadDisponible extends Actividad {
  inscritos: number;
  invitaciones: InscripcionActividad[];
}

interface ActividadesClientProps {
  actividadesIniciales: ActividadDisponible[];
  residenciaId: ResidenciaId;
}

export function ActividadesClient({
  actividadesIniciales,
  residenciaId,
}: ActividadesClientProps) {
  const { user, claims: profile } = useAuth();
  const { toast } = useToast();
  const [actividades, setActividades] = useState(actividadesIniciales);
  const [isPending, startTransition] = useTransition();

  const userInscriptions = new Map<string, InscripcionActividad>();
    actividades.forEach(act => {
        act.invitaciones.forEach(inv => {
            if (inv.usuarioInscritoId === user?.uid) {
                userInscriptions.set(act.id, inv);
            }
        })
    });


  const handleInscribirse = async (actividadId: string) => {
    startTransition(async () => {
      try {
        await inscribirEnActividad(residenciaId, actividadId);
        toast({ title: '¡Inscripción exitosa!', description: 'Te has apuntado a la actividad.' });
      } catch (error) {
        toast({
          title: 'Error en la inscripción',
          description: error instanceof Error ? error.message : 'Ocurrió un error desconocido.',
          variant: 'destructive',
        });
      }
    });
  };

  const handleResponderInvitacion = async (inscripcionId: string, aceptar: boolean) => {
    startTransition(async () => {
        try {
            await responderInvitacion(residenciaId, inscripcionId, aceptar);
            toast({ title: `Invitación ${aceptar ? 'aceptada' : 'rechazada'}` });
        } catch (error) {
            toast({
              title: 'Error al responder',
              description: error instanceof Error ? error.message : 'Ocurrió un error desconocido.',
              variant: 'destructive',
            });
        }
    });
  }

  const handleCancelarInscripcion = async (inscripcionId: string) => {
    startTransition(async () => {
        try {
            await cancelarInscripcion(residenciaId, inscripcionId);
            toast({ title: 'Inscripción cancelada' });
        } catch (error) {
            toast({
              title: 'Error al cancelar',
              description: error instanceof Error ? error.message : 'Ocurrió un error desconocido.',
              variant: 'destructive',
            });
        }
    });
  }

  const isInviteAccordionVisible = (actividad: ActividadDisponible): boolean => {
    if (!user || !profile) return false;
    const userRoles = (profile.roles || []) as RolUsuario[];
    if (actividad.organizadorId === user.uid || userRoles.includes('director')) return true;
    if ((userRoles.includes('residente') || userRoles.includes('invitado')) && actividad.modoAccesoResidentes?.accesoUsuario === 'abierto') {
      return true;
    }
    // TODO: Add logic for assistants with permissions
    return false;
  };

  if (!actividades || actividades.length === 0) {
    return (
      <div className="container mx-auto mt-10 text-center">
        <Card>
          <CardHeader><CardTitle>No hay actividades disponibles</CardTitle></CardHeader>
          <CardContent><p>Por el momento no hay actividades con inscripción abierta. ¡Vuelve a consultar más tarde!</p></CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto mt-10">
      <h1 className="text-3xl font-bold mb-6">Inscripción a Actividades</h1>
      <Accordion type="single" collapsible className="w-full space-y-4">
        {actividades.map((actividad) => {
          const inscripcion = userInscriptions.get(actividad.id);
          const estaInscrito = inscripcion && (inscripcion.estadoInscripcion === 'inscrito_directo' || inscripcion.estadoInscripcion === 'invitado_aceptado');
          const esInvitadoPendiente = inscripcion && inscripcion.estadoInscripcion === 'invitado_pendiente';

          return (
            <AccordionItem value={actividad.id} key={actividad.id} className="border rounded-lg bg-card">
              <AccordionTrigger className="p-4 text-lg font-medium">
                <div className="flex items-center justify-between w-full pr-4">
                  <span>{actividad.nombre}</span>
                  {estaInscrito && <Badge variant="default" className="bg-green-600">Inscrito</Badge>}
                  {esInvitadoPendiente && <Badge variant="secondary">Invitación pendiente</Badge>}
                </div>
              </AccordionTrigger>
              <AccordionContent className="p-4 pt-0">
                <Accordion type="multiple" defaultValue={['info-general']}>
                  <AccordionItem value="info-general">
                    <AccordionTrigger><Info className="mr-2" /> Información General</AccordionTrigger>
                    <AccordionContent className="p-4">
                      <p>{actividad.descripcion}</p>
                      <div className="mt-4 space-y-2 text-sm">
                        <p><strong>Fecha de Inicio:</strong> {actividad.fechaInicio}</p>
                        <p><strong>Fecha Final:</strong> {actividad.fechaFin}</p>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="inscribirse">
                    <AccordionTrigger><UserPlus className="mr-2" /> Inscribirse</AccordionTrigger>
                    <AccordionContent className="p-4 space-y-4">
                      <div><strong>Cupos disponibles:</strong> {actividad.maxParticipantes ? actividad.maxParticipantes - actividad.inscritos : 'Ilimitados'}</div>
                      <div><strong>Fecha límite de inscripción:</strong> {actividad.fechaLimiteInscripcion || actividad.fechaInicio}</div>
                      
                      {estaInscrito ? (
                          <div className='flex items-center gap-4'>
                            <p className="text-green-600 font-semibold flex items-center"><CheckCircle className="mr-2" /> Ya estás inscrito.</p>
                            <Button variant="destructive" onClick={() => handleCancelarInscripcion(inscripcion.id)} disabled={isPending}>
                                {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}
                                Cancelar Inscripción
                            </Button>
                          </div>
                      ) : esInvitadoPendiente ? (
                        <div className='mt-4'>
                            <h4 className='font-semibold'>Invitación Recibida:</h4>
                            <p className="mb-2">Has sido invitado a esta actividad.</p>
                            <div className='flex gap-2'>
                                <Button onClick={() => handleResponderInvitacion(inscripcion.id, true)} disabled={isPending} variant="default">
                                    {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Aceptar
                                </Button>
                                <Button onClick={() => handleResponderInvitacion(inscripcion.id, false)} disabled={isPending} variant="outline">
                                    {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Rechazar
                                </Button>
                            </div>
                        </div>
                      ) : (
                        <Button onClick={() => handleInscribirse(actividad.id)} disabled={isPending}>
                            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Inscribirme
                        </Button>
                      )}
                    </AccordionContent>
                  </AccordionItem>

                  {isInviteAccordionVisible(actividad) && (
                    <AccordionItem value="invitar-gente">
                      <AccordionTrigger><Users className="mr-2" /> Invitar gente</AccordionTrigger>
                      <AccordionContent className="p-4"><p>Aquí irá la funcionalidad para invitar a otras personas.</p></AccordionContent>
                    </AccordionItem>
                  )}

                  {actividad.planComidas && actividad.planComidas.length > 0 && (
                    <AccordionItem value="plan-comidas">
                      <AccordionTrigger><Soup className="mr-2" /> Plan de comidas</AccordionTrigger>
                      <AccordionContent className="p-4">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left"><th className="p-2">Fecha</th><th className="p-2">Hora</th><th className="p-2">Comida</th></tr>
                          </thead>
                          <tbody>
                            {actividad.planComidas.sort((a, b) => (a.horaEstimada || '').localeCompare(b.horaEstimada || '')).map((comida, index) => (
                              <tr key={index} className="border-t">
                                <td className="p-2">{comida.fechaComida}</td><td className="p-2">{comida.horaEstimada || '-'}</td><td className="p-2">{comida.nombreTiempoComida}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </AccordionContent>
                    </AccordionItem>
                  )}
                </Accordion>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}
