"use client";

import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { 
  type CentroDeCosto,
  CentroDeCostoSchema 
} from "shared/schemas/contabilidad";
import { 
  Form, 
  FormControl, 
  FormField, 
  FormItem, 
  FormLabel, 
  FormMessage 
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { 
  ChevronDown, 
  Plus, 
  Save, 
  Archive, 
  Circle 
} from "lucide-react";
import { useToast } from "@/hooks/useToast";

/**
 * Propiedades del componente CentroDeCostoItem
 */
interface CentroDeCostoItemProps {
  /** 
   * Datos del centro de costo. 
   * Si es null, el componente se comporta como el formulario de creación. 
   */
  centro: CentroDeCosto | null;
  /** Controla si el acordeón está expandido */
  isExpanded: boolean;
  /** Callback para alternar el estado de expansión */
  onToggle: () => void;
  /** Función asíncrona para guardar los cambios (creación o edición) */
  onSave: (data: CentroDeCosto) => Promise<void>;
  /** Función asíncrona opcional para archivar el centro de costo */
  onArchive?: () => Promise<void>;
}

/**
 * Componente que representa un ítem individual de Centro de Costo tipo acordeón.
 * Incluye su propio formulario de edición gobernado por react-hook-form y zod.
 */
export default function CentroDeCostoItem({
  centro,
  isExpanded,
  onToggle,
  onSave,
  onArchive,
}: CentroDeCostoItemProps) {
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const { toast } = useToast();

  // Configuración del formulario
  const form = useForm<CentroDeCosto>({
    resolver: zodResolver(CentroDeCostoSchema),
    defaultValues: {
      id: centro?.id ?? "nuevo-centro",
      codigoVisible: centro?.codigoVisible ?? "",
      nombre: centro?.nombre ?? "",
      descripcion: centro?.descripcion ?? "",
      estaActivo: centro?.estaActivo ?? true,
    },
  });

  const { handleSubmit, control, reset } = form;

  // Manejador de guardado
  const onSubmit = async (data: CentroDeCosto) => {
    setIsSubmitting(true);
    try {
      await onSave(data);
      toast({
        title: centro ? "Centro actualizado" : "Centro creado",
        description: `El centro de costo "${data.nombre}" se ha guardado correctamente.`,
      });
      if (!centro) {
        reset(); // Limpiar si era creación
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error al guardar",
        description: error.message || "No se pudo procesar la solicitud.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Manejador de archivo
  const handleArchive = async () => {
    if (!onArchive) return;
    setIsSubmitting(true);
    try {
      await onArchive();
      toast({
        title: "Centro archivado",
        description: "El centro de costo ha sido desactivado correctamente.",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error al archivar",
        description: error.message || "No se pudo archivar el centro de costo.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const isNew = !centro;

  return (
    <div className={cn(
      "border rounded-lg overflow-hidden transition-all duration-200 bg-card",
      isExpanded ? "shadow-md border-primary/20" : "hover:border-primary/10"
    )}>
      {/* Cabecera del Acordeón */}
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "w-full flex items-center justify-between p-4 text-left transition-colors",
          "min-h-[44px] sm:min-h-[56px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          isExpanded ? "bg-muted/50" : "hover:bg-muted/30"
        )}
        aria-expanded={isExpanded}
      >
        <div className="flex items-center gap-3 overflow-hidden">
          {/* Indicador visual de estado */}
          {!isNew && (
            <Circle 
              className={cn(
                "h-2.5 w-2.5 fill-current shrink-0", 
                centro.estaActivo ? "text-green-500" : "text-destructive"
              )} 
            />
          )}
          {isNew && <Plus className="h-4 w-4 text-primary shrink-0" />}
          
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 overflow-hidden">
            <span className="font-mono text-xs font-semibold text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
              {isNew ? "NUEVO" : centro.codigoVisible}
            </span>
            <span className="font-semibold truncate text-foreground">
              {isNew ? "Crear Nuevo Centro de Costo" : centro.nombre}
            </span>
          </div>
        </div>
        
        <ChevronDown className={cn(
          "h-5 w-5 text-muted-foreground transition-transform duration-200 ml-2 shrink-0",
          isExpanded && "rotate-180"
        )} />
      </button>

      {/* Cuerpo del Acordeón (Formulario) */}
      <div className={cn(
        "grid transition-all duration-200 ease-in-out",
        isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
      )}>
        <div className="overflow-hidden">
          <div className="p-4 pt-2 border-t space-y-4">
            <Form {...form}>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Código Visible */}
                  <FormField
                    control={control}
                    name="codigoVisible"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Código</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="C-001" 
                            {...field} 
                            disabled={isSubmitting}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Nombre */}
                  <FormField
                    control={control}
                    name="nombre"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nombre</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="Mantenimiento" 
                            {...field} 
                            disabled={isSubmitting}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Descripción */}
                <FormField
                  control={control}
                  name="descripcion"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Descripción (Opcional)</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Propósito de este centro de costo..." 
                          className="resize-none"
                          {...field} 
                          disabled={isSubmitting}
                          value={field.value || ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Estado Informativo (Sin Switch) */}
                <div className="flex flex-row items-center justify-between rounded-lg border p-3 bg-muted/20">
                  <div className="space-y-0.5">
                    <FormLabel className="text-sm font-medium">Estado del Centro</FormLabel>
                    <p className="text-xs text-muted-foreground">
                      {isNew 
                        ? "Los nuevos centros se crean activos por defecto." 
                        : "El estado solo puede cambiarse archivando el centro."}
                    </p>
                  </div>
                  <Badge 
                    variant={form.watch("estaActivo") ? "outline" : "destructive"}
                    className={cn(
                      "capitalize",
                      form.watch("estaActivo") && "border-green-500 text-green-600 bg-green-50"
                    )}
                  >
                    {form.watch("estaActivo") ? "Activo" : "Archivado / Inactivo"}
                  </Badge>
                </div>

                {/* Botones de Acción */}
                <div className="flex items-center justify-end gap-3 pt-2">
                  {!isNew && centro.estaActivo && onArchive && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleArchive}
                      disabled={isSubmitting}
                      className="text-destructive hover:bg-destructive/10 border-destructive/20"
                    >
                      <Archive className="h-4 w-4 mr-2" />
                      Archivar
                    </Button>
                  )}
                  
                  <Button 
                    type="submit" 
                    size="sm"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <span className="flex items-center gap-2">
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        Guardando...
                      </span>
                    ) : (
                      <>
                        <Save className="h-4 w-4 mr-2" />
                        {isNew ? "Crear Centro" : "Guardar Cambios"}
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          </div>
        </div>
      </div>
    </div>
  );
}
