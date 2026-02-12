# ARCHITECTURE.md

**Proyecto:** Comensales Residencia (Web App)
**Versión del Documento:** 2.0 (Consolidado)
**Rol:** Arquitectura de Software & Estrategia

---

## 1. Objetivos de Negocio y Restricciones Arquitectónicas

### 1.1 Visión del Producto
El sistema "Comensales Residencia" es una plataforma multi-tenant (SaaS) diseñada para la gestión logística y formativa de alimentación en residencias universitarias.

A diferencia de aplicaciones comerciales de *delivery* (donde el objetivo es la conveniencia), este sistema prioriza la **planificación, el orden y la formación en virtudes** (responsabilidad, puntualidad). El sistema opera bajo una lógica de **"Fail-Close"**: ante la duda o inacción del usuario fuera de plazo, no hay servicio.

### 1.2 Objetivos Estratégicos
1.  **Formación sobre Conveniencia:** El sistema penaliza la falta de planificación. No existen flujos de emergencia automatizados; las excepciones fuera de plazo requieren intervención manual del Director (fricción intencional).
2.  **Agnosticismo Cultural:** Soporte total para esquemas de comida no tradicionales (Brunch, Asados, Meriendas) mediante configuración dinámica, desacoplada de horarios fijos occidentales.
3.  **Segregación de Negocio:** Estricta separación entre **Residencia** (Usuarios, Roles, Reglas) y **Cocina** (Producción). La Cocina opera como una "Caja Negra" que recibe órdenes consolidadas.

### 1.3 Drivers Arquitectónicos
* **Modelo "Plantilla y Excepción":** La base de datos no almacena "lo que come cada usuario cada día" por adelantado. Se usa una proyección en tiempo real de un patrón recurrente (`Semanario`) modificado por excepciones (`Ausencias`, `Actividades`).
* **Inmutabilidad por Snapshot:** La flexibilidad termina cuando el Director "Solicita a Cocina". En ese momento, la realidad dinámica se congela en registros históricos inmutables (`Comensales`).
* **Manejo de Tiempo Absoluto:** Toda lógica obedece a la `ZonaHoraria` de la Residencia, ignorando la ubicación o reloj del dispositivo del usuario.

---

## 2. Arquitectura de Datos y Lógica de Resolución

### 2.1 El Algoritmo de Cascada (The Truth Cascade)
El estado de una comida ("¿Qué come el usuario hoy?") no es un dato estático en la BD, sino el resultado de una evaluación jerárquica en tiempo de ejecución (Runtime Resolution).

**Jerarquía de Prioridad (de mayor a menor):**

1.  **Actividad (Imperativo Institucional):** Si el usuario está inscrito, esta regla prevalece sobre todas. Bloquea ausencias y elecciones personales.
2.  **Ausencia (Negación de Servicio):** Si existe ausencia (y no hay actividad), el resultado es `null` (no come).
3.  **Excepción (Intención Voluntaria):** Una desviación explícita creada por el usuario (antes llamada "Elección"). Representa un cambio puntual (ej. "Hoy quiero dieta").
4.  **Semanario (Fallback / Default):** Si no hay reglas superiores, se aplica la configuración cíclica por defecto del usuario.

### 2.2 Estrategia de Persistencia: "Snapshotting"
Dado que el cálculo dinámico (2.1) es volátil (si cambia el semanario hoy, cambiaría el pasado), el sistema implementa un patrón de **Materialización de Vistas**:

* **Fase Draft (Viva):** Antes del corte, la UI del residente calcula la comida al vuelo usando la Cascada.
* **Fase Committed (Congelada):** Al momento de "Solicitar a Cocina", el backend resuelve la cascada y **escribe** el resultado final en la entidad `Comensal`.
    * *Regla:* Una vez creado el documento `Comensal`, los cambios en Semanarios o Actividades futuras NO reescriben este historial.

---

## 3. Módulos Funcionales y Reglas de Integración

### 3.1 Actividades y Exclusión Mutua (Mutex)
* **Lógica:** Existe una exclusión mutua lógica entre `Actividad` y `Ausencia`. El sistema impide inscribirse a una actividad si hay ausencia vigente y viceversa.
* **Locking:** Una vez la actividad se solicita a cocina, la lista de inscritos (`inscritosIds`) se congela. Las bajas posteriores se tratan como *No-Show*.

### 3.2 Feedback y Comunicación
* **Comentarios:** Funcionan como una cola de trabajo para el Director (`nuevo` -> `leido` -> `diferido` -> `archivado`). Los datos persisten para trazabilidad histórica.
* **Recordatorios:** Capa de contexto visual (Overlay) sobre el calendario.

