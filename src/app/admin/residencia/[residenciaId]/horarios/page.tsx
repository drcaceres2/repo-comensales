'use client'; // Ensure this is at the top

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button"; // Corrected import
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
// <<< ADDED Imports for Logging >>>
import { Residencia, TiempoComida, AlternativaTiempoComida, HorarioSolicitudComida, Comedor, DayOfWeekKey, DayOfWeekMap, TipoAccesoAlternativa, LogEntry, LogActionType, ResidenciaId } from '@/models/firestore'; 
import { Timestamp, addDoc, collection } from 'firebase/firestore'; 
import { db, auth } from '@/lib/firebase';
// <<< END Imports for Logging >>>
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"; 

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea"; // Make sure Textarea is imported if used in forms
import { Skeleton } from '@/components/ui/skeleton'; // Ensure Skeleton is imported

interface AlternativaFormProps {
    formData: Partial<AlternativaTiempoComida>;
    onFormChange: (field: keyof AlternativaTiempoComida, value: any) => void;
    onSubmit: () => Promise<void>; // Adjusted for async handlers
    onCancel: () => void;
    isSaving: boolean;
    availableHorarios: HorarioSolicitudComida[];
    availableComedores: Comedor[];
    formTitle: string;
    submitButtonText: string;
}

function AlternativaForm({
    formData,
    onFormChange,
    onSubmit,
    onCancel,
    isSaving,
    availableHorarios,
    availableComedores,
    formTitle,
    submitButtonText
}: AlternativaFormProps) {

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
                    disabled={isSaving} // Disable prop might not work directly on RadioGroup, disable items instead if needed
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
                    {/* Optional: Checkbox for 'iniciaDiaAnterior' */}
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
                     {/* Optional: Checkbox for 'terminaDiaSiguiente' */}
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

            {/* Horario Solicitud Comida */}
            <div>
                <Label htmlFor="alt-horario-solicitud">Regla de Solicitud</Label>
                 <Select
                    value={formData.horarioSolicitudComidaId || ''}
                    onValueChange={(value) => onFormChange('horarioSolicitudComidaId', value)}
                    disabled={isSaving || availableHorarios.length === 0}
                >
                    <SelectTrigger id="alt-horario-solicitud">
                        <SelectValue placeholder="Seleccione una regla..." />
                    </SelectTrigger>
                    <SelectContent>
                         {availableHorarios.length === 0 ? (
                             <SelectItem value="-" disabled>No hay reglas de solicitud definidas</SelectItem>
                         ) : (
                            availableHorarios.map(h => (
                                <SelectItem key={h.id} value={h.id}>
                                    {h.nombre} (Límite: {h.horaLimite}, {h.diasAntelacion}d antes)
                                </SelectItem>
                            ))
                         )}
                    </SelectContent>
                </Select>
                 {availableHorarios.length === 0 && <p className="text-xs text-red-500 mt-1">Debe definir al menos una regla de solicitud.</p>}
            </div>

            {/* Action Buttons */}
            <div className="flex space-x-2 pt-2">
                <Button onClick={() => {
                    // *** ADD LOGGING HERE ***
                    console.log("AlternativaForm submit button clicked, calling onSubmit...");
                    // *** END LOGGING ***
                    onSubmit(); // Original call
                }} disabled={isSaving}>
                    {isSaving ? 'Guardando...' : submitButtonText}
                </Button>
                <Button variant="outline" onClick={onCancel} disabled={isSaving}>
                    Cancelar
                </Button>
            </div>
        </div>
    );
}

// --- MOCK DATA DEFINITIONS ---

const mockHorariosSolicitud: HorarioSolicitudComida[] = [
    { id: 'hsc-1', residenciaId: 'res-guaymura', nombre: 'Mismo día Mañana', horaLimite: '10:00', diasAntelacion: 0 },
    { id: 'hsc-2', residenciaId: 'res-guaymura', nombre: 'Día Antes Noche', horaLimite: '20:00', diasAntelacion: 1 },
];

