'use client'

import React, { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { PlusCircle, Edit, Trash2, ShieldAlert, Sparkles, UserX } from 'lucide-react'

import { useHorariosAlmacen } from '../../_lib/useHorariosAlmacen'
import {
    DefinicionAlternativaSchema,
    type DefinicionAlternativa,
    type GrupoComida,
    TipoAlternativaEnumSchema,
    type TipoAlternativaEnum,
    CrearVariosSchema,
    type CrearVariosValues,
} from 'shared/schemas/horarios'
import { slugify } from 'shared/utils/commonUtils'

import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription, DialogClose } from '@/components/ui/dialog'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'

const FormSchema = DefinicionAlternativaSchema;
type FormValues = z.infer<typeof FormSchema>;

const MapaMensajeTipoAlternativa: Record<TipoAlternativaEnum, string> = {
    comedor: "Comedor",
    paraLlevar: "Para llevar", 
    noComoEnCasa: "No como en casa", 
    ayuno: 'Ayuno'
}

const AlternativaForm = ({
  open,
  onOpenChange,
  alternativa,
  gruposComida,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  alternativa: { slug: string; data: DefinicionAlternativa } | null
  gruposComida: Record<string, GrupoComida>
}) => {
  const upsertDefinicionAlternativa = useHorariosAlmacen((s) => s.upsertDefinicionAlternativa)
  const catalogoAlternativas = useHorariosAlmacen(s => s.datosBorrador.catalogoAlternativas);

  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: alternativa?.data || {
      nombre: '',
      descripcion: '',
      grupoComida: Object.keys(gruposComida)[0] || '',
      tipo: 'comedor',
      estaActiva: true,
    },
  })

  React.useEffect(() => {
    form.reset(alternativa?.data || {
      nombre: '',
      descripcion: '',
      grupoComida: Object.keys(gruposComida)[0] || '',
      tipo: 'comedor',
      estaActiva: true,
    })
  }, [alternativa, form, gruposComida])

  const onSubmit = (data: FormValues) => {
    const isCreating = !alternativa;
    const id = isCreating ? slugify(data.nombre) : alternativa.slug;

    if (isCreating && catalogoAlternativas[id]) {
        form.setError("nombre", { type: "manual", message: "Ya existe una alternativa con este nombre." });
        return;
    }

    upsertDefinicionAlternativa(id, data)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
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
                  <FormLabel>Nombre</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej: Para llevar" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
             <FormField
              control={form.control}
              name="descripcion"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descripción</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Describe brevemente esta alternativa..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
                <FormField
                control={form.control}
                name="grupoComida"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Grupo de Comida</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                        <SelectTrigger>
                            <SelectValue placeholder="Selecciona un grupo" />
                        </SelectTrigger>
                        </FormControl>
                        <SelectContent className="z-[100]">
                        {Object.entries(gruposComida).map(([slug, grupo]) => (
                            <SelectItem key={slug} value={slug}>{grupo.nombre}</SelectItem>
                        ))}
                        </SelectContent>
                    </Select>
                    <FormMessage />
                    </FormItem>
                )}
                />
                <FormField
                control={form.control}
                name="tipo"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Tipo</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                        <SelectTrigger>
                            <SelectValue placeholder="Selecciona un tipo" />
                        </SelectTrigger>
                        </FormControl>
                        <SelectContent className="z-[100]">
                            {Object.entries(MapaMensajeTipoAlternativa).map(([key, value]) => (
                                <SelectItem key={key} value={key}>{value}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <FormMessage />
                    </FormItem>
                )}
                />
            </div>
            <FormField
              control={form.control}
              name="estaActiva"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                  <div className="space-y-0.5">
                    <FormLabel>Activa</FormLabel>
                     <DialogDescription>
                        Indica si esta alternativa está disponible.
                    </DialogDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
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

const CrearVariosForm = ({
    open,
    onOpenChange,
    gruposComida,
  }: {
    open: boolean
    onOpenChange: (open: boolean) => void
    gruposComida: Record<string, GrupoComida>
  }) => {
    const upsertDefinicionAlternativa = useHorariosAlmacen(s => s.upsertDefinicionAlternativa);
    const catalogoAlternativas = useHorariosAlmacen(s => s.datosBorrador.catalogoAlternativas);

    const form = useForm<CrearVariosValues>({
        resolver: zodResolver(CrearVariosSchema),
        defaultValues: {
            texto: '',
            posicion: 'despues',
            tipo: 'comedor',
            estaActiva: true,
        },
    });

    const onSubmit = (data: CrearVariosValues) => {
        const gruposActivos = Object.entries(gruposComida).filter(([, g]) => g.estaActivo);

        gruposActivos.forEach(([grupoSlug, grupo]) => {
            const nombre = data.posicion === 'antes'
                ? `${data.texto} ${grupo.nombre}`
                : `${grupo.nombre} ${data.texto}`;
            
            const id = slugify(nombre);

            if (catalogoAlternativas[id]) {
                console.warn(`La alternativa con id "${id}" ya existe. Omitiendo.`);
                return;
            }

            const nuevaDefinicion: DefinicionAlternativa = {
                nombre,
                grupoComida: grupoSlug,
                tipo: data.tipo,
                estaActiva: data.estaActiva,
                descripcion: `Alternativa generada automáticamente para ${grupo.nombre}`,
            };

            upsertDefinicionAlternativa(id, nuevaDefinicion);
        });

        onOpenChange(false);
        form.reset();
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Crear Varias Alternativas</DialogTitle>
                    <DialogDescription>
                        Crea una alternativa para cada grupo de comida activo, usando el texto como prefijo o sufijo.
                    </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
                        <FormField
                            control={form.control}
                            name="texto"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Texto</FormLabel>
                                    <FormControl>
                                        <Input placeholder="Ej: Normal, Especial" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="posicion"
                            render={({ field }) => (
                                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                                    <FormLabel>Posición del Texto</FormLabel>
                                    <div className="flex items-center space-x-2">
                                        <Label>Antes</Label>
                                        <FormControl>
                                            <Switch
                                                checked={field.value === 'despues'}
                                                onCheckedChange={(checked) => field.onChange(checked ? 'despues' : 'antes')}
                                            />
                                        </FormControl>
                                        <Label>Después</Label>
                                    </div>
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="tipo"
                            render={({ field }) => (
                                <FormItem>
                                <FormLabel>Tipo</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Selecciona un tipo" />
                                    </SelectTrigger>
                                    </FormControl>
                                    <SelectContent className="z-[100]">
                                        {Object.entries(MapaMensajeTipoAlternativa).map(([key, value]) => (
                                            <SelectItem key={key} value={key}>{value}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="estaActiva"
                            render={({ field }) => (
                                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                                    <FormLabel>Activa</FormLabel>
                                    <FormControl>
                                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                                    </FormControl>
                                </FormItem>
                            )}
                        />
                        <DialogFooter>
                            <DialogClose asChild>
                                <Button type="button" variant="ghost">Cancelar</Button>
                            </DialogClose>
                            <Button type="submit">Crear Alternativas</Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
};

const CrearAusenciaForm = ({
    open,
    onOpenChange,
    gruposComida,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    gruposComida: Record<string, GrupoComida>;
}) => {
    const [incluirNoComo, setIncluirNoComo] = useState(true);
    const [incluirAyuno, setIncluirAyuno] = useState(true);
    const upsertDefinicionAlternativa = useHorariosAlmacen(s => s.upsertDefinicionAlternativa);
    const catalogoAlternativas = useHorariosAlmacen(s => s.datosBorrador.catalogoAlternativas);

    const handleCreate = () => {
        const tiposACrear: TipoAlternativaEnum[] = [];
        if (incluirNoComo) tiposACrear.push('noComoEnCasa');
        if (incluirAyuno) tiposACrear.push('ayuno');

        const gruposActivos = Object.entries(gruposComida).filter(([, g]) => g.estaActivo);

        tiposACrear.forEach(tipo => {
            const nombre = MapaMensajeTipoAlternativa[tipo];
            gruposActivos.forEach(([grupoSlug, grupo]) => {
                const id = slugify(`${nombre}-${grupo.nombre}`);

                if (catalogoAlternativas[id]) {
                    console.warn(`La alternativa con id "${id}" ya existe. Omitiendo.`);
                    return;
                }

                const nuevaDefinicion: DefinicionAlternativa = {
                    nombre: nombre,
                    grupoComida: grupoSlug,
                    tipo: tipo,
                    estaActiva: true,
                    descripcion: `Alternativa de ausencia generada automáticamente.`,
                };

                upsertDefinicionAlternativa(id, nuevaDefinicion);
            });
        });
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Crear Alternativas de Ausencia</DialogTitle>
                    <DialogDescription>
                        Selecciona los tipos de ausencia que quieres generar para cada grupo de comida activo.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="flex items-center space-x-2">
                        <Checkbox id="incluirNoComo" checked={incluirNoComo} onCheckedChange={(checked) => setIncluirNoComo(!!checked)} />
                        <Label htmlFor="incluirNoComo">Incluir "{MapaMensajeTipoAlternativa.noComoEnCasa}"</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                        <Checkbox id="incluirAyuno" checked={incluirAyuno} onCheckedChange={(checked) => setIncluirAyuno(!!checked)} />
                        <Label htmlFor="incluirAyuno">Incluir "{MapaMensajeTipoAlternativa.ayuno}"</Label>
                    </div>
                </div>
                <DialogFooter>
                    <DialogClose asChild>
                        <Button type="button" variant="ghost">Cancelar</Button>
                    </DialogClose>
                    <Button onClick={handleCreate} disabled={!incluirNoComo && !incluirAyuno}>
                        Crear
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};


export default function Paso4Catalogo() {
  const catalogoAlternativas = useHorariosAlmacen(s => s.datosBorrador.catalogoAlternativas);
  const gruposComida = useHorariosAlmacen(s => s.datosBorrador.gruposComidas);
  const mostrarInactivos = useHorariosAlmacen(s => s.mostrarInactivos);
  const toggleMostrarInactivos = useHorariosAlmacen(s => s.toggleMostrarInactivos);
  const upsertDefinicionAlternativa = useHorariosAlmacen(s => s.upsertDefinicionAlternativa);
  const setPasoActual = useHorariosAlmacen(s => s.setPasoActual);

  const avanzarPaso = () => setPasoActual(5);
  const retrocederPaso = () => setPasoActual(3);

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isCrearVariosOpen, setIsCrearVariosOpen] = useState(false)
  const [isCrearAusenciaOpen, setIsCrearAusenciaOpen] = useState(false);
  const [editingAlternativa, setEditingAlternativa] = useState<{ slug: string; data: DefinicionAlternativa } | null>(null)
  
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

  const alternativasAgrupadasYOrdenadas = useMemo(() => {
    const grupos = Object.values(gruposComida)
        .sort((a, b) => a.orden - b.orden)
        .map(g => ({
            ...g,
            slug: slugify(g.nombre), 
            alternativas: [] as { slug: string; data: DefinicionAlternativa; validation: z.SafeParseReturnType<DefinicionAlternativa, DefinicionAlternativa> }[]
        }));

    Object.entries(catalogoAlternativas).forEach(([slug, data]) => {
        const grupo = grupos.find(g => g.slug === data.grupoComida);
        if (grupo) {
            if (data.estaActiva || mostrarInactivos) {
                grupo.alternativas.push({
                    slug,
                    data,
                    validation: DefinicionAlternativaSchema.safeParse(data),
                });
            }
        }
    });

    grupos.forEach(g => {
        g.alternativas.sort((a, b) => a.data.nombre.localeCompare(b.data.nombre));
    });

    return grupos.filter(g => g.alternativas.length > 0 || g.estaActivo);
}, [catalogoAlternativas, gruposComida, mostrarInactivos]);


  const gruposComidaActivos = useMemo(() => Object.values(gruposComida).filter(g => g.estaActivo), [gruposComida]);

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
        <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Button variant="outline" className="h-full min-h-[120px] border-dashed" onClick={handleAddNew}>
                    <PlusCircle className="mr-2 h-4 w-4" /> Añadir Nueva
                </Button>
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <button onClick={() => setIsCrearVariosOpen(true)} disabled={!gruposComidaActivos.length} className="w-full h-full min-h-[120px] flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-blue-400 dark:border-blue-600 rounded-lg text-blue-500 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 hover:border-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                                <Sparkles className="h-5 w-5" />
                                Crear Varios
                            </button>
                        </TooltipTrigger>
                        <TooltipContent><p>Crea una alternativa para cada grupo de comida activo.</p></TooltipContent>
                    </Tooltip>
                </TooltipProvider>
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <button onClick={() => setIsCrearAusenciaOpen(true)} disabled={!gruposComidaActivos.length} className="w-full h-full min-h-[120px] flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-orange-400 dark:border-orange-600 rounded-lg text-orange-500 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 hover:bg-orange-100 dark:hover:bg-orange-900/40 hover:border-orange-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                                <UserX className="h-5 w-5" />
                                Crear Ausencia
                            </button>
                        </TooltipTrigger>
                        <TooltipContent><p>Crea alternativas de ausencia como "Ayuno" o "No como en casa".</p></TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            </div>

            {alternativasAgrupadasYOrdenadas.map(grupo => (
                <div key={grupo.slug}>
                    <h3 className="text-lg font-semibold mb-3 text-slate-800 dark:text-slate-200">{grupo.nombre}</h3>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {grupo.alternativas.map(({ slug, data, validation }) => {
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
                    </div>
                </div>
            ))}
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
        gruposComida={gruposComida}
      />
      <CrearVariosForm
        open={isCrearVariosOpen}
        onOpenChange={setIsCrearVariosOpen}
        gruposComida={gruposComida}
      />
      <CrearAusenciaForm
        open={isCrearAusenciaOpen}
        onOpenChange={setIsCrearAusenciaOpen}
        gruposComida={gruposComida}
      />
    </div>
  )
}
