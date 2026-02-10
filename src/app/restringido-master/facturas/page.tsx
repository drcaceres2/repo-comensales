'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { auth, db } from '@/lib/firebase';
import { collection, addDoc, getDocs, query, where, doc, getDoc, setDoc, updateDoc, deleteDoc, Timestamp, serverTimestamp, runTransaction } from 'firebase/firestore'; // Added runTransaction
import { UserProfile, ResidenciaId, campoFechaConZonaHoraria } from '../../../../shared/models/types'; // Adjust path as needed
import { logClientAction } from '@/lib/utils'; // Adjust path as needed
import { Button } from '@/components/ui/button'; // Adjust path as needed
import { Input } from '@/components/ui/input'; // Adjust path as needed
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"; 
import { Badge } from "@/components/ui/badge"; 
import TimezoneSelector from "@/components/ui/TimezoneSelector"; 
import { useToast } from '@/hooks/useToast';
import { PlusCircle, Edit3, Trash2, Save, Ban, AlertTriangle } from 'lucide-react'; 
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'; 
import { 
    crearFCZH_fecha, 
    // crearFCZH_FechaHora, // if you need to create dates with specific times
    compararFCZH,
    compararSoloFechaFCZH,
    // Import prepareFechaStringForParsing if it's exported and you want to use it directly,
    // otherwise the comparison functions use it internally.
    resultadoComparacionFCZH
} from '../../../../shared/utils/commonUtils'; // Adjust path if necessary
import { format } from 'date-fns';
import { 
    ContratoResidencia, ContratoResidenciaId, 
    Factura, FacturaId, 
    Pedido, PedidoId, 
    FrecuenciaSuscripcion, 
    odoo_status_in_payment, 
    Moneda,
    monedaOptions
} from '../../../../shared/models/contratos'; // Adjust path as needed

const calculateEstadoDePago = (montoTotal: number, montoPagado: number): odoo_status_in_payment => {
    if (montoTotal === 0 && montoPagado === 0) return 'paid';
    if (montoTotal > 0 && montoPagado === 0) return 'not_paid';
    if (montoTotal > 0 && montoPagado > 0 && montoPagado < montoTotal) return 'partial';
    if (montoTotal > 0 && montoPagado >= montoTotal) return 'paid';
    return 'not_paid'; 
};

const getEstadoDePagoBadgeVariant = (estado: odoo_status_in_payment): "default" | "destructive" | "secondary" | "outline" => {
    switch (estado) {
        case 'paid': return 'secondary';
        case 'partial': return 'default';
        case 'not_paid': return 'destructive';
        default: return 'outline';
    }
};

// For reliably parsing the "fecha" string inside campoFechaConZonaHoraria
// This is based on your "prepareFechaStringForParsing" from utils.ts.
// If "prepareFechaStringForParsing" is exported from utils.ts, import and use it directly.
// Otherwise, you can use this local version or ensure your util functions are robust.
const _prepareFechaStringForPage = (fechaOriginal: string | undefined | null): string | null => {
    if (!fechaOriginal) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(fechaOriginal)) return `${fechaOriginal}T00:00:00Z`; // Add time & Z for UTC interpretation for date-only
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(fechaOriginal)) return `${fechaOriginal.replace(' ', 'T')}:00`;
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(fechaOriginal)) return fechaOriginal.replace(' ', 'T');
    // Handle cases where it might already have T
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(fechaOriginal)) return fechaOriginal;
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(fechaOriginal)) return `${fechaOriginal}:00`;
    console.warn("_prepareFechaStringForPage: Unhandled/invalid fecha string format:", fechaOriginal);
    return null; // Or throw error
};

const displayCampoFecha = (fczh: campoFechaConZonaHoraria | undefined | null): string => {
    if (!fczh || !fczh.fecha || !fczh.zonaHoraria) return 'N/A';
    // Display the stored string date/time and its timezone, reflecting the actual data.
    return `${fczh.fecha} (${fczh.zonaHoraria})`;
};

const formatCampoFechaForSelector = (fczh: campoFechaConZonaHoraria | undefined | null): string => {
    if (!fczh || !fczh.fecha || !fczh.zonaHoraria) return 'N/A';

    if (/^(\d{4})-(\d{2})/.test(fczh.fecha)) {
        try {
            const year = fczh.fecha.substring(0, 4);
            const month = parseInt(fczh.fecha.substring(5, 7), 10)-1; // JS months 0-indexed
            const dateObj = new Date(Date.UTC(parseInt(year), month, 1));  // Use UTC to prevent local timezone shifting month display
            const monthShort = dateObj.toLocaleString('default', { month: 'short', timeZone: 'UTC' });
            return `${monthShort}-${year.substring(2)}`;
        } catch (e) {
            console.error("Error in fallback formatCampoFechaForSelector:", e);
            return "N/A";
        }
    }
    return fczh.fecha;  // Fallback to showing the raw date string if not parsable as YYYY-MM-DD
};

// Ensure you replace the old formatCampoFecha (used for Pedido details) with displayCampoFecha.
// And use formatCampoFechaForSelector for the Pedido <Select> options.
 

