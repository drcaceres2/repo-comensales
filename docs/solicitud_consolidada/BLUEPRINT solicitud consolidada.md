# Blueprint Técnico: Módulo de Solicitud Consolidada

**Versión:** 1.0 (Definitiva)
**Rol:** Arquitecto Senior de Software
**Patrón Arquitectónico:** Serverless, Optimistic UI, Event-Driven Background Processing, Fail-Close.

---

## 1. Topología de Datos y Seguridad (Firestore / NoSQL)

La persistencia se divide estrictamente para prevenir el *over-fetching* y asegurar la trazabilidad financiera.

### 1.1 Estructura de Rutas
* **Documento Raíz (Fat Document Controlado):**
  `residencias/{residenciaId}/solicitudesConsolidadas/{solicitudId}`
  *Regla de ID:* El `solicitudId` debe ser determinista usando el formato `YYYY-MM-DD__{horarioSolicitudComidaId}` para garantizar la idempotencia de los cierres.
* **Subcolección (Desglose de Comensales):**
  `residencias/{residenciaId}/solicitudesConsolidadas/{solicitudId}/comensales/{comensalId}`
  *Regla de ID:* El `comensalId` debe ser una llave compuesta `usuarioId__tiempoComidaId` para prevenir duplicidad de consumo en un mismo evento.

### 1.2 Reglas de Seguridad (Security Rules) y Concurrencia
* **Lectura:** Permitida a roles `director` y `asistente` con permiso especial de `solicitarComensales`.
* **Escritura Directa (Client-Side):** Deshabilitada (`allow write: if false`). Por mandato arquitectónico, todas las mutaciones deben pasar por *Server Actions* para validar la lógica de Cascada (Capa 0 sobre Capa 1).
* **Control de Concurrencia Optimista (OCC):** El documento raíz debe aplicar OCC verificando la versión actual antes de cualquier mutación al estado `CONSOLIDADO` para evitar "Lost Updates".

---

## 2. Capa Backend (Serverless & Workers)

### 2.1 The Engine: Ingesta y Cálculo en Memoria (Server Action)
* **Nombre de Acción:** `generarBorradorConsolidacion`
* **Flujo Operativo:**
  1. Ejecuta lecturas en paralelo (`Promise.all`) hacia las entidades base (Singleton, Alteraciones, Actividades, Excepciones, Novedades).
  2. Procesa la invariante de Cascada en memoria RAM (hasta un límite estricto de 250 usuarios) garantizando un tiempo de respuesta de milisegundos.
  3. Ejecuta un `WriteBatch` en Firestore para crear el documento en estado `BORRADOR` y escribir la subcolección de comensales. Al ser < 500 mutaciones (1 Root + 250 Comensales = 251 operaciones), la atomicidad del lote está garantizada por el proveedor.

### 2.2 Cierre Atómico y Efectos Secundarios (Server Action)
* **Nombre de Acción:** `sellarSolicitudConsolidada`
* **Flujo Operativo:**
  1. Muta `estadoDocumento` a `CONSOLIDADO` y asigna `timestampCierreOficial`.
  2. Muta las entidades origen a estados finales (ej. Novedades a `consolidado`).
  3. **Mutación Crítica:** Las Actividades con *Comunicación Definitiva* pasan forzosamente a `inscripcion_cerrada`.

### 2.3 Orquestación Asíncrona (Cloud Function / Background Worker)
* **Nombre de Función:** `onSolicitudConsolidadaSealed`
* **Trigger:** Evento `onDocumentUpdated` de Firestore.
* **Condición de Ejecución:** `estadoDocumento == 'CONSOLIDADO'` AND `estadoGeneracionPdf == 'PENDIENTE'`.
* **Flujo Operativo:**
  1. Genera el PDF (reporte A4) en Node.js (usando `@react-pdf/renderer` o `pdfmake`).
  2. Sube el documento a Cloud Storage.
  3. Actualiza el documento de la Solicitud modificando `estadoGeneracionPdf` a `COMPLETADO` y estampando la `urlPdfReporte`.
  4. Dispara el webhook del proveedor de Email.

---

## 3. Capa Frontend (Arquitectura de Estado y UI Mobile-First)

### 3.1 Flujo de Estado (Zustand + TanStack Query)
El aislamiento de estado es crítico para proteger la UI móvil de la latencia de red.
1. **Ingesta inicial:** `useQuery` invoca a `generarBorradorConsolidacion`.
2. **Hidratación:** El resultado se inyecta en el store local de Zustand (`useSolicitudStore`). El cliente se desacopla del servidor.
3. **Edición en Caliente:** Cualquier modificación del Director (cambios de alternativa, adición de avisos de administración) muta exclusivamente Zustand, asegurando una experiencia sin *lag*.
4. **Sincronización:** Un *debouncer* (ej. 3 segundos de inactividad) utiliza `useMutation` para enviar un *patch* silencioso al backend, actualizando el documento `BORRADOR` en segundo plano.

