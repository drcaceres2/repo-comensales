### BLUEPRINT 1: Vista de Gestión de Taxonomía (Definición de Grupos)

**Objetivo del Módulo:** Administrar la existencia y las reglas de los grupos. Operaciones CRUD exclusivas sobre el documento Singleton de la entidad `Residencia`.

#### 1. Estructura de Datos (El Estado)
El estado de esta página es un array de objetos validados por una **Unión Discriminada** en Zod. 

* **Entidad Origen:** `Firestore -> Colección: residencias -> Documento: [ID_RESIDENCIA] -> Colección: configuracion -> Documento: [general] (singleton) -> Campo: gruposUsuarios (Diccionario)`
* **Contrato de Datos (Zod Base):**
    * `tipo: "CONTABLE"` -> Exige `centroCostoCodigo` y `centroCostoNombre`.
    * `tipo: "RESTRICTIVO"` -> Exige `restriccionesIds` (Array) y `requiereConfirmacionFuerte` (Boolean).
    * `tipo: "ANALÍTICO"` -> No exige campos adicionales.

```typescript
import { z } from "zod";

// 1. Base compartida para todos los grupos
const GrupoBaseSchema = z.object({
  id: z.string().uuid("El ID debe ser un UUID válido"),
  nombre: z.string().min(3, "El nombre debe ser descriptivo (mínimo 3 caracteres)"),
  activo: z.boolean().default(true),
});

// 2. Variantes estrictas (Discriminated Union)
export const GrupoContableSchema = GrupoBaseSchema.extend({
  tipo: z.literal("CONTABLE"),
  centroCostoCodigo: z.string().min(1, "El código contable es obligatorio"),
  centroCostoNombre: z.string().min(1, "El nombre del centro de costo es obligatorio"),
});

export const GrupoRestrictivoSchema = GrupoBaseSchema.extend({
  tipo: z.literal("RESTRICTIVO"),
  restriccionesIds: z.array(z.string().uuid("ID de restricción inválido")),
  requiereConfirmacionFuerte: z.boolean().default(false),
});

export const GrupoAnaliticoSchema = GrupoBaseSchema.extend({
  tipo: z.literal("ANALITICO"),
});

// 3. Exportación del tipo discriminado para evaluar un grupo individual
export const GrupoUsuarioSchema = z.discriminatedUnion("tipo", [
  GrupoContableSchema,
  GrupoRestrictivoSchema,
  GrupoAnaliticoSchema,
]);
```

#### 2. Comportamiento de la Interfaz (UI)
* **Patrón Visual:** Lista Maestro-Detalle o un *Accordion* interactivo.
* **Mutación Reactiva:** El formulario de creación/edición debe aplicar *Conditional Rendering* basado en el campo `tipo`. Si el Director selecciona "Contable", los campos de restricciones se destruyen (no solo se ocultan, se eliminan del árbol del DOM y del estado del formulario para evitar envíos sucios).

#### 3. Consideraciones Arquitectónicas y Riesgos
* **Límite de Tamaño (El "Blast Radius"):** Al guardar esto en el Singleton, estás compartiendo el límite de 1 MiB con el resto de la configuración de la residencia. **Mitigación:** Configura una regla en el validador del backend que rechace la creación de más de 50 grupos por residencia. 
* **Condición de Carrera en Escritura:** Si dos directores editan grupos al mismo tiempo, el último en guardar sobreescribe al primero (Lost Update Anomaly). **Mitigación:** Implementar un control de concurrencia optimista. El frontend debe enviar un `lastUpdatedAt` o un hash del array original. Si el servidor detecta que el documento mutó mientras el Director A editaba, la Server Action debe fallar con un error `409 Conflict`.