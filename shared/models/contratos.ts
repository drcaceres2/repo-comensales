import { campoFechaConZonaHoraria } from "@/lib/fechasResidencia";
import { UsuarioId, ResidenciaId, CodigoPaisIso, Ubicacion, FechaIso } from "./types"
import { TimestampString } from "./types";

export type ContratoResidenciaId = string;
export type ClienteId = string;
export type PedidoId = string;
export type FacturaId = string;
export type FacturaCeroId = string;

export const FacturaCero: FacturaCeroId = 'Factura monto cero creada a partir de Pedido libre de costo';

export type odoo_status_in_payment =
    | "not_paid"
    | "in_payment"
    | "paid"
    | "partial"
    | "reversed"
    | "blocked"
    | "invoicing_legacy"
    | "draft"
    | "cancel";

export type Moneda = 
    | "HNL"
    | "USD"
    | "EUR";

export const monedaOptions: Moneda[] = ['USD', 'HNL', 'EUR'];

export interface EstadoContrato {
    estaActivo: boolean;
    usuariosIlimitados: boolean;
    usuariosLicenciados: number;
}

export interface CodigoFiscal {
    pais: CodigoPaisIso;
    codigo: string;
}

export interface Cliente {
    id: ClienteId;
    idClienteOdoo?: string | null;
    email?: string | null;
    telefonoFijo?: string | null;
    telefonoMovil?: string | null;
    usuarioAsociado?: UsuarioId | null;
    tipoPersonaCliente: 'PersonaNaturalHonduras' | 'PersonaNaturalExtranjera' | 'PersonaJuridicaHonduras' | 'PersonaJuridicaExtranjera' | 'ClienteProbando';
    personaCliente: PersonaNaturalHonduras | PersonaNaturalExtranjera | PersonaJuridicaHonduras | PersonaJuridicaExtranjera | ClienteProbando;
    representanteLegal?: PersonaNaturalHonduras | PersonaNaturalExtranjera | null;
    codigoFiscal?: CodigoFiscal | null;
    direccionPrincipal: Ubicacion;
    direccionFacturacion: Ubicacion;
}

export interface ClienteProbando {
    nombre: string;
}

export interface PersonaNaturalHonduras {
    nombreCompleto: string;
    DNI: string; // formato "####-####-#####"
    pasaporte?: string;
    fechaNacimiento?: string; // ISO 8601 en formato "YYYY-MM-DD" no es relevante la zona horaria
    profesionUOficio: string;
    direccionFisica: Ubicacion;
    estadoCivil: string;
    actividadProfesionalOComercial?: string;
    imagenDNI?: string; // Para ser almacenada en Firestore
}

export interface PersonaNaturalExtranjera {
    nombreCompleto: string; // Como aparece en su pasaporte vigente
    pasaporte: string; 
    otraIdentificacion: string; // número de identificación en su país de origen
    fechaNacimiento?: string; // ISO 8601 en formato "YYYY-MM-DD" no es relevante la zona horaria
    nacionalidad: string; // según pasaporte vigente
    direccionFísica: Ubicacion; // residencia actual completa
    estadoCivil: string;
    actividadProfesionalOComercial?: string;
    imagenPasaporte?: string; // Para ser almacenada en Firestore
}

export interface PersonaJuridicaHonduras {
    razonSocial: string; // Razón social
    direccionFísica: Ubicacion;
    correoElectronicoOficial?: string | null;
}

export interface PersonaJuridicaExtranjera {
    nombreLegalCompleto: string; // Nombre legal completo
    direccionLegal: Ubicacion;
    numeroRegistroMercantil: string;
    identificacionFiscal: string;
    correoElectronicoOficial?: string | null;
    telefonoOfifical: string;
    objetoSocial: string;
    actaConstitutiva: string; // url de donde se almacene
}

export interface ContactoExterno {
    nombreCompleto: string;
    correosElectronicos: string[];
    telefonos: string[];
}

export type ContactoResponsable = UsuarioId | ContactoExterno | Cliente;

export interface ContratoResidencia {
    id?: ContratoResidenciaId; // ID del documento en Firestore (opcional al crear)
    cliente: ClienteId;
    residencia: ResidenciaId;
    fechaInicio: FechaIso;
    fechaFin?: FechaIso | null; // null o undefined indica que podría tener fecha fin o no
    esIndefinido: boolean;
    correoOficialComunicacion: string; // Correo electrónico principal de comunicación
    contactosResponsables: ContactoResponsable[]; // Puede ser un UsuarioId o un ContactoExterno
    recordatorios?: RecordatorioVencimiento[] | null;
    pruebaSolucion: boolean;
    fechaFinPrueba?: FechaIso | null; // El trial siempre es al principio, se supone fecha de inicio la fecha de inicio del contrato
    timestampCreacion: TimestampString;
    timestampModificacion: TimestampString;
    estadoContrato: EstadoContrato;
    urlContratoOdoo?: string | null;
}
  
export type FrecuenciaSuscripcion = 'semanal' | 'quincenal' | 'mensual' | 'bimestral' | 'trimestral' | 'cuatrimestral' | 'semestral' | 'anual';
  
export interface RecordatorioVencimiento {
    diasAntesVencimiento: number;
    nombreRecordatorio?: string | null;
}

export interface Factura {
    id: FacturaId;
    idPedido: PedidoId;
    fecha: campoFechaConZonaHoraria;
    fechaVencimiento: campoFechaConZonaHoraria;
    fechaPago: campoFechaConZonaHoraria;
    control: 'manual' | 'odoo';
    idFacturaOdoo?: null;
    estadoDePago: odoo_status_in_payment;
    monedaFactura: Moneda;
    montoPagado: number;
    montoTotal: number;
}

export interface Pedido { 
    id: PedidoId; 
    contrato: ContratoResidenciaId; 
    tipo: 'suscripcion' | 'licencia temporal' | 'licencia perpetua'; 
    modoPago: 'prepagado' | 'al vencimiento' | 'libre de costo'; 
    moneda: Moneda; 
    montoTotal: number; 
    periodicidad?: FrecuenciaSuscripcion | null; 
    fechaInicio: campoFechaConZonaHoraria; 
    fechaFin?: campoFechaConZonaHoraria | null; 
    limitacionUsuarios: boolean; 
    cantUsuarios?: number; 
    activo: boolean;
}

export interface Licenciamiento {
    id: string;
    pedidoId: PedidoId;
    facturaId: FacturaId | FacturaCeroId;
    licenciaId: string;
}

export interface Licencia {
    id: string;
    contratoLicencia: ContratoResidenciaId;
    pedido: PedidoId;
    cantUsuarios: number;
    fechaInicio: campoFechaConZonaHoraria;
    fechaFin: campoFechaConZonaHoraria;
}
