'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase'; // Assuming firebase is initialized in @/lib/firebase
import { collection, addDoc, getDocs, doc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { ContratoResidencia, ContratoResidenciaId, Cliente, ClienteId, ClienteProbando, Pedido } from '../../../../shared/models/contratos'; // Adjust path as needed
import { UserProfile, UserId, ResidenciaId, campoFechaConZonaHoraria } from '../../../../shared/models/types'; // Adjust path as needed
import { writeClientLog } from '@/lib/utils'; // Adjust path as needed
import { Button } from '@/components/ui/button'; // Adjust path as needed
import { Input } from '@/components/ui/input'; // Adjust path as needed
import { Label } from '@/components/ui/label'; // Adjust path as needed
import { Checkbox } from '@/components/ui/checkbox'; // Adjust path as needed
import { useToast } from '@/hooks/useToast'; // Adjust path as needed
import { formatInTimeZone, toDate, fromZonedTime,  } from 'date-fns-tz'; // For date handling
import { format, addMonths } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';

// --- Helper function to get user claims ---
async function getUserClaims(uid: string): Promise<any> {
  const userDocRef = doc(db, 'users', uid);
  const userDocSnap = await getDoc(userDocRef);
  if (userDocSnap.exists()) {
    return userDocSnap.data()?.claims || {};
  }
  return {};
}

// --- Helper function to create OrdenDeCompra for trial ---
async function CrearPedidoPrueba (
  contratoId: ContratoResidenciaId,
  fechaInicioContrato: campoFechaConZonaHoraria,
  fechaFinPruebaContrato: campoFechaConZonaHoraria, // This will be the 'fechaFin' for the OrdenDeCompra
  // clienteId: ClienteId, // Potentially add if OrdenDeCompra needs direct link to Cliente
  // residenciaId: ResidenciaId // Potentially add if OrdenDeCompra needs direct link to a primary Residencia
) {
  try {
    const PedidoData: Omit<Pedido, 'id'> = {
      contrato: contratoId,
      tipo: 'licencia temporal',
      modoPago: 'libre de costo',
      moneda: 'HNL',
      montoTotal: 0,
      periodicidad: null,
      fechaInicio: fechaInicioContrato,
      fechaFin: fechaFinPruebaContrato,
      limitacionUsuarios: true,
      cantUsuarios: 10,
      activo: true,
    };

    const docRef = await addDoc(collection(db, 'pedidos'), PedidoData);
    console.log('Pedido de prueba creado con ID: ', docRef.id);
    // Consider adding a success toast here, but be mindful of multiple toasts if handleSubmit also shows one.
    // toast({ title: "Orden de Compra de prueba creada." });
  } catch (error) {
    console.error('Error creating Pedido de prueba:', error);
    // Consider adding an error toast here.
    // toast({ title: "Error al crear Orden de Compra de prueba.", variant: "destructive" });
  }
}

// --- Main Page Component ---
export default function CrearContratoResidenciaPage() {
  const { user: authUser, loading: authLoading, error: authError } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [isMaster, setIsMaster] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  // --- Form State ---
  const [isClienteDePrueba, setIsClienteDePrueba] = useState(false);
  const [clientePruebaNombre, setClientePruebaNombre] = useState('');
  const [pruebaSolucion, setPruebaSolucion] = useState<boolean>(true); // For managing trial solution
  const [allResidencias, setAllResidencias] = useState<{ id: ResidenciaId; nombre: string; zonaHoraria?: string }[]>([]);
  const [fechaInicioDate, setFechaInicioDate] = useState<Date | null>(new Date());
  const [fechaInicioTime, setFechaInicioTime] = useState<string>(formatInTimeZone(new Date(), 'UTC', 'HH:mm')); // Default to current time in UTC
  const [esIndefinido, setEsIndefinido] = useState<boolean>(false);
  const [fechaFinDate, setFechaFinDate] = useState<Date | null>(null);
  const [fechaFinTime, setFechaFinTime] = useState<string>('12:00');  
  const [correoOficial, setCorreoOficial] = useState('');
  const [selectedResidenciaId, setSelectedResidenciaId] = useState<ResidenciaId | ''>('');
  const [residenciaZonaHoraria, setResidenciaZonaHoraria] = useState<string | null>(null); // To store the TZ of the selected Residencia
  const [allResidenciasConContrato, setAllResidenciasConContrato] = useState<Set<ResidenciaId>>(new Set());
  const [allResidenciasSinContrato, setAllResidenciasSinContrato] = useState<{ id: ResidenciaId; nombre: string; zonaHoraria?: string }[]>([]);
  const [fechaFinPruebaDate, setFechaFinPruebaDate] = useState<Date | null>(null);
  const [fechaFinPruebaTime, setFechaFinPruebaTime] = useState<string>('23:59'); // Or a suitable default
  // pruebaSolucion state (already there or add it if you removed it from previous attempt)
// const [pruebaSolucion, setPruebaSolucion] = useState<boolean>(true);


    // --- State for Listing Contracts ---
  const [contratos, setContratos] = useState<ContratoResidencia[]>([]);
  const [loadingContratos, setLoadingContratos] = useState<boolean>(true);

    // --- State for Delete Confirmation ---
  const [isConfirmingDelete, setIsConfirmingDelete] = useState<boolean>(false);
  const [contratoToDeleteId, setContratoToDeleteId] = useState<ContratoResidenciaId | null>(null);

    // --- State for Editing Contract ---
  const [editingContratoId, setEditingContratoId] = useState<ContratoResidenciaId | null>(null);
  const [isEditing, setIsEditing] = useState<boolean>(false); // To manage form mode

  // --- State for Client Selection ---
  const [allClientes, setAllClientes] = useState<Cliente[]>([]); // To store fetched clients
  const [selectedClienteId, setSelectedClienteId] = useState<ClienteId | ''>(''); // ID of selected existing client
  const [loadingClientes, setLoadingClientes] = useState<boolean>(false);

  // --- useEffect for Auth and Role Check ---
  useEffect(() => {
    if (authLoading) {
      setIsLoading(true);
      return;
    }
    if (authError) {
      toast({ title: 'Error de Autenticación', description: authError.message, variant: 'destructive' });
      router.replace('/'); // Redirect to login or home on auth error
      return;
    }
    if (!authUser) {
      router.replace('/'); // Redirect if not logged in
      return;
    }

    const fetchProfileAndClaims = async () => {
      try {
          setIsLoading(true); // Set loading true at the beginning
          // Fetch custom claims from the auth token
          const idTokenResult = await authUser.getIdTokenResult(true); // Force refresh
          const userClaims = idTokenResult.claims;
          console.log('Fetched User Claims:', userClaims); // For debugging

          // 1. Validate 'master' role from ID token claims
          const hasMasterClaim = Array.isArray(userClaims.roles) && userClaims.roles.includes('master');

          if (!hasMasterClaim) {
            toast({ title: 'Acceso Denegado', description: 'Permisos insuficientes (claims).', variant: 'destructive' });
            router.replace('/dashboard'); 
            setIsLoading(false);
            return;
          }

          // 2. Fetch user profile document from Firestore
          const profileDocRef = doc(db, 'users', authUser.uid);
          const profileSnap = await getDoc(profileDocRef);

          if (profileSnap.exists()) {
            const profileData = profileSnap.data() as UserProfile;
            console.log('Fetched User Profile Data:', profileData); // For debugging

            // 3. Validate 'master' role from Firestore profile document
            const hasMasterRoleInProfile = Array.isArray(profileData.roles) && profileData.roles.includes('master');

            if (hasMasterRoleInProfile) {
              // Both claim and profile document confirm master role
              setUserProfile(profileData);
              setIsMaster(true);
            } else {
              toast({ title: 'Acceso Denegado', description: 'Inconsistencia de permisos (perfil).', variant: 'destructive' });
              router.replace('/');
            }
          } else {
            // Profile document does not exist, which is necessary for the second part of validation
            toast({ title: 'Acceso Denegado', description: 'No se encontró el perfil de usuario.', variant: 'destructive' });
            router.replace('/'); 
          }
      } catch (error: any) {
          toast({ title: 'Error Cargando Perfil o Claims', description: error.message, variant: 'destructive' });
          router.replace('/');
      } finally {
          setIsLoading(false);
      }
      };


    fetchProfileAndClaims();
  }, [authUser, authLoading, authError, router, toast]);

  // --- TODO: useEffect to fetch Residencias ---
  useEffect(() => {
    // Inside the useEffect for fetching Residencias:
    const fetchResidencias = async () => {
        try {
            const residenciasCol = collection(db, 'residencias'); // Assuming 'residencias' is your collection name
            const snapshot = await getDocs(residenciasCol);
            const residenciasData = snapshot.docs.map(doc => ({
              id: doc.id as ResidenciaId,
              nombre: doc.data().nombre || `Residencia ${doc.id}`, // Adjust if nombre field is different
              zonaHoraria: doc.data().zonaHoraria // Ensure this field exists in your Firestore 'residencias' documents
            }));
            setAllResidencias(residenciasData);
        } catch (err) {
            console.error("Error fetching residencias:", err);
            toast({ title: 'Error al cargar residencias', description: (err as Error).message, variant: 'destructive' });
        }
    };
    if (isMaster) { // Only fetch if user is authorized
        fetchResidencias();
    }
  }, [isMaster, toast]);

  // --- useEffect to fetch ContratosResidencia ---
  useEffect(() => {
    const fetchContratos = async () => {
      if (!isMaster) {
        setContratos([]);
        setLoadingContratos(false);
        return;
      }
      setLoadingContratos(true);
      try {
        const contratosCol = collection(db, 'contratosResidencia');
        // Optional: Add ordering, e.g., by fechaCreacionObjeto
        // const q = query(contratosCol, orderBy('fechaCreacionObjeto', 'desc'));
        const snapshot = await getDocs(contratosCol); // or await getDocs(q) if using query
        
        const contratosData = snapshot.docs.map(doc => ({
          id: doc.id as ContratoResidenciaId,
          ...(doc.data() as Omit<ContratoResidencia, 'id'>),
        }));
        setContratos(contratosData);
        const residenciasConContrato = new Set<ResidenciaId>();
        contratosData.forEach(contrato => {
        // Assuming contrato.residencias is an array and for active contracts, it will have one ID.
        // If your model changes to contrato.residenciaId, use that directly.
        // The field is now contrato.residencia (single ResidenciaId or null)
        if (contrato.residencia) { // Check if it's not null or undefined
          residenciasConContrato.add(contrato.residencia); 
        }

        });
        setAllResidenciasConContrato(residenciasConContrato);
      } catch (error: any) {
        console.error("Error fetching contratos:", error);
        toast({ title: 'Error al cargar contratos', description: error.message, variant: 'destructive' });
        setContratos([]); // Clear contracts on error
      } finally {
        setLoadingContratos(false);
      }
    };

    fetchContratos();
  }, [isMaster, toast]); // Re-fetch if isMaster status changes or toast instance changes

  // ... (your existing state declarations like useState for fechaInicioDate, pruebaSolucion, etc.) ...

  // --- START: useEffect to set default fechaFinPruebaDate ---
  useEffect(() => {
    if (pruebaSolucion && fechaInicioDate) {
      // Calculate the date three months after fechaInicioDate.
      // fechaInicioDate is a JavaScript Date object (typically representing midnight UTC for the selected day).
      const newFinPruebaDate = addMonths(fechaInicioDate, 3);
      setFechaFinPruebaDate(newFinPruebaDate);

      // Optional: If you also want to set a default time for fechaFinPruebaTime when this happens:
      // For example, to set it to 23:59
      // if (!fechaFinPruebaTime || fechaFinPruebaTime === '') { // Only if not already set or to override
      //   setFechaFinPruebaTime('23:59');
      // }
    }
    // If pruebaSolucion is turned off, or fechaInicioDate is cleared,
    // you might want to clear fechaFinPruebaDate.
    // If so, uncomment the following:
    // else {
    //   setFechaFinPruebaDate(null);
    //   // setFechaFinPruebaTime('00:00'); // Or your desired default time
    // }
  }, [fechaInicioDate, pruebaSolucion, setFechaFinPruebaDate]); // Add setFechaFinPruebaTime to dependencies if you manage it here
  // --- END: useEffect to set default fechaFinPruebaDate ---

  // ... (rest of your component code, like handleSubmit, JSX, etc.) ...

  useEffect(() => {
    if (selectedResidenciaId) {
      const residencia = allResidencias.find(r => r.id === selectedResidenciaId);
      if (residencia && residencia.zonaHoraria) {
        setResidenciaZonaHoraria(residencia.zonaHoraria);
        // Reset date states if you want to re-default them when residencia (and thus timezone) changes
        // setFechaInicioDate(new Date()); 
        // setFechaInicioTime(formatInTimeZone(new Date(), residencia.zonaHoraria, 'HH:mm'));
      } else {
        setResidenciaZonaHoraria(null); // Or 'UTC' and show a warning
        if (residencia && !residencia.zonaHoraria) {
          toast({ title: 'Advertencia', description: `La residencia seleccionada no tiene una zona horaria configurada. Se usará UTC por defecto.`, variant: 'destructive' });
          setResidenciaZonaHoraria('UTC'); // Fallback
        }
      }
    } else {
      setResidenciaZonaHoraria(null);
    }
  }, [selectedResidenciaId, allResidencias, toast]);

  // --- useEffect to filter Residencias that don't have a contract ---
  useEffect(() => {
    const residenciasFiltradas = allResidencias.filter(
      res => !allResidenciasConContrato.has(res.id)
    );
    setAllResidenciasSinContrato(residenciasFiltradas);
  }, [allResidencias, allResidenciasConContrato]);


  // --- useEffect to fetch Clientes ---
  useEffect(() => {
    const fetchClientes = async () => {
      if (!isMaster) {
        setAllClientes([]);
        return;
      }
      setLoadingClientes(true);
      try {
        const clientesCol = collection(db, 'clientes'); // Assuming 'clientes' is your collection name
        const snapshot = await getDocs(clientesCol);
        const clientesData = snapshot.docs.map(doc => ({
          id: doc.id as ClienteId,
          ...(doc.data() as Omit<Cliente, 'id'>),
        }));
        setAllClientes(clientesData);
      } catch (error: any) {
        console.error("Error fetching clientes:", error);
        toast({ title: 'Error al cargar clientes', description: error.message, variant: 'destructive' });
      } finally {
        setLoadingClientes(false);
      }
    };

    if (isMaster) { // Only fetch if user is authorized
        fetchClientes();
    }
  }, [isMaster, toast]);

  // --- Handle Form Submission ---
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    setIsLoading(true);

    if (!selectedResidenciaId) {
        toast({ title: 'Error de Validación', description: 'Debe seleccionar una residencia.', variant: 'destructive' });
        setIsLoading(false);
        return;
    }

    const currentSelectedResidencia = allResidencias.find(r => r.id === selectedResidenciaId);
    if (!currentSelectedResidencia || !currentSelectedResidencia.zonaHoraria) {
        toast({ title: 'Error de Configuración', description: 'La residencia seleccionada no tiene una zona horaria configurada. No se puede crear el contrato.', variant: 'destructive' });
        setIsLoading(false);
        return;
    }
    const effectiveZone = currentSelectedResidencia.zonaHoraria;

    // Validation: Check if the selected residencia already has a contract (important for CREATE mode)
    if (!isEditing && allResidenciasConContrato.has(selectedResidenciaId)) {
        toast({ title: 'Error de Duplicidad', description: `La residencia '${currentSelectedResidencia.nombre}' ya tiene un contrato asociado.`, variant: 'destructive' });
        setIsLoading(false);
        return;
    }

    if (!authUser?.uid || !isMaster) {
        toast({ title: 'Error', description: 'No autorizado o usuario no disponible.', variant: 'destructive' });
        return;
    }

    

    let finalClienteId: ClienteId | null = null;

    // --- Client Logic: Create new 'ClienteProbando' document or use selected existing client ID ---
    if (isClienteDePrueba) {
      if (!clientePruebaNombre.trim()) {
          toast({ title: 'Error de Validación', description: 'El nombre para el cliente de prueba es requerido.', variant: 'destructive' });
          setIsLoading(false);
          return;
      }
      const personaClienteData: ClienteProbando = {
          nombre: clientePruebaNombre.trim(),
      };
      // Temporary ID for the new client, Firestore will assign the real one
      // We don't assign `id` here, Firestore does.
      const newClienteDoc: Omit<Cliente, 'id'> = { // Omit 'id' as Firestore generates it
          tipoPersonaCliente: 'ClienteProbando',
          personaCliente: personaClienteData,
          idClienteOdoo: null,
          email: null,
          telefonoFijo: null,
          telefonoMovil: null,
          clienteAsociado: null,
          representanteLegal: null,
      };
      try {
          const clienteDocRef = await addDoc(collection(db, 'clientes'), newClienteDoc);
          const newRegisteredClientId = clienteDocRef.id as ClienteId; // This is now definitively a string

          finalClienteId = newRegisteredClientId; // Assign to the outer scope variable for use later in the contract

          toast({ title: 'Cliente de Prueba Creado', description: `Nuevo cliente de prueba con ID: ${newRegisteredClientId} creado.` });
          
          // Construct the full client object to add to state
          const clientDataForState: Cliente = {
              ...newClienteDoc, // Contains all fields from Cliente except 'id'
              id: newRegisteredClientId // Add the 'id' which is now a string
          };
          setAllClientes(prev => [...prev, clientDataForState]);

      } catch (clientError: any) {
        console.error("Error creando cliente de prueba:", clientError);
        toast({ title: 'Error Creando Cliente de Prueba', description: clientError.message, variant: 'destructive' });
        setIsLoading(false);
        return;
      }
    } else { // Use an existing client
      if (!selectedClienteId) {
          toast({ title: 'Error de Validación', description: 'Debe seleccionar un cliente existente si no es un cliente de prueba.', variant: 'destructive' });
          setIsLoading(false);
          return;
      }
      finalClienteId = selectedClienteId;
    }

    if (!finalClienteId) { // Should not happen if logic above is correct
        toast({ title: 'Error Crítico', description: 'No se pudo determinar el ID del cliente.', variant: 'destructive' });
        setIsLoading(false);
        return;
    }

    // --- Construct campoFechaConZonaHoraria for fechaInicio ---
    if (!fechaInicioDate || !fechaInicioTime || !effectiveZone) { // effectiveZone check is now earlier
        toast({ title: 'Error de Validación', description: 'Fecha de inicio incompleta o zona horaria de residencia no disponible.', variant: 'destructive' });
        setIsLoading(false);
        return;
    }
    const [startHours, startMinutes] = fechaInicioTime.split(':').map(Number);
    const startDateWithTime = fromZonedTime(
        new Date(fechaInicioDate.getFullYear(), fechaInicioDate.getMonth(), fechaInicioDate.getDate(), startHours, startMinutes),
        effectiveZone
    );
    const finalFechaInicio: campoFechaConZonaHoraria = {
        fecha: formatInTimeZone(startDateWithTime, effectiveZone, "yyyy-MM-dd HH:mm"),
        zonaHoraria: effectiveZone,
    };

    // --- Construct campoFechaConZonaHoraria for fechaFin ---
    let finalFechaFin: campoFechaConZonaHoraria | null = null;

    if (esIndefinido) {
        finalFechaFin = null; // Contract is indefinite, so no specific end date
    } else {
        // If the contract is not indefinite, fechaFinDate and fechaFinTime are required.
        // effectiveZone is assumed to be already validated and available from fechaInicio logic.
        if (!fechaFinDate || !fechaFinTime) {
            toast({
                title: 'Error de Validación',
                description: 'La fecha y hora de fin son obligatorias cuando el contrato no es indefinido.',
                variant: 'destructive',
            });
            setIsLoading(false);
            return; // Stop execution if validation fails
        }

        if (!effectiveZone) {
            // This check might be redundant if effectiveZone is guaranteed to be set from fechaInicio validation,
            // but included for robustness if there's any uncertainty.
            toast({ 
                title: 'Error de Configuración', 
                description: 'Zona horaria efectiva no disponible para fecha de fin.', 
                variant: 'destructive' 
            });
            setIsLoading(false);
            return;
        }

        const [endHours, endMinutes] = fechaFinTime.split(':').map(Number);
        // Ensure fechaFinDate is a valid Date object
        const endDateWithTime = fromZonedTime(
            new Date(fechaFinDate.getFullYear(), fechaFinDate.getMonth(), fechaFinDate.getDate(), endHours, endMinutes),
            effectiveZone
        );

        finalFechaFin = {
            fecha: formatInTimeZone(endDateWithTime, effectiveZone, "yyyy-MM-dd HH:mm"),
            zonaHoraria: effectiveZone,
        };
    }


    // --- Construct campoFechaConZonaHoraria for fechaFinPrueba ---
    let calculatedFechaFinPrueba: campoFechaConZonaHoraria | null = null;
    if (pruebaSolucion && fechaInicioDate && fechaInicioTime && effectiveZone) {
        const [hours, minutes] = fechaInicioTime.split(':').map(Number);
        const zonedStartDate = fromZonedTime(
            new Date(fechaInicioDate.getFullYear(), fechaInicioDate.getMonth(), fechaInicioDate.getDate(), hours, minutes),
            effectiveZone
        );
        const fechaFinPruebaDate = new Date(zonedStartDate);
        fechaFinPruebaDate.setMonth(fechaFinPruebaDate.getMonth() + 3);
        calculatedFechaFinPrueba = {
            fecha: formatInTimeZone(fechaFinPruebaDate, effectiveZone, "yyyy-MM-dd HH:mm"),
            zonaHoraria: effectiveZone,
        };
    }

    // --- Validate email for correoOficial ---
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!correoOficial || !emailRegex.test(correoOficial)) {
        toast({ title: 'Error de Validación', description: 'Por favor, introduce un correo oficial de comunicación válido.', variant: 'destructive' });
        setIsLoading(false);
        return;
    }
    
    const now = new Date();
    const clientNowInUTC: campoFechaConZonaHoraria = {
        fecha: formatInTimeZone(now, 'UTC', "yyyy-MM-dd HH:mm:ss.SSS"),
        zonaHoraria: 'UTC'
    };

    if (isEditing && editingContratoId) {
        // --- UPDATE CONTRATO LOGIC ---
        // Note: Changing the 'cliente' (ClienteId) of an existing contract via this form is generally not done.
        // We'll assume finalClienteId determined above is for creating new contracts, or if edit form allowed changing client.
        // For this version, updates will not change the ContratoResidencia.cliente field.
        const existingContractToUpdate = contratos.find(c => c.id === editingContratoId);
        if (!existingContractToUpdate) {
            toast({ title: 'Error', description: 'No se encontró el contrato para actualizar.', variant: 'destructive' });
            setIsLoading(false);
            return;
        }

        const updatedContratoData: Partial<Omit<ContratoResidencia, 'id' | 'cliente' | 'fechaCreacionObjeto'>> = {
            residencia: selectedResidenciaId,
            fechaInicio: finalFechaInicio,
            fechaFin: esIndefinido ? null : finalFechaFin,
            esIndefinido: esIndefinido,
            correoOficialComunicacion: correoOficial,
            // contactosResponsables, recordatorios, etc., are not on this form for editing yet
            pruebaSolucion: true, // Assuming this can be edited or defaulted
            fechaFinPrueba: null, // Assuming this can be edited or defaulted
            // suscripciones not on form
            fechaUltimaModificacionObjeto: clientNowInUTC,
            // estadoContrato not on form for edit (could be more complex)
            // urlContratoOdoo not on form
        };

        try {
            const contratoRef = doc(db, 'contratosResidencia', editingContratoId);
            await updateDoc(contratoRef, updatedContratoData);
            toast({ title: 'Contrato Actualizado', description: `Contrato ${editingContratoId} actualizado.` });
            
            await writeClientLog(
                authUser.uid as UserId, 'contrato',
                { relatedDocPath: contratoRef.path, details: { action: 'update_contrato_residencia', contratoId: editingContratoId, changes: updatedContratoData } }
            );

            setContratos(prev => prev.map(c => c.id === editingContratoId ? { ...c, ...updatedContratoData, id: editingContratoId, cliente: existingContractToUpdate.cliente } : c));
            handleCancelEdit();
        } catch (error: any) {
            console.error("Error actualizando contrato:", error);
            toast({ title: 'Error Actualizando Contrato', description: error.message, variant: 'destructive' });
            // Log error
        }

    } else {
        // --- CREATE CONTRATO LOGIC ---
        const newContratoData: Omit<ContratoResidencia, 'id'> = {
            cliente: finalClienteId,
            residencia: selectedResidenciaId,
            fechaInicio: finalFechaInicio,
            fechaFin: esIndefinido ? null : finalFechaFin, // Or null, depending on your model preference
            esIndefinido: esIndefinido,
            correoOficialComunicacion: correoOficial,
            contactosResponsables: [],
            recordatorios: null,
            pruebaSolucion: pruebaSolucion, // MODIFIED: Use the 'pruebaSolucion' state variable
            fechaFinPrueba: calculatedFechaFinPrueba, // MODIFIED: Use the 'calculatedFechaFinPrueba' variable
            fechaCreacionObjeto: clientNowInUTC,
            fechaUltimaModificacionObjeto: clientNowInUTC,
            estadoContrato: { estaActivo: true, usuariosIlimitados: true, usuariosLicenciados: 0 },
            urlContratoOdoo: null,
        };

        try {
            const docRef = await addDoc(collection(db, 'contratosResidencia'), newContratoData);
            const newContratoId = docRef.id as ContratoResidenciaId; // Get the new ID

            toast({ title: 'Contrato Creado', description: `Contrato ${docRef.id} para cliente ${finalClienteId} creado.` });
            
            await writeClientLog(
                authUser.uid as UserId, 'contrato',
                { relatedDocPath: docRef.path, details: { action: 'create_contrato_residencia', contratoId: docRef.id, data: newContratoData } }
            );

            // --- Call CrearPedidoPrueba if a trial solution is included ---
            if (newContratoData.pruebaSolucion && newContratoData.fechaFinPrueba) {
                try {
                    await CrearPedidoPrueba(
                        newContratoId,                      // The ID of the newly created contract
                        newContratoData.fechaInicio,        // The start date of the contract
                        newContratoData.fechaFinPrueba      // The end date of the trial period
                    );
                    // You can add a success toast for the Pedido creation if desired,
                    // though CrearPedidoPrueba might already log to console.
                    // toast({ title: 'Pedido de Prueba Creado Automáticamente', description: `Pedido para el contrato ${newContratoId} creado.` });
                } catch (pedidoError: any) {
                    console.error("Error creando Pedido de prueba asociado al contrato:", pedidoError);
                    // Toast an error message so the user is aware the trial Pedido failed
                    toast({ 
                        title: 'Error al Crear Pedido de Prueba', 
                        description: `El contrato ${newContratoId} se creó, pero el pedido de prueba automático falló: ${pedidoError.message}`, 
                        variant: 'destructive',
                        duration: 7000 // Longer duration for important errors
                    });
                    // Depending on your requirements, you might want to log this error to Firestore as well.
                }
            }

            setContratos(prev => [...prev, { ...newContratoData, id: docRef.id as ContratoResidenciaId }]);
            handleCancelEdit(); // Reset form
            // Clear client-specific fields after successful creation
            setClientePruebaNombre('');
            setSelectedClienteId('');

        } catch (error: any) {
            console.error("Error creando contrato:", error);
            toast({ title: 'Error Creando Contrato', description: error.message, variant: 'destructive' });
            // Log error
        }
    }
    setIsLoading(false);
};

  const handleDeleteContrato = (id: ContratoResidenciaId) => {
    if (!isMaster) {
      toast({ title: "Acción no permitida", description: "Solo usuarios 'master' pueden eliminar contratos.", variant: "destructive" });
      return;
    }
    const contrato = contratos.find(c => c.id === id);
    if (!contrato) {
        toast({ title: "Error", description: "Contrato no encontrado.", variant: "destructive" });
        return;
    }
    setContratoToDeleteId(id);
    setIsConfirmingDelete(true);
  };

  const confirmDeleteContrato = async () => {
    if (!contratoToDeleteId || !authUser?.uid || !isMaster) {
      toast({ title: "Error", description: "No se puede eliminar el contrato. Verifique permisos o selección.", variant: "destructive" });
      setIsConfirmingDelete(false);
      setContratoToDeleteId(null);
      return;
    }

    setIsLoading(true); // Use general loading state or a specific delete loading state
    try {
      const contratoRef = doc(db, 'contratosResidencia', contratoToDeleteId);
      await deleteDoc(contratoRef);

      toast({ title: 'Contrato Eliminado', description: `El contrato ${contratoToDeleteId} ha sido eliminado.` });
      
      await writeClientLog(
        authUser.uid as UserId,
        'contrato',
        {
          relatedDocPath: contratoRef.path,
          details: { action: 'delete_contrato_residencia', contratoId: contratoToDeleteId }
        }
      );

      // Update local state
      setContratos(prevContratos => prevContratos.filter(c => c.id !== contratoToDeleteId));

    } catch (error: any) {
      console.error("Error eliminando contrato:", error);
      toast({ title: 'Error al Eliminar', description: error.message, variant: "destructive" });
      await writeClientLog(
        authUser.uid as UserId,
        'contrato',
        {
          details: { action: 'delete_contrato_residencia_error', contratoId: contratoToDeleteId, error: error.message }
        }
      );
    } finally {
      setIsConfirmingDelete(false);
      setContratoToDeleteId(null);
      setIsLoading(false);
    }
  };

  const handleEditContrato = async (id: ContratoResidenciaId) => { // Made async
    if (!isMaster) {
      toast({ title: "Acción no permitida", variant: "destructive" });
      return;
    }
    const contratoToEdit = contratos.find(c => c.id === id);
    if (!contratoToEdit) {
      toast({ title: 'Error', description: 'Contrato no encontrado para editar.', variant: 'destructive' });
      return;
    }

    setEditingContratoId(id);
    setIsEditing(true);
    setIsLoading(true); // Indicate loading while fetching client data

    // Fetch the associated client document
    let associatedClient: Cliente | null = null;
    try {
        const clientDocRef = doc(db, 'clientes', contratoToEdit.cliente); // contratoToEdit.cliente is ClienteId
        const clientSnap = await getDoc(clientDocRef);
        if (clientSnap.exists()) {
            associatedClient = { id: clientSnap.id as ClienteId, ...clientSnap.data() } as Cliente;
        } else {
            toast({ title: 'Error', description: `No se encontró el cliente asociado (ID: ${contratoToEdit.cliente}) para este contrato.`, variant: 'destructive' });
            // Proceed to edit contract fields but client-specific form parts might be disabled or show error
        }
    } catch (error: any) {
        toast({ title: 'Error Cargando Cliente', description: error.message, variant: 'destructive' });
    }

    if (associatedClient) {
        const esTipoProbando = associatedClient.tipoPersonaCliente === 'ClienteProbando';
        setIsClienteDePrueba(esTipoProbando); // Set the checkbox based on fetched client type
        if (esTipoProbando) {
            const personaProbando = associatedClient.personaCliente as ClienteProbando;
            setClientePruebaNombre(personaProbando.nombre);
            setSelectedClienteId(''); // Clear selected existing client ID
        } else {
            // If it's an existing, non-prueba client
            setClientePruebaNombre('');
            setSelectedClienteId(associatedClient.id); // Set selected existing client ID
            // TODO: Populate other form fields if you were to edit full client details
        }
    } else {
        // If client not found, reset client-related form fields
        setIsClienteDePrueba(false);
        setClientePruebaNombre('');
        setSelectedClienteId('');
         // Potentially disable the client section of the form or show a warning.
    }
    
    // Populate contract-specific form fields
    setSelectedResidenciaId(contratoToEdit.residencia || ''); // FIX: Use setSelectedResidenciaId and handle null
    if (contratoToEdit.fechaInicio) {
      const [dateStr, timeStr] = contratoToEdit.fechaInicio.fecha.split(' ');
      setFechaInicioDate(toDate(dateStr, { timeZone: contratoToEdit.fechaInicio.zonaHoraria }));
      setFechaInicioTime(timeStr || '00:00');
    }
    setEsIndefinido(contratoToEdit.esIndefinido);
    if (!contratoToEdit.esIndefinido && contratoToEdit.fechaFin) {
      const [dateStr, timeStr] = contratoToEdit.fechaFin.fecha.split(' ');
      setFechaFinDate(toDate(dateStr, { timeZone: contratoToEdit.fechaFin.zonaHoraria }));
      setFechaFinTime(timeStr || '00:00');
    } else {
      setFechaFinDate(null);
      setFechaFinTime('12:00');
    }
    setCorreoOficial(contratoToEdit.correoOficialComunicacion);

    setIsLoading(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    toast({ title: "Editando Contrato", description: `Modificando contrato ID: ${id}. Cliente ID: ${contratoToEdit.cliente}`});
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditingContratoId(null);
    
    // Reset form fields to default/empty state
    setIsClienteDePrueba(false);
    setClientePruebaNombre('');
    setSelectedResidenciaId('');
    setFechaInicioDate(new Date());
    setFechaInicioTime(formatInTimeZone(new Date(), 'UTC', 'HH:mm'));
    setEsIndefinido(false);
    setFechaFinDate(null);
    setFechaFinTime('12:00');
    setSelectedClienteId('');
    // setFechaFinTimezone('UTC'); // Or keep previous one for consistency
    setCorreoOficial('');
    // Reset other fields if they are part of the form
    
    toast({ title: "Edición Cancelada"});
  };

  // --- Render Logic ---
  if (isLoading || authLoading) {
    return <div className="flex justify-center items-center h-screen"><p>Cargando...</p></div>;
  }

  if (!isMaster) {
    return <div className="flex justify-center items-center h-screen"><p>Acceso denegado.</p></div>;
  }
  
  // --- Main JSX for the form ---
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Crear Nuevo Contrato de Residencia</h1>
      <form onSubmit={handleSubmit} className="space-y-6">
        
        {/* Cliente de Prueba */}
        <div className="flex items-center space-x-2">
        <Checkbox id="clienteDePrueba" checked={isClienteDePrueba} onCheckedChange={(checked) => {
            const newCheckedState = checked as boolean;
            setIsClienteDePrueba(newCheckedState);
            if (newCheckedState) { // If switching to cliente de prueba
                setSelectedClienteId(''); // Clear selected existing client
            }
        }} disabled={isEditing}/> {/* Disable changing client type during edit for simplicity */}
        <Label htmlFor="clienteDePrueba">Crear nuevo cliente de Prueba</Label>
        </div>

        {isClienteDePrueba && !isEditing && ( // Only show nombre input if prueba AND creating new
        <div>
            <Label htmlFor="clientePruebaNombre">Nombre del Cliente de Prueba</Label>
            <Input 
            id="clientePruebaNombre" 
            value={clientePruebaNombre} 
            onChange={(e) => setClientePruebaNombre(e.target.value)}
            placeholder="Ej: Residencia Geriátrica Sol Naciente (Prueba)"
            disabled={isEditing} // Or hide completely if isEditing
            />
        </div>
        )}

        {!isClienteDePrueba && !isEditing && ( // Only show selector if NOT prueba AND creating new
        <div>
            <Label htmlFor="selectClienteExistente">Seleccionar Cliente Existente</Label>
            {loadingClientes ? <p>Cargando clientes...</p> : (
                <select 
                    id="selectClienteExistente" 
                    value={selectedClienteId} 
                    onChange={(e) => setSelectedClienteId(e.target.value as ClienteId)}
                    className="w-full p-2 border rounded" // Basic styling
                    disabled={isEditing} // Or hide
                >
                    <option value="">-- Seleccione un Cliente --</option>
                    {allClientes.map(cliente => (
                        <option key={cliente.id} value={cliente.id}>
                            {cliente.tipoPersonaCliente === 'ClienteProbando' 
                                ? (cliente.personaCliente as ClienteProbando).nombre 
                                : (cliente.personaCliente as any).nombreLegalCompleto || (cliente.personaCliente as any).nombreCompleto || `Cliente ID: ${cliente.id}`
                            } ({cliente.id})
                        </option>
                    ))}
                </select>
            )}
            {allClientes.length === 0 && !loadingClientes && <p className="text-sm text-red-500">No hay clientes existentes para seleccionar. Cree uno de prueba o añada clientes en la sección correspondiente.</p>}
        </div>
        )}

        {isEditing && ( // If editing, show the current client ID (non-editable here)
            <div>
                <Label>Cliente Asociado (ID)</Label>
                <Input value={contratos.find(c=>c.id === editingContratoId)?.cliente || 'N/A'} disabled />
                {isClienteDePrueba && clientePruebaNombre && <p className="text-sm text-gray-600">Nombre (Prueba): {clientePruebaNombre}</p>}
            </div>
        )}


        {/* TODO: Selector para Cliente Existente (si !isClienteDePrueba) */}

        {/* TODO: Selector de Residencias (multi-select or add mechanism) */}
        <div>
          <Label htmlFor="selectResidencia">Seleccionar Residencia Única</Label>
          <select
            id="selectResidencia"
            value={selectedResidenciaId}
            onChange={(e) => {
              const newResidenciaId = e.target.value as ResidenciaId;
              setSelectedResidenciaId(newResidenciaId);
              // When editing, if user could change residencia, you might need to update allResidenciasConContrato
            }}
            className="w-full p-2 border rounded"
            disabled={isEditing || allResidenciasSinContrato.length === 0 && !selectedResidenciaId} // Disable if editing or no options
          >
            <option value="">-- Seleccione una Residencia --</option>
            {/* If editing, show the current selected residencia even if it has a contract */}
            {isEditing && selectedResidenciaId && !allResidenciasSinContrato.find(r => r.id === selectedResidenciaId) && (() => {
                const currentRes = allResidencias.find(r => r.id === selectedResidenciaId);
                return currentRes ? <option key={currentRes.id} value={currentRes.id}>{currentRes.nombre} (ID: {currentRes.id}) - Zona Horaria: {currentRes.zonaHoraria || 'No especificada'}</option> : null;
            })()}
            {allResidenciasSinContrato.map(res => (
              <option key={res.id} value={res.id}>
                {res.nombre} (ID: {res.id}) - Zona Horaria: {res.zonaHoraria || 'No especificada'}
              </option>
            ))}
          </select>
          {allResidenciasSinContrato.length === 0 && !isEditing && <p className="text-sm text-red-500">No hay residencias disponibles sin contrato o no se han cargado.</p>}
          {selectedResidenciaId && residenciaZonaHoraria && (
            <p className="text-sm text-gray-600 mt-1">
              Zona Horaria para este contrato (derivada de la Residencia): <strong>{residenciaZonaHoraria}</strong>
            </p>
          )}
          {selectedResidenciaId && !residenciaZonaHoraria && (
            <p className="text-sm text-red-600 mt-1">
              Advertencia: La residencia seleccionada no tiene una zona horaria configurada. Las fechas podrían ser incorrectas.
            </p>
          )}
          {/* Display Selected Timezone */}
          {residenciaZonaHoraria && (
            <p className="text-sm text-muted-foreground mt-2 mb-4">
              Dates and times entered will be relative to the selected Residencia's timezone: <strong>{residenciaZonaHoraria}</strong>.
              {residenciaZonaHoraria === 'UTC' && ' (This is a fallback as the residencia has no specific timezone defined.)'}
            </p>
          )}
        </div>

        {/* Fecha de Inicio */}
        <div>
          <Label>Fecha de Inicio</Label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <Input 
              type="date" 
              value={fechaInicioDate ? format(fechaInicioDate, 'yyyy-MM-dd') : ''}
              onChange={(e) => {
                if (e.target.value) {
                  // e.target.value is "YYYY-MM-DD"
                  // Create a Date object. For consistency, treat it as midnight UTC.
                  const [year, month, day] = e.target.value.split('-').map(Number);
                  setFechaInicioDate(new Date(Date.UTC(year, month - 1, day)));
                } else {
                  setFechaInicioDate(null);
                }
              }}
            />
            <Input 
              type="time" 
              value={fechaInicioTime}
              onChange={(e) => setFechaInicioTime(e.target.value)}
            />
          </div>
        </div>

        {/* Es Indefinido y Fecha de Fin */}
        <div className="flex items-center space-x-2">
          <Checkbox id="esIndefinido" checked={esIndefinido} onCheckedChange={(checked) => setEsIndefinido(checked as boolean)} />
          <Label htmlFor="esIndefinido">Contrato Indefinido</Label>
        </div>
        {!esIndefinido && (
          <div>
            <Label>Fecha de Fin</Label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <Input 
                type="date" 
                value={fechaFinDate ? format(fechaFinDate, 'yyyy-MM-dd') : ''}
                onChange={(e) => {
                  if (e.target.value) {
                    // e.target.value is "YYYY-MM-DD"
                    // Create a Date object. For consistency, treat it as midnight UTC.
                    const [year, month, day] = e.target.value.split('-').map(Number);
                    setFechaFinDate(new Date(Date.UTC(year, month - 1, day)));
                  } else {
                    setFechaFinDate(null);
                  }
                }}
              />
              <Input 
                type="time" 
                value={fechaFinTime} 
                onChange={(e) => setFechaFinTime(e.target.value)}
              />
            </div>
          </div>
        )}
        
        {/* Correo Oficial de Comunicación */}
        <div>
            <Label htmlFor="correoOficial">Correo Oficial de Comunicación</Label>
            <Input 
                id="correoOficial" 
                type="email" 
                value={correoOficial} 
                onChange={(e) => setCorreoOficial(e.target.value)}
                placeholder="comunicacion@ejemplo.com"
                required 
            />
        </div>

        {/* Placeholder for other fields with default values */}
        <p className="text-sm text-gray-500">
            Los siguientes campos se establecerán con valores predeterminados según las especificaciones (borrador):<br />
            - Contactos Responsables: Vacío<br />
            - Recordatorios: Ninguno<br />
            - Prueba Solución: Sí (Activado por defecto)<br />
            - Fecha Fin Prueba: Ninguna (Nulo)<br />
            - Suscripciones: Vacío<br />
            - Estado Contrato: Activo, de Prueba, Pagos al Corriente (marcado como 0)<br />
            - URL Contrato Odoo: Ninguno (Nulo)<br />
        </p>

        <div className="flex space-x-2">
          <Button type="submit" disabled={isLoading || authLoading}>
            {isLoading ? (isEditing ? 'Actualizando...' : 'Creando...') : (isEditing ? 'Actualizar Contrato' : 'Crear Contrato')}
          </Button>
          {isEditing && (
            <Button variant="outline" onClick={() => handleCancelEdit()} disabled={isLoading}>
              Cancelar Edición
            </Button>
          )}
        </div>
      </form>

      {/* --- Section to Display Existing Contracts --- */}
      <div className="mt-12">
        <h2 className="text-xl font-semibold mb-4">Contratos Existentes</h2>
        {loadingContratos && <p>Cargando contratos...</p>}
        {!loadingContratos && contratos.length === 0 && <p>No se encontraron contratos.</p>}
        {!loadingContratos && contratos.length > 0 && (
          <ul className="space-y-4">
            {contratos.map((contrato) => (
              <li key={contrato.id} className="p-4 border rounded-md shadow-sm">
                <h3 className="text-lg font-medium">ID Contrato: <code className="bg-gray-200 p-1 rounded text-sm">{contrato.id}</code></h3>
                <p>
                Cliente ID: {contrato.cliente}
                {(() => {
                    const clientData = allClientes.find(c => c.id === contrato.cliente);
                    if (clientData) {
                    return ` (${clientData.tipoPersonaCliente === 'ClienteProbando' ? (clientData.personaCliente as ClienteProbando).nombre : (clientData.personaCliente as any).nombreLegalCompleto || (clientData.personaCliente as any).nombreCompleto || 'Detalles no disponibles'})`;
                    }
                    return ' (Cargando info cliente...)';
                })()}
                </p>

                <p>Fecha Inicio: {contrato.fechaInicio.fecha} ({contrato.fechaInicio.zonaHoraria})</p>
                <p>
                  Fecha Fin: {
                    contrato.esIndefinido 
                    ? 'Indefinido' 
                    : (contrato.fechaFin ? `${contrato.fechaFin.fecha} (${contrato.fechaFin.zonaHoraria})` : 'No especificada')
                  }
                </p>
                <p>Residencia: { // Label changed to singular
                    contrato.residencia // Access the single ResidenciaId or null
                      ? (allResidencias.find(r => r.id === contrato.residencia)?.nombre || `Residencia ID: ${contrato.residencia}`) // Find name, fallback to showing ID if name not found
                      : 'N/A (Sin Residencia Asignada)' // Display if contrato.residencia is null
                  }
                </p>

                <p>Correo Comunicación: {contrato.correoOficialComunicacion}</p>
                <p>Estado: {contrato.estadoContrato.estaActivo ? 'Activo' : 'Inactivo'}
                {contrato.estadoContrato.usuariosIlimitados ? 
                    ' (Usuarios Ilimitados)' : 
                    ` (Usuarios Licenciados: ${contrato.estadoContrato.usuariosLicenciados})`
                }
                </p>

                {/* We can add more details or action buttons (Edit, Delete) here later */}
                <div className="mt-2 flex space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEditContrato(contrato.id!)}
                    disabled={isLoading}
                  >
                    Editar
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDeleteContrato(contrato.id!)}
                    disabled={isLoading || isEditing} // Disable delete while editing
                  >
                    Eliminar
                  </Button>
                </div>

              </li>
            ))}
          </ul>
        )}
        {/* --- Delete Confirmation Dialog --- */}
        {isConfirmingDelete && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white p-6 rounded-lg shadow-xl max-w-sm w-full">
                <h3 className="text-lg font-semibold mb-4">Confirmar Eliminación</h3>
                <p className="mb-4">
                ¿Estás seguro de que deseas eliminar el contrato con ID: <code className="bg-gray-200 p-1 rounded text-sm">{contratoToDeleteId}</code>? Esta acción no se puede deshacer.
                </p>
                <div className="flex justify-end space-x-2">
                <Button
                    variant="outline"
                    onClick={() => {
                    setIsConfirmingDelete(false);
                    setContratoToDeleteId(null);
                    }}
                    disabled={isLoading}
                >
                    Cancelar
                </Button>
                <Button
                    variant="destructive"
                    onClick={confirmDeleteContrato}
                    disabled={isLoading}
                >
                    {isLoading ? 'Eliminando...' : 'Eliminar Contrato'}
                </Button>
                </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
