'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { auth, db } from '@/lib/firebase';
import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  doc,
  getDoc,
  serverTimestamp,
  runTransaction,
  Timestamp,
  deleteDoc,
  orderBy,
  writeBatch,
} from 'firebase/firestore';
import { getFunctions, httpsCallable, HttpsCallableResult } from 'firebase/functions';
import { Duration } from 'date-fns'
// Model imports
import {
  ContratoResidencia,
  ContratoResidenciaId,
  Pedido,
  PedidoId,
  Factura,
  FacturaId,
  Licencia,
  Licenciamiento,
  FacturaCero, // Assuming FacturaCero might be an ID string or a specific object type
  FacturaCeroId
} from '../../../../shared/models/contratos'; // Adjust path as needed

import {
  UserProfile,
  ResidenciaId,
  campoFechaConZonaHoraria,
  // Ensure other necessary types from types.ts are imported if needed
} from '../../../../shared/models/types'; // Adjust path as needed

// Utility and Component imports
import { 
    crearFCZH_FechaHora, 
    addDurationToFCZH, 
    toDateFCZH, 
    intervalToDurationFCZH 
} from '../../../../shared/utils/commonUtils';
import { 
  writeClientLog, 
  formatFCZHToMonthYear, 
} from '@/lib/utils';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from '@/hooks/useToast'; // Or your preferred toast mechanism
import { PlusCircle, Trash2 } from 'lucide-react'; // Example icons

// Types for Firebase Function validation
interface ValidateLicenseData {
  contratoId: ContratoResidenciaId;
  pedidoId: PedidoId;
}
interface ValidationResult {
  isValid: boolean;
  errorMessages: string[];
}
interface SingleContractAuditFunctionResult {
  auditResult: boolean;
  licenseResult: 'no requerida' | 'licencia sin cambios' | 'licencia instalada' | 'licencia reinstalada' | 'error';
  errorMessage?: string;
}

