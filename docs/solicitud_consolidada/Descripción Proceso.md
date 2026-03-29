# Descripción del Proceso a Seguir para la Solicitud Consolidada

La **Solicitud Consolidada** no es una vista de datos en tiempo real, sino un proceso de congelamiento transaccional que transforma intenciones volátiles en hechos inmutables para la operación logística y contable.

Tienen acceso al módulo de solicitar comensales todos los directores y los asistentes con permiso especial de "solicitarComensales". A la persona que hace la solicitud consolidada, por simplicidad en este documento, la llamaremos *consolidador*.

## Apuntes Estratégicos de Negocio

La solicitud consolidada es el núcleo transaccional de toda la aplicación. Pretende ser como el tablero de instrumentos de un avión: no tiende a ser simple, sino completo, manejando una alta pero controlada carga cognitiva mediante **revelación progresiva**. Se prevé que el consolidador deba aprender a usarlo con un entrenamiento mínimo y no lo use a pura intuición.

Los usuarios consolidadores no necesariamente entrarán a la web app fuera del momento de la solicitud consolidada. Para el usuario consolidador, hacer la solicitud consolidada es su trabajo profesional, a diferencia de los residentes, que usan la aplicación para resolver su logística personal.

---

## Descripción General del Flujo (UI/UX)

El proceso ha sido diseñado para evitar cuellos de botella y proteger la base de datos de bloqueos innecesarios o duplicidades. Se divide en las siguientes fases secuenciales:

### Fase 0: Separación de Histórico y Nuevo Proceso
El módulo de "Solicitudes Consolidadas" se divide en dos áreas para no mezclar la intención de auditoría con la intención de operación:
1. **Feed Histórico (Solo Lectura):** Una tabla o lista que muestra todas las solicitudes pasadas en estado `CONSOLIDADO`. (`src\app\[residenciaId]\gerencia\solicitud-consolidada\page.tsx`)
2. **Acción Principal:** Un botón prominente de **"Iniciar Nueva Consolidación"** que sumerge al consolidador en el flujo tipo *Wizard* (Asistente paso a paso). (`src\app\[residenciaId]\gerencia\solicitud-consolidada\consolidar\page.tsx`)

### Fase 1: Bandeja de Entrada (Triage / Inbox Zero) - `consolidar\_components\InboxZeroTriage.tsx`
Antes de calcular los números, el consolidador debe "limpiar su escritorio". En esta pantalla se muestran únicamente las entidades en estado `pendiente`.
* **Mecánica:** Interfaz de tarjetas rápidas para aprobar o rechazar actividades, atenciones, dietas, excepciones y novedades operativas.
| Entidad y campo de estado | Estado inicial (filtro) | Estado aprobado | Estado rechazado |
| :--- | :--- | :--- | :--- |
| Actividad.estado | pendiente | aprobada | cancelada |
| Atencion.estado | pendiente | aprobada | rechazada |
| DietaData.estado | solicitada_por_residente | aprobada_director | no_aprobada_director |
| Excepcion.estadpAprobacion | pendiente | aprobada | rechazada |
| NovedadOperativa.estado | pendiente | aprobado | rechazado |
| solicitudInvitado.estado | pendiente | aprobada | rechazada |
* **Bloqueo:** No se puede pasar a la siguiente fase si hay elementos pendientes críticos sin resolver. Toda entidad que vaya a incluirse en el consolidado debe estar en estado `>= aprobada`.
* **UI:** La interfaz tiene acordeones por cada tipo de entidad y dentro de cada acordeón tarjetas pequeñas estilo correo electrónico que se deslizan a la izquierda para mover al estado rechazado, y a la derecha para mover al estado aprobado. Al deslizarla a los lados aparece un ícono con una X con fondo rojo al deslizar a la izquierda y un símbolo de "cheque" con fondo verde.
* **Mutación:** Al terminar la fase 1 se escriben en la base de datos los cambios (a través de TanStack Query y una server action).

