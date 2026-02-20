# ARCHITECTURE.md

**Proyecto:** Comensales Residencia (Web App)
**Versión del Documento:** 6.0 (Consolidado)
**Rol:** Arquitectura de Software & Estrategia

---

## 1. Objetivos de Negocio y Restricciones Arquitectónicas

### 1.1 Visión del Producto

El sistema "Comensales Residencia" es una plataforma multi-tenant (SaaS) diseñada para la gestión logística de horarios de comida en residencias universitarias con un enfoque formativo sin ánimo de lucro.

A diferencia de aplicaciones comerciales de *delivery* (donde el objetivo es la conveniencia del usuario final y el lucro), este sistema prioriza la **planificación, el orden y la formación en virtudes** (responsabilidad, puntualidad). El sistema opera bajo una lógica de **"Fail-Close"**: ante la duda o inacción del usuario fuera de plazo, no hay servicio.

### 1.2 Objetivos Estratégicos

1.  **Formación sobre Conveniencia:** El sistema penaliza la falta de planificación. No existen flujos de emergencia automatizados; las excepciones fuera de plazo requieren intervención manual del Director (fricción intencional).
2.  **Agnosticismo Cultural:** Soporte total para esquemas de comida no tradicionales (Brunch, Asados, Meriendas) mediante configuración dinámica, desacoplada de horarios fijos occidentales. Todas las páginas (rutas) manejan plantilla de idioma y estilo (i18n).
3.  **Segregación de Negocio:** Estricta separación entre **Residencia** (Usuarios, Roles, Reglas) y **Administración** (Producción). La Administración opera como una "Caja Negra" que recibe solicitudes (órdenes de trabajo) consolidadas.

### 1.3 Drivers Arquitectónicos

* **Modelo "Plantilla y Excepción":** La base de datos no almacena "los horarios de cada usuario cada día" por adelantado. Se usa una proyección en tiempo real de un patrón recurrente (`SemanarioUsuario`) modificado por otras variables puntuales, o sea no recurrentes (`Ausencias`, `Actividades`, `Excepciones`).
* **Inmutabilidad por Snapshot:** La flexibilidad termina cuando el Director "Solicita a Administración". En ese momento, la realidad dinámica se congela en registros históricos inmutables en `SolicitudConsolidada`.
* **Manejo de Tiempo Absoluto:** Toda lógica obedece a la `ZonaHoraria` de la Residencia, ignorando la ubicación o reloj del dispositivo del usuario.

---

## 2. Arquitectura de Datos y Lógica de Resolución

### 2.1 El Algoritmo de Cascada (The Truth Cascade)

El estado de una comida ("¿Qué horario de comida tiene el usuario hoy?") no es un dato estático en la BD, sino el resultado de una evaluación jerárquica en tiempo de ejecución (Runtime Resolution).

**Jerarquía de Prioridad (de mayor a menor):**

1.  **Actividad (Imperativo Institucional):** Si el usuario está inscrito, esta regla prevalece sobre todas. La `Actividad` contiene información de los horarios de comida. Al estar en el grado más alto de jerarquía, bloquea ausencias y elecciones personales. (Ej. una excursión, un viaje fuera del país, un retiro espiritual)
2.  **Ausencia (Negación de Servicio):** Si existe ausencia (y no hay actividad), el resultado es siempre la `Alternativa` de `tipo='ayuno'`.
3.  **Excepción (Intención Voluntaria):** Una desviación explícita creada por el usuario. Representa un cambio puntual (ej. "Hoy tengo examen a mediodía necesito cena tarde").
4.  **Semanario (Fallback / Default):** Si no hay reglas superiores, se aplica la configuración cíclica por defecto del usuario. (ej. todos los lunes pido desayuno temprano porque tengo clase a primera hora)

### 2.2 Estrategia de Persistencia: "Snapshotting"
Dado que el cálculo dinámico (2.1) es volátil (si cambia el semanario hoy, cambiaría el pasado), el sistema implementa un patrón de **Materialización de Vistas**:

