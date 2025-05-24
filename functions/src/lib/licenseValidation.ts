//import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
//import { logger } from "firebase-functions/v2";
import { db } from './firebase';
import {
  ContratoResidencia,
  ContratoResidenciaId,
  Pedido,
  PedidoId,
  Factura,
  FacturaId,
  Licencia,
  Licenciamiento
} from '../../../shared/models/contratos'; // Adjust path as needed
import { campoFechaConZonaHoraria } from '../../../shared/models/types'; // Adjust path as needed
import { resultadoComparacionFCZH, compararFCZH, crearFCZH_fecha, addDurationToFCZH } from '../../../shared/utils/commonUtils';

interface ValidationResult {
    isValid: boolean;
    errorMessages: string[];
}

// Helper function to check if a license is active
function isLicenseActiveFCZH(licencia: Licencia, currentDate: campoFechaConZonaHoraria): 'activa' | 'por activarse' | 'vencida' | 'error' {
    const initialDateComparison: resultadoComparacionFCZH = compararFCZH(licencia.fechaInicio, currentDate);
    const finalDateComparison: resultadoComparacionFCZH = compararFCZH(licencia.fechaFin, currentDate);
    let resultadoFinal: 'activa' | 'por activarse' | 'vencida' | 'error' = 'error';

    if (initialDateComparison === 'invalido' || finalDateComparison === 'invalido') {
        resultadoFinal = 'error'; // Cannot be active if no start date
    } else if ((initialDateComparison === 'menor' || initialDateComparison === 'igual') && (finalDateComparison === 'mayor' || finalDateComparison === 'igual') ) {
        resultadoFinal = 'activa';
    } else if (initialDateComparison === 'mayor') {
        resultadoFinal = 'por activarse';
    } else if (finalDateComparison === 'menor') {
        resultadoFinal = 'vencida';
    }

    return resultadoFinal;
}

