'use client'

import React, { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { PlusCircle, Edit, Trash2, ShieldAlert } from 'lucide-react'

import { useHorariosAlmacen } from '../../_lib/useHorariosAlmacen'
import { DefinicionAlternativaSchema, DefinicionAlternativa } from 'shared/schemas/horarios'
import { slugify } from 'shared/utils/commonUtils'

import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription, DialogClose } from '@/components/ui/dialog'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

// Esquema para el formulario, solo necesitamos el nombre.
const FormSchema = DefinicionAlternativaSchema.pick({ nombre: true });
type FormValues = z.infer<typeof FormSchema>;

const AlternativaForm = ({
  open,
  onOpenChange,
  alternativa,
  grupoComidaId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  alternativa: { slug: string; data: DefinicionAlternativa } | null
  grupoComidaId: string | null
}) => {
  const upsertDefinicionAlternativa = useHorariosAlmacen((s) => s.upsertDefinicionAlternativa)

  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      nombre: alternativa?.data.nombre || '',
    },
  })

  React.useEffect(() => {
    form.reset({
      nombre: alternativa?.data.nombre || '',
    })
  }, [alternativa, form])

  const onSubmit = (data: FormValues) => {
    // Si estamos creando, el grupo de comida es requerido. Si editamos, ya existe.
    if (!grupoComidaId && !alternativa) {
        console.error("Error: No hay un grupo de comida definido para crear la alternativa.");
        // Aquí podrías mostrar una notificación al usuario.
        return;
    }

    const id = alternativa ? alternativa.slug : slugify(data.nombre);
    
    const baseData = alternativa?.data || {
      grupoComida: grupoComidaId!,
      tipo: 'comedor',
      estaActiva: true,
    };

    const nuevaDefinicion: DefinicionAlternativa = {
      ...baseData,
      nombre: data.nombre,
    }

    upsertDefinicionAlternativa(id, nuevaDefinicion)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{alternativa ? 'Editar' : 'Crear'} Alternativa</DialogTitle>
          <DialogDescription>
            Define un tipo de servicio alternativo, como "Comida para llevar" o "Cena temprana".
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
            <FormField
              control={form.control}
              name="nombre"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre de la Alternativa</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej: Para llevar" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
                <DialogClose asChild>
                    <Button type="button" variant="ghost">Cancelar</Button>
                </DialogClose>
                <Button type="submit">{alternativa ? 'Guardar Cambios' : 'Crear Alternativa'}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

export default function Paso4Catalogo() {
  // Selectores granulares para eficiencia y evitar re-renders innecesarios.
  const definicionesAlternativas = useHorariosAlmacen(s => s.datosBorrador.definicionesAlternativas);
  const gruposComida = useHorariosAlmacen(s => s.datosBorrador.gruposComidas);
  const mostrarInactivos = useHorariosAlmacen(s => s.mostrarInactivos);
  const toggleMostrarInactivos = useHorariosAlmacen(s => s.toggleMostrarInactivos);
  const upsertDefinicionAlternativa = useHorariosAlmacen(s => s.upsertDefinicionAlternativa);
  const pasoActual = useHorariosAlmacen(s => s.pasoActual);
  const setPasoActual = useHorariosAlmacen(s => s.setPasoActual);

  // Acciones de navegación construidas a partir del estado del almacén.
  const avanzarPaso = () => setPasoActual(pasoActual + 1);
  const retrocederPaso = () => setPasoActual(pasoActual - 1);

  const [isFormOpen, setIsFormOpen] = useState(false)
  // El estado para edición ahora incluye el 'slug' para garantizar la inmutabilidad del ID.
  const [editingAlternativa, setEditingAlternativa] = useState<{ slug: string; data: DefinicionAlternativa } | null>(null)
  
  const grupoComidaPorDefecto = useMemo(() => {
      const gruposActivos = Object.values(gruposComida).filter(g => g.estaActivo);
      // Usamos el slug del primer grupo activo como default.
      return gruposActivos.length > 0 ? slugify(gruposActivos[0].nombre) : null;
  }, [gruposComida]);


  const handleAddNew = () => {
    setEditingAlternativa(null)
    setIsFormOpen(true)
  }

  const handleEdit = (slug: string, data: DefinicionAlternativa) => {
    setEditingAlternativa({ slug, data })
    setIsFormOpen(true)
  }

  const handleArchive = (slug: string, alternativa: DefinicionAlternativa) => {
    upsertDefinicionAlternativa(slug, { ...alternativa, estaActiva: false })
  }
  
  const handleRestore = (slug: string, alternativa: DefinicionAlternativa) => {
    upsertDefinicionAlternativa(slug, { ...alternativa, estaActiva: true })
  }

  const validatedAndSortedAlternativas = useMemo(() => {
    return Object.entries(definicionesAlternativas)
      .map(([slug, data]) => ({
        slug,
        data,
        validation: DefinicionAlternativaSchema.safeParse(data),
      }))
      .sort((a, b) => a.data.nombre.localeCompare(b.data.nombre))
  }, [definicionesAlternativas])

  return (
    <div className="container mx-auto p-4 md:p-6">
      <Card className="w-full max-w-4xl mx-auto">
        <CardHeader>
          <CardTitle>Paso 4: Catálogo de Alternativas</CardTitle>
          <div className="flex items-center justify-between mt-4">
             <p className="text-sm text-muted-foreground">
                Define las variantes de servicio (ej. "Para llevar").
             </p>
            <div className="flex items-center space-x-2">
              <Label htmlFor="show-inactive">Mostrar Inactivos</Label>
              <Switch id="show-inactive" checked={mostrarInactivos} onCheckedChange={toggleMostrarInactivos} />
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Button variant="outline" className="h-full min-h-[120px] border-dashed" onClick={handleAddNew}>
                <PlusCircle className="mr-2 h-4 w-4" /> Añadir Nueva Alternativa
            </Button>

            {validatedAndSortedAlternativas.map(({ slug, data, validation }) => {
                if (!data.estaActiva && !mostrarInactivos) {
                    return null
                }
                const cardClasses = !data.estaActiva ? 'opacity-50' : ''
                const cardBorder = !validation.success ? 'border-yellow-500' : ''

                return (
                    <Card key={slug} className={`${cardClasses} ${cardBorder}`}>
                        <CardHeader>
                           <CardTitle className="flex items-center justify-between">
                              {data.nombre}
                              {!validation.success && (
                                <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger>
                                        <ShieldAlert className="h-5 w-5 text-yellow-500" />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p className="text-xs max-w-xs">Error de validación: {validation.error.errors.map(e => e.message).join(', ')}</p>
                                    </TooltipContent>
                                </Tooltip>
                                </TooltipProvider>
                              )}
                           </CardTitle>
                        </CardHeader>
                        <CardFooter className="flex justify-end gap-2">
                            {data.estaActiva ? (
                                <>
                                    <Button variant="ghost" size="sm" onClick={() => handleEdit(slug, data)}>
                                        <Edit className="mr-1 h-4 w-4" /> Editar
                                    </Button>
                                    <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleArchive(slug, data)}>
                                        <Trash2 className="mr-1 h-4 w-4" /> Archivar
                                    </Button>
                                </>
                            ) : (
                                <Button variant="ghost" size="sm" onClick={() => handleRestore(slug, data)}>
                                    Restaurar
                                </Button>
                            )}
                        </CardFooter>
                    </Card>
                )
            })}
        </CardContent>
        <CardFooter className="flex justify-between mt-6">
            <Button variant="outline" onClick={retrocederPaso}>Anterior</Button>
            <Button onClick={avanzarPaso}>Siguiente: Ir a la Matriz</Button>
        </CardFooter>
      </Card>

      <AlternativaForm
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        alternativa={editingAlternativa}
        grupoComidaId={grupoComidaPorDefecto}
      />
    </div>
  )
}
