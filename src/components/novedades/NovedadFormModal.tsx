"use client";

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  NovedadOperativaCreateSchema,
  NovedadOperativaCreate  
} from "shared/schemas/novedades";

interface NovedadFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: NovedadOperativaCreate) => void;
  defaultValues?: Partial<NovedadOperativaCreate>;
}

export function NovedadFormModal({
  isOpen,
  onClose,
  onSubmit,
  defaultValues,
}: NovedadFormModalProps) {
  const form = useForm<NovedadOperativaCreate>({
    resolver: zodResolver(NovedadOperativaCreateSchema),
    defaultValues: {
      texto: '',
      categoria: 'otros',
      ...defaultValues,
    },
  });

  useEffect(() => {
    if (isOpen) {
      form.reset({
        texto: '',
        categoria: 'otros',
        ...defaultValues,
      });
    }
  }, [isOpen, defaultValues, form]);

  const handleFormSubmit = form.handleSubmit((data) => {
    onSubmit(data);
    onClose();
  });

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{defaultValues?.texto ? 'Editar Novedad' : 'Crear Novedad'}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={handleFormSubmit} className="space-y-4">
            <FormField
              control={form.control}
              name="texto"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descripción</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Ej: Se necesita comprar más detergente para la ropa..."
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="categoria"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Categoría</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona una categoría" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {NovedadOperativaCreateSchema.shape.categoria.options.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {cat.charAt(0).toUpperCase() + cat.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancelar
                </Button>
              </DialogClose>
              <Button type="submit">
                {defaultValues?.texto ? 'Guardar Cambios' : 'Crear'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