const mockTiemposComida: TiempoComida[] = [
    { id: 'tc-1', residenciaId: 'res-guaymura', nombre: 'Almuerzo L-V', nombreGrupo: 'Almuerzo', ordenGrupo: 2, diasDisponibles: ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'] },
    { id: 'tc-2', residenciaId: 'res-guaymura', nombre: 'Cena L-D', nombreGrupo: 'Cena', ordenGrupo: 3, diasDisponibles: ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'] },
    { id: 'tc-3', residenciaId: 'res-guaymura', nombre: 'Desayuno L-D', nombreGrupo: 'Desayuno', ordenGrupo: 1, diasDisponibles: ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'] },
];

const mockComedores: Comedor[] = [
    { id: 'com-1', residenciaId: 'res-guaymura', nombre: 'Comedor Principal' },
];

const mockAlternativas: AlternativaTiempoComida[] = [
    { id: 'alt-1', residenciaId: 'res-guaymura', tiempoComidaId: 'tc-1', nombre: 'Almuerzo Comedor', tipo: 'comedor', tipoAcceso: 'abierto', ventanaInicio: '13:00', ventanaFin: '14:30', horarioSolicitudComidaId: 'hsc-1', comedorId: 'com-1', isActive: true },
    { id: 'alt-2', residenciaId: 'res-guaymura', tiempoComidaId: 'tc-1', nombre: 'Almuerzo Llevar', tipo: 'paraLlevar', tipoAcceso: 'abierto', ventanaInicio: '12:30', ventanaFin: '13:30', horarioSolicitudComidaId: 'hsc-1', isActive: true },
    { id: 'alt-3', residenciaId: 'res-guaymura', tiempoComidaId: 'tc-2', nombre: 'Cena Comedor', tipo: 'comedor', tipoAcceso: 'abierto', ventanaInicio: '20:00', ventanaFin: '21:00', horarioSolicitudComidaId: 'hsc-2', comedorId: 'com-1', isActive: true },
    { id: 'alt-4', residenciaId: 'res-guaymura', tiempoComidaId: 'tc-2', nombre: 'Cena Llevar Tarde', tipo: 'paraLlevar', tipoAcceso: 'cerrado', ventanaInicio: '21:00', ventanaFin: '21:30', horarioSolicitudComidaId: 'hsc-2', isActive: true },
    { id: 'alt-5', residenciaId: 'res-guaymura', tiempoComidaId: 'tc-3', nombre: 'Desayuno Buffet', tipo: 'comedor', tipoAcceso: 'abierto', ventanaInicio: '07:30', ventanaFin: '09:00', horarioSolicitudComidaId: 'hsc-1', comedorId: 'com-1', isActive: true },
];

const mockResidenciaDetail: Residencia = {
    id: 'res-guaymura',
    nombre: 'Residencia Guaymura',
    horariosSolicitudComida: mockHorariosSolicitud,
    tiemposComida: mockTiemposComida,
    alternativas: mockAlternativas,
    comedores: mockComedores,
};
// --- END MOCK DATA ---

// <<< Log Helper Function >>>
async function createLogEntry(actionType: LogActionType, residenciaId: ResidenciaId, details?: string, relatedDocPath?: string) {
    try {
        const currentUserId = auth.currentUser?.uid || 'mock-admin-id'; // Replace with real auth user ID later
        const logEntry: Omit<LogEntry, 'id'> = {
            timestamp: Timestamp.now(),
            userId: currentUserId,
            residenciaId: residenciaId,
            actionType: actionType,
            relatedDocPath: relatedDocPath,
            details: details,
        };
        console.log("Simulating log entry creation:", logEntry);
        // In a real app, use addDoc:
        // await addDoc(collection(db, "logEntries"), logEntry);
    } catch (error) {
        console.error("Error creating log entry:", error);
    }
}
// <<< END Log Helper Function >>>

export default function HorariosResidenciaPage() {
    const params = useParams();
    // <<< Ensure residenciaId is typed correctly >>>
    const residenciaId = params.residenciaId as ResidenciaId;
    const { toast } = useToast();
    // ... other state variables ...
    const [currentUserRole, setCurrentUserRole] = useState<'admin' | 'masterAdmin' | 'resident' | null>(null);
    const [residencia, setResidencia] = useState<Residencia | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [tiemposComida, setTiemposComida] = useState<TiempoComida[]>([]);
    const [newTiempoComidaName, setNewTiempoComidaName] = useState('');
    const [newTiempoComidaNombreGrupo, setNewTiempoComidaNombreGrupo] = useState('');
    const [newTiempoComidaOrdenGrupo, setNewTiempoComidaOrdenGrupo] = useState<number | string>('');
    const [newTiempoComidaDays, setNewTiempoComidaDays] = useState<Set<DayOfWeekKey>>(new Set());
    const [isAddingTiempo, setIsAddingTiempo] = useState(false);
    const [editingTiempoComidaId, setEditingTiempoComidaId] = useState<string | null>(null);
    const [editTiempoComidaName, setEditTiempoComidaName] = useState('');
    const [editTiempoComidaNombreGrupo, setEditTiempoComidaNombreGrupo] = useState('');
    const [editTiempoComidaOrdenGrupo, setEditTiempoComidaOrdenGrupo] = useState<number | string>('');
    const [editTiempoComidaDays, setEditTiempoComidaDays] = useState<Set<DayOfWeekKey>>(new Set());
    const [isSavingEditTiempo, setIsSavingEditTiempo] = useState(false);
    const [horariosSolicitud, setHorariosSolicitud] = useState<HorarioSolicitudComida[]>([]);
    const [newHorarioNombre, setNewHorarioNombre] = useState('');
    const [newHorarioHoraLimite, setNewHorarioHoraLimite] = useState('10:00');
    const [newHorarioDiasAntelacion, setNewHorarioDiasAntelacion] = useState(0);
    const [isAddingHorario, setIsAddingHorario] = useState(false);
    const [editingHorarioId, setEditingHorarioId] = useState<string | null>(null);
    const [editHorarioNombre, setEditHorarioNombre] = useState('');
    const [editHorarioHoraLimite, setEditHorarioHoraLimite] = useState('');
    const [editHorarioDiasAntelacion, setEditHorarioDiasAntelacion] = useState(0);
    const [isSavingEditHorario, setIsSavingEditHorario] = useState(false);
    const [alternativas, setAlternativas] = useState<AlternativaTiempoComida[]>([]);
    const [showInactiveAlternativas, setShowInactiveAlternativas] = useState(false);
    const [editingAlternativaId, setEditingAlternativaId] = useState<string | null>(null);
    const [addingAlternativaTo, setAddingAlternativaTo] = useState<string | null>(null);
    const [alternativeFormData, setAlternativeFormData] = useState<Partial<AlternativaTiempoComida>>({});
    const [isSavingAlternativa, setIsSavingAlternativa] = useState(false);
    const availableDays: { key: DayOfWeekKey; label: string }[] = Object.entries(DayOfWeekMap).map(([key, label]) => ({ key: key as DayOfWeekKey, label }));

    useEffect(() => {
        setIsLoading(true);
        setError(null);
        setCurrentUserRole('admin');
        console.log(`Fetching data for residenciaId: ${residenciaId}`);
        const timer = setTimeout(() => {
            if (residenciaId === mockResidenciaDetail.id) {
                console.log("Mock data found for ID:", residenciaId);
                setResidencia(mockResidenciaDetail);
                setTiemposComida((mockResidenciaDetail.tiemposComida || []).sort((a, b) => a.ordenGrupo - b.ordenGrupo));
                setAlternativas(mockResidenciaDetail.alternativas || []);
                setHorariosSolicitud(mockResidenciaDetail.horariosSolicitudComida || []);
                setIsLoading(false);
            } else {
                console.error("Mock data NOT found for ID:", residenciaId);
                setError(`No se encontró la residencia con ID: ${residenciaId}`);
                setResidencia(null);
                setTiemposComida([]);
                setAlternativas([]);
                setHorariosSolicitud([]);
                setIsLoading(false);
            }
        }, 500);
        return () => clearTimeout(timer);
    }, [residenciaId]);

    const handleToggleAlternativaActive = async (id: string, newStatus: boolean) => {
        const alternativa = alternativas.find(alt => alt.id === id);
        console.log(`Simulating ${newStatus ? 'activation' : 'deactivation'} for Alternativa ID: ${id}`);
        // Simulate async operation if needed for real API calls later
        await new Promise(resolve => setTimeout(resolve, 300));
    
        // <<< Add Logging >>>
        await createLogEntry(
            'alternativa_updated', // Reusing 'updated' type
            residenciaId,
            `${newStatus ? 'Activated' : 'Deactivated'} alternativa: ${alternativa?.nombre || id}`,
            `residencias/${residenciaId}/alternativas/${id}`
        );
    
        setAlternativas(prev =>
            prev.map(alt =>
                alt.id === id ? { ...alt, isActive: newStatus } : alt
            )
        );
    
        toast({
            title: newStatus ? "Activada" : "Desactivada",
            description: `La alternativa ha sido ${newStatus ? 'activada' : 'desactivada'} (simulado).`
        });
    };

    // --- Handlers for TiempoComida Add Form ---
    const handleNewDayChange = (dayKey: DayOfWeekKey) => {
      setNewTiempoComidaDays(prevDays => {
        const newDays = new Set(prevDays);
        if (newDays.has(dayKey)) {
          newDays.delete(dayKey);
        } else {
          newDays.add(dayKey);
        }
        return newDays;
      });
    };

    const handleAddTiempoComida = async () => {
        const ordenGrupoNum = Number(newTiempoComidaOrdenGrupo);
        if (!newTiempoComidaName.trim() || newTiempoComidaDays.size === 0) {
            toast({ title: "Error", description: "Por favor, ingrese un nombre y seleccione al menos un día.", variant: "destructive" });
            return;
        }
        setIsAddingTiempo(true);

        // <<< UPDATED Object Creation >>>
        const nuevoTiempo: TiempoComida = {
            id: `tc-${Date.now()}`, // Mock ID
            residenciaId: residenciaId,
            nombre: newTiempoComidaName.trim(),
            nombreGrupo: newTiempoComidaNombreGrupo.trim(),
            ordenGrupo: ordenGrupoNum,
            diasDisponibles: Array.from(newTiempoComidaDays),
        };

        console.log("Simulating add TiempoComida:", nuevoTiempo);
        await new Promise(resolve => setTimeout(resolve, 500)); // Simulate delay

        // <<< Add Logging >>>
        await createLogEntry(
            'tiempo_comida_created',
            residenciaId,
            `Created tiempo: ${nuevoTiempo.nombre}`,
            `residencias/${residenciaId}/tiemposComida/${nuevoTiempo.id}` // Adjust path if needed
        );

        // <<< UPDATED State Update & Reset >>>
        setTiemposComida(prev => [...prev, nuevoTiempo].sort((a, b) => a.ordenGrupo - b.ordenGrupo));
        setNewTiempoComidaName('');
        setNewTiempoComidaNombreGrupo('');
        setNewTiempoComidaOrdenGrupo('');
        setNewTiempoComidaDays(new Set());
        setIsAddingTiempo(false);
        toast({ title: "Éxito", description: `Tiempo "${nuevoTiempo.nombre}" añadido (simulado).` });
    };

    // --- Handlers for TiempoComida Edit/Delete ---
     const handleEditDayChange = (dayKey: DayOfWeekKey) => {
        setEditTiempoComidaDays(prevDays => {
            const newDays = new Set(prevDays);
            if (newDays.has(dayKey)) {
                newDays.delete(dayKey);
            } else {
                newDays.add(dayKey);
            }
            return newDays;
        });
    };

    const handleEditTiempoComida = (tiempo: TiempoComida) => {
        console.log("Opening edit form for:", tiempo); // Log the data being edited
        setEditingTiempoComidaId(tiempo.id);
        setEditTiempoComidaName(tiempo.nombre);
        // <<< UPDATED: Set state for new fields >>>
        setEditTiempoComidaNombreGrupo(tiempo.nombreGrupo);
        setEditTiempoComidaOrdenGrupo(tiempo.ordenGrupo);
        setEditTiempoComidaDays(new Set(tiempo.diasDisponibles));
    };

    const handleCancelEdit = () => {
        setEditingTiempoComidaId(null);
        setEditTiempoComidaName('');
        setEditTiempoComidaNombreGrupo(''); // Clear new state
        setEditTiempoComidaOrdenGrupo(''); // Clear new state
        setEditTiempoComidaDays(new Set());
    };

    const handleSaveEditTiempoComida = async () => {
        const ordenGrupoNum = Number(editTiempoComidaOrdenGrupo);
        // <<< UPDATED Validation >>>
        if (!editingTiempoComidaId || !editTiempoComidaName.trim() || !editTiempoComidaNombreGrupo.trim() || !Number.isInteger(ordenGrupoNum) || ordenGrupoNum < 1 || editTiempoComidaDays.size === 0) {
             toast({
                title: "Error",
                description: "Nombre específico, nombre de grupo, orden de grupo (número >= 1) y al menos un día son requeridos para editar.",
                variant: "destructive"
             });
            return;
        }
        setIsSavingEditTiempo(true);

        const originalTiempo = tiemposComida.find(t => t.id === editingTiempoComidaId);
        console.log(`Simulating save edit for TiempoComida ID: ${editingTiempoComidaId}`);
        await new Promise(resolve => setTimeout(resolve, 500));

        // <<< Add Logging >>>
        // Consider adding details about changes vs originalTiempo
        await createLogEntry(
            'tiempo_comida_updated',
            residenciaId,
            `Updated tiempo: ${editTiempoComidaName.trim()}`,
            `residencias/${residenciaId}/tiemposComida/${editingTiempoComidaId}`
        );
        // <<< UPDATED State Update >>>
        setTiemposComida(prev =>
            prev.map(t =>
                t.id === editingTiempoComidaId
                    ? { ...t,
                        nombre: editTiempoComidaName.trim(),
                        nombreGrupo: editTiempoComidaNombreGrupo.trim(),
                        ordenGrupo: ordenGrupoNum,
                        diasDisponibles: Array.from(editTiempoComidaDays)
                      }
                    : t
            ).sort((a, b) => a.ordenGrupo - b.ordenGrupo) // Maintain sort order
        );

        setIsSavingEditTiempo(false);
        handleCancelEdit(); // Close edit form
        toast({ title: "Éxito", description: `Tiempo "${editTiempoComidaName}" actualizado (simulado).` });
    };

    const handleDeleteTiempoComida = async (id: string, nombre: string) => {
        console.log(`Attempting delete for TiempoComida ID: ${id}`);

        // Check for associated alternatives and check if is active (crucial before deleting)
        const hasActiveAlternativas = alternativas.some(alt => alt.tiempoComidaId === id && alt.isActive);
        if (hasActiveAlternativas) {
             toast({
                 title: "Error al Eliminar",
                 description: `No se puede eliminar "${nombre}" porque o bien tiene alternativas asociadas o bien está activa. Elimine las alternativas o inactive primero.`,
                 variant: "destructive",
                 duration: 5000
             });
            return; // Stop deletion
        }

        // Proceed with simulated deletion if no alternatives are found
        console.log(`Simulating delete for TiempoComida ID: ${id}`);
        // await new Promise(resolve => setTimeout(resolve, 300)); // Optional delay simulation

        // Update state
        setTiemposComida(prev => prev.filter(t => t.id !== id));

        toast({
            title: "Eliminado",
            description: `"${nombre}" eliminado (simulado).`,
            variant: "destructive"
        });

        // If the deleted item was being edited, cancel edit mode
        if (editingTiempoComidaId === id) {
            handleCancelEdit(); // Use the correct cancel handler
        }
    };

    // --- Handlers for HorarioSolicitudComida Edit ---
    const handleEditHorario = (horario: HorarioSolicitudComida) => {
        setEditingHorarioId(horario.id);
        setEditHorarioNombre(horario.nombre);
        setEditHorarioHoraLimite(horario.horaLimite);
        setEditHorarioDiasAntelacion(horario.diasAntelacion);
        // Disable the add form while editing
    };

    const handleCancelEditHorario = () => {
        setEditingHorarioId(null);
        // Clear edit form state (optional but good practice)
        setEditHorarioNombre('');
        setEditHorarioHoraLimite('');
        setEditHorarioDiasAntelacion(0);
    };

    const handleSaveEditHorario = async () => {
        if (!editingHorarioId || !editHorarioNombre.trim() || !editHorarioHoraLimite) {
                toast({ title: "Error", description: "Nombre y Hora Límite son requeridos para editar.", variant: "destructive" });
                return;
        }
            // Basic validation for diasAntelacion
        if (isNaN(editHorarioDiasAntelacion) || editHorarioDiasAntelacion < 0) {
            toast({ title: "Error", description: "Días de Antelación debe ser un número igual o mayor a 0.", variant: "destructive" });
            return;
        }
        setIsSavingEditHorario(true);
        console.log(`Simulating save edit for HorarioSolicitud ID: ${editingHorarioId}`);
        await new Promise(resolve => setTimeout(resolve, 500));

        // <<< Add Logging >>>
        const originalHorario = horariosSolicitud.find(h => h.id === editingHorarioId);
        await createLogEntry(
            'horario_solicitud_updated',
            residenciaId,
            `Updated horario: ${editHorarioNombre}`, // Consider adding more detail about changes
            `residencias/${residenciaId}/horariosSolicitud/${editingHorarioId}`
        );

        setHorariosSolicitud(prev =>
            prev.map(h =>
                h.id === editingHorarioId
                    ? { ...h, nombre: editHorarioNombre, horaLimite: editHorarioHoraLimite, diasAntelacion: editHorarioDiasAntelacion }
                    : h
            )
        );

        setIsSavingEditHorario(false);
        handleCancelEditHorario(); // Close edit form and clear state
        toast({ title: "Éxito", description: `Regla "${editHorarioNombre}" actualizada (simulado).` });
    };

    // --- Handler for HorarioSolicitudComida Delete ---
    const handleDeleteHorario = async (id: string, nombre: string) => {
        console.log(`Attempting delete for HorarioSolicitud ID: ${id}`);

        // IMPORTANT: Check if this horario rule is used by any alternativa
        const isUsed = alternativas.some(alt => alt.horarioSolicitudComidaId === id);

        if (isUsed) {
             toast({
                 title: "Error al Eliminar",
                 description: `No se puede eliminar la regla "${nombre}" porque está siendo utilizada por una o más alternativas de comida. Modifique o elimine esas alternativas primero.`,
                 variant: "destructive",
                 duration: 6000 // Longer duration for error message
             });
            return; // Stop the deletion process
        }

        // If not used, proceed with deletion (simulated)
        console.log(`Simulating delete for HorarioSolicitud ID: ${id}`);
        // Simulate async delay if needed for real API call later
        await new Promise(resolve => setTimeout(resolve, 300));
        // <<< Add Logging >>>
        await createLogEntry(
            'horario_solicitud_deleted',
            residenciaId,
            `Deleted horario: ${nombre} (ID: ${id})`,
            `residencias/${residenciaId}/horariosSolicitud/${id}`
        );

        // Update state
        setHorariosSolicitud(prev => prev.filter(h => h.id !== id));

        toast({
            title: "Eliminado",
            description: `Regla "${nombre}" eliminada (simulado).`,
            variant: "destructive" // Use destructive variant for delete confirmation
        });

        // If the deleted item was being edited, cancel edit mode
        if (editingHorarioId === id) {
            handleCancelEditHorario();
        }
    };

    // --- Handlers for HorarioSolicitudComida Add ---
    const handleAddHorario = async () => {
        if (!newHorarioNombre.trim() || !newHorarioHoraLimite) {
             toast({ title: "Error", description: "Nombre y Hora Límite son requeridos.", variant: "destructive" });
             return;
        }
        // Basic validation for diasAntelacion
        if (isNaN(newHorarioDiasAntelacion) || newHorarioDiasAntelacion < 0) {
             toast({ title: "Error", description: "Días de Antelación debe ser un número igual o mayor a 0.", variant: "destructive" });
             return;
        }
        setIsAddingHorario(true);
        const nuevoHorario: HorarioSolicitudComida = {
            id: `hsc-${Date.now()}`, // Mock ID
            residenciaId: residenciaId,
            nombre: newHorarioNombre,
            horaLimite: newHorarioHoraLimite,
            diasAntelacion: newHorarioDiasAntelacion,
        };

        console.log("Simulating add HorarioSolicitud:", nuevoHorario);
        await new Promise(resolve => setTimeout(resolve, 500)); // Simulate delay

        // <<< Add Logging >>>
        await createLogEntry(
            'horario_solicitud_created',
            residenciaId,
            `Created horario: ${nuevoHorario.nombre}`,
            `residencias/${residenciaId}/horariosSolicitud/${nuevoHorario.id}`
        );
        
        setHorariosSolicitud(prev => [...prev, nuevoHorario]); // Add to state

        // Reset form
        setNewHorarioNombre('');
        setNewHorarioHoraLimite('10:00'); // Reset to default
        setNewHorarioDiasAntelacion(0);
        setIsAddingHorario(false);
        toast({ title: "Éxito", description: `Regla "${nuevoHorario.nombre}" añadida (simulado).` });
    };

    // Opens the "Add" form for a specific TiempoComida
    const handleOpenAddAlternativaForm = (tiempoComidaId: string) => {
        setAddingAlternativaTo(tiempoComidaId);
        setEditingAlternativaId(null); // Close edit form if open
        // Reset form data with defaults
        setAlternativeFormData({
            tipo: 'comedor', // Default type
            tipoAcceso: 'abierto', // Default access
            ventanaInicio: '13:00', // Default start time
            ventanaFin: '14:00', // Default end time
            horarioSolicitudComidaId: horariosSolicitud.length > 0 ? horariosSolicitud[0].id : '', // Default to first schedule if available
            comedorId: '', // Default comedor
            // isActive will be set to true on creation
        });
        console.log("Opening Add form for TiempoComida ID:", tiempoComidaId);
    };

    // Closes the "Add" or "Edit" form
    const handleCancelAlternativaForm = () => {
        setAddingAlternativaTo(null);
        setEditingAlternativaId(null);
        setAlternativeFormData({}); // Clear form data
        console.log("Closing Add/Edit Alternativa form");
    };

    // Handles changes in the Add/Edit form inputs
    const handleAlternativaFormChange = (field: keyof AlternativaTiempoComida, value: any) => {
        console.log("Form change:", field, value);
        setAlternativeFormData(prev => {
            const updatedData = { ...prev, [field]: value };
            // If type changes to 'paraLlevar', clear comedorId
            if (field === 'tipo' && value === 'paraLlevar') {
                updatedData.comedorId = undefined; // Or null, depending on your model/preference
                console.log("Type changed to paraLlevar, clearing comedorId");
            }
            return updatedData;
        });
    };

    // Handles submission of the "Add" form
    const handleAddAlternativa = async () => {
        console.log("handleAddAlternativa function CALLED.");
        if (!addingAlternativaTo) return; // Should not happen if form is visible

        console.log("Attempting to add alternative with data:", alternativeFormData);

        // --- Validation ---
        if (!alternativeFormData.nombre?.trim()) {
            console.error("Validation FAILED: Nombre missing"); // <-- Add Log
            toast({ title: "Error", description: "El nombre de la alternativa es requerido.", variant: "destructive" });
            return;
        }
        if (!alternativeFormData.tipo) {
            console.error("Validation FAILED: Tipo missing"); // <-- Add Log
            toast({ title: "Error", description: "El tipo (Comedor/Para Llevar) es requerido.", variant: "destructive" });
            return;
        }
        if (!alternativeFormData.tipoAcceso) {
            console.error("Validation FAILED: TipoAcceso missing"); // <-- Add Log
            toast({ title: "Error", description: "El tipo de acceso es requerido.", variant: "destructive" });
            return;
        }
        const timeStringInicio = alternativeFormData.ventanaInicio || '';
        const charCodesInicio = Array.from(timeStringInicio).map(char => char.charCodeAt(0)).join(', ');
        console.log(
            "Checking VentanaInicio:",
            `'${timeStringInicio}'`,
            `Length: ${timeStringInicio.length}`,
            `CharCodes: [${charCodesInicio}]`, // Log character codes
            `Type: ${typeof timeStringInicio}`,
            `Regex test (/^\\d\\d:\\d\\d$/): ${/^\d\d:\d\d$/.test(timeStringInicio)}` // Keep the test
        );
        if (!alternativeFormData.ventanaInicio || typeof alternativeFormData.ventanaInicio !== 'string' || !/^\d\d:\d\d$/.test(alternativeFormData.ventanaInicio)) { // Add type check
            console.error(
                "Validation FAILED: VentanaInicio invalid.",
                "Value:", alternativeFormData.ventanaInicio, // Log value
                "Type:", typeof alternativeFormData.ventanaInicio // Log type
            );
            toast({ title: "Error", description: "La hora de inicio de la ventana (HH:MM) es requerida y debe tener el formato correcto.", variant: "destructive" });
            return;
        }
        const timeStringFin = alternativeFormData.ventanaFin || '';
        const charCodesFin = Array.from(timeStringFin).map(char => char.charCodeAt(0)).join(', ');
            console.log(
            "Checking VentanaFin:",
            `'${timeStringFin}'`,
            `Length: ${timeStringFin.length}`,
            `CharCodes: [${charCodesFin}]`, // Log character codes
            `Type: ${typeof timeStringFin}`,
            `Regex test (/^\\d\\d:\\d\\d$/): ${/^\d\d:\d\d$/.test(timeStringFin)}` // Keep the test
        );
        if (!alternativeFormData.ventanaFin || typeof alternativeFormData.ventanaFin !== 'string' || !/^\d\d:\d\d$/.test(alternativeFormData.ventanaFin)) { // Add type check
            console.error(
                "Validation FAILED: VentanaFin invalid.",
                "Value:", alternativeFormData.ventanaFin, // Log value
                "Type:", typeof alternativeFormData.ventanaFin // Log type
            );
             toast({ title: "Error", description: "La hora de fin de la ventana (HH:MM) es requerida y debe tener el formato correcto.", variant: "destructive" });
            return;
        }
         if (!alternativeFormData.horarioSolicitudComidaId) {
            console.error("Validation FAILED: HorarioSolicitudComidaId missing"); // <-- Add Log
            toast({ title: "Error", description: "Debe seleccionar una regla de solicitud.", variant: "destructive" });
            return;
        }
        // Optional: Validate comedorId if tipo is 'comedor'
        if (alternativeFormData.tipo === 'comedor' && !alternativeFormData.comedorId) {
            console.error("Validation FAILED: ComedorId missing for tipo 'comedor'"); // <-- Add Log
             toast({ title: "Error", description: "Debe seleccionar un comedor si el tipo es 'Comedor'.", variant: "destructive" });
             return;
         }
        console.log("Validation PASSED."); // <-- Add log here too
        // ... rest of function ...
        // Optional: Validate time window logic (start before end?)
        // ... add more specific validation as needed ...

        setIsSavingAlternativa(true);

        const nuevaAlternativa: AlternativaTiempoComida = {
            id: `alt-${Date.now()}`, // Mock ID
            residenciaId: residenciaId,
            tiempoComidaId: addingAlternativaTo,
            nombre: alternativeFormData.nombre.trim(),
            tipo: alternativeFormData.tipo,
            tipoAcceso: alternativeFormData.tipoAcceso,
            ventanaInicio: alternativeFormData.ventanaInicio,
            ventanaFin: alternativeFormData.ventanaFin,
            horarioSolicitudComidaId: alternativeFormData.horarioSolicitudComidaId,
            comedorId: alternativeFormData.tipo === 'comedor' ? alternativeFormData.comedorId : undefined, // Only set if type is comedor
            isActive: true, // New alternatives are active by default
            // Handle optional boolean fields if needed (iniciaDiaAnterior, terminaDiaSiguiente) - defaulting to false/undefined here
            iniciaDiaAnterior: alternativeFormData.iniciaDiaAnterior ?? false,
            terminaDiaSiguiente: alternativeFormData.terminaDiaSiguiente ?? false,
        };

        console.log("Simulating add Alternativa:", nuevaAlternativa);
        await new Promise(resolve => setTimeout(resolve, 500)); // Simulate delay

        // <<< Add Logging >>>
        await createLogEntry(
            'alternativa_created',
            residenciaId,
            `Created alternativa: ${nuevaAlternativa.nombre} for tiempo ID ${addingAlternativaTo}`,
            `residencias/${residenciaId}/alternativas/${nuevaAlternativa.id}` // Adjust path if needed
        );

        // Add to state
        setAlternativas(prev => [...prev, nuevaAlternativa]);

        setIsSavingAlternativa(false);
        handleCancelAlternativaForm(); // Close form and clear data
        toast({ title: "Éxito", description: `Alternativa \"${nuevaAlternativa.nombre}\" añadida (simulado).` });
    };

    // Opens the "Edit" form for a specific Alternativa
    const handleOpenEditAlternativaForm = (alternativa: AlternativaTiempoComida) => {
        setEditingAlternativaId(alternativa.id);
        setAddingAlternativaTo(null); // Close add form if open
        // Populate form data with the existing alternative's details
        setAlternativeFormData({ ...alternativa });
        console.log("Opening Edit form for Alternativa ID:", alternativa.id);
    };

    // Handles submission of the "Edit" form
    const handleSaveAlternativa = async () => {
        if (!editingAlternativaId) return; // Should not happen if edit form is visible

        console.log("Attempting to save alternative with ID:", editingAlternativaId, "Data:", alternativeFormData);

        if (!alternativeFormData.nombre?.trim()) {
            console.error("Validation FAILED: Nombre missing"); // <-- Add Log
            toast({ title: "Error", description: "El nombre de la alternativa es requerido.", variant: "destructive" });
            return;
        }
        if (!alternativeFormData.tipo) {
            console.error("Validation FAILED: Tipo missing"); // <-- Add Log
            toast({ title: "Error", description: "El tipo (Comedor/Para Llevar) es requerido.", variant: "destructive" });
            return;
        }
        if (!alternativeFormData.tipoAcceso) {
            console.error("Validation FAILED: TipoAcceso missing"); // <-- Add Log
            toast({ title: "Error", description: "El tipo de acceso es requerido.", variant: "destructive" });
            return;
        }
        const timeStringInicio = alternativeFormData.ventanaInicio || '';
        const charCodesInicio = Array.from(timeStringInicio).map(char => char.charCodeAt(0)).join(', ');
        console.log(
            "Checking VentanaInicio:",
            `'${timeStringInicio}'`,
            `Length: ${timeStringInicio.length}`,
            `CharCodes: [${charCodesInicio}]`, // Log character codes
            `Type: ${typeof timeStringInicio}`,
            `Regex test (/^\\d\\d:\\d\\d$/): ${/^\d\d:\d\d$/.test(timeStringInicio)}` // Keep the test
        );
        if (!alternativeFormData.ventanaInicio || typeof alternativeFormData.ventanaInicio !== 'string' || !/^\d\d:\d\d$/.test(alternativeFormData.ventanaInicio)) { // Add type check
            console.error(
                "Validation FAILED: VentanaInicio invalid.",
                "Value:", alternativeFormData.ventanaInicio, // Log value
                "Type:", typeof alternativeFormData.ventanaInicio // Log type
            );
            toast({ title: "Error", description: "La hora de inicio de la ventana (HH:MM) es requerida y debe tener el formato correcto.", variant: "destructive" });
            return;
        }
        if (!alternativeFormData.ventanaFin || typeof alternativeFormData.ventanaFin !== 'string' || !/^\d\d:\d\d$/.test(alternativeFormData.ventanaFin)) { // Add type check
            console.error(
                "Validation FAILED: VentanaFin invalid.",
                "Value:", alternativeFormData.ventanaFin, // Log value
                "Type:", typeof alternativeFormData.ventanaFin // Log type
            );
             toast({ title: "Error", description: "La hora de fin de la ventana (HH:MM) es requerida y debe tener el formato correcto.", variant: "destructive" });
            return;
        }
         if (!alternativeFormData.horarioSolicitudComidaId) {
            console.error("Validation FAILED: HorarioSolicitudComidaId missing"); // <-- Add Log
            toast({ title: "Error", description: "Debe seleccionar una regla de solicitud.", variant: "destructive" });
            return;
        }
        // Optional: Validate comedorId if tipo is 'comedor'
        if (alternativeFormData.tipo === 'comedor' && !alternativeFormData.comedorId) {
            console.error("Validation FAILED: ComedorId missing for tipo 'comedor'"); // <-- Add Log
             toast({ title: "Error", description: "Debe seleccionar un comedor si el tipo es 'Comedor'.", variant: "destructive" });
             return;
         }
        console.log("Validation PASSED. (edit)"); // <-- Add log here too

        setIsSavingAlternativa(true);

        const originalAlternativa = alternativas.find(a => a.id === editingAlternativaId);
        // Create the updated object - ensure all fields are included
        const updatedAlternativa: AlternativaTiempoComida = {
            // Keep existing IDs and relationships
            id: editingAlternativaId,
            residenciaId: residenciaId, // Assuming this doesn't change on edit
            tiempoComidaId: alternativeFormData.tiempoComidaId!, // Needs to be present in formData
            // Update editable fields
            nombre: alternativeFormData.nombre.trim(),
            tipo: alternativeFormData.tipo!,
            tipoAcceso: alternativeFormData.tipoAcceso!,
            ventanaInicio: alternativeFormData.ventanaInicio!,
            ventanaFin: alternativeFormData.ventanaFin!,
            horarioSolicitudComidaId: alternativeFormData.horarioSolicitudComidaId!,
            comedorId: alternativeFormData.tipo === 'comedor' ? alternativeFormData.comedorId : undefined,
            isActive: alternativeFormData.isActive!, // Ensure isActive status is preserved/editable if needed
            iniciaDiaAnterior: alternativeFormData.iniciaDiaAnterior ?? false,
            terminaDiaSiguiente: alternativeFormData.terminaDiaSiguiente ?? false,
        };


        console.log("Simulating save Alternativa:", updatedAlternativa);
        await new Promise(resolve => setTimeout(resolve, 500)); // Simulate delay

        // <<< Add Logging >>>
        await createLogEntry(
            'alternativa_updated',
            residenciaId,
            `Updated alternativa: ${updatedAlternativa.nombre}`,
            `residencias/${residenciaId}/alternativas/${editingAlternativaId}`
        );


        // Update state
        setAlternativas(prev =>
            prev.map(alt =>
                alt.id === editingAlternativaId ? updatedAlternativa : alt
            )
        );

        setIsSavingAlternativa(false);
        handleCancelAlternativaForm(); // Close form and clear data
        toast({ title: "Éxito", description: `Alternativa \"${updatedAlternativa.nombre}\" actualizada (simulado).` });
    };

    // Display Logic
    if (isLoading) {
        return <div>Cargando datos de horarios...</div>;
    }
    if (error) { return <div className="text-red-500">Error: {error}</div>; }
    if (!residencia) { return <div>No se encontró la residencia con ID {residenciaId}.</div>; }

    // Determine if any add/edit operation is active to disable buttons globally
    const isOperationActive = isAddingTiempo || !!editingTiempoComidaId || isAddingHorario || !!editingHorarioId;

    // *** ADD THIS LOGGING ***
    console.log("Button Disable States:", {
        isOperationActive, // Is any Tiempo/Horario form active?
        editingAlternativaId, // Is an Alternativa being edited?
        addingAlternativaTo, // Is an Alternativa being added?
        // Combined condition used in buttons:
        isDisabled: isOperationActive || !!editingAlternativaId || !!addingAlternativaTo
    });
    // *** END LOGGING ***
    
    return (
        <div className="container mx-auto p-4 space-y-6">
            <h1 className="text-2xl font-bold">Gestionar Horarios para {residencia?.nombre || 'Residencia'}</h1>

             {/* Section for HorarioSolicitudComida (Placeholder - No changes here yet) */}
             <Card>
                <CardHeader><CardTitle>Reglas de Solicitud de Comidas</CardTitle></CardHeader>
                <CardContent>
                     <p className="text-sm text-muted-foreground mb-4">Define cuándo deben los usuarios solicitar sus comidas (ej. mismo día antes de las 10am, día anterior antes de las 8pm).</p>
                     {/* List/Edit HorariosSolicitud */}
                     <div className="space-y-3">
                         {horariosSolicitud.map(horario => {
                            // Check if the rule is used by any alternative
                            const isUsed = alternativas.some(alt => alt.horarioSolicitudComidaId === horario.id);
                             return (
                             <div key={horario.id} className={`p-3 border rounded ${editingHorarioId === horario.id ? 'bg-yellow-50' : 'hover:bg-gray-50'}`}>
                                {editingHorarioId === horario.id ? (
                                    // --- EDIT FORM for HorarioSolicitud ---
                                    <div className="space-y-3">
                                        <h4 className="font-semibold">Editando Regla: {horario.nombre}</h4>
                                        <div>
                                            <Label htmlFor={`edit-horario-nombre-${horario.id}`}>Nombre Descriptivo</Label>
                                            <Input
                                                id={`edit-horario-nombre-${horario.id}`}
                                                value={editHorarioNombre}
                                                onChange={(e) => setEditHorarioNombre(e.target.value)}
                                                placeholder="Ej. Mismo día mañana"
                                                disabled={isSavingEditHorario}
                                            />
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <Label htmlFor={`edit-horario-hora-${horario.id}`}>Hora Límite (HH:mm)</Label>
                                                <Input
                                                    id={`edit-horario-hora-${horario.id}`}
                                                    type="time"
                                                    value={editHorarioHoraLimite}
                                                    onChange={(e) => setEditHorarioHoraLimite(e.target.value)}
                                                    disabled={isSavingEditHorario}
                                                />
                                            </div>
                                            <div>
                                                 <Label htmlFor={`edit-horario-dias-${horario.id}`}>Días Antelación</Label>
                                                <Input
                                                    id={`edit-horario-dias-${horario.id}`}
                                                    type="number"
                                                    min="0"
                                                    step="1"
                                                    value={editHorarioDiasAntelacion}
                                                    onChange={(e) => setEditHorarioDiasAntelacion(parseInt(e.target.value, 10) || 0)}
                                                    disabled={isSavingEditHorario}
                                                />
                                                <p className="text-xs text-muted-foreground mt-1">0 = mismo día, 1 = día anterior, etc.</p>
                                            </div>
                                        </div>
                                        <div className="flex space-x-2">
                                            <Button onClick={handleSaveEditHorario} disabled={isSavingEditHorario}>
                                                {isSavingEditHorario ? 'Guardando...' : 'Guardar Cambios'}
                                            </Button>
                                            <Button variant="outline" onClick={handleCancelEditHorario} disabled={isSavingEditHorario}>
                                                Cancelar
                                            </Button>
                                        </div>
                                    </div>
                                ) : (
                                    // --- DISPLAY ROW for HorarioSolicitud ---
                                    <div className="flex justify-between items-center">
                                         <span>
                                             {horario.nombre} (Límite: {horario.horaLimite}, {horario.diasAntelacion} día(s) antes)
                                             {/* Display "(En uso)" indicator */}
                                             {isUsed ? <span className="text-xs text-blue-600 ml-2 font-semibold">(En uso)</span> : ""}
                                         </span>
                                        <div className="space-x-2">
                                             <Button
                                                 variant="outline"
                                                 size="sm"
                                                 onClick={() => handleEditHorario(horario)} // Call the edit handler
                                                 disabled={isOperationActive} // Disable if any operation is active
                                             >
                                                 Editar
                                             </Button>
                                            {/* AlertDialog for Delete Confirmation */}
                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <Button
                                                        variant="destructive"
                                                        size="sm"
                                                        disabled={isOperationActive || isUsed} // Disable if operation active OR if rule is used
                                                    >
                                                        Eliminar
                                                    </Button>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                            Esta acción no se puede deshacer. ¿Seguro que quieres eliminar la regla "{horario.nombre}"?
                                                            {isUsed &&
                                                                <span className="font-semibold text-destructive block mt-2">
                                                                    Esta regla está siendo utilizada por al menos una alternativa de comida y no puede ser eliminada.
                                                                </span>
                                                            }
                                                        </AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                        <AlertDialogAction
                                                            onClick={() => handleDeleteHorario(horario.id, horario.nombre)}
                                                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                                            disabled={isUsed} // Disable action too if used
                                                        >
                                                            Sí, Eliminar
                                                        </AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                        </div>
                                    </div>
                                )}
                            </div>
                         )})}
                     </div>
                     {/* END of map loop for listing/editing */}

                     {horariosSolicitud.length === 0 && <p className="text-muted-foreground mt-4">No hay reglas de solicitud definidas.</p>}

                     {/* Form to add new HorarioSolicitud (Show only if not editing another Horario) */}
                     {/* This entire block starts AFTER the map loop div */}
                     {!editingHorarioId && (
                        <div className="mt-6 pt-4 border-t">
                             <h3 className="font-semibold mb-2 text-lg">Añadir Nueva Regla de Solicitud</h3>
                             {/* Wrap form fields in a container */}
                             <div className="space-y-3 p-4 border rounded bg-gray-50">
                                <div>
                                    <Label htmlFor="new-horario-nombre">Nombre Descriptivo</Label>
                                    <Input
                                        id="new-horario-nombre"
                                        value={newHorarioNombre}
                                        onChange={(e) => setNewHorarioNombre(e.target.value)}
                                        placeholder="Ej. Mismo día mañana, Día antes noche"
                                        disabled={isAddingHorario || isOperationActive}
                                     />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <Label htmlFor="new-horario-hora">Hora Límite (HH:mm)</Label>
                                        <Input
                                            id="new-horario-hora"
                                            type="time"
                                            value={newHorarioHoraLimite}
                                            onChange={(e) => setNewHorarioHoraLimite(e.target.value)}
                                            disabled={isAddingHorario || isOperationActive}
                                        />
                                    </div>
                                    <div>
                                         <Label htmlFor="new-horario-dias">Días Antelación</Label>
                                        <Input
                                            id="new-horario-dias"
                                            type="number"
                                            min="0"
                                            step="1"
                                            value={newHorarioDiasAntelacion}
                                            onChange={(e) => setNewHorarioDiasAntelacion(parseInt(e.target.value, 10) || 0)}
                                            disabled={isAddingHorario || isOperationActive}
                                        />
                                         <p className="text-xs text-muted-foreground mt-1">0 = mismo día, 1 = día anterior, etc.</p>
                                    </div>
                                </div>
                                <Button onClick={handleAddHorario} disabled={isAddingHorario || isOperationActive}>
                                    {isAddingHorario ? 'Añadiendo...' : 'Añadir Regla'}
                                </Button>
                             </div>
                         </div>
                     )}
                     {/* END of Add New Rule Form block */}
                 </CardContent>
            </Card>

            {/* Section for TiemposComida - WITH EDIT/DELETE */}
            <Card>
                <CardHeader><CardTitle>Tiempos de Comida</CardTitle></CardHeader>
                <CardContent>
                    <p className="text-sm text-muted-foreground mb-4">Define los momentos principales del día (ej. Desayuno, Almuerzo) y sus variantes específicas (ej. Almuerzo L-V, Almuerzo Sáb).</p>
                     {/* List/Edit TiemposComida (Display updated) */}
                     <div className="space-y-3">
                        {tiemposComida.map(tiempo => (
                             <div key={tiempo.id} className={`p-3 border rounded ${editingTiempoComidaId === tiempo.id ? 'bg-yellow-50' : 'hover:bg-gray-50'}`}>
                                {editingTiempoComidaId === tiempo.id ? (
									// --- EDIT FORM (Updated) ---
                                    <div className="space-y-3">
                                         <h4 className="font-semibold">Editando: {tiempo.nombre}</h4>
                                         <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            <div>
                                                <Label htmlFor={`edit-tiempo-nombre-${tiempo.id}`}>Nombre Específico</Label>
                                                <Input
                                                    id={`edit-tiempo-nombre-${tiempo.id}`}
                                                    value={editTiempoComidaName}
                                                    onChange={(e) => setEditTiempoComidaName(e.target.value)}
                                                    placeholder="Ej. Almuerzo L-V"
                                                    disabled={isSavingEditTiempo}
                                                />
                                                <p className="text-xs text-muted-foreground mt-1">Nombre único para esta variante.</p>
                                            </div>
                                            {/* Nombre de Grupo */}
                                            <div>
                                                <Label htmlFor={`edit-tiempo-nombre-grupo-${tiempo.id}`}>Nombre de Grupo</Label>
                                                <Input
                                                    id={`edit-tiempo-nombre-grupo-${tiempo.id}`}
                                                    value={editTiempoComidaNombreGrupo}
                                                    onChange={(e) => setEditTiempoComidaNombreGrupo(e.target.value)}
                                                    placeholder="Ej. Almuerzo, Cena"
                                                    disabled={isSavingEditTiempo}
                                                />
                                                 <p className="text-xs text-muted-foreground mt-1">Nombre general que verá el usuario.</p>
                                            </div>
                                            {/* Orden de Grupo */}
                                            <div>
                                                <Label htmlFor={`edit-tiempo-orden-grupo-${tiempo.id}`}>Orden del Grupo</Label>
                                                <Input
                                                    id={`edit-tiempo-orden-grupo-${tiempo.id}`}
                                                    type="number"
                                                    min="1"
                                                    step="1"
                                                    value={editTiempoComidaOrdenGrupo}
                                                    onChange={(e) => setEditTiempoComidaOrdenGrupo(e.target.value ? parseInt(e.target.value, 10) : '')}
                                                    placeholder="Ej. 1"
                                                    disabled={isSavingEditTiempo}
                                                />
                                                 <p className="text-xs text-muted-foreground mt-1">Orden para mostrar filas (1, 2...).</p>
                                            </div>
                                         </div>

                                        {/* Días Disponibles (remains the same) */}
                                        <div>
                                            <Label>Días Disponibles</Label>
                                            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-2 mt-1">
                                                {availableDays.map(({ key, label }) => (
                                                    <div key={key} className="flex items-center space-x-2">
                                                        <Checkbox
                                                            id={`edit-day-${tiempo.id}-${key}`}
                                                            checked={editTiempoComidaDays.has(key)}
                                                            onCheckedChange={() => handleEditDayChange(key)}
                                                            disabled={isSavingEditTiempo}
                                                        />
                                                        <Label htmlFor={`edit-day-${tiempo.id}-${key}`} className="text-sm font-medium">
                                                            {label}
                                                        </Label>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                        {/* Action Buttons (remain the same) */}
                                        <div className="flex space-x-2">
                                             <Button onClick={handleSaveEditTiempoComida} disabled={isSavingEditTiempo}>
                                                {isSavingEditTiempo ? 'Guardando...' : 'Guardar Cambios'}
                                            </Button>
                                            <Button variant="outline" onClick={handleCancelEdit} disabled={isSavingEditTiempo}>
                                                Cancelar
                                            </Button>
                                        </div>
                                    </div>
                                 ) : (
                                    // --- DISPLAY ROW (Updated in previous chunk) ---
                                    <div className="flex justify-between items-center">
                                        <span>
                                            <span className="font-semibold">(Orden: {tiempo.ordenGrupo}) {tiempo.nombreGrupo}</span>: {tiempo.nombre}
                                            <span className="block text-sm text-muted-foreground">
                                                (Días: {tiempo.diasDisponibles.map(d => DayOfWeekMap[d]).join(', ')})
                                            </span>
                                        </span>
                                        <div className="space-x-2">
                                            <Button variant="outline" size="sm" onClick={() => handleEditTiempoComida(tiempo)} disabled={!!editingTiempoComidaId || isAddingTiempo}>
                                                Editar
                                            </Button>
                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                     <Button variant="destructive" size="sm" disabled={!!editingTiempoComidaId || isAddingTiempo || alternativas.some(alt => alt.tiempoComidaId === tiempo.id)}>
                                                        Eliminar
                                                     </Button>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                            Esta acción no se puede deshacer. ¿Seguro que quieres eliminar "{tiempo.nombre}"?
                                                            {alternativas.some(alt => alt.tiempoComidaId === tiempo.id) 
                                                                ? <span className="font-semibold text-destructive block mt-2">Primero debes eliminar las alternativas de comida asociadas a este tiempo.</span> 
                                                                : ""
                                                            }
                                                        </AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                        <AlertDialogAction 
                                                            onClick={() => handleDeleteTiempoComida(tiempo.id, tiempo.nombre)} 
                                                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90" 
                                                            disabled={alternativas.some(alt => alt.tiempoComidaId === tiempo.id)}
                                                        >
                                                             Sí, Eliminar
                                                        </AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                         </div>
                                     </div>
                                 )}
                             </div>
                        ))}
                    </div>
                     {tiemposComida.length === 0 && <p className="text-muted-foreground mt-4">No hay tiempos de comida definidos.</p>}

                    {/* Form to add new TiempoComida (Show only if not editing - Updated) */}
                    {!editingTiempoComidaId && (
                         <div className="mt-6 pt-4 border-t">
                            <h3 className="font-semibold mb-2 text-lg">Añadir Nuevo Tiempo de Comida</h3>
                            <div className="space-y-3 p-4 border rounded bg-gray-50">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                        <Label htmlFor="tiempo-nombre">Nombre Específico</Label>
                                        <Input
                                            id="tiempo-nombre"
                                            value={newTiempoComidaName}
                                            onChange={(e) => setNewTiempoComidaName(e.target.value)}
                                            placeholder="Ej. Almuerzo L-V, Desayuno Finde"
                                            disabled={isAddingTiempo}
                                        />
                                        <p className="text-xs text-muted-foreground mt-1">Nombre único para esta variante (ej. días, horario especial).</p>
                                    </div>
                                    <div>
                                        <Label htmlFor="tiempo-nombre-grupo">Nombre de Grupo (para Usuarios)</Label>
                                        <Input
                                            id="tiempo-nombre-grupo"
                                            value={newTiempoComidaNombreGrupo}
                                            onChange={(e) => setNewTiempoComidaNombreGrupo(e.target.value)}
                                            placeholder="Ej. Desayuno, Almuerzo, Cena"
                                            disabled={isAddingTiempo}
                                        />
                                        <p className="text-xs text-muted-foreground mt-1">Nombre general que verá el usuario.</p>
                                    </div>
                                    <div>
                                        <Label htmlFor="tiempo-orden-grupo">Orden del Grupo (1, 2, 3...)</Label>
                                        <Input
                                            id="tiempo-orden-grupo"
                                            type="number"
                                            min="1"
                                            step="1"
                                            value={newTiempoComidaOrdenGrupo}
                                            onChange={(e) => setNewTiempoComidaOrdenGrupo(e.target.value ? parseInt(e.target.value, 10) : '')}
                                            placeholder="Ej. 1"
                                            disabled={isAddingTiempo}
                                        />
                                        <p className="text-xs text-muted-foreground mt-1">Orden para mostrar filas (Desayuno=1, Almuerzo=2...).</p>
                                    </div>
                                </div>
                                <div>
                                    <Label>Días Disponibles</Label>
                                    <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-2 mt-1">
                                        {availableDays.map(({ key, label }) => (
                                            <div key={key} className="flex items-center space-x-2">
                                                <Checkbox
                                                    id={`new-day-${key}`}
                                                    checked={newTiempoComidaDays.has(key)}
                                                    onCheckedChange={() => handleNewDayChange(key)}
                                                    disabled={isAddingTiempo}
                                                />
                                                <Label htmlFor={`new-day-${key}`} className="text-sm font-medium">
                                                    {label}
                                                </Label>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <Button onClick={handleAddTiempoComida} disabled={isAddingTiempo}>
                                    {isAddingTiempo ? 'Añadiendo...' : 'Añadir Tiempo'}
                                </Button>
                            </div>                            
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Section for Alternativas (remains unchanged) */}
            <Card>
                <CardHeader><CardTitle>Alternativas de Comida</CardTitle></CardHeader>
                <CardContent>
                     <p className="text-sm text-muted-foreground mb-4">Define las opciones específicas disponibles para cada Tiempo de Comida.</p>

                     {/* *** Overall Toggle for Inactive (Applies to all Tiempos) *** */}
                     <div className="flex items-center space-x-2 mb-4">
                        <Checkbox
                            id="show-inactive-alternativas"
                            checked={showInactiveAlternativas}
                            onCheckedChange={(checked) => setShowInactiveAlternativas(Boolean(checked))}
                        />
                        <Label htmlFor="show-inactive-alternativas">Mostrar alternativas inactivas</Label>
                    </div>

                     {/* *** Outer loop iterating through each TiempoComida *** */}
                     {tiemposComida.map(tiempo => { // <-- tiempo is defined here

                        // Pre-calculate alternatives for this tiempo to avoid repeated filtering
                        const alternativasParaEsteTiempo = alternativas.filter(alt => alt.tiempoComidaId === tiempo.id);
                        const alternativasVisibles = alternativasParaEsteTiempo.filter(alt => showInactiveAlternativas || alt.isActive);

                        return ( // <-- Return the JSX block for this tiempo
                            <div key={tiempo.id} className="mb-4 p-3 border rounded bg-white shadow-sm"> {/* Added bg and shadow */}
                                 <h4 className="font-semibold text-lg mb-3 border-b pb-2">{tiempo.nombre}</h4>

                                 {/* *** List of Alternatives for this Tiempo *** */}
                                 <ul className="space-y-2 mb-3">
                                    {alternativasVisibles.map(alt => { // <-- Inner loop for visible alternatives

                                        // *** Calculate button state inside the inner loop ***
                                        const isButtonDisabled = isOperationActive || !!editingAlternativaId || !!addingAlternativaTo;
                                        // Uncomment log below if debugging is needed later
                                        // console.log(`Rendering button state for ${alt.id} (${alt.nombre}): disabled = ${isButtonDisabled}`);

                                        return ( // <-- Return the JSX for this list item (li)
                                            <li key={alt.id} className={`p-2 rounded ${alt.isActive ? '' : 'bg-gray-100 opacity-70'} ${editingAlternativaId === alt.id ? 'bg-yellow-50 border border-yellow-300' : 'hover:bg-gray-50'}`}>
                                                {/* Conditionally render Edit Form or Display Row */}
                                                {editingAlternativaId === alt.id ? (
                                                    // --- EDIT FORM ---
                                                    <AlternativaForm
                                                        formData={alternativeFormData}
                                                        onFormChange={handleAlternativaFormChange}
                                                        onSubmit={handleSaveAlternativa}
                                                        onCancel={handleCancelAlternativaForm}
                                                        isSaving={isSavingAlternativa}
                                                        availableHorarios={horariosSolicitud}
                                                        availableComedores={residencia?.comedores || []}
                                                        formTitle={`Editando: ${alt.nombre}`}
                                                        submitButtonText="Guardar Cambios"
                                                    />
                                                ) : (
                                                    // --- DISPLAY ROW ---
                                                    <div className="flex justify-between items-center gap-4"> {/* Added gap */}
                                                        {/* Left side: Details */}
                                                        <div className="flex-grow"> {/* Allow text to wrap */}
                                                            <span className="font-medium">{alt.nombre}</span>
                                                            <span className={`text-xs ml-2 font-semibold ${alt.isActive ? 'text-green-700' : 'text-red-700'}`}>
                                                                {alt.isActive ? '(Activo)' : '(Inactivo)'}
                                                            </span>
                                                            <div> {/* Wrap badges/details */}
                                                                <span className={`text-xs mr-1 px-1.5 py-0.5 rounded ${alt.tipo === 'comedor' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}`}>{alt.tipo === 'comedor' ? 'Comedor' : 'P/Llevar'}</span>
                                                                <span className={`text-xs mr-1 px-1.5 py-0.5 rounded ${alt.tipoAcceso === 'abierto' ? 'bg-gray-200 text-gray-800' : alt.tipoAcceso === 'autorizado' ? 'bg-orange-100 text-orange-800' : 'bg-red-100 text-red-800'}`}>{alt.tipoAcceso === 'abierto' ? 'Abierto' : alt.tipoAcceso === 'autorizado' ? 'Autoriz.' : 'Cerrado'}</span>
                                                            </div>
                                                            <p className="text-sm text-muted-foreground mt-1">
                                                                Ventana: {alt.ventanaInicio}-{alt.ventanaFin} |
                                                                Regla: {horariosSolicitud.find(h => h.id === alt.horarioSolicitudComidaId)?.nombre || 'N/A'}
                                                                {alt.comedorId && ` | Com.: ${residencia?.comedores?.find(c => c.id === alt.comedorId)?.nombre || 'N/A'}`}
                                                            </p>
                                                        </div>
                                                        {/* Right side: Action Buttons */}
                                                        <div className="space-x-2 flex-shrink-0">
                                                            <Button variant="outline" size="sm" onClick={() => handleOpenEditAlternativaForm(alt)} disabled={isButtonDisabled}>Editar</Button>
                                                            {alt.isActive ? (
                                                                <Button variant="destructive" size="sm" onClick={() => handleToggleAlternativaActive(alt.id, false)} disabled={isButtonDisabled}>Desac.</Button> // Shortened text
                                                            ) : (
                                                                <Button variant="secondary" size="sm" onClick={() => handleToggleAlternativaActive(alt.id, true)} disabled={isButtonDisabled}>Activar</Button>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </li>
                                        ); // End of return for li
                                    })} {/* End of alternativasVisibles.map */}

                                    {/* *** Message if NO alternatives match the current filter *** */}
                                    {/* Now correctly uses tiempo from the outer scope */}
                                    {alternativasVisibles.length === 0 && (
                                        <p className="text-sm text-muted-foreground px-2">
                                            {showInactiveAlternativas
                                                ? 'No hay alternativas (activas o inactivas) definidas para este tiempo.'
                                                : 'No hay alternativas activas definidas.'
                                            }
                                        </p>
                                    )}
                                 </ul> {/* End of the ul for alternatives */}

                                 {/* *** Add Button / Add Form Section *** */}
                                 <div className="mt-3 pt-3 border-t">
                                     {addingAlternativaTo !== tiempo.id && editingAlternativaId === null && ( // Show button only if not adding/editing for THIS tiempo
                                         <Button
                                             variant="outline"
                                             size="sm"
                                             onClick={() => handleOpenAddAlternativaForm(tiempo.id)}
                                             disabled={isOperationActive || !!addingAlternativaTo || !!editingAlternativaId} // Disable if ANY form is open anywhere
                                         >
                                             + Añadir Alternativa a {tiempo.nombre}
                                         </Button>
                                     )}

                                     {/* Render Add Form Conditionally */}
                                     {addingAlternativaTo === tiempo.id && (
                                         <AlternativaForm
                                             formData={alternativeFormData}
                                             onFormChange={handleAlternativaFormChange}
                                             onSubmit={handleAddAlternativa}
                                             onCancel={handleCancelAlternativaForm}
                                             isSaving={isSavingAlternativa}
                                             availableHorarios={horariosSolicitud}
                                             availableComedores={residencia?.comedores || []}
                                             formTitle={`Añadir Alternativa a ${tiempo.nombre}`}
                                             submitButtonText="Añadir Alternativa"
                                         />
                                     )}
                                 </div> {/* End of Add Button/Form Section */}

                            </div> // End of the main div for each TiempoComida
                        ); // End of return for TiempoComida block
                     })} {/* End of tiemposComida.map */}

                     {/* Optional: Display orphaned alternatives (outside the main loop) */}
                     {alternativas.filter(alt => !tiemposComida.find(tc => tc.id === alt.tiempoComidaId)).length > 0 && (
                        <div className="mt-4 p-3 border rounded border-orange-300 bg-orange-50">
                             <h4 className="font-semibold text-orange-700">Alternativas Huérfanas</h4>
                             <ul className="list-disc list-inside mt-1">
                                {alternativas
                                    .filter(alt => !tiemposComida.find(tc => tc.id === alt.tiempoComidaId))
                                    .map(alt => (<li key={alt.id} className="text-sm text-orange-600">{alt.nombre} (ID Tiempo: {alt.tiempoComidaId})</li>))
                                }
                             </ul>
                         </div>
                     )}
                 </CardContent>                 
            </Card>
        </div>
    );
}