const validateFacturaData = (
    currentFormData: Partial<Factura>,
    pedido: Pedido | null,
    existingFacturas: Factura[],
    isCreating: boolean // True if validating for creation, false for update
): string[] => {
    const errors: string[] = [];

    if (!pedido) {
        errors.push("No se ha seleccionado un pedido válido.");
        return errors; // Critical error, no further validation possible
    }

    // Rule 1: Required Fields
    if (!currentFormData.fecha?.fecha) {
        errors.push("La fecha de la factura es obligatoria.");
    }
    if (!currentFormData.fechaPago?.fecha) {
        errors.push("La fecha de pago de la factura es obligatoria.");
    }
    if (!currentFormData.fechaVencimiento?.fecha) {
        errors.push("La fecha de vencimiento de la factura es obligatoria.");
    }
    // Ensure zonaHoraria is also present if fecha is (implicitly handled by how FCZH is built)
    if (currentFormData.fechaVencimiento?.fecha && !currentFormData.fechaVencimiento?.zonaHoraria) {
        errors.push("La zona horaria para la fecha de vencimiento es obligatoria si la fecha está presente.");
    }

    if (!currentFormData.monedaFactura) {
        errors.push("La moneda de la factura es obligatoria.");
    }
    // Allow 0 for amounts, so check for undefined/null specifically
    if (currentFormData.montoTotal === undefined || currentFormData.montoTotal === null) {
        errors.push("El monto total de la factura es obligatorio.");
    }
    if (currentFormData.montoPagado === undefined || currentFormData.montoPagado === null) {
        errors.push("El monto pagado de la factura es obligatorio.");
    }

    // If basic fields are missing, further validation might be problematic
    if (errors.length > 0 && (!currentFormData.fecha?.fecha || !currentFormData.fechaPago?.fecha || currentFormData.montoTotal === undefined || currentFormData.montoPagado === undefined)) {
        return errors;
    }
    
    // Rule 2: Factura.fecha within Order Period
    if (currentFormData.fecha && pedido.fechaInicio) {
        const cmpInicio = compararSoloFechaFCZH(currentFormData.fecha, pedido.fechaInicio);
        if (cmpInicio === "menor") {
            errors.push("La fecha de la factura no puede ser anterior al día de inicio del pedido.");
        } else if (cmpInicio === "invalido") {
            errors.push("Error al comparar la fecha de factura con la fecha de inicio del pedido (formato inválido o datos faltantes).");
        }
    }
    if (currentFormData.fecha && pedido.fechaFin) { // Only if fechaFin exists
        const cmpFin = compararSoloFechaFCZH(currentFormData.fecha, pedido.fechaFin);
        if (cmpFin === "mayor") {
            errors.push("La fecha de la factura no puede ser posterior al día de fin del pedido.");
        } else if (cmpFin === "invalido") {
            errors.push("Error al comparar la fecha de factura con la fecha de fin del pedido (formato inválido o datos faltantes).");
        }
    }

    // Rule 3: Subscription Invoice Date Logic (Simplified: new invoice date must be after last existing invoice)
    // Assumes existingFacturas is sorted by date ascending, which it is from fetchFacturasForSelectedPedido
    if (pedido.tipo === 'suscripcion' && isCreating && existingFacturas.length > 0 && currentFormData.fecha) {
        const lastFactura = existingFacturas[existingFacturas.length - 1]; // Assumes facturas are sorted
        if (lastFactura?.fecha) {
            const cmpLast = compararFCZH(currentFormData.fecha, lastFactura.fecha);
            if (cmpLast === "menor" || cmpLast === "igual") {
                errors.push("Para suscripciones, la fecha (y hora) de la nueva factura debe ser estrictamente posterior a la última factura existente.");
            } else if (cmpLast === "invalido") {
                errors.push("Error al comparar la fecha de la nueva factura con la última factura (formato inválido o datos faltantes).");
            }
        }
    }


    // Rule 4: Max One Invoice for Non-Subscription (Only on Create)
    if (isCreating && ( pedido.tipo === 'licencia temporal' || pedido.tipo === 'licencia perpetua')) {
        if (existingFacturas.length > 0) {
            errors.push(`Los pedidos de tipo '${pedido.tipo}' solo pueden tener una factura asociada.`);
        }
    }

    // Rule 5: No New/Update for Inactive Order
    if (!pedido.activo) {
        errors.push("No se pueden crear o modificar facturas para un pedido inactivo.");
    }

    // Rule 6: Amount Validations
    const montoTotal = currentFormData.montoTotal ?? -1; 
    const montoPagado = currentFormData.montoPagado ?? -1;

    if (montoTotal < 0 && currentFormData.montoTotal !== undefined && currentFormData.montoTotal !== null) { // Check only if defined and negative
        errors.push("El monto total no puede ser negativo.");
    }
    if (montoPagado < 0 && currentFormData.montoPagado !== undefined && currentFormData.montoPagado !== null) { // Check only if defined and negative
        errors.push("El monto pagado no puede ser negativo.");
    }
    if (montoTotal >= 0 && montoPagado >= 0 && montoPagado > montoTotal) {
        errors.push("El monto pagado no puede ser mayor que el monto total.");
    }
    
    // Rule 7: modoPago = 'prepagado' (Dates must be same calendar day)
    if (pedido.modoPago === 'prepagado' && currentFormData.fecha && currentFormData.fechaPago) {
        const cmpFechasPrepagado = compararSoloFechaFCZH(currentFormData.fecha, currentFormData.fechaPago);
        if (cmpFechasPrepagado !== "igual") {
            if (cmpFechasPrepagado === "invalido") {
                errors.push("Error al comparar la fecha de factura y fecha de pago para pedido prepagado (formato inválido o datos faltantes).");
            } else {
                errors.push("Para pedidos prepagados, la fecha de factura y la fecha de pago deben corresponder al mismo día.");
            }
        }
    }

    // Rule 8: modoPago = 'libre de costo'
    if (pedido.modoPago === 'libre de costo') {
        if (currentFormData.montoTotal !== 0) {
            errors.push("Para pedidos 'libre de costo', el monto total debe ser 0.");
        }
        // Monto pagado for 'libre de costo' is already forced to 0 by useEffect, but good to double check
        if (currentFormData.montoPagado !== 0 && (currentFormData.montoPagado !== undefined && currentFormData.montoPagado !== null)) {
             errors.push("Para pedidos 'libre de costo', el monto pagado debe ser 0.");
        }
    }

    // Rule 9: Fecha Vencimiento after Fecha Factura
    if (currentFormData.fecha && currentFormData.fechaVencimiento) {
        const cmpVencimiento = compararSoloFechaFCZH(currentFormData.fechaVencimiento, currentFormData.fecha);
        if (cmpVencimiento === "menor") {
            errors.push("La fecha de vencimiento no puede ser anterior a la fecha de la factura.");
        } else if (cmpVencimiento === "invalido") {
            errors.push("Error al comparar la fecha de vencimiento con la fecha de factura (formato inválido o datos faltantes).");
        }
    }


    return errors;
};