* **Fase de intención (Viva):** Antes del corte, la UI del residente calcula la comida al vuelo usando la Cascada.
* **Fase de hecho (Congelada):** *Regla:* Una vez creado el documento `SolicitudConsolidada`, los cambios en Semanarios o Actividades futuras NO reescriben este historial. Al momento que el director proceda a "Solicitar a la Administración", el backend resuelve la cascada y **escribe** el resultado final en la entidad `SolicitudConsolidada`:
    + Se bloquean las ediciones (muro móvil) 
    + Se calculan todos los estados finales
    + Se crea documento `SolicitudConsolidada`
    + Se agregan los ID de `comensalesSolicitados`, `usuarios` (nuevos o eliminados), `actividades`, `dietas`, `atenciones`, `alteracionesHorario`, `comentarios` que se hayan comunicado a la administración al documento de `SolicitudConsolidada`
    + Se cambian los campos `avisoAdministracion` en los documentos afectados.
    + (Todos los cambios en Firestore se hacen en una sola transacción atómica)

---

## 3. Módulos Funcionales y Reglas de Integración

### 3.1 Actividades y Exclusión Mutua (Mutex)

* **Lógica:** Existe una exclusión mutua lógica entre `Actividad` y `Ausencia`. El sistema impide inscribirse a una actividad si hay ausencia vigente y viceversa. También otra exclusión mutua entre `Ausencia` y `Excepcion`.
* **Locking:** Una vez la actividad se solicita a la administración, los usuarios no pueden modificar sus horarios de comida. Una `Alternativa` que esté asociada a un horario de solicitud de comida cuya hora ya haya pasado (HorarioSolicitudData < ahora) está "bloqueada" para ser elegida o cambiada. En cambio si no se ha solicitado (HorarioSolicitudData > ahora) está "disponible" para ser elegida o cambiada.

### 3.2 Feedback y Comunicación

* **Comentarios:** Son originados por los usuarios y funcionan como una cola de trabajo para el Director (`nuevo` -> `diferido` -> `atendido` -> `archivado` o `no_aprobado`); para que él se los comunique a la administración al momento de la `SolicitudConsolidada`. Los datos persisten para trazabilidad histórica.
* **Recordatorios:** Capa de contexto visual (Overlay) sobre el calendario. (Por ejemplo: cumpleaños de residentes, período de exámenes de las universidades, etc.)

### 3.3 Estrategia de Persistencia (Patrones Firestore)

Para garantizar la seguridad, la escalabilidad y el orden en una base de datos NoSQL, el proyecto se adhiere estrictamente a los siguientes patrones de diseño. **No se permite la creación de colecciones raíz arbitrarias.**

#### A. Topología de Datos (Jerarquía Multi-Tenant)

La base de datos sigue una estructura de árbol estricta para aislar contextos y simplificar las Reglas de Seguridad:

1.  **Colecciones Raíz (Globales):**
    * `clientes`: Entidades comerciales/fiscales.
    * `residencias`: Los "Tenants" operativos.
    * `usuarios`: Identidades vinculadas a Auth.
    * `logs`: Auditoría del sistema.

2.  **Subcolecciones (Contextuales):**
    * Los datos operativos **SIEMPRE** viven dentro de su contexto.
    * *Ejemplo:* No existe una colección `actividades` suelta. Existe `residencias/{slug}/actividades`.
    * *Beneficio:* Las Security Rules se simplifican drásticamente (`allow read if user.residenciaId == residenciaId`).

