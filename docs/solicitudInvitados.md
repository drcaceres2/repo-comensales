## BLUEPRINT ARQUITECTÓNICO: Módulo de Provisión de Invitados

### 1. Filosofía y Reglas del Dominio
* **Patrón Base:** Separación estricta entre **Intención** (Ticket) y **Realidad** (Usuario/Snapshot). Los residentes ("Anfitriones") no tienen capacidad de escritura sobre el censo poblacional ni sobre las métricas del comedor.
* **Agnosticismo de Cuenta:** El sistema trata a las *Shadow Accounts* (sin autenticación) y a los usuarios completos como ciudadanos de primera clase para la **Capa 3 (Excepciones)** y el **Filtro de Contingencia (Capa 0)**.
* **Trazabilidad Híbrida:** Se mantiene la integridad referencial dura (`idAnfitrion`) en la solicitud, pero se inyecta flexibilidad analítica (`referidoPorNombre`) en el perfil final del usuario.

---

### 2. Contrato de Datos (Capa 1 - Persistencia e Intención)

El contrato se basa en la entidad efímera `TicketInvitacion`. Su diseño aísla el payload de las mutaciones futuras del esquema base de usuarios.

* **Metadatos de Control:** `id`, `residenciaId`, `idAnfitrion` (AuthId estricto), `estado` (pendiente | aprobada | rechazada).
* **Payload Protegido (`z.pick`):** Extraído de `UsuarioBaseObject`. Incluye datos biométricos y académicos básicos (`nombre`, `apellido`, `identificacion`, etc.).
    * *Decisión Crítica:* El campo `email` viaja como `nullable/optional` para reducir la fricción en la sugerencia.
* **Contexto de Intención (Unión Discriminada):** Define el disparador del ticket:
    1.  `comida`: Requiere `alternativaId` (el menú específico) y `fecha` cronológica.
    2.  `actividad`: Requiere `actividadId`.
    3.  `ninguno`: Provisión de censo pasiva.
* **Punteros de Integración:** `mensajeReferenciaId` para enlazar con el ecosistema de comunicaciones (Deep Linking).

---

### 3. Pipeline de Estado (Capa 2 - Lógica de Servidor)

El Director (o Asistente con permiso `gestionInvitados`) procesa la bandeja de entrada ejecutando una Server Action atómica que se bifurca en dos fases:

#### Fase A: Resolución de Identidad
El motor valida si el individuo existe (asistido por *Fuzzy Matching* en la UI).
* **Vía 1 (Full):** Crea usuario con `tieneAutenticacion: true` y exige un email válido para el onboarding.
* **Vía 2 (Shadow):** Crea usuario con `tieneAutenticacion: false`. Queda supeditado a la gestión futura del Anfitrión (vía `usuariosAsistidos`).
* **Vía 3 (Rechazo):** El ticket muere (`estado: rechazada`) y se notifica al Anfitrión.

#### Fase B: Resolución de Contexto
Si la Fase A fue exitosa, el motor lee el discriminador del `ContextoInvitacion` y ejecuta:
* Si es `comida`: Genera una `Excepcion` manual inyectada directamente para el `alternativaId` validando previamente que la fecha no haya superado el cierre administrativo (Capa 0).
* Si es `actividad`: Genera un registro en la colección de `Inscripciones`.
* Si es `ninguno`: Termina la transacción en silencio.

---

### 4. Intersecciones con Otros Módulos

1.  **Módulo de Mensajes:** La creación de un ticket puede generar un `Mensaje` con `tipoEntidad: 'solicitud_invitado'` y `entidadId: ticket.id`. Esto permite a los directores chatear con el Anfitrión sobre la solicitud y aprobarla desde el mismo hilo.
2.  **Módulo de Snapshots (Pre-flight):** Antes de compilar los "Hechos Inmutables" del comedor, el consolidador escanea la colección de tickets. Si detecta un estado `pendiente` con `contexto.fecha` que colisiona con el corte inminente, emite una alerta bloqueante.
3.  **Módulo de Asistentes:** Al crearse un *Shadow Account*, la Server Action vincula automáticamente el nuevo `id` del invitado a la lista de `usuariosAsistidos` del Anfitrión para facilitar autogestión futura.

---

### 5. Mitigación de Riesgos Detectados (Guardrails)

* **Falsa Validación Zod:** Recordar al equipo que Zod solo verifica que la fecha de la comida sea futura cronológicamente. La validación real de "cierre de cocina" ocurre obligatoriamente en la Server Action leyendo el Singleton.
* **Proliferación de Sombras:** La UI del Director debe consumir un índice de Fuse.js sobre `nombre + apellido` antes de despachar la Fase A para evitar crear "Juan Pérez (Shadow 1)", "Juan Perez (Shadow 2)".