function CrearFacturasPage() {
    const router = useRouter();
    const { toast } = useToast();
    const { user: authUser, loading: authFirebaseLoading, error: authFirebaseError } = useAuth();

    const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
    const [profileLoading, setProfileLoading] = useState<boolean>(true);
    const [profileError, setProfileError] = useState<string | null>(null);
    const [isMasterUser, setIsMasterUser] = useState<boolean>(false);
    const [pedidos, setPedidos] = useState<Pedido[]>([]);
    const [selectedPedido, setSelectedPedido] = useState<Pedido | null>(null);
    const [selectedPedidoId, setSelectedPedidoId] = useState<string>("");
    const [facturas, setFacturas] = useState<Factura[]>([]);
    const [selectedFactura, setSelectedFactura] = useState<Factura | null>(null);
    const [isLoadingPedidos, setIsLoadingPedidos] = useState<boolean>(false);
    const [isLoadingFacturas, setIsLoadingFacturas] = useState<boolean>(false);
    const [pedidosError, setPedidosError] = useState<string | null>(null);
    const [facturasError, setFacturasError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false); // For disabling buttons during async ops
    const [formData, setFormData] = useState<Partial<Factura>>({});
    const [isEditingForm, setIsEditingForm] = useState<boolean>(false); 
    const [contratosResidenciaMap, setContratosResidenciaMap] = useState<Map<ContratoResidenciaId, { id: ContratoResidenciaId, residencia: ResidenciaId }>>(new Map());

    const defaultTimeZone = 'America/Tegucigalpa';

    useEffect(() => {
        if (authFirebaseLoading) return;
        if (!authUser) { router.push('/'); return; }
        const fetchProfile = async () => {
            setProfileLoading(true);
            try {
                const userDocRef = doc(db, 'users', authUser.uid);
                const userDocSnap = await getDoc(userDocRef);
                if (userDocSnap.exists()) {
                    const profileData = userDocSnap.data() as UserProfile;
                    setUserProfile(profileData);
                    setIsMasterUser(profileData.roles?.includes('master') || false);
                } else {
                    setProfileError("Perfil de usuario no encontrado."); setIsMasterUser(false);}
            } catch (error: any) {
                setProfileError("Error al cargar el perfil: " + error.message); setIsMasterUser(false);}
            setProfileLoading(false);
        };
        fetchProfile();
    }, [authUser, authFirebaseLoading, router]);

    useEffect(() => {
        if (!isMasterUser) {
            setContratosResidenciaMap(new Map());
            return;
        }
        const fetchContratos = async () => {
            try {
                const contratosCollectionRef = collection(db, 'contratosResidencia'); // Verify this collection name
                const querySnapshot = await getDocs(contratosCollectionRef);
                const fetchedContratosMap = new Map<ContratoResidenciaId, { id: ContratoResidenciaId; residencia: ResidenciaId }>();
                querySnapshot.docs.forEach(doc => {
                    const data = doc.data();
                    // Ensure the document has the residencia field
                    if (data.residencia) {
                        fetchedContratosMap.set(doc.id as ContratoResidenciaId, {
                            id: doc.id as ContratoResidenciaId,
                            residencia: data.residencia as ResidenciaId
                     });
                    } else {
                        console.warn(`ContratoResidencia document ${doc.id} is missing 'residencia' field.`);
                    }
                });
                setContratosResidenciaMap(fetchedContratosMap);
            } catch (error: any) {
                console.error("Error fetching contratosResidencia: ", error);
                toast({ title: "Error", description: "No se pudieron cargar los datos de contratos de residencia.", variant: "destructive" });
                setContratosResidenciaMap(new Map()); // Reset on error
            }
        };
        fetchContratos();
    }, [isMasterUser, toast]); // Added toast to dependency array

    useEffect(() => {
        if (!isMasterUser) {
            setPedidos([]); setSelectedPedido(null); setSelectedPedidoId(""); return;
        }
        const fetchPedidos = async () => {
            setIsLoadingPedidos(true); setPedidosError(null);
            try {
                const pedidosCollectionRef = collection(db, 'pedidos');
                const querySnapshot = await getDocs(pedidosCollectionRef);
                const fetchedPedidos = querySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Pedido));
                setPedidos(fetchedPedidos);
            } catch (error: any) {
                setPedidosError("Error al cargar los pedidos: " + error.message); setPedidos([]); }
            setIsLoadingPedidos(false);
        };
        fetchPedidos();
    }, [isMasterUser]);

    const fetchFacturasForSelectedPedido = async () => {
        if (!selectedPedido) {
            setFacturas([]); setSelectedFactura(null); setFormData({}); setIsEditingForm(false); return;
        }
        setIsLoadingFacturas(true); setFacturasError(null);
        try {
            const facturasCollectionRef = collection(db, 'facturas');
            const q = query(facturasCollectionRef, where("idPedido", "==", selectedPedido.id));
            const querySnapshot = await getDocs(q);
            const fetchedFacturas = querySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Factura));
            const sortedFacturas = fetchedFacturas.sort((a, b) => {
                    // Ensure a.fecha and b.fecha are valid before comparing
                    if (!a.fecha || !b.fecha) {
                        // Handle cases where fecha might be missing or invalid, 
                        // though ideally, they should always be present and valid.
                        // This basic handling pushes items with invalid dates to one end.
                        if (!a.fecha && !b.fecha) return 0;
                        if (!a.fecha) return 1; // a comes after b
                        if (!b.fecha) return -1; // a comes before b
                    }
                    const comparisonResult = compararFCZH(a.fecha, b.fecha);
                    if (comparisonResult === "mayor") return 1;
                    if (comparisonResult === "menor") return -1;
                    return 0; // "igual" or "invalido" (treat "invalido" as equal for sorting stability, or handle explicitly)
                });
            setFacturas(sortedFacturas);

            if (selectedPedido.tipo !== 'suscripcion') {
                // Non-Subscription Pedido (e.g., 'licencia temporal')
                if (sortedFacturas.length > 0) {
                    // Non-subscription with an existing invoice: View/Edit existing
                    setSelectedFactura(sortedFacturas[0]);
                    setFormData(sortedFacturas[0]);
                    setIsEditingForm(false); // Start in view mode
                } else {
                    // Non-subscription with NO existing invoice: Prepare to CREATE a new one
                    setSelectedFactura(null);
                    
                    // Initialize formData for a new invoice.
                    // This logic can be similar to the start of handleAddNewFacturaSubscription
                    // or a new helper function. For example:
                    const tempDate = new Date();
                    const year = tempDate.getFullYear();
                    const month = String(tempDate.getMonth() + 1).padStart(2, '0');
                    const day = String(tempDate.getDate()).padStart(2, '0');
                    const todayDateString = `${year}-${month}-${day}`;
                    const initialFechaFCZH = crearFCZH_fecha(todayDateString, defaultTimeZone); // Ensure defaultTimeZone is accessible

                    if (!initialFechaFCZH) {
                        toast({ title: "Error Interno", description: "No se pudo generar la fecha inicial para la factura.", variant: "destructive" });
                        setFormData({});
                        setIsEditingForm(false); 
                    } else {
                        let initialMontoTotal = selectedPedido.montoTotal; // For non-subscription, usually the full amount
                        let initialMontoPagado = 0; // Default to 0 for new invoice

                        if (selectedPedido.modoPago === 'libre de costo') {
                            initialMontoTotal = 0;
                            initialMontoPagado = 0;
                        }

                        setFormData({
                            idPedido: selectedPedido.id as PedidoId,
                            fecha: initialFechaFCZH,
                            fechaPago: initialFechaFCZH, 
                            fechaVencimiento: initialFechaFCZH,
                            control: 'manual',
                            idFacturaOdoo: null,
                            monedaFactura: selectedPedido.moneda,
                            montoPagado: initialMontoPagado,
                            montoTotal: initialMontoTotal,
                            estadoDePago: calculateEstadoDePago(initialMontoTotal, initialMontoPagado),
                        });
                        setIsEditingForm(true); // <<<< SET TO TRUE TO SHOW THE FORM FOR CREATION
                    }
                }
            } else {
                // Subscription Pedido: User must explicitly click "Añadir Factura"
                setSelectedFactura(null);
                setFormData({});
                setIsEditingForm(false);
            }

        } catch (error: any) {
            setFacturasError("Error al cargar las facturas: " + error.message); setFacturas([]);
        }
        setIsLoadingFacturas(false);
    };

    useEffect(() => {
        fetchFacturasForSelectedPedido();
    }, [selectedPedido]);

    // useEffect (around L381 in your full file)

    useEffect(() => {
        // Guard: Only run if selectedPedido is present and formData has the necessary fields to avoid errors on initial renders.
        // Explicitly check for undefined because 0 is a valid amount.
        if (!selectedPedido || !formData || typeof formData.montoTotal === 'undefined' || typeof formData.montoPagado === 'undefined') {
            return;
        }

        let desiredMontoTotal = formData.montoTotal;
        let desiredMontoPagado = formData.montoPagado;

        // Adjust for 'libre de costo'
        if (selectedPedido.modoPago === 'libre de costo') {
            desiredMontoTotal = 0;
            desiredMontoPagado = 0;
        }

        // Calculate the desired estadoDePago based on potentially adjusted amounts
        const desiredEstadoDePago = calculateEstadoDePago(desiredMontoTotal, desiredMontoPagado);

        // Only update state if there's an actual change in any of the relevant fields
        if (
            formData.montoTotal !== desiredMontoTotal ||
            formData.montoPagado !== desiredMontoPagado ||
            formData.estadoDePago !== desiredEstadoDePago
        ) {
            setFormData(prev => ({
                ...prev, // Preserve other formData fields
                montoTotal: desiredMontoTotal,
                montoPagado: desiredMontoPagado,
                estadoDePago: desiredEstadoDePago,
            }));
        }
    }, [
        formData.montoTotal,
        formData.montoPagado,
        formData.estadoDePago, // This dependency is important
        selectedPedido       // Essential for selectedPedido.modoPago
        // The 'formData' object itself should not be a dependency, only its relevant primitive fields.
    ]);

    // In facturas/page.tsx, inside CrearFacturasPage component
    const getDisplayResidenciaIdForPedido = (pedido: Pedido): string => {
        if (!pedido.contrato) {
            return 'N/A (Contrato no enlazado)'; // Fallback if no contract link
        }
        const contrato = contratosResidenciaMap.get(pedido.contrato);
        if (contrato && contrato.residencia) {
            return contrato.residencia; // This is the human-readable ResidenciaId
        }
        // Fallback if contract not found in map or is missing residencia
        return `N/A (ID Contrato: ${pedido.contrato.substring(0, 6)}...)`;
    };

    const handleFechaStringChange = (fieldName: 'fecha' | 'fechaPago' | 'fechaVencimiento', dateValue: string) => {
        setFormData(prev => {
            const existingFCZH = prev[fieldName]; // This is campoFechaConZonaHoraria | undefined
            const updatedCampo: campoFechaConZonaHoraria = {
                fecha: dateValue,
                zonaHoraria: existingFCZH?.zonaHoraria || defaultTimeZone // Use optional chaining and default
            };

            const updatedData: Partial<Factura> = { ...prev, [fieldName]: updatedCampo };

            if (selectedPedido?.modoPago === 'prepagado' && (fieldName === 'fecha' || fieldName === 'fechaPago')) {
                const otherFieldName = fieldName === 'fecha' ? 'fechaPago' : 'fecha';
                const existingOtherFCZH = prev[otherFieldName];
                updatedData[otherFieldName] = {
                    fecha: dateValue, 
                    zonaHoraria: existingOtherFCZH?.zonaHoraria || defaultTimeZone
                };
            }
           return updatedData;
        });
    };

    const handleZonaHorariaChange = (fieldName: 'fecha' | 'fechaPago' | 'fechaVencimiento', timezoneValue: string) => {
        setFormData(prev => {
            const existingFCZH = prev[fieldName]; // This is campoFechaConZonaHoraria | undefined
            const updatedCampo: campoFechaConZonaHoraria = {
                fecha: existingFCZH?.fecha || '', // Use optional chaining and default for fecha
                zonaHoraria: timezoneValue
            };

            const updatedData: Partial<Factura> = { ...prev, [fieldName]: updatedCampo };

            if (selectedPedido?.modoPago === 'prepagado' && (fieldName === 'fecha' || fieldName === 'fechaPago')) {
                const otherFieldName = fieldName === 'fecha' ? 'fechaPago' : 'fecha';
                const existingOtherFCZH = prev[otherFieldName];
                updatedData[otherFieldName] = {
                    fecha: existingOtherFCZH?.fecha || '',
                    zonaHoraria: timezoneValue
                };
            }
            return updatedData;
        });
    };
    
    const handleNumericInputChange = (fieldName: 'montoTotal' | 'montoPagado', value: string) => {
        const numValue = value === '' ? undefined : parseFloat(value);
        setFormData(prev => ({...prev, [fieldName]: numValue }));
    };

    const handlePedidoSelect = (pedidoId: string) => {
        setSelectedPedidoId(pedidoId);
        const pedido = pedidos.find(p => p.id === pedidoId) || null;
        setSelectedPedido(pedido);
    };

    const handleSelectFacturaForSubscription = (factura: Factura) => {
        setSelectedFactura(factura);
        setFormData(factura);
        setIsEditingForm(false); 
    };

    const handleAddNewFacturaSubscription = () => {
        if (!selectedPedido) return;
        setSelectedFactura(null);

        // It's better to get the current date string in the target timezone using date-fns-tz if possible
        // For simplicity, if you don't have date-fns-tz readily available here to format current date *in* defaultTimeZone:
        const tempDate = new Date();
        const year = tempDate.getFullYear();
        const month = String(tempDate.getMonth() + 1).padStart(2, '0');
        const day = String(tempDate.getDate()).padStart(2, '0');
        const todayDateString = `${year}-${month}-${day}`; // This is LOCAL current date string

        // Now use your imported helper
        const initialFechaFCZH = crearFCZH_fecha(todayDateString, defaultTimeZone);

        if (!initialFechaFCZH) {
            toast({ title: "Error Interno", description: "No se pudo generar la fecha inicial para la factura. Verifique la zona horaria por defecto.", variant: "destructive" });
            setIsSubmitting(false); // if you have setIsSubmitting around this
            return; 
        }
        
        // When setting formData:
        //
        let initialMontoTotal = 0, initialMontoPagado = 0;
        if (selectedPedido.modoPago === 'libre de costo'){
            initialMontoTotal = 0; initialMontoPagado = 0;
        } else if (facturas.length === 0 && selectedPedido.montoTotal) {
             initialMontoTotal = selectedPedido.montoTotal;
        } 
        setFormData({
            idPedido: selectedPedido.id as PedidoId,
            fecha: initialFechaFCZH, 
            fechaPago: initialFechaFCZH,
            fechaVencimiento: initialFechaFCZH, 
            control: 'manual', 
            idFacturaOdoo: null,
            monedaFactura: selectedPedido.moneda,
            montoPagado: initialMontoPagado, 
            montoTotal: initialMontoTotal,
            estadoDePago: calculateEstadoDePago(initialMontoTotal, initialMontoPagado),
        });
        setIsEditingForm(true); 
    };

    const handleSetEditing = () => {
      if (!selectedPedido?.activo) return;
      setIsEditingForm(true);
    }

    const handleCancelEdit = () => {
        setIsEditingForm(false);
        if (selectedFactura) setFormData(selectedFactura); 
        else if (selectedPedido && selectedPedido.tipo !== 'suscripcion' && facturas.length > 0) {
            setFormData(facturas[0]); setSelectedFactura(facturas[0]);
        } else setFormData({});
    }

    const roundToTwoDecimals = (num: number | undefined): number => num === undefined ? 0 : parseFloat(num.toFixed(2));

    const handleCreateFactura = async () => {
        if (!authUser) return;

        const validationErrors = validateFacturaData(formData, selectedPedido, facturas, true); // true for isCreating
        if (validationErrors.length > 0) {
            validationErrors.forEach(err => toast({
                title: "Error de Validación",
                description: err,
                variant: "destructive",
                duration: 5000, // Show for 5 seconds
            }));
            setIsSubmitting(false); // Ensure submission state is reset
            return;
        }

        setIsSubmitting(true);

        try {
            const newFacturaData: Omit<Factura, 'id'> = {
                idPedido: selectedPedido!.id as PedidoId,
                fecha: formData.fecha!,
                fechaPago: formData.fechaPago!,
                fechaVencimiento: formData.fechaVencimiento!,
                control: 'manual',
                idFacturaOdoo: null,
                estadoDePago: calculateEstadoDePago(roundToTwoDecimals(formData.montoTotal), roundToTwoDecimals(formData.montoPagado)),
                monedaFactura: formData.monedaFactura || selectedPedido!.moneda,
                montoPagado: roundToTwoDecimals(formData.montoPagado),
                montoTotal: roundToTwoDecimals(formData.montoTotal),
            };
            const docRef = await addDoc(collection(db, "facturas"), newFacturaData);
            await logClientAction(
                'FACTURA_CREADA',
                { 
                  residenciaId: getDisplayResidenciaIdForPedido(selectedPedido!) || 'N/A',
                  targetId: docRef.id,
                  targetCollection: 'facturas',
                  details: {
                    pedidoId: newFacturaData.idPedido,
                    facturaId: docRef.id,
                  }
                }
              );
            toast({ title: "Éxito", description: "Factura creada correctamente." });
            await fetchFacturasForSelectedPedido(); // Re-fetch to get all, including the new one and update UI
            // If non-subscription, select the newly created one.
            if (selectedPedido!.tipo !== 'suscripcion') {
                const newFactura = { ...newFacturaData, id: docRef.id } as Factura;
                setSelectedFactura(newFactura);
                setFormData(newFactura);
                setIsEditingForm(false);
            } else {
                setIsEditingForm(false);
                setFormData({}); // Clear form for next potential subscription invoice
            }
        } catch (error: any) {
            console.error("Error creating factura: ", error);
            toast({ title: "Error", description: `No se pudo crear la factura: ${error.message}`, variant: "destructive" });
        }
        setIsSubmitting(false);
    };

    const handleUpdateFactura = async () => {
        if (!authUser) return;

        if (!selectedFactura) {
            toast({
                title: "Error Interno",
                description: "No hay una factura seleccionada para actualizar. Por favor, recargue la página o seleccione una factura.",
                variant: "destructive",
                duration: 7000,
            });
            setIsSubmitting(false); // Ensure submission state is reset
            return;
        }

        const validationErrors = validateFacturaData(formData, selectedPedido, facturas, false); // false for isCreating (it's an update)
        if (validationErrors.length > 0) {
            validationErrors.forEach(err => toast({
                title: "Error de Validación",
                description: err,
                variant: "destructive",
                duration: 5000,
            }));
            setIsSubmitting(false); // Ensure submission state is reset
            return;
        }

        setIsSubmitting(true);

        try {
            const updatedFacturaData: Partial<Factura> = {
                fecha: formData.fecha,
                fechaPago: formData.fechaPago,
                fechaVencimiento: formData.fechaVencimiento,
                monedaFactura: formData.monedaFactura,
                montoPagado: roundToTwoDecimals(formData.montoPagado),
                montoTotal: roundToTwoDecimals(formData.montoTotal),
                estadoDePago: calculateEstadoDePago(roundToTwoDecimals(formData.montoTotal), roundToTwoDecimals(formData.montoPagado)),
            };
            const facturaRef = doc(db, "facturas", selectedFactura!.id as string);
            await updateDoc(facturaRef, updatedFacturaData);
            await logClientAction(
                'FACTURA_ACTUALIZADA',
                { 
                  residenciaId: getDisplayResidenciaIdForPedido(selectedPedido!) || 'N/A',
                  targetId: selectedFactura.id,
                  targetCollection: 'facturas',
                  details: {
                    pedidoId: selectedPedido!.id,
                    facturaId: selectedFactura.id,
                    changes: updatedFacturaData
                  }
                }
              );
            toast({ title: "Éxito", description: "Factura actualizada correctamente." });
            await fetchFacturasForSelectedPedido(); // Re-fetch to update list and current form if needed
            setIsEditingForm(false);
        } catch (error: any) {
            console.error("Error updating factura: ", error);
            toast({ title: "Error", description: `No se pudo actualizar la factura: ${error.message}`, variant: "destructive" });
        }
        setIsSubmitting(false);
    };

    const handleDeleteFactura = async () => {
        if (!selectedFactura || !selectedPedido || !authUser) return;
        if (!window.confirm(`¿Está seguro de que desea eliminar la factura ${selectedFactura.id}? Esta acción no se puede deshacer.`)) return;
        setIsSubmitting(true);
        try {
            const facturaRef = doc(db, "facturas", selectedFactura.id as string);
            await deleteDoc(facturaRef);
            await logClientAction(
                'FACTURA_ELIMINADA',
                { 
                  residenciaId: getDisplayResidenciaIdForPedido(selectedPedido!) || 'N/A',
                  targetId: selectedFactura.id,
                  targetCollection: 'facturas',
                  details: {
                    pedidoId: selectedPedido.id,
                    facturaId: selectedFactura.id
                  }
                }
              );
            toast({ title: "Éxito", description: "Factura eliminada correctamente." });
            await fetchFacturasForSelectedPedido(); // Re-fetch to update list
            // Clear selection and form as it's deleted
            setSelectedFactura(null);
            setFormData({});
            setIsEditingForm(false);
        } catch (error: any) {
            console.error("Error deleting factura: ", error);
            toast({ title: "Error", description: `No se pudo eliminar la factura: ${error.message}`, variant: "destructive" });
        }
        setIsSubmitting(false);
    };

    // TODO: Implement Data Validation Logic (Step 9)

    if (authFirebaseLoading || profileLoading) return <p>Cargando autorización...</p>;
    if (authFirebaseError || profileError) return <p>Error de autenticación/perfil: {authFirebaseError?.message || profileError}</p>;
    if (!isMasterUser) {
        if (!authUser && !authFirebaseLoading) return <p>Redirigiendo...</p>; 
        return <p>Acceso denegado.</p>;
    }
    if (isLoadingPedidos) return <p>Cargando pedidos...</p>;
    if (pedidosError) return <p>Error al cargar pedidos: {pedidosError}</p>;

    const isFormFieldsDisabled = !isEditingForm || !selectedPedido?.activo || isSubmitting;
    const isViewingNonSubscriptionFactura = selectedPedido?.tipo !== 'suscripcion' && selectedFactura && !isEditingForm;

    let showSingleForm = false;
    if (selectedPedido) {
        if (selectedPedido.tipo !== 'suscripcion') {
            showSingleForm = !!selectedFactura || (isEditingForm && formData.idPedido === selectedPedido.id) ;
        } else { 
            showSingleForm = !!selectedFactura || (isEditingForm && formData.idPedido === selectedPedido.id);
        }
    }

    return (
        <div className="container mx-auto p-4">
            <h1 className="text-2xl font-bold mb-4">Gestión de Facturas</h1>
            
            <section id="order-section" className="mb-6 p-4 border rounded-lg">
                <h2 className="text-xl font-semibold mb-3">Seleccionar Pedido</h2>
                {pedidos.length > 0 ? (
                    <Select onValueChange={handlePedidoSelect} value={selectedPedidoId} disabled={isLoadingFacturas || isEditingForm || isSubmitting}>
                        <SelectTrigger className="w-full md:w-1/2">
                            <SelectValue placeholder="Seleccione un pedido..." />
                        </SelectTrigger>
                        <SelectContent>
                            {pedidos.map(pedido => (
                                <SelectItem key={pedido.id} value={pedido.id as string}>
                                    {`${getDisplayResidenciaIdForPedido(pedido)} - ${pedido.tipo} - ${format(pedido.fechaInicio.fecha,"MMM-yy")}`}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                ) : (
                    <p>No hay pedidos disponibles para seleccionar.</p>
                )}
                {selectedPedido && (
                    <div className="mt-4 p-3 border rounded-md bg-gray-50 dark:bg-gray-800">
                        <h3 className="text-lg font-medium mb-2">Detalles del Pedido Seleccionado: ID {selectedPedido.id.substring(0,6)}...</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                            <p><Label>ID Residencia:</Label> {getDisplayResidenciaIdForPedido(selectedPedido)}</p>
                            <p><Label>Tipo:</Label> {selectedPedido.tipo}</p>
                            <p><Label>Modo de Pago:</Label> {selectedPedido.modoPago}</p>
                            <p><Label>Monto Total Pedido:</Label> {selectedPedido.montoTotal?.toFixed(2) || 'N/A'} {selectedPedido.moneda}</p>
                            <p><Label>Periodicidad:</Label> {selectedPedido.periodicidad || 'N/A'}</p>
                            <p><Label>Fecha Inicio:</Label> {format(selectedPedido.fechaInicio.fecha,"dd MMM yyyy")}</p>
                            <p><Label>Fecha Fin:</Label> {selectedPedido.fechaFin ? format(selectedPedido.fechaFin.fecha,"dd MMM yyyy") : 'Perpetua'}</p>
                            <p><Label>Activo:</Label> <span className={selectedPedido.activo ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>{selectedPedido.activo ? 'Sí' : 'No'}</span></p>
                        </div>
                    </div>
                )}
            </section>
            
            {selectedPedido && isLoadingFacturas && <p className="mt-4">Cargando facturas...</p>}
            {selectedPedido && facturasError && <p className="mt-4 text-red-500"><AlertTriangle className="inline mr-1 h-4 w-4"/>Error al cargar facturas: {facturasError}</p>}
            {selectedPedido && selectedPedido.tipo === 'suscripcion' && !isLoadingFacturas && !facturasError && (
                <section id="multiple-invoice-section" className="mb-6">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-xl font-semibold">Facturas de Suscripción</CardTitle>
                            <Button onClick={handleAddNewFacturaSubscription} variant="outline" size="sm" 
                                    disabled={!selectedPedido.activo || (isEditingForm && (!selectedFactura || selectedFactura.idPedido !== selectedPedido.id)) || isSubmitting}>
                                <PlusCircle className="mr-2 h-4 w-4" /> Añadir Factura
                            </Button>
                        </CardHeader>
                        <CardContent>
                            {facturas.length > 0 ? (
                                <ul className="space-y-2">
                                    {facturas.map(factura => (
                                        <li key={factura.id} onClick={() => handleSelectFacturaForSubscription(factura)} 
                                            className={`p-3 rounded-md border cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 ${selectedFactura?.id === factura.id ? 'bg-gray-100 dark:bg-gray-700 shadow-md' : 'bg-white dark:bg-gray-800'}`}>
                                            <div className="flex justify-between items-center">
                                                <div>
                                                    <p className="font-medium">ID: {factura.id.substring(0,6)}... | Fecha: {format(factura.fecha.fecha,"dd-mm-yy")}</p>
                                                    <p className="text-sm text-gray-600 dark:text-gray-400">Monto: {factura.montoTotal.toFixed(2)} {factura.monedaFactura}</p>
                                                </div>
                                                <Badge variant={getEstadoDePagoBadgeVariant(factura.estadoDePago)}>{factura.estadoDePago.replace('_',' ')}</Badge>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="text-gray-500 dark:text-gray-400">No hay facturas para esta suscripción. {!selectedPedido.activo ? "El pedido está inactivo." : "Haga clic en Añadir Factura."}</p>
                            )}
                        </CardContent>
                    </Card>
                </section>
            )}

            {showSingleForm && !isLoadingFacturas && !facturasError && selectedPedido && (
                 <section id="single-invoice-section" className="mb-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>
                                {selectedPedido.tipo === 'suscripcion' 
                                    ? (selectedFactura && isEditingForm ? `Editando Factura ${selectedFactura.id.substring(0,6)}...` 
                                        : selectedFactura && !isEditingForm ? `Viendo Factura ${selectedFactura.id.substring(0,6)}...`
                                        : `Crear Nueva Factura para Suscripción`)
                                    : (selectedFactura && !isEditingForm ? `Viendo Factura ${selectedFactura.id.substring(0,6)}...` 
                                        : selectedFactura && isEditingForm ? `Editando Factura ${selectedFactura.id.substring(0,6)}...`
                                        : 'Crear Factura para Pedido')}
                            </CardTitle>
                            {!selectedPedido.activo && <CardDescription className="text-red-500"><AlertTriangle className="inline mr-1 h-4 w-4"/>El pedido no está activo. No se pueden modificar ni crear facturas.</CardDescription>}
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <Label htmlFor="fecha_date">Fecha Factura (YYYY-MM-DD)</Label>
                                <Input
                                    id="fecha_date"
                                    type="date"
                                    value={formData.fecha?.fecha || ''}
                                    onChange={(e) => handleFechaStringChange('fecha', e.target.value)}
                                    className="w-full p-2 border rounded mt-1 bg-background text-foreground"
                                    disabled={isFormFieldsDisabled || !!isViewingNonSubscriptionFactura}
                                />
                                <Label htmlFor="fecha_tz" className="mt-2">Zona Horaria (Factura)</Label>
                                <TimezoneSelector
                                    label="Zona Horaria (Factura)" // Use the label prop
                                    initialTimezone={formData.fecha?.zonaHoraria || defaultTimeZone}
                                    onTimezoneChange={(tz) => handleZonaHorariaChange('fecha', tz)}
                                    disabled={isFormFieldsDisabled || !!isViewingNonSubscriptionFactura}
                                    // Optional: Add selectClassName, labelClassName, containerClassName as needed
                                    // selectClassName="your-custom-select-class"
                                    // labelClassName="your-custom-label-class"
                                    // containerClassName="your-custom-container-class"
                                />
                            </div>
                            <div>
                                <Label htmlFor="fechaVencimiento_date">Fecha de vencimiento del pago (YYYY-MM-DD)</Label>
                                <Input
                                    id="fechaVencimiento_date"
                                    type="date"
                                    value={formData.fechaVencimiento?.fecha || ''}
                                    onChange={(e) => handleFechaStringChange('fechaVencimiento', e.target.value)}
                                    className="w-full p-2 border rounded mt-1 bg-background text-foreground"
                                    disabled={isFormFieldsDisabled || !!isViewingNonSubscriptionFactura}
                                />
                                <TimezoneSelector
                                    label="Zona Horaria (Vencimiento)"
                                    initialTimezone={formData.fechaVencimiento?.zonaHoraria || defaultTimeZone}
                                    onTimezoneChange={(tz) => handleZonaHorariaChange('fechaVencimiento', tz)}
                                    disabled={isFormFieldsDisabled || !!isViewingNonSubscriptionFactura}
                                />
                            </div>
                            <div>
                                <Label htmlFor="fechaPago_date">Fecha efectiva de Pago (YYYY-MM-DD)</Label>
                                <Input
                                    id="fechaPago_date"
                                    type="date"
                                    value={formData.fechaPago?.fecha || ''}
                                    onChange={(e) => handleFechaStringChange('fechaPago', e.target.value)}
                                    className="w-full p-2 border rounded mt-1 bg-background text-foreground"
                                    disabled={isFormFieldsDisabled || !!isViewingNonSubscriptionFactura || (selectedPedido?.modoPago === 'prepagado' && isEditingForm)}
                                />
                                <Label htmlFor="fechaPago_tz" className="mt-2">Zona Horaria (Pago)</Label>
                                <TimezoneSelector
                                    label="Zona Horaria (Pago)" // Use the label prop
                                    initialTimezone={formData.fechaPago?.zonaHoraria || defaultTimeZone}
                                    onTimezoneChange={(tz) => handleZonaHorariaChange('fechaPago', tz)}
                                    disabled={isFormFieldsDisabled || !!isViewingNonSubscriptionFactura || (selectedPedido?.modoPago === 'prepagado' && isEditingForm)}
                                    // Optional: Add selectClassName, labelClassName, containerClassName as needed
                                    // selectClassName="your-custom-select-class"
                                    // labelClassName="your-custom-label-class"
                                    // containerClassName="your-custom-container-class"
                                />
                            </div>
                            <div>
                                <Label htmlFor="monedaFactura">Moneda</Label>
                                <Select 
                                    value={formData.monedaFactura || selectedPedido.moneda}
                                    onValueChange={(value) => setFormData(prev => ({...prev, monedaFactura: value as Moneda}))}
                                    disabled={isFormFieldsDisabled || !!isViewingNonSubscriptionFactura}
                                >
                                    <SelectTrigger id="monedaFactura"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {monedaOptions.map(option => <SelectItem key={option} value={option}>{option}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label htmlFor="montoTotal">Monto Total</Label>
                                <Input 
                                    id="montoTotal" type="number" placeholder="0.00" step="0.01"
                                    value={formData.montoTotal === undefined ? '' : formData.montoTotal}
                                    onChange={(e) => handleNumericInputChange('montoTotal', e.target.value)}
                                    disabled={isFormFieldsDisabled || isViewingNonSubscriptionFactura || selectedPedido.modoPago === 'libre de costo'}
                                />
                                {selectedPedido.modoPago === 'libre de costo' && <p className="text-xs text-muted-foreground">Monto es 0 para pedidos 'libre de costo'.</p>}
                            </div>
                            <div>
                                <Label htmlFor="montoPagado">Monto Pagado</Label>
                                <Input 
                                    id="montoPagado" type="number" placeholder="0.00" step="0.01"
                                    value={formData.montoPagado === undefined ? '' : formData.montoPagado}
                                    onChange={(e) => handleNumericInputChange('montoPagado', e.target.value)}
                                    disabled={isFormFieldsDisabled || isViewingNonSubscriptionFactura || selectedPedido.modoPago === 'libre de costo'}
                                />
                            </div>
                             {formData.montoTotal !== undefined && formData.montoPagado !== undefined && (
                                <div>
                                    <Label>Estado de Pago (Calculado)</Label>
                                    <Badge variant={getEstadoDePagoBadgeVariant(calculateEstadoDePago(formData.montoTotal, formData.montoPagado))}>
                                        {calculateEstadoDePago(formData.montoTotal, formData.montoPagado).replace('_', ' ')}
                                    </Badge>
                                </div>
                            )}
                        </CardContent>
                        <CardFooter className="flex justify-end space-x-2">
                            {!selectedFactura && isEditingForm && selectedPedido.activo && (
                                <Button onClick={handleCreateFactura} disabled={isSubmitting} ><Save className="mr-2 h-4 w-4"/> Crear Factura</Button>
                            )}
                            {selectedFactura && !isEditingForm && selectedPedido.activo && (
                                <Button onClick={handleSetEditing} variant="outline" disabled={isSubmitting}><Edit3 className="mr-2 h-4 w-4"/> Editar</Button>
                            )}
                            {selectedFactura && isEditingForm && selectedPedido.activo && (
                                <Button onClick={handleUpdateFactura} disabled={isSubmitting}><Save className="mr-2 h-4 w-4"/> Guardar Cambios</Button>
                            )}
                            {isEditingForm && (
                                <Button onClick={handleCancelEdit} variant="outline" disabled={isSubmitting}><Ban className="mr-2 h-4 w-4"/> Cancelar</Button>
                            )}
                            {selectedFactura && selectedPedido.activo && (
                                 <Button onClick={handleDeleteFactura} variant="destructive" disabled={isEditingForm || isSubmitting}><Trash2 className="mr-2 h-4 w-4"/> Eliminar</Button>
                            )}
                        </CardFooter>
                    </Card>
                 </section>
            )}
        </div>
    );
}

export default CrearFacturasPage;
