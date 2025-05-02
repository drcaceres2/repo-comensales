'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox"; // For isActive toggle maybe
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Dieta, ResidenciaId } from '@/models/firestore'; // Ensure Dieta type is imported
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"; // For delete confirmation
import { Skeleton } from '@/components/ui/skeleton'; // For loading state

// --- MOCK DATA DEFINITIONS ---

// Sample Dietas for 'res-guaymura'
const mockDietasGuaymura: Dieta[] = [
    { id: 'dieta-std-g', residenciaId: 'res-guaymura', nombre: 'Standard', descripcion: 'Dieta normal sin restricciones especiales.', isDefault: true, isActive: true },
    { id: 'dieta-celi-g', residenciaId: 'res-guaymura', nombre: 'Sin Gluten (Celíaco)', descripcion: 'Excluye TACC (Trigo, Avena, Cebada, Centeno).', isDefault: false, isActive: true },
    { id: 'dieta-veggie-g', residenciaId: 'res-guaymura', nombre: 'Vegetariana', descripcion: 'Excluye carnes y pescados.', isDefault: false, isActive: true },
    { id: 'dieta-vegan-g', residenciaId: 'res-guaymura', nombre: 'Vegana', descripcion: 'Excluye todos los productos de origen animal (incluye lácteos, huevos, miel).', isDefault: false, isActive: false }, // Example inactive
];

// --- END MOCK DATA ---

