"use client";

import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useHorariosAlmacen } from '../../_lib/useHorariosAlmacen';
import {
  ConfiguracionAlternativaSchema,
  TipoVentanaConfigAlternativa,
  type ConfiguracionAlternativa,
  MultipleConfigSchema,
  type MultipleConfigFormData
} from 'shared/schemas/horarios';
import { ComedorDataSelector } from 'shared/schemas/complemento1';
import { ArregloDiaDeLaSemana, DiaDeLaSemana } from 'shared/schemas/fechas';
import { slugify } from 'shared/utils/commonUtils';
import { useToast } from '@/hooks/useToast';

interface DrawerConfigMultipleProps {
  isOpen: boolean;
  onClose: () => void;
  comedores: ComedorDataSelector[];
}

const mapaMensajeTipoVentana: Record<TipoVentanaConfigAlternativa, string> = {
  normal: "Normal",
  inicia_dia_anterior: "Inicia el día anterior",
  termina_dia_siguiente: "Termina al día siguiente"
};

const opcionesAntelacion = [
  { value: 0, label: "Mismo día" },
  { value: 1, label: "Un día antes" },
  { value: 2, label: "Dos días antes" },
  { value: 3, label: "Tres días antes" },
  { value: 4, label: "Cuatro días antes" },
  { value: 5, label: "Cinco días antes" },
  { value: 6, label: "Seis días antes" },
];

