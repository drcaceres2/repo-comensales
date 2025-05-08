// src/app/admin/residencia/page.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { X, PlusCircle, Pencil, Trash2, Loader2, AlertCircle } from 'lucide-react'; // Added Loader2, AlertCircle
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";

import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogClose,
} from "@/components/ui/dialog";

import { Textarea } from "@/components/ui/textarea";

// --- Firebase & Auth Hook Imports ---
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase'; // Import auth and db instances
import {
    collection,
    getDocs,
    addDoc,
    doc,
    writeBatch,
    setDoc,
    query,
    where,
    orderBy,
    deleteDoc,
    updateDoc,
    deleteField,
    getDoc, // Added getDoc
    FieldValue // Ensure FieldValue is imported if deleteField is used
} from 'firebase/firestore';

// --- Model Imports ---
import {
  Residencia,
  HorarioSolicitudComida, HorarioSolicitudComidaId,
  Comedor, ComedorId,
  Dieta,
  ResidenciaId,
  DayOfWeekKey, DayOfWeekMap,
  UserProfile, // Keep UserProfile
  UserRole,    // Keep UserRole
} from '@/models/firestore';


// --- Constants ---
const daysOfWeek: { label: string; value: DayOfWeekKey }[] = [
    { label: 'Monday', value: 'lunes' }, { label: 'Tuesday', value: 'martes' }, { label: 'Wednesday', value: 'miercoles' }, { label: 'Thursday', value: 'jueves' }, { label: 'Friday', value: 'viernes' }, { label: 'Saturday', value: 'sabado' }, { label: 'Sunday', value: 'domingo' },
] as const;
const orderedDaysOfWeek: DayOfWeekKey[] = daysOfWeek.map(d => d.value);

// --- Helper Sort Functions ---
const sortHorarios = (horarios: HorarioSolicitudComida[]): HorarioSolicitudComida[] => {
    return [...horarios].sort((a, b) => {
        const dayAIndex = orderedDaysOfWeek.indexOf(a.dia); const dayBIndex = orderedDaysOfWeek.indexOf(b.dia);
        if (dayAIndex !== dayBIndex) { return dayAIndex - dayBIndex; }
        return a.horaSolicitud.localeCompare(b.horaSolicitud);
    });
};
const sortComedores = (comedores: Comedor[]): Comedor[] => {
    return [...comedores].sort((a, b) => a.nombre.localeCompare(b.nombre));
};

// --- Type Definitions for Dialog Props ---
type EditHorarioDialogProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  horario: HorarioSolicitudComida | null;
  nombre: string; setNombre: (value: string) => void;
  dia: DayOfWeekKey | ''; setDia: (value: DayOfWeekKey | '') => void;
  hora: string; setHora: (value: string) => void;
  isPrimary: boolean; setIsPrimary: (value: boolean) => void;
  isProcessing: boolean;
  onSubmit: (e: React.FormEvent) => Promise<void>;
};
type EditComedorDialogProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  comedor: Comedor | null;
  nombre: string; setNombre: (value: string) => void;
  descripcion: string; setDescripcion: (value: string) => void;
  isProcessing: boolean;
  onSubmit: (e: React.FormEvent) => Promise<void>;
};


// =========================================================================
// Main Page Component
// =========================================================================
// src/app/admin/residencia/page.tsx

import React from 'react'; // Basic React import

export default function ResidenciaAdminPage() {
  console.log('MINIMAL ResidenciaAdminPage RENDERED');

  return (
    <div>
      <h1>Test: Residencia Admin Minimal Page</h1>
      <p>If you see this, the Next.js routing to this file is working, and React can render a basic component from it.</p>
    </div>
  );
}


const EditComedorDialog: React.FC<EditComedorDialogProps> = ({
isOpen, onOpenChange, comedor, nombre, setNombre, descripcion, setDescripcion, isProcessing, onSubmit
}) => {
    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Editar Comedor: {comedor?.nombre}</DialogTitle>
                    <DialogDescription>Modifica los detalles de este comedor.</DialogDescription>
                </DialogHeader>
                {comedor ? (
                    <form onSubmit={onSubmit} className="space-y-4 py-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="edit-comedor-nombre">Nombre del Comedor</Label>
                            <Input id="edit-comedor-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} disabled={isProcessing}/>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="edit-comedor-descripcion">Descripción (Opcional)</Label>
                            <Textarea id="edit-comedor-descripcion" placeholder="Ingresa detalles relevantes..." value={descripcion} onChange={(e) => setDescripcion(e.target.value)} disabled={isProcessing} rows={3} />
                        </div>
                        <DialogFooter>
                            <DialogClose asChild><Button type="button" variant="outline" disabled={isProcessing}>Cancelar</Button></DialogClose>
                            <Button type="submit" disabled={isProcessing}>{isProcessing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Guardando...</> : 'Guardar Cambios'}</Button>
                        </DialogFooter>
                    </form>
                ) : ( <p>Cargando datos del comedor...</p> )}
            </DialogContent>
        </Dialog>
    );
};