### Fase 2: El Motor de Ingesta (El "Muro Móvil")
Una vez limpio el *Inbox*, el usuario confirma el inicio del cálculo.
* **Acción del Sistema:** El usuario ve una pantalla de carga con una barra de progreso que indica las acciones del servidor (ej. "Cruzando actividades...", "Aplicando reglas de cascada...").
* **Transacción:** El servidor lee la información, aplica la precedencia estricta (Capa 0 sobre Capa 1), y genera un documento temporal inmutable en la base de datos en estado **`BORRADOR`**.
* **Protección:** El *Muro Móvil* avanza silenciosamente tomando como referencia la hora de corte exacta del momento en que se generó este borrador.

### Fase 3: Vista Principal (El Tablero de Instrumentos)
Con el `BORRADOR` generado, el consolidador accede a la vista principal, organizada bajo un patrón de navegación inferior (*Bottom Navigation*) y un encabezado inteligente.

* **Encabezado Colapsable (Sticky Header):** Muestra de forma compacta la fecha y el total global. Al deslizar, revela un calendario exclusivamente con los **recordatorios y cumpleaños** del día.
* **Pestaña 1: Comensales (Drill-Down):** La información financiera densa se oculta en un acordeón de tres niveles para no abrumar:
  1. *Nivel 1:* Tiempo de Comida (Ej. Almuerzo: 150 pax).
  2. *Nivel 2:* Alternativa (Ej. Menú Regular: 120 pax | Menú Ligero: 30 pax).
  3. *Nivel 3:* Desglose por Dieta (Ej. Vegetariana: 15, Celíaca: 5).
* **Pestaña 2: Novedades y Handshake:** Muestra las novedades operativas internas aprobadas. Permite añadir "Avisos de Administración" (Novedades originadas desde la cocina hacia la dirección) para dejar constancia de fallos o cambios físicos de última hora.
* **Pestaña 3: Otros (Checklist y Actividades):**
  * Presenta *toggles* (interruptores) para encender/apagar qué entidades aprobadas (Atenciones, Dietas) se imprimirán en el reporte final.
  * **Carriles de Actividades:** Agrupa las actividades pre-calculadas en tres zonas de atención:
    1. *Radar:* Comunicación previa (Con Antelación).
    2. *Cierre Obligatorio:* Comunicación definitiva (Límite de tiempo alcanzado).
    3. *Cancelaciones:* Actividades abortadas que la cocina debe saber para no cocinar en vano.

### Fase 4: Ajustes "En Caliente"
Durante la revisión del tablero, el consolidador puede comunicarse físicamente con la cocina o notar ausencias no registradas.
* **Mecánica (Bottom Sheet):** Un botón flotante abre un panel inferior con un buscador predictivo de residentes.
* **Acción:** El consolidador selecciona al usuario y cambia forzosamente su elección de alternativa o dieta.
* **Sincronización Silenciosa:** Estos cambios actualizan instantáneamente los números de la Vista Principal y se guardan en el servidor (en el documento `BORRADOR`) en segundo plano sin interrumpir la navegación.

### Fase 5: Cierre Atómico y Distribución
Una vez conciliados todos los datos entre la aplicación, el consolidador y la cocina real, se sella el proceso.
* **Fricción Positiva:** El consolidador presiona **"CONSOLIDAR DÍA"**. Un modal exige una confirmación estricta (doble opt-in) advirtiendo que la acción es irreversible.
* **Ejecución:**
  1. El servidor muta el documento a estado **`CONSOLIDADO`**, blindando legal y financieramente los números.
  2. Las actividades marcadas como *Comunicación Definitiva* pasan automáticamente a estado `inscripcion_cerrada`.
* **Procesos en Segundo Plano (Asíncronos):** El usuario no se queda esperando. La UI muestra una confirmación visual exitosa mientras un *Worker* en el servidor genera un PDF formal (A4 con logotipos y desgloses) y lo envía por correo electrónico a la administración. Un indicador en la UI avisa cuando el PDF está listo para su descarga local.