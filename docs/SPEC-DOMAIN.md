# Especificación de Dominio y Reglas de Negocio

**Proyecto:** Comensales Residencia
**Propósito del documento:** Definir los invariantes de negocio y la lógica de resolución de estados para el desarrollo del backend y frontend.
**Objetivo general de la web app:** Gestión de horarios de comida en residencias, centros universitarios y colegios mayores para universitarios.

## 1. Glosario de Entidades Únicas

Para evitar ambigüedad en la generación de interfaces y esquemas de base de datos.

* **Usuario:** Cada persona usando el sistema. Los usuarios tienen uno o varios `RolUsuario` entre los siguientes: `master`, `admin`, `director`, `residente`, `invitado`, `asistente`, `contador`.
* **Residencia (Tenant):** Entidad raíz. La aplicación podría funcionar para varias residencias en el mundo. La `Residencia` define la `ZonaHoraria` con la que trabajarán todas las fechas y horas relacionadas con el manejo de horarios. Define también las reglas de corte (Deadlines).
* **Administración:** Es la empresa que se ocupa profesionalmente de la comida, la limpieza y el cuidado de la ropa de la residencia. No participa en el proceso de selección de horarios de los residentes, solo provee de comida y cuidado de la ropa. Esta aplicación se enfoca en los horarios de comida, no del tema de la ropa. Es un ente separado de la residencia. NO confundir con "usuarios administradores" que no tienen nada que ver con la "Administración" de la residencia.
* **Tiempo de Comida (MealSlot):** No es una hora, es una categoría operativa, la intersección entre día de la semana y comida correspondiente (Ejemplo: "desayuno lunes", "merienda jueves", "brunch domingo", "media mañana martes", etc.). En occidente típicamente habrán tres tiempos de comida por día, para un total de 21 categorías.
* **Alternativas:** La aplicación NO maneja menús, únicamente horarios (no existirá alternativa "carne", "pollo", "pescado", "ensalada", etc.). Son alternativas los distintos horarios posibles que la `Residencia` tiene disponibles para que los residentes e invitados seleccionen. Por ejemplo para el `TiempoComida` almuerzo del viernes puede haber "almuerzo temprano", "almuerzo normal", "almuerzo tarde", "almuerzo para llevar", etc. Siempre existirá la alternativa de no comer.
* **Semanario (Pattern):** Configuración recurrente de 7 días del usuario. Es el "Fallback" por defecto de las `Alternativa`s de comida de cada usuario. Solo los usuarios residentes e invitados pueden tener un Semanario.
* **Excepción (Override):** Cambio puntual de un usuario para un `TiempoComida` específico.
* **Actividad (Institutional Rule):** Evento grupal que obliga a una configuración específica de horarios comida. Podría ser una excursión donde la administración proveerá la comida, o un viaje a otro país donde los asistentes no comerán en la `Residencia` por unos días. La `Actividad` puede ser abierta (cualquiera puede inscribirse) o por invitación.
* **Ausencia:** Cuando un residente programa ausentarse para que no se tome en cuenta en los comensales.
* **Horario de Solicitud de comida:** En las residencias hay una comunicación formal de los horarios de los residentes e invitados hacia la administración que se realiza a hora fija (no bajo demanda). El momento de la solicitud formal se define en `HorarioSolicitudData`. La solicitud formal de los horarios de comida es el trabajo principal de los directores en lo que se refiere a la comida. Típicamente ocurre una vez al día, aunque el sistema tiene la flexibilidad de plantear un esquema diferente de varias veces al día, o de una vez cada varios días.
* **Comensal (The Ticket):** El átomo del hecho Inmutable. Registro generado tras el cierre que representa una ración física y contable. Hay un `ComensalSolicitado` para cada `Usuario` y `TiempoComida`.
* **Solicitud a la administración Consolidada (The Daily Manifest):** El hecho inmutable completo:  `SolicitudConsolidada`. En cada momento definido por `HorarioSolicitudData` el `Usuario` `director` debe producir esta solicitud formal a la administración. Es un consolidado de todos los `ComensalSolicitado` como resultado de la intención manifestada por los residentes e invitados. Incluye también la solicitud de las "atenciones", la comunicación (y oficialización) de alteraciones de horario, dietas. Aquí también se pueden incluir las novedades operativas a criterio del director. Si son incluidos, se liberan (aknowledgement), en caso que no se incluyan el director puede diferirlos o ignorarlos a su criterio.
* **Grupo de usuarios:** Los usuarios pueden ser agrupados para efectos contables (asignación de un centro de costos por defecto) en un `GrupoUsuariosData`, para que tengan restricciones de comida (por ejemplo que no tengan derecho a elegir alteraciones de comida los domingos), o para que tengan que confirmar sus comidas diariamente. Cada grupo de usuarios tiene una configuración particular según el propósito para el que se crea.
* **Comedor:** Es el lugar físico donde se sirven las comidas que no son para llevar. La aplicación advierte cuando se supone que se deben servir varias comidas en el mismo horario, en el mismo `Comedor`. El `Comedor` también define el aforo máximo de `ComensalSolicitado`.
* **Dieta:** Aunque la aplicación no maneja menús, lleva la contabilidad de las personas que tienen un régimen especial, normalmente por motivos de salud (alergias, enfermedad, etc.). Cada `residente` tiene una `Dieta`. Para la aplicación la descripción de la `Dieta` (no come mariscos, celíaco, dieta de reducción de peso, etc.) es una mera etiqueta. Lo relevante es que cada `ComensalSolicitado` se puede clasificar por `Dieta`.
* **Alteración de Horario:** Los `Usuario`s con `RolUsuario` de `director` pueden alterar los horarios disponibles para elegir (estructura tiempos de comida y alternativas) de forma temporal.
* **Novedad Operativa:** Son notas que los usuarios ingresan en el sistema para que el director las observe cuando haga la solicitud formal de las comidas. Para el `director` es una bandeja de tareas con distintos estados (`pendiente`, `atendido`, `diferido`, `archivado`). Se vuelven inmutables al solicitarlas a la administracíon (ser incluidas en una "solicitud consolidada").
* **Falta:** Es una bitácora de comportamientos en contra del reglamento de la `Residencia` en lo que se refiere a la comida.
* **Recordatorio:** Aparecen para que el director tome en cuenta ciertos eventos o situaciones al moento de hacer la solicitud formal de horarios de comida (comensales). Incluye cumpleaños, evnetos académicos, tiempos de exámenes o vacaciones, etc.
* **Atención:** Es una solicitud puntual a la administración que no es un plato de comida. Puede ser un aperitivo para un grupo de invitados especiales, flores para una actividad académica en la residencia, etc.
* **Centro de costo:** Aunque la aplicación no maneja datos financieros o contables, sí mantiene una base de datos de platos servidos para que sirva de insumo al personal de contabilidad tanto de la `Residencia` como de la administración. La contabilización de platos de comida puede hacerse por centro de costo, que es una entidad configurable (por usuario, grupo de usuarios, por comedor, por actividad, o por comensal solicitado)

