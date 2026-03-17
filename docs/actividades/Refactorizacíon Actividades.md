# Plan de Refactorización Estratégica: Módulo de Actividades (Capa 1)

## 1. Reestructuración del Modelo de Datos (Zod & Firestore)

**Objetivo:** Eliminar arrays anidados, aplanar la estructura O(1) y unificar la máquina de estados.

* **1.1. Máquina de Estados Unificada:**
    * Reemplazar la dualidad de estados por un flujo único lineal: `pendiente` -> `aprobada` -> `inscripcion_abierta` -> `inscripcion_cerrada` -> `finalizada` (estado terminal) o `cancelada` (estado terminal).
* **1.2. Eliminación de `planComidas` y Adopción de Fronteras Cronológicas:**
    * Eliminar por completo el array de comidas dentro de la Actividad.
    * Implementar `FronterasActividadSchema` con 4 campos: `fechaInicio`, `tiempoComidaInicioId`, `fechaFin`, `tiempoComidaFinId`.
* **1.3. Separación de Propiedades (Críticas vs. Descriptivas):**
    * *Críticas:* Fronteras Cronológicas, `centroCostoId`. (Su mutación dispara un Reseteo Destructivo si el estado es >= `aprobada`).
    * *Descriptivas:* `titulo`, `descripcion`, `lugar`. (Mutables sin impacto colateral).
* **1.4. Control de Concurrencia (OCC):**
    * Añadir el campo `conteoInscritos` (default: 0) a nivel raíz del documento de la Actividad.
* **1.5. Subcolección `inscripciones` (Refinada con Invitaciones):**
    * **Propósito:** Registrar la intención de participación y el ciclo de vida de invitaciones de terceros.
    * **Máquina de Estados de la Inscripción (`EstadoInscripcionEnum`):** * `invitacion_pendiente`: Creada por un tercero, el residente aún no acepta.
        * `confirmada`: El residente se inscribió a sí mismo o aceptó la invitación.
        * `rechazada`: El residente declinó la invitación.
        * `cancelada`: El usuario se dio de baja después de haber confirmado.
    * **Esquema:**
        * `id`: String (Idealmente el mismo `usuarioId` si un usuario solo puede tener un registro por actividad).
        * `actividadId`: Firestore ID.
        * `usuarioId`: Firestore ID del participante final.
        * `invitadoPorId`: Firestore ID (Opcional. Si no existe, implica autoinscripción).
        * `estado`: `EstadoInscripcionEnum`.
        * `timestampCreacion`: Timestamp.
        * `timestampModificacion`: Timestamp (Necesario ahora que el documento muta de pendiente a confirmado/rechazado).
    * **Regla Crítica para la Cascada:** El motor de la Cascada **solo** tomará en cuenta las inscripciones cuyo `estado === 'confirmada'`. Cualquier otro estado se ignora en la resolución del Hecho Inmutable.

## 2. Infraestructura y Operaciones de Base de Datos

**Objetivo:** Garantizar atomicidad, evitar *overbooking* y asegurar la pista de auditoría.

* **2.1. Inscripciones Transaccionales (El Fin del Overbooking):**
    * Toda inscripción debe realizarse mediante un Server Action ejecutando una transacción atómica de Firestore.
    * *Condición:* Leer Actividad -> Verificar `estado === 'inscripcion_abierta'` y `conteoInscritos < maxParticipantes`.
    * *Operación:* Escribir en subcolección `/inscripciones` + `FieldValue.increment(1)` en `conteoInscritos` de la Actividad padre.
* **2.2. Reseteo Destructivo Batcheado:**
    * Si un director altera un **campo crítico** de una actividad en curso, el sistema debe ejecutar un *WriteBatch* en Firestore.
    * Se deben purgar (borrar) todas las inscripciones asociadas a la actividad (límite de 500 por batch).
    * *Mandatorio:* Escribir inmediatamente un documento en una colección de logs (ej. `/auditoria`) detallando: `usuarioQueModifico`, `actividadId`, `listaDeUsuariosPurgados`, `timestamp`.

## 3. Lógica de Dominio Centralizada

**Objetivo:** Mantener la base de datos ciega e ignorante; la inteligencia vive en el servidor.

* **3.1. El "Guardia de Fronteras":**
    * Zod solo valida la estructura sintáctica.
    * El Server Action encargado de crear/actualizar la Actividad debe descargar el Singleton de horarios (o cachearlo).
    * *Evaluación:* Comparar algebraicamente `(FechaInicio + PesoTiempoInicio) < (FechaFin + PesoTiempoFin)`. Si falla, rechazar la petición con un `Bad Request` antes de tocar Firestore.

## 4. Consumo por la Cascada de la Verdad (Capa 3)

**Objetivo:** Rendimiento extremo y cero cuellos de botella para el algoritmo resolutor.

* **4.1. Migración a Cloud Function Gen 2:**
    * El cálculo consolidado no se ejecutará en Server Actions debido a los límites de *timeout*. Se asignará a una Cloud Function dedicada (con memoria RAM configurada a 1GB+).
* **4.2. Algoritmo "Time-Bounded In-Memory Join":**
    * El motor hará solo **5 consultas planas (Queries) a Firestore** delimitadas por la semana de cálculo (Configuración, Usuarios Activos, Ausencias, Excepciones, Actividades+Inscripciones).
    * Una vez descargados los 5 bloques de datos, la conexión a DB se suspende lógicamente.
    * Se cruzan las "Fronteras Cronológicas" de las actividades contra el "Semanario" de los inscritos mediante diccionarios (*Hash Maps*) en la memoria de Node.js.
    * El resultado se emite como un único *Hecho Inmutable* (WriteBatch) hacia Firestore.