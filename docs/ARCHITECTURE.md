# ARCHITECTURE.md

**Proyecto:** comensales.app (Web App)
**Versión del Documento:** 10.0 (Actualizado con módulos de Alteraciones, Grupos y Horarios)
**Rol:** Arquitectura de Software & Estrategia

---

## 1. Objetivos de Negocio y Restricciones Arquitectónicas

### 1.1 Visión del Producto
El sistema "comensales.app" es una plataforma multi-tenant (SaaS) diseñada para la gestión logística de horarios de comida en residencias universitarias con un enfoque formativo sin ánimo de lucro.

A diferencia de aplicaciones comerciales de *delivery* (donde el objetivo es la conveniencia del usuario final y el lucro), este sistema prioriza la **planificación, el orden y la formación en virtudes** (responsabilidad, puntualidad). El sistema opera bajo una lógica de **"Fail-Close"**: ante la duda o inacción del usuario fuera de plazo, no hay servicio.

### 1.2 Objetivos Estratégicos
1.  **Formación sobre Conveniencia:** El sistema penaliza la falta de planificación. No existen flujos de emergencia automatizados; las excepciones fuera de plazo requieren intervención manual del Director (fricción intencional).
2.  **Agnosticismo Cultural:** Soporte total para esquemas de comida no tradicionales (Brunch, Asados, Meriendas) mediante configuración dinámica, desacoplada de horarios fijos occidentales. Todas las páginas manejan plantilla de idioma y estilo (i18n).
3.  **Segregación de Negocio:** Estricta separación entre **Residencia** (Usuarios, Roles, Reglas) y **Administración** (Proveedor de alimentos).

## 2. Estrartegia de Persistencia

### 2.1 Topología de Configuración (El Singleton)

Gran parte de la configuración de la residencia (Taxonomía de grupos, reglas de horarios y alternativas) persiste acoplada en un documento "Singleton" (diccionarios dentro de un único documento maestro de configuración general por residencia). Esto optimiza las lecturas repetitivas pero exige estrategias estrictas para la escritura.

Para lidiar con la complejidad de cruzar mapas de configuración cacheados, la preparación de los datos para la visualización del usuario (ej. la grilla de selección de horarios) depende estrictamente de **funciones puras de hidratación** (como `construirMatrizVistaHorarios`).

### 2.2 Topología de Datos (Jerarquía Multi-Tenant)

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
> ├── residencias/ {residenciaId}  - slug del nombre  
> │   │  
> │   ├── configuracion/ {general}  - Singleton  
> │   │   ├── (campo) horariosSolicitud: Map<ID, HorarioSolicitudData>  
> │   │   ├── (campo) comedores: Map<ID, ComedorData>  
> │   │   ├── (campo) gruposUsuarios: Map<ID, GrupoUsuariosData>  
> │   │   ├── (campo) dietas: Map<ID, DietaData>  
> │   │   ├── (campo) gruposComidas: Map<ID, GrupoComida>  
> │   │   ├── (campo) esquemaSemanal: Map<ID, TiempoComida>  
> │   │   ├── (campo) catalogoAlternativas: Map<ID, DefinicionAlternativa>  
> │   │   └── (campo) configuracionesAlternativas: Map<ID, ConfiguracionAlternativa>  
> │   │  
> │   ├── configContabilidad/ {general}  - Singleton  
> │   ├── centrosDeCosto/ {centroDeCostoId}  - slug del nombre  
> │   │  
> │   ├── atenciones/ {atencionId}  - Auto-generado por Firestore  
> │   │  
> │   ├── alteracionesHorario/ {alteracionDiariaId}  - fecha de la alteracion YYYY-MM-DD  
> │   │  
> │   ├── actividades/ {actividadId}  - Auto-generado por Firestore    
> │   │   └── inscripciones/ {inscripcionId}  - usuarioId de la inscripción  
> │   │  
> │   ├── solicitudesConsolidadas/ {solicitudConsolidadaId}  - ID compuesto: fecha YYYY-MM-DD más "__" más slugHorarioSolicitudComida  
> │   │   └── comensales/ {comensalId}  - uid-slugtiempocomida
> │   │  
> │   ├── solicitudesInvitados/ {solicitudInvitadoId}  - auto-generado por Firestore  
> │   ├── recordatorios/ {recordatorioId}  - Auto-generado por Firestore  
> │   ├── mensajes/ {mensajeId}  - Auto-generado por Firestore  
> │   └── novedadesOperativas/ {novedadesId}  - Auto-generado por Firestore  
> │  
> ├── usuarios/ {usuarioId}  - Auto-generado por Firebase Auth  
> │   ├── semanarios/ {semanarioId}  - fecha de inicio de vigencia del semanario YYYY-MM-DD  
> │   ├── excepciones/ {excepcionId}  - compuesto por la fecha en formato YYYY-MM-DD más "__" más tiempoComidaID  
> │   ├── ausencias/ {ausenciaId}  - la fecha de inicio de la ausencia  
> │   └── faltas/ {faltaId}  - auto-generado por Firestore  
> │  
> (RAÍZ DE SISTEMA)  
> ├── feedback/ {feedbackId}  - auto-generado por Firestore  
> └── logs/ {logId}  - auto-generado por Firestore  


