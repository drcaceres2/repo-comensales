# Blueprint Arquitectónico: Módulo de Alteraciones de Horario

## 1. Patrones Arquitectónicos Base

Para soportar la escala de lecturas y las restricciones de consultas de rango en Firestore, el módulo se diseña bajo los siguientes patrones:
* **CQRS (Command Query Responsibility Segregation)**: Separación estricta entre el modelo de escritura (Comando de Alteración) y el modelo de lectura (Horario Efectivo Diario).
* **Proyección de Vistas Materializadas**: El motor de base de datos no calcula el horario al vuelo. Una Cloud Function procesa las alteraciones aprobadas y estampa (materializa) la realidad diaria en documentos pre-calculados.
* **Transacciones Compensatorias**: Las alteraciones no se "borran". Las cancelaciones de estados avanzados generan deltas (eventos de revocación) para mantener la coherencia con sistemas externos (Administración).
* **Fail-Close (Fallback de Contingencia)**: Las condiciones de carrera se resuelven de forma optimista cayendo en alternativas de contingencia, evitando bloqueos de base de datos en tiempo real.

## 2. Modelos de Datos Core (TypeScript)

### 2.1 El Modelo de Escritura (El Comando)

Este es el documento que manipula el Director en el CRUD. Sirve como registro de intención administrativa.

```TypeScript
export interface AlteracionHorario {
    id: string; // Generado por Firestore
    nombre: string;
    descripcion?: string;
    residenciaId: string; // Isolation multi-tenant
    
    // Fechas absolutas en la ZonaHoraria de la Residencia
    fechaInicio: FechaIso; 
    fechaFin: FechaIso;    
    
    // Diccionario de los tiempos de comida ESPECÍFICAMENTE afectados.
    // Semántica: Sobreescritura total (Overwrite).
    alteraciones: Record<TiempoComidaId, DetalleAlteracion>;
    
    // Máquina de estados
    estado: 'propuesto' | 'comunicado' | 'cancelado' | 'revocado';
}

export interface DetalleAlteracion {
    opcionesActivas: ConfigAlternativaId[]; 
    // Siempre obligatorio como red de seguridad transaccional
    contingenciaAlternativaId: ConfigAlternativaId; 
}
```
### 2.2 El Modelo de Lectura (Vista Materializada)

Este es el único documento que el Frontend de los Residentes consumirá. Es la "Verdad Absoluta" de un día calendario.

```TypeScript
// Colección: `horariosEfectivos`
// ID del documento: FechaIso (ej. "2026-03-29")
export interface HorarioEfectivoDiario {
    fecha: FechaIso;
    residenciaId: string;
    
    // Contiene TODOS los tiempos de comida de la residencia para este día, 
    // independientemente de si sufrieron alteraciones o no.
    tiemposComida: Record<TiempoComidaId, SlotEfectivo>;
}

export interface SlotEfectivo {
    esAlterado: boolean; 
    alteracionId?: string; // Trazabilidad para la UI si esAlterado === true
    
    // Si esAlterado = false -> Contiene el catálogo base del sistema.
    // Si esAlterado = true  -> Contiene el reemplazo dictado por la Alteración.
    opcionesActivas: ConfigAlternativaId[]; 
    contingenciaAlternativaId: ConfigAlternativaId;
}
```

## 3. Máquina de Estados y Transacciones Compensatorias

El ciclo de vida de una `AlteracionHorario` define cómo reacciona la vista materializada y la futura `SolicitudConsolidada`.
1. `propuesto`: Estado inicial. Visible solo para el Director. No dispara recálculos.
2. `cancelado`: El Director se arrepiente antes de oficializar. Muere en silencio. No hay recálculo.
3. `comunicado`: El Director oficializa el cambio.
    * **Trigger (Backend):** La Cloud Function recalcula y sobrescribe los `HorarioEfectivoDiario` del rango de fechas.
    * **Efecto:** Queda encolado positivamente para la próxima `SolicitudConsolidada`.
4. `revocado`: El Director cancela una alteración que ya estaba en estado comunicado.
    * **Trigger (Backend):** La Cloud Function recalcula los `HorarioEfectivoDiario` afectados, removiendo la alteración y restaurando la normalidad base.
    * **Efecto:** Genera un "Delta Negativo". Se encola una nota obligatoria para la próxima `SolicitudConsolidada` indicando a la Administración la baja del servicio previamente alterado.

## 4. Estrategias de Mitigación Implementadas

| Riesgo / Cuello de Botella | Estrategia de Resolución en Diseño |
| :--- | :--- |
| **Límites de Consultas Firestore** | **Proyección Diaria:** Se elimina la consulta `WHERE inicio <= X AND fin >= Y`. El cliente hace un `WHERE id IN [Array de 7 Fechas]`. **Costo fijo: 7 lecturas por visita al semanario.** |
| **Superposición Administrativa** | **Validación Pre-Escritura:** El Backend bloquea la creación de alteraciones si ya existe otra (`comunicada` o `propuesta`) que intercepte los mismos `TiempoComidaId` en las mismas fechas. |
| **Ausencia de Servicio Absoluto** | **Token de Suspensión:** Si la administración decide "Cerrar la cocina", envía `opcionesActivas: []`. La Cascada obligará a los usuarios a caer en `contingenciaAlternativaId` (Ej: "No hay servicio"), evitando que el sistema lo marque como inasistencia imputable al residente. |
| **Condición de Carrera (Snapshot)** | **Fallback Optimista:** Si un residente inscribe una intención milisegundos antes de una materialización, su intención quedará invalidada por la nueva realidad. El Algoritmo de Cascada en el Snapshot no encontrará la opción original y lo derivará automáticamente a la Contingencia configurada en la alteración. No se requiere Websockets ni bloqueos transaccionales complejos. |