export default function DrawerConfigMultiple({ isOpen, onClose, comedores }: DrawerConfigMultipleProps) {
  const { datosBorrador, upsertConfiguracionAlternativa, upsertTiempoComida } = useHorariosAlmacen();
  const { toast } = useToast();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<MultipleConfigFormData>({
    resolver: zodResolver(MultipleConfigSchema),
    defaultValues: {
      estaActivo: true,
      antelacion: 1,
      dias: [],
      ventanaServicio: { horaInicio: '00:00', horaFin: '00:00', tipoVentana: 'normal' }
    },
  });

  const onSubmit = (data: MultipleConfigFormData) => {
    const { definicionAlternativaId, dias, antelacion, ...restOfData } = data;
    const definicion = datosBorrador.catalogoAlternativas[definicionAlternativaId];

    if (!definicion) {
      toast({ title: "Error", description: "La definición seleccionada no es válida.", variant: "destructive" });
      return;
    }

    const resultados = { exitosos: [] as string[], fallidos: [] as string[] };

    dias.forEach(diaDeLaComida => {
      const [tiempoComidaId, tiempoComida] = Object.entries(datosBorrador.esquemaSemanal).find(([, tc]) =>
        tc.dia === diaDeLaComida && tc.grupoComida === definicion.grupoComida && tc.estaActivo
      ) || [null, null];

      if (!tiempoComidaId || !tiempoComida) {
        resultados.fallidos.push(`- ${diaDeLaComida}: No se encontró un tiempo de comida activo para el grupo '${datosBorrador.gruposComidas[definicion.grupoComida]?.nombre}'.`);
        return;
      }

      const diaComidaIndex = ArregloDiaDeLaSemana.indexOf(diaDeLaComida as DiaDeLaSemana);
      const diaSolicitudIndex = (diaComidaIndex - antelacion + 7) % 7;
      const diaDeSolicitud = ArregloDiaDeLaSemana[diaSolicitudIndex];

      const [horarioPrincipalId] = Object.entries(datosBorrador.horariosSolicitud).find(([, h]) =>
        h.dia === diaDeSolicitud && h.esPrimario && h.estaActivo
      ) || [null];

      if (!horarioPrincipalId) {
        resultados.fallidos.push(`- ${diaDeLaComida}: No se encontró un horario de solicitud principal y activo para el ${diaDeSolicitud}.`);
        return;
      }

      const nombre = `${definicion.nombre} ${diaDeLaComida}`;
      const newId = slugify(`${nombre}-${Date.now()}`);
      
      const newConfig: ConfiguracionAlternativa = {
        nombre,
        definicionAlternativaId,
        tiempoComidaId,
        horarioSolicitudComidaId: horarioPrincipalId,
        ...restOfData,
      };

      upsertConfiguracionAlternativa(newId, newConfig);

      if (!tiempoComida.alternativas?.principal) {
        upsertTiempoComida(tiempoComidaId, {
          ...tiempoComida,
          alternativas: { ...tiempoComida.alternativas, principal: newId },
        });
      }

      resultados.exitosos.push(diaDeLaComida);
    });

    if (resultados.exitosos.length > 0) {
      toast({
        title: "Operación completada",
        description: `Se crearon alternativas para: ${resultados.exitosos.join(', ')}.`,
        variant: "default",
      });
    }

    if (resultados.fallidos.length > 0) {
      toast({
        title: "Se encontraron errores",
        description: `No se pudieron crear alternativas para algunos días:\n${resultados.fallidos.join('\n')}`,
        variant: "destructive",
        duration: 10000,
      });
    }

    onClose();
    reset();
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div className="fixed inset-0 bg-black/60" onClick={onClose}></div>
      <div className="relative w-full bg-white rounded-t-2xl max-h-[95vh] overflow-y-auto p-4">
        <h2 className="text-lg font-bold mb-4">Añadir Alternativa a Varios Días</h2>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          
          <div>
            <label htmlFor="definicionAlternativaId" className="block text-sm font-medium text-gray-700">Definición</label>
            <select {...register('definicionAlternativaId')} id="definicionAlternativaId" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm">
              <option value="">Seleccione una definición</option>
              {Object.entries(datosBorrador.catalogoAlternativas)
                .filter(([,def]) => def.estaActiva)
                .map(([id, def]) => <option key={id} value={id}>{def.nombre}</option>)}
            </select>
            {errors.definicionAlternativaId && <p className="text-red-500 text-xs mt-1">{errors.definicionAlternativaId.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Aplicar en los días</label>
            <div className="grid grid-cols-3 gap-2 mt-1">
              {ArregloDiaDeLaSemana.map(dia => (
                <label key={dia} className="flex items-center space-x-2">
                  <input type="checkbox" {...register('dias')} value={dia} className="h-4 w-4 rounded border-gray-300" />
                  <span className="capitalize">{dia}</span>
                </label>
              ))}
            </div>
            {errors.dias && <p className="text-red-500 text-xs mt-1">{errors.dias.message}</p>}
          </div>

          <div>
            <label htmlFor="comedorId" className="block text-sm font-medium text-gray-700">Comedor</label>
            <select {...register('comedorId')} id="comedorId" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm">
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
            <select {...register('ventanaServicio.tipoVentana')} id="ventanaServicio.tipoVentana" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm">
              {Object.entries(mapaMensajeTipoVentana).map(([value, label]) => 
                <option key={value} value={value}>{label}</option>
              )}
            </select>
            {errors.ventanaServicio?.tipoVentana && <p className="text-red-500 text-xs mt-1">{errors.ventanaServicio.tipoVentana.message}</p>}
          </div>

          <div>
            <label htmlFor="antelacion" className="block text-sm font-medium text-gray-700">Horario de Solicitud</label>
            <select {...register('antelacion')} id="antelacion" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm">
              {opcionesAntelacion.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
            {errors.antelacion && <p className="text-red-500 text-xs mt-1">{errors.antelacion.message}</p>}
          </div>

          <div className="flex items-center">
            <input type="checkbox" {...register('requiereAprobacion')} id="requiereAprobacion" className="h-4 w-4 rounded border-gray-300" />
            <label htmlFor="requiereAprobacion" className="ml-2 block text-sm text-gray-900">Requiere Aprobación</label>
          </div>

          <div className="flex items-center">
            <input type="checkbox" {...register('estaActivo')} id="estaActivo" className="h-4 w-4 rounded border-gray-300" />
            <label htmlFor="estaActivo" className="ml-2 block text-sm text-gray-900">Está Activo</label>
          </div>

          <div className="flex gap-2">
            <button type="submit" className="py-2 px-4 bg-green-600 text-white rounded-lg font-semibold">
              Añadir a Días Seleccionados
            </button>
            <button type="button" onClick={onClose} className="py-2 px-4 bg-gray-300 text-black rounded-lg">
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
