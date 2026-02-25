"use client";

import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ZodIssue } from 'zod';

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
  NovedadFormSchema,
  NovedadFormValues,
  CategoriaNovedadEnum,
} from "shared/schemas/novedades";

interface NovedadFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: NovedadFormValues) => void | Promise<void>;
  defaultValues?: Partial<NovedadFormValues>;
  serverErrors?: ZodIssue[] | null;
}

export default function NovedadFormModal({
  isOpen,
  onClose,
  onSubmit,
  defaultValues,
  serverErrors,
}: NovedadFormModalProps) {

  // Memoize the sanitized default values to prevent re-creating the object on every render,
  // which would cause an infinite loop in the useEffect hook.
  const sanitizedDefaultValues = useMemo(() => ({
    texto: defaultValues?.texto || '',
    categoria: defaultValues?.categoria || 'otros',
  }), [defaultValues]);

  const form = useForm<NovedadFormValues>({
    resolver: zodResolver(NovedadFormSchema),
    defaultValues: sanitizedDefaultValues,
  });

  // Effect to apply server-side validation errors to the form
  useEffect(() => {
    if (serverErrors) {
      serverErrors.forEach((error) => {
        const fieldName = error.path[0];
        if (fieldName === 'texto' || fieldName === 'categoria') {
          form.setError(fieldName, {
            type: 'server',
            message: error.message,
          });
        }
      });
    }
  }, [serverErrors, form]);

  // Effect to reset the form when the modal is opened or the default values change
  useEffect(() => {
    if (isOpen) {
      form.reset(sanitizedDefaultValues);
      if(serverErrors) form.clearErrors();
    }
  }, [isOpen, sanitizedDefaultValues, form, serverErrors]);

  const handleFormSubmit = form.handleSubmit(async (data) => {
    await onSubmit(data);
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
                    <SelectContent className="z-[100]">
                      {CategoriaNovedadEnum.options.map((cat) => (
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
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {defaultValues?.texto ? 'Guardar Cambios' : 'Crear'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