> (RAÍZ COMERCIAL)
> ├── clientes/ {pais-codigo_fiscal}
> │   ├── facturas/ {numero_fiscal}
> │   ├── pedidos/ {fecha-hora}
> │   └── contratosResidencia/ {auto-id}
> │
> (RAÍZ OPERATIVA - SAAS)
> ├── residencias/ {slug}
> │   │
> │   ├── configuracion/ {general}  (Singleton)
> │   │   ├── (campo) horariosSolicitud: Map<ID, Data>
> │   │   ├── (campo) comedores: Map<ID, Data>
> │   │   ├── (campo) gruposUsuarios: Map<ID, Data>
> │   │   ├── (campo) dietas: Map<ID, Data>
> │   │   ├── (campo) gruposComidas[]
> │   │   ├── (campo) tiemposComidas: Map<ID, Data>
> │   │   ├── (campo) definicionesAlternativas: Map<ID, Data>
> │   │   └── (campo) configuracionesAlternativas: Map<ID, Data>
> │   │
> │   ├── configContabilidad/ {general}  (Singleton)
> │   │   └── (campo) centrosDeCosto: Map<ID, Data>
> │   │
> │   ├── atenciones/ {auto-id}
> │   │
> │   ├── alteraciones/ {auto-id}
> │   │
> │   ├── actividades/ {auto-id}
> │   │   └── inscripciones/ {uid}
> │   │
> │   ├── solicitudesConsolidadas/ {fecha-slugHorarioSolicitud}
> │   │   ├── (campo) otrasSolicitudes/
> │   │   └── comensalesSolicitados/ {uid-slugtiempocomida}
> │   │
> │   ├── recordatorios/ {auto-id}
> │   │
> │   └── comentarios/ {auto-id}
> │
> ├── usuarios/ {uid}
> │   ├── semanarios/ {fechaInicio}
> │   ├── excepciones/ {fecha-slugtiempocomida}
> │   ├── ausencias/ {fechaInicio}
> │   └── faltas/ {auto-id}
> │
> (RAÍZ DE SISTEMA)
> ├── feedback/ {auto-id}
> └── logs/ {auto-id}

#### B. Estrategia de Identidad (IDs Semánticos vs. Auto-IDs)

Se prohíbe el uso indiscriminado de `add()` (Auto-IDs) para entidades de configuración.

1.  **IDs Deterministas (Semánticos):**
    * Se usan para entidades de configuración, definiciones estables o singletons.
    * **Formato:** `slug-kebab-case` derivado del nombre al momento de la creación (Inmutable).
    * *Uso:* `residencias`, `tiemposComida` (ej. "desayuno-lunes"), `configuracion` (`general`), `comedores`, `gruposUsuarios`,
    `horariosSolicitudComida`, `centrosDeCosto`
    * *Objetivo:* Facilitar la lectura de logs, debugging y evitar duplicados lógicos.
2. **Versionado de los ID Deterministas:**
    * Cuando una entidad cíclica como `TiempoComida` o `Alternativa` se quiere borrar, se hace un "soft delete" colocando `esActivo=false` y se crea un nuevo slug versionado agregando el sufijo "-1" luego "-2" etc. de forma que el usuario final no necesite cambiar el nombre para generar un nuevo `slug-kebab-case`
3.  **Auto-IDs (Aleatorios):**
    * Se usan para datos transaccionales de alto volumen o sin nombre único.
    * *Uso:* `contratosResidencia`, `logs`, `comentarios`, `faltas`, `atenciones`, `alteraciones`, `actividades`
4.  **IDs Externos:**
    * Los documentos en `usuarios` deben coincidir estrictamente con el **Auth UID**.
    * Los documentos en `clientes` deben usar el identificador de país más código fiscal (RTN en Honduras, etc.).

#### C. Optimización de Lectura (Pattern: Embed vs. Collection)

Para minimizar la latencia y los costos de lectura en la carga inicial de la aplicación:

* **Listas Pequeñas y Estables (< 50 items):** Se guardan como mapas/arrays dentro del documento de configuración padre (**Embed Pattern**).
    * *Ejemplo:* `comedores`, `gruposUsuarios`, `dietas` viven dentro de `residencias/{slug}/configuracion/general`.
* **Listas Crecientes o Granulares:** Se guardan como **Subcolecciones**.
    * *Ejemplo:* `actividades`, `tiemposComida`, `pedidos`.

### 3.3 Estrategia de Contabilidad (Centros de Costo)

El sistema realiza la imputación de costos en el momento del Snapshot (`SolicitudConsolidada`). Cada `ComensalSolicitado` almacena el centro de costo del usuario, del grupo de usuarios, del comedor y de la actividad, siempre que cada uno de estos exista. El contador podrá a posteriori seleccionar (o incluso cambiar) los centros de costo que apliquen a cada `ComensalSolicitado` manualmente o estableciendo jerarquias entre los diferentes tipos de centros de costo para selección automática. Un comensal puede tener al mismo tiempo varios `centrosDeCosto` pues pueden tener categorías diferentes y no necesariamente mutuamente excluyentes.

