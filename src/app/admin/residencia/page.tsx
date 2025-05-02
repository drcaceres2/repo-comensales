// src/app/admin/residencia/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from '@/hooks/use-toast';
// Keep all models, as the list view might eventually show more details
import { Residencia, HorarioSolicitudComida, TiempoComida, AlternativaTiempoComida, Comedor } from '@/models/firestore';
import { X, PlusCircle } from 'lucide-react'; // Keep icons
import { useRouter } from 'next/navigation'; // <<< Import useRouter

// Define DayOfWeekKey directly here for the submission times form
type DayOfWeekKey = 'lunes' | 'martes' | 'miercoles' | 'jueves' | 'viernes' | 'sabado' | 'domingo';

const daysOfWeek: { label: string; value: DayOfWeekKey }[] = [
  { label: 'Monday', value: 'lunes' },
  { label: 'Tuesday', value: 'martes' },
  { label: 'Wednesday', value: 'miercoles' },
  { label: 'Thursday', value: 'jueves' },
  { label: 'Friday', value: 'viernes' },
  { label: 'Saturday', value: 'sabado' },
  { label: 'Sunday', value: 'domingo' },
] as const;


// --- MOCK DATA (Simplified Guaymura) ---
const mockGuaymuraResidence: Residencia = {
    id: 'res-guaymura',
    nombre: 'Guaymura',
    horariosSolicitudComida: [
      { id: 'lunes-horario', residenciaId: 'res-guaymura', nombre: 'lunes', horaLimite: '09:15', diasAntelacion: 0},
      { id: 'martes-horario', residenciaId: 'res-guaymura', nombre: 'martes', horaLimite: '09:15', diasAntelacion: 0},
      { id: 'miercoles-horario', residenciaId: 'res-guaymura', nombre: 'miercoles', horaLimite: '09:15', diasAntelacion: 0},
      { id: 'jueves-horario', residenciaId: 'res-guaymura', nombre: 'jueves', horaLimite: '09:15', diasAntelacion: 0},
      { id: 'viernes-horario', residenciaId: 'res-guaymura', nombre: 'viernes', horaLimite: '09:15', diasAntelacion: 0},
      { id: 'sabado-horario', residenciaId: 'res-guaymura', nombre: 'sabado', horaLimite: '09:30', diasAntelacion: 0},
      { id: 'domingo-horario', residenciaId: 'res-guaymura', nombre: 'domingo', horaLimite: '10:00', diasAntelacion: 0},
    ],
    // Example of associated Comedor data (just names for mock)
    comedores: [{ id: 'comedor-1', residenciaId: 'res-guaymura', nombre: 'Comedor Principal' }]
};
// --------------