const LicenciasPage = () => {
  const { user, loading: loadingAuth, error: errorAuth } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  // --- State Variables ---
  // Selection States
  const [selectedContratoId, setSelectedContratoId] = useState<ContratoResidenciaId | null>(null);
  const [selectedPedidoId, setSelectedPedidoId] = useState<PedidoId | null>(null);
  const [selectedFacturaId, setSelectedFacturaId] = useState<FacturaId | null>(null); // For subscription type invoices

  // Data States
  const [contratos, setContratos] = useState<ContratoResidencia[]>([]);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [licencias, setLicencias] = useState<Licencia[]>([]);
  const [licenciamientos, setLicenciamientos] = useState<Licenciamiento[]>([]);

  // Derived Data States
  const [selectedContrato, setSelectedContrato] = useState<ContratoResidencia | null>(null);
  const [selectedPedido, setSelectedPedido] = useState<Pedido | null>(null);
  const [selectedFactura, setSelectedFactura] = useState<Factura | null>(null); // The specific invoice to work with

  // UI & Loading States
  const [loadingContratos, setLoadingContratos] = useState<boolean>(false);
  const [loadingPedidos, setLoadingPedidos] = useState<boolean>(false);
  const [loadingFacturas, setLoadingFacturas] = useState<boolean>(false);
  const [loadingLicencias, setLoadingLicencias] = useState<boolean>(false);
  const [isValidating, setIsValidating] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [validationStatus, setValidationStatus] = useState<ValidationResult | null>(null);

  const functions = getFunctions();
  // Define the callable function - ensure 'checkLicenseValidity' matches your deployed function name
  const checkLicenseValidityCallable = httpsCallable<ValidateLicenseData, ValidationResult>(functions, 'checkLicenseValidity');

  // --- Effects for Data Fetching & Resetting ---

  // Fetch Contratos
  useEffect(() => {
    if (!user) return;
    const fetchContratos = async () => {
      setLoadingContratos(true);
      try {
        const q = query(collection(db, 'contratosResidencia'), orderBy('residencia'));
        const querySnapshot = await getDocs(q);
        const fetchedContratos: ContratoResidencia[] = [];
        querySnapshot.forEach((doc) => {
          fetchedContratos.push({ id: doc.id, ...doc.data() } as ContratoResidencia);
        });
        setContratos(fetchedContratos);
      } catch (error) {
        console.error("Error fetching contratos: ", error);
        toast({ title: "Error", description: "No se pudieron cargar los contratos.", variant: "destructive" });
      }
      setLoadingContratos(false);
    };
    fetchContratos();
  }, [user, toast]);

  // Reset selections and derived data when contrato changes
  useEffect(() => {
    setSelectedPedidoId(null);
    setPedidos([]);
    setSelectedFacturaId(null); // Reset selected factura for subscriptions
    setFacturas([]);
    setLicencias([]);
    setLicenciamientos([]);
    setValidationStatus(null);
    const currentContrato = contratos.find(c => c.id === selectedContratoId) || null;
    setSelectedContrato(currentContrato);
  }, [selectedContratoId, contratos]);


  // Fetch Pedidos when selectedContratoId changes
  useEffect(() => {
    if (!user || !selectedContratoId) {
      setPedidos([]);
      setSelectedPedido(null);
      return;
    }
    const fetchPedidos = async () => {
      setLoadingPedidos(true);
      try {
        const q = query(collection(db, 'pedidos'), where('contrato', '==', selectedContratoId), orderBy('fechaInicio', 'desc'));
        const querySnapshot = await getDocs(q);
        const fetchedPedidos: Pedido[] = [];
        querySnapshot.forEach((doc) => {
          fetchedPedidos.push({ id: doc.id, ...doc.data() } as Pedido);
        });
        setPedidos(fetchedPedidos);
      } catch (error) {
        console.error("Error fetching pedidos: ", error);
        toast({ title: "Error", description: "No se pudieron cargar los pedidos.", variant: "destructive" });
      }
      setLoadingPedidos(false);
    };
    fetchPedidos();
  }, [user, selectedContratoId, toast]);

  // Reset selections and derived data when pedido changes
  useEffect(() => {
    setFacturas([]);
    setLicencias([]);
    setLicenciamientos([]);
    setValidationStatus(null);
    setSelectedFacturaId(null); // Reset selected factura for subscriptions
    const currentPedido = pedidos.find(p => p.id === selectedPedidoId) || null;
    setSelectedPedido(currentPedido);
  }, [selectedPedidoId, pedidos]);


  // Fetch Facturas, Licencias, and Licenciamientos when selectedPedidoId changes
  useEffect(() => {
    if (!user || !selectedPedidoId) {
      setFacturas([]);
      setLicencias([]);
      setLicenciamientos([]);
      setSelectedFactura(null);
      return;
    }

    const fetchDataForPedido = async () => {
      setLoadingFacturas(true);
      setLoadingLicencias(true); // Combined loading state for simplicity here

      try {
        // Fetch Facturas
        const facturasQ = query(collection(db, 'facturas'), where('pedidoId', '==', selectedPedidoId), orderBy('fecha', 'desc'));
        const facturasSnap = await getDocs(facturasQ);
        const fetchedFacturas: Factura[] = [];
        facturasSnap.forEach(doc => fetchedFacturas.push({ id: doc.id, ...doc.data() } as Factura));
        setFacturas(fetchedFacturas);

        // Fetch Licencias linked to this pedido
        const licenciasQ = query(collection(db, 'licencias'), where('pedido', '==', selectedPedidoId), orderBy('fechaInicio', 'desc'));
        const licenciasSnap = await getDocs(licenciasQ);
        const fetchedLicencias: Licencia[] = [];
        licenciasSnap.forEach(doc => fetchedLicencias.push({ id: doc.id, ...doc.data() } as Licencia));
        setLicencias(fetchedLicencias);

        // Fetch Licenciamientos for this pedido (to know which invoices are linked)
        // This might fetch more than needed if not further filtered, but it's okay for now
        const licenciamientosQ = query(collection(db, 'licenciamientos'), where('pedidoId', '==', selectedPedidoId));
        const licenciamientosSnap = await getDocs(licenciamientosQ);
        const fetchedLicenciamientos: Licenciamiento[] = [];
        licenciamientosSnap.forEach(doc => fetchedLicenciamientos.push({ id: doc.id, ...doc.data() } as Licenciamiento));
        setLicenciamientos(fetchedLicenciamientos);

      } catch (error) {
        console.error("Error fetching data for pedido: ", error);
        toast({ title: "Error", description: "No se pudieron cargar los detalles del pedido.", variant: "destructive" });
      }
      setLoadingFacturas(false);
      setLoadingLicencias(false);
    };
    fetchDataForPedido();
  }, [user, selectedPedidoId, toast]);


  // Effect to automatically call validation when selectedPedido changes
  useEffect(() => {
    if (selectedContratoId && selectedPedidoId) {
      handleValidateLicense();
    } else {
      setValidationStatus(null); // Clear validation if no order is selected
    }
  }, [selectedContratoId, selectedPedidoId]); // Re-run when selectedPedidoId or selectedContratoId changes


  // --- Derived Data ---
  const availablePedidos = useMemo(() => {
    return pedidos.filter(p => p.contrato === selectedContratoId);
  }, [pedidos, selectedContratoId]);

  // Determine the invoice to work with for license generation
  useEffect(() => {
    if (!selectedPedido) {
        setSelectedFactura(null);
        return;
    }
    if (selectedPedido.tipo === 'suscripcion') {
        // For subscriptions, use the selectedFacturaId if set,
        // otherwise, it might imply needing to select one or the "next" unbilled one.
        // For now, rely on selectedFacturaId.
        const currentFactura = facturas.find(f => f.id === selectedFacturaId) || null;
        setSelectedFactura(currentFactura);
    } else {
        // For other types, if invoices exist, it's usually one.
        // The validation logic will determine if the right invoice exists.
        // For 'libre de costo', no real invoice is needed for linking.
        if (facturas.length > 0) {
            setSelectedFactura(facturas[0]); // Or more specific logic if needed
        } else {
            setSelectedFactura(null);
        }
    }
  }, [selectedPedido, facturas, selectedFacturaId]);


  // --- Handlers ---
  const handleContratoChange = (value: string) => {
    setSelectedContratoId(value as ContratoResidenciaId);
  };

  const handlePedidoChange = (value: string) => {
    setSelectedPedidoId(value as PedidoId);
  };

  const handleFacturaSelectionForSubscription = (facturaId: FacturaId) => {
    setSelectedFacturaId(facturaId);
  };

  const handleValidateLicense = useCallback(async () => {
    if (!selectedContratoId || !selectedPedidoId) {
      // toast({ title: "Información requerida", description: "Seleccione un contrato y un pedido."});
      setValidationStatus(null);
      return;
    }
    setIsValidating(true);
    setValidationStatus(null);
    try {
      const result = await checkLicenseValidityCallable({
        contratoId: selectedContratoId,
        pedidoId: selectedPedidoId,
      });
      setValidationStatus(result.data);
    } catch (error: any) {
      console.error("Error validating license:", error);
      toast({
        title: "Error de Validación",
        description: error.message || "No se pudo validar la creación de la licencia.",
        variant: "destructive",
      });
      setValidationStatus({ isValid: false, errorMessages: [error.message || "Error desconocido en validación."] });
    }
    setIsValidating(false);
  }, [selectedContratoId, selectedPedidoId, checkLicenseValidityCallable, toast]);


  const handleGenerateLicense = async () => {
    if (!user) {
        toast({ title: "Autenticación Requerida", description: "Debe estar autenticado.", variant: "destructive" });
        return;
    }
    if (!validationStatus || !validationStatus.isValid) {
        toast({ title: "Validación Fallida", description: "Corrija los errores de validación antes de generar la licencia.", variant: "destructive" });
        return;
    }
    if (!selectedContrato || !selectedPedido) {
        toast({ title: "Datos Incompletos", description: "Contrato o pedido no seleccionado.", variant: "destructive" });
        return;
    }

    setIsGenerating(true);
    setValidationStatus(null); // Clear previous validation messages

    try {
      // 1. Determine Invoice to Link
      let facturaIdToLink: FacturaId | FacturaCeroId | null = null;
      let linkedFactura: Factura | null = null; // For logging/display if needed

      if (selectedPedido.modoPago === 'libre de costo') {
        // For 'libre de costo', we link to a conceptual "FacturaCero"
        // The ID can be a placeholder or a specially generated one if you track them.
        facturaIdToLink = `FC0-${selectedPedido.id}` as FacturaCeroId; // Example FacturaCeroId
      } else {
        // Find the single, unlinked invoice for this pedido.
        // The validation function should ensure such an invoice exists and is unique if required.
        const unlinkedInvoices = facturas.filter(f =>
          !licenciamientos.some(l => l.facturaId === f.id && l.licenciaId)
        );

        if (selectedPedido.tipo === 'suscripcion') {
            if (selectedFactura && !licenciamientos.some(l => l.facturaId === selectedFactura.id && l.licenciaId)) {
                facturaIdToLink = selectedFactura.id;
                linkedFactura = selectedFactura;
            } else {
                 // Try to find the next unlinked invoice if none specifically selected
                const nextUnlinked = unlinkedInvoices.sort((a,b) => new Date(a.fecha.fecha).getTime() - new Date(b.fecha.fecha).getTime())[0];
                if (nextUnlinked) {
                    facturaIdToLink = nextUnlinked.id;
                    linkedFactura = nextUnlinked;
                }
            }
        } else { // For 'licencia temporal' or other non-subscription, non-free types
            if (unlinkedInvoices.length === 1) {
                facturaIdToLink = unlinkedInvoices[0].id;
                linkedFactura = unlinkedInvoices[0];
            }
        }

        if (!facturaIdToLink) {
          throw new Error("No se pudo determinar la factura a vincular. Verifique las facturas del pedido.");
        }
      }

      // 2. Calculate Licencia.fechaInicio (Today)
      const systemTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; // Or your default TZ
      const now = new Date();
      const currentTimestampDateString = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const currentTimestampTimeString = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}.${String(now.getMilliseconds()).padStart(3, '0')}`;
      const fechaInicioLicencia = crearFCZH_FechaHora(currentTimestampDateString, currentTimestampTimeString, systemTimeZone);

      if (!fechaInicioLicencia) {
        throw new Error("No se pudo generar la fecha de inicio para la licencia.");
      }

      // 3. Calculate Licencia.fechaFin
      let fechaFinLicencia: campoFechaConZonaHoraria | null = null;
      const pedidoFechaInicio = selectedPedido.fechaInicio;
      const pedidoFechaFin = selectedPedido.fechaFin;

      switch (selectedPedido.tipo) {
        case 'suscripcion':
          if (selectedPedido.periodicidad === 'mensual') {
            fechaFinLicencia = addDurationToFCZH(fechaInicioLicencia, {months: 1});
          } else if (selectedPedido.periodicidad === 'trimestral') {
            fechaFinLicencia = addDurationToFCZH(fechaInicioLicencia, {months: 3});
          } else if (selectedPedido.periodicidad === 'semestral') {
            fechaFinLicencia = addDurationToFCZH(fechaInicioLicencia, {months: 6});
          } else if (selectedPedido.periodicidad === 'anual') {
            fechaFinLicencia = addDurationToFCZH(fechaInicioLicencia, {years: 1});
          } else { //diaria or other unhandled
            throw new Error("Periodicidad no válida para pedido de tipo suscripción.");
          }
          break;
        case 'licencia temporal':
          if (pedidoFechaInicio && pedidoFechaFin) {
            // Calculate duration of pedido
            // This is a simplified duration calculation in days.
            // For precise month/year differences, a robust date library is better.
            const duracion: Duration = intervalToDurationFCZH(pedidoFechaInicio,pedidoFechaFin) ?? {};
            if (Object.values(duracion).every(value => value === undefined)) {
              throw new Error("No se pudo calcular la duración del pedido");
            }
            fechaFinLicencia = addDurationToFCZH(fechaInicioLicencia, duracion);
          } else {
            throw new Error("Fechas de inicio/fin del pedido temporal no definidas para calcular duración.");
          }
          break;
        case 'licencia perpetua':
          fechaFinLicencia = addDurationToFCZH(fechaInicioLicencia, {years: 1}); // Or can be null if truly perpetual from start
          break;
        default:
          throw new Error(`Tipo de pedido '${selectedPedido.tipo}' no manejado para cálculo de fecha fin.`);
      }
      if (fechaFinLicencia === null) {
        console.error("Error: fechaFinLicencia es null, pero se requiere un valor para Licencia.fechaFin.");
        toast({ 
           title: 'Error de Validación', 
           description: 'No se pudo determinar la fecha de fin para la licencia. La operación no puede continuar.', 
           variant: 'destructive' 
        });
        return; // Or you could throw new Error("fechaFinLicencia no puede ser null.");
      }
      // 4. Construct Licencia Object
      const nuevaLicenciaData: Omit<Licencia, 'id'> = {
        contratoLicencia: selectedPedido.contrato,
        pedido: selectedPedido.id,
        cantUsuarios: selectedPedido.cantUsuarios || 0, // Fallback to 0
        fechaInicio: fechaInicioLicencia,
        fechaFin: fechaFinLicencia,
      };

      // 5. Firestore Batch Write
      const batch = writeBatch(db);

      const licenciaRef = doc(collection(db, 'licencias')); // Auto-generates ID
      batch.set(licenciaRef, nuevaLicenciaData);

      const nuevoLicenciamientoData: Omit<Licenciamiento, 'id'> = {
        pedidoId: selectedPedido.id,
        facturaId: facturaIdToLink,
        licenciaId: licenciaRef.id, // Link to the new license ID
        // Add any other fields for Licenciamiento
      };
      const licenciamientoRef = doc(collection(db, 'licenciamientos')); // Auto-generates ID
      batch.set(licenciamientoRef, nuevoLicenciamientoData);

      await batch.commit();

      if (selectedContrato?.id) { // Check if selectedContrato and its id are available
          const contratoIdToAudit = selectedContrato.id as ContratoResidenciaId; // Use the ID from the currently selected contract
          try {
              const functionsInstance = getFunctions(); // Renamed to avoid conflict if 'functions' is used elsewhere
              const callActualizacionLicenciaContrato = httpsCallable<
                  { contratoResidenciaId: ContratoResidenciaId },
                  SingleContractAuditFunctionResult // Your defined interface for the result
              >(functionsInstance, 'actualizacionLicenciaContrato');

              console.log(`Calling actualizacionLicenciaContrato for Contrato ID: ${contratoIdToAudit}`);
              
              // Optional: Set a loading state for the audit call
              // setIsLoadingAudit(true); 

              const result = await callActualizacionLicenciaContrato({ contratoResidenciaId: contratoIdToAudit });
              
              const { data } = result as HttpsCallableResult<SingleContractAuditFunctionResult>;

              console.log('Audit Result from actualizacionLicenciaContrato:', data);

              if (data.auditResult) {
                  toast({ title: "Auditoría de Contrato Exitosa", description: `Resultado: ${data.licenseResult}. ${data.errorMessage || ''}` });
                  if (auth.currentUser) { // Check if currentUser is available
                    await writeClientLog(
                      auth.currentUser.uid,
                      'licencia',
                      { residenciaId: 'No disponible', 
                        details: `Auditoría de contrato ${contratoIdToAudit} exitosa: ${data.licenseResult}. ${data.errorMessage || ''}`}
                    );
                  }
              } else {
                  toast({ title: "Error en Auditoría de Contrato", description: `Resultado: ${data.licenseResult}. ${data.errorMessage || 'Error desconocido.'}`, variant: "destructive" });
                  if (auth.currentUser) { // Check if currentUser is available
                    await writeClientLog(
                      auth.currentUser.uid,
                      'licencia',
                      { residenciaId: 'No disponible', 
                        details: `Error en auditoría de contrato ${contratoIdToAudit}: ${data.licenseResult}. ${data.errorMessage || 'Error desconocido.'}`}
                    );
                  }
              }

          } catch (error) {
              console.error("Error calling actualizacionLicenciaContrato function:", error);
              toast({ title: "Error Inesperado", description: "No se pudo completar la auditoría del contrato.", variant: "destructive" });
              const errorMessage = error instanceof Error ? error.message : String(error);
              if (auth.currentUser) { // Check if currentUser is available
                await writeClientLog(
                  auth.currentUser.uid,
                  'licencia',
                  { residenciaId: 'No disponible', 
                    details: `Error llamando a actualizacionLicenciaContrato para ${contratoIdToAudit}: ${errorMessage} (LicenciasPage_AuditCall_Catch)`}
                );
              }
          } finally {
              // Optional: Clear loading state
              // setIsLoadingAudit(false);
          }
      } else {
          console.warn("No selectedContrato.id available to trigger audit.");
          toast({ title: "Advertencia", description: "No se seleccionó ningún contrato para auditar.", variant: "default" });
          if (auth.currentUser) { // Check if currentUser is available
            await writeClientLog(
              auth.currentUser.uid,
              'licencia',
              { residenciaId: 'No disponible', 
                details: `Intento de auditoría sin ContratoResidenciaId seleccionado. (LicenciasPage_AuditCall_NoID)`}
            );
          }
      }

      // 6. Log Action
      await writeClientLog(
        user.uid,
        'factura',
        { residenciaId: 'No disponible', 
          details: `Pedido 'pedidoId: ${selectedPedido.id}, facturaVinculada: ${facturaIdToLink}) Licencia ${licenciaRef.id}`}
      );

      toast({
        title: "Licencia Generada",
        description: `Licencia ${licenciaRef.id} creada y vinculada exitosamente.`,
        variant: "default",
      });

      // 7. Refresh data (or parts of it)
      // Re-fetch licenses and licenciamientos for the current pedido
      // Or, more simply, trigger the useEffect that fetches these by slightly changing its deps if needed,
      // but direct re-fetch is often clearer here.
      const licenciasQ = query(collection(db, 'licencias'), where('pedido', '==', selectedPedido.id), orderBy('fechaInicio', 'desc'));
      const licenciasSnap = await getDocs(licenciasQ);
      const fetchedLicencias: Licencia[] = [];
      licenciasSnap.forEach(doc => fetchedLicencias.push({ id: doc.id, ...doc.data() } as Licencia));
      setLicencias(fetchedLicencias);

      const licenciamientosQ = query(collection(db, 'licenciamientos'), where('pedidoId', '==', selectedPedido.id));
      const licenciamientosSnap = await getDocs(licenciamientosQ);
      const fetchedLicenciamientos: Licenciamiento[] = [];
      licenciamientosSnap.forEach(doc => fetchedLicenciamientos.push({ id: doc.id, ...doc.data() } as Licenciamiento));
      setLicenciamientos(fetchedLicenciamientos);
      
      setSelectedFacturaId(null); // Reset selected factura for subscriptions

    } catch (error: any) {
      console.error("Error generando licencia:", error);
      toast({
        title: "Error al Generar Licencia",
        description: error.message || "Ocurrió un error inesperado.",
        variant: "destructive",
      });
      // Optionally, re-trigger validation to show any server-side issues if applicable,
      // though the client-side callable should catch most logical errors.
      await handleValidateLicense(); // Re-run validation
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRevokeLicense = (licenciaId: string) => {
    // TODO: Implement license revocation logic
    toast({ title: "En Construcción", description: "La funcionalidad de revocar licencia aún no está implementada."});
    console.log("TODO: Implement license revocation logic for license ID:", licenciaId);
  };


  // --- Render Logic ---
  if (loadingAuth) {
    return <div className="flex justify-center items-center h-screen"><p>Cargando autenticación...</p></div>;
  }
  if (errorAuth) {
    return <div className="flex justify-center items-center h-screen"><p>Error de autenticación: {errorAuth.message}</p></div>;
  }
  if (!user) {
    router.push('/'); // Redirect to login or home if not authenticated
    return <div className="flex justify-center items-center h-screen"><p>Redirigiendo...</p></div>;
  }

  return (
    <div className="container mx-auto p-4 space-y-6">
      <h1 className="text-2xl font-semibold">Gestión de Licencias</h1>

      {/* Section for Contract and Order Selection - To be implemented in Step 4 */}
      <div className="p-4 border rounded-md shadow-sm bg-card text-card-foreground">
        <h2 className="text-xl font-medium mb-4">1. Selección de Contrato y Pedido</h2>
        {/* Placeholder for Contract/Order selectors */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
          {/* Contrato Selector */}
          <div>
            <label htmlFor="contrato-select" className="block text-sm font-medium text-gray-700 mb-1">
              Contrato
            </label>
            <Select
              value={selectedContratoId || ''}
              onValueChange={handleContratoChange}
              disabled={loadingContratos}
            >
              <SelectTrigger id="contrato-select">
                <SelectValue placeholder={loadingContratos ? "Cargando contratos..." : "Seleccione un contrato"} />
              </SelectTrigger>
                <SelectContent>
                  {contratos.filter(contrato => contrato.id !== undefined).map((contrato) => (
                    <SelectItem key={contrato.id} value={contrato.id!}> 
                      {contrato.residencia} ({contrato.id})
                    </SelectItem>
                  ))}
                </SelectContent>
            </Select>
          </div>

          {/* Pedido Selector */}
          <div>
            <label htmlFor="pedido-select" className="block text-sm font-medium text-gray-700 mb-1">
              Pedido
            </label>
            <div className="flex items-center space-x-2">
              <Select
                value={selectedPedidoId || ''}
                onValueChange={handlePedidoChange}
                disabled={!selectedContratoId || loadingPedidos || availablePedidos.length === 0}
              >
                <SelectTrigger id="pedido-select">
                  <SelectValue placeholder={
                    !selectedContratoId ? "Seleccione un contrato primero" :
                    loadingPedidos ? "Cargando pedidos..." :
                    availablePedidos.length === 0 ? "No hay pedidos para este contrato" :
                    "Seleccione un pedido"
                  } />
                </SelectTrigger>
                <SelectContent>
                  {availablePedidos.map((pedido) => (
                    <SelectItem key={pedido.id} value={pedido.id}>
                      {`${selectedContrato?.residencia || ''} - ${pedido.tipo} - ${pedido.fechaInicio ? formatFCZHToMonthYear(pedido.fechaInicio) : 'N/A'}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedPedido && (
                <Badge variant={selectedPedido.activo ? "default" : "destructive"} className="whitespace-nowrap">
                  {selectedPedido.activo ? "Activo" : "Inactivo"}
                </Badge>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* Section for Invoice Display - To be implemented in Step 5 */}
      <div className="p-4 border rounded-md shadow-sm bg-card text-card-foreground">
        <h2 className="text-xl font-medium mb-4">2. Información de Factura(s)</h2>
        {/* Placeholder for Invoice display */}
        {!selectedPedido ? (
          <p className="text-gray-500">Seleccione un pedido para ver la información de facturas.</p>
        ) : loadingFacturas ? (
          <p>Cargando facturas...</p>
        ) : (
          <div>
            {selectedPedido.tipo === 'suscripcion' ? (
              // --- Display for 'suscripcion' type ---
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Facturas de Suscripción:</h3>
                {facturas.length === 0 ? (
                  <p>No hay facturas para este pedido de suscripción.</p>
                ) : (
                  <ul className="space-y-2">
                    {facturas.map((factura) => (
                      <li
                        key={factura.id}
                        onClick={() => handleFacturaSelectionForSubscription(factura.id as FacturaId)}
                        className={`p-3 border rounded-md cursor-pointer hover:bg-gray-50 ${
                          selectedFacturaId === factura.id ? 'ring-2 ring-blue-500 bg-blue-50' : ''
                        }`}
                      >
                        <div className="flex justify-between items-center">
                          <div>
                            <p className="font-semibold">ID: {factura.id}</p>
                            <p className="text-sm text-gray-600">
                              Fecha: {factura.fecha ? formatFCZHToMonthYear(factura.fecha) : 'N/A'}
                            </p>
                          </div>
                          <div className="text-right">
                            <Badge 
                              variant={
                                factura.estadoDePago === 'paid' ? 'default' : 
                                factura.estadoDePago === 'partial' ? 'secondary' : 'destructive'
                              }
                            >
                              {factura.estadoDePago}
                            </Badge>
                            <p className="text-sm">Monto: {factura.montoTotal?.toFixed(2) || '0.00'} {factura.monedaFactura}</p>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {/* TODO: Implement Add Invoice functionality - for now, just a button */}
                <Button variant="outline" size="sm" className="mt-2" onClick={() => toast({ title: "Funcionalidad Pendiente", description: "Agregar nueva factura para suscripción aún no implementado."})}>
                  <PlusCircle className="mr-2 h-4 w-4" /> Agregar Factura
                </Button>

                {/* Display selected factura details for subscription */}
                {selectedFactura && (
                  <div className="mt-6 p-4 border rounded-md bg-gray-50">
                    <h4 className="text-md font-semibold mb-2">Detalles de Factura Seleccionada (ID: {selectedFactura.id})</h4>
                    <p><strong>Fecha:</strong> {selectedFactura.fecha ? formatFCZHToMonthYear(selectedFactura.fecha) : 'N/A'}</p>
                    <p><strong>Estado de Pago:</strong> <Badge variant={selectedFactura.estadoDePago === 'paid' ? 'default' : selectedFactura.estadoDePago === 'partial' ? 'secondary' : 'destructive'}>{selectedFactura.estadoDePago}</Badge></p>
                    <p><strong>Monto Total:</strong> {selectedFactura.montoTotal?.toFixed(2) || '0.00'} {selectedFactura.monedaFactura}</p>
                    {/* Add more fields as needed */}
                  </div>
                )}
              </div>
            ) : (
              // --- Display for other Pedido types ---
              <div>
                {selectedPedido.modoPago !== 'libre de costo' && facturas.length === 0 && (
                  <p className="text-orange-600 font-semibold p-3 bg-orange-50 border border-orange-300 rounded-md">
                    Para crear una licencia con este pedido, debe crear una factura primero.
                  </p>
                )}

                {selectedPedido.modoPago === 'libre de costo' && (
                     <p className="text-green-700 font-semibold p-3 bg-green-50 border border-green-300 rounded-md">
                        Modo de pago: Libre de costo. No se requiere una factura estándar para la licencia.
                     </p>
                )}

                {facturas.length > 0 && selectedFactura && (
                  <div className="p-4 border rounded-md bg-gray-50">
                    <h3 className="text-lg font-medium mb-2">Información de la Factura (ID: {selectedFactura.id})</h3>
                    <p><strong>Fecha:</strong> {selectedFactura.fecha ? formatFCZHToMonthYear(selectedFactura.fecha) : 'N/A'}</p>
                    <p><strong>Estado de Pago:</strong> <Badge variant={selectedFactura.estadoDePago === 'paid' ? 'default' : selectedFactura.estadoDePago === 'partial' ? 'secondary' : 'destructive'}>{selectedFactura.estadoDePago}</Badge></p>
                    <p><strong>Monto Total:</strong> {selectedFactura.montoTotal?.toFixed(2) || '0.00'} {selectedFactura.monedaFactura}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

      </div>
      
      {/* Section for License Display & Actions - To be implemented in Step 6 */}
      <div className="p-4 border rounded-md shadow-sm bg-card text-card-foreground">
        <h2 className="text-xl font-medium mb-4">3. Licencias y Acciones</h2>
        {/* Placeholder for License display and actions */}
        {!selectedPedido ? (
          <p className="text-gray-500">Seleccione un pedido para ver las licencias.</p>
        ) : loadingLicencias ? (
          <p>Cargando licencias...</p>
        ) : (
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Licencias Existentes:</h3>
            {licencias.length === 0 ? (
              <p>No hay licencias para este pedido.</p>
            ) : (
              <ul className="space-y-3">
                {licencias.map((licencia) => (
                  <li key={licencia.id} className="p-3 border rounded-md flex justify-between items-center">
                    <div>
                      <p className="font-semibold">ID: <span className="font-normal">{licencia.id}</span></p>
                      <p className="text-sm">
                        Inicio: <span className="font-normal">{licencia.fechaInicio ? formatFCZHToMonthYear(licencia.fechaInicio) : 'N/A'}</span>
                      </p>
                      <p className="text-sm">
                        Fin: <span className="font-normal">{licencia.fechaFin ? formatFCZHToMonthYear(licencia.fechaFin) : 'Perpetua/N/A'}</span>
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRevokeLicense(licencia.id as string)}
                      className="text-red-600 hover:text-red-700 border-red-300 hover:border-red-400"
                    >
                      <Trash2 className="mr-2 h-4 w-4" /> Revocar
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        
        {/* Validation Status */}
        {isValidating && <p className="text-lg font-semibold text-blue-600 mt-4">Validando...</p>}
        {validationStatus && (
          <div className={`mt-4 p-3 rounded-md ${validationStatus.isValid ? 'bg-green-100 border-green-400' : 'bg-red-100 border-red-400'}`}>
            <p className={`text-lg font-bold ${validationStatus.isValid ? 'text-green-700' : 'text-red-700'}`}>
              Estado de Validación: {validationStatus.isValid ? "Válido" : "Inválido"}
            </p>
            {!validationStatus.isValid && validationStatus.errorMessages.length > 0 && (
              <ul className="list-disc list-inside mt-2 text-red-600">
                {validationStatus.errorMessages.map((msg, index) => (
                  <li key={index}>{msg}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        {/* Global Action Buttons - might be better placed within the License section */}
        <div className="flex space-x-4 mt-6">
            <Button
            onClick={handleGenerateLicense}
            disabled={isValidating || isGenerating || !validationStatus?.isValid}
            >
            {isGenerating ? "Generando..." : "Generar Licencia"}
            </Button>
        </div>
      </div>



    </div>
  );
};

export default LicenciasPage;