### 3.3 Estrategia de Contabilidad (Centros de Costo)
El sistema realiza la imputación de costos en el momento del Snapshot (`Comensal`). El Centro de Costo se "quema" en el ticket y no cambia aunque el usuario cambie de perfil.

**Jerarquía de Resolución de Costo:**
1.  **Actividad:** Si tiene presupuesto propio.
2.  **Invitado:** Centro de costo seleccionado al registro (o el del anfitrión).
3.  **Excepción:** Si la excepción define un costo específico.
4.  **Usuario:** Centro de costo por defecto del perfil.

### 3.4 Entidad Core: `Comensal` (The Source of Truth)
*Nota Técnica:* Esta entidad **NO** representa a la persona. Representa el **Ticket de Comida Facturable**.

* **Función:** Es el registro inmutable generado tras el cierre del Director.
* **Desnormalización:** Contiene copias de los nombres de platos y menús para evitar corrupción histórica si la configuración cambia.
* **Trazabilidad:** Incluye el campo `origen` (`SEMANARIO`, `EXCEPCION`, `ACTIVIDAD`, `INVITADO`) para auditoría.

---

## 4. Stack Tecnológico y Estrategia de Infraestructura

### 4.1 Principios de Selección
Prioridad en **Bajo Costo Operativo** (Non-profit) y **Eficiencia de Lecturas**. Stack "Serverless-First" delegando complejidad a GCP y maximizando el cómputo en el cliente (Edge).

### 4.2 Componentes del Sistema

#### A. Frontend (Client-Side Rendering - CSR)
* **Tecnología:** Next.js (React) en modo SPA.
* **Gestión de Estado y Caché:** **TanStack Query (React Query)** con persistencia local.
    * *Estrategia:* Mitigación de lecturas a Firestore. Los datos históricos y configuraciones (`Semanario`) se leen una vez y se mantienen en memoria/localStorage.
* **Patrón View Model (Hidratación):**
    * El objeto complejo `SemanarioDesnormalizado` **NO** se guarda en la BD.
    * Se genera en el cliente mediante una función pura que combina los datos crudos (`Semanario` + `Excepciones` + `Actividades`).
    * Esto transfiere la carga de CPU de la nube (costo) al dispositivo del usuario (gratis).

#### B. Backend & Persistencia (Firebase Ecosystem)
* **Base de Datos Operativa:** Google Cloud Firestore (NoSQL).
    * *Patrón "Fat Document":* Los Semanarios se almacenan como un único documento JSON por usuario/semana para reducir lecturas (1 lectura vs 7).
    * *Índices:* Uso estricto de índices compuestos para consultas exactas por rango de fechas.
* **Lógica de Negocio:** Cloud Functions (TypeScript).
    * Responsables de escrituras críticas: Snapshot (`Comensal`), validaciones de seguridad y triggers.

#### C. Analítica y Reportes (BigQuery Strategy)
* **Componente:** Extension "Stream Firestore to BigQuery".
* **Flujo:** Replicación automática de la colección `comensales` (tickets cerrados) hacia BigQuery.
* **Propósito:**
    1.  Permitir consultas SQL complejas (agregaciones, sumas) imposibles en NoSQL.
    2.  Separar cargas: Los reportes administrativos no impactan el rendimiento de la app.
    3.  Dashboarding vía Google Looker Studio.

### 4.3 Integraciones y Seguridad
* **Autenticación:** Firebase Auth.
* **Integraciones (ERPNext):** Arquitectura dirigida por eventos (**Webhooks**). El sistema publica eventos de dominio (ej. `cierre_diario_completado`) que son consumidos por middlewares externos (ej. n8n) para la sincronización contable, manteniendo el núcleo desacoplado.

---

## 5. Resumen Ejecutivo (Blueprint)

**"Comensales Residencia"** es un sistema de gestión logística con enfoque formativo.

1.  **Inputs:** El usuario gestiona su **Intención** (Semanario, Excepciones) de forma flexible antes del cierre.
2.  **Proceso:** Un algoritmo de **Cascada** resuelve conflictos (Actividad > Ausencia > Preferencia) en el navegador del cliente para previsualización.
3.  **Outputs:** Al cierre, el servidor genera **Hechos Inmutables** (`Comensales`) mediante un Snapshot, que sirve como fuente única para Cocina y Contabilidad (BigQuery).

---
*Documento generado bajo supervisión de Arquitectura de Software Senior.*