## 3. Algoritmo de Cascada (Resolución de Intenciones)
El proceso central resuelve conflictos evaluando prioridades en el navegador del cliente (previsualización) y en el servidor (durante el Snapshot final). La jerarquía de resolución es la siguiente:

* **Capa 0: Filtro de Contingencia (Alteraciones de Horario).** Es el modificador absoluto del entorno. Si un cierre administrativo vacía las opciones activas disponibles, la cascada intercepta y descarta la intención original del residente, obligándolo a caer en la alternativa de contingencia configurada de forma inamovible.
* **Capa 1: Actividad.** Inscripciones prioritarias a eventos especiales.
* **Capa 2: Ausencia.** Declaración explícita y planificada de no asistir.
* **Capa 3: Excepción.** Modificación puntual temporal (ej. un día específico).
* **Capa 4: Semanario.** La intención recurrente base del usuario.

## 4. Transaccionalidad y Validación
* **Capa 1: Integridad (Zod Base).** Valida tipos, formatos y esquemas (incluyendo Uniones Discriminadas).
* **Capa 2: Reglas de Negocio (Server Logic).** Valida lógica compleja usando `.refine` / `.superRefine`.
    * **Restricción Crítica:** Si una operación depende de validaciones de Capa 2, la escritura directa desde el cliente en la base de datos debe estar **deshabilitada** (`allow write: if false`), forzando el uso exclusivo de Server Actions o Cloud Functions.
* **Control de Concurrencia Optimista (OCC):** Es el estándar obligatorio para mutar entidades alojadas en el Singleton. Toda escritura debe enviar la versión actual esperada; si existe un desajuste por concurrencia, la transacción se aborta para prevenir anomalías de sobreescritura ("Lost Update").

## 5. Concurrencia y Latencia
Debido a la naturaleza asíncrona de las Server Actions:
* Es mandatorio implementar **Optimistic UI** (vía `useOptimistic` o `TanStack Query`) para mutaciones frecuentes. La interfaz no debe "congelarse" esperando al servidor.
* Las transacciones atómicas masivas deben agruparse en lotes (`batches` o `chunking`) respetando los límites de escritura del proveedor para garantizar consistencia.

## 6. Resumen Ejecutivo (Flujo de Datos)
1.  **Inputs:** El usuario gestiona su **Intención** (Semanario, Excepciones) de forma flexible antes del cierre.
2.  **Proceso:** El algoritmo de **Cascada** evalúa la intención del usuario filtrándola primero por la Capa 0 (Alteraciones del entorno).
3.  **Outputs:** Al momento del corte, el servidor genera **Hechos Inmutables** (`Comensales solicitados`) mediante un Snapshot.