## 2. El Algoritmo de Cascada (The Truth Cascade)

### 2.1 Filtros de Disponibilidad (The Meal Schedule Filter)

Antes de que el usuario pueda expresar su intención, las `Alternativa`s disponibles para elegir se filtran por:
1. **Restricción de Grupo:** Si el `GrupoUsuario` al que pertenece el `Usuario` tiene restringida una `Alternativa`, esta no debe aparecer seleccionable ni en su `SemanarioUsuario` ni en `Excepcion`.
2. **Alteración Global:** Si existe una `AlteracionHorario` (ej. "Día de Limpieza General - Todos comen para llevar"), esta reemplaza las opciones estándar para todos.
3. **Requiere Aprobación:** Si `Alternativa.requiereAprobacion=true`, esa `Alternativa` no está disponible en el `SemanarioUsuario` el usuario puede pedirla solo como `Excepcion`, pero quedará `ExcepcionUsuario.autorizacion.estadoAprobacion='pendiente_aprobacion'` hasta que el `director` tome una decisión. En caso de aprobar, se establece `ExcepcionUsuario.autorizacion.estadoAprobacion='aprobado'` y la `Excepcion` se vuelve vigente; si lo rechaza el usuario de antemano había elegido `alternativaRespaldoId` como opción en caso de ser rechazado.

Cualquier función de "Cálculo de Comida del Día" (reflejado en un cojunto de `ComensalSolicitado`) debe seguir estrictamente este orden de evaluación (de arriba hacia abajo):

