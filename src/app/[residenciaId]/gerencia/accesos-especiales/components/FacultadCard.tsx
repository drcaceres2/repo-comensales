"use client";

import { Control, Controller, useWatch } from "react-hook-form";
import { UpdateMatrizAccesosPayload } from "shared/schemas/usuariosAsistentes";

// --- Mock/Placeholder Components (reemplazar con los componentes reales de la UI) ---
const Label = ({ children, ...props }: any) => <label className="block text-sm font-medium text-gray-700" {...props}>{children}</label>;
const Input = (props: any) => <input {...props} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-indigo-500 focus:border-indigo-500" />;
const Checkbox = (props: any) => <input type="checkbox" {...props} className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500" />;
const Select = ({ children, ...props }: any) => <select {...props} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-indigo-500 focus:border-indigo-500">{children}</select>;
// --- Fin de Mocks ---

type PermisoKey = keyof UpdateMatrizAccesosPayload["permisos"];

interface FacultadCardProps {
  titulo: string;
  permisoKey: PermisoKey;
  control: Control<UpdateMatrizAccesosPayload>;
}

const StatusBadge = ({ nivelAcceso }: { nivelAcceso: 'Todas' | 'Propias' | 'Ninguna' | undefined }) => {
  const colorClass = {
    Todas: 'bg-green-200',
    Propias: 'bg-amber-300',
    Ninguna: 'bg-gray-300',
  }[nivelAcceso || 'Ninguna'];

  return <div className={`w-4 h-4 rounded-full ${colorClass}`} title={`Nivel de Acceso: ${nivelAcceso}`}></div>;
};

export const FacultadCard = ({ titulo, permisoKey, control }: FacultadCardProps) => {
  const namePrefix = `permisos.${permisoKey}` as const;

  const restriccionTiempoValue = useWatch({
    control,
    name: `${namePrefix}.restriccionTiempo`,
  });

  const nivelAccesoValue = useWatch({
    control,
    name: `${namePrefix}.nivelAcceso`,
  });

  return (
    <div className="border rounded-lg p-4 shadow-md space-y-4 bg-white">
      <div className="flex items-center gap-3">
        <StatusBadge nivelAcceso={nivelAccesoValue} />
        <h3 className="font-semibold text-lg text-gray-800">{titulo}</h3>
      </div>

      {/* Nivel de Acceso */}
      <div>
        <Label htmlFor={`${namePrefix}.nivelAcceso`}>Nivel de Acceso</Label>
        <Controller
          name={`${namePrefix}.nivelAcceso`}
          control={control}
          render={({ field }) => (
            <Select {...field} id={`${namePrefix}.nivelAcceso`}>
              <option value="Todas">Todas</option>
              <option value="Propias">Propias</option>
              <option value="Ninguna">Ninguna</option>
            </Select>
          )}
        />
      </div>

      {/* Restricción de Tiempo */}
      <div className="flex items-center gap-2 pt-2">
        <Controller
          name={`${namePrefix}.restriccionTiempo`}
          control={control}
          render={({ field }) => (
            <Checkbox
              id={`${namePrefix}.restriccionTiempo`}
              checked={field.value}
              onChange={field.onChange}
            />
          )}
        />
        <Label htmlFor={`${namePrefix}.restriccionTiempo`}>Restricción de Tiempo</Label>
      </div>

      {/* Campos de Fecha Condicionales */}
      {restriccionTiempoValue && (
        <div className="space-y-2 pl-6 border-l-2 border-gray-200 ml-2">
          <div>
            <Label htmlFor={`${namePrefix}.fechaInicio`}>Fecha de Inicio</Label>
            <Controller
              name={`${namePrefix}.fechaInicio`}
              control={control}
              render={({ field }) => (
                <Input
                  type="date"
                  id={`${namePrefix}.fechaInicio`}
                  {...field}
                  value={field.value ? new Date(field.value).toISOString().split('T')[0] : ''}
                />
              )}
            />
          </div>
          <div>
            <Label htmlFor={`${namePrefix}.fechaFin`}>Fecha de Fin</Label>
            <Controller
              name={`${namePrefix}.fechaFin`}
              control={control}
              render={({ field }) => (
                <Input
                  type="date"
                  id={`${namePrefix}.fechaFin`}
                  {...field}
                  value={field.value ? new Date(field.value).toISOString().split('T')[0] : ''}
                />
              )}
            />
          </div>
        </div>
      )}
    </div>
  );
};