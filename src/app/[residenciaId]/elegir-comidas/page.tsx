'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Menu, Sun, Moon, Palette, Home } from 'lucide-react'; // Assuming lucide-react icons
import { Separator } from '@/components/ui/separator'; // For visual separation

// Import necessary types (assuming they exist after our previous step)
import { ResidenciaId, UserId, ModoEleccionUsuario } from '@/models/firestore';
import { Timestamp } from 'firebase/firestore';

import { DayOfWeekKey, TiempoComida, AlternativaTiempoComida, Semanario, SemanarioAlternativaSeleccion } from '@/models/firestore'; // Import necessary types

import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar"; // Assuming shadcn calendar
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"; // For DatePicker
import { Calendar as CalendarIcon, Trash2 } from "lucide-react"; // Icons
import { format } from "date-fns"; // For formatting dates
import { es } from 'date-fns/locale'; // For Spanish date format
import { Ausencia, AusenciaId, TiempoComidaId, AlternativaTiempoComidaId } from '@/models/firestore'; // Import Ausencia types

import { Eleccion, ExcepcionId } from '@/models/firestore'; // Import Eleccion types
import { PlusCircle } from 'lucide-react'; // Icon for add button

import { Textarea } from "@/components/ui/textarea";

// --- Mock Data ---
interface MockUser {
    id: UserId;
    nombre: string;
    roles: ('residente' | 'director' | 'admin')[];
    modoEleccion: ModoEleccionUsuario;
}

interface MockResident {
    id: UserId;
    nombre: string;
    modoEleccion: ModoEleccionUsuario; // Include mode for the dropdown display
}

interface MockResidencia {
    id: ResidenciaId;
    nombre: string;
    logoUrl?: string; // Optional logo URL
}

// Simulate fetching the current logged-in user
const MOCK_CURRENT_USER_RESIDENT: MockUser = {
    id: 'user-resident-123',
    nombre: 'Juan Pérez (Residente)',
    roles: ['residente'],
    modoEleccion: 'normal',
};

const MOCK_CURRENT_USER_DIRECTOR: MockUser = {
    id: 'user-director-456',
    nombre: 'Ana García (Director)',
    roles: ['director'],
    modoEleccion: 'normal',
};

// Simulate fetching the residence details
const MOCK_RESIDENCIA: MockResidencia = {
    id: 'residencia-abc',
    nombre: 'Residencia Universitaria Central',
    logoUrl: undefined, // Placeholder
};
// --- End Mock Data ---

// Simulate fetching other residents for the director's dropdown
const MOCK_OTHER_RESIDENTS: MockResident[] = [
     { id: 'user-resident-123', nombre: 'Juan Pérez', modoEleccion: 'normal'},
     { id: 'user-resident-789', nombre: 'Maria López', modoEleccion: 'diario'},
     { id: 'user-resident-000', nombre: 'Carlos Sánchez', modoEleccion: 'suspendido'},
];

// --- Refactored Mock Data for Tiempos, Alternativas, Horarios, Comedores ---
import { Comedor, HorarioSolicitudComida, TipoAccesoAlternativa } from '@/models/firestore'; // Import necessary types

// Minimal mock Horarios Solicitud (needed for Alternativas)
const MOCK_HORARIOS_SOLICITUD: HorarioSolicitudComida[] = [
    { id: 'hsc-mock-1', residenciaId: MOCK_RESIDENCIA.id, nombre: 'Mismo Día', horaLimite: '10:00', diasAntelacion: 0 },
    { id: 'hsc-mock-2', residenciaId: MOCK_RESIDENCIA.id, nombre: 'Día Anterior', horaLimite: '20:00', diasAntelacion: 1 },
];

// Minimal mock Comedores (needed for Alternativas tipo 'comedor')
const MOCK_COMEDORES: Comedor[] = [
    { id: 'com-mock-1', residenciaId: MOCK_RESIDENCIA.id, nombre: 'Comedor Principal' },
];