1. **Nivel 1: ACTIVIDAD:** Si el `Usuario` está en una `Actividad` (o sea tiene una `InscripcionActividad`), el resultado es lo que defina la Actividad. Bloquea todo lo demás.
2. **Nivel 2: AUSENCIA:** Si existe un registro de `Ausencia` para la fecha, el resultado es NULL (No come), a menos que haya una `Actividad`.
3. **Nivel 3: EXCEPCIÓN:** Si el usuario creó manualmente un cambio para hoy, se aplica sobre el `ComensalSolicitado`.
4. **Nivel 4: SEMANARIO:** Si no hay nada anterior, se proyecta lo definido en su patrón de 7 días.

Al elegir una alternativa en el semanario, en caso que la alternativa no aplique para la semana en curso se le da una advertencia al usuario. 

Nota para la IA: No asuma que el usuario "elige" cada día. El sistema "proyecta" el Semanario y el usuario solo interviene para cambiar la norma.

## 3. Ciclo de Vida del Comensal (State Machine)

*Un comensal no se "crea" cuando el usuario tiene hambre; se materializa mediante un Snapshot.*

* Estado: INTENCIÓN (Live/Draft):
    + Los `Usuario`s con `RolUsuario` de `residente`, o `invitado` (o `asistente` de un `residente` o de un `invitado`) ingresan sus necesidades y preferencias de horario como una `Excepcion` o en su respectivo `SemanarioUsuario`, según las alternativas disponibles (y sus alteraciones) tomando en cuenta las restricciones de permisos (según los `GrupoUsuariosData`)-
    + Los usuarios pueden inscribirse a actividades.
    + En la capa de "intención" se advierte al usuario sobre los conflictos (cuando intenta programar una ausencia durante una actividad en donde ya está inscrito, etc.)
    + El sistema no permite cambiar preferencias de horarios ya solicitados a la administración. Es decir la UI no permite seleccionar una `Alternativa` que por la fecha ya no puede ser solicitada por el `director` a la administración.
* Estado: SOLICITADO (Committed/Snapshot):
    + Se crea cuando el Director ejecuta "Solicitar a la Administración". En ese momento el Director inicia una Solicitud de Cierre (Job Request). El sistema encola el proceso y libera la UI. Un trabajador en segundo plano (Cloud Function/Task) procesa la resolución de los residentes, genera las escrituras en lote y notifica la finalización mediante una actualización de estado en el documento de solicitud.
    + El Backend resuelve la Cascada y escribe el documento Comensal. 
    + Invariante: Una vez creado, los cambios en el Semanario del usuario NO afectan este registro.
    + La determinación del estado final de un comensal es determinista. Dados los mismos inputs (Semanario, Excepciones, Actividades), el output debe ser idéntico en cualquier entorno de ejecución.

## 4. Reglas de Negocio

### 4.1 Restricciones Críticas "Fail-Close" (Restricciones Críticas)

* **El Reloj Manda:** Todas las validaciones de fecha/hora deben usar `Residencia.ubicacion.zonaHoraria`. Ignorar el `LocalTime` del dispositivo.
* **Bloqueo de Edición (The Cut-off):** Pasada la hora de solicitud (`HorarioSolicitudData`), el usuario no tiene posibilidad de crear una `Excepcion` o una `Ausencia` para ese periodo. Siempre puede editar su `SemanarioUsuario` porque es cíclico.
* **Exclusión Mutua:** No puede existir una Ausencia y una Inscripción en Actividad simultáneamente. La Actividad tiene prioridad en la resolución, pero el sistema debe evitar el traslape en la creación.
* **Consistencia de Costos:** Puede haber un `CentroDeCostoId` por cada `Usuario`, uno por cada `GrupoUsuariosData`, uno por cada `Comedor`, uno por cada `Actividad`. El `Usuario` con `RolUsuario` igual a `contador` es el que configura la parte contable y establece el "algoritmo de cascada" para la asignación automática de centros de costo que se reflejan en cada `ComensalSolicitado`. También puede cambiarlos manualmente.
* **Coherencia y continuidad de Solicitudes a la Administración:** Por consistencia de la información y de varios procesos internos, las solicitudes a la administración deben sucederse consecutivamente. Es decir si en una `Residencia` se hace una petición al día y esa petición se hizo el lunes pero no el martes, el miércoles el `director` deberá generar las dos solicitudes (martes y miércoles) para poder avanzar y que todo tenga consistencia.

### 4.2 Política de Disponibilidad (The Entropy Rule)

La disponibilidad de una `Alternativa` no depende de su hora de servicio, sino exclusivamente de su entidad padre: el `HorarioSolicitudData`.

