'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase'; // Adjust path as needed
import {
  collection,
  addDoc,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
  Timestamp,
  orderBy,
} from 'firebase/firestore';
import {
  Pedido,
  PedidoId,
  ContratoResidencia,
  ContratoResidenciaId,
  Cliente,
  ClienteId,
  FrecuenciaSuscripcion, // Ensure this type is defined in your shared models
} from '@/../../shared/models/contratos'; // Adjust path as needed
import {   
  Residencia,
  ResidenciaId,
  UserProfile, 
  UserId,
  campoFechaConZonaHoraria,
} from '@/../../shared/models/types'; // Adjust path as needed
import { writeClientLog } from '@/lib/utils'; // Adjust path as needed
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'; // Assuming you have this
import { useToast } from '@/hooks/use-toast';
import { format, differenceInDays, differenceInMonths, differenceInWeeks, addDays, addMonths, addWeeks, isValid, parseISO } from 'date-fns';
import { formatInTimeZone, toDate, fromZonedTime } from 'date-fns-tz';

const CrearPedidoPage = () => {
  const [authUser, authLoading, authError] = useAuthState(auth);
  const router = useRouter();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [isMaster, setIsMaster] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  // --- Form State ---
  const [selectedContratoId, setSelectedContratoId] = useState<ContratoResidenciaId | ''>('');
  const [tipo, setTipo] = useState<'suscripcion' | 'licencia temporal' | 'licencia perpetua'>('suscripcion');
  const [modoPago, setModoPago] = useState<'prepagado' | 'al vencimiento' | 'libre de costo'>('prepagado');
  const [montoTotal, setMontoTotal] = useState<number>(0);
  const [periodicidad, setPeriodicidad] = useState<FrecuenciaSuscripcion | null>('mensual');
  const [fechaInicioDate, setFechaInicioDate] = useState<Date | undefined>(new Date());
  const [fechaInicioTime, setFechaInicioTime] = useState<string>(formatInTimeZone(new Date(), 'UTC', 'HH:mm'));
  const [fechaFinDate, setFechaFinDate] = useState<Date | undefined>(undefined);
  const [fechaFinTime, setFechaFinTime] = useState<string>('23:59');
  const [limitacionUsuarios, setLimitacionUsuarios] = useState<boolean>(true);
  const [cantUsuarios, setCantUsuarios] = useState<number>(1);
  const [contratoZonaHoraria, setContratoZonaHoraria] = useState<string | null>(null);


  // --- Data State ---
  const [contratos, setContratos] = useState<ContratoResidencia[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [residencias, setResidencias] = useState<Residencia[]>([]);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loadingData, setLoadingData] = useState(true);


  // --- UI State ---
  const [editingPedidoId, setEditingPedidoId] = useState<PedidoId | null>(null);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState<boolean>(false);
  const [pedidoToDeleteId, setPedidoToDeleteId] = useState<PedidoId | null>(null);
  const [subscriptionWarning, setSubscriptionWarning] = useState<string | null>(null);


  // --- Derived Data ---
  const selectedContrato = useMemo(() => {
    return contratos.find(c => c.id === selectedContratoId);
  }, [selectedContratoId, contratos]);

  const selectedCliente = useMemo(() => {
    if (!selectedContrato) return null;
    return clientes.find(cli => cli.id === selectedContrato.cliente);
  }, [selectedContrato, clientes]);

  const selectedResidencia = useMemo(() => {
    if (!selectedContrato) return null;
    return residencias.find(res => res.id === selectedContrato.residencia);
  }, [selectedContrato, residencias]);

  // --- useEffect for Auth and Role Check ---
  useEffect(() => {
    if (authLoading) {
      setIsLoading(true);
      return;
    }
    if (authError) {
      toast({ title: 'Error de Autenticación', description: authError.message, variant: 'destructive' });
      router.replace('/'); // Or your login page
      return;
    }
    if (!authUser) {
      router.replace('/'); // Or your login page
      return;
    }

    const fetchProfileAndCheckRole = async () => {
      try {
        const profileDocRef = doc(db, 'users', authUser.uid);
        const profileSnap = await getDoc(profileDocRef);

        if (profileSnap.exists()) {
          const profileData = profileSnap.data() as UserProfile;
          setUserProfile(profileData);
          // Check for master role
          if (profileData.roles && profileData.roles.includes('master')) {
            setIsMaster(true);
          } else {
            setIsMaster(false);
            toast({ title: 'Acceso Denegado', description: 'No tienes permiso para acceder a esta página.', variant: 'destructive' });
            router.replace('/'); // Or a general dashboard
          }
        } else {
          // No profile found, treat as non-master
          setIsMaster(false);
          toast({ title: 'Perfil no encontrado', description: 'No se pudo cargar tu perfil de usuario.', variant: 'destructive' });
          router.replace('/'); // Or a general dashboard
        }
      } catch (error: any) {
        toast({ title: 'Error Cargando Perfil', description: error.message, variant: 'destructive' });
        setIsMaster(false);
        router.replace('/');
      } finally {
        setIsLoading(false); // Overall page loading, not authLoading
      }
    };

    fetchProfileAndCheckRole();
  }, [authUser, authLoading, authError, router, toast]);

  // --- useEffect to fetch Contratos ---
  useEffect(() => {
    if (!isMaster) {
      setContratos([]);
      return;
    }
    const fetchContratos = async () => {
      setLoadingData(true);
      try {
        const contratosCol = collection(db, 'contratosResidencia');
        // Consider ordering if helpful, e.g., by fechaCreacionObjeto
        // const q = query(contratosCol, orderBy('fechaCreacionObjeto', 'desc'));
        const snapshot = await getDocs(contratosCol);
        const contratosData = snapshot.docs.map(doc => ({
          id: doc.id as ContratoResidenciaId,
          ...(doc.data() as Omit<ContratoResidencia, 'id'>),
        }));
        setContratos(contratosData);
      } catch (error: any) {
        console.error("Error fetching contratos:", error);
        toast({ title: 'Error al cargar contratos', description: error.message, variant: 'destructive' });
        setContratos([]);
      } finally {
        // setLoadingData(false); // We'll set this after all data is fetched
      }
    };
    fetchContratos();
  }, [isMaster, toast]);

  // --- useEffect to fetch Clientes ---
  useEffect(() => {
    if (!isMaster) {
      setClientes([]);
      return;
    }
    const fetchClientes = async () => {
      // setLoadingData(true); // Only set loading at the beginning of all fetches
      try {
        const clientesCol = collection(db, 'clientes');
        const snapshot = await getDocs(clientesCol);
        const clientesData = snapshot.docs.map(doc => ({
          id: doc.id as ClienteId,
          ...(doc.data() as Omit<Cliente, 'id'>),
        }));
        setClientes(clientesData);
      } catch (error: any) {
        console.error("Error fetching clientes:", error);
        toast({ title: 'Error al cargar clientes', description: error.message, variant: 'destructive' });
        setClientes([]);
      } finally {
        // setLoadingData(false);
      }
    };
    fetchClientes();
  }, [isMaster, toast]);

  // --- useEffect to fetch Residencias ---
  useEffect(() => {
    if (!isMaster) {
      setResidencias([]);
      return;
    }
    const fetchResidencias = async () => {
      // setLoadingData(true);
      try {
        const residenciasCol = collection(db, 'residencias');
        const snapshot = await getDocs(residenciasCol);
        const residenciasData = snapshot.docs.map(doc => ({
          id: doc.id as ResidenciaId,
          ...(doc.data() as Omit<Residencia, 'id'>),
        }));
        setResidencias(residenciasData);
      } catch (error: any) {
        console.error("Error fetching residencias:", error);
        toast({ title: 'Error al cargar residencias', description: error.message, variant: 'destructive' });
        setResidencias([]);
      } finally {
        // setLoadingData(false);
      }
    };
    fetchResidencias();
  }, [isMaster, toast]);

  // --- useEffect to fetch Pedidos (and manage overall data loading state) ---
  useEffect(() => {
    if (!isMaster) {
      setPedidos([]);
      setLoadingData(false); // Ensure loading is false if not master
      return;
    }

    const fetchAllData = async () => {
      setLoadingData(true); // Set loading true at the start of all data fetching
      // We assume Contratos, Clientes, Residencias are already being fetched by their own useEffects
      // This effect will now primarily focus on Pedidos and then set loadingData to false.

      try {
        // Fetch Pedidos
        const pedidosCol = collection(db, 'pedidos');
        const pedidosQuery = query(pedidosCol, orderBy('fechaInicio.fecha', 'desc')); // Example ordering
        const pedidosSnapshot = await getDocs(pedidosQuery);
        const pedidosData = pedidosSnapshot.docs.map(doc => ({
          id: doc.id as PedidoId,
          ...(doc.data() as Omit<Pedido, 'id'>),
        }));
        setPedidos(pedidosData);

      } catch (error: any) {
        console.error("Error fetching pedidos:", error);
        toast({ title: 'Error al cargar pedidos', description: error.message, variant: 'destructive' });
        setPedidos([]);
      } finally {
        setLoadingData(false); // Set loading false after all data fetching attempts are complete
      }
    };

    // Call fetchAllData. The individual fetches for Contratos, Clientes, Residencias will also run
    // based on isMaster.
    fetchAllData();

  }, [isMaster, toast]);

  // --- useEffect to update contratoZonaHoraria when selectedContratoId changes ---
  useEffect(() => {
    if (selectedContratoId && contratos.length > 0) {
      const currentContrato = contratos.find(c => c.id === selectedContratoId);
      if (currentContrato && currentContrato.fechaInicio && currentContrato.fechaInicio.zonaHoraria) {
        setContratoZonaHoraria(currentContrato.fechaInicio.zonaHoraria);
        // Optionally, reset date/time inputs when contract changes, or adjust them
        // For example, to re-default fechaInicioTime to the contract's timezone
        // setFechaInicioTime(formatInTimeZone(new Date(), currentContrato.fechaInicio.zonaHoraria, 'HH:mm'));
      } else {
        setContratoZonaHoraria(null);
        if (currentContrato) {
            toast({
                title: 'Advertencia: Zona Horaria no encontrada',
                description: `El contrato seleccionado (ID: ${selectedContratoId}) no tiene una zona horaria definida en su fecha de inicio. Las fechas del pedido podrían ser inconsistentes.`,
                variant: 'destructive',
                duration: 7000,
            });
        }
      }
    } else {
      setContratoZonaHoraria(null);
    }
  }, [selectedContratoId, contratos, toast]);

  // --- Helper function to check subscription period validity ---
  const getSubscriptionPeriodWarning = useCallback((): string | null => {
    if (
      tipo !== 'suscripcion' ||
      !fechaInicioDate ||
      !fechaFinDate ||
      !periodicidad ||
      !isValid(fechaInicioDate) ||
      !isValid(fechaFinDate) ||
      fechaFinDate <= fechaInicioDate
    ) {
      return null; // No warning if not a subscription, or dates/periodicity are invalid/not set
    }

    // Use copies of dates, treating them as UTC for consistent period calculations
    // This avoids issues with DST shifts if dates were local and crossed DST boundaries.
    const start = fromZonedTime(fechaInicioDate, 'UTC');
    const end = fromZonedTime(fechaFinDate, 'UTC');

    let calculatedEndDateForIntegerPeriods: Date;
    let numberOfFullPeriods = 0;

    try {
      switch (periodicidad) {
        case 'diaria':
          numberOfFullPeriods = differenceInDays(end, start);
          calculatedEndDateForIntegerPeriods = addDays(start, numberOfFullPeriods);
          break;
        case 'semanal':
          numberOfFullPeriods = differenceInWeeks(end, start);
          calculatedEndDateForIntegerPeriods = addWeeks(start, numberOfFullPeriods);
          break;
        case 'quincenal': // Assuming 14 days
          numberOfFullPeriods = Math.floor(differenceInDays(end, start) / 14);
          calculatedEndDateForIntegerPeriods = addDays(start, numberOfFullPeriods * 14);
          break;
        case 'mensual':
          numberOfFullPeriods = differenceInMonths(end, start);
          calculatedEndDateForIntegerPeriods = addMonths(start, numberOfFullPeriods);
          break;
        case 'bimestral':
          numberOfFullPeriods = Math.floor(differenceInMonths(end, start) / 2);
          calculatedEndDateForIntegerPeriods = addMonths(start, numberOfFullPeriods * 2);
          break;
        case 'trimestral':
          numberOfFullPeriods = Math.floor(differenceInMonths(end, start) / 3);
          calculatedEndDateForIntegerPeriods = addMonths(start, numberOfFullPeriods * 3);
          break;
        case 'cuatrimestral':
          numberOfFullPeriods = Math.floor(differenceInMonths(end, start) / 4);
          calculatedEndDateForIntegerPeriods = addMonths(start, numberOfFullPeriods * 4);
          break;
        case 'semestral':
          numberOfFullPeriods = Math.floor(differenceInMonths(end, start) / 6);
          calculatedEndDateForIntegerPeriods = addMonths(start, numberOfFullPeriods * 6);
          break;
        case 'anual':
          numberOfFullPeriods = Math.floor(differenceInMonths(end, start) / 12); // Or differenceInYears
          calculatedEndDateForIntegerPeriods = addMonths(start, numberOfFullPeriods * 12);
          break;
        default:
          return null; // Should not happen with defined types
      }

      // If the actual end date does not match the calculated end date for an integer number of periods
      if (calculatedEndDateForIntegerPeriods.getTime() !== end.getTime()) {
        // This warning triggers if the end date is either before or after where an exact integer period would end.
        // Example: Monthly. Start Jan 1st.
        // If End is Jan 20th: numberOfFullPeriods = 0. calculatedEndDate = Jan 1st. Warning.
        // If End is Feb 10th: numberOfFullPeriods = 1. calculatedEndDate = Feb 1st. Warning.
        return `Advertencia: El rango de fechas (${format(start, 'yyyy-MM-dd')} a ${format(end, 'yyyy-MM-dd')}) para la periodicidad '${periodicidad}' no parece corresponder a un número exacto de períodos. Fecha de fin esperada para ${numberOfFullPeriods} período(s) completo(s): ${format(calculatedEndDateForIntegerPeriods, 'yyyy-MM-dd')}.`;
      }
    } catch (e) {
      console.error("Error calculating subscription period warning:", e);
      return "Advertencia: No se pudo verificar la validez del período de suscripción.";
    }

    return null; // Dates align with an integer number of periods
  }, [tipo, fechaInicioDate, fechaFinDate, periodicidad]);

  // --- useEffect for subscription period validation warning ---
  useEffect(() => {
    if (tipo === 'suscripcion') {
      const warning = getSubscriptionPeriodWarning();
      setSubscriptionWarning(warning);
    } else {
      setSubscriptionWarning(null); // Clear warning if not a subscription type
    }
  }, [tipo, fechaInicioDate, fechaFinDate, periodicidad, getSubscriptionPeriodWarning]);

  // --- Calculated Subscription Amount per Period (for display) ---
  const calculatedSubscriptionAmountPerPeriod = useMemo((): string | null => {
    if (
      tipo !== 'suscripcion' ||
      !periodicidad ||
      montoTotal <= 0 ||
      !fechaInicioDate ||
      !fechaFinDate ||
      !isValid(fechaInicioDate) ||
      !isValid(fechaFinDate) ||
      fechaFinDate <= fechaInicioDate
    ) {
      return null;
    }

    // Use copies of dates, treating them as UTC for consistent period calculations
    const start = fromZonedTime(fechaInicioDate, 'UTC');
    const end = fromZonedTime(fechaFinDate, 'UTC');
    let numberOfPeriods = 0;

    try {
      switch (periodicidad) {
        case 'diaria':
          numberOfPeriods = differenceInDays(end, start);
          break;
        case 'semanal':
          numberOfPeriods = differenceInWeeks(end, start);
          break;
        case 'quincenal':
          numberOfPeriods = Math.floor(differenceInDays(end, start) / 14);
          break;
        case 'mensual':
          numberOfPeriods = differenceInMonths(end, start);
          break;
        case 'bimestral':
          numberOfPeriods = Math.floor(differenceInMonths(end, start) / 2);
          break;
        case 'trimestral':
          numberOfPeriods = Math.floor(differenceInMonths(end, start) / 3);
          break;
        case 'cuatrimestral':
          numberOfPeriods = Math.floor(differenceInMonths(end, start) / 4);
          break;
        case 'semestral':
          numberOfPeriods = Math.floor(differenceInMonths(end, start) / 6);
          break;
        case 'anual':
          numberOfPeriods = Math.floor(differenceInMonths(end, start) / 12); // Or differenceInYears
          break;
        default:
          return null;
      }

      if (numberOfPeriods > 0) {
        const amountPerPeriod = montoTotal / numberOfPeriods;
        // Format to 2 decimal places, or more if needed for your currency
        return `Valor ${periodicidad}: ${amountPerPeriod.toFixed(2)}`;
      } else {
        // This can happen if the period selected is larger than the duration
        // e.g. periodicidad 'anual' for a 6-month duration.
        return `Advertencia: La duración es menor que un período ${periodicidad}.`;
      }
    } catch (e) {
      console.error("Error calculating subscription amount per period:", e);
      return "No se pudo calcular el valor por período.";
    }
  }, [tipo, montoTotal, periodicidad, fechaInicioDate, fechaFinDate]);

  // TODO: Helper function: isSubscriptionPeriodValid (or integrate directly)

  // --- Handle Form Submission ---
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);

    if (!authUser?.uid || !isMaster) {
      toast({ title: 'Error de Autorización', description: 'No tienes permiso para realizar esta acción.', variant: 'destructive' });
      setIsLoading(false);
      return;
    }

    if (!selectedContratoId) {
      toast({ title: 'Error de Validación', description: 'Debe seleccionar un contrato.', variant: 'destructive' });
      setIsLoading(false);
      return;
    }

    if (!contratoZonaHoraria) {
        toast({ title: 'Error de Configuración', description: 'La zona horaria del contrato no está disponible. No se puede crear/actualizar el pedido.', variant: 'destructive' });
        setIsLoading(false);
        return;
    }

    // --- Business Logic Validations & Adjustments ---
    let finalMontoTotal = montoTotal;
    let finalPeriodicidad = periodicidad;
    let finalFechaFinDate = fechaFinDate;
    let finalFechaFinTime = fechaFinTime;
    let finalCantUsuarios = cantUsuarios;

    if (modoPago === 'libre de costo') {
      finalMontoTotal = 0;
    }

    if (tipo === 'suscripcion') {
      if (!periodicidad) {
        toast({ title: 'Error de Validación', description: 'Para pedidos de tipo "suscripción", la periodicidad es obligatoria.', variant: 'destructive' });
        setIsLoading(false);
        return;
      }
    } else {
      finalPeriodicidad = null; // Not a subscription, so no periodicity
    }

    if (tipo === 'licencia perpetua') {
      if (modoPago === 'al vencimiento') {
        toast({ title: 'Error de Validación', description: 'Para "licencia perpetua", el modo de pago no puede ser "al vencimiento".', variant: 'destructive' });
        setIsLoading(false);
        return;
      }
      finalFechaFinDate = undefined; // No end date for perpetual license
      finalFechaFinTime = '';       // No end time
    } else {
      // For 'suscripcion' or 'licencia temporal', fechaFin is required
      if (!fechaFinDate || !fechaFinTime) {
        toast({ title: 'Error de Validación', description: 'La fecha y hora de fin son obligatorias para este tipo de pedido.', variant: 'destructive' });
        setIsLoading(false);
        return;
      }
    }

    if (limitacionUsuarios) {
      if (!finalCantUsuarios || finalCantUsuarios <= 0) {
        toast({ title: 'Error de Validación', description: 'Si la limitación de usuarios está activa, la cantidad de usuarios debe ser mayor a 0.', variant: 'destructive' });
        setIsLoading(false);
        return;
      }
    } else {
      // According to interface, cantUsuarios is optional, so setting to undefined might be better than 0
      // if your backend/model treats 0 and undefined differently.
      // For now, let's stick to 0 as per prompt, but consider 'undefined' if more appropriate.
      finalCantUsuarios = 0;
    }

    // --- Construct campoFechaConZonaHoraria for fechaInicio ---
    if (!fechaInicioDate || !fechaInicioTime) {
      toast({ title: 'Error de Validación', description: 'Fecha y hora de inicio son obligatorias.', variant: 'destructive' });
      setIsLoading(false);
      return;
    }
    const [startHours, startMinutes] = fechaInicioTime.split(':').map(Number);
    const startDateWithTime = fromZonedTime(
      new Date(fechaInicioDate.getFullYear(), fechaInicioDate.getMonth(), fechaInicioDate.getDate(), startHours, startMinutes),
      contratoZonaHoraria
    );
    const finalFechaInicioCampo: campoFechaConZonaHoraria = {
      fecha: formatInTimeZone(startDateWithTime, contratoZonaHoraria, "yyyy-MM-dd HH:mm"),
      zonaHoraria: contratoZonaHoraria,
    };

    // --- Construct campoFechaConZonaHoraria for fechaFin ---
    let finalFechaFinCampo: campoFechaConZonaHoraria | null = null;
    if (tipo !== 'licencia perpetua' && finalFechaFinDate && finalFechaFinTime) { // Already validated finalFechaFinDate/Time are present if not perpetual
        const [endHours, endMinutes] = finalFechaFinTime.split(':').map(Number);
        const endDateWithTime = fromZonedTime(
            new Date(finalFechaFinDate.getFullYear(), finalFechaFinDate.getMonth(), finalFechaFinDate.getDate(), endHours, endMinutes),
            contratoZonaHoraria
        );
        finalFechaFinCampo = {
            fecha: formatInTimeZone(endDateWithTime, contratoZonaHoraria, "yyyy-MM-dd HH:mm"),
            zonaHoraria: contratoZonaHoraria,
        };
    } else if (tipo === 'licencia perpetua') {
        finalFechaFinCampo = null; // Explicitly null for perpetual
    }
    // No else needed, as prior validation ensures finalFechaFinDate/Time for non-perpetual

    // --- Prepare Pedido Data ---
    const pedidoData: Omit<Pedido, 'id'> = {
      contrato: selectedContratoId,
      tipo: tipo,
      modoPago: modoPago,
      montoTotal: finalMontoTotal,
      periodicidad: finalPeriodicidad,
      fechaInicio: finalFechaInicioCampo,
      fechaFin: finalFechaFinCampo,
      limitacionUsuarios: limitacionUsuarios,
      cantUsuarios: limitacionUsuarios ? finalCantUsuarios : undefined, // Use undefined if not limited, as per Pedido interface
    };

    // --- Create or Update Logic ---
    try {
      if (isEditing && editingPedidoId) {
        // --- UPDATE PEDIDO ---
        const pedidoRef = doc(db, 'pedidos', editingPedidoId);
        await updateDoc(pedidoRef, pedidoData); // updateDoc merges, so ensure all fields are present if not partial update
        
        toast({ title: 'Pedido Actualizado', description: `El pedido ${editingPedidoId} ha sido actualizado.` });
        await writeClientLog(
          authUser.uid as UserId,
          'pedido',
          { relatedDocPath: pedidoRef.path, details: { action: 'update_pedido', pedidoId: editingPedidoId, changes: pedidoData } }
        );
        setPedidos(prev => prev.map(p => p.id === editingPedidoId ? { ...p, ...pedidoData, id: editingPedidoId } : p));
      } else {
        // --- CREATE PEDIDO ---
        const docRef = await addDoc(collection(db, 'pedidos'), pedidoData);
        const newPedidoId = docRef.id as PedidoId;
        
        toast({ title: 'Pedido Creado', description: `Nuevo pedido ${newPedidoId} creado para el contrato ${selectedContratoId}.` });
        await writeClientLog(
          authUser.uid as UserId,
          'pedido',
          { relatedDocPath: docRef.path, details: { action: 'create_pedido', pedidoId: newPedidoId, data: pedidoData } }
        );
        setPedidos(prev => [...prev, { ...pedidoData, id: newPedidoId }]);
      }
      handleCancelEdit(); // Reset form and editing state
    } catch (error: any) {
      console.error("Error guardando pedido:", error);
      toast({ title: 'Error al Guardar Pedido', description: error.message, variant: 'destructive' });
      await writeClientLog(
        authUser.uid as UserId,
        'pedido',
        { details: { action: isEditing ? 'update_pedido_error' : 'create_pedido_error', pedidoId: editingPedidoId, error: error.message, data: pedidoData } }
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (pedido: Pedido) => {
    if (!isMaster) {
      toast({ title: "Acción no permitida", variant: "destructive" });
      return;
    }
    setIsEditing(true);
    setEditingPedidoId(pedido.id);

    setSelectedContratoId(pedido.contrato);
    setTipo(pedido.tipo);
    setModoPago(pedido.modoPago);
    setMontoTotal(pedido.montoTotal);
    setPeriodicidad(pedido.periodicidad);

    // Set fechaInicioDate and fechaInicioTime
    if (pedido.fechaInicio && pedido.fechaInicio.fecha && pedido.fechaInicio.zonaHoraria) {
        try {
            const [dateStr, timeStr] = pedido.fechaInicio.fecha.split(' ');
            // Ensure date string is in yyyy-MM-dd for parseISO, or directly use toDate from date-fns-tz
            const parsedDate = toDate(pedido.fechaInicio.fecha, { timeZone: pedido.fechaInicio.zonaHoraria });
            setFechaInicioDate(parsedDate);
            setFechaInicioTime(timeStr || formatInTimeZone(parsedDate, pedido.fechaInicio.zonaHoraria, 'HH:mm'));
            setContratoZonaHoraria(pedido.fechaInicio.zonaHoraria); // Crucial to set this early
        } catch (err) {
            console.error("Error parsing fechaInicio for edit:", err);
            toast({title: "Error de Datos", description: "No se pudo cargar la fecha de inicio del pedido.", variant: "destructive"});
            setFechaInicioDate(new Date());
            setFechaInicioTime(formatInTimeZone(new Date(), 'UTC', 'HH:mm'));
        }
    } else {
        setFechaInicioDate(new Date()); // Fallback
        setFechaInicioTime(formatInTimeZone(new Date(), 'UTC', 'HH:mm')); // Fallback
    }

    // Set fechaFinDate and fechaFinTime
    if (pedido.fechaFin && pedido.fechaFin.fecha && pedido.fechaFin.zonaHoraria) {
         try {
            const [dateStr, timeStr] = pedido.fechaFin.fecha.split(' ');
            const parsedDate = toDate(pedido.fechaFin.fecha, { timeZone: pedido.fechaFin.zonaHoraria });
            setFechaFinDate(parsedDate);
            setFechaFinTime(timeStr || formatInTimeZone(parsedDate, pedido.fechaFin.zonaHoraria, 'HH:mm'));
        } catch (err) {
            console.error("Error parsing fechaFin for edit:", err);
            toast({title: "Error de Datos", description: "No se pudo cargar la fecha de fin del pedido.", variant: "destructive"});
            setFechaFinDate(undefined);
            setFechaFinTime('23:59');
        }
    } else {
      setFechaFinDate(undefined);
      setFechaFinTime('23:59'); // Default or appropriate reset
    }

    setLimitacionUsuarios(pedido.limitacionUsuarios);
    setCantUsuarios(pedido.cantUsuarios || (pedido.limitacionUsuarios ? 1 : 0)); // Default to 1 if limited and no value, 0 otherwise

    window.scrollTo({ top: 0, behavior: 'smooth' });
    toast({ title: "Modo Edición", description: `Editando pedido ID: ${pedido.id}` });
  };
  
  const handleDelete = (id: PedidoId) => {
    if (!isMaster) {
      toast({ title: "Acción no permitida", variant: "destructive" });
      return;
    }
    setPedidoToDeleteId(id);
    setIsConfirmingDelete(true);
  };
  
  const confirmDelete = async () => {
    if (!pedidoToDeleteId || !authUser?.uid || !isMaster) {
      toast({ title: "Error", description: "No se puede eliminar el pedido. Verifique permisos o selección.", variant: "destructive" });
      setIsConfirmingDelete(false);
      setPedidoToDeleteId(null);
      return;
    }

    setIsLoading(true);
    try {
      const pedidoRef = doc(db, 'pedidos', pedidoToDeleteId);
      await deleteDoc(pedidoRef);

      toast({ title: 'Pedido Eliminado', description: `El pedido ${pedidoToDeleteId} ha sido eliminado.` });
      await writeClientLog(
        authUser.uid as UserId,
        'pedido',
        { relatedDocPath: pedidoRef.path, details: { action: 'delete_pedido', pedidoId: pedidoToDeleteId } }
      );
      setPedidos(prev => prev.filter(p => p.id !== pedidoToDeleteId));
    } catch (error: any) {
      console.error("Error eliminando pedido:", error);
      toast({ title: 'Error al Eliminar Pedido', description: error.message, variant: "destructive" });
       await writeClientLog(
        authUser.uid as UserId,
        'pedido',
        { details: { action: 'delete_pedido_error', pedidoId: pedidoToDeleteId, error: error.message } }
      );
    } finally {
      setIsConfirmingDelete(false);
      setPedidoToDeleteId(null);
      setIsLoading(false);
      if (editingPedidoId === pedidoToDeleteId) { // If the deleted pedido was being edited
        handleCancelEdit(); // Reset the form
      }
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditingPedidoId(null);
    
    // Reset form fields to default/empty state
    setSelectedContratoId('');
    setTipo('suscripcion');
    setModoPago('prepagado');
    setMontoTotal(0);
    setPeriodicidad('mensual'); // Default or null if preferred
    setFechaInicioDate(new Date());
    setFechaInicioTime(formatInTimeZone(new Date(), contratoZonaHoraria || 'UTC', 'HH:mm')); // Use contract's TZ or UTC
    setFechaFinDate(undefined);
    setFechaFinTime('23:59');
    setLimitacionUsuarios(true);
    setCantUsuarios(1);
    setSubscriptionWarning(null);
    // contratoZonaHoraria will be reset by its own useEffect when selectedContratoId is cleared

    // Optionally, scroll to top
    // window.scrollTo({ top: 0, behavior: 'smooth' });
    // toast({ title: "Acción cancelada" }); // Optional: if you want a toast on cancel
  };

  // --- Render Logic ---
  if (isLoading || authLoading) {
    return <div className="flex justify-center items-center h-screen"><p>Cargando...</p></div>;
  }

  if (!isMaster) {
    // This will be shown after auth check determines user is not master
    return <div className="flex justify-center items-center h-screen"><p>Acceso denegado.</p></div>;
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6">Gestionar Pedidos</h1>
      {/* --- Main Form --- */}
      <form onSubmit={handleSubmit} className="space-y-8 bg-card p-6 rounded-lg shadow-md mb-12">
        {/* --- Display Selected Contract Info --- */}
        {selectedContrato && (
          <div className="mb-6 p-4 border border-border rounded-md bg-muted/30">
            <h3 className="text-lg font-semibold text-primary mb-2">Información del Contrato Seleccionado:</h3>
            <p className="text-sm">
              <strong>ID Contrato:</strong> <code className="text-xs bg-muted p-1 rounded">{selectedContrato.id}</code>
            </p>
            {selectedCliente && (
              <p className="text-sm">
                <strong>Cliente:</strong> {
                  selectedCliente.tipoPersonaCliente === 'ClienteProbando'
                    ? (selectedCliente.personaCliente as any)?.nombre || 'N/A'
                    : (selectedCliente.personaCliente as any)?.nombreLegalCompleto || (selectedCliente.personaCliente as any)?.nombreCompleto || 'N/A'
                } (ID: <code className="text-xs bg-muted p-1 rounded">{selectedCliente.id}</code>)
              </p>
            )}
            {selectedResidencia && (
              <p className="text-sm">
                <strong>Residencia:</strong> {selectedResidencia.nombre || 'N/A'} (ID: <code className="text-xs bg-muted p-1 rounded">{selectedResidencia.id}</code>)
              </p>
            )}
             {contratoZonaHoraria && (
                <p className="text-sm mt-1">
                    <strong>Zona Horaria del Contrato (para fechas del pedido):</strong> {contratoZonaHoraria}
                </p>
            )}
          </div>
        )}

        {/* Selector de Contrato */}
        <div>
          <Label htmlFor="selectContrato" className="block text-sm font-medium mb-1">Contrato Asociado*</Label>
          <Select
            value={selectedContratoId}
            onValueChange={(value) => {
              setSelectedContratoId(value as ContratoResidenciaId);
              // Reset related fields if needed, or let useEffect for contratoZonaHoraria handle it
            }}
            disabled={isEditing} // Disable changing contract when editing a pedido
          >
            <SelectTrigger id="selectContrato">
              <SelectValue placeholder="Seleccione un Contrato" />
            </SelectTrigger>
            <SelectContent>
              {contratos.length === 0 && <SelectItem value="loading" disabled>Cargando contratos...</SelectItem>}
              {contratos.map((contrato) => {
                const cliente = clientes.find(c => c.id === contrato.cliente);
                const residencia = residencias.find(r => r.id === contrato.residencia);
                const clienteNombre = cliente
                  ? (cliente.tipoPersonaCliente === 'ClienteProbando'
                      ? (cliente.personaCliente as any)?.nombre
                      : (cliente.personaCliente as any)?.nombreLegalCompleto || (cliente.personaCliente as any)?.nombreCompleto)
                  : 'Cliente Desconocido';
                const residenciaNombre = residencia?.nombre || 'Residencia Desconocida';
                return (
                  <SelectItem key={contrato.id} value={contrato.id!}>
                    ID: {contrato.id} (Cliente: {clienteNombre} - Residencia: {residenciaNombre})
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          {!selectedContratoId && <p className="text-xs text-destructive mt-1">Campo obligatorio.</p>}
        </div>

        {/* Fields for Pedido details will go here */}
        {/* Row for Tipo and Modo de Pago */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Tipo de Pedido */}
          <div>
            <Label htmlFor="tipoPedido" className="block text-sm font-medium mb-1">Tipo de Pedido*</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as any)}>
              <SelectTrigger id="tipoPedido">
                <SelectValue placeholder="Seleccione un tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="suscripcion">Suscripción</SelectItem>
                <SelectItem value="licencia temporal">Licencia Temporal</SelectItem>
                <SelectItem value="licencia perpetua">Licencia Perpetua</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Modo de Pago */}
          <div>
            <Label htmlFor="modoPago" className="block text-sm font-medium mb-1">Modo de Pago*</Label>
            <Select value={modoPago} onValueChange={(v) => setModoPago(v as any)} >
              <SelectTrigger id="modoPago">
                <SelectValue placeholder="Seleccione modo de pago" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="prepagado">Prepagado</SelectItem>
                <SelectItem value="al vencimiento" disabled={tipo === 'licencia perpetua'}>Al Vencimiento (No disponible para Lic. Perpetua)</SelectItem>
                <SelectItem value="libre de costo">Libre de Costo</SelectItem>
              </SelectContent>
            </Select>
            {tipo === 'licencia perpetua' && modoPago === 'al vencimiento' && (
                <p className="text-xs text-destructive mt-1">Modo "Al Vencimiento" no es válido para "Licencia Perpetua".</p>
            )}
          </div>
        </div>

        {/* Monto Total y Periodicidad */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <Label htmlFor="montoTotal" className="block text-sm font-medium mb-1">Monto Total*</Label>
            <Input
              id="montoTotal"
              type="number"
              value={montoTotal}
              onChange={(e) => setMontoTotal(parseFloat(e.target.value) || 0)}
              placeholder="0.00"
              disabled={modoPago === 'libre de costo'}
              min="0"
            />
            {modoPago === 'libre de costo' && <p className="text-xs text-muted-foreground mt-1">Monto es 0 por ser "Libre de Costo".</p>}
            {/* Display calculated subscription amount */}
            {calculatedSubscriptionAmountPerPeriod && (
                <p className={`text-xs mt-1 ${calculatedSubscriptionAmountPerPeriod.startsWith('Advertencia') ? 'text-amber-600' : 'text-muted-foreground'}`}>
                    {calculatedSubscriptionAmountPerPeriod}
                </p>
            )}
          </div>

          {tipo === 'suscripcion' && (
            <div>
              <Label htmlFor="periodicidad" className="block text-sm font-medium mb-1">Periodicidad (para Suscripción)*</Label>
              <Select value={periodicidad || ''} onValueChange={(v) => setPeriodicidad(v as FrecuenciaSuscripcion | null)}>
                <SelectTrigger id="periodicidad">
                  <SelectValue placeholder="Seleccione periodicidad" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="diaria">Diaria</SelectItem>
                  <SelectItem value="semanal">Semanal</SelectItem>
                  <SelectItem value="quincenal">Quincenal</SelectItem>
                  <SelectItem value="mensual">Mensual</SelectItem>
                  <SelectItem value="bimestral">Bimestral</SelectItem>
                  <SelectItem value="trimestral">Trimestral</SelectItem>
                  <SelectItem value="cuatrimestral">Cuatrimestral</SelectItem>
                  <SelectItem value="semestral">Semestral</SelectItem>
                  <SelectItem value="anual">Anual</SelectItem>
                </SelectContent>
              </Select>
              {!periodicidad && <p className="text-xs text-destructive mt-1">Periodicidad es obligatoria para suscripciones.</p>}
            </div>
          )}
        </div>

        {/* Fechas: Inicio y Fin */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Fecha de Inicio */}
          <div>
            <Label className="block text-sm font-medium mb-1">Fecha y Hora de Inicio*</Label>
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="date"
                value={fechaInicioDate ? format(fechaInicioDate, 'yyyy-MM-dd') : ''}
                onChange={(e) => {
                  if (e.target.value) {
                    const [year, month, day] = e.target.value.split('-').map(Number);
                    setFechaInicioDate(new Date(Date.UTC(year, month - 1, day)));
                  } else {
                    setFechaInicioDate(undefined);
                  }
                }}
                required
              />
              <Input
                type="time"
                value={fechaInicioTime}
                onChange={(e) => setFechaInicioTime(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Fecha de Fin (Condicional) */}
          {tipo !== 'licencia perpetua' && (
            <div>
              <Label className="block text-sm font-medium mb-1">Fecha y Hora de Fin*</Label>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="date"
                  value={fechaFinDate ? format(fechaFinDate, 'yyyy-MM-dd') : ''}
                  onChange={(e) => {
                    if (e.target.value) {
                      const [year, month, day] = e.target.value.split('-').map(Number);
                      setFechaFinDate(new Date(Date.UTC(year, month - 1, day)));
                    } else {
                      setFechaFinDate(undefined);
                    }
                  }}
                  required={tipo !== 'licencia perpetua'}
                />
                <Input
                  type="time"
                  value={fechaFinTime}
                  onChange={(e) => setFechaFinTime(e.target.value)}
                  required={tipo !== 'licencia perpetua'}
                />
              </div>
            </div>
          )}
          {tipo === 'licencia perpetua' && (
            <div className="flex items-center justify-center bg-muted/50 p-3 rounded-md h-full">
                <p className="text-sm text-muted-foreground">No aplica fecha de fin para Licencia Perpetua.</p>
            </div>
          )}
        </div>
        {/* Display subscription period warning */}
        {subscriptionWarning && (
            <div className="p-3 bg-warning/10 border border-warning rounded-md">
                <p className="text-sm text-warning-foreground">{subscriptionWarning}</p>
            </div>
        )}


        {/* Limitación de Usuarios */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          <div className="flex items-center space-x-3 pt-2">
            <Checkbox
              id="limitacionUsuarios"
              checked={limitacionUsuarios}
              onCheckedChange={(checked) => setLimitacionUsuarios(checked as boolean)}
            />
            <Label htmlFor="limitacionUsuarios" className="font-medium">Limitar Cantidad de Usuarios</Label>
          </div>
          {limitacionUsuarios && (
            <div>
              <Label htmlFor="cantUsuarios" className="block text-sm font-medium mb-1">Cantidad de Usuarios*</Label>
              <Input
                id="cantUsuarios"
                type="number"
                value={cantUsuarios}
                onChange={(e) => setCantUsuarios(parseInt(e.target.value, 10) || 0)}
                placeholder="1"
                min="1"
              />
              {(cantUsuarios <= 0) && <p className="text-xs text-destructive mt-1">Debe ser mayor a 0 si la limitación está activa.</p>}
            </div>
          )}
          {!limitacionUsuarios && (
             <div className="flex items-center justify-start bg-muted/50 p-3 rounded-md h-full">
                <p className="text-sm text-muted-foreground">Usuarios ilimitados.</p>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end space-x-3 pt-4 border-t border-border mt-8">
          {isEditing && (
            <Button
              type="button"
              variant="outline"
              onClick={handleCancelEdit}
              disabled={isLoading}
            >
              Cancelar Edición
            </Button>
          )}
          <Button
            type="submit"
            disabled={isLoading || authLoading || !selectedContratoId || loadingData}
          >
            {isLoading
              ? isEditing
                ? 'Actualizando Pedido...'
                : 'Creando Pedido...'
              : isEditing
              ? 'Actualizar Pedido'
              : 'Crear Nuevo Pedido'}
          </Button>
        </div>
      </form>

      {/* --- Section to Display Existing Pedidos --- */}
      <div className="mt-12">
        <h2 className="text-xl font-semibold mb-6 text-primary border-b pb-2">Pedidos Existentes</h2>
        {loadingData && <p className="text-center text-muted-foreground">Cargando pedidos...</p>}
        {!loadingData && pedidos.length === 0 && (
          <p className="text-center text-muted-foreground py-4">No se encontraron pedidos. Crea uno usando el formulario de arriba.</p>
        )}
        {!loadingData && pedidos.length > 0 && (
          <div className="space-y-6">
            {pedidos.map((pedido) => {
              const contratoDelPedido = contratos.find(c => c.id === pedido.contrato);
              const clienteDelPedido = contratoDelPedido ? clientes.find(cli => cli.id === contratoDelPedido.cliente) : null;
              const residenciaDelPedido = contratoDelPedido ? residencias.find(res => res.id === contratoDelPedido.residencia) : null;

              return (
                <div key={pedido.id} className="bg-card p-5 rounded-lg shadow-md border border-border transition-shadow hover:shadow-lg">
                  <div className="flex flex-col md:flex-row justify-between md:items-center mb-3 pb-3 border-b border-border">
                    <div>
                      <h3 className="text-lg font-semibold text-primary">
                        ID Pedido: <code className="text-sm bg-muted p-1 rounded-sm">{pedido.id}</code>
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Contrato: <code className="text-xs bg-muted p-1 rounded-sm">{pedido.contrato}</code>
                        {contratoDelPedido && clienteDelPedido && (
                          <span>
                            {' '} (Cliente: {
                              clienteDelPedido.tipoPersonaCliente === 'ClienteProbando'
                                ? (clienteDelPedido.personaCliente as any)?.nombre
                                : (clienteDelPedido.personaCliente as any)?.nombreLegalCompleto || (clienteDelPedido.personaCliente as any)?.nombreCompleto || 'N/A'
                            }
                            {residenciaDelPedido && ` - Residencia: ${residenciaDelPedido.nombre || 'N/A'}`})
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex space-x-2 mt-3 md:mt-0">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEdit(pedido)}
                        disabled={isLoading || isEditing}
                        className="text-xs px-3 py-1"
                      >
                        Editar
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDelete(pedido.id!)}
                        disabled={isLoading || isEditing}
                        className="text-xs px-3 py-1"
                      >
                        Eliminar
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3 text-sm">
                    <p><strong>Tipo:</strong> <span className="capitalize">{pedido.tipo}</span></p>
                    <p><strong>Modo Pago:</strong> <span className="capitalize">{pedido.modoPago}</span></p>
                    <p><strong>Monto Total:</strong> {pedido.montoTotal.toLocaleString(undefined, { style: 'currency', currency: 'USD' })} {/* Adjust currency as needed */}</p>
                    
                    {pedido.tipo === 'suscripcion' && pedido.periodicidad && (
                      <p><strong>Periodicidad:</strong> <span className="capitalize">{pedido.periodicidad}</span></p>
                    )}
                    
                    <p><strong>Fecha Inicio:</strong> {pedido.fechaInicio.fecha} ({pedido.fechaInicio.zonaHoraria})</p>
                    
                    {pedido.fechaFin ? (
                      <p><strong>Fecha Fin:</strong> {pedido.fechaFin.fecha} ({pedido.fechaFin.zonaHoraria})</p>
                    ) : (
                      <p><strong>Fecha Fin:</strong> {pedido.tipo === 'licencia perpetua' ? 'N/A (Perpetua)' : 'No especificada'}</p>
                    )}

                    <p>
                        <strong>Usuarios:</strong> {pedido.limitacionUsuarios 
                            ? `${pedido.cantUsuarios || 0} licenciados` 
                            : 'Ilimitados'}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      
      {/* --- Delete Confirmation Dialog --- */}
      {isConfirmingDelete && pedidoToDeleteId && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50 transition-opacity duration-300 ease-in-out">
          <div className="bg-card p-6 rounded-lg shadow-xl max-w-md w-full transform transition-all duration-300 ease-in-out scale-100 opacity-100">
            <h3 className="text-lg font-semibold mb-4 text-destructive">Confirmar Eliminación</h3>
            <p className="mb-6 text-sm text-muted-foreground">
              ¿Estás seguro de que deseas eliminar el pedido con ID: <br />
              <code className="bg-muted text-destructive-foreground p-1 rounded text-sm font-mono my-1 inline-block">{pedidoToDeleteId}</code>?
              <br />Esta acción no se puede deshacer.
            </p>
            <div className="flex justify-end space-x-3">
              <Button
                variant="outline"
                onClick={() => {
                  setIsConfirmingDelete(false);
                  setPedidoToDeleteId(null);
                }}
                disabled={isLoading}
              >
                Cancelar
              </Button>
              <Button
                variant="destructive"
                onClick={confirmDelete}
                disabled={isLoading}
              >
                {isLoading ? 'Eliminando...' : 'Eliminar Pedido'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CrearPedidoPage;