// Updated MOCK_TIEMPOS_COMIDA (flat structure, no nested alternativas)
const MOCK_TIEMPOS_COMIDA: TiempoComida[] = [
    // Added residenciaId, ordenGrupo, diasDisponibles. Removed nested alternativas.
    { id: 'tc-des', residenciaId: MOCK_RESIDENCIA.id, nombre: 'Desayuno', nombreGrupo: 'Desayuno', ordenGrupo: 1, diasDisponibles: ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'] },
    { id: 'tc-alm', residenciaId: MOCK_RESIDENCIA.id, nombre: 'Almuerzo Principal', nombreGrupo: 'Almuerzo', ordenGrupo: 2, diasDisponibles: ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'] },
    { id: 'tc-alm-postre', residenciaId: MOCK_RESIDENCIA.id, nombre: 'Postre Almuerzo', nombreGrupo: 'Almuerzo', ordenGrupo: 3, diasDisponibles: ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'] }, // Postre only weekdays example
    { id: 'tc-cen', residenciaId: MOCK_RESIDENCIA.id, nombre: 'Cena', nombreGrupo: 'Cena', ordenGrupo: 4, diasDisponibles: ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'] },
];

// New MOCK_ALTERNATIVAS (flat structure, linked by tiempoComidaId)
const MOCK_ALTERNATIVAS: AlternativaTiempoComida[] = [
    // Added residenciaId, tiempoComidaId, tipo, isActive, ventanaInicio/Fin, horarioSolicitudComidaId etc.
    // --- Desayuno Alternatives ---
    { id: 'alt-des-cafe', residenciaId: MOCK_RESIDENCIA.id, tiempoComidaId: 'tc-des', nombre: 'Café y Tostadas', tipo: 'comedor', tipoAcceso: 'abierto', requiereAprobacion: false, isActive: true, ventanaInicio: '07:30', ventanaFin: '09:00', horarioSolicitudComidaId: 'hsc-mock-1', comedorId: 'com-mock-1' },
    { id: 'alt-des-zumo', residenciaId: MOCK_RESIDENCIA.id, tiempoComidaId: 'tc-des', nombre: 'Zumo y Bollería', tipo: 'comedor', tipoAcceso: 'abierto', requiereAprobacion: false, isActive: true, ventanaInicio: '07:30', ventanaFin: '09:00', horarioSolicitudComidaId: 'hsc-mock-1', comedorId: 'com-mock-1' },
    // --- Almuerzo Principal Alternatives ---
    { id: 'alt-alm-basal', residenciaId: MOCK_RESIDENCIA.id, tiempoComidaId: 'tc-alm', nombre: 'Menú Basal', tipo: 'comedor', tipoAcceso: 'abierto', requiereAprobacion: false, isActive: true, ventanaInicio: '13:00', ventanaFin: '14:30', horarioSolicitudComidaId: 'hsc-mock-1', comedorId: 'com-mock-1' },
    { id: 'alt-alm-veg', residenciaId: MOCK_RESIDENCIA.id, tiempoComidaId: 'tc-alm', nombre: 'Opción Vegetariana', tipo: 'comedor', tipoAcceso: 'abierto', requiereAprobacion: false, isActive: true, ventanaInicio: '13:00', ventanaFin: '14:30', horarioSolicitudComidaId: 'hsc-mock-1', comedorId: 'com-mock-1' },
    { id: 'alt-alm-dieta', residenciaId: MOCK_RESIDENCIA.id, tiempoComidaId: 'tc-alm', nombre: 'Dieta Especial (Solicitar)', tipo: 'comedor', tipoAcceso: 'autorizado' as TipoAccesoAlternativa, requiereAprobacion: true, isActive: true, ventanaInicio: '13:00', ventanaFin: '14:30', horarioSolicitudComidaId: 'hsc-mock-2', comedorId: 'com-mock-1' }, // Requires approval, different schedule
    // --- Postre Almuerzo Alternatives ---
    { id: 'alt-pos-fruta', residenciaId: MOCK_RESIDENCIA.id, tiempoComidaId: 'tc-alm-postre', nombre: 'Fruta', tipo: 'comedor', tipoAcceso: 'abierto', requiereAprobacion: false, isActive: true, ventanaInicio: '13:00', ventanaFin: '14:30', horarioSolicitudComidaId: 'hsc-mock-1', comedorId: 'com-mock-1' },
    { id: 'alt-pos-lacteo', residenciaId: MOCK_RESIDENCIA.id, tiempoComidaId: 'tc-alm-postre', nombre: 'Lácteo', tipo: 'comedor', tipoAcceso: 'abierto', requiereAprobacion: false, isActive: true, ventanaInicio: '13:00', ventanaFin: '14:30', horarioSolicitudComidaId: 'hsc-mock-1', comedorId: 'com-mock-1' },
    // --- Cena Alternatives ---
    { id: 'alt-cen-ligero', residenciaId: MOCK_RESIDENCIA.id, tiempoComidaId: 'tc-cen', nombre: 'Menú Ligero', tipo: 'comedor', tipoAcceso: 'abierto', requiereAprobacion: false, isActive: true, ventanaInicio: '20:00', ventanaFin: '21:00', horarioSolicitudComidaId: 'hsc-mock-2', comedorId: 'com-mock-1' },
    { id: 'alt-cen-completo', residenciaId: MOCK_RESIDENCIA.id, tiempoComidaId: 'tc-cen', nombre: 'Menú Completo', tipo: 'comedor', tipoAcceso: 'abierto', requiereAprobacion: false, isActive: true, ventanaInicio: '20:00', ventanaFin: '21:00', horarioSolicitudComidaId: 'hsc-mock-2', comedorId: 'com-mock-1' },
    { id: 'alt-cen-dieta', residenciaId: MOCK_RESIDENCIA.id, tiempoComidaId: 'tc-cen', nombre: 'Dieta Especial Cena (Solicitar)', tipo: 'comedor', tipoAcceso: 'autorizado' as TipoAccesoAlternativa, requiereAprobacion: true, isActive: true, ventanaInicio: '20:00', ventanaFin: '21:00', horarioSolicitudComidaId: 'hsc-mock-2', comedorId: 'com-mock-1' }, // Requires approval
];

// Example Mock Semanario data for the currently viewed user (Structure remains the same)
const MOCK_SEMANARIO_USER: Semanario = {
    userId: 'user-resident-123', // Corresponds to Juan Pérez
    residenciaId: MOCK_RESIDENCIA.id,
    elecciones: {
        lunes: {
            'tc-des': { alternativaId: 'alt-des-cafe', requiereAprobacion: false },
            'tc-alm': { alternativaId: 'alt-alm-basal', requiereAprobacion: false },
            'tc-alm-postre': { alternativaId: 'alt-pos-fruta', requiereAprobacion: false },
            'tc-cen': { alternativaId: 'alt-cen-ligero', requiereAprobacion: false },
        },
        martes: {
            'tc-des': { alternativaId: 'alt-des-zumo', requiereAprobacion: false },
            'tc-alm': { alternativaId: 'alt-alm-veg', requiereAprobacion: false },
            'tc-alm-postre': { alternativaId: 'alt-pos-lacteo', requiereAprobacion: false },
            'tc-cen': { alternativaId: 'alt-cen-dieta', requiereAprobacion: true, alternativaContingenciaId: 'alt-cen-ligero' }, // Example requiring approval
        },
        // ... (add more days/tiempos as needed for testing)
        viernes: {
             'tc-alm': { alternativaId: 'alt-alm-dieta', requiereAprobacion: true, alternativaContingenciaId: 'alt-alm-basal' },
             'tc-cen': { alternativaId: 'alt-cen-completo', requiereAprobacion: false },
        }
    },
    ultimaActualizacion: Timestamp.now(), // Use Firestore Timestamp for mock
};

const DAYS_OF_WEEK: DayOfWeekKey[] = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
// --- End Refactored Mock Data ---

// --- Mock Data for Ausencias (Structure remains the same) ---
const MOCK_AUSENCIAS: Ausencia[] = [
  {
      id: 'aus-001',
      userId: 'user-resident-123',
      residenciaId: MOCK_RESIDENCIA.id,
      fechaInicio: Timestamp.fromDate(new Date(2024, 7, 1)), // Aug 1st, 2024
      ultimoTiempoComidaId: 'tc-des', // Last meal: Monday Breakfast
      fechaFin: Timestamp.fromDate(new Date(2024, 7, 5)), // Aug 5th, 2024
      primerTiempoComidaId: 'tc-cen', // First meal back: Friday Cena
      retornoPendienteConfirmacion: false,
      fechaCreacion: Timestamp.now(),
  },
  {
      id: 'aus-002',
      userId: 'user-resident-123',
      residenciaId: MOCK_RESIDENCIA.id,
      fechaInicio: Timestamp.fromDate(new Date(2024, 8, 10)), // Sep 10th, 2024
      ultimoTiempoComidaId: 'tc-alm', // Last meal: Tuesday Almuerzo
      fechaFin: Timestamp.fromDate(new Date(2024, 8, 20)), // Sep 20th, 2024
      primerTiempoComidaId: null, // Not specified yet
      retornoPendienteConfirmacion: true, // Marked as "Not Sure"
      fechaCreacion: Timestamp.now(),
  },
];

// --- Mock Data for Excepciones (Corrected Structure) ---
const MOCK_ELECCIONES: Eleccion[] = [
    {
        id: 'exc-001',
        usuarioId: 'user-resident-123', // Corrected from userId if necessary
        residenciaId: MOCK_RESIDENCIA.id,
        fecha: Timestamp.fromDate(new Date(2024, 7, 15)), // Aug 15th, 2024
        tiempoComidaId: 'tc-alm', // Almuerzo Principal
        alternativaTiempoComidaId: 'alt-alm-veg', // CORRECTED FIELD NAME
        estadoAprobacion: 'no_requerido',
        solicitado: true, // Added missing mandatory field
        fechaSolicitud: Timestamp.now(),
    },
    {
        id: 'exc-002',
        usuarioId: 'user-resident-123', // Corrected from userId if necessary
        residenciaId: MOCK_RESIDENCIA.id,
        fecha: Timestamp.fromDate(new Date(2024, 7, 16)), // Aug 16th, 2024
        tiempoComidaId: 'tc-cen', // Cena
        alternativaTiempoComidaId: 'alt-cen-dieta', // CORRECTED FIELD NAME
        estadoAprobacion: 'pendiente', // Requires approval
        // alternativaContingenciaId: 'alt-cen-ligero', // REMOVED - Not part of Eleccion interface
        solicitado: true, // Added missing mandatory field
        fechaSolicitud: Timestamp.now(),
    },
     // Add an older one to test filtering
     {
        id: 'exc-003',
        usuarioId: 'user-resident-123', // Corrected from userId if necessary
        residenciaId: MOCK_RESIDENCIA.id,
        fecha: Timestamp.fromDate(new Date(2024, 6, 1)), // July 1st, 2024 (Past)
        tiempoComidaId: 'tc-des',
        alternativaTiempoComidaId: 'alt-des-zumo', // CORRECTED FIELD NAME
        estadoAprobacion: 'no_requerido',
        solicitado: true, // Added missing mandatory field
        fechaSolicitud: Timestamp.now(),
    },
  ];
  // --- End Mock Data for Excepciones ---
  
// Helper to get Tiempo Comida name (no change needed here)
const getTiempoComidaName = (id: TiempoComidaId | null | undefined): string => {
  if (!id) return 'No especificado';
  return MOCK_TIEMPOS_COMIDA.find(tc => tc.id === id)?.nombre || 'Desconocido';
};
// --- End Mock Data for Ausencias ---


export default function ElegirComidasPage() {
    const params = useParams();
    // Use mock residenciaId for now, replace with params.residenciaId later
    const residenciaId = MOCK_RESIDENCIA.id;

    // --- State ---
    // Determine current user type (replace with actual auth logic later)
    const [currentUser, setCurrentUser] = useState<MockUser>(MOCK_CURRENT_USER_DIRECTOR); // CHANGE THIS TO MOCK_CURRENT_USER_RESIDENT to test resident view
    const isDirector = currentUser.roles.includes('director');

    // State for Director's view: who is being viewed/edited
    const [selectedUserId, setSelectedUserId] = useState<UserId>(currentUser.id);
    // State for Director's view: are we editing the selected user?
    const [isEditingEnabled, setIsEditingEnabled] = useState<boolean>(!isDirector || selectedUserId === currentUser.id); // Edit self by default

    // --- State for Ausencia Form ---
    const [absenceStartDate, setAbsenceStartDate] = useState<Date | undefined>();
    const [absenceLastMeal, setAbsenceLastMeal] = useState<TiempoComidaId | ''>('');
    const [absenceEndDate, setAbsenceEndDate] = useState<Date | undefined>();
    const [absenceFirstMeal, setAbsenceFirstMeal] = useState<TiempoComidaId | ''>('');
    const [absenceNotSure, setAbsenceNotSure] = useState<boolean>(false);

    // Derive viewed user details based on selectedUserId
    const viewedUser = selectedUserId === currentUser.id
        ? currentUser
        : MOCK_OTHER_RESIDENTS.find(r => r.id === selectedUserId);

    // Determine if the view is read-only (Director viewing someone else AND editing not enabled)
    const isReadOnly = isDirector && selectedUserId !== currentUser.id && !isEditingEnabled;

    // --- State for Excepcion Form ---
    interface ExceptionRowState {
      id: string; // Temporary unique ID for the row during editing
      fecha?: Date;
      tiempoComidaId?: TiempoComidaId | '';
      alternativaId?: AlternativaTiempoComidaId | '';
      // We might need more state here later for approval/contingency selection feedback
    }

    const [exceptionRows, setExceptionRows] = useState<ExceptionRowState[]>([
      // Start with one empty row
      { id: `new-${Date.now()}` }
    ]);

    // --- State for Comentario Form ---
    const [commentText, setCommentText] = useState<string>('');
    const [commentDate, setCommentDate] = useState<Date | undefined>();
    const [commentIsNextOpportunity, setCommentIsNextOpportunity] = useState<boolean>(true); // Default to next opportunity

    // Handle user selection change by Director
    const handleUserChange = (userId: UserId) => {
        setSelectedUserId(userId);
        // When Director selects someone else, default to read-only
        setIsEditingEnabled(userId === currentUser.id);
    };

    // Handle Director enabling edit mode for another user
    const handleEnableEditing = () => {
        if (isDirector && selectedUserId !== currentUser.id) {
            setIsEditingEnabled(true);
        }
    };

    // --- Mock Theme Handler ---
    const handleThemeChange = (theme: string) => {
        console.log(`Theme changed to: ${theme}`);
        // Actual theme logic would go here
    };

    // --- Handlers for Ausencia Form ---
    const handleAbsenceDateChange = (date: Date | undefined, type: 'start' | 'end') => {
      if (type === 'start') {
          setAbsenceStartDate(date);
          setAbsenceLastMeal(''); // Clear meal selection on date change
      } else {
          setAbsenceEndDate(date);
          setAbsenceFirstMeal(''); // Clear meal selection on date change
      }
    };

    const handleAbsenceSave = () => {
      console.log('Saving Absence:', {
          fechaInicio: absenceStartDate,
          ultimoTiempoComidaId: absenceLastMeal || null,
          fechaFin: absenceEndDate,
          primerTiempoComidaId: absenceFirstMeal || null,
          retornoPendienteConfirmacion: absenceNotSure,
      });
      // TODO: Add actual Firestore save logic
      // TODO: Clear form after save?
      alert('Ausencia guardada (simulado). Revisa la consola.');
    };

    const handleDeleteAbsence = (absenceId: AusenciaId | undefined) => {
      if (!absenceId) return;
      console.log('Deleting Absence:', absenceId);
      // TODO: Add actual Firestore delete logic
      alert('Ausencia eliminada (simulado). Revisa la consola.');
    };

    // Filter Tiempos based on selected date's day of week (simplified for now)
    // In reality, you might need a more robust way if Tiempos vary by day
    // This still works as it only needs the TiempoComida definitions
    const availableTiemposComida = MOCK_TIEMPOS_COMIDA;

    // --- Handlers for Excepcion Form ---
    const handleAddExceptionRow = () => {
      setExceptionRows(prev => [...prev, { id: `new-${Date.now()}` }]);
    };

    const handleRemoveExceptionRow = (idToRemove: string) => {
      setExceptionRows(prev => prev.filter(row => row.id !== idToRemove));
    };

    // Handler to update a specific field in a specific row
    // NOTE: This basic version assumes simple value updates. Date/Select/Alternativa need specific handling.
    const handleUpdateExceptionRow = (id: string, field: keyof Omit<ExceptionRowState, 'id'>, value: any) => {
      setExceptionRows(prev => prev.map(row =>
          row.id === id ? { ...row, [field]: value } : row
      ));
    };

    // Placeholder for opening the Alternativa selection dialog/sheet for a specific row
    const handleOpenAlternativaSelector = (rowId: string) => {
      const row = exceptionRows.find(r => r.id === rowId);
      if (!row?.tiempoComidaId) {
          alert("Por favor, selecciona primero una fecha y una comida.");
          return;
      }
      console.log(`Open Alternativa Selector for Exception Row ID: ${rowId}, TiempoComidaId: ${row.tiempoComidaId}`);

      // Filter alternatives based on the selected tiempoComidaId for this row
      const relevantAlternativas = MOCK_ALTERNATIVAS.filter(alt => alt.tiempoComidaId === row.tiempoComidaId && alt.isActive);
      console.log("Relevant Alternatives:", relevantAlternativas);

      // TODO: Implement Dialog/Sheet opening logic using 'relevantAlternativas'
      // This would likely involve setting state to control the dialog
      // and passing the rowId and current selections to it.
      // On dialog save, it would call handleUpdateExceptionRow with selected alternativaId, etc.
      alert(`Simulando selección de alternativa para fila ${rowId}. Relevantes: ${relevantAlternativas.map(a => a.nombre).join(', ')}`);
    };


    const handleSaveExceptions = () => {
      console.log('Saving Exceptions:', exceptionRows);
      // TODO: Add validation for each row (date, tiempo, alternativa required)
      // TODO: Add actual Firestore save logic (creating Eleccion documents)
      // TODO: Clear form after successful save
      alert('Excepciones guardadas (simulado). Revisa la consola.');
      // Reset to one empty row after saving
      // setExceptionRows([{ id: `new-${Date.now()}` }]);
    };

    const handleDeleteException = (exceptionId: ExcepcionId | undefined) => {
      if (!exceptionId) return;
      console.log('Deleting Exception (Eleccion):', exceptionId);
      // TODO: Add actual Firestore delete logic for the Eleccion document
      alert('Excepción eliminada (simulado). Revisa la consola.');
    };

    // Filter existing exceptions to show only future ones for the viewed user
    const futureExceptions = MOCK_ELECCIONES.filter(ex =>
      ex.usuarioId === viewedUser?.id && ex.fecha.toDate() >= new Date()
    );

    // --- Handlers for Comentario Form ---

    // Handle toggling between specific date and next opportunity
    const handleCommentDateToggle = (isNextOpp: boolean) => {
      setCommentIsNextOpportunity(isNextOpp);
      if (isNextOpp) {
          setCommentDate(undefined); // Clear date if switching to next opportunity
      }
    };

    const handleCommentSubmit = () => {
      if (!commentText.trim()) {
          // Using toast requires importing `useToast` hook and `Toaster` component
          // For now, let's use alert
          alert('El texto del comentario no puede estar vacío.');
          return;
      }
      console.log('Submitting Comment:', {
          texto: commentText,
          fechaAplicacion: commentIsNextOpportunity ? null : commentDate,
      });
      // TODO: Add actual Firestore save logic (creating Comentario document)
      // TODO: Clear form after save
      alert('Comentario enviado (simulado). Revisa la consola.');
      setCommentText('');
      setCommentDate(undefined);
      setCommentIsNextOpportunity(true);
    };

    // --- Render ---
    return (
        <div className="flex flex-col min-h-screen">
            {/* --- Header --- */}
            <header className="sticky top-0 z-10 flex h-[57px] items-center gap-1 border-b bg-background px-4">
                 {/* Placeholder Menu Button */}
                <Button variant="outline" size="icon" className="shrink-0">
                    <Menu className="h-5 w-5" />
                    <span className="sr-only">Toggle Menu</span>
                </Button>

                 {/* Title and Subtitle */}
                <div className="flex flex-col items-center flex-grow">
                    <h1 className="text-xl font-semibold">Elegir Comidas</h1>
                    <div className="flex items-center gap-2">
                         {/* Placeholder Residence Logo */}
                         {MOCK_RESIDENCIA.logoUrl ? (
                             <img src={MOCK_RESIDENCIA.logoUrl} alt={`${MOCK_RESIDENCIA.nombre} Logo`} className="h-4 w-auto" />
                         ) : (
                             <Home className="h-4 w-4 text-muted-foreground" /> // Placeholder Icon
                         )}
                        <span className="text-sm text-muted-foreground">{MOCK_RESIDENCIA.nombre}</span>
                    </div>
                </div>

                {/* Theme Toggle Buttons */}
                <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" onClick={() => handleThemeChange('light')}>
                        <Sun className="h-[1.2rem] w-[1.2rem]" />
                        <span className="sr-only">Light Mode</span>
                    </Button>
                     <Button variant="ghost" size="icon" onClick={() => handleThemeChange('dark')}>
                        <Moon className="h-[1.2rem] w-[1.2rem]" />
                         <span className="sr-only">Dark Mode</span>
                    </Button>
                     <Button variant="ghost" size="icon" onClick={() => handleThemeChange('sepia')}>
                        <Palette className="h-[1.2rem] w-[1.2rem]" />
                        <span className="sr-only">Sepia Mode</span>
                    </Button>
                </div>
            </header>

            {/* --- Main Content --- */}
            <main className="flex-grow container mx-auto p-4 space-y-6">

                 {/* --- User Context Section --- */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Contexto de Usuario</CardTitle>
                         {isReadOnly && (
                            <Badge variant="destructive" className="w-fit">Modo Lectura</Badge>
                        )}
                    </CardHeader>
                    <CardContent className="space-y-4">
                         <div className="flex flex-col sm:flex-row sm:items-center sm:gap-4 space-y-2 sm:space-y-0">
                            {isDirector ? (
                                <div className="flex-grow">
                                    <Label htmlFor="user-selector">Seleccionar Residente:</Label>
                                    <Select value={selectedUserId} onValueChange={handleUserChange}>
                                        <SelectTrigger id="user-selector">
                                            <SelectValue placeholder="Selecciona un residente" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value={currentUser.id}>{currentUser.nombre} (Yo)</SelectItem>
                                            {MOCK_OTHER_RESIDENTS.filter(r => r.id !== currentUser.id).map(resident => (
                                                <SelectItem key={resident.id} value={resident.id}>
                                                    {resident.nombre}
                                                 </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            ) : (
                                <div>
                                    <Label>Usuario Actual:</Label>
                                    <p className="font-semibold">{currentUser.nombre}</p>
                                 </div>
                            )}

                             {viewedUser && (
                                <div className="flex items-center gap-2">
                                     <Label>Modo:</Label>
                                     {/* TODO: Add logic for director to change mode */}
                                    <Badge variant={viewedUser.modoEleccion === 'suspendido' ? 'destructive' : 'secondary'}>
                                        {viewedUser.modoEleccion}
                                    </Badge>
                                </div>
                            )}

                             {isDirector && selectedUserId !== currentUser.id && !isEditingEnabled && (
                                <Button onClick={handleEnableEditing} size="sm">
                                    Habilitar Edición
                                </Button>
                            )}
                        </div>
                     </CardContent>
                </Card>

                <Separator />

                {/* --- Placeholder Sections --- */}

                {/* 1. Semanario */}
                <Card className={isReadOnly ? 'opacity-50 pointer-events-none' : ''}>
                    <CardHeader>
                        <CardTitle>Semanario</CardTitle>
                        {/* TODO: Add 'Solo esta semana' checkbox? */}
                    </CardHeader>
                    <CardContent>
                        <div className="overflow-x-auto relative border rounded-md">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs uppercase bg-muted/50">
                                <tr>
                                    <th scope="col" className="py-3 px-4 sticky left-0 bg-muted/50 z-10">Día</th>
                                    {/* Dynamically create columns based on unique Grupos */}
                                    {/* REFACTOR: Use MOCK_TIEMPOS_COMIDA for groups, sort by ordenGrupo */}
                                    {Array.from(new Set(MOCK_TIEMPOS_COMIDA.map(tc => tc.nombreGrupo)))
                                        .map(grupo => ({
                                            nombreGrupo: grupo,
                                            // Find the minimum ordenGrupo for this group name to ensure correct column order
                                            ordenGrupo: Math.min(...MOCK_TIEMPOS_COMIDA.filter(tc => tc.nombreGrupo === grupo).map(tc => tc.ordenGrupo))
                                        }))
                                        .sort((a, b) => a.ordenGrupo - b.ordenGrupo) // Sort columns by ordenGrupo
                                        .map(({ nombreGrupo }) => (
                                        <th key={nombreGrupo} scope="col" className="py-3 px-4 whitespace-nowrap">
                                            {nombreGrupo}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {DAYS_OF_WEEK.map((day) => (
                                    <tr key={day} className="border-b last:border-b-0 hover:bg-muted/30">
                                        {/* Sticky Day column */}
                                        <th scope="row" className="py-3 px-4 font-medium whitespace-nowrap sticky left-0 bg-background z-10 capitalize border-r">
                                            {day}
                                        </th>
                                        {/* Data cells for each Grupo (sorted) */}
                                        {/* REFACTOR: Use MOCK_TIEMPOS_COMIDA, sort by ordenGrupo */}
                                        {Array.from(new Set(MOCK_TIEMPOS_COMIDA.map(tc => tc.nombreGrupo)))
                                            .map(grupo => ({
                                                nombreGrupo: grupo,
                                                ordenGrupo: Math.min(...MOCK_TIEMPOS_COMIDA.filter(tc => tc.nombreGrupo === grupo).map(tc => tc.ordenGrupo))
                                            }))
                                            .sort((a, b) => a.ordenGrupo - b.ordenGrupo)
                                            .map(({ nombreGrupo }) => { // Use nombreGrupo from sorted list

                                            // Find the specific TiempoComida for this cell (Day + Group + Available)
                                            // NOTE: This assumes one TiempoComida per Grupo *per Day* where available.
                                            // If multiple Tiempos can share a Grupo on the same Day, logic needs adjustment.
                                            const tiempoComida = MOCK_TIEMPOS_COMIDA.find(tc =>
                                                tc.nombreGrupo === nombreGrupo && tc.diasDisponibles.includes(day)
                                            );
                                            const tiempoComidaId = tiempoComida?.id;

                                            // Find the selection in the mock semanario data
                                            const seleccion: SemanarioAlternativaSeleccion | undefined =
                                                tiempoComidaId ? MOCK_SEMANARIO_USER.elecciones[day]?.[tiempoComidaId] : undefined;

                                            // REFACTOR: Find the name of the selected alternative from MOCK_ALTERNATIVAS
                                            const alternativa = seleccion?.alternativaId
                                                ? MOCK_ALTERNATIVAS.find(alt => alt.id === seleccion.alternativaId)
                                                : undefined;

                                            // Placeholder click handler
                                            const handleCellClick = () => {
                                                if (isReadOnly || !tiempoComidaId || !tiempoComida) return; // Prevent interaction if read-only or no matching TiempoComida
                                                console.log(`Clicked: Day=${day}, Grupo=${nombreGrupo}, TiempoComidaId=${tiempoComidaId}`);
                                                // TODO: Open selection dialog/sheet here, passing relevant alternatives for tiempoComidaId
                                                const relevantAlternativas = MOCK_ALTERNATIVAS.filter(alt => alt.tiempoComidaId === tiempoComidaId && alt.isActive);
                                                alert(`Simulando selector para ${tiempoComida.nombre}. Opciones: ${relevantAlternativas.map(a => a.nombre).join(', ')}`);
                                            };

                                            return (
                                                <td key={`${day}-${nombreGrupo}`} className={`py-2 px-4 border-l first:border-l-0 ${isReadOnly || !tiempoComidaId ? '' : 'cursor-pointer'}`} onClick={handleCellClick}>
                                                    {/* Render content only if a tiempoComida applies to this day/group */}
                                                    {tiempoComidaId ? (
                                                        seleccion && alternativa ? ( // Check if seleccion AND alternativa are found
                                                            <div className="flex flex-col">
                                                                {/* REFACTOR: Use alternativa.requiereAprobacion */}
                                                                <span className={alternativa?.requiereAprobacion ? 'italic text-orange-600' : ''}>
                                                                    {alternativa?.nombre || 'Desconocido'}
                                                                    {alternativa?.requiereAprobacion && ' (Req. Apr.)'}
                                                                </span>
                                                                {/* Optionally show contingency */}
                                                                {/* {seleccion.alternativaContingenciaId && <span className="text-xs text-muted-foreground">(Fallback: ...)</span>} */}
                                                            </div>
                                                        ) : (
                                                            <span className="text-muted-foreground text-xs">Elegir...</span>
                                                        )
                                                    ) : (
                                                        <span className="text-xs text-gray-400">-</span> // Indicate not applicable
                                                    )}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {/* TODO: Add 'Solo esta semana' checkbox and Save button below the table div */}
                    {!isReadOnly && (
                        <div className="mt-4 flex justify-end">
                            <Button>Guardar Semanario</Button>
                        </div>
                    )}
                            {/* TODO: Placeholder for grid + interaction */}
                            {/* TODO: Placeholder for save button */}
                    </CardContent>
                </Card>

                {/* 2. Ausencias / Vacaciones */}
                <Card className={isReadOnly ? 'opacity-50 pointer-events-none' : ''}>
                    <CardHeader>
                        <CardTitle>Ausencias / Vacaciones</CardTitle>
                     </CardHeader>
                    <CardContent>
                        <div className="space-y-6">
                            {/* --- Formulario Nueva Ausencia --- */}
                            {!isReadOnly && ( // Only show form if editing is enabled
                                <form onSubmit={(e) => { e.preventDefault(); handleAbsenceSave(); }} className="space-y-4 border p-4 rounded-md">
                                    <h3 className="font-medium text-md mb-4">Registrar Nueva Ausencia</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {/* Salida */}
                                        <div className="space-y-2">
                                            <Label htmlFor="absence-start-date">Fecha de Salida</Label>
                                            <Popover>
                                                <PopoverTrigger asChild>
                                                    <Button
                                                        id="absence-start-date"
                                                        variant={"outline"}
                                                        className={`w-full justify-start text-left font-normal ${!absenceStartDate && "text-muted-foreground"}`}
                                                    >
                                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                                        {absenceStartDate ? format(absenceStartDate, "PPP", { locale: es }) : <span>Selecciona fecha</span>}
                                                    </Button>
                                                </PopoverTrigger>
                                                <PopoverContent className="w-auto p-0">
                                                    <Calendar
                                                        mode="single"
                                                        selected={absenceStartDate}
                                                        onSelect={(date) => handleAbsenceDateChange(date, 'start')}
                                                        initialFocus
                                                    />
                                                </PopoverContent>
                                            </Popover>
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="absence-last-meal">Última Comida</Label>
                                            <Select
                                                value={absenceLastMeal}
                                                onValueChange={(value) => setAbsenceLastMeal(value)}
                                                disabled={!absenceStartDate} // Disable if date not selected
                                            >
                                                <SelectTrigger id="absence-last-meal">
                                                    <SelectValue placeholder="Selecciona última comida" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {/* Populate with available Tiempos Comida */}
                                                    {/* This uses MOCK_TIEMPOS_COMIDA, which is correct */}
                                                    {availableTiemposComida.map(tc => (
                                                        <SelectItem key={tc.id} value={tc.id}>{tc.nombre} ({tc.nombreGrupo})</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        {/* Regreso */}
                                        <div className="space-y-2">
                                            <Label htmlFor="absence-end-date">Fecha de Regreso</Label>
                                            <Popover>
                                                <PopoverTrigger asChild>
                                                    <Button
                                                        id="absence-end-date"
                                                        variant={"outline"}
                                                        className={`w-full justify-start text-left font-normal ${!absenceEndDate && "text-muted-foreground"}`}
                                                    >
                                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                                        {absenceEndDate ? format(absenceEndDate, "PPP", { locale: es }) : <span>Selecciona fecha</span>}
                                                    </Button>
                                                </PopoverTrigger>
                                                <PopoverContent className="w-auto p-0">
                                                    <Calendar
                                                        mode="single"
                                                        selected={absenceEndDate}
                                                        onSelect={(date) => handleAbsenceDateChange(date, 'end')}
                                                        disabled={(date) => absenceStartDate ? date <= absenceStartDate : false} // Disable past dates relative to start
                                                        initialFocus
                                                    />
                                                </PopoverContent>
                                            </Popover>
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="absence-first-meal">Primera Comida al Regresar</Label>
                                            <Select
                                                value={absenceFirstMeal}
                                                onValueChange={(value) => setAbsenceFirstMeal(value)}
                                                disabled={!absenceEndDate} // Disable if date not selected
                                            >
                                                <SelectTrigger id="absence-first-meal">
                                                    <SelectValue placeholder="Selecciona primera comida" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {/* Populate with available Tiempos Comida */}
                                                    {/* This uses MOCK_TIEMPOS_COMIDA, which is correct */}
                                                    {availableTiemposComida.map(tc => (
                                                        <SelectItem key={tc.id} value={tc.id}>{tc.nombre} ({tc.nombreGrupo})</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>

                                    {/* Not Sure Checkbox */}
                                    <div className="flex items-center space-x-2 pt-2">
                                        <Checkbox
                                            id="absence-not-sure"
                                            checked={absenceNotSure}
                                            onCheckedChange={(checked) => setAbsenceNotSure(Boolean(checked))}
                                            disabled={!absenceEndDate || !absenceFirstMeal} // Only relevant if return date/meal is set
                                        />
                                        <Label htmlFor="absence-not-sure" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                            Necesito confirmar los detalles del regreso más tarde (se usarán los datos introducidos si no se confirman).
                                        </Label>
                                    </div>

                                    {/* Save Button */}
                                    <div className="flex justify-end pt-2">
                                        <Button type="submit">Guardar Ausencia</Button>
                                    </div>
                                </form>
                            )} {/* End Form Section */}

                            {/* --- Listado de Ausencias Futuras --- */}
                            <div>
                                <h3 className="font-medium text-md mb-2">Ausencias Registradas (Futuras)</h3>
                                {MOCK_AUSENCIAS.length > 0 ? (
                                    <div className="border rounded-md">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Desde</TableHead>
                                                <TableHead>Últ. Comida</TableHead>
                                                <TableHead>Hasta</TableHead>
                                                <TableHead>Prim. Comida</TableHead>
                                                <TableHead>Estado</TableHead>
                                                {!isReadOnly && <TableHead className="text-right">Acción</TableHead>}
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {MOCK_AUSENCIAS.map((ausencia) => (
                                                <TableRow key={ausencia.id}>
                                                    <TableCell>{format(ausencia.fechaInicio.toDate(), "P", { locale: es })}</TableCell>
                                                    {/* This uses getTiempoComidaName which uses MOCK_TIEMPOS_COMIDA, correct */}
                                                    <TableCell>{getTiempoComidaName(ausencia.ultimoTiempoComidaId)}</TableCell>
                                                    <TableCell>{format(ausencia.fechaFin.toDate(), "P", { locale: es })}</TableCell>
                                                    {/* This uses getTiempoComidaName which uses MOCK_TIEMPOS_COMIDA, correct */}
                                                    <TableCell>{getTiempoComidaName(ausencia.primerTiempoComidaId)}</TableCell>
                                                    <TableCell>
                                                        {ausencia.retornoPendienteConfirmacion ? (
                                                            <Badge variant="outline">Pendiente Confirmar</Badge>
                                                        ) : (
                                                            <Badge variant="default">Confirmado</Badge>
                                                        )}
                                                    </TableCell>
                                                    {!isReadOnly && (
                                                        <TableCell className="text-right">
                                                            <Button variant="ghost" size="icon" onClick={() => handleDeleteAbsence(ausencia.id)}>
                                                                <Trash2 className="h-4 w-4" />
                                                                <span className="sr-only">Eliminar</span>
                                                            </Button>
                                                        </TableCell>
                                                    )}
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                    </div>
                                ) : (
                                    <p className="text-sm text-muted-foreground">No hay ausencias futuras registradas.</p>
                                )}
                            </div> {/* End List Section */}
                        </div>
                     </CardContent>
                </Card>

                 {/* 3. Excepciones */}
                 <Card className={isReadOnly ? 'opacity-50 pointer-events-none' : ''}>
                     <CardHeader>
                        <CardTitle>Excepciones</CardTitle>
                     </CardHeader>
                     <CardContent>
                        <div className="space-y-6">
                            {/* --- Formulario Nuevas Excepciones --- */}
                            {!isReadOnly && ( // Only show form if editing is enabled
                                <div className="space-y-4 border p-4 rounded-md">
                                    <h3 className="font-medium text-md mb-4">Registrar Nuevas Excepciones</h3>
                                    {exceptionRows.map((row, index) => {
                                        // REFACTOR: Find selected alternative name for button display
                                        const selectedAlternativa = row.alternativaId
                                            ? MOCK_ALTERNATIVAS.find(alt => alt.id === row.alternativaId)
                                            : undefined;
                                        const buttonText = selectedAlternativa
                                            ? selectedAlternativa.nombre
                                            : 'Seleccionar Alternativa...';

                                        return (
                                        <div key={row.id} className="flex flex-col md:flex-row items-start md:items-end gap-2 border-b pb-4 last:border-b-0 last:pb-0">
                                            {/* Fecha */}
                                            <div className="space-y-1 w-full md:w-auto">
                                                <Label htmlFor={`exc-date-${row.id}`}>Fecha</Label>
                                                <Popover>
                                                    <PopoverTrigger asChild>
                                                        <Button
                                                            id={`exc-date-${row.id}`}
                                                            variant={"outline"}
                                                            className={`w-full md:w-[200px] justify-start text-left font-normal ${!row.fecha && "text-muted-foreground"}`}
                                                        >
                                                            <CalendarIcon className="mr-2 h-4 w-4" />
                                                            {row.fecha ? format(row.fecha, "P", { locale: es }) : <span>Selecciona</span>}
                                                        </Button>
                                                    </PopoverTrigger>
                                                    <PopoverContent className="w-auto p-0">
                                                        <Calendar
                                                            mode="single"
                                                            selected={row.fecha}
                                                            onSelect={(date) => {
                                                                // Clear dependent fields when date changes
                                                                handleUpdateExceptionRow(row.id, 'fecha', date);
                                                                handleUpdateExceptionRow(row.id, 'tiempoComidaId', '');
                                                                handleUpdateExceptionRow(row.id, 'alternativaId', '');
                                                            }}
                                                            // You might want to disable past dates here
                                                            initialFocus
                                                        />
                                                    </PopoverContent>
                                                </Popover>
                                            </div>

                                            {/* Tiempo Comida */}
                                            <div className="space-y-1 w-full md:w-auto">
                                                <Label htmlFor={`exc-tiempo-${row.id}`}>Comida</Label>
                                                <Select
                                                    value={row.tiempoComidaId || ''}
                                                    onValueChange={(value) => {
                                                        // Clear alternativa when tiempo changes
                                                        handleUpdateExceptionRow(row.id, 'tiempoComidaId', value);
                                                        handleUpdateExceptionRow(row.id, 'alternativaId', '');
                                                    }}
                                                    disabled={!row.fecha} // Require date first
                                                >
                                                    <SelectTrigger id={`exc-tiempo-${row.id}`} className="w-full md:w-[180px]">
                                                        <SelectValue placeholder="Selecciona" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {/* This correctly uses availableTiemposComida */}
                                                        {availableTiemposComida.map(tc => (
                                                            <SelectItem key={tc.id} value={tc.id}>{tc.nombre}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>

                                            {/* Alternativa Selection Button */}
                                            <div className="space-y-1 w-full md:flex-grow">
                                                <Label htmlFor={`exc-alt-${row.id}`}>Alternativa</Label>
                                                <Button
                                                    id={`exc-alt-${row.id}`}
                                                    variant="outline"
                                                    className="w-full justify-start text-left font-normal"
                                                    onClick={() => handleOpenAlternativaSelector(row.id)}
                                                    disabled={!row.tiempoComidaId} // Require Tiempo first
                                                >
                                                    {/* REFACTOR: Display selected alternativa name */}
                                                    {buttonText}
                                                </Button>
                                            </div>


                                            {/* Remove Row Button */}
                                            {exceptionRows.length > 1 && (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => handleRemoveExceptionRow(row.id)}
                                                    className="text-muted-foreground hover:text-destructive flex-shrink-0 mt-1 md:mt-0 md:mb-[2px]" // Align button slightly better
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                    <span className="sr-only">Eliminar fila</span>
                                                </Button>
                                            )}
                                        </div>
                                        ); // End of return for map row
                                    })}

                                    {/* Add Row Button */}
                                    <div className="flex items-center pt-2 gap-2">
                                        <Button variant="outline" size="sm" onClick={handleAddExceptionRow}>
                                            <PlusCircle className="h-4 w-4 mr-2" />
                                            Añadir Otra Excepción
                                        </Button>
                                    </div>

                                    {/* Save Button */}
                                    <div className="flex justify-end pt-4">
                                        <Button onClick={handleSaveExceptions}>Guardar Excepciones</Button>
                                    </div>
                                </div>
                            )} {/* End Form Section */}


                            {/* --- Listado de Excepciones Futuras --- */}
                            <div>
                                <h3 className="font-medium text-md mb-2">Excepciones Registradas (Futuras)</h3>
                                {futureExceptions.length > 0 ? (
                                    <div className="border rounded-md">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Fecha</TableHead>
                                                    <TableHead>Comida</TableHead>
                                                    <TableHead>Selección</TableHead>
                                                    <TableHead>Estado</TableHead>
                                                    {!isReadOnly && <TableHead className="text-right">Acción</TableHead>}
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {futureExceptions.map((exc) => {
                                                    // Find names for display
                                                    const tiempoNombre = getTiempoComidaName(exc.tiempoComidaId); // Uses MOCK_TIEMPOS_COMIDA (correct)
                                                    // REFACTOR: Look up alternativa in MOCK_ALTERNATIVAS
                                                    const alternativa = MOCK_ALTERNATIVAS.find(alt => alt.id === exc.alternativaTiempoComidaId);
                                                    const alternativaNombre = alternativa?.nombre || 'Desconocido';

                                                    return (
                                                        <TableRow key={exc.id}>
                                                            <TableCell>{format(exc.fecha.toDate(), "P", { locale: es })}</TableCell>
                                                            <TableCell>{tiempoNombre}</TableCell>
                                                            <TableCell>
                                                                {/* REFACTOR: Use alternativa?.requiereAprobacion */}
                                                                <span className={alternativa?.requiereAprobacion ? 'italic text-orange-600' : ''}>
                                                                    {alternativaNombre}
                                                                </span>
                                                            </TableCell>
                                                            <TableCell>
                                                                <Badge variant={
                                                                        exc.estadoAprobacion === 'pendiente' ? 'secondary' : // Use secondary for pending
                                                                        exc.estadoAprobacion === 'aprobado' ? 'default' :   // Use default for approved
                                                                        exc.estadoAprobacion === 'rechazado' ? 'destructive' :
                                                                        'secondary' // no_requerido
                                                                    }>
                                                                    {exc.estadoAprobacion}
                                                                </Badge>
                                                            </TableCell>
                                                            {!isReadOnly && (
                                                                <TableCell className="text-right">
                                                                    <Button variant="ghost" size="icon" onClick={() => handleDeleteException(exc.id)}>
                                                                        <Trash2 className="h-4 w-4" />
                                                                        <span className="sr-only">Eliminar</span>
                                                                    </Button>
                                                                </TableCell>
                                                            )}
                                                        </TableRow>
                                                    );
                                                })}
                                            </TableBody>
                                        </Table>
                                    </div>
                                ) : (
                                    <p className="text-sm text-muted-foreground">No hay excepciones futuras registradas para {viewedUser?.nombre || 'este usuario'}.</p>
                                )}
                            </div> {/* End List Section */}
                        </div>
                    </CardContent>
                </Card>

                {/* 4. Comentarios */}
                <Card className={isReadOnly ? 'opacity-50 pointer-events-none' : ''}>
                <CardHeader>
                    <CardTitle>Comentarios para Dirección</CardTitle>
                </CardHeader>
                <CardContent>
                    <div> {/* Using div instead of form as submit is handled by button click */}
                        {!isReadOnly ? ( // Only show form if editing is enabled
                            <div className="space-y-4">
                                <div>
                                    <Label htmlFor="comment-text">Tu Comentario</Label>
                                    <Textarea
                                        id="comment-text"
                                        placeholder="Escribe aquí tu comentario para la dirección (e.g., peticiones especiales, agradecimientos...)"
                                        value={commentText}
                                        onChange={(e) => setCommentText(e.target.value)}
                                        rows={4}
                                        className="mt-1"
                                    />
                                </div>

                                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                                    {/* Option Toggle */}
                                    <div className="flex items-center space-x-4">
                                        <div className="flex items-center space-x-2">
                                            <Checkbox
                                                id="comment-next-opp"
                                                checked={commentIsNextOpportunity}
                                                onCheckedChange={(checked) => handleCommentDateToggle(true)}
                                            />
                                            <Label htmlFor="comment-next-opp" className="cursor-pointer">Próxima Oportunidad</Label>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <Checkbox
                                                id="comment-specific-date"
                                                checked={!commentIsNextOpportunity}
                                                onCheckedChange={(checked) => handleCommentDateToggle(false)}
                                            />
                                            <Label htmlFor="comment-specific-date" className="cursor-pointer">Fecha Específica</Label>
                                        </div>
                                    </div>

                                    {/* Date Picker (conditional) */}
                                    {!commentIsNextOpportunity && (
                                        <div className="flex-grow">
                                            <Popover>
                                                <PopoverTrigger asChild>
                                                    <Button
                                                        id="comment-date-picker"
                                                        variant={"outline"}
                                                        className={`w-full sm:w-[240px] justify-start text-left font-normal ${!commentDate && "text-muted-foreground"}`}
                                                    >
                                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                                        {commentDate ? format(commentDate, "PPP", { locale: es }) : <span>Selecciona fecha</span>}
                                                    </Button>
                                                </PopoverTrigger>
                                                <PopoverContent className="w-auto p-0">
                                                    <Calendar
                                                        mode="single"
                                                        selected={commentDate}
                                                        onSelect={setCommentDate}
                                                        initialFocus
                                                    />
                                                </PopoverContent>
                                            </Popover>
                                        </div>
                                    )}
                                </div>
                                <div className="flex justify-end">
                                    <Button onClick={handleCommentSubmit}>
                                        Enviar Comentario
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <p className="text-sm text-muted-foreground">No puedes enviar comentarios en modo lectura.</p>
                        )}
                    </div>
                    {/* TODO: Placeholder for comment form */}
                    {/* TODO: Placeholder for submit button */}
                 </CardContent>
             </Card>
         </main>
    </div>
);}