**A. Invariante de Entropía**
Se asume como verdad absoluta del sistema que la fecha-hora que corresponde a `HorarioSolicitudData` es siempre MENOR que la fecha hora que corresponde al inicio de la `Alternativa` de comida hija (dicho de otro modo, no se pide a la administración comidas en el pasado). Por tanto, la validación de una `Alternativa` solo necesita consultar el horario de solicitud de su entidad padre.

**B. Función de Disponibilidad (IsAvailable?)**
Para determinar si una alternativa es seleccionable en una fecha específica (Contexto: Excepción o Visualización):
1. *Identificar objeto `HorarioSolicitudData`:* Se recupera el HorarioSolicitud asociado a la alternativa en la fecha de referencia.
2. *Extraer fecha-hora de solicitud del objeto:* Se proyecta la fecha-hora de solicitud que debe ser igual o menor a la fecha de referencia.
3. Comparación simple:
    * SI Ahora < fecha-hora de solicitud: DISPONIBLE.
    * SI Ahora >= fecha-hora de solicitud: BLOQUEADO.

### 4.3 Latencia del Semanario (Deferred Effect Warning)

El Semanario es cíclico y siempre editable, pero sus efectos sobre la realidad dependen del momento en que se edita.

**A. El Problema de la Semana en Curso**
Cuando un usuario modifica su Semanario para un día (ej. Lunes) mientras cursa la semana actual:
1. El sistema calcula la fecha del "Lunes de esta semana".
2. El sistema verifica la disponibilidad según la regla 4.2 para esa fecha concreta.

**B. Resultado de la Interacción**
* Caso A (A tiempo): Si el cierre para el "Lunes de esta semana" NO ha pasado:
    + El cambio se guarda y actualiza la proyección actual.
    + Feedback: "Guardado exitosamente."
* Caso B (Tarde / Latencia): Si el cierre para el "Lunes de esta semana" YA pasó:
    + El cambio se guarda en el patrón recurrente (afectará a la próxima semana y sucesivas).
    + NO actualiza la proyección de esta semana (el Snapshot o bloqueo ya ocurrió).
    + Feedback (Advertencia): "Tu cambio se ha guardado para semanas futuras, pero ya no aplica para el servicio de esta semana porque el horario de solicitud ha cerrado."

### 4.4. Política de Aforo y Sobrecupo (Soft Constraints)

* El Aforo definido en un `Comedor` es indicativo, no obstativo.
* **Validación:** El sistema NO bloquea a un residente de elegir una alternativa llena (la intención se respeta).
* **Resolución:** Al momento del Cierre (Snapshot), el sistema presenta una *Alerta de Sobrecupo* al Director.
* **Autoridad:** El Director tiene la potestad final de:
    + Aceptar el sobrecupo (enviando más gente de la que cabe).
    + Reasignar manualmente a los usuarios a otra alternativa (Override) antes de sellar la  `SolicitudConsolidada`.

## 5. Roles y Permisos Operativos

* **Master:** Crea residencias y sus usuarios administradores. Tiene acceso a toda la base de datos, pero no pertenece a ninguna `Residencia` en particular.  
* **Residente:** Gestiona su propia "intención" (`SemanarioUsuario`, `Excepcion`, `Ausencia`) dentro del plazo correcto, se inscribe (o acepta invitaciones) en una `Actividad` disponible, puede invitar a otros a inscribirse en una `Actividad`. Puede crear una `Novedad Operativa` para que el director lo tome en cuenta al solicitar los comensales. Otro usuario `asistente` puede ingresar los horarios de un `residente`.
* **Director:** Ejecuta el Snapshot (Cierre) y autorizar eventualidades fuera de plazo. Puede delegar cualquiera de sus funciones en un `asistente`. 
* **Asistente:** Hace las veces de un residente (por ejemplo si es una persona mayor, un residente enfermo, o tiene alguna discapacidad física o mental), o también las veces de un director. El `asistente` no tiene permisos predeterminados. Son siempre asignados de forma específica por tiempo específico.
* **Invitado:** Participa de las comidas o actividades pero no vive en la residencia. Puede tener su propio usuario, ser completamente manejado por un asistente. A veces los invitados son tomados en cuenta en los comensales solicitados sin tener un usuario o asistente. Por ejemplo el campo `Actividad.comensalesNoUsuarios` permite al organizador de la actividad tomar en cuenta invitados sin tener que crear accesos o asignar asistentes.
* **Contador:** Solo tiene acceso a la configuración de contabilidad, la gestión de cada `CentroDeCosto` y los reportes contables.
