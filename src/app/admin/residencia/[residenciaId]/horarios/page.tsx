// src/app/admin/residencia/[residenciaId]/horarios/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation'; // Import useParams to get route params
import { Residencia, TiempoComida, AlternativaTiempoComida, Comedor, DayOfWeekKey } from '@/models/firestore';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox"; // Import Checkbox
import { ArrowUp, ArrowDown, X } from 'lucide-react'; // Import icons

// Define daysOfWeek constant here as well
const daysOfWeek: { label: string; value: DayOfWeekKey }[] = [
    { label: 'Mon', value: 'lunes' }, { label: 'Tue', value: 'martes' },
    { label: 'Wed', value: 'miercoles' }, { label: 'Thu', value: 'jueves' },
    { label: 'Fri', value: 'viernes' }, { label: 'Sat', value: 'sabado' },
    { label: 'Sun', value: 'domingo' },
  ] as const;
  
// Placeholder for fetching/mocking detailed residence data including schedule
async function getResidenceScheduleDetails(id: string): Promise<Residencia | null> {
    console.log(`Fetching/mocking schedule details for residence ID: ${id}`);
    await new Promise(resolve => setTimeout(resolve, 1000));
    if (id === 'mock-guaymura-id') {
        return {
            id: 'mock-guaymura-id',
            nombre: 'Guaymura',
            mealRequestSubmissionTimes: { lunes: '09:15', martes: '09:15', miercoles: '09:15', jueves: '09:15', viernes: '09:15', sabado: '09:30', domingo: '10:00' },
            comedores: [{ id: 'comedor-1', residenciaId: 'mock-guaymura-id', nombre: 'Comedor Principal' }],
            tiemposComida: [
                // Add orden and diasDisponibles
                { id: 'tc-1', nombre: 'Almuerzo', residenciaId: 'mock-guaymura-id', orden: 1, diasDisponibles: ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'] },
                { id: 'tc-2', nombre: 'Cena', residenciaId: 'mock-guaymura-id', orden: 2, diasDisponibles: ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'domingo'] }
            ],
            alternativas: [
                // Remove diasDisponibles from here if it was present
                { id: 'alt-1', nombre: 'Almuerzo Estándar', tipo: 'comedor', tipoAcceso: 'abierto', ventanaInicio: '13:00', ventanaFin: '14:00', tiempoComidaId: 'tc-1', residenciaId: 'mock-guaymura-id', comedorId: 'comedor-1' },
                 { id: 'alt-2', nombre: 'Cena Normal', tipo: 'comedor', tipoAcceso: 'abierto', ventanaInicio: '20:00', ventanaFin: '21:00', tiempoComidaId: 'tc-2', residenciaId: 'mock-guaymura-id', comedorId: 'comedor-1' }
            ]
        };
    }
    return null;
}


