import { z } from 'zod';
import { 
  FirestoreIdSchema, 
  OptionalFirestoreIdSchema,
  AuthIdSchema, 
  SlugIdSchema, 
  OptionalSlugIdSchema,
  CadenaOpcionalLimitada,
  TimestampSchema
} from '../common';
import { 
  FechaIsoSchema,
  FechaHoraIsoSchema,
  HoraIsoSchema,
  SemanaIsoSchema
} from '../fechas';

// ==========================================
// 1. ENUMS CONSTANTES
// ==========================================
export const OrigenAutoridadSchema = z.enum([
  'residente', 
  'director-modificable', 
  'director-restringido'
]);

export const EstadoAprobacionSchema = z.enum([
  'no_requerida',
  'pendiente',
  'aprobada',
  'rechazada'
]);

// ==========================================
// 2. VISTA MATERIALIZADA DISPERSA (CQRS - READ MODEL)
// ==========================================
// Denormalización estricta: La vista tiene todo lo necesario para renderizar 
// y calcular el "Muro Móvil" sin consultar la colección de Alteraciones (Comandos).

export const OpcionActivaSchema = z.object({
  nombre: z.string(),
  configuracionAlternativaId: SlugIdSchema, // ID de la opción alterada
  ventanaServicio: z.object({
    horaInicio: HoraIsoSchema,
    horaFin: HoraIsoSchema,
    tipoVentana: z.enum(['normal', 'inicia_dia_anterior', 'termina_dia_siguiente']).default('normal'),
  }).strict(),
  comedorId: SlugIdSchema,
  horarioReferenciaSolicitud: FechaHoraIsoSchema // Vital para evaluar el Muro Móvil
}).strict();

export const SlotEfectivoSchema = z.object({
  esAlterado: z.boolean(),
  alteracionId: OptionalFirestoreIdSchema, 
  motivo: z.string().optional(), 
  
  opcionesActivas: z.array(OpcionActivaSchema), 
  contingenciaAlternativaId: SlugIdSchema, 
}).strict();

export type SlotEfectivo = z.infer<typeof SlotEfectivoSchema>;

export const HorarioEfectivoDiarioSchema = z.object({
  id: FechaIsoSchema, 
  residenciaId: SlugIdSchema,
  tiemposComida: z.record(SlugIdSchema, SlotEfectivoSchema) 
}).strict();

export type HorarioEfectivoDiario = z.infer<typeof HorarioEfectivoDiarioSchema>;

// ==========================================
// 3. INTENCIONES DEL USUARIO (CAPAS 2, 3 y 4)
// ==========================================

// --- AUSENCIA (Nivel 2) Integrada de ausencias.ts ---
export const AusenciaSchema = z.object({
    id: FechaIsoSchema.optional(),
    usuarioId: AuthIdSchema,
    residenciaId: SlugIdSchema,
    fechaInicio: FechaIsoSchema,
    primerTiempoAusente: SlugIdSchema.nullable().optional(), 
    fechaFin: FechaIsoSchema,
    ultimoTiempoAusente: SlugIdSchema.nullable().optional(), 
    retornoPendienteConfirmacion: z.boolean().optional(),
    motivo: CadenaOpcionalLimitada(3, 100).optional(),
    timestampCreacion: TimestampSchema.optional(),
}).strict().refine(data => data.fechaFin >= data.fechaInicio, {
    message: "La fecha de fin no puede ser anterior a la fecha de inicio",
    path: ["fechaFin"],
});
export type Ausencia = z.infer<typeof AusenciaSchema>;

// --- EXCEPCION (Nivel 3) ---
export const ExcepcionSchema = z.object({
  id: OptionalFirestoreIdSchema, 
  usuarioId: AuthIdSchema,
  residenciaId: SlugIdSchema,
  fecha: FechaIsoSchema,
  tiempoComidaId: SlugIdSchema,
  
  configuracionAlternativaId: SlugIdSchema, 
  esAlternativaAlterada: z.boolean().default(false), 
  
  origenAutoridad: OrigenAutoridadSchema,
  
  estadoAprobacion: EstadoAprobacionSchema.default('no_requerida'),
  contingenciaConfigAlternativaId: OptionalSlugIdSchema, 
  
  timestampCreacion: TimestampSchema.optional(),
  timestampActualizacion: TimestampSchema.optional(),
}).strict().superRefine((data, ctx) => {
  if (data.estadoAprobacion !== 'no_requerida' && !data.contingenciaConfigAlternativaId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Se requiere una contingencia si la alternativa elegida necesita aprobación.",
      path: ["contingenciaConfigAlternativaId"]
    });
  }
});
export type Excepcion = z.infer<typeof ExcepcionSchema>;

// --- SEMANARIO (Nivel 4) ---
export const EleccionSemanarioSchema = z.object({
  configuracionAlternativaId: SlugIdSchema,
}).strict();
export type EleccionSemanario = z.infer<typeof EleccionSemanarioSchema>;

export const SemanarioUsuarioSchema = z.record(SlugIdSchema, EleccionSemanarioSchema);

export const DiccionarioSemanariosSchema = z.record(
  SemanaIsoSchema, 
  SemanarioUsuarioSchema
);
export type DiccionarioSemanarios = z.infer<typeof DiccionarioSemanariosSchema>;