### 3.4 Entidad Core: `SolicitudConsolidada` (The Source of Truth)

* **Función:** Es el registro inmutable generado tras el cierre del Director.
* **Desnormalización:** Contiene copias de los nombres de los tiempos de comida y alternativas de comida, además del comedor para evitar corrupción histórica si la configuración cambia.
* **Trazabilidad:** Incluye el campo `origen` (`SEMANARIO`, `EXCEPCION`, `ACTIVIDAD`, `ASISTENTE_INVITADOS`, `INVITADO_EXTERNO`) para auditoría.

### 3.5 Núcleo Compartido (Shared kernel)

La lógica de resolución de estados (Cascada: Actividad > Ausencia > Preferencia) se implementará como un paquete de Funciones Puras en TypeScript/JavaScript, sin dependencias de infraestructura (ni Firebase, ni DOM). Este módulo será importado tanto por el Cliente (para UI reactiva) como por las Cloud Functions (para el Snapshot oficial). **Regla de Oro:** Si la lógica cambia, se actualiza el paquete compartido, nunca el frontend o backend por separado.

---

## 4. Stack Tecnológico y Estrategia de Infraestructura

### 4.1 Principios de Selección
Prioridad en **Bajo Costo Operativo** (Non-profit) y **Eficiencia de Lecturas**. Stack "Serverless-First" delegando complejidad a GCP y maximizando el cómputo en el cliente (Edge).

### 4.2 Componentes del Sistema

#### A. Frontend (Client-Side Rendering - CSR)

* **Tecnología:** Next.js (React) en modo SPA.
* **Gestión de Estado y Caché:** **TanStack Query (React Query)** con persistencia local.
    * *Estrategia:* Mitigación de lecturas a Firestore. Los datos históricos y configuraciones (`SemanarioUsuario`) se leen una vez y se mantienen en memoria/localStorage.
* **Patrón View Model (Hidratación):**
    * El objeto complejo `VistaGrillaSemanal` **NO** se guarda en la BD.
    * Se genera en el cliente mediante una función pura que combina los datos crudos (`SemanarioUsuario` + `Excepciones` + `Actividades` + `Ausencias`).
    * Esto transfiere la carga de CPU de la nube (costo) al dispositivo del usuario (gratis).

#### B. Backend & Persistencia (Firebase Ecosystem)

* **Base de Datos Operativa:** Google Cloud Firestore (NoSQL).
    * *Patrón "Fat Document":* Los Semanarios se almacenan como un único documento JSON por usuario/semana para reducir lecturas (1 lectura vs 7).
    * *Índices:* Uso estricto de índices compuestos para consultas exactas por rango de fechas.
* **Lógica de Negocio:** Firebase Cloud Functions (TypeScript).
    * Responsables de escrituras críticas: Snapshot (`SolicitudConsolidada`), validaciones de seguridad y triggers.

#### C. Analítica y Reportes (BigQuery Strategy)

* **Componente:** Extension "Stream Firestore to BigQuery".
* **Flujo:** Replicación automática de la colección `comensales` (tickets cerrados) hacia BigQuery.
* **Propósito:**
    1.  Permitir consultas SQL complejas (agregaciones, sumas) imposibles en NoSQL.
    2.  Separar cargas: Los reportes administrativos no impactan el rendimiento de la app.
    3.  Dashboarding vía Google Looker Studio.
* **Información para BigQuery:** Se almacenan principalmente los datos de las colecciones `logs`, `solicitudesConsolidadas`, `comensalesSolicitados` y `centrosDeCosto`.

### 4.3 Integraciones y Seguridad

* **Autenticación:** Firebase Auth.
* **Integraciones (ERPNext):** Arquitectura dirigida por eventos (**Webhooks**). El sistema publica eventos de dominio (ej. `cierre_diario_completado`) que son consumidos por middlewares externos (ej. n8n) para la sincronización contable, manteniendo el núcleo desacoplado.

### 4.4 Estándares de código

