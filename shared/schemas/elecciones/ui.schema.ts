import { z } from 'zod';
import { AuthIdSchema, SlugIdSchema, CadenaOpcionalLimitada, OptionalSlugIdSchema } from '../common';
import { FechaIsoSchema } from '../fechas'
import { TipoAlternativaEnumSchema } from '../horarios'; 
import { OrigenAutoridadSchema, EstadoAprobacionSchema } from './domain.schema';
import { UsuarioBaseObject, userRoleRefinement } from '../usuarios';

export const EstadoInteraccionTarjetaSchema = z.enum([
  'MUTABLE', 
  'BLOQUEADO_SISTEMA',     
  'BLOQUEADO_RESTRICCION', 
  'BLOQUEADO_AUTORIDAD'    
]);

export const OrigenResolucionSchema = z.enum([
  'CAPA0_ALTERACION',
  'CAPA1_ACTIVIDAD',
  'CAPA2_AUSENCIA',
  'CAPA3_EXCEPCION',
  'CAPA4_SEMANARIO',
  'FALLBACK_SISTEMA' 
]);

export const VentanaServicioUISchema = z.object({
  horaInicio: z.string(),
  horaFin: z.string(),
  tipoVentana: z.string()
}).strict();


export const UsuarioSuplantableUIObject = UsuarioBaseObject.pick({
  id: true,
  residenciaId: true,
  nombre: true,
  apellido: true,
  nombreCorto: true,
  roles: true,
  tieneAutenticacion: true,
  estaActivo: true,
  asistente: true,
  residente: true,
});

export const UsuarioSuplantableUISchema = UsuarioSuplantableUIObject
    .strict()
    .superRefine(userRoleRefinement);

export type UsuarioSuplantableUI = z.infer<typeof UsuarioSuplantableUISchema>;


// ----------------------------------------------------
// DTO de la Opción
// ----------------------------------------------------
export const OpcionAlternativaUISchema = z.object({
  configuracionAlternativaId: SlugIdSchema,
  esAlternativaAlterada: z.boolean(),
  nombre: z.string(),
  descripcion: z.string().optional(), 
  tipo: TipoAlternativaEnumSchema,    
  comedorNombre: z.string().optional(), 
  ventanaServicio: VentanaServicioUISchema.optional(),
  requiereAprobacion: z.boolean(),
  
  // Muro Móvil (calculado comparando horaReferenciaSolicitud vs Singleton)
  disponibleParaElegir: z.boolean(), 
  motivoIndisponibilidad: z.string().optional(), 
}).strict();

// ----------------------------------------------------
// 1. DTO de la Tarjeta (Superficie y Profundidad)
// ----------------------------------------------------
export const TarjetaComidaUISchema = z.object({
  tiempoComidaId: SlugIdSchema,
  
  grupoComida: z.object({
    id: SlugIdSchema,
    nombre: z.string(), 
    colorBase: z.string().optional(),
  }).strict(),
  
  resultadoEfectivo: z.object({
    configuracionAlternativaId: SlugIdSchema,
    nombre: z.string(),
    tipo: TipoAlternativaEnumSchema,
    colorBase: z.string().optional(),
  }).strict(),
  
  estadoInteraccion: EstadoInteraccionTarjetaSchema,
  origenResolucion: OrigenResolucionSchema, 
  
  estadoAprobacion: EstadoAprobacionSchema.optional(), 
  
  detallesDrawer: z.object({
    mensajeFormativo: z.string().optional(), 
    opciones: z.array(OpcionAlternativaUISchema).optional(),
  }).strict()
}).strict();

export type TarjetaComidaUI = z.infer<typeof TarjetaComidaUISchema>;

// ----------------------------------------------------
// 2. DTO Diario (Ahora estrictamente enfocado en las comidas)
// ----------------------------------------------------
export const HorarioDiaUISchema = z.object({
  fecha: FechaIsoSchema,
  tarjetas: z.array(TarjetaComidaUISchema),
}).strict();

export type HorarioDiaUI = z.infer<typeof HorarioDiaUISchema>;

// ----------------------------------------------------
// 3. DTO de Actividades (Para la banda del Calendario)
// ----------------------------------------------------
export const ActividadCalendarioUISchema = z.object({
  id: SlugIdSchema,
  nombre: z.string(),
  fechaInicio: FechaIsoSchema,
  fechaFin: FechaIsoSchema,
}).strict();

export type ActividadCalendarioUI = z.infer<typeof ActividadCalendarioUISchema>;

// ----------------------------------------------------
// 4. FORMULARIOS (Escritura desde la UI)
// ----------------------------------------------------
export const FormAusenciaLoteSchema = z.object({
  fechaInicio: FechaIsoSchema,
  primerTiempoAusente: SlugIdSchema.nullable().optional(), 
  fechaFin: FechaIsoSchema,
  ultimoTiempoAusente: SlugIdSchema.nullable().optional(), 
  retornoPendienteConfirmacion: z.boolean().optional(),
  motivo: CadenaOpcionalLimitada(3, 100).optional(),
}).strict().superRefine((data, ctx) => {
  if (data.fechaInicio > data.fechaFin) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "La fecha de inicio no puede ser posterior a la fecha de fin.",
      path: ["fechaFin"]
    });
  }
});
export type FormAusenciaLote = z.infer<typeof FormAusenciaLoteSchema>;

export const FormExcepcionLibreSchema = z.object({
  fecha: FechaIsoSchema,
  tiempoComidaId: SlugIdSchema,
  configuracionAlternativaId: SlugIdSchema,
  esAlternativaAlterada: z.boolean(),
  contingenciaConfigAlternativaId: OptionalSlugIdSchema, 
}).strict();

export type FormExcepcionLibre = z.infer<typeof FormExcepcionLibreSchema>;

// ----------------------------------------------------
// 5. PAYLOAD PRINCIPAL (Lo que devuelve la Server Action a la página)
// ----------------------------------------------------
export const CargaHorariosUISchema = z.object({
  dias: z.array(HorarioDiaUISchema), // Array denso de N días (ej. 7 días)
  actividades: z.array(ActividadCalendarioUISchema), // Actividades que se solapan con este rango de fechas
}).strict();

export type CargaHorariosUI = z.infer<typeof CargaHorariosUISchema>;