export default function ResidenciaAdminPage() {
  const router = useRouter(); // <<< Get router instance
  const [isClient, setIsClient] = useState(false);
  const { toast } = useToast();

  // --- State for New Residence Form ---
  const [newResidenceName, setNewResidenceName] = useState('');
  // Keep this simple state for form inputs, convert on submission
  const [newSubmissionTimes, setNewSubmissionTimes] = useState<Partial<Record<DayOfWeekKey, string>>>({});
  const [newComedores, setNewComedores] = useState<string[]>([]); // List of comedor names
  const [currentComedorName, setCurrentComedorName] = useState(''); // Input for adding comedor
  const [isProcessing, setIsProcessing] = useState(false); // For submission lock

  // --- State for Existing Residences List ---
  const [residences, setResidences] = useState<Residencia[]>([]);
  const [isLoadingResidences, setIsLoadingResidences] = useState(true); // Start true
  const [errorResidences, setErrorResidences] = useState<string | null>(null);

  useEffect(() => {
    setIsClient(true);
    fetchResidences();
  }, []);

  // --- fetchResidences (using Mock Data) ---
  const fetchResidences = async () => {
    setIsLoadingResidences(true);
    setErrorResidences(null);
    console.log("Fetching mock residences...");
    await new Promise(resolve => setTimeout(resolve, 1000));
    try {
      const fetchedResidences: Residencia[] = [mockGuaymuraResidence];
      setResidences(fetchedResidences);
      console.log("Mock residences set:", fetchedResidences);
    } catch (error) {
      const errorMessage = `Failed to fetch residences. ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error("Error fetching residences: ", error);
      setErrorResidences(errorMessage);
      toast({ title: "Error", description: "Could not fetch residences.", variant: "destructive" });
    } finally {
      setIsLoadingResidences(false);
    }
  };

  // --- Handlers for New Residence Form ---
  // No change needed here, handles simple key-value state
  const handleTimeChange = (day: DayOfWeekKey, value: string) => {
      setNewSubmissionTimes(prev => ({ ...prev, [day]: value }));
  };

  const handleAddComedor = () => {
      const trimmedName = currentComedorName.trim();
      if (!trimmedName) return;
      if (newComedores.some(name => name.toLowerCase() === trimmedName.toLowerCase())) {
          toast({ title: "Warning", description: `Dining hall "${trimmedName}" already added.`, variant: "destructive"});
          return;
      }
      setNewComedores(prev => [...prev, trimmedName]);
      setCurrentComedorName(''); // Clear input
      toast({ title: "Success", description: `Added dining hall: "${trimmedName}"`});
  };

  const handleRemoveComedor = (nameToRemove: string) => {
      setNewComedores(prev => prev.filter(name => name !== nameToRemove));
      toast({ title: "Removed", description: `Removed dining hall: "${nameToRemove}"`});
  };

  // --- Create Residence Handler (Simulated) ---
  const handleCreateResidence = async () => {
    // Validation
    if (!newResidenceName.trim()) {
      toast({ title: "Error", description: "Residence name cannot be empty.", variant: "destructive" });
      return;
    }
    // Validate against the simple time string map
    const validTimes = Object.entries(newSubmissionTimes).filter(([_, time]) => time && /^\d{2}:\d{2}$/.test(time));
    if (validTimes.length === 0) {
        toast({ title: "Error", description: "Please set at least one valid meal request submission time (HH:MM).", variant: "destructive" });
        return;
    }
     if (newComedores.length === 0) {
         toast({ title: "Error", description: "Please add at least one dining hall.", variant: "destructive" });
         return;
     }

    setIsProcessing(true);
    console.log("Simulating BASIC residence creation...");
    console.log("Name:", newResidenceName);
    console.log("Submission Times (raw form state):", newSubmissionTimes); // Log raw state
    console.log("Comedores:", newComedores);

    await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate network delay

    try {
        const mockNewId = `mock-${newResidenceName.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;

        // *** MODIFIED: Convert simple state to HorarioSolicitudComida[] ***
        const finalHorarios: HorarioSolicitudComida[] = [];
        for (const day in newSubmissionTimes) {
            const timeString = newSubmissionTimes[day as DayOfWeekKey];
            if (timeString && /^\d{2}:\d{2}$/.test(timeString)) {
                 // For mock, use day name as ID prefix and nombre
                finalHorarios.push({
                    id: `${day}-horario-${Date.now()}`, // Mock ID
                    residenciaId: mockNewId,
                    nombre: day as DayOfWeekKey,
                    horaLimite: timeString,
                    diasAntelacion: 0 // Default to 0 for now
                });
            }
        }
        console.log("Constructed Horarios:", finalHorarios); // Log the constructed array

        // Create mock Comedor objects from names for the mock Residencia
        const mockComedores: Comedor[] = newComedores.map((name, index) => ({
            id: `mock-comedor-${index}-${Date.now()}`,
            nombre: name,
            residenciaId: mockNewId // Link back to the new mock residence
        }));

        const newMockResidence: Residencia = {
            id: mockNewId,
            nombre: newResidenceName.trim(),
            horariosSolicitudComida: finalHorarios, // *** Use the new structure ***
            comedores: mockComedores, // Add the list of mock comedores
            // tiemposComida and alternativas will be managed elsewhere
        };

        toast({ title: "Success (Mock)", description: `Basic Residence "${newResidenceName}" created successfully.` });

        // Add to local state for immediate UI update in the 'list' tab
        setResidences(prev => [...prev, newMockResidence]);

        // Reset form state
        setNewResidenceName('');
        setNewSubmissionTimes({}); // Reset the simple state
        setNewComedores([]);
        setCurrentComedorName('');

        console.log("Mock residence created:", newMockResidence);
        // Optionally switch to the 'list' tab after creation

    } catch (error) {
        const errorMessage = `Failed to create residence. ${error instanceof Error ? error.message : 'Unknown error'}`;
        console.error("Error creating residence: ", error);
        toast({ title: "Error", description: errorMessage, variant: "destructive" });
    } finally {
        setIsProcessing(false);
    }
  };

  // *** MODIFIED: Helper function to format submission times for display in the list ***
  const formatSubmissionTimes = (horarios: HorarioSolicitudComida[] | undefined): string => {
    if (!horarios || horarios.length === 0) return 'Not set';

    // Create a map for easy lookup: DayOfWeekKey -> horaLimite
    const timesMap = new Map<DayOfWeekKey, string>();
    horarios.forEach(h => {
        // Ensure nombre is a valid DayOfWeekKey before adding to map
        if (daysOfWeek.some(dayInfo => dayInfo.value === h.nombre)) {
             timesMap.set(h.nombre as DayOfWeekKey, h.horaLimite);
        }
    });

    const orderedDays = daysOfWeek.map(d => d.value); // Get days in order

    return orderedDays
        .filter(day => timesMap.has(day)) // Check if a time is set for this day in the map
        .map(day => `${day.charAt(0).toUpperCase() + day.slice(1)}: ${timesMap.get(day)}`) // Format string
        .join(', ');
  };

  // Helper function to format comedor names for display in the list
  const formatComedores = (comedores: Comedor[] | undefined): string => {
      if (!comedores || comedores.length === 0) return 'None';
      return comedores.map(c => c.nombre).join(', ');
  }

  // --- Render Logic ---
  return (
     <div className="container mx-auto p-4 space-y-6">
       <h1 className="text-2xl font-bold">Manage Residences</h1>
       <Tabs defaultValue="list" className="w-full"> {/* Default to list */}
         <TabsList>
           <TabsTrigger value="create">Create New Residence</TabsTrigger>
           <TabsTrigger value="list">Existing Residences</TabsTrigger>
         </TabsList>

         {/* --- CREATE TAB (Simplified) --- */}
         <TabsContent value="create">
           <Card>
             <CardHeader>
               <CardTitle>Create New Residence</CardTitle>
               <CardDescription>Enter the basic details for the new residence.</CardDescription>
             </CardHeader>
             <CardContent className="space-y-6">
                {!isClient ? ( <Skeleton className="h-64 w-full" /> ) : (
                <>
                  {/* Residence Name */}
                  <div className="space-y-2">
                    <Label htmlFor="residence-name">Residence Name</Label>
                    <Input
                      id="residence-name"
                      placeholder="e.g., Residencia Central"
                      value={newResidenceName}
                      onChange={(e) => setNewResidenceName(e.target.value)}
                      disabled={isProcessing}
                    />
                  </div>

                  {/* Meal Request Submission Times (Inputs remain the same) */}
                  <div className="space-y-2">
                    <Label>Meal Request Submission Times</Label>
                    <CardDescription>Set the deadline time (HH:MM) for each day.</CardDescription>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {daysOfWeek.map(day => (
                        <div key={day.value} className="grid gap-2">
                          <Label htmlFor={`time-${day.value}`}>{day.label}</Label>
                          <Input
                            id={`time-${day.value}`}
                            type="time"
                            // Bind to the simple state structure
                            value={newSubmissionTimes[day.value] || ''}
                            onChange={(e) => handleTimeChange(day.value, e.target.value)}
                            disabled={isProcessing}
                            step="900" // 15 minutes
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Dining Halls (Comedores) */}
                  <div className="space-y-4">
                    <Label>Dining Halls (Comedores)</Label>
                    <CardDescription>Add the names of the dining halls available at this residence.</CardDescription>
                    {/* Input to add new */}
                    <div className="flex items-center space-x-2">
                        <div className="grid flex-1 gap-2">
                            <Label htmlFor="new-comedor-name" className="sr-only">New Dining Hall Name</Label>
                            <Input
                                id="new-comedor-name"
                                placeholder="e.g., Comedor Principal"
                                value={currentComedorName}
                                onChange={(e) => setCurrentComedorName(e.target.value)}
                                disabled={isProcessing}
                            />
                        </div>
                        <Button type="button" size="sm" onClick={handleAddComedor} disabled={isProcessing || !currentComedorName.trim()}>
                            <PlusCircle className="mr-2 h-4 w-4" /> Add Hall
                        </Button>
                    </div>
                    {/* List of added halls */}
                    {newComedores.length > 0 && (
                        <div className="space-y-2 pt-2">
                             <Label className="text-xs font-medium text-muted-foreground">Added Halls:</Label>
                             <ul className="space-y-1">
                                 {newComedores.map((name) => (
                                     <li key={name} className="flex items-center justify-between p-1.5 border rounded-md bg-secondary/30 text-sm">
                                         <span>{name}</span>
                                         <Button
                                             variant="ghost"
                                             size="icon"
                                             className="h-5 w-5"
                                             onClick={() => handleRemoveComedor(name)}
                                             disabled={isProcessing}
                                             aria-label={`Remove ${name}`}
                                         >
                                             <X className="h-3 w-3" />
                                         </Button>
                                     </li>
                                 ))}
                             </ul>
                        </div>
                    )}
                  </div>

                  {/* Submit Button */}
                  <div className="pt-4">
                      <Button onClick={handleCreateResidence} disabled={isProcessing}>
                        {isProcessing ? 'Creating...' : 'Create Basic Residence'}
                      </Button>
                  </div>
                </>
                )}
             </CardContent>
           </Card>
         </TabsContent>

         {/* --- LIST TAB --- */}
         <TabsContent value="list">
            <Card>
                <CardHeader>
                  <CardTitle>Existing Residences</CardTitle>
                  <CardDescription>View existing residences and manage their meal schedules.</CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoadingResidences ? (
                    <div className="space-y-2">
                        <Skeleton className="h-10 w-full" />
                        <Skeleton className="h-10 w-full" />
                    </div>
                  ) : errorResidences ? (
                    <p className="text-red-600">{errorResidences}</p>
                  ) : !residences || residences.length === 0 ? (
                    <p>No residences found. Create one using the 'Create New Residence' tab.</p>
                  ) : (
                    <ul className="space-y-3">
                      {residences.map((res) => (
                        <li key={res.id} className="border p-4 rounded-md shadow-sm space-y-2">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="font-semibold text-lg">{res.nombre}</p>
                                    <p className="text-sm text-muted-foreground">ID: {res.id}</p>
                                </div>
                                {/* --- UPDATED Button --- */}
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => router.push(`/admin/residencia/${res.id}/horarios`)} // <<< Use router.push
                                >
                                    Manage Schedule
                                </Button>
                                {/* --- END UPDATED Button --- */}
                            </div>
                            {/* *** MODIFIED: Call formatSubmissionTimes with the correct field *** */}
                            <p className="text-sm"><span className="font-medium">Submission Times:</span> {formatSubmissionTimes(res.horariosSolicitudComida)}</p>
                            <p className="text-sm"><span className="font-medium">Dining Halls:</span> {formatComedores(res.comedores)}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
            </Card>
         </TabsContent>
       </Tabs>
     </div>
   );
}
