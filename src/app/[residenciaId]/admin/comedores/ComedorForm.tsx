'use client';

import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { type ComedorData, ComedorDataSchema } from 'shared/schemas/complemento1';
import { type CentroDeCosto } from 'shared/schemas/contabilidad';
import { 
    Form, 
    FormControl, 
    FormField, 
    FormItem, 
    FormLabel, 
    FormMessage,
    FormDescription
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ComedorFormProps {
    initialData?: ComedorData;
    onSubmit: (data: ComedorData) => Promise<void>;
    onCancel: () => void;
    isSaving: boolean;
    centroCostosList: CentroDeCosto[];
}

export function ComedorForm({ initialData, onSubmit, onCancel, isSaving, centroCostosList }: ComedorFormProps) {
    const { t } = useTranslation('comedores');

    const form = useForm<ComedorData>({
        resolver: zodResolver(ComedorDataSchema),
        defaultValues: {
            nombre: initialData?.nombre || '',
            descripcion: initialData?.descripcion || '',
            aforoMaximo: initialData?.aforoMaximo ?? undefined,
            centroCostoId: initialData?.centroCostoId || undefined,
        },
    });


    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                    control={form.control}
                    name="nombre"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t('form.nombre')}</FormLabel>
                            <FormControl>
                                <Input 
                                    placeholder={t('placeholders.nombre')} 
                                    {...field}
                                    disabled={!!initialData} // Disable editing for existing comedor names
                                />
                            </FormControl>
                            <FormDescription>
                                {t('form.descriptions.nombre')}
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="descripcion"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t('form.descripcion')}</FormLabel>
                            <FormControl>
                                <Textarea 
                                    placeholder={t('placeholders.descripcion')} 
                                    {...field}
                                    value={field.value || ''} 
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="aforoMaximo"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t('form.aforo')}</FormLabel>
                            <FormControl>
                                <Input 
                                    type="number" 
                                    placeholder={t('placeholders.aforo')} 
                                    {...field}
                                    value={field.value ?? ''}
                                    onChange={e => {
                                        const value = e.target.value;
                                        field.onChange(value === '' ? null : parseInt(value, 10));
                                    }}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="centroCostoId"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t('form.centro_costo')}</FormLabel>
                            <Select 
                                onValueChange={(value) => field.onChange(value === "none" ? undefined : value)} 
                                value={field.value || "none"}
                            >
                                <FormControl>
                                    <SelectTrigger>
                                        <SelectValue placeholder={t('placeholders.centro_costo_select')} />
                                    </SelectTrigger>
                                </FormControl>
                                    <SelectContent className="z-[110]">
                                        <SelectItem value="none">{t('opciones.ninguno')}</SelectItem>
                                        {centroCostosList.map((cc) => (
                                            <SelectItem key={cc.id} value={cc.id}>
                                                {cc.nombre} ({cc.codigoVisible})
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <div className="flex justify-end space-x-2 pt-4">
                    <Button type="button" variant="outline" onClick={onCancel} disabled={isSaving}>
                        {t('form.cancel')}
                    </Button>
                    <Button type="submit" disabled={isSaving}>
                        {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {initialData ? t('form.submit_edit') : t('form.submit_add')}
                    </Button>
                </div>
            </form>
        </Form>
    );
}