export async function validateLicenseCreation(
    contratoId: ContratoResidenciaId,
    pedidoId: PedidoId
    ): Promise<ValidationResult> {
    const errorMessages: string[] = [];
    let isValid = true;

    const systemTimeZone = 'UTC'; // Or your system's/reference timezone
    const now = new Date();
    
    // Create a string representation of 'now' for crearFCZH_fecha
    // This should match the format your crearFCZH_fecha expects
    // Using a simplified ISO-like format for this example.
    // Adjust if your 'crearFCZH_fecha' expects a specific format or if you use a library like date-fns-tz.
    const pad = (num: number) => num.toString().padStart(2, '0');
    const currentTimestampString = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;  
    const currentDateFCZH = crearFCZH_fecha(currentTimestampString, systemTimeZone);
    if (!currentDateFCZH) {
        // Handle error: could not create current date FCZH representation
        return { isValid: false, errorMessages: ['Error interno: No se pudo determinar la fecha actual.'] };
    }

    // --- Fetch Data ---
    const contratoRef = db.collection('contratosResidencia').doc(contratoId as string); // NEW
    const contratoSnap = await contratoRef.get(); 
    if (!contratoSnap.exists) {
        return { isValid: false, errorMessages: ['Contrato no encontrado.'] };
    }
    const contrato = contratoSnap.data() as ContratoResidencia;

    const pedidoRef = db.collection('pedidos').doc(pedidoId as string); // NEW
    const pedidoSnap = await pedidoRef.get();
    if (!pedidoSnap.exists) {
        return { isValid: false, errorMessages: ['Pedido no encontrado.'] };
    }
    const pedido = pedidoSnap.data() as Pedido;
    // Ensure the pedido belongs to the contract (optional, good practice)
    if (pedido.contrato !== contratoId) {
        return { isValid: false, errorMessages: ['El pedido no pertenece al contrato especificado.'] };
    }
    // Fetch all licenses for the contract
    const licenciasQuery = db.collection('licencias') 
    .where('contratoLicencia', '==', contratoId);
    const licenciasSnap = await licenciasQuery.get();
    const allContractLicenses = licenciasSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Licencia & {id: string}));

    // Fetch invoices for the specific order (pedidoId)
    const facturasQuery = db.collection('facturas') // NEW
    .where('pedidoId', '==', pedidoId);
    const facturasSnap = await facturasQuery.get();
    const orderInvoices = facturasSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Factura & {id: FacturaId}));

    // Fetch licenciamientos for the order (can be linked to order invoices or specific licenses if structure allows)
    // This might need adjustment based on how Licenciamiento documents are structured and queried.
    // For now, let's assume we fetch all licenciamientos and then filter.
    // A more efficient query would be to fetch licenciamientos linked to the licenses of this contract or invoices of this order.
    const licenciamientosQuery = db.collection('licenciamientos');
    const licenciamientosSnap = await licenciamientosQuery.get();
    const allLicenciamientos = licenciamientosSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Licenciamiento & {id: string}));

    // Filter licenciamientos relevant to this order's invoices or this contract's licenses
    const orderInvoiceIds = orderInvoices.map(f => f.id);
    const contractLicenseIds = allContractLicenses.map(l => l.id);

    const relevantLicenciamientos = allLicenciamientos.filter(lic => {
        // Assuming Licenciamiento has facturaId and licenciaId
        return orderInvoiceIds.includes(lic.facturaId as FacturaId) || contractLicenseIds.includes(lic.licenciaId);
    });


    // --- Validation Logic ---

    // 1. Active License Validation (across all orders of the contract)
    const activeLicenses = allContractLicenses.filter(lic => {
        // Ensure licencia.fechaInicio and licencia.fechaFin are campoFechaConZonaHoraria
        // You might need to convert them if they are Firestore Timestamps right after fetching
        // For this example, assuming they are already in the correct type.
        const status = isLicenseActiveFCZH(lic, currentDateFCZH); // Call your refactored function
        return status === "activa"; // Adjust if your function returns different string for active
    });
    let validation1Passed = false;

    if (activeLicenses.length === 0) {
        validation1Passed = true;
    } else {
        const activeLicenseInOtherOrder = activeLicenses.find(
        (lic) => lic.pedido !== pedidoId
        );
        if (activeLicenseInOtherOrder) {
        errorMessages.push(
            'Ya hay una licencia activa de otra orden, corrija esta orden para proceder'
        );
        isValid = false;
        return { isValid, errorMessages }; // Fail fast as per 1.2
        }
    
        const activeLicenseInSameOrder = activeLicenses.find(
        (lic) => lic.pedido === pedidoId
        );
        if (activeLicenseInSameOrder) {
        if (pedido.tipo === 'suscripcion') {
            validation1Passed = true; // 1.3.1
        } else {
            errorMessages.push('Ya se tiene una licencia activa'); // 1.3.2
            isValid = false;
            // Continue to next set of validations as per 1.3.2
        }
        } else {
            // This logic branch might need review based on the comprehensive active license check.
            // If activeLicenses.length > 0, it means there's an active license.
            // If it's not in another order (handled by 1.2) and not in the same order (handled by 1.3),
            // this implies a potential gap or an unexpected state.
            // However, given the previous checks, this 'else' might be less likely to be hit
            // if an active license truly exists.
        }
    }
    if (!validation1Passed)
        isValid = false;
    // If validation1Passed is true, we proceed. If it's false due to 1.3.2, isValid is already false but we continue.
    // 2. Pedido Active and Timeframe Validation
    if (!pedido.activo) {
        errorMessages.push('El pedido no está activo, no se pueden generar licencias');
        isValid = false;
    }

    const compContInicialDentro1: resultadoComparacionFCZH = compararFCZH(pedido.fechaInicio, contrato.fechaInicio);
    const compContInicialDentro2: resultadoComparacionFCZH = compararFCZH(pedido.fechaFin, contrato.fechaInicio);
    let compContInicial: string = 'error';
  
    if (compContInicialDentro1 === 'invalido' || compContInicialDentro2 === 'invalido') {
        compContInicial = 'error';
    } else if ((compContInicialDentro1 === 'menor' || compContInicialDentro1 === 'igual') 
        && (compContInicialDentro2 === 'mayor' || compContInicialDentro2 === 'igual') ) {
            compContInicial = 'dentro';
    } else if (compContInicialDentro1 === 'mayor') {
        compContInicial = 'fuera anterior';
    } else if (compContInicialDentro2 === 'menor') {
        compContInicial = 'fuera posterior';
    }

    const compContFinalDentro1: resultadoComparacionFCZH = compararFCZH(pedido.fechaInicio, contrato.fechaFin);
    const compContFinalDentro2: resultadoComparacionFCZH = compararFCZH(pedido.fechaFin, contrato.fechaFin);
    let compContFinal: string = 'error';
  
    if (compContFinalDentro1 === 'invalido' || compContFinalDentro2 === 'invalido') {
        compContFinal = 'error';
    } else if ((compContFinalDentro1 === 'menor' || compContFinalDentro1 === 'igual') 
        && (compContFinalDentro2 === 'mayor' || compContFinalDentro2 === 'igual') ) {
            compContFinal = 'dentro';
    } else if (compContFinalDentro1 === 'mayor') {
        compContFinal = 'fuera anterior';
    } else if (compContFinalDentro2 === 'menor') {
        compContFinal = 'fuera posterior';
    }

    if (compContInicial !== 'dentro' || compContFinal !== 'dentro'){
        errorMessages.push("El contrato debe ser extendido para este pedido");
        isValid = false;
    }

   // Also check if pedido itself is within its own timeframe for the current date if relevant
   // The prompt stated "order itself is not in the timeframe of the project", interpreted as contract timeframe.
   // If it means pedido.fechaInicio and pedido.fechaFin relative to currentDate for creating a license *now*:
  // const pedidoOwnFechaInicio = toDate(pedido.fechaInicio);
   //const pedidoOwnFechaFin = toDate(pedido.fechaFin);
   //if (pedidoOwnFechaInicio && currentDate < pedidoOwnFechaInicio) {
       // errorMessages.push("El pedido aún no ha comenzado."); // Example, adjust if needed
       // isValid = false;
   //}
   //if (pedidoOwnFechaFin && currentDate > pedidoOwnFechaFin) {
       // errorMessages.push("El pedido ha finalizado."); // Example, adjust if needed
       // isValid = false;
   //}


  // 3. Validation based on Pedido.tipo and Pedido.modoPago
    const licensesForThisPedido = allContractLicenses.filter(lic => lic.pedido === pedidoId);

    if (pedido.modoPago === 'libre de costo') {
        if (pedido.tipo === 'suscripcion') {
            errorMessages.push('Las suscripciones no pueden ser gratuitas, se deben configurar como licencias limitadas en tiempo o perpetuas');
            isValid = false;
            // No more validations based on Pedido needed (as per 3.1.1) - however, the structure implies continuing for other errors.
            // To strictly follow "No more validations based on Pedido needed", we might return here if isValid is already false.
            // For now, adhering to collecting all errors.
        } else if (pedido.tipo === 'licencia temporal') {
            // 3.1.2
      if (orderInvoices.length === 0) {
          errorMessages.push("Es necesario crear una factura (FacturaCero) primero"); // 3.1.2.1
          isValid = false;
      } else {
          // Check if any of these invoices (FacturaCero) has a license
          const invoiceHasLicense = orderInvoices.some(inv =>
              relevantLicenciamientos.some(licm => licm.facturaId === inv.id && licm.licenciaId)
          );
          if (invoiceHasLicense) {
              errorMessages.push("Ya hay una licencia creada para la factura gratuita, no se puede crear otra"); // 3.1.2.2
              isValid = false;
          }
          // The rule "only one license can be created" for "licencia temporal" + "libre de costo"
          // This implies checking count of licensesForThisPedido if they are also 'licencia temporal'
          // The wording "if there is also a license associated with it" points to Licenciamiento linking.
          // If there are *any* licenses already for this "libre de costo" "licencia temporal" pedido, it might be an issue.
          // Let's refine this: if a FacturaCero exists and is linked via Licenciamiento, then fail.
          // Rule 3.1.2 could also mean if licensesForThisPedido.length > 0.
          // The current check (invoiceHasLicense) is based on Licenciamiento.
          if (licensesForThisPedido.length > 0 && !invoiceHasLicense) {
            // This implies a license exists for the pedido, but not linked to the *current* set of invoices.
            // This could be an orphaned license or a license linked to a previous FacturaCero.
            // Given 3.1.2.2 "if there is also a license associated with *it* (the invoice)"
            // it seems the primary check is on the invoice->licenciamiento link.
          }
      }
    // Inside Rule 3.1 (pedido.modoPago === 'libre de costo')
    // ...
    } else if (pedido.tipo === 'licencia perpetua') {
        // 3.1.3 & 3.1.4
        if (licensesForThisPedido.length > 0) {
            const sortedLicenses = licensesForThisPedido
            .filter(lic => lic.fechaFin) // Consider only those with a defined fechaFin for sorting
            .sort((a, b) => {
                // Assuming a.fechaFin and b.fechaFin are campoFechaConZonaHoraria
                // The 'menor', 'igual', 'mayor' results from compararFCZH determine sort order.
                // For descending sort (latest first):
                const comparison = compararFCZH(a.fechaFin!, b.fechaFin!);
                if (comparison === "mayor") return -1;
                if (comparison === "menor") return 1;
                return 0;
            });

            if (sortedLicenses.length > 0) {
                const lastLicense = sortedLicenses[0];
                const lastFechaFin = lastLicense.fechaFin as campoFechaConZonaHoraria; // Should exist due to filter

                // Calculate one month from currentDateFCZH
                const oneMonthFromNowFCZH = addDurationToFCZH(currentDateFCZH!, {months: 1});

                if (!oneMonthFromNowFCZH) {
                    errorMessages.push('Error interno: No se pudo calcular la fecha futura para validación.');
                    isValid = false;
                    // Potentially return or decide how to handle this critical error
                } else {
                    // Check if lastFechaFin > currentDateFCZH AND lastFechaFin > oneMonthFromNowFCZH
                    const isExpiredOrExpiresInLessThanAMonth = 
                        compararFCZH(lastFechaFin, currentDateFCZH!) === "menor" || 
                        compararFCZH(lastFechaFin, currentDateFCZH!) === "igual" ||
                        (compararFCZH(lastFechaFin, currentDateFCZH!) === "mayor" && 
                        (compararFCZH(lastFechaFin, oneMonthFromNowFCZH) === "menor" || compararFCZH(lastFechaFin, oneMonthFromNowFCZH) === "igual"));

                    if (!isExpiredOrExpiresInLessThanAMonth) {
                        errorMessages.push('Ya hay una licencia activa (perpetua gratuita con más de un mes restante)'); // 3.1.4
                        isValid = false;
                    }
                    // If it is expired or expires in less than a month, validation passes for this sub-rule (implicitly)
                }
            } else {
                // This case means licensesForThisPedido has items, but none have a fechaFin.
                // This could imply they are all truly perpetual (null fechaFin from the start).
                // If any such license exists, rule 3.1.4 might apply differently.
                // The original logic sorted by fechaFin, implying fechaFin exists.
                // If truly perpetual licenses (fechaFin is null) exist for "libre de costo",
                // you likely cannot create another.
                const trulyPerpetualExists = licensesForThisPedido.some(lic => !lic.fechaFin);
                if (trulyPerpetualExists) {
                    errorMessages.push('Ya existe una licencia perpetua gratuita (sin fecha de fin definida).');
                    isValid = false;
                }
            }
        }
        // If no licenses for this_pedido (licensesForThisPedido.length === 0), validation passes (3.1.3)
    }
    // ... rest of rule 3

  } else { // Pedido.modoPago is NOT 'libre de costo'
    if (pedido.tipo === 'licencia temporal') {
      if (orderInvoices.length === 0) {
        errorMessages.push(
          'No hay licencias para generar, debe crear una factura para este tipo de pedido' // 3.2.1
        );
        isValid = false;
        // No more validations based on Pedido needed
      } else if (orderInvoices.length > 1) {
        errorMessages.push(
          'Hay información errónea en esta orden (múltiples facturas para licencia temporal), no se puede generar una licencia' // 3.2.2
        );
        isValid = false;
        // No more validations based on Pedido needed
      } else { // Exactly one invoice
        const invoice = orderInvoices[0];
        const licenseLinkedToInvoice = relevantLicenciamientos.find(
          (licm) => licm.facturaId === invoice.id && licm.licenciaId
        );

        if (licenseLinkedToInvoice) {
          errorMessages.push(
            'Ya existe una licencia para esta factura, no se puede crear una nueva' // 3.2.3
          );
          isValid = false;
        } else {
          // Invoice exists, no license linked yet
          if (pedido.modoPago === 'prepagado') {
            if (invoice.estadoDePago !== 'paid') {
              errorMessages.push(
                'Debe pagar la factura para poder crear una licencia con este tipo de pedido (temporal prepagado)' // 3.2.3.1
              );
              isValid = false;
            }
            // else validation passes (3.2.3.2)
          }
          // else if (pedido.modoPago === 'al vencimiento') validation passes (3.2.3.1 - text says 3.2.3.1 again, assuming typo for 3.2.3.3)
        }
      }
    } else if (pedido.tipo === 'suscripcion') {
      if (orderInvoices.length === 0) {
        errorMessages.push(
          'No hay licencias para generar, debe crear una factura para este tipo de pedido (suscripción)' // 3.3.1
        );
        isValid = false;
        // No more validations based on Pedido needed
      } else {
        const invoicesWithoutLicense = orderInvoices.filter(inv =>
          !relevantLicenciamientos.some(licm => licm.facturaId === inv.id && licm.licenciaId)
        );

        if (invoicesWithoutLicense.length > 1) {
          errorMessages.push(
            'Error en la creación de facturas y asignación de licencias (múltiples facturas de suscripción sin licencia)' // 3.3.2
          );
          isValid = false;
        } else if (invoicesWithoutLicense.length === 1) {
          const invoiceToProcess = invoicesWithoutLicense[0];
          if (pedido.modoPago === 'prepagado') {
            if (invoiceToProcess.estadoDePago !== 'paid') {
              errorMessages.push(
                'La última factura no ha sido pagada, no se puede crear la licencia (suscripción prepagada)' // 3.3.3.1
              );
              isValid = false;
            }
            // else validation passes
          }
          // else if (pedido.modoPago === 'al vencimiento') validation passes (3.3.3.2)
        } else { // invoicesWithoutLicense.length === 0
          // All invoices have licenses associated
          errorMessages.push('No hay facturas disponibles para generar una nueva licencia de suscripción'); // 3.3.4
          isValid = false;
        }
      }
    }
  }

    // 4. Date Validations (only if isValid is still true or we are collecting all errors)
    // These rules define how Licencia.fechaInicio and Licencia.fechaFin *would be set*.
    // The validation function checks if such a setting *would be valid*.
    // We assume this function is called *before* a new Licencia object is actually created.
    if (isValid) { // Or if we want to collect date validation errors regardless of previous isValid state
        // Inside Rule 4, after "if (isValid) { ... }" or your equivalent check

        let newLicenciaFechaInicioFCZH: campoFechaConZonaHoraria | null = null;
        let newLicenciaFechaFinFCZH: campoFechaConZonaHoraria | null = null;

        // Ensure contract and pedido dates are campoFechaConZonaHoraria
        const contratoFechaInicioFCZH = contrato.fechaInicio as campoFechaConZonaHoraria | undefined;
        const contratoFechaFinFCZH = contrato.fechaFin as campoFechaConZonaHoraria | undefined;
        const pedidoOwnFechaInicioFCZH = pedido.fechaInicio as campoFechaConZonaHoraria | undefined;
        const pedidoOwnFechaFinFCZH = pedido.fechaFin as campoFechaConZonaHoraria | undefined;


        if (pedido.tipo === 'licencia perpetua') {
            const paidPerpetualLicenses = allContractLicenses.filter(
                lic => lic.pedido === pedidoId && pedido.tipo === 'licencia perpetua'
            ).sort((a,b) => {
                if (!a.fechaFin && !b.fechaFin) return 0;
                if (!a.fechaFin) return 1; // nulls last
                if (!b.fechaFin) return -1; // nulls last
                const comparison = compararFCZH(b.fechaFin!, a.fechaFin!); // Desc by fechaFin
                if (comparison === "mayor") return 1;
                if (comparison === "menor") return -1;
                return 0;
            });

            if (paidPerpetualLicenses.length === 0) { // First license
                newLicenciaFechaInicioFCZH = currentDateFCZH; // currentDateFCZH is already campoFechaConZonaHoraria
                newLicenciaFechaFinFCZH = addDurationToFCZH(currentDateFCZH!, {years: 1});
            } else {
                const lastLicPerpetua = paidPerpetualLicenses[0];
                const lastLicFechaFin = lastLicPerpetua.fechaFin as campoFechaConZonaHoraria | null;
                
                if (lastLicFechaFin) {
                    newLicenciaFechaInicioFCZH = addDurationToFCZH(lastLicFechaFin, {days: 1});
                    if (newLicenciaFechaInicioFCZH) {
                        newLicenciaFechaFinFCZH = addDurationToFCZH(newLicenciaFechaInicioFCZH, {years: 1});
                    } else {
                            errorMessages.push("Error al calcular la fecha de inicio para la nueva licencia perpetua.");
                            isValid = false;
                    }
                } else {
                    errorMessages.push("No se puede determinar la fecha de inicio para la extensión de la licencia perpetua debido a datos previos (falta fecha fin anterior).");
                    isValid = false;
                }
            }

            if (!newLicenciaFechaInicioFCZH || !newLicenciaFechaFinFCZH) {
                if (isValid) { // Avoid adding redundant messages if already failed above
                    errorMessages.push('Error en el cálculo de las fechas para la licencia perpetua.');
                }
                isValid = false;
            } else {
                if (contratoFechaInicioFCZH && compararFCZH(newLicenciaFechaInicioFCZH, contratoFechaInicioFCZH) === "menor") {
                    errorMessages.push('El contrato debe ser extendido para esta licencia perpetua ya pagada (inicio antes de contrato)');
                    isValid = false;
                }
                if (contratoFechaFinFCZH && compararFCZH(newLicenciaFechaFinFCZH, contratoFechaFinFCZH) === "mayor") {
                    errorMessages.push('El contrato debe ser extendido para esta licencia perpetua ya pagada (fin después de contrato)');
                    isValid = false;
                }
                if (compararFCZH(newLicenciaFechaInicioFCZH, newLicenciaFechaFinFCZH) === "mayor") {
                    errorMessages.push('Error en cálculo de fechas de licencia perpetua (inicio después de fin).');
                    isValid = false;
                }
            }

        } else { // Not 'licencia perpetua'
            newLicenciaFechaInicioFCZH = currentDateFCZH; // Rule 4.2

            if (pedidoOwnFechaInicioFCZH && compararFCZH(newLicenciaFechaInicioFCZH!, pedidoOwnFechaInicioFCZH) === "menor") {
                errorMessages.push("La orden aún no ha iniciado, no puede crearse la licencia pagada. Extender el pedido o generar una nota de crédito");
                isValid = false;
            }
            if (pedidoOwnFechaFinFCZH && compararFCZH(newLicenciaFechaInicioFCZH!, pedidoOwnFechaFinFCZH) === "mayor") {
                errorMessages.push("La orden está vencida, no puede crearse la licencia pagada. Extender el pedido o generar una nota de crédito");
                isValid = false;
            }
            // Licencia.fechaFin for non-perpetual might be derived from pedido.fechaFin or a set duration.
            // The rule 4.2 only specified Licencia.fechaInicio.
            // If newLicenciaFechaFinFCZH needs to be set here, you'd add that logic.
            // For example: newLicenciaFechaFinFCZH = pedidoOwnFechaFinFCZH; (if it should align)
        }
    } // End of "if (isValid)" block for date calculations

    // Consolidate isValid based on error messages.
    // This ensures isValid is false if any error was added, even if not set directly.
    if (errorMessages.length > 0) {
        isValid = false;
    }

    return { isValid, errorMessages };
}

// Example Usage (for testing - you would call this from your cloud function or backend)
/*
async function testValidation() {
  // Replace with actual IDs from your Firestore
  const testContratoId = "your_contrato_id" as ContratoResidenciaId;
  const testPedidoId = "your_pedido_id" as PedidoId;

  console.log(\`Validating Pedido \${testPedidoId} for Contrato \${testContratoId}...\`);
  const result = await validateLicenseCreation(testContratoId, testPedidoId);

  if (result.isValid) {
    console.log("Validation PASSED.");
  } else {
    console.error("Validation FAILED:");
    result.errorMessages.forEach(msg => console.error(\`- \${msg}\`));
  }
}

// testValidation();
*/