* **Timestamps:** 
    + En la Frontera (Boundary): Cuando los datos salen de Firestore hacia la App, se convierten inmediatamente de Timestamp a String (ISO).
    + En la UI: Se usa una librería ligera (como date-fns o la nativa Intl.DateTimeFormat) para mostrarlo en la hora local del usuario.
    + Al Guardar: Se convierte de String a Timestamp justo antes de escribir en la DB.

---

## 5. Estándares de Ingeniería y Calidad

### 5.1 Estrategia de Validación (The Shared Schema)

Los esquemas Zod (ubicados en `@/shared/schemas`) actúan como la **Fuente de la Verdad** (Single Source of Truth) para la integridad de datos.
* **Contrato:** Ningún dato entra o sale del sistema sin pasar por un esquema Zod.
* **Dualidad:** En el Cliente, se usa React Hook Form junto con ZOD para mejor desempeño y validación con feedback inmediato (UX). En el Servidor (Server Actions/Functions), se usan los mismos esquemas ZOD como barrera de seguridad obligatoria antes de tocar la base de datos.

### 5.2 Patrón DTO y Serialización (Zod Transform)

Se impone el uso de Zod como capa de transformación (DTO) obligatoria para resolver la brecha de hidratación ("Hydration Gap") de Next.js y Firestore:
1.  **Aplanamiento:** Los tipos complejos (`Timestamp`, `GeoPoint`) deben transformarse a primitivos (`string ISO 8601`, `number`) dentro del esquema usando `z.transform()`.
2.  **Seguridad de Datos:** Se debe utilizar `.pick()` o `.omit()` para exponer al cliente únicamente los campos necesarios, previniendo fugas de información sensible ("Over-fetching").

### 5.3 Manejo Unificado de Errores (UI Standard)

Para garantizar consistencia visual y reducir deuda técnica:
* **Errores de Validación (Zod):** Se mostrarán en un componente unificado `ZodAlert` (Franja Roja) ubicado en la cabecera del formulario. No se usarán mensajes dispersos campo por campo salvo excepciones críticas.
* **Confirmaciones/Errores de Sistema:** Se utilizarán notificaciones efímeras ("Toasts") para éxito de operaciones o fallos de red.

### 5.4 Seguridad en Capas (Defense in Depth)

La seguridad no es binaria, es estratificada:

* **Capa 1: Autorización (Firestore Rules).** Valida la tenencia (Multi-tenant isolation) y permisos básicos de rol (RBAC) usando *Custom Claims*, comparándolos con la jerarquía de colecciones de Firestore (residenciaId y userId) y los resource.data que vienen de los registros de Firestore. Es la muralla final.
* **Capa 2: Integridad (Zod Base).** Valida tipos, formatos (email, longitud) y estructura.
* **Capa 3: Reglas de Negocio (Server Logic).** Valida lógica compleja (ej: cupos llenos, fechas cruzadas) usando `.refine` / `.superRefine`.
    * **Restricción Crítica:** Si una operación depende de validaciones de Capa 3, la escritura directa en `firestore.rules` debe estar **deshabilitada** (`allow write: if false`), forzando el uso de Server Actions o Cloud Functions.

### 5.5 Concurrencia y Latencia

Debido a la naturaleza asíncrona de las Server Actions:
* Es mandatorio implementar **Optimistic UI** (vía `useOptimistic` o `TanStack Query`) para mutaciones frecuentes. La interfaz no debe "congelarse" esperando al servidor.
* Las transacciones atómicas deben agruparse en lotes (`batches`) para garantizar consistencia.

## 6. Resumen Ejecutivo (Blueprint)

**"Comensales Residencia"** es un sistema de gestión logística con enfoque formativo.

1.  **Inputs:** El usuario gestiona su **Intención** (Semanario, Excepciones) de forma flexible antes del cierre.
2.  **Proceso:** Un algoritmo de **Cascada** resuelve conflictos (Actividad > Ausencia > Preferencia) en el navegador del cliente para previsualización.
3.  **Outputs:** Al cierre, el servidor genera **Hechos Inmutables** (`Comensales`) mediante un Snapshot, que sirve como fuente única para Cocina y Contabilidad (BigQuery).

---

*Documento generado bajo supervisión de Arquitectura de Software Senior.*