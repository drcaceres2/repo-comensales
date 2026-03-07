'use client';

import React from 'react';
import { useForm, Controller } from 'react-hook-form';
import { DataFormularioDia } from '../lib/useFormularioDia';
import { useUpdateAlteracion } from '../lib/consultas';
import { extractDeltaPayload } from '../lib/mappers';
import { ConfigAlternativaAjustada } from 'shared/schemas/alteraciones';
import { TipoVentanaConfigAlternativa } from 'shared/schemas/horarios';

// UI Components (assuming shadcn/ui)
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Lock } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';

type FormularioMasterDetailProps = {
  diaData: DataFormularioDia;
  fecha: string;
  residenciaId: string;
};

const OPCIONES_TIPO_VENTANA: Array<{ value: TipoVentanaConfigAlternativa; label: string }> = [
  { value: 'normal', label: 'Normal' },
  { value: 'inicia_dia_anterior', label: 'Inicia el dia anterior' },
  { value: 'termina_dia_siguiente', label: 'Termina al dia siguiente' },
];

const FormularioMasterDetail: React.FC<FormularioMasterDetailProps> = ({ diaData, fecha, residenciaId }) => {
  const form = useForm<DataFormularioDia>({ defaultValues: diaData });
  const { register, control, handleSubmit, watch, setValue, getValues, formState: { isDirty } } = form;

  React.useEffect(() => {
    form.reset(diaData);
  }, [diaData, form]);
  
  const updateAlteracionMutation = useUpdateAlteracion(residenciaId);

  const onSubmit = (formData: DataFormularioDia) => {
    const payload = extractDeltaPayload(residenciaId, fecha, diaData.tiemposComida, formData.tiemposComida);
    if (payload) {
      updateAlteracionMutation.mutate(payload, {
        onSuccess: () => {
          form.reset(formData); // Resets the dirty state with the new submitted values
        }
      });
    }
  };

  const poblarAlternativasIniciales = (tiempoComidaId: string) => {
    const tiempoActual = getValues(`tiemposComida.${tiempoComidaId}`);
    if (!tiempoActual) return;

    const yaTieneAlternativas = Object.keys(tiempoActual.alternativasEditables ?? {}).length > 0;
    if (yaTieneAlternativas) return;

    const alternativasOriginales = tiempoActual.alternativasOriginales ?? {};
    const idsOriginales = Object.keys(alternativasOriginales);
    if (idsOriginales.length === 0) return;

    setValue(
      `tiemposComida.${tiempoComidaId}.alternativasEditables`,
      alternativasOriginales,
      { shouldDirty: true, shouldTouch: true, shouldValidate: true }
    );

    const idPorDefectoActual = getValues(`tiemposComida.${tiempoComidaId}.alternativaPorDefectoIdActual`);
    if (!idPorDefectoActual || !alternativasOriginales[idPorDefectoActual]) {
      setValue(
        `tiemposComida.${tiempoComidaId}.alternativaPorDefectoIdActual`,
        idsOriginales[0],
        { shouldDirty: true, shouldTouch: true, shouldValidate: true }
      );
    }
  };
  
  const agregarAlternativa = (tiempoComidaId: string) => {
    const newAltId = `new-${Date.now()}`;
    const tiempoActual = getValues(`tiemposComida.${tiempoComidaId}`);
    if (!tiempoActual) return;

    const primeraDefinicionId = Object.keys(tiempoActual.definicionesAlternativas ?? {})[0] ?? '';
    const primerHorarioSolicitudId = Object.keys(diaData.horariosSolicitud ?? {})[0] ?? '';
    const primerComedorId = Object.keys(diaData.comedores ?? {})[0] ?? '';

    const nuevaAlternativa: ConfigAlternativaAjustada = {
      definicionAlternativaId: primeraDefinicionId,
      horarioSolicitudComidaId: primerHorarioSolicitudId,
      ventanaServicio: { horaInicio: '12:00', horaFin: '14:00', tipoVentana: 'normal' },
      comedorId: primerComedorId,
      requiereAprobacion: false,
    };

    setValue(
      `tiemposComida.${tiempoComidaId}.alternativasEditables.${newAltId}`,
      nuevaAlternativa,
      { shouldDirty: true, shouldTouch: true, shouldValidate: true }
    );

    const idPorDefectoActual = getValues(`tiemposComida.${tiempoComidaId}.alternativaPorDefectoIdActual`);
    if (!idPorDefectoActual) {
      setValue(
        `tiemposComida.${tiempoComidaId}.alternativaPorDefectoIdActual`,
        newAltId,
        { shouldDirty: true, shouldTouch: true, shouldValidate: true }
      );
    }
  };

  const tiemposComidaOrdenados = React.useMemo(
    () => Object.values(diaData.tiemposComida).sort((a, b) => a.orden - b.orden),
    [diaData.tiemposComida]
  );

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {tiemposComidaOrdenados.map((tiempo) => {
        const tiempoComidaId = tiempo.id;
        const esAlterado = watch(`tiemposComida.${tiempoComidaId}.esAlterado`);
        const watchedAlternativas = watch(`tiemposComida.${tiempoComidaId}.alternativasEditables`) || {};
        const alternativasEntries = Object.entries(watchedAlternativas) as Array<[string, ConfigAlternativaAjustada]>;

        if (tiempo.esInmutable) {
          return (
            <Card key={tiempoComidaId} className="bg-muted/50 opacity-70">
              <CardHeader>
                <CardTitle className="flex items-center text-muted-foreground">
                  <Lock className="mr-2 h-5 w-5" />
                  {tiempo.nombreGrupo}
                </CardTitle>
                <CardDescription>
                  Este horario ya está consolidado y no puede alterarse.
                </CardDescription>
              </CardHeader>
            </Card>
          );
        }

        return (
          <Card key={tiempoComidaId}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{tiempo.nombreGrupo}</CardTitle>
                <Controller
                  name={`tiemposComida.${tiempoComidaId}.esAlterado`}
                  control={control}
                  render={({ field }) => (
                    <div className="flex items-center space-x-2">
                      <Label htmlFor={`alterar-${tiempoComidaId}`}>Alterar Horario</Label>
                      <Switch
                        id={`alterar-${tiempoComidaId}`}
                        checked={field.value}
                        onCheckedChange={(checked) => {
                          field.onChange(checked);
                          if (checked) {
                            poblarAlternativasIniciales(tiempoComidaId);
                          }
                        }}
                      />
                    </div>
                  )}
                />
              </div>
            </CardHeader>
            {esAlterado && (
              <CardContent className="space-y-6 pt-4 border-t">
                <div>
                  <Label htmlFor={`motivo-${tiempoComidaId}`}>Motivo de la Alteración</Label>
                  <Textarea
                    id={`motivo-${tiempoComidaId}`}
                    {...register(`tiemposComida.${tiempoComidaId}.motivoActual`, { required: 'El motivo es obligatorio.' })}
                    placeholder="Ej: Mantenimiento en la cocina principal"
                  />
                  {form.formState.errors.tiemposComida?.[tiempoComidaId]?.motivoActual && (
                     <p className="text-sm font-medium text-destructive">{form.formState.errors.tiemposComida[tiempoComidaId]?.motivoActual?.message}</p>
                  )}
                </div>

                <Controller
                  name={`tiemposComida.${tiempoComidaId}.alternativaPorDefectoIdActual`}
                  control={control}
                  rules={{ required: "Debe seleccionar una alternativa de contingencia."}}
                  render={({ field }) => (
                    <div className="space-y-2">
                      <Label>Alternativas Disponibles (Seleccione una como contingencia)</Label>
                      {alternativasEntries.length === 0 ? (
                        <div className="flex flex-col items-center justify-center rounded-md border border-dashed p-8 text-center mt-2">
                          <p className="text-muted-foreground">No hay alternativas de contingencia definidas.</p>
                          <Button
                            type="button"
                            variant="outline"
                            className="mt-4"
                            onClick={() => agregarAlternativa(tiempoComidaId)}
                          >
                            Agregar Alternativa
                          </Button>
                        </div>
                      ) : (
                        <>
                          <RadioGroup onValueChange={field.onChange} value={field.value ?? ''} className="space-y-4 pt-2">
                            {alternativasEntries.map(([altId, alternativa], index) => (
                              <div key={altId} className="flex items-start space-x-4 rounded-md border p-4">
                                 <RadioGroupItem value={altId} id={`${tiempoComidaId}-${altId}`} className="mt-1" />
                                 <div className="flex-1 grid grid-cols-1 gap-4 md:grid-cols-2">
                                    <div className="space-y-2 md:col-span-2">
                                      <Label>Alternativa #{index + 1}</Label>
                                      <p className="text-sm text-muted-foreground">
                                        {tiempo.definicionesAlternativas[alternativa.definicionAlternativaId]?.nombre ?? alternativa.definicionAlternativaId}
                                      </p>
                                    </div>

                                    <div className="space-y-2">
                                      <Label>Definicion de Alternativa</Label>
                                      <select
                                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                        {...register(`tiemposComida.${tiempoComidaId}.alternativasEditables.${altId}.definicionAlternativaId`)}
                                      >
                                        {Object.values(tiempo.definicionesAlternativas).map((definicion) => (
                                          <option key={definicion.id} value={definicion.id}>{definicion.nombre}</option>
                                        ))}
                                      </select>
                                    </div>

                                    <div className="space-y-2">
                                      <Label>Horario de Solicitud</Label>
                                      <select
                                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                        {...register(`tiemposComida.${tiempoComidaId}.alternativasEditables.${altId}.horarioSolicitudComidaId`)}
                                      >
                                        {Object.values(diaData.horariosSolicitud).map((horario) => (
                                          <option key={horario.id} value={horario.id}>{horario.nombre}</option>
                                        ))}
                                      </select>
                                    </div>

                                    <div className="space-y-2">
                                      <Label>Comedor</Label>
                                      <select
                                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                        {...register(`tiemposComida.${tiempoComidaId}.alternativasEditables.${altId}.comedorId`)}
                                      >
                                        <option value="">Sin comedor</option>
                                        {Object.values(diaData.comedores).map((comedor) => (
                                          <option key={comedor.id} value={comedor.id}>{comedor.nombre}</option>
                                        ))}
                                      </select>
                                    </div>

                                    <div className="space-y-2">
                                      <Label>Tipo de Ventana</Label>
                                      <select
                                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                        {...register(`tiemposComida.${tiempoComidaId}.alternativasEditables.${altId}.ventanaServicio.tipoVentana`)}
                                      >
                                        {OPCIONES_TIPO_VENTANA.map((opcion) => (
                                          <option key={opcion.value} value={opcion.value}>{opcion.label}</option>
                                        ))}
                                      </select>
                                    </div>

                                    <div className="space-y-2">
                                      <Label>Hora Inicio</Label>
                                      <Input
                                        type="time"
                                        {...register(`tiemposComida.${tiempoComidaId}.alternativasEditables.${altId}.ventanaServicio.horaInicio`)}
                                      />
                                    </div>

                                    <div className="space-y-2">
                                      <Label>Hora Fin</Label>
                                      <Input
                                        type="time"
                                        {...register(`tiemposComida.${tiempoComidaId}.alternativasEditables.${altId}.ventanaServicio.horaFin`)}
                                      />
                                    </div>

                                    <Controller
                                      name={`tiemposComida.${tiempoComidaId}.alternativasEditables.${altId}.requiereAprobacion`}
                                      control={control}
                                      render={({ field: aprobacionField }) => (
                                        <div className="space-y-2 md:col-span-2">
                                          <div className="flex items-center justify-between rounded-md border p-3">
                                            <Label>Requiere Aprobacion</Label>
                                            <Switch
                                              checked={aprobacionField.value}
                                              onCheckedChange={aprobacionField.onChange}
                                            />
                                          </div>
                                        </div>
                                      )}
                                    />
                                 </div>
                              </div>
                            ))}
                          </RadioGroup>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="mt-4"
                            onClick={() => agregarAlternativa(tiempoComidaId)}
                          >
                            Agregar Otra Alternativa
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                />
                 {form.formState.errors.tiemposComida?.[tiempoComidaId]?.alternativaPorDefectoIdActual && (
                     <p className="text-sm font-medium text-destructive">{form.formState.errors.tiemposComida[tiempoComidaId]?.alternativaPorDefectoIdActual?.message}</p>
                  )}
              </CardContent>
            )}
          </Card>
        );
      })}
      <div className="flex justify-end">
        <Button type="submit" disabled={!isDirty || updateAlteracionMutation.isPending}>
          {updateAlteracionMutation.isPending ? 'Guardando...' : 'Guardar Cambios'}
        </Button>
      </div>
    </form>
  );
};

export default FormularioMasterDetail;