export default function DietasResidenciaPage() {
    const params = useParams();
    const residenciaId = params.residenciaId as ResidenciaId; // Get residenciaId from URL
    const { toast } = useToast();

    const [dietas, setDietas] = useState<Dieta[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [residenciaNombre, setResidenciaNombre] = useState<string>('Residencia'); // Store residence name

    // State for managing forms (to be added later)
    const [isAdding, setIsAdding] = useState(false);
    const [editingDietaId, setEditingDietaId] = useState<string | null>(null);
    const [formData, setFormData] = useState<Partial<Dieta>>({});
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        setIsLoading(true);
        setError(null);
        console.log(`Fetching dietas for residenciaId: ${residenciaId}`);

        // Simulate fetching data
        const timer = setTimeout(() => {
            // In a real app, fetch Residencia details and its associated Dietas
            if (residenciaId === 'res-guaymura') { // Use mock data for specific ID
                setDietas(mockDietasGuaymura);
                setResidenciaNombre('Residencia Guaymura'); // Set mock name
                setIsLoading(false);
                console.log("Mock dietas loaded:", mockDietasGuaymura);
            } else {
                // Simulate not found for other IDs
                setError(`No se encontraron dietas para la residencia con ID: ${residenciaId}. (Simulado)`);
                setResidenciaNombre(`Residencia (${residenciaId})`); // Show ID if name not found
                setDietas([]);
                setIsLoading(false);
                console.error("Mock dietas NOT found for ID:", residenciaId);
            }
        }, 500); // Simulate network delay

        return () => clearTimeout(timer); // Cleanup timer on unmount

    }, [residenciaId]); // Re-run effect if residenciaId changes

    // --- Handlers ---

    // Opens the "Add" form
    const handleOpenAddDietaForm = () => {
        setIsAdding(true);
        setEditingDietaId(null); // Ensure edit mode is off
        setFormData({}); // Reset form data for a new entry
        console.log("Opening Add Dieta form");
    };

    // Closes the "Add" or "Edit" form
    const handleCancelDietaForm = () => {
        setIsAdding(false);
        setEditingDietaId(null);
        setFormData({});
        console.log("Closing Add/Edit Dieta form");
    };

    // Handles changes in the Add/Edit form inputs
    const handleDietaFormChange = (field: keyof Dieta, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    // Handles submission of the "Add" form
    const handleAddDieta = async () => {
        // Basic Validation
        if (!formData.nombre?.trim()) {
            toast({ title: "Error", description: "El nombre de la dieta es requerido.", variant: "destructive" });
            return;
        }
        // Check for duplicate name (case-insensitive)
        if (dietas.some(d => d.nombre.toLowerCase() === formData.nombre!.trim().toLowerCase())) {
             toast({ title: "Error", description: "Ya existe una dieta con ese nombre.", variant: "destructive" });
             return;
        }

        setIsSaving(true);

        const nuevaDieta: Dieta = {
            id: `dieta-${Date.now()}`, // Mock ID
            residenciaId: residenciaId,
            nombre: formData.nombre.trim(),
            descripcion: formData.descripcion?.trim() || '', // Ensure description is empty string if blank
            isDefault: false, // New diets are not default
            isActive: true,   // New diets are active
        };

        console.log("Simulating add Dieta:", nuevaDieta);
        await new Promise(resolve => setTimeout(resolve, 500)); // Simulate delay

        setDietas(prev => [...prev, nuevaDieta]); // Add to state

        setIsSaving(false);
        handleCancelDietaForm(); // Close form
        toast({ title: "Éxito", description: `Dieta \"${nuevaDieta.nombre}\" añadida (simulado).` });
    };

    // Opens the "Edit" form for a specific Dieta
    const handleEditDieta = (dieta: Dieta) => {
        setEditingDietaId(dieta.id);
        setIsAdding(false); // Ensure add mode is off
        setFormData({ ...dieta }); // Pre-fill form with existing data
        console.log("Opening Edit Dieta form for:", dieta.id);
    };

    // Handles submission of the "Edit" form
    const handleSaveDieta = async () => {
        if (!editingDietaId) return; // Should not happen

        // Basic Validation
        if (!formData.nombre?.trim()) {
            toast({ title: "Error", description: "El nombre de la dieta es requerido.", variant: "destructive" });
            return;
        }
        // Check for duplicate name (case-insensitive), excluding the item being edited
        if (dietas.some(d =>
                d.id !== editingDietaId && // Exclude self
                d.nombre.toLowerCase() === formData.nombre!.trim().toLowerCase()
            )) {
            toast({ title: "Error", description: "Ya existe OTRA dieta con ese nombre.", variant: "destructive" });
            return;
        }

        setIsSaving(true);

        // Construct the updated object
        const updatedDieta: Dieta = {
            // Keep original IDs and unchanged properties
            id: editingDietaId,
            residenciaId: residenciaId, // Assuming this doesn't change
            isDefault: formData.isDefault ?? false, // Preserve default status (we'll handle changing it separately)
            isActive: formData.isActive ?? true,   // Preserve active status (we'll handle changing it separately)
            // Update editable fields
            nombre: formData.nombre.trim(),
            descripcion: formData.descripcion?.trim() || '',
        };

        console.log("Simulating save Dieta:", updatedDieta);
        await new Promise(resolve => setTimeout(resolve, 500)); // Simulate delay

        // Update state
        setDietas(prev => prev.map(d => d.id === editingDietaId ? updatedDieta : d));

        setIsSaving(false);
        handleCancelDietaForm(); // Close form
        toast({ title: "Éxito", description: `Dieta \"${updatedDieta.nombre}\" actualizada (simulado).` });
    };

    // Toggles the isActive status for a Dieta
    const handleToggleActive = async (id: string, currentStatus: boolean) => {
        const dietaToToggle = dietas.find(d => d.id === id);

        // Prevent deactivating the default diet
        if (currentStatus && dietaToToggle?.isDefault) {
            toast({
                title: "Acción no permitida",
                description: "No se puede desactivar la dieta marcada como Default.",
                variant: "destructive"
            });
            return;
        }

        // Simulate saving state change (in real app, update Firestore)
        console.log(`Simulating ${!currentStatus ? 'activation' : 'deactivation'} for Dieta ID: ${id}`);
        // Optional: Add temporary loading state if needed
        // await new Promise(resolve => setTimeout(resolve, 300));

        // Update state
        setDietas(prev =>
            prev.map(d =>
                d.id === id ? { ...d, isActive: !currentStatus } : d
            )
        );

        toast({
            title: !currentStatus ? "Activada" : "Desactivada",
            description: `La dieta \"${dietaToToggle?.nombre || id}\" ha sido ${!currentStatus ? 'activada' : 'desactivada'} (simulado).`
        });
    };

    // Sets a specific Dieta as the default for the residence
    const handleSetDefault = async (idToSetDefault: string) => {
        const targetDieta = dietas.find(d => d.id === idToSetDefault);

        // Don't proceed if the target dieta is not found, already default, or inactive
        if (!targetDieta) {
            console.error("Target dieta not found for ID:", idToSetDefault);
            toast({ title: "Error", description: "No se encontró la dieta seleccionada.", variant: "destructive" });
            return;
        }
        if (targetDieta.isDefault) {
            toast({ title: "Información", description: "Esta dieta ya es la Default.", variant: "default" });
            return; // Already default
        }
        if (!targetDieta.isActive) {
            toast({ title: "Error", description: "No se puede marcar una dieta inactiva como Default.", variant: "destructive" });
            return; // Cannot set inactive as default
        }

        console.log(`Setting Dieta ID ${idToSetDefault} as default...`);
        // Optional: Add loading state specific to this action if needed

        // Simulate update (in real app, update both documents in Firestore transactionally)
        // await new Promise(resolve => setTimeout(resolve, 300));

        // Update state: unset old default, set new default
        setDietas(prevDietas =>
            prevDietas.map(d => {
                if (d.id === idToSetDefault) {
                    return { ...d, isDefault: true }; // Set the new default
                } else if (d.isDefault) {
                    return { ...d, isDefault: false }; // Unset the old default
                } else {
                    return d; // Keep others unchanged
                }
            })
        );

        toast({
            title: "Éxito",
            description: `Dieta \"${targetDieta.nombre}\" marcada como Default (simulado).`
        });
    };

    // Deletes a Dieta
    const handleDeleteDieta = async (id: string) => {
        const dietaToDelete = dietas.find(d => d.id === id);

        if (!dietaToDelete) {
            toast({ title: "Error", description: "Dieta no encontrada.", variant: "destructive" });
            return;
        }

        // Prevent deleting the default diet
        if (dietaToDelete.isDefault) {
            toast({
                title: "Acción no permitida",
                description: "No se puede eliminar la dieta marcada como Default. Cambie la dieta Default antes de eliminar esta.",
                variant: "destructive"
            });
            return;
        }

        // Optional: Add confirmation dialog here

        console.log(`Deleting Dieta ID ${id}...`);
        // Simulate API call
        // await new Promise(resolve => setTimeout(resolve, 300));

        // Update state
        setDietas(prevDietas => prevDietas.filter(d => d.id !== id));

        toast({
            title: "Éxito",
            description: `Dieta "${dietaToDelete.nombre}" eliminada (simulado).`
        });
    };

    // --- Render Logic ---
    if (isLoading) {
        return (
            <div className="container mx-auto p-4 space-y-4">
                <h1 className="text-2xl font-bold">Gestionar Dietas para {residenciaNombre}</h1>
                <Card>
                    <CardHeader>
                        <CardTitle>Dietas Disponibles</CardTitle>
                        <CardDescription>Cargando dietas...</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <Skeleton className="h-10 w-full" />
                        <Skeleton className="h-10 w-full" />
                        <Skeleton className="h-10 w-full" />
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (error) {
        return <div className="container mx-auto p-4 text-red-600">Error: {error}</div>;
    }

    return (
        <div className="container mx-auto p-4 space-y-6">
            <h1 className="text-2xl font-bold">Gestionar Dietas para {residenciaNombre}</h1>

            {/* Section to List/Manage Dietas */}
            <Card>
                <CardHeader>
                    <CardTitle>Dietas Disponibles</CardTitle>
                    <CardDescription>
                        Define las dietas especiales disponibles en esta residencia. Recuerda marcar una como 'Default'.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {/* List Existing Dietas (Basic Structure) */}
                    <div className="space-y-3">
                        {dietas.map(dieta => (
                            <div key={dieta.id} className={`p-3 border rounded flex justify-between items-center ${!dieta.isActive ? 'bg-gray-100 opacity-70' : 'hover:bg-gray-50'}`}>
                                <div>
                                    <span className="font-semibold">{dieta.nombre}</span>
                                    {dieta.isDefault && <span className="ml-2 text-xs font-bold text-green-700">(Default)</span>}
                                    {!dieta.isActive && <span className="ml-2 text-xs font-semibold text-red-700">(Inactiva)</span>}
                                    {dieta.descripcion && <p className="text-sm text-muted-foreground">{dieta.descripcion}</p>}
                                </div>
                                <div className="space-x-2 flex-shrink-0">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        // REMOVE disabled prop
                                        onClick={() => handleEditDieta(dieta)} // ADD onClick
                                        disabled={isAdding || !!editingDietaId || isSaving} // ADD disable logic
                                    >
                                        Editar
                                    </Button>
                                    <Button
                                        variant={dieta.isActive ? "destructive" : "secondary"} // Change variant based on action
                                        size="sm"
                                        onClick={() => handleToggleActive(dieta.id, dieta.isActive)} // ADD onClick
                                        disabled={isAdding || !!editingDietaId || isSaving || (dieta.isActive && !!dieta.isDefault)} // Add disable logic (cannot deactivate default)
                                        // REMOVE existing disabled prop if present
                                    >
                                        {dieta.isActive ? 'Desactivar' : 'Activar'}
                                    </Button>
                                    {/* Conditionally render the button only if NOT already default */}
                                    {!dieta.isDefault && (
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            onClick={() => handleSetDefault(dieta.id)}
                                            disabled={isAdding || !!editingDietaId || isSaving || !dieta.isActive}
                                        >
                                            Marcar Default
                                        </Button>
                                    )}
                                    {/* --- Delete Button --- */}
                                    <Button
                                        variant="destructive"
                                        size="sm"
                                        onClick={() => handleDeleteDieta(dieta.id)} // Link to handler
                                        disabled={isAdding || !!editingDietaId || isSaving || dieta.isDefault} // Disable if busy or if it's default
                                    >
                                        Eliminar
                                    </Button>
                                </div>
                            </div>
                        ))}
                        {dietas.length === 0 && (
                            <p className="text-muted-foreground">No hay dietas definidas para esta residencia.</p>
                        )}
                    </div>

                    {/* Add New Dieta Button */}
                    <div className="mt-6 pt-4 border-t">
                        <Button
                            onClick={handleOpenAddDietaForm} // ADD onClick
                            disabled={isAdding || !!editingDietaId || isSaving} // Disable if form open or saving
                        >
                            + Añadir Nueva Dieta
                        </Button>
                    </div>

                    {/* Add/Edit Form Area */}
                    {(isAdding || !!editingDietaId) && ( // Render if adding OR editing
                        <DietaForm
                            formData={formData}
                            onFormChange={handleDietaFormChange}
                            onSubmit={isAdding ? handleAddDieta : handleSaveDieta} // Use correct submit handler
                            onCancel={handleCancelDietaForm}
                            isSaving={isSaving}
                            formTitle={isAdding ? "Añadir Nueva Dieta" : "Editar Dieta"} // Dynamic title
                            submitButtonText={isAdding ? "Añadir Dieta" : "Guardar Cambios"} // Dynamic button text
                        />
                    )}

                </CardContent>
            </Card>
        </div>
    );
}

import { Textarea } from "@/components/ui/textarea"; // Import Textarea

interface DietaFormProps {
    formData: Partial<Dieta>;
    onFormChange: (field: keyof Dieta, value: any) => void;
    onSubmit: () => Promise<void>;
    onCancel: () => void;
    isSaving: boolean;
    formTitle: string;
    submitButtonText: string;
}

function DietaForm({
    formData,
    onFormChange,
    onSubmit,
    onCancel,
    isSaving,
    formTitle,
    submitButtonText
}: DietaFormProps) {
    return (
        <div className="mt-4 p-4 border rounded bg-gray-50/50 space-y-4"> {/* Subtle bg */}
            <h3 className="font-semibold text-lg border-b pb-2 mb-4">{formTitle}</h3>
            {/* Nombre */}
            <div>
                <Label htmlFor="dieta-nombre">Nombre</Label>
                <Input
                    id="dieta-nombre"
                    value={formData.nombre || ''}
                    onChange={(e) => onFormChange('nombre', e.target.value)}
                    placeholder="Ej. Sin Gluten, Vegetariana"
                    disabled={isSaving}
                    maxLength={50} // Add reasonable max length
                />
                 <p className="text-xs text-muted-foreground mt-1">Nombre corto y descriptivo (máx 50 caract.)</p>
            </div>

            {/* Descripción */}
            <div>
                <Label htmlFor="dieta-descripcion">Descripción (Opcional)</Label>
                <Textarea
                    id="dieta-descripcion"
                    value={formData.descripcion || ''}
                    onChange={(e) => onFormChange('descripcion', e.target.value)}
                    placeholder="Breve descripción de la dieta..."
                    disabled={isSaving}
                    rows={3}
                    maxLength={200} // Add reasonable max length
                />
                <p className="text-xs text-muted-foreground mt-1">Detalles sobre la dieta (máx 200 caract.)</p>
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
