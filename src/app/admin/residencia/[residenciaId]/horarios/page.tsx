'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
// <<< Ensure TiempoComida includes nombreGrupo and ordenGrupo >>>
import { Residencia, TiempoComida, AlternativaTiempoComida, Comedor, DayOfWeekKey, DayOfWeekMap, TipoAccesoAlternativa, LogEntry, LogActionType, ResidenciaId, ComedorId, HorarioSolicitudComida, HorarioSolicitudComidaId } from '@/models/firestore';
import { Timestamp, addDoc, collection, query, where, getDocs, doc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from '@/components/ui/skeleton';

// AlternativaForm component remains unchanged
interface AlternativaFormProps {
    formData: Partial<AlternativaTiempoComida>;
    onFormChange: (field: keyof AlternativaTiempoComida, value: any) => void;
    onSubmit: () => Promise<void>;
    onCancel: () => void;
    isSaving: boolean;
    availableComedores: Comedor[];
    // <<< ADDED back availableHorarios >>>
    availableHorarios: HorarioSolicitudComida[];
    formTitle: string;
    submitButtonText: string;
}
function AlternativaForm({
    formData,
    onFormChange,
    onSubmit,
    onCancel,
    isSaving,
    availableComedores,
    // <<< ADDED back availableHorarios >>>
    availableHorarios,
    formTitle,
    submitButtonText
}: AlternativaFormProps) {
    // ... (AlternativaForm implementation remains the same as previous step)
    const tipoAccesoOptions: { value: TipoAccesoAlternativa, label: string }[] = [
        { value: 'abierto', label: 'Abierto (Todos)' },
        { value: 'autorizado', label: 'Autorizado (Específico - Lógica Futura)' },
        { value: 'cerrado', label: 'Cerrado (Nadie)' }
    ];

    return (
        <div className="mt-4 p-4 border rounded bg-gray-50 space-y-4">
            <h4 className="font-semibold text-lg">{formTitle}</h4>
            {/* Nombre */}
            <div>
                <Label htmlFor="alt-nombre">Nombre</Label>
                <Input
                    id="alt-nombre"
                    value={formData.nombre || ''}
                    onChange={(e) => onFormChange('nombre', e.target.value)}
                    placeholder="Ej. Almuerzo Comedor Principal"
                    disabled={isSaving}
                />
            </div>

            {/* Tipo (Comedor / Para Llevar) */}
            <div>
                <Label>Tipo</Label>
                <RadioGroup
                    value={formData.tipo || 'comedor'}
                    onValueChange={(value) => onFormChange('tipo', value as 'comedor' | 'paraLlevar')}
                    className="flex space-x-4 mt-1"
                    disabled={isSaving}
                >
                    <div className="flex items-center space-x-2">
                        <RadioGroupItem value="comedor" id="tipo-comedor" disabled={isSaving}/>
                        <Label htmlFor="tipo-comedor">Comedor</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                        <RadioGroupItem value="paraLlevar" id="tipo-llevar" disabled={isSaving}/>
                        <Label htmlFor="tipo-llevar">Para Llevar</Label>
                    </div>
                </RadioGroup>
            </div>

             {/* Comedor (Conditional) */}
             {formData.tipo === 'comedor' && (
                <div>
                    <Label htmlFor="alt-comedor">Comedor Específico</Label>
                    <Select
                        value={formData.comedorId || ''}
                        onValueChange={(value) => onFormChange('comedorId', value)}
                        disabled={isSaving || availableComedores.length === 0}
                    >
                        <SelectTrigger id="alt-comedor">
                            <SelectValue placeholder="Seleccione un comedor..." />
                        </SelectTrigger>
                        <SelectContent>
                            {availableComedores.length === 0 ? (
                                <SelectItem value="-" disabled>No hay comedores definidos</SelectItem>
                            ) : (
                                availableComedores.map(com => (
                                    <SelectItem key={com.id} value={com.id}>
                                        {com.nombre}
                                    </SelectItem>
                                ))
                            )}
                        </SelectContent>
                    </Select>
                     {availableComedores.length === 0 && <p className="text-xs text-red-500 mt-1">Debe definir al menos un comedor en la configuración de la residencia.</p>}
                </div>
            )}

            {/* Tipo Acceso */}
            <div>
                <Label htmlFor="alt-acceso">Acceso Permitido</Label>
                <Select
                    value={formData.tipoAcceso || 'abierto'}
                    onValueChange={(value) => onFormChange('tipoAcceso', value as TipoAccesoAlternativa)}
                    disabled={isSaving}
                >
                    <SelectTrigger id="alt-acceso">
                        <SelectValue placeholder="Seleccione el tipo de acceso..." />
                    </SelectTrigger>
                    <SelectContent>
                        {tipoAccesoOptions.map(opt => (
                            <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* Ventana Horaria */}
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <Label htmlFor="alt-ventana-inicio">Ventana Inicio (HH:mm)</Label>
                    <Input
                        id="alt-ventana-inicio"
                        type="time"
                        value={formData.ventanaInicio || ''}
                        onChange={(e) => onFormChange('ventanaInicio', e.target.value)}
                        disabled={isSaving}
                    />
                     <div className="flex items-center space-x-2 mt-1">
                         <Checkbox
                             id="alt-inicia-dia-anterior"
                             checked={formData.iniciaDiaAnterior || false}
                             onCheckedChange={(checked) => onFormChange('iniciaDiaAnterior', Boolean(checked))}
                             disabled={isSaving}
                         />
                         <Label htmlFor="alt-inicia-dia-anterior" className="text-xs">¿Inicia día anterior?</Label>
                    </div>
                </div>
                <div>
                    <Label htmlFor="alt-ventana-fin">Ventana Fin (HH:mm)</Label>
                    <Input
                        id="alt-ventana-fin"
                        type="time"
                        value={formData.ventanaFin || ''}
                        onChange={(e) => onFormChange('ventanaFin', e.target.value)}
                        disabled={isSaving}
                    />
                     <div className="flex items-center space-x-2 mt-1">
                         <Checkbox
                             id="alt-termina-dia-siguiente"
                             checked={formData.terminaDiaSiguiente || false}
                             onCheckedChange={(checked) => onFormChange('terminaDiaSiguiente', Boolean(checked))}
                             disabled={isSaving}
                         />
                         <Label htmlFor="alt-termina-dia-siguiente" className="text-xs">¿Termina día siguiente?</Label>
                    </div>
                </div>
            </div>

            {/* <<< ADDED Horario Solicitud Dropdown >>> */}
            <div>
                <Label htmlFor="alt-horario-solicitud">Regla de Solicitud Asociada</Label>
                <Select
                    value={formData.horarioSolicitudComidaId || ''}
                    onValueChange={(value) => onFormChange('horarioSolicitudComidaId', value)}
                    disabled={isSaving || availableHorarios.length === 0}
                >
                    <SelectTrigger id="alt-horario-solicitud">
                        <SelectValue placeholder="Seleccione una regla de solicitud..." />
                    </SelectTrigger>
                    <SelectContent>
                        {availableHorarios.length === 0 ? (
                            <SelectItem value="-" disabled>No hay reglas de solicitud definidas</SelectItem>
                        ) : (
                            availableHorarios.map(h => (
                                <SelectItem key={h.id} value={h.id}>
                                    {h.nombre} (Límite: {DayOfWeekMap[h.dia]} {h.horaSolicitud})
                                </SelectItem>
                            ))
                        )}
                    </SelectContent>
                </Select>
                {availableHorarios.length === 0 && <p className="text-xs text-red-500 mt-1">Debe definir (y activar) al menos una regla de solicitud en la configuración general de la residencia.</p>}
            </div>

            {/* Action Buttons */}
            <div className="flex space-x-2 pt-2">
                <Button onClick={onSubmit} disabled={isSaving}>
                    {isSaving ? 'Guardando...' : submitButtonText}
                </Button>
                <Button variant="outline" onClick={onCancel} disabled={isSaving}>
                    Cancelar
                </Button>
            </div>
        </div>
    );
}

// Log Helper Function remains unchanged
async function createLogEntry(actionType: LogActionType, residenciaId: ResidenciaId, details?: string, relatedDocPath?: string) {
    // We will keep using console.log for now, replace with actual addDoc when logging collection is ready
    try {
        const currentUserId = auth.currentUser?.uid || 'anonymous-admin'; // Use actual auth eventually
        const logEntry: Omit<LogEntry, 'id'> = {
            timestamp: Timestamp.now(),
            userId: currentUserId,
            residenciaId: residenciaId,
            actionType: actionType,
            relatedDocPath: relatedDocPath,
            details: details,
        };
        console.log("Log Entry:", logEntry);
        // Example: await addDoc(collection(db, "logEntries"), logEntry);
    } catch (error) {
        console.error("Error creating log entry:", error);
    }
}

export default function HorariosResidenciaPage() {
    const params = useParams();
    const residenciaId = params.residenciaId as ResidenciaId;
    const { toast } = useToast();
    const [currentUserRole, setCurrentUserRole] = useState<'admin' | 'masterAdmin' | 'resident' | null>(null);
    const [residenciaNombre, setResidenciaNombre] = useState<string>('');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // --- Data State ---
    const [tiemposComida, setTiemposComida] = useState<TiempoComida[]>([]);
    const [alternativas, setAlternativas] = useState<AlternativaTiempoComida[]>([]);
    const [comedores, setComedores] = useState<Comedor[]>([]);
    // <<< ADDED state for HorarioSolicitudComida >>>
    const [horariosSolicitud, setHorariosSolicitud] = useState<HorarioSolicitudComida[]>([]);

    // --- TiempoComida Form State (Re-adding nombreGrupo, ordenGrupo) ---
    const [newTiempoComidaName, setNewTiempoComidaName] = useState('');
    const [newTiempoComidaDia, setNewTiempoComidaDia] = useState<DayOfWeekKey | ''>('');
    const [newTiempoComidaHoraEstimada, setNewTiempoComidaHoraEstimada] = useState('');
    // <<< ADDED back group state >>>
    const [newTiempoComidaNombreGrupo, setNewTiempoComidaNombreGrupo] = useState('');
    const [newTiempoComidaOrdenGrupo, setNewTiempoComidaOrdenGrupo] = useState<number | string>(''); // Allow string for input, parse later

    const [isAddingTiempo, setIsAddingTiempo] = useState(false);

    const [editingTiempoComidaId, setEditingTiempoComidaId] = useState<string | null>(null);
    const [editTiempoComidaName, setEditTiempoComidaName] = useState('');
    const [editTiempoComidaDia, setEditTiempoComidaDia] = useState<DayOfWeekKey | ''>('');
    const [editTiempoComidaHoraEstimada, setEditTiempoComidaHoraEstimada] = useState('');
    // <<< ADDED back group edit state >>>
    const [editTiempoComidaNombreGrupo, setEditTiempoComidaNombreGrupo] = useState('');
    const [editTiempoComidaOrdenGrupo, setEditTiempoComidaOrdenGrupo] = useState<number | string>('');

    const [isSavingEditTiempo, setIsSavingEditTiempo] = useState(false);

    // --- AlternativaTiempoComida Form State (Unchanged) ---
    const [showInactiveAlternativas, setShowInactiveAlternativas] = useState(false);
    const [editingAlternativaId, setEditingAlternativaId] = useState<string | null>(null);
    const [addingAlternativaTo, setAddingAlternativaTo] = useState<string | null>(null); // tiempoComidaId
    const [alternativeFormData, setAlternativeFormData] = useState<Partial<AlternativaTiempoComida>>({});
    const [isSavingAlternativa, setIsSavingAlternativa] = useState(false);

    const availableDays: { key: DayOfWeekKey; label: string }[] = Object.entries(DayOfWeekMap).map(([key, label]) => ({ key: key as DayOfWeekKey, label }));

    // <<< UPDATED sort function to use ordenGrupo >>>
    const sortTiemposComida = (tiempos: TiempoComida[]) => {
        const dayOrder: { [key in DayOfWeekKey]: number } = { lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6, domingo: 7 };
        return tiempos.sort((a, b) => {
            // Primary sort: Group Order
            const groupDiff = a.ordenGrupo - b.ordenGrupo;
            if (groupDiff !== 0) return groupDiff;

            // Secondary sort: Day of Week
            const dayDiff = dayOrder[a.dia] - dayOrder[b.dia];
            if (dayDiff !== 0) return dayDiff;

            // Tertiary sort: Estimated Time (treat empty as early)
            const timeA = a.horaEstimada || '00:00';
            const timeB = b.horaEstimada || '00:00';
            return timeA.localeCompare(timeB);
        });
    };

    // <<< UPDATED useEffect to fetch data from Firestore >>>
    const fetchData = useCallback(async () => {
        if (!residenciaId) {
            setError("ID de Residencia no encontrado en la URL.");
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        setError(null);
        // TODO: Set user role from auth context/state
        setCurrentUserRole('admin'); // Placeholder

        try {
            console.log(`Fetching data for residenciaId: ${residenciaId}`);

            // Fetch Residencia details (just for the name)
            const residenciaRef = doc(db, "residencias", residenciaId);
            const residenciaSnap = await getDoc(residenciaRef);
            if (!residenciaSnap.exists()) {
                throw new Error(`No se encontró la residencia con ID: ${residenciaId}`);
            }
            setResidenciaNombre(residenciaSnap.data()?.nombre || 'Residencia sin nombre');

            // Fetch TiemposComida
            const tiemposQuery = query(collection(db, "tiemposComida"), where("residenciaId", "==", residenciaId));
            const tiemposSnap = await getDocs(tiemposQuery);
            const fetchedTiempos = tiemposSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as TiempoComida));
            setTiemposComida(sortTiemposComida(fetchedTiempos));
            console.log("Fetched TiemposComida:", fetchedTiempos.length);

            // Fetch Alternativas
            const alternativasQuery = query(collection(db, "alternativas"), where("residenciaId", "==", residenciaId));
            const alternativasSnap = await getDocs(alternativasQuery);
            const fetchedAlternativas = alternativasSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as AlternativaTiempoComida));
            setAlternativas(fetchedAlternativas);
            console.log("Fetched Alternativas:", fetchedAlternativas.length);

            // Fetch Comedores
            const comedoresQuery = query(collection(db, "comedores"), where("residenciaId", "==", residenciaId));
            const comedoresSnap = await getDocs(comedoresQuery);
            const fetchedComedores = comedoresSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Comedor));
            setComedores(fetchedComedores);
            console.log("Fetched Comedores:", fetchedComedores.length);

            // <<< Fetch HorarioSolicitudComida >>>
            const horariosQuery = query(collection(db, "horariosSolicitud"), where("residenciaId", "==", residenciaId));
            const horariosSnap = await getDocs(horariosQuery);
            const fetchedHorarios = horariosSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as HorarioSolicitudComida));
            setHorariosSolicitud(fetchedHorarios); // Sort if needed, e.g., by horaLimite
            console.log("Fetched HorariosSolicitud:", fetchedHorarios.length);

        } catch (err) {
            console.error("Error fetching data:", err);
            setError(err instanceof Error ? err.message : "Ocurrió un error desconocido al cargar los datos.");
            // Clear potentially partial data
            setResidenciaNombre('');
            setTiemposComida([]);
            setAlternativas([]);
            setComedores([]);
            setHorariosSolicitud([]); // Clear on error
        } finally {
            setIsLoading(false);
        }
    }, [residenciaId]); // Dependency array includes residenciaId

    useEffect(() => {
        fetchData();
    }, [fetchData]); // Run fetchData when it changes (which happens when residenciaId changes)

    // handleToggleAlternativaActive remains the same
    const handleToggleAlternativaActive = async (id: string, newStatus: boolean) => {
        const alternativa = alternativas.find(alt => alt.id === id);
        if (!alternativa) return;

        const altRef = doc(db, "alternativas", id);
        try {
            console.log(`${newStatus ? 'Activating' : 'Deactivating'} alternativa ID: ${id}`);
            await updateDoc(altRef, { isActive: newStatus });

            // Update local state optimistically or after success
            setAlternativas(prev =>
                prev.map(alt =>
                    alt.id === id ? { ...alt, isActive: newStatus } : alt
                )
            );

            await createLogEntry(
                'alternativa_updated', // Reuse 'updated' type
                residenciaId,
                `${newStatus ? 'Activated' : 'Deactivated'} alternativa: ${alternativa?.nombre || id}`,
                altRef.path
            );

            toast({
                title: newStatus ? "Activada" : "Desactivada",
                description: `La alternativa "${alternativa.nombre}" ha sido ${newStatus ? 'activada' : 'desactivada'}.`
            });
        } catch (error) {
            console.error("Error updating alternativa active status:", error);
            toast({ title: "Error", description: `No se pudo ${newStatus ? 'activar' : 'desactivar'} la alternativa. ${error instanceof Error ? error.message : ''}`, variant: "destructive" });
            // Optionally revert local state change here if needed
        }
    };

    // --- Handlers for TiempoComida Add Form (Updated) ---
    const handleAddTiempoComida = async () => {
        // <<< UPDATED Validation to include group fields >>>
        const ordenGrupoNum = Number(newTiempoComidaOrdenGrupo); // Parse here for validation
        if (!newTiempoComidaName.trim()) { toast({ title: "Error", description: "El Nombre específico es requerido.", variant: "destructive" }); return; }
        if (!newTiempoComidaDia) { toast({ title: "Error", description: "El Día es requerido.", variant: "destructive" }); return; }
        if (!newTiempoComidaNombreGrupo.trim()) { toast({ title: "Error", description: "El Nombre de Grupo es requerido.", variant: "destructive" }); return; }
        if (!Number.isInteger(ordenGrupoNum) || ordenGrupoNum <= 0) { toast({ title: "Error", description: "El Orden de Grupo debe ser un número entero positivo.", variant: "destructive" }); return; }
        if (newTiempoComidaHoraEstimada && !/^\d{2}:\d{2}$/.test(newTiempoComidaHoraEstimada)) { toast({ title: "Error", description: "La Hora Estimada debe tener el formato HH:MM.", variant: "destructive" }); return; }

        setIsAddingTiempo(true);

        // <<< UPDATED Object Creation to include group fields >>>
        const nuevoTiempoData: Omit<TiempoComida, 'id'> = {
            residenciaId: residenciaId,
            nombre: newTiempoComidaName.trim(),
            dia: newTiempoComidaDia,
            horaEstimada: newTiempoComidaHoraEstimada || undefined,
            nombreGrupo: newTiempoComidaNombreGrupo.trim(),
            ordenGrupo: ordenGrupoNum, // Use parsed number
        };

        try {
            const docRef = await addDoc(collection(db, "tiemposComida"), nuevoTiempoData);
            const newTiempoWithId: TiempoComida = { id: docRef.id, ...nuevoTiempoData };
            console.log("TiempoComida added with ID:", docRef.id);

            await createLogEntry('tiempo_comida_created', residenciaId, `Created tiempo: ${nuevoTiempoData.nombre}`, docRef.path);

            setTiemposComida(prev => sortTiemposComida([...prev, newTiempoWithId]));
            // <<< Reset group fields >>>
            setNewTiempoComidaName('');
            setNewTiempoComidaDia('');
            setNewTiempoComidaHoraEstimada('');
            setNewTiempoComidaNombreGrupo('');
            setNewTiempoComidaOrdenGrupo('');
            toast({ title: "Éxito", description: `Tiempo "${nuevoTiempoData.nombre}" añadido.` });
        } catch (error) {
            console.error("Error adding TiempoComida: ", error);
            toast({ title: "Error", description: `No se pudo añadir el Tiempo de Comida. ${error instanceof Error ? error.message : ''}`, variant: "destructive" });
        } finally {
            setIsAddingTiempo(false);
        }
    };

    // --- Handlers for TiempoComida Edit/Delete (Updated) ---
    const handleEditTiempoComida = (tiempo: TiempoComida) => {
        setEditingTiempoComidaId(tiempo.id);
        setEditTiempoComidaName(tiempo.nombre);
        setEditTiempoComidaDia(tiempo.dia);
        setEditTiempoComidaHoraEstimada(tiempo.horaEstimada || '');
        // <<< Populate group edit state >>>
        setEditTiempoComidaNombreGrupo(tiempo.nombreGrupo);
        setEditTiempoComidaOrdenGrupo(tiempo.ordenGrupo);
    };

    const handleCancelEdit = () => {
        setEditingTiempoComidaId(null);
        setEditTiempoComidaName('');
        setEditTiempoComidaDia('');
        setEditTiempoComidaHoraEstimada('');
        // <<< Clear group edit state >>>
        setEditTiempoComidaNombreGrupo('');
        setEditTiempoComidaOrdenGrupo('');
    };

    const handleSaveEditTiempoComida = async () => {
        if (!editingTiempoComidaId) return;
        // <<< UPDATED Validation to include group fields >>>
        const ordenGrupoNum = Number(editTiempoComidaOrdenGrupo); // Parse here
        if (!editTiempoComidaName.trim()) { toast({ title: "Error", description: "Nombre específico requerido.", variant: "destructive" }); return; }
        if (!editTiempoComidaDia) { toast({ title: "Error", description: "Día requerido.", variant: "destructive" }); return; }
        if (!editTiempoComidaNombreGrupo.trim()) { toast({ title: "Error", description: "Nombre de Grupo requerido.", variant: "destructive" }); return; }
        if (!Number.isInteger(ordenGrupoNum) || ordenGrupoNum <= 0) { toast({ title: "Error", description: "Orden de Grupo debe ser número entero positivo.", variant: "destructive" }); return; }
        if (editTiempoComidaHoraEstimada && !/^\d{2}:\d{2}$/.test(editTiempoComidaHoraEstimada)) { toast({ title: "Error", description: "Hora Estimada formato HH:MM.", variant: "destructive" }); return; }

        setIsSavingEditTiempo(true);

        const tiempoRef = doc(db, "tiemposComida", editingTiempoComidaId);
        // <<< UPDATED Data Preparation to include group fields >>>
        const updatedTiempoData: Partial<TiempoComida> = {
            nombre: editTiempoComidaName.trim(),
            dia: editTiempoComidaDia,
            horaEstimada: editTiempoComidaHoraEstimada || undefined,
            nombreGrupo: editTiempoComidaNombreGrupo.trim(),
            ordenGrupo: ordenGrupoNum, // Use parsed number
        };

        try {
            await updateDoc(tiempoRef, updatedTiempoData);
            console.log(`TiempoComida updated: ${editingTiempoComidaId}`);

            await createLogEntry('tiempo_comida_updated', residenciaId, `Updated tiempo: ${updatedTiempoData.nombre}`, tiempoRef.path);

            // <<< Update state AFTER successful update >>>
            setTiemposComida(prev =>
                sortTiemposComida(
                    prev.map(t =>
                        t.id === editingTiempoComidaId
                            ? { ...t, ...updatedTiempoData } // Merge original with updated fields
                            : t
                    )
                )
            );
            handleCancelEdit(); // Close form
            toast({ title: "Éxito", description: `Tiempo "${updatedTiempoData.nombre}" actualizado.` });
        } catch (error) {
            console.error("Error updating TiempoComida: ", error);
            toast({ title: "Error", description: `No se pudo actualizar el Tiempo de Comida. ${error instanceof Error ? error.message : ''}`, variant: "destructive" });
        } finally {
            setIsSavingEditTiempo(false);
        }
    };

    // handleDeleteTiempoComida remains the same
    const handleDeleteTiempoComida = async (id: string, nombre: string) => {
        // Check for associated alternatives (using current state - assumes state is up-to-date)
       const hasAnyAlternativas = alternativas.some(alt => alt.tiempoComidaId === id);
       if (hasAnyAlternativas) {
            toast({
                title: "Error al Eliminar",
                description: `No se puede eliminar \"${nombre}\" porque tiene alternativas asociadas. Elimine o reasigne esas alternativas primero.`,
                variant: "destructive",
                duration: 6000
            });
           return;
       }

       const tiempoRef = doc(db, "tiemposComida", id);
       try {
           console.log(`Attempting delete for TiempoComida ID: ${id}`);
           // <<< Use deleteDoc >>>
           await deleteDoc(tiempoRef);
           console.log(`TiempoComida deleted: ${id}`);

           await createLogEntry(
               'tiempo_comida_deleted',
               residenciaId,
               `Deleted tiempo: ${nombre} (ID: ${id})`,
               tiempoRef.path // Log path before deletion
           );

           // <<< Update state AFTER successful delete >>>
           setTiemposComida(prev => prev.filter(t => t.id !== id));
           toast({ title: "Eliminado", description: `Tiempo "${nombre}" eliminado.`, variant: "destructive" });

           if (editingTiempoComidaId === id) {
               handleCancelEdit();
           }
       } catch (error) {
           console.error("Error deleting TiempoComida: ", error);
           toast({ title: "Error", description: `No se pudo eliminar el Tiempo de Comida. ${error instanceof Error ? error.message : ''}`, variant: "destructive" });
       }
   };

    // --- Alternativa Handlers (Unchanged) ---
    const handleOpenAddAlternativaForm = (tiempoComidaId: string) => {
        setAddingAlternativaTo(tiempoComidaId);
        setEditingAlternativaId(null);
        setAlternativeFormData({
            tipo: 'comedor', tipoAcceso: 'abierto', requiereAprobacion: false,
            ventanaInicio: '13:00', ventanaFin: '14:00', comedorId: '',
            isActive: true, iniciaDiaAnterior: false, terminaDiaSiguiente: false,
            // <<< Set default HorarioSolicitud if available >>>
            horarioSolicitudComidaId: horariosSolicitud.length > 0 ? horariosSolicitud[0].id : '',
        });
    };


    const handleCancelAlternativaForm = () => {
        setAddingAlternativaTo(null);
        setEditingAlternativaId(null);
        setAlternativeFormData({});
        console.log("Closing Add/Edit Alternativa form");
    };
    const handleAlternativaFormChange = (field: keyof AlternativaTiempoComida, value: any) => {
        console.log("Form change:", field, value);
        setAlternativeFormData(prev => {
            const updatedData = { ...prev, [field]: value };
            if (field === 'tipoAcceso') updatedData.requiereAprobacion = (value === 'autorizado');
            if (field === 'tipo' && value === 'paraLlevar') updatedData.comedorId = undefined;
            return updatedData;
        });
    };
    
    const handleAddAlternativa = async () => {
        if (!addingAlternativaTo) return;
        // <<< Add validation for horarioSolicitudComidaId >>>
        if (!alternativeFormData.nombre?.trim()) { /* ... */ return; }
        if (!alternativeFormData.tipo) { /* ... */ return; }
        if (!alternativeFormData.tipoAcceso) { /* ... */ return; }
        if (!alternativeFormData.ventanaInicio || !/^\d\d:\d\d$/.test(alternativeFormData.ventanaInicio)) { /* ... */ return; }
        if (!alternativeFormData.ventanaFin || !/^\d\d:\d\d$/.test(alternativeFormData.ventanaFin)) { /* ... */ return; }
        if (alternativeFormData.tipo === 'comedor' && !alternativeFormData.comedorId) { /* ... */ return; }
        // <<< ADDED validation >>>
        if (!alternativeFormData.horarioSolicitudComidaId) {
            toast({ title: "Error", description: "Debe seleccionar una Regla de Solicitud.", variant: "destructive" });
            return;
        }

        setIsSavingAlternativa(true);

        // <<< Include horarioSolicitudComidaId in data object >>>
        const nuevaAlternativaData: Omit<AlternativaTiempoComida, 'id'> = {
            residenciaId: residenciaId,
            tiempoComidaId: addingAlternativaTo,
            nombre: alternativeFormData.nombre!.trim(),
            tipo: alternativeFormData.tipo!,
            tipoAcceso: alternativeFormData.tipoAcceso!,
            requiereAprobacion: alternativeFormData.requiereAprobacion ?? false,
            ventanaInicio: alternativeFormData.ventanaInicio!,
            ventanaFin: alternativeFormData.ventanaFin!,
            // <<< ADDED field >>>
            horarioSolicitudComidaId: alternativeFormData.horarioSolicitudComidaId!,
            comedorId: alternativeFormData.tipo === 'comedor' ? alternativeFormData.comedorId : undefined,
            isActive: true, // Default to active
            iniciaDiaAnterior: alternativeFormData.iniciaDiaAnterior ?? false,
            terminaDiaSiguiente: alternativeFormData.terminaDiaSiguiente ?? false,
        };

        try {
            // <<< Use addDoc >>>
            const docRef = await addDoc(collection(db, "alternativas"), nuevaAlternativaData);
            const newAlternativaWithId: AlternativaTiempoComida = { id: docRef.id, ...nuevaAlternativaData };
            console.log("Alternativa added with ID:", docRef.id);

            await createLogEntry('alternativa_created', residenciaId, `Created alternativa: ${nuevaAlternativaData.nombre} for tiempo ID ${addingAlternativaTo}`, docRef.path);

            // <<< Update state AFTER successful add >>>
            setAlternativas(prev => [...prev, newAlternativaWithId]);
            handleCancelAlternativaForm(); // Close form
            toast({ title: "Éxito", description: `Alternativa "${nuevaAlternativaData.nombre}" añadida.` });
        } catch (error) {
             console.error("Error adding Alternativa: ", error);
             toast({ title: "Error", description: `No se pudo añadir la Alternativa. ${error instanceof Error ? error.message : ''}`, variant: "destructive" });
        } finally {
            setIsSavingAlternativa(false);
        }
    };

    const handleOpenEditAlternativaForm = (alternativa: AlternativaTiempoComida) => {
        setEditingAlternativaId(alternativa.id);
        setAddingAlternativaTo(null);
        setAlternativeFormData({ ...alternativa });
        console.log("Opening Edit form for Alternativa ID:", alternativa.id);
    };
    
    const handleSaveAlternativa = async () => {
        if (!editingAlternativaId) return;
        // <<< Add validation for horarioSolicitudComidaId >>>
        if (!alternativeFormData.nombre?.trim()) { /* ... */ return; }
        if (!alternativeFormData.tipo) { /* ... */ return; }
        if (!alternativeFormData.tipoAcceso) { /* ... */ return; }
        if (!alternativeFormData.ventanaInicio || !/^\d\d:\d\d$/.test(alternativeFormData.ventanaInicio)) { /* ... */ return; }
        if (!alternativeFormData.ventanaFin || !/^\d\d:\d\d$/.test(alternativeFormData.ventanaFin)) { /* ... */ return; }
        if (alternativeFormData.tipo === 'comedor' && !alternativeFormData.comedorId) { /* ... */ return; }
        // <<< ADDED validation >>>
        if (!alternativeFormData.horarioSolicitudComidaId) {
            toast({ title: "Error", description: "Debe seleccionar una Regla de Solicitud.", variant: "destructive" });
            return;
        }

        setIsSavingAlternativa(true);

        const altRef = doc(db, "alternativas", editingAlternativaId);
        // <<< Include horarioSolicitudComidaId in data object >>>
        const updatedAlternativaData: Partial<AlternativaTiempoComida> = {
            nombre: alternativeFormData.nombre!.trim(),
            tipo: alternativeFormData.tipo!,
            tipoAcceso: alternativeFormData.tipoAcceso!,
            requiereAprobacion: alternativeFormData.requiereAprobacion ?? false,
            ventanaInicio: alternativeFormData.ventanaInicio!,
            ventanaFin: alternativeFormData.ventanaFin!,
            // <<< ADDED field >>>
            horarioSolicitudComidaId: alternativeFormData.horarioSolicitudComidaId!,
            comedorId: alternativeFormData.tipo === 'comedor' ? alternativeFormData.comedorId : undefined,
            isActive: alternativeFormData.isActive ?? true,
            iniciaDiaAnterior: alternativeFormData.iniciaDiaAnterior ?? false,
            terminaDiaSiguiente: alternativeFormData.terminaDiaSiguiente ?? false,
        };

        try {
            // <<< Use updateDoc >>>
            await updateDoc(altRef, updatedAlternativaData);
            console.log(`Alternativa updated: ${editingAlternativaId}`);

            await createLogEntry(
                'alternativa_updated',
                residenciaId,
                `Updated alternativa: ${updatedAlternativaData.nombre}`,
                altRef.path
            );

            // <<< Update state AFTER successful update >>>
            setAlternativas(prev =>
                prev.map(alt =>
                    alt.id === editingAlternativaId
                        ? { ...alt, ...updatedAlternativaData } // Merge existing with updated
                        : alt
                )
            );
            handleCancelAlternativaForm(); // Close form
            toast({ title: "Éxito", description: `Alternativa "${updatedAlternativaData.nombre}" actualizada.` });
        } catch (error) {
            console.error("Error updating Alternativa: ", error);
            toast({ title: "Error", description: `No se pudo actualizar la Alternativa. ${error instanceof Error ? error.message : ''}`, variant: "destructive" });
        } finally {
            setIsSavingAlternativa(false);
        }
    };

     // <<< ADDED: Handler to delete an Alternativa >>>
     const handleDeleteAlternativa = async (id: string, nombre: string) => {
         const altRef = doc(db, "alternativas", id);
         try {
             console.log(`Attempting delete for Alternativa ID: ${id}`);
             await deleteDoc(altRef);
             console.log(`Alternativa deleted: ${id}`);

             await createLogEntry(
                 'alternativa_deleted', // Add this to LogActionType if needed
                 residenciaId,
                 `Deleted alternativa: ${nombre} (ID: ${id})`,
                 altRef.path // Log path before deletion
             );

             setAlternativas(prev => prev.filter(alt => alt.id !== id));
             toast({ title: "Eliminada", description: `Alternativa "${nombre}" eliminada.`, variant: "destructive" });

             // If the deleted item was being edited, cancel edit mode
             if (editingAlternativaId === id) {
                 handleCancelAlternativaForm();
             }
             // If the deleted item's parent TiempoComida was the target for adding, cancel add mode
             const deletedAlt = alternativas.find(a => a.id === id);
             if (deletedAlt && addingAlternativaTo === deletedAlt.tiempoComidaId) {
                 handleCancelAlternativaForm();
             }

         } catch (error) {
             console.error("Error deleting Alternativa: ", error);
             toast({ title: "Error", description: `No se pudo eliminar la Alternativa. ${error instanceof Error ? error.message : ''}`, variant: "destructive" });
         }
     };

    // --- Display Logic ---
    if (isLoading) {
        // Skeleton Loading State
        return (
          <div className="container mx-auto p-4 space-y-6">
            <Skeleton className="h-8 w-1/2 mb-4" /> {/* Title */}
            {/* TiempoComida Skeleton */}
            <Card>
                <CardHeader><CardTitle><Skeleton className="h-6 w-48" /></CardTitle></CardHeader>
                <CardContent>
                    <Skeleton className="h-4 w-3/4 mb-4" /> {/* Description */}
                    <div className="space-y-3">
                        <Skeleton className="h-12 w-full rounded-md" /> {/* Row 1 */}
                        <Skeleton className="h-12 w-full rounded-md" /> {/* Row 2 */}
                    </div>
                    {/* Add Form Skeleton */}
                    <div className="mt-6 pt-4 border-t">
                         <Skeleton className="h-6 w-40 mb-2" /> {/* Add Title */}
                         <div className="space-y-3 p-4 border rounded bg-gray-50">
                             <Skeleton className="h-10 w-full rounded" /> {/* Input Row */}
                             <Skeleton className="h-10 w-24 rounded" /> {/* Button */}
                         </div>
                     </div>
                </CardContent>
            </Card>
             {/* Alternativas Skeleton */}
             <Card>
                <CardHeader><CardTitle><Skeleton className="h-6 w-56" /></CardTitle></CardHeader>
                <CardContent>
                     <Skeleton className="h-4 w-3/4 mb-4" /> {/* Description */}
                     <Skeleton className="h-8 w-40 mb-4" /> {/* Toggle */}
                     {/* Example Tiempo Group Skeleton */}
                     <div className="mb-4 p-3 border rounded bg-white shadow-sm">
                         <Skeleton className="h-6 w-1/3 mb-3 pb-2 border-b" /> {/* Tiempo Title */}
                         <div className="space-y-2 mb-3">
                             <Skeleton className="h-16 w-full rounded-md" /> {/* Alt Row 1 */}
                             <Skeleton className="h-16 w-full rounded-md" /> {/* Alt Row 2 */}
                         </div>
                         <div className="mt-3 pt-3 border-t">
                            <Skeleton className="h-8 w-48 rounded" /> {/* Add Alt Button */}
                         </div>
                     </div>
                 </CardContent>
             </Card>
          </div>
        );
    }
    if (error) { return <div className="text-red-500 p-4">Error al cargar datos: {error}</div>; }

    const isTiempoFormActive = isAddingTiempo || !!editingTiempoComidaId;
    const isAlternativaFormActive = !!addingAlternativaTo || !!editingAlternativaId;

    return (
        <div className="container mx-auto p-4 space-y-6">
            <h1 className="text-2xl font-bold">Gestionar Tiempos y Alternativas para {residenciaNombre}</h1>

            {/* Section for TiemposComida - WITH EDIT/DELETE (Updated UI) */}
            <Card>
                <CardHeader><CardTitle>Tiempos de Comida</CardTitle></CardHeader>
                <CardContent>
                    <p className="text-sm text-muted-foreground mb-4">Define los momentos específicos (ej. Almuerzo Lunes), agrupándolos (ej. Almuerzo) y ordenándolos para la vista del residente.</p>
                     {/* <<< UPDATED List/Edit TiemposComida display >>> */}
                     <div className="space-y-3">
                        {tiemposComida.map(tiempo => (
                             <div key={tiempo.id} className={`p-3 border rounded ${editingTiempoComidaId === tiempo.id ? 'bg-yellow-50' : 'bg-white hover:bg-gray-50'}`}>
                                {editingTiempoComidaId === tiempo.id ? (
									// --- EDIT FORM for TiempoComida (Updated UI) ---
                                    <div className="space-y-4"> {/* Increased spacing */}
                                         <h4 className="font-semibold">Editando: {tiempo.nombre}</h4>
                                         {/* Row 1: Nombre, Dia, Hora */}
                                         <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            <div>
                                                <Label htmlFor={`edit-tiempo-nombre-${tiempo.id}`}>Nombre Específico</Label>
                                                <Input id={`edit-tiempo-nombre-${tiempo.id}`} value={editTiempoComidaName} onChange={(e) => setEditTiempoComidaName(e.target.value)} placeholder="Ej. Almuerzo Lunes" disabled={isSavingEditTiempo}/>
                                                <p className="text-xs text-muted-foreground mt-1">Identificador único (ej. Almuerzo Lunes).</p>
                                            </div>
                                            <div>
                                                <Label htmlFor={`edit-tiempo-dia-${tiempo.id}`}>Día</Label>
                                                <Select value={editTiempoComidaDia} onValueChange={(value) => setEditTiempoComidaDia(value as DayOfWeekKey)} disabled={isSavingEditTiempo}>
                                                    <SelectTrigger id={`edit-tiempo-dia-${tiempo.id}`}><SelectValue placeholder="Seleccione..." /></SelectTrigger>
                                                    <SelectContent>{availableDays.map(({ key, label }) => (<SelectItem key={key} value={key}>{label}</SelectItem>))}</SelectContent>
                                                </Select>
                                            </div>
                                            <div>
                                                <Label htmlFor={`edit-tiempo-hora-${tiempo.id}`}>Hora Estimada (Opcional)</Label>
                                                <Input id={`edit-tiempo-hora-${tiempo.id}`} type="time" value={editTiempoComidaHoraEstimada} onChange={(e) => setEditTiempoComidaHoraEstimada(e.target.value)} placeholder="HH:MM" disabled={isSavingEditTiempo} step="900" />
                                            </div>
                                         </div>
                                         {/* Row 2: Grupo, Orden */}
                                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                             <div>
                                                 <Label htmlFor={`edit-tiempo-grupo-${tiempo.id}`}>Nombre de Grupo</Label>
                                                 <Input id={`edit-tiempo-grupo-${tiempo.id}`} value={editTiempoComidaNombreGrupo} onChange={(e) => setEditTiempoComidaNombreGrupo(e.target.value)} placeholder="Ej. Almuerzo, Cena" disabled={isSavingEditTiempo}/>
                                                 <p className="text-xs text-muted-foreground mt-1">Para agrupar en UI (ej. Almuerzo).</p>
                                             </div>
                                              <div>
                                                 <Label htmlFor={`edit-tiempo-orden-${tiempo.id}`}>Orden de Grupo</Label>
                                                 <Input id={`edit-tiempo-orden-${tiempo.id}`} type="number" min="1" step="1" value={editTiempoComidaOrdenGrupo} onChange={(e) => setEditTiempoComidaOrdenGrupo(e.target.value)} placeholder="Ej. 1, 2, 3" disabled={isSavingEditTiempo}/>
                                                  <p className="text-xs text-muted-foreground mt-1">Orden numérico (1=primero).</p>
                                             </div>
                                             {/* Empty div for alignment */}
                                             <div></div>
                                          </div>
                                        {/* Action Buttons */}
                                        <div className="flex space-x-2 pt-2">
                                             <Button onClick={handleSaveEditTiempoComida} disabled={isSavingEditTiempo}>{isSavingEditTiempo ? 'Guardando...' : 'Guardar Cambios'}</Button>
                                            <Button variant="outline" onClick={handleCancelEdit} disabled={isSavingEditTiempo}>Cancelar</Button>
                                        </div>
                                    </div>
                                 ) : (
                                    // --- DISPLAY ROW for TiempoComida (Updated UI) ---
                                    <div className="flex justify-between items-center">
                                        <span>
                                            <span className="font-semibold">{tiempo.nombre}</span>
                                            <span className="block text-sm text-muted-foreground">
                                                Grupo: {tiempo.nombreGrupo} (Orden: {tiempo.ordenGrupo}) | Día: {DayOfWeekMap[tiempo.dia]} {tiempo.horaEstimada && `| Hora: ${tiempo.horaEstimada}`}
                                            </span>
                                        </span>
                                        {/* Action Buttons */}
                                        <div className="space-x-2">
                                            <Button variant="outline" size="sm" onClick={() => handleEditTiempoComida(tiempo)} disabled={isTiempoFormActive || isAlternativaFormActive}>Editar</Button>
                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                     <Button variant="destructive" size="sm" disabled={isTiempoFormActive || isAlternativaFormActive || alternativas.some(alt => alt.tiempoComidaId === tiempo.id)}>Eliminar</Button>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent>
                                                     {/* ... (AlertDialog content remains the same) ... */}
                                                     <AlertDialogHeader>
                                                        <AlertDialogTitle>¿Confirmar Eliminación?</AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                            Se eliminará "{tiempo.nombre}". Esta acción no se puede deshacer.
                                                            {alternativas.some(alt => alt.tiempoComidaId === tiempo.id) && <span className="font-semibold text-destructive block mt-2">Primero debe eliminar las alternativas asociadas.</span>}
                                                        </AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                        <AlertDialogAction onClick={() => handleDeleteTiempoComida(tiempo.id, tiempo.nombre)} className={buttonVariants({ variant: "destructive" })} disabled={alternativas.some(alt => alt.tiempoComidaId === tiempo.id)}>Sí, Eliminar</AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                         </div>
                                     </div>
                                 )}
                             </div>
                        ))}
                    </div>
                     {tiemposComida.length === 0 && !isLoading && <p className="text-muted-foreground mt-4 text-center">No hay Tiempos de Comida definidos.</p>}

                    {/* --- ADD FORM for TiempoComida (Updated UI) --- */}
                    {!editingTiempoComidaId && (
                         <div className={`mt-6 pt-4 border-t ${isAlternativaFormActive ? 'opacity-50 pointer-events-none' : ''}`}>
                            <h3 className="font-semibold mb-2 text-lg">Añadir Nuevo Tiempo de Comida</h3>
                            <div className="space-y-4 p-4 border rounded bg-gray-50"> {/* Increased spacing */}
                                 {/* Row 1: Nombre, Dia, Hora */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                        <Label htmlFor="tiempo-nombre">Nombre Específico</Label>
                                        <Input id="tiempo-nombre" value={newTiempoComidaName} onChange={(e) => setNewTiempoComidaName(e.target.value)} placeholder="Ej. Almuerzo Lunes" disabled={isAddingTiempo}/>
                                    </div>
                                    <div>
                                        <Label htmlFor="new-tiempo-dia">Día</Label>
                                        <Select value={newTiempoComidaDia} onValueChange={(value) => setNewTiempoComidaDia(value as DayOfWeekKey)} disabled={isAddingTiempo}>
                                            <SelectTrigger id="new-tiempo-dia"><SelectValue placeholder="Seleccione..." /></SelectTrigger>
                                            <SelectContent>{availableDays.map(({ key, label }) => (<SelectItem key={key} value={key}>{label}</SelectItem>))}</SelectContent>
                                        </Select>
                                    </div>
                                    <div>
                                        <Label htmlFor="new-tiempo-hora">Hora Estimada (Opcional)</Label>
                                        <Input id="new-tiempo-hora" type="time" value={newTiempoComidaHoraEstimada} onChange={(e) => setNewTiempoComidaHoraEstimada(e.target.value)} placeholder="HH:MM" disabled={isAddingTiempo} step="900"/>
                                    </div>
                                </div>
                                 {/* Row 2: Grupo, Orden */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                     <div>
                                         <Label htmlFor="new-tiempo-grupo">Nombre de Grupo</Label>
                                         <Input id="new-tiempo-grupo" value={newTiempoComidaNombreGrupo} onChange={(e) => setNewTiempoComidaNombreGrupo(e.target.value)} placeholder="Ej. Desayuno, Almuerzo" disabled={isAddingTiempo}/>
                                     </div>
                                      <div>
                                         <Label htmlFor="new-tiempo-orden">Orden de Grupo</Label>
                                         <Input id="new-tiempo-orden" type="number" min="1" step="1" value={newTiempoComidaOrdenGrupo} onChange={(e) => setNewTiempoComidaOrdenGrupo(e.target.value)} placeholder="Ej. 1" disabled={isAddingTiempo}/>
                                     </div>
                                      {/* Empty div for alignment */}
                                      <div></div>
                                  </div>
                                <Button onClick={handleAddTiempoComida} disabled={isAddingTiempo}>{isAddingTiempo ? 'Añadiendo...' : 'Añadir Tiempo'}</Button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Section for Alternativas (Remains the same structure, references updated data) */}
            <Card>
                {/* ... (Alternativas Card implementation remains the same as the previous full Firestore version) ... */}
                <CardHeader><CardTitle>Alternativas de Comida</CardTitle></CardHeader>
                <CardContent>
                     <p className="text-sm text-muted-foreground mb-4">Define las opciones específicas (Comedor, Para Llevar) disponibles para cada Tiempo de Comida.</p>
                     {/* Toggle Inactive */}
                     <div className="flex items-center space-x-2 mb-4">
                        <Checkbox id="show-inactive-alternativas" checked={showInactiveAlternativas} onCheckedChange={(checked) => setShowInactiveAlternativas(Boolean(checked))} disabled={isTiempoFormActive || isAlternativaFormActive} />
                        <Label htmlFor="show-inactive-alternativas">Mostrar alternativas inactivas</Label>
                    </div>
                     {/* Loop through TiemposComida */}
                     {tiemposComida.map(tiempo => {
                        const alternativasParaEsteTiempo = alternativas.filter(alt => alt.tiempoComidaId === tiempo.id);
                        const alternativasVisibles = alternativasParaEsteTiempo.filter(alt => showInactiveAlternativas || alt.isActive);
                        return (
                            <div key={tiempo.id} className={`mb-4 p-3 border rounded bg-white shadow-sm ${isTiempoFormActive ? 'opacity-50 pointer-events-none' : ''}`}>
                                 <h4 className="font-semibold text-lg mb-3 border-b pb-2">{tiempo.nombre} ({DayOfWeekMap[tiempo.dia]})</h4>
                                 <ul className="space-y-2 mb-3">
                                 {alternativasVisibles.map(alt => (
                                        <li key={alt.id} className={`p-2 rounded ${alt.isActive ? '' : 'bg-gray-100 opacity-70'} ${editingAlternativaId === alt.id ? 'bg-yellow-50 border border-yellow-300' : 'hover:bg-gray-50'}`}>
                                            {editingAlternativaId === alt.id ? (
                                                // EDIT FORM for Alternativa
                                                <AlternativaForm
                                                    formData={alternativeFormData}
                                                    onFormChange={handleAlternativaFormChange}
                                                    onSubmit={handleSaveAlternativa}
                                                    onCancel={handleCancelAlternativaForm}
                                                    isSaving={isSavingAlternativa}
                                                    availableComedores={comedores} // Pass fetched comedores
                                                    availableHorarios={horariosSolicitud}
                                                    availableComedores={comedores}
                                                    formTitle={`Editando: ${alt.nombre}`}
                                                    submitButtonText="Guardar Cambios"
                                                />
                                            ) : (
                                                // DISPLAY ROW for Alternativa
                                                <div className="flex justify-between items-center gap-4">
                                                    {/* Details */}
                                                    <div className="flex-grow">
                                                        <span className="font-medium">{alt.nombre}</span>
                                                        <span className={`text-xs ml-2 font-semibold ${alt.isActive ? 'text-green-700' : 'text-red-700'}`}>{alt.isActive ? '(Activo)' : '(Inactivo)'}</span>
                                                        <div>
                                                            <span className={`text-xs mr-1 px-1.5 py-0.5 rounded ${alt.tipo === 'comedor' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}`}>{alt.tipo === 'comedor' ? 'Comedor' : 'P/Llevar'}</span>
                                                            <span className={`text-xs mr-1 px-1.5 py-0.5 rounded ${alt.tipoAcceso === 'abierto' ? 'bg-gray-200 text-gray-800' : alt.tipoAcceso === 'autorizado' ? 'bg-orange-100 text-orange-800' : 'bg-red-100 text-red-800'}`}>{alt.tipoAcceso === 'abierto' ? 'Abierto' : alt.tipoAcceso === 'autorizado' ? 'Autoriz.' : 'Cerrado'}</span>
                                                        </div>
                                                        <p className="text-sm text-muted-foreground mt-1">Ventana: {alt.ventanaInicio}-{alt.ventanaFin}
                                                            {alt.comedorId && ` | ${comedores.find(c => c.id === alt.comedorId)?.nombre || 'Comedor Desc.'}`} | Regla:
                                                            {horariosSolicitud.find(h => h.id === alt.horarioSolicitudComidaId)?.nombre || 'N/A'}
                                                        </p>
                                                    </div>
                                                    {/* Actions (Disabled if any form is active) */}
                                                    <div className="space-x-1 flex-shrink-0">
                                                        <Button variant="outline" size="sm" onClick={() => handleOpenEditAlternativaForm(alt)} disabled={isAlternativaFormActive || isTiempoFormActive}>Editar</Button>
                                                        {alt.isActive ? (
                                                            <Button variant="secondary" size="sm" onClick={() => handleToggleAlternativaActive(alt.id, false)} disabled={isAlternativaFormActive || isTiempoFormActive}>Desac.</Button>
                                                        ) : (
                                                            <Button variant="default" size="sm" onClick={() => handleToggleAlternativaActive(alt.id, true)} disabled={isAlternativaFormActive || isTiempoFormActive}>Activar</Button>
                                                        )}
                                                         {/* Delete Button for Alternativa */}
                                                         <AlertDialog>
                                                             <AlertDialogTrigger asChild>
                                                                 <Button variant="destructive" size="sm" disabled={isAlternativaFormActive || isTiempoFormActive}>Eliminar</Button>
                                                             </AlertDialogTrigger>
                                                             <AlertDialogContent>
                                                                 <AlertDialogHeader>
                                                                     <AlertDialogTitle>¿Confirmar Eliminación?</AlertDialogTitle>
                                                                     <AlertDialogDescription>Se eliminará la alternativa "{alt.nombre}". Esta acción no se puede deshacer.</AlertDialogDescription>
                                                                 </AlertDialogHeader>
                                                                 <AlertDialogFooter>
                                                                     <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                                     <AlertDialogAction onClick={() => handleDeleteAlternativa(alt.id, alt.nombre)} className={buttonVariants({ variant: "destructive" })}>Sí, Eliminar</AlertDialogAction>
                                                                 </AlertDialogFooter>
                                                             </AlertDialogContent>
                                                         </AlertDialog>
                                                    </div>
                                                </div>
                                            )}
                                        </li>
                                    ))}
                                    {alternativasVisibles.length === 0 && <p className="text-sm text-muted-foreground px-2 py-1">{showInactiveAlternativas ? 'No hay alternativas inactivas.' : 'No hay alternativas activas.'}</p>}
                                 </ul>
                                 {/* Add Alternativa Button/Form */}
                                 <div className="mt-3 pt-3 border-t">
                                     {!isAlternativaFormActive && ( <Button variant="outline" size="sm" onClick={() => handleOpenAddAlternativaForm(tiempo.id)} disabled={isTiempoFormActive}>+ Añadir Alternativa</Button> )}
                                     {addingAlternativaTo === tiempo.id && (
                                         <AlternativaForm
                                             formData={alternativeFormData}
                                             onFormChange={handleAlternativaFormChange}
                                             onSubmit={handleAddAlternativa}
                                             onCancel={handleCancelAlternativaForm}
                                             isSaving={isSavingAlternativa}
                                             availableComedores={comedores} // Pass fetched comedores
                                             availableHorarios={horariosSolicitud}
                                             availableComedores={comedores}
                                             formTitle={`Añadir Alternativa a ${tiempo.nombre}`}
                                             submitButtonText="Añadir Alternativa"
                                         />
                                     )}
                                 </div>
                            </div>
                        );
                     })}
                     {tiemposComida.length === 0 && !isLoading && <p className="text-muted-foreground mt-4 text-center">Defina primero un Tiempo de Comida para poder añadir alternativas.</p>}
                    {/* Orphaned alternatives */}
                    {alternativas.filter(alt => !tiemposComida.find(tc => tc.id === alt.tiempoComidaId)).length > 0 && !isLoading && (
                        <div className="mt-6 p-3 border rounded border-orange-300 bg-orange-50">
                             <h4 className="font-semibold text-orange-700">Alternativas Huérfanas</h4>
                             <p className="text-xs text-orange-600">Edite estas alternativas para asociarlas a un Tiempo de Comida existente o elimínelas.</p>
                             <ul className="list-disc list-inside mt-1">
                                {alternativas
                                    .filter(alt => !tiemposComida.find(tc => tc.id === alt.tiempoComidaId))
                                    .map(alt => (
                                        <li key={alt.id} className="text-sm text-orange-600 flex justify-between items-center py-1">
                                            <span>{alt.nombre}</span>
                                             <div className="space-x-1">
                                                <Button variant="link" size="sm" className="text-orange-700 h-auto p-0" onClick={() => handleOpenEditAlternativaForm(alt)} disabled={isTiempoFormActive || isAlternativaFormActive}>Editar</Button>
                                                {/* Add Delete for orphans */}
                                                 <AlertDialog>
                                                     <AlertDialogTrigger asChild>
                                                         <Button variant="link" size="sm" className="text-red-600 h-auto p-0" disabled={isTiempoFormActive || isAlternativaFormActive}>Eliminar</Button>
                                                     </AlertDialogTrigger>
                                                     <AlertDialogContent>
                                                         <AlertDialogHeader>
                                                             <AlertDialogTitle>¿Eliminar Alternativa Huérfana?</AlertDialogTitle>
                                                             <AlertDialogDescription>Se eliminará la alternativa "{alt.nombre}". Esta acción no se puede deshacer.</AlertDialogDescription>
                                                         </AlertDialogHeader>
                                                         <AlertDialogFooter>
                                                             <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                             <AlertDialogAction onClick={() => handleDeleteAlternativa(alt.id, alt.nombre)} className={buttonVariants({ variant: "destructive" })}>Sí, Eliminar</AlertDialogAction>
                                                         </AlertDialogFooter>
                                                     </AlertDialogContent>
                                                 </AlertDialog>
                                             </div>
                                         </li>
                                    ))
                                }
                             </ul>
                         </div>
                     )}
                 </CardContent>
            </Card>
        </div>
    );
}
