"use client";

import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { X } from 'lucide-react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useHorariosAlmacen } from '../../_lib/useHorariosAlmacen';
import {
  ConfiguracionAlternativaSchema,
  type ConfiguracionAlternativa,
  TipoVentanaConfigAlternativa
} from 'shared/schemas/horarios';
import { slugify } from 'shared/utils/commonUtils';
import { ComedorDataSelector } from 'shared/schemas/complemento1';

interface DrawerConfigProps {
  tiempoComidaId: string | null;
  onClose: () => void;
  comedores: ComedorDataSelector[];
}

type FormData = z.infer<typeof ConfiguracionAlternativaSchema>;

const mapaMensajeTipoVentana: Record<TipoVentanaConfigAlternativa, string> = {
  normal: "Normal",
  inicia_dia_anterior: "Inicia el día anterior",
  termina_dia_siguiente: "Termina al día siguiente"
}

export default function DrawerConfig({ tiempoComidaId, onClose, comedores }: DrawerConfigProps) {
  const {
    datosBorrador,
    upsertConfiguracionAlternativa,
    archivarConfiguracionAlternativa,
    upsertTiempoComida,
    mostrarInactivos,
  } = useHorariosAlmacen();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const tiempoComida = useMemo(() => {
    if (!tiempoComidaId) return null;
    return datosBorrador.esquemaSemanal[tiempoComidaId];
  }, [tiempoComidaId, datosBorrador.esquemaSemanal]);

  const configuracionesFiltradas = useMemo(() => {
    return Object.entries(datosBorrador.configuracionesAlternativas)
      .map(([id, config]) => ({ id, ...config }))
      .filter(config => config.tiempoComidaId === tiempoComidaId);
  }, [tiempoComidaId, datosBorrador.configuracionesAlternativas]);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(ConfiguracionAlternativaSchema),
    defaultValues: {
      ventanaServicio: { horaInicio: '00:00', horaFin: '00:00', tipoVentana: 'normal' }
    }
  });

  const definicionIdSeleccionada = watch('definicionAlternativaId');
  const definicionSeleccionada = datosBorrador.catalogoAlternativas[definicionIdSeleccionada];
  const esTipoAusencia = definicionSeleccionada?.tipo === 'noComoEnCasa' || definicionSeleccionada?.tipo === 'ayuno';

  useEffect(() => {
    if (definicionIdSeleccionada && !editingId && tiempoComida) {
      const definicion = datosBorrador.catalogoAlternativas[definicionIdSeleccionada];
      if (definicion) {
        setValue('nombre', `${definicion.nombre} ${tiempoComida.dia}`);
      }
    }
  }, [definicionIdSeleccionada, editingId, tiempoComida, datosBorrador.catalogoAlternativas, setValue]);

  useEffect(() => {
    if (tiempoComidaId) {
      setValue('tiempoComidaId', tiempoComidaId);
      reset({
        estaActivo: true,
        tiempoComidaId: tiempoComidaId,
        ventanaServicio: { horaInicio: '00:00', horaFin: '00:00', tipoVentana: 'normal' }
      });
      setIsFormOpen(false);
      setEditingId(null);
    }
  }, [tiempoComidaId, setValue, reset]);

  const handleClose = () => {
    reset();
    setIsFormOpen(false);
    setEditingId(null);
    onClose();
  };

  const onSubmit = (data: FormData) => {
    if (!tiempoComidaId || !tiempoComida) return;

    const newId = editingId || slugify(`${data.nombre}-${Date.now()}`);
    
    const newConfig: ConfiguracionAlternativa = {
      ...data,
      tiempoComidaId,
    };

    if (esTipoAusencia) {
      delete newConfig.comedorId;
      delete newConfig.ventanaServicio;
    }

    upsertConfiguracionAlternativa(newId, newConfig);

    if (!tiempoComida.alternativas?.principal) {
      upsertTiempoComida(tiempoComidaId, {
        ...tiempoComida,
        alternativas: { ...tiempoComida.alternativas, principal: newId },
      });
    }

    reset();
    setIsFormOpen(false);
    setEditingId(null);
  };

  const handleEdit = (id: string, config: ConfiguracionAlternativa) => {
    setEditingId(id);
    reset(config); // Usar reset para poblar todo el formulario
    setIsFormOpen(true);
  };
  
  const handleArchive = (id: string) => {
    archivarConfiguracionAlternativa(id);
  };

  if (!tiempoComidaId || !tiempoComida) {
    return null;
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-end">
        <div className="fixed inset-0 bg-black/50" onClick={handleClose}></div>
        <div className="relative w-full bg-white rounded-t-2xl max-h-[90vh] overflow-y-auto p-4 transition-transform duration-300 ease-in-out transform translate-y-0">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold">Alternativas para: {tiempoComida.nombre}</h2>
            <button onClick={handleClose} className="p-1 rounded-full hover:bg-gray-200">
              <X size={24} />
            </button>
          </div>

          <div className="space-y-2 mb-4">
            {configuracionesFiltradas
              .filter(c => mostrarInactivos || c.estaActivo)
              .map(config => (
              <div key={config.id} className={`p-3 rounded-lg ${config.estaActivo ? 'bg-gray-100' : 'bg-red-100 opacity-70'}`}>
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{config.nombre}</span>
                      {tiempoComida.alternativas?.principal === config.id && (
                        <span className="px-2 py-0.5 text-xs font-medium text-white bg-blue-500 rounded-full">Principal</span>
                      )}
                    </div>
                    {config.ventanaServicio && (
                      <p className="text-sm text-gray-600">
                        Ventana: {config.ventanaServicio.horaInicio} - {config.ventanaServicio.horaFin}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleEdit(config.id, config)} className="text-sm text-blue-600 hover:underline">Editar</button>
                    {config.estaActivo && <button onClick={() => handleArchive(config.id)} className="text-sm text-red-600 hover:underline">Archivar</button>}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {!isFormOpen && (
            <div className="flex gap-2">
              <button onClick={() => { setIsFormOpen(true); setEditingId(null); reset({estaActivo: true, tiempoComidaId, ventanaServicio: { horaInicio: '00:00', horaFin: '00:00', tipoVentana: 'normal' }}); }} className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg font-semibold">
                + Añadir Alternativa
              </button>
            </div>
          )}

          {isFormOpen && (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 p-4 bg-gray-50 rounded-lg">
              <h3 className="font-semibold text-md">{editingId ? 'Editar' : 'Nueva'} Alternativa</h3>
              <div>
                <label htmlFor="nombre" className="block text-sm font-medium text-gray-700">Nombre</label>
                <input {...register('nombre')} id="nombre" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
                {errors.nombre && <p className="text-red-500 text-xs mt-1">{errors.nombre.message}</p>}
              </div>

              <div>
                <label htmlFor="definicionAlternativaId" className="block text-sm font-medium text-gray-700">Definición</label>
                <select {...register('definicionAlternativaId')} id="definicionAlternativaId" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm">
                  <option value="">Seleccione una definición</option>
                  {Object.entries(datosBorrador.catalogoAlternativas)
                    .filter(([,def]) => def.estaActiva)
                    .map(([id, def]) => <option key={id} value={id}>{def.nombre}</option>)}
                </select>
                {errors.definicionAlternativaId && <p className="text-red-500 text-xs mt-1">{errors.definicionAlternativaId.message}</p>}
              </div>

              <div>
                <label htmlFor="horarioSolicitudComidaId" className="block text-sm font-medium text-gray-700">Horario Solicitud</label>
                <select {...register('horarioSolicitudComidaId')} id="horarioSolicitudComidaId" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm">
                  {Object.entries(datosBorrador.horariosSolicitud)
                    .filter(([,horario]) => horario.estaActivo)
                    .map(([id, horario]) => <option key={id} value={id}>{horario.nombre}</option>)}
                </select>
                {errors.horarioSolicitudComidaId && <p className="text-red-500 text-xs mt-1">{errors.horarioSolicitudComidaId.message}</p>}
              </div>

              {!esTipoAusencia && (
                <>
                  <div>
                    <label htmlFor="comedorId" className="block text-sm font-medium text-gray-700">Comedor</label>
                    <select {...register('comedorId')} id="comedorId" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm">
                      <option value="">(Ninguno)</option>
                      {comedores.map(comedor => <option key={comedor.id} value={comedor.id}>{comedor.nombre}</option>)}
                    </select>
                    {errors.comedorId && <p className="text-red-500 text-xs mt-1">{errors.comedorId.message}</p>}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="ventanaServicio.horaInicio" className="block text-sm font-medium text-gray-700">Inicio Servicio</label>
                      <input type="time" {...register('ventanaServicio.horaInicio')} id="ventanaServicio.horaInicio" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" />
                      {errors.ventanaServicio?.horaInicio && <p className="text-red-500 text-xs mt-1">{errors.ventanaServicio.horaInicio.message}</p>}
                    </div>
                    <div>
                      <label htmlFor="ventanaServicio.horaFin" className="block text-sm font-medium text-gray-700">Fin Servicio</label>
                      <input type="time" {...register('ventanaServicio.horaFin')} id="ventanaServicio.horaFin" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" />
                      {errors.ventanaServicio?.horaFin && <p className="text-red-500 text-xs mt-1">{errors.ventanaServicio.horaFin.message}</p>}
                    </div>
                  </div>

                  <div>
                    <label htmlFor="ventanaServicio.tipoVentana" className="block text-sm font-medium text-gray-700">Tipo de Ventana</label>
                    <select {...register('ventanaServicio.tipoVentana')} id="ventanaServicio.tipoVentana" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm">
                      {Object.entries(mapaMensajeTipoVentana).map(([value, label]) => 
                        <option key={value} value={value}>{label}</option>
                      )}
                    </select>
                    {errors.ventanaServicio?.tipoVentana && <p className="text-red-500 text-xs mt-1">{errors.ventanaServicio.tipoVentana.message}</p>}
                  </div>
                </>
              )}
              
              <div className="flex items-center">
                <input type="checkbox" {...register('requiereAprobacion')} id="requiereAprobacion" className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                <label htmlFor="requiereAprobacion" className="ml-2 block text-sm text-gray-900">Requiere Aprobación</label>
              </div>

              <div className="flex items-center">
                <input type="checkbox" {...register('estaActivo')} id="estaActivo" className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                <label htmlFor="estaActivo" className="ml-2 block text-sm text-gray-900">Está Activo</label>
              </div>

              <div className="flex gap-2">
                <button type="submit" className="py-2 px-4 bg-green-600 text-white rounded-lg font-semibold">Guardar</button>
                <button type="button" onClick={() => setIsFormOpen(false)} className="py-2 px-4 bg-gray-300 text-black rounded-lg">Cancelar</button>
              </div>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