### 3.2 Estructura de Interfaz de Usuario (Drill-Down)
Para gestionar la carga cognitiva como "tablero de instrumentos de un avión" en pantallas móviles:

1. **Header Pegajoso (Sticky):** Contiene un calendario colapsable (acordeón) mostrando únicamente recordatorios y cumpleaños para maximizar espacio de pantalla.
2. **Bandeja de Entrada (Inbox Zero):** Lista de validación (Triage). Entidades en estado `pendiente` se aprueban para entrar al radar de comunicación. Actividades y Usuarios Nuevos se validan aquí o re-enrutan a sus propios módulos.
3. **Navegación Principal (Bottom Nav):** Dividida en `Comensales` | `Novedades` | `Otros`.
4. **Vista de Comensales (Acordeón de 3 Niveles):** * *Nivel 1:* `TiempoComida` (Ej. Desayuno: 150 pax).
   * *Nivel 2:* `Alternativa` (Ej. Regular: 100 pax).
   * *Nivel 3:* `Dieta` (Ej. Vegetariana: 15 pax, Celiaca: 5 pax).
5. **Cierre de Ciclo:** Botón "Sellar Solicitud" (Doble confirmación obligatoria). Muestra un loader de UI basado en polling de `estadoGeneracionPdf` para dar la ilusión de sincronía sin riesgo de timeout HTTP.

---

## 4. Estructura de archivos sugerida

```plaintext
📦 comensales-app
┣ 📂 src
┃ ┣ 📂 app
┃ ┃ ┗ 📂 [residenciaId]
┃ ┃   ┗ 📂 gerencia
┃ ┃     ┗ 📂 solicitud-consolidada        # MÓDULO: SOLICITUD CONSOLIDADA
┃ ┃       ┣ 📜 page.tsx                   # Vista Histórica (Feed de consolidadas)
┃ ┃       ┣ 📂 consolidar                 # El "Wizard" (Proceso de creación)
┃ ┃       ┃ ┣ 📜 page.tsx                 # Contenedor principal del Wizard
┃ ┃       ┃ ┗ 📂 _components              # Componentes aislados (Solo UI)
┃ ┃       ┃   ┣ 📜 InboxZeroTriage.tsx    # Tarjetas de aprobación/rechazo
┃ ┃       ┃   ┣ 📜 EngineProgress.tsx     # Loader con polling de estado
┃ ┃       ┃   ┣ 📜 MainAccordion.tsx      # Vista principal (Niveles 1, 2 y 3)
┃ ┃       ┃   ┣ 📜 ActividadesBoard.tsx   # Los 3 carriles (Radar, Cierre, Cancelación)
┃ ┃       ┃   ┗ 📜 BottomSheetAjustes.tsx # Buscador predictivo y edición en caliente
┃ ┃       ┗ 📂 _lib
┃ ┃         ┣ 📜 store.ts                 # Estado local (Zustand) para la edición en caliente
┃ ┃         ┣ 📜 queries.ts               # Hooks de TanStack Query (Lectura e Hidratación)
┃ ┃         ┗ 📜 server-actions.ts        # The Engine (`generarBorrador`) y (`sellarSolicitud`)
┃ ┗ 📂 lib
┃   ┗ 📜 firebaseAdmin.ts                 # Instancia de Firebase Admin (necesaria para el Engine)
┃  
┣ 📂 shared                               # LÓGICA DE DOMINIO Y ESTADO (Agnóstico a la UI)
┃ ┗ 📂 schemas                            # LÓGICA DE DOMINIO Y ESTADO (Agnóstico a la UI)
┃   ┗ 📜 solicitudConsolidada.schema.ts   # Tu contrato de datos (Zod)
┃
┃
┗ 📂 functions                            # CLOUD FUNCTIONS (Background Workers)
  ┣ 📂 src
  ┃ ┣ 📂 solicitud-consolidada
  ┃ ┃ ┣ 📜 onSolicitudSealed.ts         # Trigger principal (Escucha estado 'CONSOLIDADO')
  ┃ ┃ ┣ 📜 pdfGenerator.ts              # Lógica aislada con @react-pdf/renderer o pdfmake
  ┃ ┃ ┗ 📜 emailSender.ts               # Integración con SendGrid/Resend
  ┃ ┗ 📜 index.ts                         # Punto de exportación de los triggers
  ┗ 📜 package.json                       # Dependencias aisladas para el worker
```

---
**Nota del Arquitecto:** Cualquier alteración a las reglas de Cascada especificadas en `SPEC-DOMAIN 4.0` invalida la premisa de inmutabilidad de este contrato. No permitir *bypasses* locales por conveniencia.