export default function HorariosResidenciaPage() {
    const params = useParams();
    const residenciaId = params.residenciaId as string; // Get ID from route
    const { toast } = useToast();

    const [residencia, setResidencia] = useState<Residencia | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // State for managing TiemposComida (similar to old Step 2)
    const [tiemposComida, setTiemposComida] = useState<TiempoComida[]>([]);
    const [newTiempoComidaName, setNewTiempoComidaName] = useState('');
    const [newTiempoComidaDays, setNewTiempoComidaDays] = useState<Set<DayOfWeekKey>>(new Set()); // State for selected days

    // State for managing Alternativas (similar to old Step 3)
    const [alternativas, setAlternativas] = useState<AlternativaTiempoComida[]>([]);
    // ... add state for the new alternative form here later ...

    const [isSaving, setIsSaving] = useState(false);

    // Helper to display selected days
    const formatSelectedDays = (days: DayOfWeekKey[] | undefined): string => {
        if (!days || days.length === 0) return 'None';

        // Optional: Sort days according to daysOfWeek constant for consistent display
        const dayOrder = daysOfWeek.map(d => d.value);
        const sortedDays = days.slice().sort((a, b) => dayOrder.indexOf(a) - dayOrder.indexOf(b));

        // Optional: Format differently, e.g., using full names or abbreviations
        return sortedDays.map(day => day.charAt(0).toUpperCase() + day.slice(1)).join(', '); // Capitalize first letter
    }

    useEffect(() => {
        if (!residenciaId) {
            setError("Residence ID not found in URL.");
            setIsLoading(false);
            return;
        }

        const loadData = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const data = await getResidenceScheduleDetails(residenciaId);
                if (data) {
                    setResidencia(data);
                    // Initialize state with fetched/mocked data
                    setTiemposComida(data.tiemposComida || []);
                    setAlternativas(data.alternativas || []);
                } else {
                    setError(`Residence with ID "${residenciaId}" not found.`);
                    toast({ title: "Error", description: `Residence not found.`, variant: "destructive" });
                }
            } catch (err) {
                console.error("Error loading residence details:", err);
                const message = err instanceof Error ? err.message : "Unknown error";
                setError(`Failed to load residence details: ${message}`);
                toast({ title: "Error", description: "Could not load schedule data.", variant: "destructive" });
            } finally {
                setIsLoading(false);
            }
        };

        loadData();
    }, [residenciaId, toast]); // Depend on residenciaId and toast

    // --- Handlers for Tiempos Comida ---
    const handleDayToggle = (day: DayOfWeekKey) => {
        setNewTiempoComidaDays(prev => {
            const newSet = new Set(prev);
            if (newSet.has(day)) {
                newSet.delete(day);
            } else {
                newSet.add(day);
            }
            return newSet;
        });
    };

    const handleAddTiempoComida = () => {
        const trimmedName = newTiempoComidaName.trim();
        if (!trimmedName) {
            toast({ title: "Info", description: "Please enter a meal time name.", variant: "default" });
            return;
        }
        // Check for duplicates (case-insensitive) within the current list
        if (tiemposComida.some(tc => tc.nombre.toLowerCase() === trimmedName.toLowerCase())) {
            toast({ title: "Warning", description: `Meal time "${trimmedName}" already added.`, variant: "destructive" });
            return;
        }

        if (newTiempoComidaDays.size === 0) {
            toast({ title: "Info", description: "Please select at least one day for the meal time.", variant: "default" });
            return;
        }

        const nextOrder = tiemposComida.length > 0 ? Math.max(...tiemposComida.map(tc => tc.orden)) + 1 : 1;

        const newTiempoComida: TiempoComida = {
            id: `temp-${Date.now()}-${Math.random()}`,
            nombre: trimmedName,
            residenciaId: residenciaId,
            orden: nextOrder, // Assign next order number
            diasDisponibles: Array.from(newTiempoComidaDays), // Convert Set to Array
        };

        setTiemposComida(prev => [...prev, newTiempoComida].sort((a,b) => a.orden - b.orden)); // Add and keep sorted
        setNewTiempoComidaName(''); // Clear name input
        setNewTiempoComidaDays(new Set()); // Clear selected days
        toast({ title: "Success", description: `Added meal time: "${trimmedName}"` });
    };

    const handleRemoveTiempoComida = (idToRemove: string) => {
        const removedTiempo = tiemposComida.find(tc => tc.id === idToRemove);
        const remainingTiempos = tiemposComida.filter(tc => tc.id !== idToRemove);

        // Renumber remaining items (simple approach: reassign based on sorted position)
        const updatedTiempos = remainingTiempos
            .sort((a, b) => a.orden - b.orden) // Ensure sorted before renumbering
            .map((tc, index) => ({ ...tc, orden: index + 1 }));

        setTiemposComida(updatedTiempos);
        setAlternativas(prev => prev.filter(alt => alt.tiempoComidaId !== idToRemove));
        toast({ title: "Removed Locally", description: `Removed meal time "${removedTiempo?.nombre || ''}". Order updated. Save changes to make it permanent.` });
    };
    const handleMoveTiempo = (idToMove: string, direction: 'up' | 'down') => {
        const index = tiemposComida.findIndex(tc => tc.id === idToMove);
        if (index === -1) return;

        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= tiemposComida.length) return; // Cannot move outside bounds

        const items = [...tiemposComida];
        // Swap order numbers
        const currentOrder = items[index].orden;
        items[index].orden = items[targetIndex].orden;
        items[targetIndex].orden = currentOrder;

        // Sort by new order and update state
        setTiemposComida(items.sort((a, b) => a.orden - b.orden));
         toast({ title: "Order Updated Locally", description: `Moved "${items[targetIndex].nombre}". Save changes to make it permanent.` });
    };
    // --- Handlers for Alternativas (to be adapted from old Step 3) ---
    // ... Add handlers here later ...

    // --- Handler for Saving Schedule ---
    const handleSaveChanges = async () => {
        setIsSaving(true);
        console.log("Saving schedule changes for residence:", residenciaId);
        console.log("Tiempos Comida:", tiemposComida);
        console.log("Alternativas:", alternativas);
        // Simulate save
        await new Promise(resolve => setTimeout(resolve, 1500));
        // TODO: Implement actual Firestore update logic here
        toast({ title: "Success (Mock)", description: "Schedule changes saved successfully." });
        setIsSaving(false);
        // Optionally navigate back or refresh data
    };

    // --- Render Logic ---
    if (isLoading) {
        return (
            <div className="container mx-auto p-4 space-y-4">
                <Skeleton className="h-8 w-1/3" />
                <Skeleton className="h-6 w-1/4" />
                <Skeleton className="h-64 w-full" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="container mx-auto p-4">
                <h1 className="text-2xl font-bold text-destructive">Error</h1>
                <p>{error}</p>
                {/* Optionally add a button to go back */}
            </div>
        );
     }

    if (!residencia) {
         // This case should ideally be covered by the error state, but included for safety
         return <div className="container mx-auto p-4"><p>Residence not found.</p></div>;
    }

    return (
        <div className="container mx-auto p-4 space-y-6">
            <h1 className="text-2xl font-bold">Manage Schedule (Horarios)</h1>
            <p className="text-muted-foreground">
                Configuring meal times and alternatives for: <span className="font-medium text-primary">{residencia.nombre}</span> (ID: {residenciaId})
            </p>

            {/* Section for Tiempos Comida */}
            <Card>
                <CardHeader>
                    <CardTitle>Meal Times (Tiempos de Comida)</CardTitle>
                    <CardDescription>Define the general meal periods, their order, and weekly availability.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                     {/* --- UPDATED UI for Adding Tiempo Comida --- */}
                     <div className="p-4 border rounded-md bg-muted/50 space-y-4">
                         <h4 className="font-medium">Add New Meal Time</h4>
                         {/* Name Input */}
                         <div className="space-y-1">
                             <Label htmlFor="new-tiempo-name">Name</Label>
                             <Input
                                id="new-tiempo-name"
                                placeholder="e.g., Breakfast, Late Snack"
                                value={newTiempoComidaName}
                                onChange={(e)=>setNewTiempoComidaName(e.target.value)}
                            />
                         </div>
                         {/* Days Available Checkboxes */}
                         <div className="space-y-1">
                              <Label>Available Days</Label>
                              <div className="flex flex-wrap gap-x-4 gap-y-2 pt-1">
                                 {daysOfWeek.map(day => (
                                     <div key={day.value} className="flex items-center space-x-2">
                                         <Checkbox
                                             id={`day-${day.value}`}
                                             checked={newTiempoComidaDays.has(day.value)}
                                             onCheckedChange={() => handleDayToggle(day.value)}
                                         />
                                         <Label htmlFor={`day-${day.value}`} className="font-normal text-sm">{day.label}</Label>
                                     </div>
                                 ))}
                              </div>
                         </div>
                         {/* Add Button */}
                         <div className="text-right">
                            <Button onClick={handleAddTiempoComida} size="sm">Add Meal Time</Button>
                         </div>
                     </div>
                     {/* --- END UPDATED UI --- */}


                     {/* --- UPDATED List of Added Meal Times --- */}
                     <div className="space-y-3 pt-4">
                        <Label>Configured Meal Times (Order Matters)</Label>
                        {tiemposComida.length > 0 ? (
                            <ul className="space-y-2">
                                {tiemposComida.map((tiempo, index) => (
                                    <li key={tiempo.id} className="flex items-center justify-between gap-2 p-3 border rounded-md bg-secondary/30">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-mono text-muted-foreground">({tiempo.orden})</span>
                                            <span className="font-medium">{tiempo.nombre}</span>
                                        </div>
                                        <div className='flex-1 px-4'>
                                             <span className="text-xs text-muted-foreground">Days: {formatSelectedDays(tiempo.diasDisponibles)}</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                             {/* Reorder Buttons */}
                                             <Button
                                                variant="ghost" size="icon" className="h-7 w-7"
                                                onClick={() => handleMoveTiempo(tiempo.id, 'up')}
                                                disabled={index === 0} // Disable up for first item
                                                aria-label={`Move ${tiempo.nombre} up`}
                                             >
                                                 <ArrowUp className="h-4 w-4" />
                                             </Button>
                                              <Button
                                                variant="ghost" size="icon" className="h-7 w-7"
                                                onClick={() => handleMoveTiempo(tiempo.id, 'down')}
                                                disabled={index === tiemposComida.length - 1} // Disable down for last item
                                                aria-label={`Move ${tiempo.nombre} down`}
                                             >
                                                 <ArrowDown className="h-4 w-4" />
                                             </Button>
                                            {/* Remove Button */}
                                            <Button
                                                variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                                                onClick={()=>handleRemoveTiempoComida(tiempo.id)}
                                                aria-label={`Remove ${tiempo.nombre}`}
                                            >
                                                <X className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                         ) : (
                             <p className="text-sm text-muted-foreground text-center pt-2">No meal times added yet.</p>
                         )}
                    </div>
                     {/* --- END UPDATED List --- */}

                </CardContent>
            </Card>

             {/* Section for Alternativas Comida */}
             {/* (Needs significant updates based on these TiempoComida changes later) */}
             <Card>
                 {/* ... Header ... */}
                <CardContent className="space-y-4">
                     <p className="text-muted-foreground">TODO: Update Meal Alternatives UI based on new Tiempo Comida structure...</p>
                     {/* Select TiempoComida (consider filtering by availability?), Form, List */}
                </CardContent>
            </Card>

             {/* Save Button */}
             {/* ... Save Button ... */}

        </div>
    );
}
